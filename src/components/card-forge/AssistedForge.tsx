"use client";

// Onglet « Création assistée » de la forge (remplace l'ancien onglet Masse).
//
//   1. Un CHAT guidé (Claude, /api/forge/brief-chat) recueille le brief du lot :
//      périmètre, capacités à privilégier (%), déclencheurs, coûts additionnels,
//      genre, précisions. Le brief est assaini côté serveur à chaque tour.
//   2. Récapitulatif, puis « Lancer » : le code planifie le lot (quotas exacts,
//      cohérence de race), équilibre chaque carte au barème, puis enchaîne pour
//      chacune texte → illustration → enregistrement en BROUILLON.
//   3. Étape CONCEPTS (avant le lancement) : Claude voit le lot entier et
//      invente pour chaque carte un sujet, une scène, une idée de nom et une
//      voix (/api/forge/concepts) ; l'auteur relit, retouche, régénère.
//   4. Les briefs sont conservés (historique réutilisable) avec leurs concepts
//      et les cartes créées par chaque lancement.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ABILITIES } from "@/lib/game/abilities";
import { getFactionDisplayName } from "@/lib/card-engine/constants";
import {
  BRIEF_COST_LABELS, BRIEF_MAX_CARDS, BRIEF_TRIGGER_LABELS, COST_FREQ_SHARE, emptyBrief, type CardBrief,
} from "@/lib/card-engine/brief";
import { appliquerEchange, bornesEquilibrage, equilibrer, labelUnite, planBatch, seededRng, type BalancedCard, type BatchPlan } from "@/lib/card-engine/brief-generator";
import { getBareme } from "@/lib/card-engine/bareme";
import { cartepourConcept, creerCarte } from "@/lib/card-forge/assisted-pipeline";
import { BULK_IMAGE_MODELS, type BulkImageModel } from "@/lib/ai/image-models";
import {
  ECHELLES_ACTION, ECHELLES_UNITE, ECHELLE_LABELS, SUBJECT_KINDS, SUBJECT_KINDS_UNITE, SUBJECT_KIND_LABELS, kindPourEchelle,
  type CardConcept, type ConceptPlan, type Echelle,
} from "@/lib/ai/card-concepts";

interface Msg { role: "user" | "assistant"; content: string }
interface BriefRow { id: number; title: string; brief: CardBrief; created_at: string; updated_at: string; created_cards: number }
interface Suivi { position: number; statut: "attente" | "encours" | "ok" | "erreur"; nom?: string; id?: number | null; erreur?: string; ratio?: number; image?: boolean; sujet?: string; voix?: string | null }

const nouveauSeed = () => (Date.now() % 2147483646) + 1;
/** Cartes du lot pour un tirage donné : même seed ⇒ mêmes cartes (concepts et lancement s'accordent).
 *  Avec `concepts`, leurs échanges de capacité sont appliqués AVANT l'équilibrage ;
 *  sans, c'est le tirage d'origine (celui que voit le planificateur). */
/** Hors des candidates d'échange : les capacités exclues, et celles à quota
 *  (un échange vers elles dépasserait leur quota exact). */
const exclusEchange = (brief: CardBrief) => [...(brief.constraints.excludedAbilities ?? []), ...brief.abilities.map((a) => a.id)];
const cartesDuLot = (brief: CardBrief, seed: number, concepts?: (CardConcept | null)[]) => {
  const plan = planBatch(brief, seededRng(seed));
  const exclues = exclusEchange(brief);
  return {
    plan,
    cartes: plan.cards.map((c, i) => equilibrer(appliquerEchange(c, concepts?.[i]?.echange, exclues), getBareme(), bornesEquilibrage(brief, c))),
  };
};
const pourConcepts = (brief: CardBrief) => (b: BalancedCard) => cartepourConcept(b, exclusEchange(brief));

/** Ligne courte d'une mécanique pour la tuile : « Libellé (déclencheur) », et
 *  pour un effet composé sa description (« ✦ à la mort : Pioche 2 cartes. »). */
