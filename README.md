# Liminal Echoes · Anniversary Trivia

A live, phone-in trivia game for the one-year anniversary stream. Viewers open **play.liminalechoespod.com** on their phone, type the code on screen, and answer. Two hosts in two places share one control panel. The stage overlays drop into OBS/Aitum and Meld Studio as browser sources.

| Page | URL (once deployed) | Who opens it |
|---|---|---|
| Player | `https://play.liminalechoespod.com/` | viewers, on their phones |
| Host panel | `https://play.liminalechoespod.com/host` | Kira and Fox (needs the PIN) |
| Stage 16:9 | `https://play.liminalechoespod.com/stage` | browser source, 1920×1080, transparent |
| Stage 9:16 | `https://play.liminalechoespod.com/tall` | browser source, 1080×1920, transparent |
| Studio | `https://play.liminalechoespod.com/studio` | rehearse alone; offline, doesn't touch the live game |

## Setup, in order (about 25 minutes)

### 1. Supabase — the shared game state (one time)
1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql`, find the line marked `<<< CHANGE ME >>>` near the bottom and replace `4242` with the host PIN you and Fox will use (4–8 digits).
3. Paste the whole file into the editor and press **Run**. You should see "Success. No rows returned."
4. Still in Supabase: **Database → Replication** (or **Realtime** in newer dashboards). Make sure the `games`, `players` and `answers` tables are enabled for Realtime. The script tries to do this for you; this is just a check.

That's it. `config.js` already has your project URL and publishable key. Those are public by design — the only secret is the PIN, which lives inside the database and is never sent to browsers.

### 2. GitHub — put this folder in a repo
1. Create a new repository, e.g. `liminal-trivia` (private is fine).
2. Upload everything in this folder (drag-and-drop on github.com works: "Add file → Upload files"). Keep the folder structure exactly as is (`host/index.html`, `assets/app.js`, …).

### 3. Cloudflare Pages — host the site on your domain
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick the `liminal-trivia` repo.
2. Build settings: Framework preset **None**, build command **(leave empty)**, build output directory **/** (a single forward slash). Save and Deploy.
3. When it finishes you get a `*.pages.dev` URL. Test it: open `/studio` and run a round with the simulated players.
4. Add your domain: in the Pages project → **Custom domains** → **Set up a custom domain** → enter `play.liminalechoespod.com`. Because the domain is already on Cloudflare, it activates itself; give it a minute.

Any later change is just a commit to the repo; Cloudflare redeploys in about a minute.

### 4. Load the real questions
1. In the Google Sheet (the MASTER bank), fill the **Order** column 1–45 and set **Status** to `approve` on those rows (`edit` also counts as approved). Rows 1–5 are round one (four Fact rows then one Host row), 6–10 round two … 36–40 round eight, and 41–45 must all be Host rows for the Bonus Round. Each block of five should share one Category.
2. Sheet → **File → Share → Publish to web** → choose the **Questions** tab and **Comma-separated values (.csv)** → Publish → copy the link.
3. Paste that link into `config.js` as `SHEET_CSV_URL` and commit.
4. Open `/host`, enter the PIN, press **Load questions from sheet**. The panel lists what it loaded, grouped by round. Every screen picks up the new set immediately. Re-press it whenever the sheet changes; edits in the sheet are live as soon as you reload them this way.

Until the sheet is ready, **Load draft set** loads the 45 auto-picked draft questions so you can rehearse.

## Stream setup
- **Kira (OBS + Aitum):** Browser Source → URL `https://play.liminalechoespod.com/stage` → width 1920, height 1080. For the vertical output, a second Browser Source with `/tall` at 1080×1920. Tick "Shutdown source when not visible" off so the timer keeps running. The background is transparent; place your two camera sources *under* the browser source, centred on the two rings (16:9: centres at x 260 / 1660, y 804, diameter 350. 9:16: centres at x 290 / 790, y 360, diameter 370).
- **Fox (Meld Studio):** Browser layer with the same URLs and sizes; camera layers beneath, positioned the same way.
- Only one of you needs the stage layers (whoever composites the stream). Both of you open `/host`.
- Stream delay: read the setup card and the question aloud *before* pressing "Show question & start timer"; viewers on a delayed platform then get the full timer. Consider 25–30 seconds in Settings rather than 20.

