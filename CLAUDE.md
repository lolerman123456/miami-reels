# Miami Reels — operating guide for Claude

This repo runs **@getnearapp** end to end (the owner handed Claude the account; ChatGPT no longer posts). Daily, New York time:
2 informational map Reels (~1pm, ~8pm) + 3 carousels — `brief` 9am (South Florida news), `feature` 5pm (rotating informational
posts: did you know / rent check / history / new builds / by the numbers / follow-up / week recap — FEATURES in `pipeline/carousel.mjs`), `world` 10pm (US + world). Every post is cross-posted to stories.
Goal: grow the account. Raise volume slowly as it grows (add carousel slots in `control.json` → `carousels`); the owner audits
and archives anything bad.
Everything runs in GitHub Actions (`.github/workflows/reel.yml`) — the owner controls it by chatting with
Claude from their phone. Your job in a chat is to turn their request into a commit on `main`.

## How to do what the owner asks

| Request | What to do |
|---|---|
| "Post one now" / "post about X now" | Write `requests/run.json` → `{"topic": "X or empty", "publish": true, "at": "<ISO timestamp>"}` and commit + push to `main`. The push starts a run (~50 min until it is live). Always change `at` so the file actually changes. |
| "Make one but don't post it" | Same, with `"publish": false`. The video is attached to the Actions run as an artifact. |
| "Post this exact script" | Write `episodes/<NNN>-<slug>/episode.json` (copy the shape of `episodes/001-rudest-cities/episode.json`), then `requests/run.json` → `{"episode": "episodes/<NNN>-<slug>", "publish": true, "at": "..."}`. Commit both, push. |
| "Post that preview" (already rendered) | `requests/run.json` → `{"postVideo": "episodes/<NNN>-<slug>", "at": "..."}`. Posts the video already in the `videos` release — no re-render, live in ~5–10 min. |
| "Post a carousel now" | `requests/post.json` → `{"kind": "brief|world|feature", "topic": "optional angle", "publish": true, "at": "..."}`. Live in ~8 min (`.github/workflows/posts.yml`). |
| "Change carousel times" / "add a carousel" | `control.json` → `carousels` = `{"kind": hour}`. |
| "Change the post times" / "add a third post" | `control.json` → `postHours` = New York post hours, 24h (e.g. `[13, 20]`). A check every 30 min in `reel.yml` starts a run ~1 hour before each (up to 4 retries; `state/slots.txt` prevents double posts). Commit + push. |
| "Pause" / "resume" | `control.json` → `"paused": true/false`. Commit + push. |
| "Skip tomorrow" / a date | Add `"YYYY-MM-DD"` (New York date) to `control.json` → `skipDates` (skips both posts that day). Commit + push. |
| "What did we post?" | Read `posted.log` (timestamp, file, Instagram link) and `episodes/*/episode.json`. |
| "Change the style / voice / tone" | Style prompt: `pipeline/generate.mjs` (PROMPT). Graphics: `src/Reel.tsx`. Voice: repo variable `KOKORO_VOICE` (am_adam default). |

Scheduled runs respect `control.json`; runs started by `requests/run.json` or the Run-workflow button always go.

The owner can also do all of this without Claude: GitHub app → Actions → **Control** → Run workflow (`.github/workflows/control.yml`).

## Checking on runs & sharing videos (works without gh / without login — the repo is public)
- Every rendered video is uploaded as `https://github.com/lolerman123456/miami-reels/releases/download/videos/<episode-id>.mp4`
  (phone-friendly, no login). Send the owner that link when a video is ready, especially for previews (`"publish": false`).
- Run status: `curl -s "https://api.github.com/repos/lolerman123456/miami-reels/actions/runs?per_page=5"` (fields: name, event,
  status, conclusion, created_at, html_url). A Reel run takes ~60–100 min depending on video length.
- What got posted: `posted.log` (pull first — the bot commits it after each run).
- A voice other than Adam: add `"voice": {"provider": "openai", "voice": "ash"}` to that episode.json (optional `"speed": 1.15`).

## Content rules (keep the account safe)
No jokes (owner's call — they read as AI): everything is informational, from real sources (news, Wikipedia, Zillow), fact-checked.
Never target ethnic groups, nationalities, religions, races, or real private people. No slurs/explicit content. Hook in the first 3 seconds. Max 4 hashtags per post. Single-topic carousels: one sector label (ECONOMY…), headlines chain with transitions (THAT'S… / THAT ALSO MEANS… / WHICH PUTS…).

## Episode JSON essentials
Map Reels are **informational explainers, no jokes and no rankings** (owner's call): NEW BUILD / HISTORY / DID YOU KNOW /
RENT CHECK / BY THE NUMBERS. `pipeline/generate.mjs` plans a topic, pulls real sources (news, Wikipedia via `pipeline/facts.mjs`,
Zillow rent data), writes only from those sources, then a fact-check pass fixes anything unsupported.
Scenes: `hook` (overlay = 2 short lines, 4 emojis, shot `dive`), 3–5× `item` (no rank; `badge` = key stat like "1,049 FT" or
"$3,831/MO", `overlay` = place, `sub` = context), `outro` (question, shot `pullout`). `text` = spoken (numbers as words),
`caption` = on-screen version. Locations: use Wikipedia coordinates when available. Camera `range`: 500–900 m low-rise,
**1400–1800 m for skylines** or the camera ends up inside buildings. 140–190 words ≈ 55–70 s.

## Secrets (repo settings, never commit them)
`OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`.
The Instagram token is refreshed each run; if posting fails with an auth error, the owner must paste a new token
into the `INSTAGRAM_ACCESS_TOKEN` secret.
