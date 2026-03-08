# NearBy — AI-Powered People Discovery at Events

**INIT 2026 Hackathon** | March 7-8, 2026

> "Google for people at events — find anyone nearby by what they do, not who you know."

## Live

- **App**: https://nearby-production-e96d.up.railway.app
- **Repo**: https://github.com/Giorgiomufen/nearby

## The Problem

At events you're surrounded by interesting people but have no way to discover who's around you. Traditional networking is random. LinkedIn requires you to already know someone. Event apps require manual profile creation that nobody fills out.

## The Idea

An app that uses AI web-scraping to automatically build rich professional profiles of event attendees — no profile creation needed.

1. Person joins with name + email (+ optional bio)
2. Accepts terms consenting to a public internet search
3. AI scrapes and synthesizes everything publicly available: career, achievements, education, interests, goals
4. Everyone appears on a live satellite map
5. Search by keywords: "astronaut", "ML researcher", "Tartu University"
6. Scan someone's QR code to see their full AI profile

### User Flow

- User signs in with name + email
- Gives explicit permission (accepts terms)
- AI searches the web and builds a professional profile
- Profile appears on the satellite map with live GPS
- User can be found via keyword search or QR code scan

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python FastAPI (single file `app.py`) |
| Frontend | Plain HTML/CSS/JS (no framework) |
| Database | SQLite |
| AI Search | DuckDuckGo (free, no API key) |
| AI Synthesis | Groq API — Llama 3.3 70B (free tier, no credit card) |
| Map | Leaflet.js + Esri satellite tiles (bundled locally) |
| QR | python-qrcode (base64 PNG) |
| Location | Browser Geolocation API (`watchPosition`) |
| Hosting | Railway (HTTPS) |

### AI Pipeline

The AI profiling works in two stages:
1. **DuckDuckGo Search** — queries the person's name + email domain across multiple search queries to find LinkedIn, GitHub, portfolios, publications, etc.
2. **Groq LLM (Llama 3.3 70B)** — takes all search snippets and synthesizes them into a structured JSON profile with summary, career, education, achievements, interests, goals, social links, and searchable tags.

Fallback: if Perplexity API key is set, uses Perplexity sonar-pro instead of Groq. If neither key is set, returns a demo profile.

## Architecture

```
Browser (GPS + UI)
    ↕ fetch()
FastAPI (app.py)
    ├── POST /api/join        → DDG search + Groq LLM → store profile + QR
    ├── GET  /api/profile/:id → return profile
    ├── POST /api/nearby      → haversine filter → nearby people
    ├── POST /api/search      → keyword match across all profiles
    └── POST /api/update-location → live GPS sync
    ↕
SQLite (nearby.db)
```

## What Was Built & Deployed

- [x] FastAPI backend with all 5 endpoints + async AI calls
- [x] DuckDuckGo + Groq AI pipeline (free, no credit card)
- [x] Perplexity API support (optional, paid)
- [x] Satellite map with live GPS markers (Leaflet + Esri)
- [x] People list panel (Google Maps style sidebar)
- [x] Keyword search across all AI-generated profiles
- [x] QR code generation per person (links to profile URL)
- [x] SpaceX-inspired dark UI (pure black, white text, uppercase labels)
- [x] Duplicate email handling (upsert instead of error)
- [x] XSS escaping on all AI-generated text
- [x] Loading overlay with animated research steps
- [x] Mobile-responsive layout
- [x] Deployed on Railway with HTTPS
- [x] GitHub repo with CI/CD via Railway

## Legal / Privacy

- Only PUBLIC information is scraped
- User must explicitly accept terms before search runs
- Equivalent of someone Googling you — just automated
- GDPR: consent-based, right to deletion
- Event-scoped data, not stored permanently
- User can delete their profile anytime

## Competitive Edge

- **Zero friction** — no profile to fill out, AI does the work
- **Real data** — scraped from actual internet presence, not self-reported
- **Event-focused** — designed for in-person discovery, not another social network
- **Privacy-first** — consent-based, event-scoped, deletable

## Future Vision

1. **Smart matching** — AI "you should meet" recommendations
2. **Event dashboard** — analytics for organizers
3. **AR discovery** — point camera at crowd, see floating profiles
4. **NFC/Bluetooth** — bump phones to exchange profiles
5. **Platform** — white-label for any event, Eventbrite integration
6. **Monetization** — free for small events, paid tiers for organizers

## Setup (local dev)

```bash
pip install -r requirements.txt
cp .env.example .env        # add GROQ_API_KEY
uvicorn app:app --port 8000
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes (for AI) | Free from [console.groq.com](https://console.groq.com) |
| `BASE_URL` | For deploy | Full URL for QR code links |
| `PERPLEXITY_API_KEY` | Optional | Paid alternative to Groq |

## File Structure

```
INIT 2026/
├── app.py              # Backend (FastAPI, all endpoints, AI pipeline)
├── requirements.txt    # Python dependencies
├── Procfile            # Railway deployment command
├── runtime.txt         # Python 3.12
├── .env.example        # Environment variable template
├── .gitignore          # Excludes .env, *.db, __pycache__
├── project-info.md     # This file
└── static/
    ├── index.html      # Single-page app
    ├── style.css       # SpaceX-inspired dark theme
    ├── app.js          # Frontend logic (map, modals, search, GPS)
    ├── leaflet.js      # Leaflet.js (bundled, no CDN)
    ├── leaflet.css     # Leaflet styles (bundled)
    └── images/         # Leaflet marker icons
```