## On the night (host panel)
1. Both hosts open `/host` and enter the PIN. Open `/stage` in a browser tab too if you want to see it without the stream.
2. Confirm the question count in the sidebar ("R1 · Q1 of 5" appears after Start). If it says "no questions loaded", load them (step 4 above).
3. Viewers join with code **ECHO** while the lobby is on screen. Anyone who joins after **Start game** becomes audience: they vote along, earn audience points, and the top audience scorer appears under the podium at the end and in the Audience list on your panel (for the merch prize).
4. Flow per question: **Begin round** (round title on stage) → read the setup → **Show question & start timer** → the question auto-reveals when time is up or everyone has answered, or press **Reveal answer now** → read the explanation → **Next question**. After every fifth question the button becomes **Show leaderboard (end of round)**, then **Next round**. **Peek leaderboard** works any time and returns you where you were.
5. Scoring: correct +500, wrong −250, no answer 0. Host questions (the fifth in each round and all of the Bonus Round) add +100 to the fastest correct *player*. Bonus Round doubles the correct value. All of these are editable in the sidebar during the show.
6. **Reset game** needs two clicks. It clears players and scores but keeps the loaded questions.

## Sounds and music
- **Reaction sounds** are tiny synthesized blips played on the stage pages only (so they go to the stream, not to phones). Turn them off with `SOUNDS: false` in `config.js`; set the level with `REACTION_VOLUME: 0.12` (0–1). A short synthesized fanfare (in A, to match the theme) plays when the end-of-round leaderboard and the final podium appear; its level is `FANFARE_VOLUME: 0.3`.
- **Category music** is optional. Put loopable audio files in `assets/music/` and map them in `config.js`:
  ```js
  MUSIC: { "Out of This World": "/assets/music/space.mp3", "Cryptid Corner": "/assets/music/woods.mp3", "*": "/assets/music/default.mp3" },
  MUSIC_VOLUME: 0.18,
  ```
  The stage fades a category's track in on the round title card and keeps it running under every question, reveal and peek; it fades out when the end-of-round leaderboard appears (fanfare only), and the next category's track starts with the next round. `"*"` is the fallback for categories without their own file. Use music you have the rights to stream on every platform you simulcast to (see the note in the chat about DMCA-safe sources).

### If there's no music
1. Open `/host`: under Reset game it says whether all nine music files are reachable on the site. If any are missing, the `assets/music` folder didn't make it into the repo (GitHub's drag-and-drop upload sometimes drops files silently); upload it again and check the commit lists the .mp3/.ogg files.
2. Open `/stage?debug` in a normal browser tab and press Begin round on the host panel. A status line appears bottom-left: "playing …", "BLOCKED (click the page once)", or the actual error. Browsers won't start sound in a tab until you click somewhere on the page once; OBS and Meld browser sources don't have that restriction (in OBS, right-click the source → Interact and click once if ever needed).
3. In OBS, the browser source's audio goes wherever "Control audio via OBS" sends it: off = desktop audio, on = its own mixer channel. Same channel as the reaction blips.

## Files
- `assets/app.js` — the whole game (player, host, stage, studio) and both backends
- `assets/app.css` — styling, both stage layouts, transparent camera holes
- `assets/questions.draft.js` — draft show, replaced by the sheet
- `config.js` — your Supabase URL/key, sheet link, join code
- `supabase/schema.sql` — tables, realtime, security, and the host functions (scoring runs on the server)
- `_headers` — lets the pages be embedded (browser sources)

## Changing things later
- **Join code:** it's the game's id. To use a different code, add a second row in the `games` table (and `game_secrets`) with the new id and set `GAME` in `config.js`.
- **Camera positions/sizes:** `.wide .cam` / `.tall .cam` in `app.css`, plus the matching `mask` circles on `.stage.wide` / `.stage.tall`.
- **Reactions:** the `REACTIONS` list at the top of `app.js`.
- **Questions per round:** `PER_ROUND` in `config.js`.
