# Miami Reels

Daily satirical South Florida Reels: 3D Google footage + Adam narration + animated captions → Instagram.

**Runs in the cloud** (GitHub Actions, `.github/workflows/reel.yml`) daily at 4:30pm New York → posted ~5:25pm.
Control it from your phone by chatting with Claude on this repo — see `CLAUDE.md`. The Mac is not needed.

## Pipeline
1. `pipeline/generate.mjs` – GPT writes the concept, script, labels and camera shots → `episodes/<id>/episode.json`
2. `pipeline/voice.mjs` – Kokoro TTS (`am_adam`) → `narration.wav`
3. `pipeline/captions.mjs` – Whisper word timings → `captions.json`
4. `pipeline/capture.mjs` + `capture/render.html` – Cesium + Google Photorealistic 3D Tiles, rendered frame-by-frame → `shots/*.mp4`
5. `src/Reel.tsx` – Remotion: hook, #rank pop-ups, emojis, captions, SFX, Google attribution → `out/<id>.mp4`
6. `pipeline/publish.mjs` – Instagram Graph API (Reels, resumable upload)

## Commands
```
node pipeline/make.mjs episodes/001-rudest-cities          # build one video (cached per step)
node pipeline/publish.mjs out/001-rudest-cities.mp4        # post it
node pipeline/daily.mjs --dry-run                          # write + build a new one, don't post
node pipeline/daily.mjs                                    # write + build + post
node pipeline/schedule.mjs 17:00                           # run daily.mjs every day at 5pm
node pipeline/schedule.mjs off                             # stop daily posting
npm run studio                                             # tweak the motion graphics live
```
A full run takes ~45–60 min on this Mac (mostly 3D capture), so schedule it ~1 hour before you want it posted.

## .env
- `OPENAI_API_KEY` – scripts + caption timing
- `GOOGLE_MAPS_API_KEY` – Map Tiles API (needed for unattended runs)
- `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` – posting
- `KOKORO_VOICE` (am_adam), `KOKORO_SPEED`

## Extras
- Drop royalty-free music (mp3) in `assets/music/` – one is picked at random and mixed quietly under the voice.
- To redo a step, delete its output in the episode folder (`timeline.json`, `captions.json`, `shots/`, `frames/`).
