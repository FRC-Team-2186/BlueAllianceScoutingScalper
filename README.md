# Blue Alliance Scouting Scalper

100% free-to-run FRC scouting application built with Next.js, The Blue Alliance API, Statbotics, and Google Gemini (free tier).

## Features

- Next.js App Router + Tailwind CSS + shadcn/ui + TanStack Query
- Typed TBA API v3 and Statbotics v3 clients with server-side proxy routes
- YouTube video ID extraction from TBA match data (no YouTube Data API)
- **Gemini vision analysis** with yt-dlp + ffmpeg frame sampling (~15 frames/match)
- **10 RPM rate limiter** for Gemini free tier + mock fallback on errors
- Local JSON cache under `data/cache/analysis/{eventKey}/{matchKey}.json`
- YouTube player with AI timestamp markers
- Multi-team comparison matrix with CSV/JSON export

## Quick Start

```bash
cp .env.local.example .env.local
# Add your free TBA and Gemini keys to .env.local

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TBA_API_KEY` | For live TBA data | Free read key from [The Blue Alliance](https://www.thebluealliance.com/account) |
| `GEMINI_API_KEY` | For video analysis | Free key from [Google AI Studio](https://aistudio.google.com/apikey) |
| `NEXT_PUBLIC_DEFAULT_YEAR` | No | Default season (2026) |
| `NEXT_PUBLIC_DEFAULT_EVENT` | No | Default event key (`2026cmp`) |
| `NEXT_PUBLIC_DEFAULT_TEAM` | No | Default team number (`2186`) |

## API Routes

| Route | Purpose |
|-------|---------|
| `GET /api/config` | Runtime config + mock mode status |
| `GET /api/tba/{...path}` | TBA API proxy |
| `GET /api/statbotics/{...path}` | Statbotics API proxy |
| `GET /api/cache/analysis/{eventKey}?include=summary` | Aggregated AI metrics per team |
| `GET /api/cache/analysis/{eventKey}/{matchKey}` | Read cached analysis |
| `GET /api/analyze/video?matchKey=` | Poll async analysis job status |
| `POST /api/analyze/video` | Analyze match video (async by default) |
| `PUT /api/cache/analysis/{eventKey}/{matchKey}` | Write cached analysis |

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Team scouting dashboard |
| `/matches/{matchKey}` | Video player + AI markers + verification matrix |
| `/compare` | Multi-team comparison matrix |

## System Dependencies

- `ffmpeg` — frame extraction
- `yt-dlp` — stream YouTube video without YouTube Data API

## License

MIT
