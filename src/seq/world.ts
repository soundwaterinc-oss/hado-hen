// world.ts — a library of world/ethnic rhythm cells. Each is a step pattern ('x'=onset,
// '.'=rest) at its own natural length; a lane in WORLD mode cycles it on the shared 16th
// clock, so different traditions layer and phase against each other (and the odd meters).
// These are recognisable canonical cells — an artistic palette, not a strict transcription.

const RAW: Record<string, string> = {
  // ---- Afro-Cuban / Latin (16) ----
  "Son clave 3-2":   "x..x..x...x.x...",
  "Son clave 2-3":   "..x.x...x..x..x.",
  "Rumba clave 3-2": "x..x...x..x.x...",
  "Bossa nova":      "x..x..x...x..x..",
  "Cascara":         "x.xx.x.xx.x.xx.x",
  // ---- Afro-Cuban 8-cells ----
  "Tresillo":        "x..x..x.",
  "Cinquillo":       "x.xx.xx.",
  "Habanera":        "x..xx.x.",
  // ---- West-African bells (12/8) ----
  "Bembé (12)":      "x.x.xx.x.x.x",
  "Fume-Fume (12)":  "x.xx.x.xx.x.",
  "Agbekor (12)":    "x.xx.xx.x.x.",
  "Gahu (12)":       "x..x..x.x.x.",
  // ---- Middle-Eastern / Arabic (8) ----
  "Maqsum":          "x.xx.x..",
  "Baladi":          "xx..x.x.",
  "Ayoub":           "x.xx.x..",
  "Chiftetelli":     "x..x.xx.",
  // ---- Balkan / aksak-flavoured ----
  "Kalamatianos (7)":"x..x.x.",
  "Rachenitsa (7)":  "x.x.x..",
  // ---- Brazilian (16) ----
  "Samba":           "x.xx.xx.x.xx.xx.",
  "Baião":           "x..x..x.x..x..x.",
  "Partido alto":    "..x.x..x.x..x.x.",
  // ---- Indian-flavoured cells ----
  "Jhaptal (10)":    "x.x..x.x..",
  "Tintal (16)":     "x...x...x...x..x",
  // ---- North-African / Gnawa ----
  "Gnawa":           "x.xx.xx.",
  "Gnawa 12":        "x.xx.x.xx.x.",
  "Gnawa qraqeb":    "x.x.xx.x.xx.",
  "Malfuf":          "x..x..x.",
  // ---- Balinese / Javanese gamelan ----
  "Gamelan kotekan": "x.xxx.xxx.xx.xx.",
  "Gamelan polos":   "x...x...x...x...",
  "Gamelan sangsih": "..x...x...x...x.",
  "Gong cycle (16)": "x.......x...x...",
  "Kecak (cak)":     "x.xx.x.xx.x.xx.x",
  // ---- ECM / jazz drumming cells ----
  "Jazz ride":      "x...x.x.x...x.x.",  // swung ride ostinato (ding, ding-da)
  "Ride triplet":   "x..x..x..x..x..x",  // dotted/triplet feel
  "Jazz comp":      "....x.....x...x.",  // brushed snare comping accents
  "Brush sweep":    "x.......x.......",  // spacious brush
  "ECM pulse":      "x.....x...x.....",  // sparse, open
  // ---- breakbeat kit cells (used by the auto-arranger's random breaks; also pickable) ----
  "Break kick 1":     "x..x...x..x.....",
  "Break kick 2":     "x.....x.x...x..x",
  "Break snare":      "....x.......x...",
  "Break snare ghost":"....x..x....x.x.",
  "Break hat":        "x.x.x.x.x.x.x.x.",
  "Break hat 16":     "x.xxx.xxx.xxx.xx",
  "Break ghost":      "..x..x..x..x..x.",
};

export const WORLD_PATTERNS: Record<string, boolean[]> = {};
for (const [name, s] of Object.entries(RAW)) {
  WORLD_PATTERNS[name] = [...s].map((ch) => ch === "x");
}
export const WORLD_NAMES: string[] = Object.keys(RAW);
export const DEFAULT_WORLD = WORLD_NAMES[0];
