"use client";

// Page /admin/simulator — les bots jouent les DECKS EXISTANTS (comptes admin et
// testeur) : test ciblé (un deck contre des adversaires), historique des tests,
// et grand lot « tous contre tous » qui alimente l'écran d'Équilibrage.
// Les parties tournent dans des Web Workers (pool-workers.ts) ; on ne stocke
// qu'une ligne par test (sim_tests), une partie se rejoue depuis sa graine.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "@/lib/game/types";
import {
  POLICY, agregerTest, planDuLot, planDuTest, relire, stocker,
  type CatalogueSim, type DeckFige, type PartieJouee, type PartieStockee, type ResultatsTest,
} from "@/lib/sim/deck-test";
import { lignesLot } from "@/lib/sim/lot-rows";
import { creerPool, type Pool } from "@/lib/sim/pool-workers";
import type { EntreeJournal } from "@/lib/sim/simulate";

interface Chargement { catalogue: CatalogueSim; decks: DeckFige[]; empreinte: string }
interface TestLigne {
  id: number; created_at: string; kind: "cible" | "lot"; label: string | null; status: string;
  catalogue_hash: string; config: { teste?: number; adversaires?: number[]; parAdversaire?: number; parPaire?: number; graine?: number };
  total?: ResultatsTest["total"] | null;
}
interface TestComplet extends TestLigne { decks: DeckFige[]; results: ResultatsTest | null; games: PartieStockee[] }

const C = {
  fond: "#0f0f1e", carte: "#1a1a2e", bord: "#3d3d5c", texte: "#ddd", doux: "#888", or: "#c8a84e", vert: "#2ecc71", rouge: "#e74c3c", violet: "#8e6cc9",
};
const S = {
  bloc: { background: C.carte, border: `1px solid ${C.bord}`, borderRadius: 6, padding: 16, marginBottom: 16 } as React.CSSProperties,
  titre: { margin: "0 0 10px", color: C.or, fontFamily: "var(--font-cinzel), serif", fontSize: 15 } as React.CSSProperties,
  bouton: (actif = true, couleur = C.or) => ({
    background: actif ? couleur : "#2a2a3e", color: actif ? "#1a1a2e" : "#666", border: "none", borderRadius: 4,
    padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: actif ? "pointer" : "not-allowed",
  }) as React.CSSProperties,
  secondaire: { background: "transparent", color: C.texte, border: `1px solid ${C.bord}`, borderRadius: 4, padding: "5px 10px", fontSize: 12, cursor: "pointer" } as React.CSSProperties,
  select: { background: "#2a2a3e", color: "#fff", border: `1px solid ${C.bord}`, borderRadius: 4, padding: "5px 8px", fontSize: 12 } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 } as React.CSSProperties,
  th: { textAlign: "left", color: C.doux, fontWeight: 600, borderBottom: `1px solid ${C.bord}`, padding: "4px 6px" } as React.CSSProperties,
  td: { borderBottom: "1px solid #26263a", padding: "4px 6px", color: C.texte } as React.CSSProperties,
};
const pct = (x: number) => `${Math.round(100 * x)} %`;
const couleurTaux = (x: number) => (x >= 0.55 ? C.vert : x <= 0.45 ? C.rouge : C.texte);
const libelleDeck = (d: DeckFige) => `${d.name} — ${d.clans.join(" / ") || "sans clan"} (${d.owner})`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return j as T;
}

/** Sélecteur de deck groupé par faction. */
function ChoixDeck({ decks, valeur, onChange }: { decks: DeckFige[]; valeur: number | null; onChange: (id: number) => void }) {
  const parFaction = useMemo(() => {
    const m = new Map<string, DeckFige[]>();
    for (const d of decks) { const f = d.faction ?? "—"; m.set(f, [...(m.get(f) ?? []), d]); }
    return [...m];
  }, [decks]);
  return (
    <select value={valeur ?? ""} onChange={(e) => onChange(Number(e.target.value))} style={{ ...S.select, minWidth: 360 }}>
      <option value="" disabled>— Deck à tester —</option>
      {parFaction.map(([f, ds]) => (
        <optgroup key={f} label={f}>{ds.map((d) => <option key={d.id} value={d.id}>{libelleDeck(d)}</option>)}</optgroup>
      ))}
    </select>
  );
}

