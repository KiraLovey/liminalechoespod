// Liminal Echoes trivia — site configuration (safe to publish: the anon key is public by design; the host PIN lives in the database)
window.TRIVIA_CONFIG = {
  GAME: "ECHO",                                   // the join code viewers type
  SUPABASE_URL: "https://vgksjhkdghldovlrtaci.supabase.co",
  SUPABASE_KEY: "sb_publishable_co5QYQdT32tc0fXhX3OMaA_M7jpFfTr",
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTI5g9JhZOq6djrYa0Vgg6lECq-DeIy8xiBVj2JdO4RTlE51MKM-xECcZzBFAADJREGbIeRnRKPnF_3/pub?gid=1758699271&single=true&output=csv",                              // Google Sheet → File → Share → Publish to web → Questions tab → CSV → paste the link here
  PLAY_URL: "play.liminalechoespod.com",          // shown on the lobby screen
  PER_ROUND: 5,
  SOUNDS: true, REACTION_VOLUME: 0.12, FANFARE_VOLUME: 0.3,   // reaction blips + end-of-round fanfare, stage pages only
  // Optional sound files (put them in assets/sfx/). Any reaction or fanfare without a file keeps its built-in synthesized sound.
  REACTION_SOUNDS: { "😂": "/assets/sfx/laugh.mp3", "😱": "/assets/sfx/gasp.mp3", "🔥": "/assets/sfx/fire.mp3", "👻": "/assets/sfx/ghost.mp3", "💩": "/assets/sfx/poop.mp3" },
  // FANFARE_SOUND: "/assets/sfx/fanfare.mp3", FANFARE_FINAL_SOUND: "/assets/sfx/fanfare-final.mp3",
  MUSIC_VOLUME: 0.18,                             // 0–1; the beds are normalized so this means the same for every category
  MUSIC: {                                        // category → loop file (keys must match the Category column exactly)
    "Out of This World": "/assets/music/out-of-this-world.mp3",
    "Cryptid Corner":    "/assets/music/cryptid-corner.mp3",
    "Heists & Hustles":  "/assets/music/heists-and-hustles.mp3",
    "Haunted History":   "/assets/music/haunted-history.mp3",
    "Classified":        "/assets/music/classified.mp3",
    "Internet Weird":    "/assets/music/internet-weird.mp3",
    "Lost & Found":      "/assets/music/lost-and-found.mp3",
    "Strange But True":  "/assets/music/strange-but-true.mp3",
    "Bonus Round":       "/assets/music/bonus-round.mp3",
    "*":                 "/assets/music/strange-but-true.mp3"
  }
};
