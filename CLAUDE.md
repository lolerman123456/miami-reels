# Miami Reels — operating guide for Claude

This repo makes and posts **two** satirical South Florida Instagram Reels per day to **@getnearapp**, at ~1pm and ~8pm New York time
(the owner's ChatGPT setup separately posts carousels at 9am and 5pm — keep Reels away from those times).
Everything runs in GitHub Actions (`.github/workflows/reel.yml`) — the owner controls it by chatting with
Claude from their phone. Your job in a chat is to turn their request into a commit on `main`.

## How to do what the owner asks

| Request | What to do |
|---|---|
| "Post one now" / "post about X now" | Write `requests/run.json` → `{"topic": "X or empty", "publish": true, "at": "<ISO timestamp>"}` and commit + push to `main`. The push starts a run (~50 min until it is live). Always change `at` so the file actually changes. |
| "Make one but don't post it" | Same, with `"publish": false`. The video is attached to the Actions run as an artifact. |
| "Post this exact script" | Write `episodes/<NNN>-<slug>/episode.json` (copy the shape of `episodes/001-rudest-cities/episode.json`), then `requests/run.json` → `{"episode": "episodes/<NNN>-<slug>", "publish": true, "at": "..."}`. Commit both, push. |
| "Change the post times" / "add a third post" | In `.github/workflows/reel.yml`: set `START_HOURS` to the New York hours runs should start (post hour − 1; a run takes ~50 min), and make the `cron` lines fire at minute 5 of each of those hours +4 and +5 in UTC (covers EDT and EST; the gate job drops the wrong one). Commit + push. |
| "Pause" / "resume" | `control.json` → `"paused": true/false`. Commit + push. |
| "Skip tomorrow" / a date | Add `"YYYY-MM-DD"` (New York date) to `control.json` → `skipDates` (skips both posts that day). Commit + push. |
| "What did we post?" | Read `posted.log` (timestamp, file, Instagram link) and `episodes/*/episode.json`. |
| "Change the style / voice / tone" | Style prompt: `pipeline/generate.mjs` (PROMPT). Graphics: `src/Reel.tsx`. Voice: repo variable `KOKORO_VOICE` (am_adam default). |

Scheduled runs respect `control.json`; runs started by `requests/run.json` or the Run-workflow button always go.

## Content rules (keep the account safe)
Savage satire of places, traffic, prices, HOAs, tourists, clubs, weather — never ethnic groups, nationalities,
religions, races, or real private people. No slurs/explicit content. Hook in the first 3 seconds.

## Episode JSON essentials
Scenes: `hook` (overlay = 2 short lines, 4 emojis, shot `dive`), 5× `item` (rank 5→1, text starts "Number five," …
"And number one..."), `outro` (CTA, shot `pullout`). `text` = spoken (write numbers as words), `caption` = on-screen
version. Locations must be real South Florida lat/lon. Camera `range`: 500–900 m low-rise, **1400–1800 m for
skylines** (Brickell/Downtown/Sunny Isles) or the camera ends up inside buildings. ~75–95 words total ≈ 30–35 s.

## Secrets (repo settings, never commit them)
`OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`.
The Instagram token is refreshed each run; if posting fails with an auth error, the owner must paste a new token
into the `INSTAGRAM_ACCESS_TOKEN` secret.