const resumeMecanique = (m: string) => {
  const d = m.match(/^(.*?) \(déclencheur : ([^)]*)\) : (.*)$/);
  if (d) return d[1] === "Effet composé" ? `✦ ${d[2]} : ${d[3]}` : `${d[1]} (${d[2]})`;
  return m.split(" : ")[0];
};

const ACCUEIL = "Bonjour ! Décrivons le lot à créer. Pour commencer : **combien de cartes**, de quelle **faction**, quelle(s) **race(s)** (et clans éventuels), quels **types** (Unités / Actions), quelle **répartition des raretés**, et s'agit-il d'une **édition limitée** (année) ou d'un **set** (Communes uniquement) ?";

const FREQ_LABEL = { leger: "léger", moyen: "moyen", fort: "fort" } as const;

const S = {
  carte: { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 14 } as React.CSSProperties,
  etiq: { fontSize: 9, color: "#999", letterSpacing: 1.2, fontFamily: "'Cinzel',serif", marginBottom: 8 } as React.CSSProperties,
  bouton: (actif = true): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 6, fontSize: 11, fontFamily: "'Cinzel',serif", cursor: actif ? "pointer" : "default",
    border: "1px solid #6c5ce7", background: actif ? "#6c5ce7" : "#ddd", color: "#fff", opacity: actif ? 1 : 0.6,
  }),
  secondaire: { padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "'Cinzel',serif", cursor: "pointer", border: "1px solid #ccc", background: "#fff", color: "#555" } as React.CSSProperties,
};

/** Rendu minimal du markdown léger des réponses (gras, retours à la ligne). */
function Texte({ t }: { t: string }) {
  return <>{t.split("\n").map((ligne, i) => (
    <div key={i} style={{ minHeight: ligne ? undefined : 6 }}>
      {ligne.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((m, j) => m.startsWith("**") ? <strong key={j}>{m.slice(2, -2)}</strong>
        : m.startsWith("*") && m.endsWith("*") && m.length > 2 ? <em key={j}>{m.slice(1, -1)}</em> : <span key={j}>{m}</span>)}
    </div>
  ))}</>;
}

const nomCapacite = (id: string) => ABILITIES[id]?.creature?.label ?? ABILITIES[id]?.label ?? id;
const parts = (p: Partial<Record<string, number>>) => {
  const e = Object.entries(p).filter(([, v]) => (v ?? 0) > 0);
  const t = e.reduce((s, [, v]) => s + (v ?? 0), 0);
  return e.length ? e.map(([k, v]) => `${k} ${Math.round(((v ?? 0) / t) * 100)} %`).join(" · ") : "—";
};

