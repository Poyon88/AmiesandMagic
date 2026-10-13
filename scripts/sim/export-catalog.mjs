// Exporte en LECTURE SEULE le catalogue jouable (cartes, jetons, héros) vers un
// fichier JSON local, pour que le simulateur tourne hors ligne.
// Usage : node scripts/sim/export-catalog.mjs <sortie.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const COLS = "id, name, mana_cost, card_type, attack, health, effect_text, keywords, keyword_instances, spell_keywords, spell_effects, capabilities, faction, race, clan, rarity, card_alignment, convocation_token_id, convocation_tokens, lycanthropie_token_id, entraide_race, set_id, life_cost, discard_cost, sacrifice_cost, exile_cost, topdeck_cost, eveil_cost, equip_cost, discoverable, status";

async function tout(table, cols, filtre = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filtre(sb.from(table).select(cols)).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const cards = await tout("cards", COLS, (q) => q.eq("status", "playable"));
const tokens = await tout("token_templates", "*");
const heroes = await tout("heroes", "*");
const sets = await tout("sets", "id, name, type");
writeFileSync(process.argv[2], JSON.stringify({ exportedAt: new Date().toISOString(), cards, tokens, heroes, sets }));
console.log(`cartes jouables ${cards.length}, jetons ${tokens.length}, héros ${heroes.length}, sets ${sets.length}`);
