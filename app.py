import os
import json
import uuid
import math
import sqlite3
import base64
import asyncio
import requests
from io import BytesIO
from datetime import datetime
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import qrcode
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="NearBy")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "nearby.db"
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY", "")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")


# ── Database ──────────────────────────────────────────────────────────────────

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                bio TEXT DEFAULT '',
                profile_json TEXT DEFAULT '{}',
                latitude REAL,
                longitude REAL,
                qr_code TEXT,
                created_at TEXT
            )
        """)

init_db()


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ── Perplexity AI Search ─────────────────────────────────────────────────────

def search_person(name: str, email: str, bio: str = "") -> dict:
    if not PERPLEXITY_API_KEY:
        return {
            "summary": f"Demo profile for {name}. Set PERPLEXITY_API_KEY for real AI search.",
            "career": "Not available in demo mode",
            "education": "Not available in demo mode",
            "achievements": [],
            "current_role": "Demo User",
            "interests": ["technology"],
            "goals": ["networking"],
            "social_links": [],
            "tags": ["demo"],
        }

    prompt = f"""Search the internet thoroughly for this person:
Name: {name}
Email: {email}
{f'Context: {bio}' if bio else ''}

Search LinkedIn, personal websites, GitHub, publications, news, university pages, social media, and all public sources.

Return ONLY a valid JSON object with these fields:
{{
    "summary": "2-3 sentence professional summary",
    "career": "career history and background",
    "education": "educational background",
    "achievements": ["notable achievements"],
    "current_role": "current title and org",
    "interests": ["professional interests"],
    "goals": ["professional goals"],
    "social_links": ["URLs to profiles found"],
    "tags": ["searchable keywords: skills, fields, roles, industries"]
}}"""

    try:
        resp = requests.post(
            "https://api.perplexity.ai/chat/completions",
            headers={
                "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "sonar-pro",
                "messages": [
                    {"role": "system", "content": "You are a research assistant. Return only valid JSON, no markdown fences."},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        return json.loads(content.strip())
    except Exception as e:
        return {
            "summary": f"Could not retrieve info for {name}: {e}",
            "career": "Unknown", "education": "Unknown",
            "achievements": [], "current_role": "Unknown",
            "interests": [], "goals": [],
            "social_links": [], "tags": [],
        }


# ── QR Code ───────────────────────────────────────────────────────────────────

def make_qr(user_id: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(f"{BASE_URL}/profile/{user_id}")
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ── Haversine ─────────────────────────────────────────────────────────────────

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


# ── Models ────────────────────────────────────────────────────────────────────

class JoinRequest(BaseModel):
    name: str
    email: str
    bio: str = ""
    latitude: float | None = None
    longitude: float | None = None

class NearbyRequest(BaseModel):
    latitude: float
    longitude: float
    radius_km: float = 2.0

class SearchRequest(BaseModel):
    query: str

class LocationUpdate(BaseModel):
    user_id: str
    latitude: float
    longitude: float


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/join")
async def join(req: JoinRequest):
    # Check for duplicate email — update existing user instead
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email=?", (req.email,)).fetchone()

    if existing:
        user_id = existing["id"]
        profile = await asyncio.to_thread(search_person, req.name, req.email, req.bio)
        qr = make_qr(user_id)
        with get_db() as conn:
            conn.execute(
                "UPDATE users SET name=?, bio=?, profile_json=?, latitude=?, longitude=?, qr_code=?, created_at=? WHERE id=?",
                (req.name, req.bio, json.dumps(profile), req.latitude, req.longitude, qr, datetime.now().isoformat(), user_id),
            )
            conn.commit()
        return {"id": user_id, "name": req.name, "profile": profile, "qr_code": qr}

    user_id = uuid.uuid4().hex[:8]
    profile = await asyncio.to_thread(search_person, req.name, req.email, req.bio)
    qr = make_qr(user_id)

    with get_db() as conn:
        conn.execute(
            "INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)",
            (user_id, req.name, req.email, req.bio, json.dumps(profile),
             req.latitude, req.longitude, qr, datetime.now().isoformat()),
        )
        conn.commit()

    return {"id": user_id, "name": req.name, "profile": profile, "qr_code": qr}


@app.get("/api/profile/{user_id}")
async def get_profile(user_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return {
        "id": row["id"], "name": row["name"],
        "profile": json.loads(row["profile_json"]), "qr_code": row["qr_code"],
    }


@app.post("/api/nearby")
async def nearby(req: NearbyRequest):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM users WHERE latitude IS NOT NULL").fetchall()
    people = []
    for r in rows:
        d = haversine(req.latitude, req.longitude, r["latitude"], r["longitude"])
        if d <= req.radius_km:
            people.append({
                "id": r["id"], "name": r["name"],
                "profile": json.loads(r["profile_json"]),
                "distance_km": round(d, 3),
                "latitude": r["latitude"], "longitude": r["longitude"],
            })
    people.sort(key=lambda x: x["distance_km"])
    return {"people": people}


@app.post("/api/search")
async def search(req: SearchRequest):
    q = req.query.lower()
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM users").fetchall()
    results = []
    for r in rows:
        blob = (json.dumps(json.loads(r["profile_json"])) + " " + r["name"] + " " + (r["bio"] or "")).lower()
        if q in blob:
            results.append({
                "id": r["id"], "name": r["name"],
                "profile": json.loads(r["profile_json"]),
                "latitude": r["latitude"], "longitude": r["longitude"],
            })
    return {"people": results}


@app.post("/api/update-location")
async def update_location(req: LocationUpdate):
    with get_db() as conn:
        conn.execute("UPDATE users SET latitude=?, longitude=? WHERE id=?",
                     (req.latitude, req.longitude, req.user_id))
        conn.commit()
    return {"ok": True}


# ── Static files ──────────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")

@app.get("/profile/{user_id}")
async def profile_page(user_id: str):
    return FileResponse("static/index.html")