function Recap({ b }: { b: CardBrief }) {
  const ligne = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", gap: 8, fontSize: 11, padding: "3px 0", borderBottom: "1px solid #f4f4f4" }}>
      <span style={{ width: 150, color: "#888", flexShrink: 0 }}>{k}</span><span style={{ color: "#333" }}>{v}</span>
    </div>
  );
  const pct = b.abilities.reduce((s, a) => s + a.pct, 0);
  const ed = b.edition.kind === "limited" ? `Édition limitée ${b.edition.year}${b.edition.month ? `/${b.edition.month}` : ""}` : b.edition.kind === "set" ? `Set #${b.edition.setId} (Communes)` : "Aucune";
  const c = b.constraints;
  return (
    <div>
      {ligne("Lot", `${b.count} carte${b.count > 1 ? "s" : ""}${b.title ? ` — ${b.title}` : ""}`)}
      {ligne("Faction", b.faction ? getFactionDisplayName(b.faction) : "—")}
      {ligne("Races", b.races.join(", ") || "toutes celles de la faction")}
      {ligne("Clans", b.clans.join(", ") || "au hasard")}
      {ligne("Types", parts(b.types))}
      {ligne("Raretés", parts(b.rarities))}
      {ligne("Courbe de mana", parts(b.manaCurve))}
      {ligne("Édition", ed)}
      {ligne("Capacités", b.abilities.length
        ? <>{b.abilities.map((a) => `${nomCapacite(a.id)} ${Math.round(a.pct)} %`).join(" · ")}{pct < 100 ? ` · reste ${Math.round(100 - pct)} % au hasard (cohérent avec la race)` : ""}</>
        : "100 % au hasard (cohérent avec la race)")}
      {ligne("Déclencheurs", b.triggers.map((t) => `${BRIEF_TRIGGER_LABELS[t.trigger]} : ${FREQ_LABEL[t.freq]}`).join(" · ") || "entrée en jeu")}
      {ligne("Coûts additionnels", b.additionalCosts.map((x) => `${BRIEF_COST_LABELS[x.cost]} : ${FREQ_LABEL[x.freq]} (${Math.round(COST_FREQ_SHARE[x.freq] * 100)} %)`).join(" · ") || "aucun")}
      {ligne("Genre", `M ${b.gender.M} · F ${b.gender.F} · O ${b.gender.O}`)}
      {ligne("Contraintes", [
        c.minMana ? `mana ≥ ${c.minMana}` : "", c.maxMana ? `mana ≤ ${c.maxMana}` : "",
        c.maxAbilitiesPerCard ? `${c.maxAbilitiesPerCard} capacité(s) max` : "",
        c.excludedAbilities?.length ? `sans ${c.excludedAbilities.map(nomCapacite).join(", ")}` : "",
      ].filter(Boolean).join(" · ") || "—")}
      {ligne("Précisions", b.notes || "—")}
    </div>
  );
}

