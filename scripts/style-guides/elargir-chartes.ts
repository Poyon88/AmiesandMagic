// ÉLARGIT les chartes graphiques par défaut des clans (2026-10-15) : chaque
// charte d'origine donnait UNE lumière, UN décor phare et UN costume, d'où des
// cartes clones (huit Fils du Volcan de nuit, devant le volcan, en kapa).
// Claude réécrit lumière, décors, matériaux/costumes et motifs en listes
// d'options variées ; palette, style, interdits et notes restent tels quels.
//
// La charte d'origine n'est PAS modifiée : la version élargie est insérée à
// côté sous le nom « Charte élargie » et devient la charte par défaut (retour
// arrière : onglet Chartes de la Forge, « par défaut » sur l'ancienne).
//
// Usage :
//   npx vite-node --config vitest.config.ts scripts/style-guides/elargir-chartes.ts <sortie.json> [clan…]
//       → propose, écrit le JSON, ne touche pas à la base
//   npx vite-node --config vitest.config.ts scripts/style-guides/elargir-chartes.ts --appliquer <sortie.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { StyleGuide } from "@/lib/ai/style-guide";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const args = process.argv.slice(2);

const NOM = "Charte élargie";
const CHAMPS = ["lighting", "environments", "materials", "motifs"] as const;
type Proposition = { id: number; clan: string } & Record<typeof CHAMPS[number], string>;

const SYSTEM = `Tu es directeur artistique d'« Armies & Magic », un CCG médiéval-fantastique. On te donne la charte graphique d'un clan. Elle est trop étroite : toutes les illustrations du clan finissent à la même heure, devant le même décor phare, dans le même costume. Tu réécris QUATRE champs pour qu'un lot de 20 cartes puisse être varié tout en restant reconnaissable.

Chaque champ est une LISTE d'options séparées par des points-virgules (pas de phrases liées entre elles : le générateur en tire quelques-unes au hasard pour chaque carte, chaque option doit donc se suffire à elle-même).

- lighting (6 à 9 options) : couvre le JOUR et la NUIT et plusieurs météos (aube, plein jour, crépuscule, nuit, pluie, brume, orage, neige si le climat s'y prête…), chacune déclinée dans l'esprit du clan. La lumière signature d'origine reste UNE option parmi les autres. Si le clan vit sous terre ou dans l'ombre, varie les sources (puits de jour, cristaux, braseros, champignons, reflets d'eau…).
- environments (10 à 14 options) : des lieux de VIE ordinaires (marchés, ateliers, champs, foyers, ports, routes, camps…) autant que des lieux de guerre ou sacrés. Le décor phare d'origine (volcan, cité, arbre-monde…) garde UNE seule option, marquée « (occasionnel) ».
- materials (10 à 14 options) : au moins SIX tenues nettement différentes (de tous les jours, de travail ou de métier, de voyage, de cérémonie, de guerre légère, de guerre lourde, de chasse, de deuil…), puis armes, outils, architecture. Garde la culture matérielle d'origine et ses interdits (si la charte dit « jamais de métal », pas de métal).
- motifs (6 à 10 options) : garde ceux d'origine qui sont forts, ajoute-en de plus discrets ou quotidiens.

Règles : français ; reste fidèle à l'identité, à la culture et aux interdits du clan (champ « avoid ») ; n'invente pas de race ; pas de nom propre de personnage ; chaque option tient en quelques mots.
Réponds UNIQUEMENT par un objet JSON : {"lighting": "…", "environments": "…", "materials": "…", "motifs": "…"}`;

async function proposer(sg: StyleGuide): Promise<Proposition> {
  const charte = (["palette", "lighting", "art_style", "environments", "materials", "motifs", "avoid", "notes"] as const)
    .map((k) => `${k}: ${sg[k] ?? ""}`).join("\n");
  let derniere = "";
  for (let essai = 0; essai < 3; essai++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 6000,
        output_config: { effort: "low" },
        fallbacks: "default",
        system: SYSTEM,
        messages: [{ role: "user", content: `CLAN : ${sg.clan}\n\nCHARTE D'ORIGINE :\n${charte}` }],
      }),
    });
    const data = await res.json();
    if (!res.ok) { derniere = data?.error?.message ?? String(res.status); await new Promise((r) => setTimeout(r, 3000)); continue; }
    const texte: string = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    try {
      const j = JSON.parse(texte.slice(texte.indexOf("{"), texte.lastIndexOf("}") + 1));
      if (CHAMPS.every((k) => typeof j[k] === "string" && j[k].length > 40)) {
        return { id: sg.id, clan: sg.clan, ...Object.fromEntries(CHAMPS.map((k) => [k, j[k].trim()])) } as Proposition;
      }
      derniere = "champ manquant";
    } catch { derniere = "JSON illisible"; }
  }
  throw new Error(`${sg.clan} : ${derniere}`);
}

async function main() {
  if (args[0] === "--appliquer") {
    const props: Proposition[] = JSON.parse(readFileSync(args[1], "utf8"));
    for (const p of props) {
      const { data: orig, error } = await sb.from("style_guides").select("*").eq("id", p.id).single();
      if (error || !orig) throw new Error(`${p.clan} : charte ${p.id} introuvable`);
      const { data: deja } = await sb.from("style_guides").select("id").eq("clan", p.clan).eq("name", NOM).maybeSingle();
      if (deja) { console.log(`${p.clan} : déjà élargie (id ${deja.id}), ignorée`); continue; }
      // Un seul défaut par clan (index unique partiel) : l'ancienne d'abord.
      const e1 = await sb.from("style_guides").update({ is_default: false }).eq("id", p.id);
      if (e1.error) throw e1.error;
      const { id: _id, created_at: _c, updated_at: _u, ...reste } = orig as StyleGuide;
      const e2 = await sb.from("style_guides").insert({ ...reste, name: NOM, is_default: true, ...Object.fromEntries(CHAMPS.map((k) => [k, p[k]])) }).select("id").single();
      if (e2.error) {
        await sb.from("style_guides").update({ is_default: true }).eq("id", p.id);
        throw e2.error;
      }
      console.log(`${p.clan} : charte ${e2.data.id} par défaut (origine ${p.id} gardée)`);
    }
    return;
  }
  const sortie = args[0];
  if (!sortie) throw new Error("chemin de sortie attendu");
  const filtre = args.slice(1);
  const { data, error } = await sb.from("style_guides").select("*").eq("is_default", true).neq("name", NOM).order("clan");
  if (error) throw error;
  const chartes = (data as StyleGuide[]).filter((g) => !filtre.length || filtre.includes(g.clan));
  const props: Proposition[] = [];
  for (let i = 0; i < chartes.length; i += 6) {
    const paquet = await Promise.all(chartes.slice(i, i + 6).map(proposer));
    props.push(...paquet);
    console.log(`${props.length}/${chartes.length}`);
  }
  writeFileSync(sortie, JSON.stringify(props, null, 2));
  console.log(`écrit : ${sortie}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
