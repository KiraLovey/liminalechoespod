// Liminal Echoes trivia — site configuration (safe to publish: the anon key is public by design; the host PIN lives in the database)
window.TRIVIA_CONFIG = {
  GAME: "ECHO",                                   // the join code viewers type
  SUPABASE_URL: "https://vgksjhkdghldovlrtaci.supabase.co",
  SUPABASE_KEY: "sb_publishable_co5QYQdT32tc0fXhX3OMaA_M7jpFfTr",
  SHEET_CSV_URL: "",                              // Google Sheet → File → Share → Publish to web → Questions tab → CSV → paste the link here
  PLAY_URL: "play.liminalechoespod.com",          // shown on the lobby screen
  PER_ROUND: 5
};