export default function AssistedForge() {
  const [historique, setHistorique] = useState<BriefRow[]>([]);
  const [briefId, setBriefId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [brief, setBrief] = useState<CardBrief>(emptyBrief());
  const [done, setDone] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saisie, setSaisie] = useState("");
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [suivi, setSuivi] = useState<Suivi[]>([]);
  const [planInfo, setPlanInfo] = useState<BatchPlan["quotas"] | null>(null);
  const [planWarnings, setPlanWarnings] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [plan, setPlan] = useState<ConceptPlan | null>(null);
  const [conceptsAttente, setConceptsAttente] = useState<number | "tout" | null>(null);
  const [consigne, setConsigne] = useState("");
  const [modeleImage, setModeleImage] = useState<BulkImageModel>(BULK_IMAGE_MODELS[0].id);
  useEffect(() => {
    try {
      const m = localStorage.getItem("assist.modeleImage");
      if (m && BULK_IMAGE_MODELS.some((x) => x.id === m)) setModeleImage(m as BulkImageModel);
    } catch { /* stockage indisponible : défaut */ }
  }, []);
  const choisirModeleImage = (m: BulkImageModel) => {
    setModeleImage(m);
    try { localStorage.setItem("assist.modeleImage", m); } catch { /* sans effet */ }
  };
  const restantsRef = useRef<{ runId: string; cartes: BalancedCard[]; concepts: (CardConcept | null)[]; lexique: string[]; pris: string[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  const chargerHistorique = useCallback(async () => {
    const d = await fetch("/api/forge/briefs").then((r) => r.json()).catch(() => []);
    if (Array.isArray(d)) setHistorique(d);
  }, []);
  useEffect(() => {
    let vivant = true;
    fetch("/api/forge/briefs").then((r) => r.json()).then((d) => { if (vivant && Array.isArray(d)) setHistorique(d); }).catch(() => {});
    return () => { vivant = false; };
  }, []);
  useEffect(() => { finRef.current?.scrollIntoView({ block: "end" }); }, [messages, attente]);

  const nouveau = () => {
    if (enCours) return;
    setBriefId(null); setMessages([]); setBrief(emptyBrief()); setDone(false); setWarnings([]); setSuivi([]); setPlanInfo(null); setErreur(null); setPlan(null);
    restantsRef.current = null;
  };

  const ouvrir = async (id: number, dupliquer = false) => {
    if (enCours) return;
    const d = await fetch(`/api/forge/briefs?id=${id}`).then((r) => r.json()).catch(() => null);
    if (!d?.brief) return;
    setBriefId(dupliquer ? null : d.id);
    setMessages(Array.isArray(d.chat) ? d.chat : []);
    const { plan: planEnregistre, ...briefSeul } = d.brief as CardBrief & { plan?: ConceptPlan };
    setBrief(briefSeul as CardBrief); setPlan(planEnregistre ?? null);
    setDone(true); setWarnings([]); setErreur(null); setPlanInfo(null);
    restantsRef.current = null;
    setSuivi(dupliquer ? [] : (d.items ?? []).filter((i: { run_id: string }) => i.run_id === d.items?.[0]?.run_id).map((i: { position: number; status: string; card_id: number | null; error: string | null }) => ({
      position: i.position, statut: i.status === "created" ? "ok" : i.status === "error" ? "erreur" : "attente",
      id: i.card_id, nom: d.cards?.find((c: { id: number; name: string }) => c.id === i.card_id)?.name, erreur: i.error ?? undefined,
    })).sort((a: Suivi, b: Suivi) => a.position - b.position));
  };

  const envoyer = async () => {
    const texte = saisie.trim();
    if (!texte || attente) return;
    const fil: Msg[] = [...messages, { role: "user", content: texte }];
    setMessages(fil); setSaisie(""); setAttente(true); setErreur(null);
    try {
      const res = await fetch("/api/forge/brief-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: fil, brief }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? `Erreur ${res.status}`);
      const avertis = (d.warnings ?? []) as string[];
      // Les avertissements du serveur sont recopiés dans le fil : Claude les relit au tour suivant.
      const contenu = avertis.length ? `${d.message}\n\n⚠ ${avertis.join("\n⚠ ")}` : d.message;
      setMessages([...fil, { role: "assistant", content: contenu }]);
      // Brief modifié ⇒ les concepts ne correspondent plus aux cartes.
      if (JSON.stringify(d.brief) !== JSON.stringify(brief)) setPlan(null);
      setBrief(d.brief); setDone(!!d.done); setWarnings(avertis);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
      setMessages(messages); setSaisie(texte);
    } finally {
      setAttente(false);
    }
  };

  const sauverBrief = async (planASauver: ConceptPlan | null = plan): Promise<number | null> => {
    const corps = { title: brief.title, brief, chat: messages, plan: planASauver };
    const res = briefId
      ? await fetch("/api/forge/briefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: briefId, ...corps }) })
      : await fetch("/api/forge/briefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d?.id) { setErreur(d?.error ?? "Enregistrement du brief impossible"); return null; }
    setBriefId(d.id);
    return d.id;
  };

  const executer = async (
    id: number, runId: string, cartes: BalancedCard[], concepts: (CardConcept | null)[], lexique: string[], pris: string[], decalage: number,
  ) => {
    setEnCours(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    for (let i = 0; i < cartes.length; i++) {
      const pos = decalage + i;
      if (ctrl.signal.aborted) { restantsRef.current = { runId, cartes: cartes.slice(i), concepts: concepts.slice(i), lexique, pris }; break; }
      setSuivi((s) => s.map((x) => x.position === pos ? { ...x, statut: "encours" } : x));
      let item: { position: number; card_id: number | null; status: string; error: string | null };
      try {
        const c = concepts[i];
        const r = await creerCarte(cartes[i], brief, pris, ctrl.signal, c ? { concept: c, lexique } : null, modeleImage);
        pris.push(r.name);
        setSuivi((s) => s.map((x) => x.position === pos ? { ...x, statut: "ok", nom: r.name, id: r.id, image: r.imageOk, erreur: r.imageErreur, voix: r.voix } : x));
        item = { position: pos, card_id: r.id, status: "created", error: r.imageOk ? null : (r.imageErreur ?? "Illustration non générée") };
      } catch (e) {
        if (ctrl.signal.aborted) {
          setSuivi((s) => s.map((x) => x.position === pos ? { ...x, statut: "attente" } : x));
          restantsRef.current = { runId, cartes: cartes.slice(i), concepts: concepts.slice(i), lexique, pris };
          break;
        }
        const msg = e instanceof Error ? e.message : "Erreur";
        setSuivi((s) => s.map((x) => x.position === pos ? { ...x, statut: "erreur", erreur: msg } : x));
        item = { position: pos, card_id: null, status: "error", error: msg };
      }
      await fetch("/api/forge/briefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ briefId: id, runId, items: [item] }) }).catch(() => {});
      if (i === cartes.length - 1) restantsRef.current = null;
    }
    setEnCours(false);
    abortRef.current = null;
    void chargerHistorique();
  };

  /** Étape Concepts : tout le lot (nouveau tirage), avec une consigne éventuelle. */
  const proposerConcepts = async () => {
    if (enCours || conceptsAttente) return;
    setErreur(null); setConceptsAttente("tout");
    try {
      const seed = nouveauSeed();
      const { cartes } = cartesDuLot(brief, seed);
      const res = await fetch("/api/forge/concepts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, cards: cartes.map(pourConcepts(brief)), consigne }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? `Erreur ${res.status}`);
      const nouveau: ConceptPlan = { seed, lexique: d.lexique ?? [], concepts: d.concepts ?? [] };
      setPlan(nouveau);
      await sauverBrief(nouveau);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setConceptsAttente(null);
    }
  };

  /** Régénère le concept d'UNE carte, les autres en contexte. */
  const regenererConcept = async (i: number) => {
    if (!plan || enCours || conceptsAttente) return;
    setErreur(null); setConceptsAttente(i);
    try {
      const { cartes } = cartesDuLot(brief, plan.seed);
      const res = await fetch("/api/forge/concepts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, cards: cartes.map(pourConcepts(brief)), consigne, index: i, concepts: plan.concepts, lexique: plan.lexique }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? `Erreur ${res.status}`);
      setPlan((p) => p && { ...p, concepts: p.concepts.map((c, j) => (j === i ? d.concept : c)) });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setConceptsAttente(null);
    }
  };

  const modifierConcept = (i: number, champ: keyof CardConcept, valeur: string) =>
    setPlan((p) => p && { ...p, concepts: p.concepts.map((c, j) => (j === i ? { ...c, [champ]: valeur } : c)) });

  /** ↩ : la carte revient à sa capacité tirée (le memo rééquilibre). */
  const annulerEchange = (i: number) =>
    setPlan((p) => p && { ...p, concepts: p.concepts.map((c, j) => (j === i ? (({ echange: _, ...reste }) => reste)(c) : c)) });

  /** Changer l'échelle remet une nature de sujet compatible. */
  const modifierEchelle = (i: number, echelle: Echelle) =>
    setPlan((p) => p && { ...p, concepts: p.concepts.map((c, j) => (j === i ? { ...c, echelle, subjectKind: kindPourEchelle(echelle, c.subjectKind) } : c)) });

  const lancer = async () => {
    if (enCours) return;
    setErreur(null);
    const id = await sauverBrief();
    if (!id) return;
    const seed = plan?.seed ?? nouveauSeed();
    const base = cartesDuLot(brief, seed);
    const avecPlan = !!plan && plan.concepts.length === base.cartes.length;
    const { plan: lot, cartes } = avecPlan ? cartesDuLot(brief, seed, plan.concepts) : base;
    const concepts = avecPlan ? plan.concepts : cartes.map(() => null);
    setPlanInfo(lot.quotas); setPlanWarnings(lot.warnings);
    setSuivi(cartes.map((c, i) => ({ position: i, statut: "attente", ratio: c.score.ratio, sujet: concepts[i]?.sujet })));
    await executer(id, `run_${Date.now()}`, cartes, concepts, plan?.lexique ?? [], [], 0);
  };

  const reprendre = async () => {
    const r = restantsRef.current;
    if (!r || !briefId || enCours) return;
    const decalage = suivi.length - r.cartes.length;
    await executer(briefId, r.runId, r.cartes, r.concepts, r.lexique, r.pris, decalage);
  };

  // Cartes correspondant aux concepts affichés (même seed).
  const cartesConcepts = useMemo(() => (plan ? cartesDuLot(brief, plan.seed, plan.concepts).cartes : []), [brief, plan]);

  const stats = useMemo(() => ({
    ok: suivi.filter((s) => s.statut === "ok").length,
    err: suivi.filter((s) => s.statut === "erreur").length,
    total: suivi.length,
  }), [suivi]);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Historique */}
      <div style={{ ...S.carte, width: 240, flexShrink: 0, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={S.etiq}>BRIEFS</div>
        <button onClick={nouveau} disabled={enCours} style={{ ...S.secondaire, width: "100%", marginBottom: 10 }}>+ Nouveau brief</button>
        {historique.length === 0 && <div style={{ fontSize: 10, color: "#aaa" }}>Aucun brief enregistré.</div>}
        {historique.map((h) => (
          <div key={h.id} style={{ border: `1px solid ${briefId === h.id ? "#6c5ce7" : "#eee"}`, borderRadius: 6, padding: 8, marginBottom: 6, background: briefId === h.id ? "#f0eeff" : "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#444" }}>{h.title || "Sans titre"}</div>
            <div style={{ fontSize: 9, color: "#999", margin: "2px 0 6px" }}>
              {new Date(h.updated_at).toLocaleDateString("fr-FR")} · {h.brief?.count ?? "?"} prévues · {h.created_cards} créée(s)
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => ouvrir(h.id)} disabled={enCours} style={{ ...S.secondaire, padding: "2px 8px", fontSize: 9 }}>Ouvrir</button>
              <button onClick={() => ouvrir(h.id, true)} disabled={enCours} style={{ ...S.secondaire, padding: "2px 8px", fontSize: 9 }}>Dupliquer</button>
            </div>
          </div>
        ))}
      </div>

      {/* Chat */}
      <div style={{ ...S.carte, flex: 1, minWidth: 340, display: "flex", flexDirection: "column", height: "78vh" }}>
        <div style={S.etiq}>CRÉATION ASSISTÉE — CHAT</div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
          {[{ role: "assistant" as const, content: ACCUEIL }, ...messages].map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", fontSize: 12, lineHeight: 1.5,
              padding: "8px 12px", borderRadius: 10, whiteSpace: "normal",
              background: m.role === "user" ? "#6c5ce7" : "#f4f3fb", color: m.role === "user" ? "#fff" : "#333",
            }}><Texte t={m.content} /></div>
          ))}
          {attente && <div style={{ fontSize: 11, color: "#999" }}>L&apos;assistant réfléchit…</div>}
          <div ref={finRef} />
        </div>
        {erreur && <div style={{ fontSize: 11, color: "#c0392b", margin: "6px 0" }}>{erreur}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <textarea
            value={saisie} onChange={(e) => setSaisie(e.target.value)} disabled={attente || enCours}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void envoyer(); } }}
            placeholder="Votre réponse… (Entrée pour envoyer, Maj+Entrée pour un retour à la ligne)"
            rows={2} style={{ flex: 1, fontSize: 12, padding: 8, borderRadius: 6, border: "1px solid #ddd", resize: "vertical", fontFamily: "inherit" }}
          />
          <button onClick={envoyer} disabled={attente || enCours || !saisie.trim()} style={S.bouton(!attente && !enCours && !!saisie.trim())}>Envoyer</button>
        </div>
      </div>

      {/* Récapitulatif + exécution */}
      <div style={{ ...S.carte, width: 380, flexShrink: 0, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={S.etiq}>RÉCAPITULATIF DU BRIEF {done ? "· COMPLET" : "· EN COURS"}</div>
        <Recap b={brief} />
        {warnings.length > 0 && <div style={{ fontSize: 10, color: "#e08a00", marginTop: 8 }}>{warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={proposerConcepts} disabled={!done || enCours || !brief.faction || !!conceptsAttente} style={S.bouton(done && !enCours && !!brief.faction && !conceptsAttente)}>
            {conceptsAttente === "tout" ? "Concepts en cours…" : plan ? "Tout régénérer" : "Proposer les concepts"}
          </button>
          <button onClick={lancer} disabled={!done || enCours || !brief.faction || !!conceptsAttente} style={plan ? S.bouton(done && !enCours && !!brief.faction && !conceptsAttente) : S.secondaire}>
            Lancer {brief.count} carte{brief.count > 1 ? "s" : ""}{plan ? "" : " sans concepts"}
          </button>
          <label style={{ fontSize: 10, color: "#555", display: "flex", alignItems: "center", gap: 4 }}>
            Image
            <select value={modeleImage} onChange={(e) => choisirModeleImage(e.target.value as BulkImageModel)} disabled={enCours}
              style={{ fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1px solid #ddd" }}>
              {BULK_IMAGE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          {enCours && <button onClick={() => abortRef.current?.abort()} style={{ ...S.secondaire, color: "#c0392b", borderColor: "#e6b0aa" }}>Arrêter</button>}
          {!enCours && restantsRef.current && <button onClick={reprendre} style={S.secondaire}>Reprendre ({restantsRef.current.cartes.length})</button>}
        </div>
        <div style={{ fontSize: 9, color: "#aaa", marginTop: 6 }}>
          {BRIEF_MAX_CARDS} cartes max. Chaque carte : texte, illustration, enregistrement en Brouillon (≈ 30 s). Gardez l&apos;onglet ouvert.
        </div>
        {done && (
          <input value={consigne} onChange={(e) => setConsigne(e.target.value)} disabled={!!conceptsAttente || enCours}
            placeholder="Consigne pour les concepts (ex. « plus de créatures, moins de guerriers »)"
            style={{ width: "100%", marginTop: 8, fontSize: 11, padding: 6, borderRadius: 6, border: "1px solid #ddd", boxSizing: "border-box" }} />
        )}

        {planInfo && planInfo.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 10, color: "#555" }}>
            <div style={S.etiq}>QUOTAS DES CAPACITÉS</div>
            {planInfo.map((q) => <div key={q.id}>{nomCapacite(q.id)} : {q.pose} / {q.demande}</div>)}
            {planWarnings.map((w, i) => <div key={i} style={{ color: "#e08a00" }}>⚠ {w}</div>)}
          </div>
        )}

        {suivi.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={S.etiq}>CARTES — {stats.ok} créée(s) · {stats.err} erreur(s) · {stats.total} prévue(s)</div>
            {suivi.map((s) => (
              <div key={s.position} style={{ display: "flex", gap: 6, fontSize: 10, padding: "3px 0", borderBottom: "1px solid #f4f4f4", alignItems: "center" }}>
                <span style={{ width: 20, color: "#aaa" }}>{s.position + 1}</span>
                <span style={{ width: 16 }}>{s.statut === "ok" ? "✅" : s.statut === "erreur" ? "❌" : s.statut === "encours" ? "⏳" : "·"}</span>
                <span style={{ flex: 1, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.erreur ?? s.sujet}>
                  {s.nom ?? (s.statut === "erreur" ? s.erreur : s.sujet ? <span style={{ color: "#999" }}>{s.sujet}</span> : "")}{s.statut === "ok" && s.image === false ? <span title={s.erreur ?? undefined} style={{ color: "#e08a00" }}> (sans image)</span> : ""}{s.voix ? <span title={`Voix : « ${s.voix} »`} style={{ color: "#888" }}> 🔊</span> : ""}
                </span>
                {s.ratio != null && <span style={{ color: Math.abs(s.ratio - 1) <= 0.05 ? "#27ae60" : "#e08a00" }}>{Math.round(s.ratio * 100)} %</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Concepts */}
      {plan && cartesConcepts.length > 0 && (
        <div style={{ ...S.carte, width: "100%" }}>
          <div style={S.etiq}>CONCEPTS — {plan.concepts.length} carte(s){plan.concepts.length !== cartesConcepts.length ? " · ⚠ ne correspond plus au lot, régénérez" : ""}</div>
          {plan.lexique.length > 0 && <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}><strong>Lexique du lot :</strong> {plan.lexique.join(" · ")}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>
            {plan.concepts.map((c, i) => {
              const b = cartesConcepts[i];
              const champ = (k: keyof CardConcept, label: string, lignes = 1) => (
                <label style={{ display: "block", fontSize: 9, color: "#999", marginTop: 4 }}>{label}
                  <textarea value={String(c[k] ?? "")} rows={lignes} disabled={enCours || conceptsAttente === i}
                    onChange={(e) => modifierConcept(i, k, e.target.value)}
                    style={{ display: "block", width: "100%", boxSizing: "border-box", fontSize: 11, padding: 4, borderRadius: 4, border: "1px solid #e4e4e4", resize: "vertical", fontFamily: "inherit", color: "#333" }} />
                </label>
              );
              const types = b?.plan.type === "Unité" ? SUBJECT_KINDS_UNITE : SUBJECT_KINDS;
              const echelles = b?.plan.type === "Unité" ? ECHELLES_UNITE : ECHELLES_ACTION;
              return (
                <div key={i} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, opacity: conceptsAttente === i ? 0.5 : 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: "#555" }}>
                    <strong>#{i + 1}</strong>
                    <span>{b ? `${b.plan.type} ${b.plan.rarity} · ${b.plan.mana} mana${b.plan.type === "Unité" ? ` · ${b.attack}/${b.health} · ${b.plan.gender}` : ""}` : "—"}</span>
                    <span style={{ flex: 1 }} />
                    <select value={c.echelle ?? ""} disabled={enCours} onChange={(e) => modifierEchelle(i, e.target.value as Echelle)} title="Échelle de la scène" style={{ fontSize: 10 }}>
                      {!c.echelle && <option value="">échelle libre</option>}
                      {echelles.map((e) => <option key={e} value={e}>{ECHELLE_LABELS[e]}</option>)}
                    </select>
                    <select value={c.subjectKind} disabled={enCours} onChange={(e) => modifierConcept(i, "subjectKind", e.target.value)} style={{ fontSize: 10 }}>
                      {types.map((k) => <option key={k} value={k}>{SUBJECT_KIND_LABELS[k]}</option>)}
                    </select>
                    <button onClick={() => regenererConcept(i)} disabled={enCours || !!conceptsAttente} title="Régénérer ce concept" style={{ ...S.secondaire, padding: "1px 7px" }}>↻</button>
                  </div>
                  {b && <div style={{ fontSize: 9, color: "#999", margin: "3px 0" }}>{cartepourConcept(b).mechanics.map(resumeMecanique).join(" · ")}</div>}
                  {c.echange && b?.plan.abilities.includes(c.echange.vers) && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: "#6b3fa0", margin: "2px 0 4px" }}>
                      <span style={{ flex: 1 }}>↪ {labelUnite(c.echange.de) ?? c.echange.de} → <strong>{labelUnite(c.echange.vers) ?? c.echange.vers}</strong>{c.echange.raison ? ` — ${c.echange.raison}` : ""}</span>
                      <button onClick={() => annulerEchange(i)} disabled={enCours} title="Revenir à la capacité d'origine" style={{ ...S.secondaire, padding: "1px 7px" }}>↩</button>
                    </div>
                  )}
                  {champ("sujet", "Sujet", 2)}
                  {champ("scene", "Scène")}
                  {champ("cadrage", "Cadrage")}
                  {champ("moment", "Moment et météo")}
                  {champ("tenue", "Tenue")}
                  {champ("ideeNom", `Idée de nom (${c.formeNom || "forme libre"})`)}
                  {champ("formeAmbiance", `Texte d'ambiance${c.ton ? ` (ton ${c.ton})` : ""}`)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