/** Résultats d'un test ciblé (en direct ou rouvert depuis l'historique). */
function Resultats({ r, decks, cartes, games, perime, pool }: {
  r: ResultatsTest; decks: DeckFige[]; cartes: Map<number, Card>; games: PartieStockee[]; perime: boolean; pool: Pool | null;
}) {
  const nom = (id: number) => decks.find((d) => d.id === id)?.name ?? `#${id}`;
  const [journal, setJournal] = useState<{ k: number; lignes: EntreeJournal[] } | null>(null);
  const [erreurJournal, setErreurJournal] = useState<string | null>(null);
  const [voirToutes, setVoirToutes] = useState(false);
  const cartesTriees = r.cartes.filter((c) => decks[0]?.cards.some((x) => x.card_id === c.cardId) || c.jouee > 0);
  const teste = decks[0]?.id;

  const ouvrirJournal = async (g: PartieStockee) => {
    if (!pool) return;
    setErreurJournal(null);
    try {
      const { journal: lignes } = await pool.journal(relire(g));
      setJournal({ k: g[0], lignes });
    } catch (e) { setErreurJournal((e as Error).message); }
  };

  return (
    <>
      <div style={S.bloc}>
        <h3 style={S.titre}>Résultat global</h3>
        <div style={{ fontSize: 26, fontWeight: 700, color: couleurTaux(r.total.taux) }}>
          {pct(r.total.taux)} <span style={{ fontSize: 13, color: C.doux, fontWeight: 400 }}>
            ({r.total.v} / {r.total.n}, intervalle {pct(r.total.ic[0])} – {pct(r.total.ic[1])})</span>
        </div>
        <div style={{ fontSize: 12, color: C.doux, marginTop: 6 }}>
          Quand il commence : {pct(r.commence.taux)} ({r.commence.n}) · en second : {pct(r.second.taux)} ({r.second.n})
          {r.sansVainqueur ? ` · ${r.sansVainqueur} partie(s) sans vainqueur` : ""}{r.incidents ? ` · ${r.incidents} incident(s) moteur` : ""}
        </div>
      </div>

      <div style={S.bloc}>
        <h3 style={S.titre}>Par adversaire</h3>
        <table style={S.table}><thead><tr><th style={S.th}>Adversaire</th><th style={S.th}>Victoires</th><th style={S.th}>Taux</th><th style={S.th}>Intervalle à 95 %</th></tr></thead>
          <tbody>{r.parAdversaire.map((a) => (
            <tr key={a.deckId}><td style={S.td}>{nom(a.deckId)}</td><td style={S.td}>{a.v} / {a.n}</td>
              <td style={{ ...S.td, color: couleurTaux(a.taux), fontWeight: 700 }}>{pct(a.taux)}</td><td style={{ ...S.td, color: C.doux }}>{pct(a.ic[0])} – {pct(a.ic[1])}</td></tr>
          ))}</tbody></table>
      </div>

      <div style={S.bloc}>
        <h3 style={S.titre}>Apport de chaque carte</h3>
        <div style={{ fontSize: 11, color: C.doux, marginBottom: 8 }}>
          Taux de victoire du deck dans les parties où la carte a été jouée, comparé aux autres parties. Peu de parties ⇒ écart peu fiable (grisé sous 5).
        </div>
        <table style={S.table}><thead><tr>
          <th style={S.th}>Carte</th><th style={S.th}>Piochée</th><th style={S.th}>Jouée</th><th style={S.th}>Quand jouée</th><th style={S.th}>Sinon</th><th style={S.th}>Écart</th>
        </tr></thead>
          <tbody>{cartesTriees.map((c) => {
            const faible = c.jouee < 5;
            return (
              <tr key={c.cardId} style={{ opacity: faible ? 0.5 : 1 }}>
                <td style={S.td}>{cartes.get(c.cardId)?.name ?? `#${c.cardId}`}</td>
                <td style={S.td}>{c.piochee} / {r.total.n}</td><td style={S.td}>{c.jouee}{c.poses > c.jouee ? ` (${c.poses} poses)` : ""}</td>
                <td style={S.td}>{c.jouee ? pct(c.quandJouee.taux) : "—"}</td><td style={S.td}>{pct(c.sinon.taux)}</td>
                <td style={{ ...S.td, fontWeight: 700, color: c.jouee ? (c.ecart > 0.05 ? C.vert : c.ecart < -0.05 ? C.rouge : C.texte) : C.doux }}>
                  {c.jouee ? `${c.ecart > 0 ? "+" : ""}${Math.round(100 * c.ecart)}` : "jamais jouée"}
                </td>
              </tr>
            );
          })}</tbody></table>
      </div>

      <div style={S.bloc}>
        <h3 style={S.titre}>Mécaniques du deck testé</h3>
        <div style={{ fontSize: 12, color: C.texte, lineHeight: 1.8 }}>
          {Object.entries(r.mecaniques.compteurs).map(([k, x]) => x && (
            <div key={k}>{k} — dans {x.parties} partie(s) : {(x.gagne / x.parties).toFixed(1)} gagnés, {(x.depense / x.parties).toFixed(1)} dépensés en {(x.depenses / x.parties).toFixed(1)} fois, {(x.reste / x.parties).toFixed(1)} laissés ; dépense dans {pct(x.avecDepense / x.parties)} des parties</div>
          ))}
          {r.mecaniques.objets.recus > 0 && <div>Objets : {r.mecaniques.objets.recus} reçus, {r.mecaniques.objets.poses} posés, {r.mecaniques.objets.equipes} équipés, {r.mecaniques.objets.inutilises} inutilisés</div>}
          {r.mecaniques.etincelle.recue > 0 && <div>Étincelle de mana : reçue {r.mecaniques.etincelle.recue} fois, jouée {r.mecaniques.etincelle.jouee}, mana perdu {r.mecaniques.etincelle.manaPerdu}</div>}
          {!Object.keys(r.mecaniques.compteurs).length && !r.mecaniques.objets.recus && !r.mecaniques.etincelle.recue && <div style={{ color: C.doux }}>Aucune mécanique à compteur utilisée.</div>}
        </div>
      </div>

      <div style={S.bloc}>
        <h3 style={S.titre}>Parties</h3>
        {perime && <div style={{ fontSize: 12, color: "#e08a00", marginBottom: 8 }}>⚠ Des cartes ont changé depuis ce test : le rejeu peut différer de la partie jouée.</div>}
        {erreurJournal && <div style={{ fontSize: 12, color: C.rouge, marginBottom: 8 }}>{erreurJournal}</div>}
        <table style={S.table}><thead><tr><th style={S.th}>#</th><th style={S.th}>Adversaire</th><th style={S.th}>Siège</th><th style={S.th}>Commence</th><th style={S.th}>Issue</th><th style={S.th}>Tours</th><th style={S.th}></th></tr></thead>
          <tbody>{(voirToutes ? games : games.slice(0, 40)).map((g) => {
            const siege = g[1] === teste ? 0 : 1;
            const issue = g[5] === -1 ? "—" : g[5] === siege ? "victoire" : "défaite";
            return (
              <tr key={g[0]}>
                <td style={S.td}>{g[0]}</td><td style={S.td}>{nom(siege === 0 ? g[2] : g[1])}</td><td style={S.td}>J{siege + 1}</td>
                <td style={S.td}>{g[4] === siege ? "oui" : "non"}</td>
                <td style={{ ...S.td, color: issue === "victoire" ? C.vert : issue === "défaite" ? C.rouge : C.doux }}>{issue}</td>
                <td style={S.td}>{g[6]}</td>
                <td style={S.td}><button style={S.secondaire} disabled={!pool} onClick={() => ouvrirJournal(g)}>Journal</button></td>
              </tr>
            );
          })}</tbody></table>
        {games.length > 40 && !voirToutes && <button style={{ ...S.secondaire, marginTop: 8 }} onClick={() => setVoirToutes(true)}>Voir les {games.length} parties</button>}
      </div>

      {journal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setJournal(null)}>
          <div style={{ ...S.bloc, maxWidth: 900, width: "100%", maxHeight: "85vh", overflow: "auto", margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={S.titre}>Journal de la partie #{journal.k}</h3>
              <button style={S.secondaire} onClick={() => setJournal(null)}>Fermer</button>
            </div>
            <table style={S.table}><thead><tr><th style={S.th}>Tour</th><th style={S.th}>Joueur</th><th style={S.th}>Coup</th><th style={S.th}>PV</th><th style={S.th}>Plateau J1</th><th style={S.th}>Plateau J2</th></tr></thead>
              <tbody>{journal.lignes.map((l, i) => (
                <tr key={i}><td style={S.td}>{l.tour}</td><td style={S.td}>J{l.joueur + 1}</td><td style={S.td}>{l.coup}</td><td style={S.td}>{l.pv[0]} / {l.pv[1]}</td>
                  <td style={{ ...S.td, fontSize: 11, color: C.doux }}>{l.plateau[0].join(", ")}</td><td style={{ ...S.td, fontSize: 11, color: C.doux }}>{l.plateau[1].join(", ")}</td></tr>
              ))}</tbody></table>
          </div>
        </div>
      )}
    </>
  );
}

