// Liminal Echoes trivia — site configuration (safe to publish: the anon key is public by design; the host PIN lives in the database)
window.TRIVIA_CONFIG = {
  GAME: "ECHO",                                   // the join code viewers type
  SUPABASE_URL: "https://vgksjhkdghldovlrtaci.supabase.co",
  SUPABASE_KEY: "sb_publishable_co5QYQdT32tc0fXhX3OMaA_M7jpFfTr",
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTI5g9JhZOq6djrYa0Vgg6lECq-DeIy8xiBVj2JdO4RTlE51MKM-xECcZzBFAADJREGbIeRnRKPnF_3/pub?gid=1758699271&single=true&output=csv",                              // Google Sheet → File → Share → Publish to web → Questions tab → CSV → paste the link here
  PLAY_URL: "play.liminalechoespod.com",          // shown on the lobby screen
  PER_ROUND: 5
};
