// LANCEUR DU CALIBRAGE — ignoré par la suite de tests ordinaire.
//
//   CALIBRER=1 npx vitest run src/lib/card-engine/calibrer-bareme.run.test.ts
//
// Lit les cartes JOUABLES en lecture seule (clé service de .env.local), ajuste
// le barème (calibrage.ts) et écrit :
//   • src/lib/card-engine/bareme.generated.json — valeurs par défaut de la jauge ;
//   • docs/bareme-calibrage.md — rapport (qualité, multiplicateurs, cartes hors
//     budget). Aucune carte n'est modifiée.
import { describe, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { calibrer, type CarteCalibree, type RapportCalibrage } from "./calibrage";
import { libelleDeclencheur } from "./card-points";

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const COLONNES = "id, name, mana_cost, card_type, attack, health, rarity, race, clan, faction, effect_text, " +
  "keywords, keyword_instances, spell_keywords, spell_effects, capabilities, convocation_token_id, convocation_tokens, " +
  "lycanthropie_token_id, entraide_race, life_cost, discard_cost, sacrifice_cost, exile_cost, topdeck_cost, eveil_cost, equip_cost";

async function lireCartes(): Promise<CarteCalibree[]> {
  const e = env();
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
  // Les modèles du set « Inventions » ne sont pas des cartes : ce sont les
  // habillages de la machine construite en jeu (0/0, sans capacité).
  const { data: inventions } = await sb.from("sets").select("id").eq("name", "Inventions");
  const exclus = (inventions ?? []).map((s) => s.id as number);
  const out: CarteCalibree[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from("cards").select(COLONNES).eq("status", "playable");
    // `NOT IN` seul écarterait aussi les cartes SANS set (NULL en SQL).
    if (exclus.length) q = q.or(`set_id.is.null,set_id.not.in.(${exclus.join(",")})`);
    const { data, error } = await q.order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as CarteCalibree[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const f = (v: number, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace(".", ",");

function rapport(r: RapportCalibrage): string {
  const b = r.bareme;
  const L: string[] = [];
  L.push(`# Calibrage du barème — ${b.qualite?.date}`, "");
  L.push(`${r.cartes} cartes Jouables. **R² = ${f(r.r2, 3)}**, erreur médiane **${f(r.erreurMediane)} mana**.`, "");
  L.push("## Échelle", "", "| Paramètre | Valeur |", "|---|---|");
  L.push(`| Points par mana (ancrage) | ${b.pointsParMana} |`, `| ATQ | ${f(b.stat.atk)} |`, `| DEF | ${f(b.stat.def)} |`);
  for (const [k, v] of Object.entries(b.socle)) L.push(`| Socle ${k} | ${f(v)} |`);
  for (const [k, v] of Object.entries(b.type)) L.push(`| Type ${k} (× budget) | ${f(v)} |`);
  for (const [k, v] of Object.entries(b.rarete)) L.push(`| Rareté ${k} | ${f(v)} |`);
  L.push(`| Éveil (mana équivalent par point) | ${f(b.eveil)} |`, `| Plafond du rabais additionnel | ${f(b.plafondAdditionnel * 100, 0)} % du budget |`);
  for (const [k, v] of Object.entries(b.additionnel)) L.push(`| Coût additionnel ${k} (par unité) | ${f(v)} |`);
  L.push("", "## Déclencheurs (× coût de la capacité)", "", "| Déclencheur | × |", "|---|---|");
  for (const [k, v] of Object.entries(b.declencheur).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))) L.push(`| ${libelleDeclencheur(k)} | ${f(v ?? 1)} |`);
  L.push("", "## Limitations", "", "| Paramètre | × |", "|---|---|");
  for (const [k, v] of Object.entries(b.portee)) L.push(`| Portée ${k} | ${f(v)} |`);
  for (const [k, v] of Object.entries(b.cible)) L.push(`| Cible ${k} | ${f(v)} |`);
  L.push(`| Filtre : valeur résiduelle a | ${f(b.filtre.a)} |`, `| Hasard | ${f(b.hasard)} |`, `| Singulier | ${f(b.singulier)} |`, `| Don (part de la capacité conférée) | ${f(b.don)} |`);
  L.push("", "## Capacités nommées", "", "| Capacité | base | par X | par Y | cartes |", "|---|---|---|---|---|");
  for (const [k, c] of Object.entries(b.capacites).filter(([, c]) => (c.n ?? 0) > 0).sort((x, y) => (y[1].n ?? 0) - (x[1].n ?? 0))) {
    L.push(`| ${k} | ${f(c.base)} | ${f(c.perX)} | ${f(c.perY)} | ${c.n} |`);
  }
  L.push("", "## Contenus composés", "", "| Contenu | base | par X | par Y | cartes |", "|---|---|---|---|---|");
  for (const [k, c] of Object.entries(b.composes).filter(([, c]) => (c?.n ?? 0) > 0).sort((x, y) => (y[1]?.n ?? 0) - (x[1]?.n ?? 0))) {
    L.push(`| ${k} | ${f(c!.base)} | ${f(c!.perX)} | ${f(c!.perY)} | ${c!.n} |`);
  }
  L.push("", `## Peu de données (< 8 cartes, estimation rétrécie vers l'ancien coût) — ${r.peuDeDonnees.length}`, "");
  L.push(r.peuDeDonnees.map((p) => `${p.cle} (${p.n})`).join(", "));
  // Classement par ÉCART EN MANA (prédit − réel) : le ratio points/budget n'a
  // aucun sens pour une carte à 0 mana, dont le budget est nul.
  const tri = [...r.ecarts].sort((x, y) => (y.predit - y.mana) - (x.predit - x.mana));
  const table = (rows: typeof tri) => ["| Carte | Type | Rareté | Mana | Mana prédit | Écart | Points / budget |", "|---|---|---|---|---|---|---|",
    ...rows.map((e) => `| ${e.name} (#${e.id}) | ${e.type} | ${e.rarete} | ${e.mana} | ${f(e.predit, 1)} | ${e.predit - e.mana >= 0 ? "+" : ""}${f(e.predit - e.mana, 1)} | ${e.mana > 0 ? `${f(e.ratio * 100, 0)} %` : "—"} |`)];
  L.push("", "## 30 cartes au-dessus de leur budget (trop fortes)", "", ...table(tri.slice(0, 30)));
  L.push("", "## 30 cartes en dessous de leur budget (trop faibles)", "", ...table(tri.slice(-30).reverse()));
  L.push("");
  return L.join("\n");
}

describe.skipIf(!process.env.CALIBRER)("calibrage du barème", () => {
  it("calibre et écrit le barème", async () => {
    const cartes = await lireCartes();
    const r = calibrer(cartes);
    writeFileSync("src/lib/card-engine/bareme.generated.json", JSON.stringify(r.bareme, null, 2) + "\n");
    mkdirSync("docs", { recursive: true });
    writeFileSync("docs/bareme-calibrage.md", rapport(r));
    console.log(`R²=${r.r2.toFixed(3)} erreur médiane=${r.erreurMediane.toFixed(2)} mana sur ${r.cartes} cartes`);
  }, 600_000);
});