export default function SimulatorPanel() {
  const [donnees, setDonnees] = useState<Chargement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<"test" | "historique" | "lot">("test");
  const [pool, setPool] = useState<Pool | null>(null);
  const [historique, setHistorique] = useState<TestLigne[]>([]);

  // Test ciblé
  const [teste, setTeste] = useState<number | null>(null);
  const [adversaires, setAdversaires] = useState<Set<number>>(new Set());
  const [parAdversaire, setParAdversaire] = useState(20);
  const [filtre, setFiltre] = useState("");
  const [enCours, setEnCours] = useState<{ fait: number; total: number } | null>(null);
  const [courant, setCourant] = useState<TestComplet | null>(null);
  const arret = useRef(false);

  // Grand lot
  const [parPaire, setParPaire] = useState(10);

  const cartes = useMemo(() => new Map((donnees?.catalogue.cards ?? []).map((c) => [c.id, c])), [donnees]);
  const decksParId = useMemo(() => new Map((donnees?.decks ?? []).map((d) => [d.id, d])), [donnees]);

  const chargerHistorique = useCallback(async () => {
    try { setHistorique(await api<TestLigne[]>("/api/admin/sim/tests")); } catch (e) { setErreur((e as Error).message); }
  }, []);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const d = await api<Chargement>("/api/admin/sim/catalogue");
        if (!vivant) return;
        setDonnees(d);
        const p = await creerPool(d.catalogue, d.decks);
        if (!vivant) { p.arreter(); return; }
        setPool(p);
      } catch (e) { if (vivant) setErreur((e as Error).message); }
    })();
    chargerHistorique();
    return () => { vivant = false; };
  }, [chargerHistorique]);
  useEffect(() => () => pool?.arreter(), [pool]);

  const deckTeste = teste != null ? decksParId.get(teste) ?? null : null;
  const candidats = (donnees?.decks ?? []).filter((d) => d.id !== teste && (!filtre || libelleDeck(d).toLowerCase().includes(filtre.toLowerCase())));
  const basculer = (id: number) => setAdversaires((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const choisirAdv = (ids: number[]) => setAdversaires(new Set(ids));

  /** Lance un test ciblé : crée la ligne, joue, met à jour en direct, enregistre. */
  const lancerTest = async () => {
    if (!donnees || !pool || teste == null || !adversaires.size) return;
    setErreur(null);
    arret.current = false;
    const advs = [...adversaires];
    const decks = [decksParId.get(teste)!, ...advs.map((id) => decksParId.get(id)!)];
    const graine = Math.floor(Math.random() * 1e6) * 1000;
    const config = { teste, adversaires: advs, parAdversaire, graine };
    const plan = planDuTest(teste, advs, parAdversaire, graine);
    const label = `${decks[0].name} contre ${advs.length} deck(s)`;
    try {
      const { id } = await api<{ id: number }>("/api/admin/sim/tests", {
        method: "POST", body: JSON.stringify({ kind: "cible", label, policy: POLICY, catalogue_hash: donnees.empreinte, config, decks }),
      });
      const parties: PartieJouee[] = [];
      const base: TestComplet = { id, created_at: new Date().toISOString(), kind: "cible", label, status: "en_cours", catalogue_hash: donnees.empreinte, config, decks, results: null, games: [] };
      setCourant(base);
      setEnCours({ fait: 0, total: plan.length });
      let dernier = 0;
      await pool.jouer(plan, (p) => {
        if (arret.current) return;
        parties.push(p);
        if (parties.length - dernier >= 10 || parties.length === plan.length) {
          dernier = parties.length;
          const games = [...parties].sort((a, b) => a.k - b.k).map(stocker);
          setCourant({ ...base, results: agregerTest(teste, parties), games });
          setEnCours({ fait: parties.length, total: plan.length });
        }
      }, (k, m) => setErreur(`partie ${k} : ${m}`));
      const results = agregerTest(teste, parties);
      const games = [...parties].sort((a, b) => a.k - b.k).map(stocker);
      const status = arret.current || parties.length < plan.length ? "interrompu" : "fini";
      await api("/api/admin/sim/tests", { method: "PATCH", body: JSON.stringify({ id, status, results, games }) });
      setCourant({ ...base, status, results, games });
    } catch (e) { setErreur((e as Error).message); }
    setEnCours(null);
    chargerHistorique();
  };

  const ouvrir = async (id: number) => {
    try { setCourant(await api<TestComplet>(`/api/admin/sim/tests?id=${id}`)); setOnglet("test"); } catch (e) { setErreur((e as Error).message); }
  };
  const supprimer = async (t: TestLigne) => {
    if (!confirm(`Supprimer « ${t.label ?? t.id} » ?`)) return;
    try { await api("/api/admin/sim/tests", { method: "DELETE", body: JSON.stringify({ id: t.id }) }); if (courant?.id === t.id) setCourant(null); chargerHistorique(); }
    catch (e) { setErreur((e as Error).message); }
  };

  /** Grand lot : tous contre tous, reprise des parties déjà enregistrées. */
  const lancerLot = async (reprise?: TestLigne) => {
    if (!donnees || !pool) return;
    setErreur(null);
    arret.current = false;
    try {
      let id: number, decks: DeckFige[], config: TestLigne["config"];
      if (reprise) {
        const t = await api<TestComplet>(`/api/admin/sim/tests?id=${reprise.id}`);
        id = t.id; decks = t.decks; config = t.config;
        await api("/api/admin/sim/tests", { method: "PATCH", body: JSON.stringify({ id, status: "en_cours" }) });
      } else {
        decks = donnees.decks;
        config = { parPaire, graine: 1_000_000 };
        ({ id } = await api<{ id: number }>("/api/admin/sim/tests", {
          method: "POST", body: JSON.stringify({ kind: "lot", label: `Tous contre tous — ${decks.length} decks × ${parPaire}`, policy: POLICY, catalogue_hash: donnees.empreinte, config, decks }),
        }));
      }
      const plan = planDuLot(decks.map((d) => d.id), config.parPaire ?? 10, config.graine ?? 1_000_000);
      const { faits } = await api<{ faits: number[] }>(`/api/admin/sim/lot?testId=${id}`);
      const dejaFaits = new Set(faits);
      const reste = plan.filter((p) => !dejaFaits.has(p.k));
      const parDeck = new Map(decks.map((d) => [d.id, d]));
      let tampon: ReturnType<typeof lignesLot> = [];
      let fait = plan.length - reste.length;
      setEnCours({ fait, total: plan.length });
      const envois: Promise<unknown>[] = [];
      const vider = () => {
        if (!tampon.length) return;
        const rows = tampon; tampon = [];
        envois.push(api("/api/admin/sim/lot", { method: "POST", body: JSON.stringify({ testId: id, rows }) }).catch((e) => setErreur((e as Error).message)));
      };
      await pool.jouer(reste, (p) => {
        if (arret.current) return;
        tampon.push(...lignesLot(id, p, parDeck));
        fait++;
        if (tampon.length >= 400) vider();
        if (fait % 20 === 0) setEnCours({ fait, total: plan.length });
      });
      vider();
      await Promise.all(envois);
      const status = arret.current || fait < plan.length ? "interrompu" : "fini";
      await api("/api/admin/sim/tests", { method: "PATCH", body: JSON.stringify({ id, status, results: { parties: fait } }) });
    } catch (e) { setErreur((e as Error).message); }
    setEnCours(null);
    chargerHistorique();
  };

  const arreter = () => { arret.current = true; pool?.annuler(); };
  const occupe = !!enCours;
  const lots = historique.filter((t) => t.kind === "lot");

  return (
    <div style={{ padding: 24, color: C.texte, maxWidth: 1200 }}>
      <h1 style={{ margin: 0, color: C.or, fontFamily: "var(--font-cinzel), serif" }}>Simulateur</h1>
      <div style={{ color: C.doux, fontSize: 13, margin: "4px 0 16px" }}>
        {donnees ? `${donnees.decks.length} decks (comptes admin et testeur) · ${pool ? `${pool.taille} processus de calcul` : "préparation des processus…"} · bot ${POLICY}` : "Chargement du catalogue…"}
      </div>
      {erreur && <div style={{ background: "#3a1a1a", color: C.rouge, padding: 10, borderRadius: 4, marginBottom: 12, fontSize: 13 }}>{erreur}</div>}

      <nav style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {([["test", "Test ciblé"], ["historique", `Historique (${historique.filter((t) => t.kind === "cible").length})`], ["lot", "Grand lot"]] as const).map(([id, l]) => (
          <button key={id} onClick={() => setOnglet(id)} style={{ ...S.secondaire, background: onglet === id ? C.or : C.carte, color: onglet === id ? "#1a1a2e" : C.texte, fontWeight: 700 }}>{l}</button>
        ))}
      </nav>

      {enCours && (
        <div style={{ ...S.bloc, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 8, background: "#2a2a3e", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(100 * enCours.fait) / enCours.total}%`, height: "100%", background: C.violet }} />
          </div>
          <span style={{ fontSize: 12 }}>{enCours.fait} / {enCours.total} parties</span>
          <button style={S.secondaire} onClick={arreter}>Arrêter</button>
        </div>
      )}

      {onglet === "test" && donnees && (
        <>
          <div style={S.bloc}>
            <h3 style={S.titre}>Nouveau test</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <ChoixDeck decks={donnees.decks} valeur={teste} onChange={(id) => { setTeste(id); setAdversaires((s) => { const n = new Set(s); n.delete(id); return n; }); }} />
              <label style={{ fontSize: 12 }}>Parties par adversaire{" "}
                <select value={parAdversaire} onChange={(e) => setParAdversaire(Number(e.target.value))} style={S.select}>
                  {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button style={S.bouton(!occupe && !!pool && teste != null && adversaires.size > 0)} disabled={occupe || !pool || teste == null || !adversaires.size} onClick={lancerTest}>
                Lancer {adversaires.size ? `(${adversaires.size * parAdversaire} parties)` : ""}
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.doux }}>Adversaires ({adversaires.size}) :</span>
              <button style={S.secondaire} onClick={() => choisirAdv(candidats.map((d) => d.id))}>Tous</button>
              <button style={S.secondaire} onClick={() => choisirAdv([])}>Aucun</button>
              {deckTeste && <button style={S.secondaire} onClick={() => choisirAdv(candidats.filter((d) => d.faction === deckTeste.faction).map((d) => d.id))}>Même faction</button>}
              {deckTeste && <button style={S.secondaire} onClick={() => choisirAdv(candidats.filter((d) => d.faction !== deckTeste.faction).map((d) => d.id))}>Autres factions</button>}
              <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Filtrer (nom, clan, propriétaire)" style={{ ...S.select, minWidth: 220 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 4, maxHeight: 260, overflow: "auto" }}>
              {candidats.map((d) => (
                <label key={d.id} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", cursor: "pointer", color: adversaires.has(d.id) ? "#fff" : C.doux }}>
                  <input type="checkbox" checked={adversaires.has(d.id)} onChange={() => basculer(d.id)} />
                  <span><b>{d.name}</b> · {d.faction} · {d.clans.join(" / ") || "sans clan"} <span style={{ color: "#666" }}>({d.owner})</span></span>
                </label>
              ))}
            </div>
          </div>

          {courant?.results && (
            <>
              <div style={{ fontSize: 13, color: C.doux, marginBottom: 8 }}>
                {courant.label} · {new Date(courant.created_at).toLocaleString("fr-FR")} · {courant.status === "en_cours" ? "en cours" : courant.status}
              </div>
              <Resultats r={courant.results} decks={courant.decks} cartes={cartes} games={courant.games} perime={courant.catalogue_hash !== donnees.empreinte} pool={pool} />
            </>
          )}
        </>
      )}

      {onglet === "historique" && (
        <div style={S.bloc}>
          <h3 style={S.titre}>Tests passés</h3>
          <div style={{ fontSize: 11, color: C.doux, marginBottom: 8 }}>Les 300 derniers tests ciblés sont conservés.</div>
          <table style={S.table}><thead><tr><th style={S.th}>Date</th><th style={S.th}>Test</th><th style={S.th}>Parties</th><th style={S.th}>Résultat</th><th style={S.th}>État</th><th style={S.th}></th></tr></thead>
            <tbody>{historique.filter((t) => t.kind === "cible").map((t) => (
              <tr key={t.id}>
                <td style={S.td}>{new Date(t.created_at).toLocaleString("fr-FR")}</td>
                <td style={S.td}>{t.label}{donnees && t.catalogue_hash !== donnees.empreinte ? <span title="Des cartes ont changé depuis" style={{ color: "#e08a00" }}> ⚠</span> : null}</td>
                <td style={S.td}>{t.total?.n ?? "—"}</td>
                <td style={{ ...S.td, color: t.total ? couleurTaux(t.total.taux) : C.doux, fontWeight: 700 }}>{t.total ? pct(t.total.taux) : "—"}</td>
                <td style={S.td}>{t.status}</td>
                <td style={S.td}><button style={S.secondaire} onClick={() => ouvrir(t.id)}>Ouvrir</button>{" "}
                  <button style={{ ...S.secondaire, color: C.rouge }} onClick={() => supprimer(t)}>✕</button></td>
              </tr>
            ))}</tbody></table>
        </div>
      )}

      {onglet === "lot" && donnees && (
        <div style={S.bloc}>
          <h3 style={S.titre}>Tous contre tous</h3>
          <div style={{ fontSize: 12, color: C.doux, marginBottom: 12, lineHeight: 1.6 }}>
            Chaque deck affronte tous les autres. Les parties alimentent l&apos;écran d&apos;Équilibrage (mode « Simulées », dernier lot).
            Garder l&apos;onglet ouvert pendant le calcul ; un lot interrompu se reprend là où il s&apos;est arrêté.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <label style={{ fontSize: 12 }}>Parties par paire{" "}
              <select value={parPaire} onChange={(e) => setParPaire(Number(e.target.value))} style={S.select}>
                {[2, 4, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button style={S.bouton(!occupe && !!pool)} disabled={occupe || !pool} onClick={() => lancerLot()}>
              Lancer ({(donnees.decks.length * (donnees.decks.length - 1) / 2) * parPaire} parties)
            </button>
          </div>
          <table style={S.table}><thead><tr><th style={S.th}>Date</th><th style={S.th}>Lot</th><th style={S.th}>État</th><th style={S.th}></th></tr></thead>
            <tbody>{lots.map((t) => (
              <tr key={t.id}>
                <td style={S.td}>{new Date(t.created_at).toLocaleString("fr-FR")}</td><td style={S.td}>{t.label}</td><td style={S.td}>{t.status}</td>
                <td style={S.td}>
                  {t.status !== "fini" && <button style={S.secondaire} disabled={occupe || !pool} onClick={() => lancerLot(t)}>Reprendre</button>}{" "}
                  <button style={{ ...S.secondaire, color: C.rouge }} disabled={occupe} onClick={() => supprimer(t)}>✕</button>
                </td>
              </tr>
            ))}</tbody></table>
        </div>
      )}
    </div>
  );
}
