# Miami Reels — operating guide for Claude

This repo runs **@getnearapp** end to end (the owner handed Claude the account; ChatGPT no longer posts). Daily, New York time:
**12 posts a day (owner, Oct 3: "less carousels, more viral videos")**: 5 hook + video posts (`clip` 8am/11am/3pm/5pm/10pm), 2 viral Reels with edits (`viral` 10am/6pm), 2 map Reels (1pm/8pm), 3 carousels (`brief` 9am, `upcoming` 12pm, `news` 7pm; the picker also sees r/Miami, r/florida, r/fortlauderdale and Google Trends Florida via `fetchViral` in `pipeline/news.mjs`). `deals`, `feature` and the extra news slots are off since Oct 3 (still in the code: add them back to `control.json` → `carousels`). `world` off since Sep 30. Every news carousel is ONE story told in depth with connected slides — never a roundup. Stories (owner, Sep 29): the owner reposts other accounts' stories, so the bot adds only a few of its own — `control.json` → `storiesPerDay` (2) at least `storyGapHours` (5) apart; remove `storiesPerDay` to cross-post every post again. Feed posts stay ≥1 hour apart: before publishing, `pipeline/publish.mjs` checks the account's latest post (including ones the owner posts from the app, which it logs in `posted.log` as manual) and waits out the rest of the hour.
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
| "Post these videos over the week" | One episode id per line in `plan/videos.txt`; each scheduled slot posts the next already-rendered one on the hour (no re-render). Remove a line to drop it. |
| "This week's Reels are…" | Add one topic per line to `plan/queue.txt`; each scheduled Reel takes the next line. |
| "Change carousel times" / "add a carousel" | `control.json` → `carousels` = `{"kind": hour}` or `{"kind": [hours]}` (e.g. `"news": [7, 11, 15, 19]`; `clip` = viral video posts). Keep every post ≥1 hour apart (one per hour slot). |
| "Change the post times" / "add a third post" | `control.json` → `postHours` = New York post hours, 24h (e.g. `[13, 20]`). A check every 30 min in `reel.yml` starts a run ~1 hour before each (up to 4 retries; `state/slots.txt` prevents double posts). Commit + push. |
| "Pause" / "resume" | `control.json` → `"paused": true/false`. Commit + push. |
| "Skip tomorrow" / a date | Add `"YYYY-MM-DD"` (New York date) to `control.json` → `skipDates` (skips both posts that day). Commit + push. |
| "What did we post?" | Read `posted.log` (timestamp, file, Instagram link) and `episodes/*/episode.json`. |
| "Change the style / voice / tone" | Style prompt: `pipeline/generate.mjs` (PROMPT). Graphics: `src/Reel.tsx`. Voice: OpenAI `ash` by default (style in `pipeline/voice.mjs` OPENAI_STYLE: clear separate sentences, questions rise at the end); `"voice": {"provider": "kokoro"}` in an episode uses the old Kokoro voice (`KOKORO_VOICE`, am_adam). |

Scheduled runs respect `control.json`; runs started by `requests/run.json` or the Run-workflow button always go.

The owner can also do all of this without Claude: GitHub app → Actions → **Control** → Run workflow (`.github/workflows/control.yml`).

