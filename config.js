// Liminal Echoes trivia — site configuration (safe to publish: the anon key is public by design; the host PIN lives in the database)
window.TRIVIA_CONFIG = {
  GAME: "ECHO",                                   // the join code viewers type
  SUPABASE_URL: "https://vgksjhkdghldovlrtaci.supabase.co",
  SUPABASE_KEY: "sb_publishable_co5QYQdT32tc0fXhX3OMaA_M7jpFfTr",
  SHEET_CSV_URL: "",                              // Google Sheet → File → Share → Publish to web → Questions tab → CSV → paste the link here
  PLAY_URL: "play.liminalechoespod.com",          // shown on the lobby screen
  PER_ROUND: 5,
  SOUNDS: true, REACTION_VOLUME: 0.12, FANFARE_VOLUME: 0.3,   // reaction blips + end-of-round fanfare, stage pages only
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
