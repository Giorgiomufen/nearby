# NearBy — AI-Powered People Discovery at Events

**INIT 2026 Hackathon** | March 7, 2026

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

### User Flow (refined)

- User signs in
- Gives explicit permission
- Connects selected sources or confirms found data
- AI builds a short event profile (including images)
- Profile is visible only at that event
- User can edit/hide/delete it anytime

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python FastAPI (single file) |
| Frontend | Plain HTML/CSS/JS (no framework) |
| Database | SQLite |
| AI | Perplexity API (sonar-pro) |
| Map | Leaflet.js + Esri satellite tiles |
| QR | python-qrcode |
| Location | Browser Geolocation API |
| Hosting | Railway |

## Architecture

```
Browser (GPS + UI)
    ↕ fetch()
FastAPI (app.py)
    ├── POST /api/join        → Perplexity search → store profile + QR
    ├── GET  /api/profile/:id → return profile
    ├── POST /api/nearby      → haversine filter → nearby people
    ├── POST /api/search      → keyword match across all profiles
    └── POST /api/update-location → live GPS sync
    ↕
SQLite (nearby.db)
```

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

## Status

- [x] Backend with all endpoints + async Perplexity calls
- [x] Satellite map with live GPS markers
- [x] People list (Google Maps style)
- [x] Search across all profiles
- [x] QR code generation per person
- [x] SpaceX-inspired dark UI
- [x] Deployed on Railway with HTTPS
- [ ] Perplexity API key (needed for real profiles)

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
cp .env.example .env        # add PERPLEXITY_API_KEY
uvicorn app:app --port 8000
```

## Deploy env vars

```
BASE_URL=https://nearby-production-e96d.up.railway.app
PERPLEXITY_API_KEY=pplx-...
```