## Viral Reels with edits (owner Oct 3: "only in dade meets kalshi")
`viral` slots run `pipeline/viralreel.mjs` → `src/Viral.tsx` (Remotion): a viral video (raw dashcam/bodycam/surveillance/phone footage; mainstream, nationwide or worldwide is fine: `MAINSTREAM` + `STATIONS` + agency `CHANNELS` in `clip.mjs`) cut to its most hooking 12–45 s, with a 3 s blurred intro (typed hook + key clicks, "⚠️ viewer discretion is advised" when sensitive), a situation box on top, short "what's happening" captions at the bottom, ONE freeze-frame where blue labels with arrows point at who is who (SUSPECT, VICTIM'S CAR, OFFICER — never "perpetrator" unless convicted), credit + @getnearapp. Posted as a normal Reel (no music). Nothing good → the slot posts a hook + video instead. Manual/preview: `requests/viral.json` → `{"publish": false, "url": "optional", "at": "..."}` (`.github/workflows/viral.yml`); previews land at `releases/download/videos/viral-<date>-<id>.mp4`.

## Viral clips (hook + video, owner Oct 2)
Cover (owner, Oct 3): ONE clean hook sentence with one blue-highlighted phrase over a frame, credit + handle small at the bottom, nothing else. Sources since Oct 3: agencies + TV stations + national news (`MAINSTREAM`), raw-footage part only.
`clip` slots (`control.json` → `carousels.clip`) post a 2-slide carousel like @onlyindade: slide 1 = big hook over a frame, slide 2 = the
agency's own footage (≤58 s, credited "🎥 Video: <agency>"). `pipeline/clip.mjs`: recent uploads from official agency YouTube channels
(`CHANNELS`: South Florida + the Florida sheriffs whose bodycam goes viral — Volusia, Polk, Brevard, Pinellas…), an LLM ranks the craziest,
then it downloads each, watches the whole video (frames + transcript), safety-checks it, scores it 1–10 for "crazy" (owner: "more crazy";
`MIN_CRAZY` 7) and cuts the best moment. Never TV-station clips, victims, kids or gore. Rejected/posted ids go in `state/clips-seen.txt`.
If no video qualifies, the slot posts a `news` carousel instead. Downloads need the `YOUTUBE_COOKIES` secret (owner's cookies.txt; if
downloads start failing with "Sign in to confirm you're not a bot", the owner must export fresh cookies into that secret).
News/brief carousels (owner, Oct 2): if an agency released video of that exact story (`videoForStory` in `clip.mjs`), it goes in as slide 2 and the carousel is only 4 slides (cover, video, 2 slides, no CTA); otherwise max 5 slides (people won't read long ones). Photos: real ones first — the outlets' feed photos and the articles' lead images (`ogImage`, usually the mugshot), each reused at most twice — then place stock, AI only as a last resort (owner: "too much AI is annoying").
Video sources for that slide (owner, Oct 2): agency channels AND TV stations (`STATIONS` in `clip.mjs`: WSVN, Local 10, NBC 6, CBS Miami, WPTV, WPBF) — any station clip, credited "🎥 Video: <station>". **Fallback if a copyright claim/strike or takedown happens:** switch to raw police-released footage only (surveillance/bodycam/phone video cut out of the station report, never anchor/reporter segments, ≤30 s) — the owner's pre-approved plan B. Standalone clip slots stay agency-only.
Manual: `requests/clip.json` → `{"publish": true|false, "url": "optional YouTube link", "at": "..."}` (`.github/workflows/clip.yml`).

## Reels with music (owner posts them)
The Instagram API can't add music. An episode with `"music": true` is never auto-posted to Instagram: the owner posts it
from the app with a trending sound. Use it for Reels that would do well with music (events, parties, guides, lifestyle
lists) — `generate.mjs` sets it automatically for EVENTS/GUIDE; informational/history ones keep auto-posting. Scheduled
slots skip music videos in `plan/videos.txt`; if a generated Reel is a music one, `handToOwner()` (`pipeline/buffer.mjs`)
logs `music:<id>  <video link>` in `posted.log` instead of posting. **Send the owner that link** (check-ins look for new
`music:` lines) with a suggested post time.

**TikTok (owner, Sep 29 afternoon): Buffer is back ON** (`control.json` → `"tiktokBuffer": true`; tracking a chat list was too much). The day's TikTok schedule goes into Buffer in one go: `requests/tiktok-batch.json` → `{"items":[{"label","video"|"images":[URLs or repo paths],"text","at":"ISO"}]}`, committed with "TikTok batch" in the message (`.github/workflows/slideshow.yml` → `node pipeline/buffer.mjs --batch`); each item is a Buffer reminder at its time. (With `"tiktokBuffer": false`, picks are logged in `posted.log` as `tiktok-pick:<label>  <links>  <caption>` for a plain chat list instead.) TikTok goes through Buffer (TikTok connected as a Buffer channel). Owner's rules: nothing auto-posts to TikTok
(music matters: everything is a Buffer **reminder**, the owner adds a sound and posts), and TikTok gets only upcoming things
and very viral stories, ~4+ a day. Reels: music Reels plus any episode with `"tiktok": true` (EVENTS/GUIDE set both).
**Owner, Sep 30: TikTok is Reels only** — slideshows don't perform there, so `control.json` → `"tiktokSlideshows": false` keeps carousels out of Buffer. TikTok Reels are the **map Reels** (owner, Sep 30 evening: didn't like the fast photo-only format; they'll bring new concepts later). Don't make photo-only `"style": "fast"` Reels (040/041 were the trial) unless the owner asks again; the code stays for later. Aim for 60 s+ (TikTok Creator Rewards only pays on videos over a minute). `requests/tiktok-batch.json` → `"clearPending": true` deletes reminders not yet due. (When slideshows are on:) the daily `deals` (11am) and `upcoming` (12pm) carousels always go;
other carousels are rated for TikTok and those scoring `control.json` → `tiktokMinScore` (6)+/10 go, max `tiktokSlideshowsPerDay` (8) a day (owner: capitalize on slideshows, not just Reels)
(`tiktokWorthy` in `pipeline/carousel.mjs`, `postToTikTok` in `pipeline/buffer.mjs`). World carousels never go.
Hand-made slideshows (brand logos, bold colors, e.g. National Coffee Day): `slideshows/<id>/slides.json` + `logos/`, render with `node pipeline/slideshow.mjs render slideshows/<id>`, commit (incl. `out/`), then `requests/slideshow.json` → `{"dir": "slideshows/<id>", "at": "..."}` sends it to Buffer (`.github/workflows/slideshow.yml`).
The old direct TikTok app (`pipeline/tiktok.mjs`, `docs/tiktok/`) is no longer needed.

## Checking on runs & sharing videos (works without gh / without login — the repo is public)
- Every rendered video is uploaded as `https://github.com/lolerman123456/miami-reels/releases/download/videos/<episode-id>.mp4`
  (phone-friendly, no login). Send the owner that link when a video is ready, especially for previews (`"publish": false`).
- Run status: `curl -s "https://api.github.com/repos/lolerman123456/miami-reels/actions/runs?per_page=5"` (fields: name, event,
  status, conclusion, created_at, html_url). A Reel run is split into jobs: `prepare` (script/voice/captions) → `capture` (the 3D footage, ~16 slices rendered in parallel by `pipeline/parallel.mjs`) → `reel` (stitch, post). ~15 min normal, ~25–30 min with `"quality": "high"` in requests/run.json (full-res, more detail; use for hand-picked Reels).
- What got posted: `posted.log` (pull first — the bot commits it after each run).
- Voice: OpenAI ash is the default; another voice: `"voice": {"provider": "openai", "voice": "onyx"}` in that episode.json (optional `"speed": 1.15`), or `{"provider": "kokoro"}` for the old Adam voice.

## Content rules (keep the account safe)
No jokes (owner's call — they read as AI): everything is informational, from real sources (news, Wikipedia, Zillow), fact-checked.
Never target ethnic groups, nationalities, religions, races, or real private people. No slurs/explicit content. Hook in the first 3 seconds. Max 4 hashtags per post. Collaborator invites: posts about a venue/brand in `voice/handles.json` tag it (max 3); only add confirmed official handles there. Carousel photos must stop the scroll: news carousels use the outlets' own photos from the Local 10 / WSVN / NBC 6 feeds (credited) first, then eye-catching AI images (vivid, bright, bold angle), stock only as a fallback (owner, Sep 29: stock looks bland; news slides use a navy, lighter fade instead of heavy black); an optional `"mark"` (circle / arrow / x / "stamp: ON THE RUN"…) on at most one slide, only when it adds meaning (never on private people, victims or kids). Single-topic carousels: one sector label (ECONOMY…), slides tell one connected story but never force stock openers ("THAT'S…", "AND THAT'S AFTER…") and never repeat the hook (owner, Sep 30). News goes niche like @onlyindade: arrests of teachers/professors/officials, fraud with dollar amounts, assault charges (never name/picture victims), polarizing local fights; always "accused/charged" unless convicted. Deals include parking (ParkMobile), transit, free admission days and coupons, with the best deal as the cover hook. Two looks (owner): `news`/`brief`/`world`/`feature` keep the classic news style (photo on top, black, blue accents: easy on the eyes); `deals`/`upcoming` (and hand-made slideshows) look alive like the National Coffee Day one — each slide in the brand/team color (else the sector color), a logo card when a brand/team/org is the subject (`getLogo`: `assets/logos/<domain>.png` library first, then the site's icon), an emoji, a yellow fact chip (date/price/number), slide counter; list covers show the brands' logos. Add clean logos for new chains to `assets/logos/`.

## Episode JSON essentials
Map Reels are **informational, no jokes** (owner's call). **Default: upcoming / happening-now things people can go to** (events, parties, guides with dates, prices, venues + a tag-a-friend outro and venue collab tags) — the raves Reel was the top performer. History/crime only rarely. Older default was STORY: a gripping true story tied to one
place (e.g. "Did you know one of the world's greatest designers died here?" → Versace mansion). Also NEW BUILD / HISTORY / DID YOU KNOW /
RENT CHECK / BY THE NUMBERS. Voice at 1.3 speed (KOKORO_SPEED). Graphics: calm fades/slides, Near blue #1769FF + white, no bounce/tilt, getnearapp tag. `pipeline/generate.mjs` plans a topic, pulls real sources (news, Wikipedia via `pipeline/facts.mjs`,
Zillow rent data), writes only from those sources, then a fact-check pass fixes anything unsupported.
Scenes: `hook` (overlay = 2 short lines, 4 emojis, shot `dive`), 3–5× `item` (no rank; `badge` = key stat like "1,049 FT" or
"$3,831/MO", `overlay` = place, `sub` = context), `outro` (question, shot `pullout`). `text` = spoken (numbers as words),
`caption` = on-screen version. Real photos in a Reel: add `"photos": {"queries": ["Venetian Pool Coral Gables", "Venetian Pool grotto"], "at": 0.45}` to an item scene; the prepare job fetches credited Wikimedia photos (`pipeline/scenephotos.mjs`) and the scene cuts from the 3D orbit to them with a slow push/pan (owner, Sep 30). Small places (pools, gardens) need a tight camera `range` (250–450 m) so they actually show. Locations: use Wikipedia coordinates when available. Camera `range`: 500–900 m low-rise,
**1400–1800 m for skylines** or the camera ends up inside buildings. 140–190 words ≈ 55–70 s.

## OpenAI cost (owner, Oct 3: keep it under ~$2/day)
All chat calls go through `pipeline/llm.mjs`: tier `mini` (`OPENAI_MINI_MODEL`, default gpt-5.4-mini) for picking, video/photo checks,
captions and fact checks; tier `write` (`OPENAI_WRITER_MODEL`, default gpt-5.5) only for the carousel copy and Reel scripts; low
reasoning effort everywhere. AI images max 2/day (`AI_IMAGES_PER_DAY`; owner Oct 3: $25 must last 1–2 weeks, target ≤ $2/day), gpt-image-1-mini. Each run prints `OpenAI usage: …` at the end
(read the logs to estimate the day's cost). Out of credits → runs stop instead of posting half-checked content (Oct 3 the 10am viral
Reel posted with TV graphics because its cleanup calls failed); pause with `control.json` → `paused` until credits are added.

## Secrets (repo settings, never commit them)
`OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`.
The Instagram token is refreshed each run; if posting fails with an auth error, the owner must paste a new token
into the `INSTAGRAM_ACCESS_TOKEN` secret.
