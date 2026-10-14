"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAllRaces } from "@/lib/card-engine/constants";
import {
  VOICE_GENDERS, VOICE_GENDER_LABELS, VOICE_MIME, clansPourRace, extensionFichier, nomVoix, tousLesClans,
  type VoiceGender, type VoiceSfx,
} from "@/lib/audio/voice-sfx";

/** Bibliothèque des voix d'entrée en jeu.
 *
 *  Simple réserve rangée par race, clan (facultatif) et genre (M, F, N) : rien
 *  en jeu ne la lit, le son d'une carte reste `sfx_play_url` (forge / éditeur).
 *  Import groupé : un lot = une race + un clan + un genre ; le nom est dérivé du
 *  fichier (« Forge_Ardente_Let_them_come_3_M »), un nom déjà présent dans la
 *  race est ignoré, jamais écrasé. */

const MAX_SIZE_MB = 10;
const ALL_RACES = getAllRaces().sort((a, b) => a.localeCompare(b, "fr"));
const ALL_CLANS = tousLesClans();
const SANS_CLAN = "__none";

/** Options de clan : ceux déclarés pour la race d'abord, puis tous les autres
 *  (des Humains vivent aussi à la Cour Écarlate, au Cénacle Nécromant…). */
function OptionsClan({ race, vide }: { race: string; vide: string }) {
  const siens = clansPourRace(race);
  const autres = ALL_CLANS.filter((c) => !siens.includes(c));
  return (
    <>
      <option value="">{vide}</option>
      {siens.length > 0 && <optgroup label="Clans de la race">{siens.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>}
      <optgroup label="Autres clans">{autres.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
    </>
  );
}

const S = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 4, letterSpacing: 1 } as React.CSSProperties,
  hint: { fontSize: 10, color: "#888", marginBottom: 12, lineHeight: 1.5 } as React.CSSProperties,
  sub: { fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#555", margin: "6px 0" } as React.CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f4f4f4" } as React.CSSProperties,
  label: { fontSize: 11, fontFamily: "'Cinzel',serif", color: "#333" } as React.CSSProperties,
  btn: { fontSize: 9, padding: "3px 10px", borderRadius: 4, border: "1px solid #e0e0e0", background: "#fff", color: "#555", cursor: "pointer", fontFamily: "'Cinzel',serif" } as React.CSSProperties,
  select: { fontSize: 10, padding: "3px 6px", borderRadius: 4, border: "1px solid #ddd", color: "#333", background: "#fff" } as React.CSSProperties,
};

interface Ligne { file: File; name: string; statut: "nouveau" | "present" | "invalide" | "importe" | "erreur"; detail?: string }

export default function VoiceSfxManager() {
  const [voix, setVoix] = useState<VoiceSfx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Import
  const [race, setRace] = useState("");
  const [clan, setClan] = useState("");
  const [gender, setGender] = useState<VoiceGender>("M");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [resultats, setResultats] = useState<Record<string, Pick<Ligne, "statut" | "detail">>>({});
  const [importEnCours, setImportEnCours] = useState(false);
  const [survol, setSurvol] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Bibliothèque
  const [filtreRace, setFiltreRace] = useState("");
  const [filtreClan, setFiltreClan] = useState("");
  const [filtreGenre, setFiltreGenre] = useState<"" | VoiceGender>("");
  const [ouvert, setOuvert] = useState<number | null>(null);

  // Association automatique aux unités sans son (paquets de 10, en boucle).
  const [assoc, setAssoc] = useState<{ enCours: boolean; faites: number; restantes: number | null; journal: string[]; erreur?: string }>({ enCours: false, faites: 0, restantes: null, journal: [] });
  const assocStop = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/voice-sfx", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) setVoix(data);
      else setError(data?.error ?? "Lecture impossible");
    } catch { setError("Erreur réseau"); }
  }, []);
  useEffect(() => {
    let vivant = true;
    fetch("/api/voice-sfx", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!vivant) return;
        if (Array.isArray(data)) setVoix(data);
        else setError(data?.error ?? "Lecture impossible");
      })
      .catch(() => { if (vivant) setError("Erreur réseau"); });
    return () => { vivant = false; };
  }, []);

  // Unicité PAR RACE : la même réplique peut exister chez deux races.
  const noms = useMemo(() => new Set(voix.map((v) => `${v.race}|${v.name}`)), [voix]);

  const lignes: Ligne[] = useMemo(() => fichiers.map((file) => {
    const fait = resultats[file.name];
    if (!race) return { file, name: "—", statut: "invalide", detail: "Choisissez une race" };
    const name = nomVoix(race, clan || null, gender, file.name);
    if (fait) return { file, name, ...fait };
    if (!extensionFichier(file.name)) return { file, name, statut: "invalide", detail: "Extension non audio" };
    if (file.size > MAX_SIZE_MB * 1024 * 1024) return { file, name, statut: "invalide", detail: `> ${MAX_SIZE_MB} Mo` };
    return { file, name, statut: noms.has(`${race}|${name}`) ? "present" : "nouveau" };
  }), [fichiers, race, clan, gender, noms, resultats]);

  const aImporter = lignes.filter((l) => l.statut === "nouveau");

  const associerVoix = async () => {
    assocStop.current = false;
    setAssoc({ enCours: true, faites: 0, restantes: null, journal: [] });
    let faites = 0;
    try {
      for (;;) {
        const res = await fetch("/api/voice-sfx/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manquantes: true, limite: 10 }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`);
        const ok = (data.resultats ?? []).filter((r: { replique?: string }) => r.replique);
        faites += ok.length;
        const lignesJournal = ok.map((r: { name: string; replique: string }) => `${r.name} → « ${r.replique} »`);
        setAssoc((a) => ({ ...a, faites, restantes: data.restantes, journal: [...lignesJournal, ...a.journal].slice(0, 200) }));
        // Paquet sans aucune association (erreurs répétées) : on s'arrête plutôt que de boucler.
        if (!data.restantes || ok.length === 0 || assocStop.current) break;
      }
    } catch (e) {
      setAssoc((a) => ({ ...a, erreur: e instanceof Error ? e.message : String(e) }));
    }
    setAssoc((a) => ({ ...a, enCours: false }));
    load();
  };

  const ajouterFichiers = (liste: FileList | null) => {
    if (!liste) return;
    const audio = [...liste].filter((f) => f.type.startsWith("audio/") || extensionFichier(f.name));
    setFichiers((prev) => {
      const vus = new Set(prev.map((f) => f.name));
      return [...prev, ...audio.filter((f) => !vus.has(f.name))];
    });
    setResultats({});
  };

  const importer = async () => {
    setImportEnCours(true);
    setError(null);
    for (const l of aImporter) {
      const corps = JSON.stringify({ race, clan: clan || null, gender, filename: l.file.name });
      const marquer = (statut: Ligne["statut"], detail?: string) =>
        setResultats((r) => ({ ...r, [l.file.name]: { statut, detail } }));
      try {
        const r1 = await fetch("/api/voice-sfx", { method: "POST", headers: { "Content-Type": "application/json" }, body: corps });
        const d1 = await r1.json();
        if (r1.status === 409) { marquer("present", d1.error); continue; }
        if (!r1.ok) { marquer("erreur", d1.error); continue; }
        const ext = extensionFichier(l.file.name) ?? "mp3";
        const put = await fetch(d1.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": l.file.type || VOICE_MIME[ext] || "audio/mpeg", "cache-control": "max-age=31536000" },
          body: l.file,
        });
        if (!put.ok) { marquer("erreur", `Upload échoué (${put.status})`); continue; }
        const r2 = await fetch("/api/voice-sfx", { method: "PUT", headers: { "Content-Type": "application/json" }, body: corps });
        const d2 = await r2.json();
        if (!r2.ok) { marquer(r2.status === 409 ? "present" : "erreur", d2.error); continue; }
        marquer("importe");
      } catch (e) {
        marquer("erreur", e instanceof Error ? e.message : "Erreur réseau");
      }
    }
    await load();
    setImportEnCours(false);
  };

  const modifier = async (v: VoiceSfx, patch: { race?: string; clan?: string | null; gender?: VoiceGender }) => {
    setBusy(v.id);
    setError(null);
    const res = await fetch("/api/voice-sfx", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: v.id, ...patch }) });
    const d = await res.json().catch(() => null);
    if (!res.ok) setError(d?.error ?? `Erreur ${res.status}`);
    await load();
    setBusy(null);
  };

  const supprimer = async (v: VoiceSfx) => {
    if (!confirm(`Supprimer « ${v.name} » et son fichier ?`)) return;
    setBusy(v.id);
    setError(null);
    const res = await fetch("/api/voice-sfx", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: v.id }) });
    const d = await res.json().catch(() => null);
    if (!res.ok) setError(d?.error ?? `Erreur ${res.status}`);
    await load();
    setBusy(null);
  };

  const ecouter = (url: string) => {
    audioRef.current?.pause();
    const el = new Audio(url);
    el.volume = 0.6;
    el.play().catch(() => {});
    audioRef.current = el;
  };

  // Compteurs par race ET clan (« Humains · L'Ordre de l'Aube · 12 M / 4 F »).
  const compteurs = useMemo(() => {
    const m = new Map<string, { race: string; clan: string | null; n: Record<VoiceGender, number> }>();
    for (const v of voix) {
      const k = `${v.race}|${v.clan ?? ""}`;
      const c = m.get(k) ?? { race: v.race, clan: v.clan, n: { M: 0, F: 0, N: 0 } };
      c.n[v.gender] += 1;
      m.set(k, c);
    }
    return [...m.values()].sort((a, b) => a.race.localeCompare(b.race, "fr") || (a.clan ?? "").localeCompare(b.clan ?? "", "fr"));
  }, [voix]);

  const visibles = voix.filter((v) =>
    (!filtreRace || v.race === filtreRace)
    && (!filtreClan || (filtreClan === SANS_CLAN ? !v.clan : v.clan === filtreClan))
    && (!filtreGenre || v.gender === filtreGenre));

  const couleurStatut: Record<Ligne["statut"], string> = {
    nouveau: "#27ae60", present: "#e08a00", invalide: "#c0392b", importe: "#6c5ce7", erreur: "#c0392b",
  };
  const libelleStatut: Record<Ligne["statut"], string> = {
    nouveau: "nouveau", present: "déjà présent", invalide: "invalide", importe: "importé ✓", erreur: "erreur",
  };

  return (
    <div style={{ padding: 20, maxWidth: 1100 }}>
      <div style={S.card}>
        <div style={S.title}>VOIX D&apos;ENTRÉE EN JEU</div>
        <div style={S.hint}>
          Réserve de répliques rangées par race, clan (facultatif, pour distinguer les accents) et genre. Le nom est dérivé du
          fichier : clan + nom du fichier + genre (ex. « Forge_Ardente_Let_them_come_3_M ») ; le clan n&apos;est pas ajouté si le
          fichier commence déjà par lui. Un nom déjà présent dans la race est ignoré. Les unités de la Création assistée reçoivent
          automatiquement la réplique la plus proche de leur carte (même race, clan, genre) ; le bouton ci-dessous fait de même pour
          les unités existantes SANS son (aucun son déjà choisi n&apos;est remplacé).
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "10px 0" }}>
          <button style={S.btn} disabled={assoc.enCours} onClick={associerVoix}>
            {assoc.enCours ? "Association en cours…" : "🔊 Associer les voix aux unités sans son"}
          </button>
          {assoc.enCours && <button style={{ ...S.btn, background: "#888" }} onClick={() => { assocStop.current = true; }}>Arrêter</button>}
          {(assoc.faites > 0 || assoc.restantes !== null) && (
            <span style={{ fontSize: 11, color: "#555" }}>{assoc.faites} associée(s){assoc.restantes ? ` · ${assoc.restantes} restante(s)` : ""}</span>
          )}
          {assoc.erreur && <span style={{ fontSize: 11, color: "#c0392b" }}>{assoc.erreur}</span>}
        </div>
        {assoc.journal.length > 0 && (
          <div style={{ maxHeight: 160, overflowY: "auto", fontSize: 10, color: "#666", marginBottom: 10, lineHeight: 1.6 }}>
            {assoc.journal.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        {/* Import groupé */}
        <div style={S.sub}>IMPORT GROUPÉ</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <select value={race} onChange={(e) => { setRace(e.target.value); setClan(""); setResultats({}); }} style={S.select}>
            <option value="">— Race —</option>
            {ALL_RACES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={clan} onChange={(e) => { setClan(e.target.value); setResultats({}); }} style={S.select} disabled={!race}>
            <OptionsClan race={race} vide="— Commune à la race —" />
          </select>
          {VOICE_GENDERS.map((g) => (
            <button key={g} onClick={() => { setGender(g); setResultats({}); }} style={{
              ...S.btn, background: gender === g ? "#6c5ce7" : "#fff", color: gender === g ? "#fff" : "#555", borderColor: gender === g ? "#6c5ce7" : "#e0e0e0",
            }}>{g} · {VOICE_GENDER_LABELS[g]}</button>
          ))}
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => { e.preventDefault(); setSurvol(false); ajouterFichiers(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${survol ? "#6c5ce7" : "#ddd"}`, borderRadius: 8, padding: 16, textAlign: "center",
            fontSize: 11, color: "#888", cursor: "pointer", background: survol ? "#f0eeff" : "#fafafa", marginBottom: 8,
          }}
        >
          Glissez des fichiers audio ici ou cliquez pour les choisir (mp3, wav, ogg, m4a, webm — {MAX_SIZE_MB} Mo max)
          <input ref={inputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { ajouterFichiers(e.target.files); e.target.value = ""; }} />
        </div>

        {lignes.length > 0 && (
          <>
            <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: "0 8px", marginBottom: 8 }}>
              {lignes.map((l) => (
                <div key={l.file.name} style={{ ...S.row, fontSize: 10 }}>
                  <span style={{ flex: 1, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.file.name}</span>
                  <span style={{ color: "#aaa" }}>→</span>
                  <span style={{ flex: 1, fontWeight: 700, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                  <span style={{ width: 150, color: couleurStatut[l.statut], fontWeight: 700 }} title={l.detail}>
                    {libelleStatut[l.statut]}{l.detail && l.statut !== "present" ? ` — ${l.detail}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                disabled={importEnCours || aImporter.length === 0}
                onClick={importer}
                style={{ ...S.btn, background: aImporter.length && !importEnCours ? "#6c5ce7" : "#ddd", color: "#fff", borderColor: "#6c5ce7" }}
              >
                {importEnCours ? "Import en cours…" : `Importer ${aImporter.length} son${aImporter.length > 1 ? "s" : ""}`}
              </button>
              <button disabled={importEnCours} onClick={() => { setFichiers([]); setResultats({}); }} style={S.btn}>Vider la liste</button>
              <span style={{ fontSize: 10, color: "#888" }}>
                {lignes.filter((l) => l.statut === "importe").length} importé(s) · {lignes.filter((l) => l.statut === "present").length} déjà présent(s)
                · {lignes.filter((l) => l.statut === "erreur" || l.statut === "invalide").length} en erreur
              </span>
            </div>
          </>
        )}
      </div>

      <div style={S.card}>
        <div style={S.sub}>BIBLIOTHÈQUE — {voix.length} SON{voix.length > 1 ? "S" : ""}</div>
        {error && <div style={{ fontSize: 10, color: "#c0392b", marginBottom: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {compteurs.map(({ race: r, clan: cl, n }) => {
            const actif = filtreRace === r && filtreClan === (cl ?? SANS_CLAN);
            return (
              <button key={`${r}|${cl ?? ""}`} onClick={() => {
                if (actif) { setFiltreRace(""); setFiltreClan(""); } else { setFiltreRace(r); setFiltreClan(cl ?? SANS_CLAN); }
              }} style={{ ...S.btn, borderColor: actif ? "#6c5ce7" : "#e0e0e0", color: actif ? "#6c5ce7" : "#555" }}>
                {r} · {cl ?? "commune"} · {VOICE_GENDERS.filter((g) => n[g]).map((g) => `${n[g]} ${g}`).join(" / ")}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={filtreRace} onChange={(e) => setFiltreRace(e.target.value)} style={S.select}>
            <option value="">Toutes les races</option>
            {ALL_RACES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filtreClan} onChange={(e) => setFiltreClan(e.target.value)} style={S.select}>
            <option value="">Tous les clans</option>
            <option value={SANS_CLAN}>— Communes à la race —</option>
            {(filtreRace ? clansPourRace(filtreRace) : ALL_CLANS).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtreGenre} onChange={(e) => setFiltreGenre(e.target.value as "" | VoiceGender)} style={S.select}>
            <option value="">Tous les genres</option>
            {VOICE_GENDERS.map((g) => <option key={g} value={g}>{g} · {VOICE_GENDER_LABELS[g]}</option>)}
          </select>
          <span style={{ fontSize: 10, color: "#888", alignSelf: "center" }}>{visibles.length} affiché(s)</span>
        </div>

        {visibles.map((v) => {
          const n = v.used_by?.length ?? 0;
          return (
            <div key={v.id}>
              <div style={S.row}>
                <button onClick={() => ecouter(v.file_url)} style={S.btn} title="Écouter">▶</button>
                <span style={{ ...S.label, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.file_path}>{v.name}</span>
                <select value={v.race} disabled={busy === v.id} onChange={(e) => modifier(v, { race: e.target.value })} style={S.select}>
                  {ALL_RACES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={v.clan ?? ""} disabled={busy === v.id} onChange={(e) => modifier(v, { clan: e.target.value || null })} style={{ ...S.select, maxWidth: 170 }}>
                  <OptionsClan race={v.race} vide="— Commune —" />
                </select>
                <select value={v.gender} disabled={busy === v.id} onChange={(e) => modifier(v, { gender: e.target.value as VoiceGender })} style={S.select}>
                  {VOICE_GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <button onClick={() => setOuvert(ouvert === v.id ? null : v.id)} disabled={!n}
                  style={{ ...S.btn, width: 120, color: n ? "#6c5ce7" : "#bbb", cursor: n ? "pointer" : "default" }}>
                  {n ? `utilisé par ${n} carte${n > 1 ? "s" : ""}` : "non utilisé"}
                </button>
                <button onClick={() => supprimer(v)} disabled={!!n || busy === v.id}
                  title={n ? "Utilisé par une carte : suppression impossible" : "Supprimer"}
                  style={{ ...S.btn, color: n ? "#ccc" : "#c0392b", cursor: n ? "not-allowed" : "pointer" }}>✕</button>
              </div>
              {ouvert === v.id && n > 0 && (
                <div style={{ fontSize: 10, color: "#666", padding: "4px 0 8px 40px" }}>
                  {v.used_by!.map((c) => c.name).join(" · ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
