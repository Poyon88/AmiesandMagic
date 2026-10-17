-- Cards — seconde race (unités bi-race)
--
-- Ajoute `race2` : seconde race facultative d'une unité (ex. Elfes + Aigles
-- Géants pour un elfe chevauchant un aigle, Dragons + Zombies pour un dragon
-- zombie). Elle peut venir d'une autre faction que la carte. Le moteur compte
-- l'unité comme membre de ses DEUX races (cf. src/lib/game/races.ts).
--
-- Nullable : les cartes existantes restent mono-race sans migration de données.
-- La route /api/cards/save impose : race2 ⇒ race, et race2 ≠ race.
--
-- À APPLIQUER AVANT de déployer le code qui lit `race2` (les requêtes de partie
-- listent leurs colonnes explicitement et échoueraient sans elle).
--
-- Apply via Supabase dashboard SQL editor or
-- `mcp__claude_ai_Supabase__apply_migration`. Safe to re-run.

alter table public.cards
  add column if not exists race2 text;
