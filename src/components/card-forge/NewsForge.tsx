"use client";

// Onglet « News » de la Card Forge : création/édition des news, génération du
// visuel de bandeau par IA (texte + style → prompt → /api/cards/generate-image,
// pattern generateBoardImage), traduction automatique (/api/news/translate),
// sélection (actif/inactif) et ordre de diffusion.
//
// Thème CLAIR de la forge (fond #fff, texte #333, Cinzel) — libellés en
// français en dur, comme les autres panneaux admin (précédent : CardEditor).
// Le visuel est généré SANS texte (préfixe anti-texte du pipeline) : le titre
// est superposé en HTML par le bandeau joueur, dans la langue du joueur.
import { useCallback, useEffect, useRef, useState } from "react";
import { NEWS_TARGET_LOCALES, slugifyNewsTitle, type NewsItem } from "@/lib/news/types";
import { GAME_SECTIONS, gameSectionMarkdownLink } from "@/lib/game-sections";
import type { Locale } from "@/i18n/config";

const NEWS_STYLES: { id: string; label: string; hints: string }[] = [
  { id: "epique", label: "Épique", hints: "epic dark-fantasy battle scene, armies clashing under a stormy sky, dramatic golden light, cinematic composition" },
  { id: "parchemin", label: "Parchemin", hints: "ancient illuminated parchment with wax seals and arcane calligraphy ornaments, warm candlelight, scholarly atmosphere" },
  { id: "festif", label: "Festif", hints: "festive celebration in a fantasy stronghold, fireworks and golden sparks, banners and garlands, joyful warm mood" },
  { id: "sombre", label: "Sombre", hints: "ominous dark ritual scene, purple arcane mist, moonlit ruins, foreboding dramatic atmosphere" },
  { id: "maj", label: "Mise à jour", hints: "arcane forge workshop, glowing runes and blueprints, magical gears and crafting tools, focused industrious mood" },
];

interface Variation { base64: string; mime: string; url: string }
interface Msg { ok: boolean; msg: string }

const S = {
  label: { fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#666", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 4 },
  input: { width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #ccc", fontSize: 13, color: "#333", background: "#fff", outline: "none" },
  btn: { padding: "7px 14px", borderRadius: 6, border: "1px solid #333", background: "#333", color: "#fff", fontSize: 12, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer" },
  btnGhost: { padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", background: "transparent", color: "#555", fontSize: 12, cursor: "pointer" },
};

export default function NewsForge() {
  const [list, setList] = useState<NewsItem[]>([]);
  const [message, setMessage] = useState<Msg | null>(null);

  // Formulaire (editingId null = création).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [teaser, setTeaser] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  // Section visée par le bouton d'action ("" = aucun bouton).
  const [ctaSection, setCtaSection] = useState("");
  // Référence du textarea du corps : l'insertion d'un lien se fait à la position
  // du curseur, pas en fin de texte — sinon le lien atterrit loin de la phrase
  // qu'on est en train d'écrire.
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [styleId, setStyleId] = useState(NEWS_STYLES[0].id);
  const [promptText, setPromptText] = useState("");
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ base64: string; mime: string } | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [variantMode, setVariantMode] = useState<1 | 3>(1);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [translatingId, setTranslatingId] = useState<number | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/news");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setList(data.news ?? []);
    } catch (err) {
      setMessage({ ok: false, msg: err instanceof Error ? err.message : "Erreur réseau" });
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  /** Insère un lien Markdown vers une section à la position du curseur. Si du
   *  texte est sélectionné, il sert de libellé — on garde ainsi la formulation
   *  de l'auteur (« la salle des ventes ») plutôt que d'imposer le nom du menu. */
  function insertSectionLink(section: (typeof GAME_SECTIONS)[number]) {
    const ta = bodyRef.current;
    const debut = ta?.selectionStart ?? bodyMd.length;
    const fin = ta?.selectionEnd ?? bodyMd.length;
    const selection = bodyMd.slice(debut, fin).trim();
    const lien = selection
      ? `[${selection}](${section.href})`
      : gameSectionMarkdownLink(section);
    setBodyMd(bodyMd.slice(0, debut) + lien + bodyMd.slice(fin));
    // Curseur juste après le lien inséré, au tour de rendu suivant (l'état n'est
    // pas encore appliqué au DOM à cet instant).
    requestAnimationFrame(() => {
      const pos = debut + lien.length;
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
    });
  }

  function resetForm() {
    setEditingId(null);
    setTitle(""); setTeaser(""); setBodyMd(""); setSlug(""); setSlugTouched(false);
    setCtaSection("");
    setStyleId(NEWS_STYLES[0].id); setPromptText("");
    setCurrentImageUrl(null); setPendingImage(null); setVariations([]);
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
    setMessage(null);
  }

  function openEdit(n: NewsItem) {
    setEditingId(n.id);
    setTitle(n.title); setTeaser(n.teaser); setBodyMd(n.body_md);
    setCtaSection(n.cta_section ?? "");
    setSlug(n.slug); setSlugTouched(true);
    setStyleId(n.image_style ?? NEWS_STYLES[0].id);
    setPromptText(n.image_prompt ?? "");
    setCurrentImageUrl(n.image_url); setPendingImage(null); setVariations([]);
    setFormOpen(true);
    setMessage(null);
  }

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugifyNewsTitle(v));
  }

  // Génération du visuel — pattern generateBoardImage (1 ou 3 variantes).
  async function generateVisual() {
    const hints = NEWS_STYLES.find((s) => s.id === styleId)?.hints ?? "";
    const prompt = `Wide horizontal banner illustration for a dark-fantasy card game news announcement. ${hints}. ${promptText}`.trim();
    setGenerating(true);
    setMessage(null);
    setVariations([]);

    const callOnce = async (): Promise<Variation | { error: string }> => {
      try {
        const res = await fetch("/api/cards/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, highRes: true, aspectRatio: "16:9" }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { error: data.error ?? `Erreur ${res.status}` };
        const mime = data.mimeType ?? "image/png";
        return { base64: data.imageBase64, mime, url: `data:${mime};base64,${data.imageBase64}` };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Erreur réseau" };
      }
    };

    const results = await Promise.all(variantMode === 3 ? [callOnce(), callOnce(), callOnce()] : [callOnce()]);
    const ok = results.filter((r): r is Variation => "base64" in r);
    if (ok.length === 0) {
      const firstErr = results.find((r) => "error" in r) as { error: string } | undefined;
      setMessage({ ok: false, msg: firstErr?.error ?? "Aucune image générée." });
    } else {
      setVariations(ok);
      if (ok.length === 1) setPendingImage({ base64: ok[0].base64, mime: ok[0].mime });
      if (ok.length < variantMode) setMessage({ ok: false, msg: `${variantMode - ok.length} variante(s) en échec.` });
    }
    setGenerating(false);
  }

  function onFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const [, mimePart, base64] = /^data:([^;]+);base64,(.*)$/.exec(url) ?? [];
      if (!base64) { setMessage({ ok: false, msg: "Fichier illisible." }); return; }
      setPendingImage({ base64, mime: mimePart });
      setVariations([{ base64, mime: mimePart, url }]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function save() {
    if (!title.trim() || !slug.trim()) { setMessage({ ok: false, msg: "Titre et slug requis." }); return; }
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        slug, title, teaser, body_md: bodyMd, image_style: styleId, image_prompt: promptText,
        cta_section: ctaSection,
        ...(pendingImage ? { imageBase64: pendingImage.base64, imageMimeType: pendingImage.mime } : {}),
      };
      const res = await fetch("/api/news", {
        method: editingId == null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId == null ? payload : { id: editingId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setMessage({ ok: true, msg: editingId == null ? "News créée." : "News enregistrée." });
      setFormOpen(false);
      resetForm();
      await loadList();
    } catch (err) {
      setMessage({ ok: false, msg: err instanceof Error ? err.message : "Erreur réseau" });
    }
    setSaving(false);
  }

  async function toggleActive(n: NewsItem) {
    const res = await fetch("/api/news", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: n.id, active: !n.active }),
    });
    if (res.ok) await loadList();
  }

  async function move(n: NewsItem, dir: -1 | 1) {
    const idx = list.findIndex((x) => x.id === n.id);
    const other = list[idx + dir];
    if (!other) return;
    await fetch("/api/news", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: [
        { id: n.id, sort_order: other.sort_order },
        { id: other.id, sort_order: n.sort_order },
      ] }),
    });
    await loadList();
  }

  async function translate(n: NewsItem) {
    setTranslatingId(n.id);
    setMessage(null);
    try {
      const res = await fetch("/api/news/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      const failed = (data.failed ?? []) as { locale: string; error: string }[];
      setMessage(failed.length === 0
        ? { ok: true, msg: `« ${n.title} » traduite (${(data.done ?? []).length} langues).` }
        : { ok: false, msg: `Échecs : ${failed.map((f) => `${f.locale} (${f.error})`).join(", ")} — recliquer pour compléter.` });
      await loadList();
    } catch (err) {
      setMessage({ ok: false, msg: err instanceof Error ? err.message : "Erreur réseau" });
    }
    setTranslatingId(null);
  }

  async function remove(n: NewsItem) {
    if (!confirm(`Supprimer la news « ${n.title} » ?`)) return;
    const res = await fetch("/api/news", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: n.id }),
    });
    if (res.ok) {
      if (editingId === n.id) { setFormOpen(false); resetForm(); }
      await loadList();
    } else {
      const data = await res.json().catch(() => null);
      setMessage({ ok: false, msg: data?.error ?? "Suppression impossible." });
    }
  }

  const previewUrl = pendingImage
    ? `data:${pendingImage.mime};base64,${pendingImage.base64}`
    : currentImageUrl;

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: 18, fontWeight: 700, color: "#333", margin: 0 }}>
          📰 News diffusées aux joueurs
        </h2>
        <button style={S.btn} onClick={openCreate}>+ Nouvelle news</button>
      </div>

      {message && (
        <div style={{
          padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12,
          background: message.ok ? "#e8f6ec" : "#fdecea",
          border: `1px solid ${message.ok ? "#9fd8ae" : "#f2b8b5"}`,
          color: message.ok ? "#1e7a35" : "#b3261e",
        }}>
          {message.msg}
        </div>
      )}

      {/* ── Liste ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {list.length === 0 && (
          <div style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>Aucune news pour l&apos;instant.</div>
        )}
        {list.map((n, idx) => (
          <div key={n.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
            border: "1px solid #e2e2e2", borderRadius: 8, background: n.active ? "#fbf7ec" : "#fafafa",
          }}>
            {/* Vignette */}
            <div style={{ width: 72, height: 30, borderRadius: 4, overflow: "hidden", flexShrink: 0, background: "linear-gradient(120deg,#221c38,#5b3bb5)" }}>
              {n.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {n.title}
              </div>
              <div style={{ fontSize: 10, color: "#999" }}>/news/{n.slug}</div>
            </div>
            {/* Pastilles de traduction */}
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }} title="Traductions disponibles">
              {NEWS_TARGET_LOCALES.map((l: Locale) => {
                const done = !!n.translations?.[l]?.title;
                return (
                  <span key={l} style={{
                    fontSize: 9, padding: "1px 4px", borderRadius: 3, fontWeight: 700,
                    background: done ? "#e8f6ec" : "#f0f0f0",
                    color: done ? "#1e7a35" : "#aaa",
                    border: `1px solid ${done ? "#9fd8ae" : "#ddd"}`,
                  }}>
                    {l}
                  </span>
                );
              })}
            </div>
            <button style={S.btnGhost} onClick={() => translate(n)} disabled={translatingId === n.id}>
              {translatingId === n.id ? "…" : "Traduire"}
            </button>
            {/* Ordre */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <button style={{ ...S.btnGhost, padding: "0 6px", fontSize: 10 }} disabled={idx === 0} onClick={() => move(n, -1)}>▲</button>
              <button style={{ ...S.btnGhost, padding: "0 6px", fontSize: 10 }} disabled={idx === list.length - 1} onClick={() => move(n, 1)}>▼</button>
            </div>
            {/* Diffusion */}
            <button
              onClick={() => toggleActive(n)}
              title={n.active ? "Diffusée — cliquer pour retirer" : "Non diffusée — cliquer pour diffuser"}
              style={{
                ...S.btnGhost, fontWeight: 700,
                border: `1px solid ${n.active ? "#c8a84e" : "#ccc"}`,
                background: n.active ? "#c8a84e" : "transparent",
                color: n.active ? "#fff" : "#888",
              }}
            >
              {n.active ? "Diffusée" : "Inactive"}
            </button>
            <button style={S.btnGhost} onClick={() => openEdit(n)}>Éditer</button>
            <button style={{ ...S.btnGhost, color: "#b3261e", borderColor: "#f2b8b5" }} onClick={() => remove(n)}>✕</button>
          </div>
        ))}
      </div>

      {/* ── Formulaire ── */}
      {formOpen && (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, background: "#fcfcfc" }}>
          <h3 style={{ fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, color: "#333", marginTop: 0 }}>
            {editingId == null ? "Nouvelle news" : "Éditer la news"}
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.label}>Titre (français)</label>
              <input style={S.input} value={title} onChange={(e) => onTitleChange(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Slug (URL /news/…)</label>
              <input style={S.input} value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Teaser (une phrase, affichée dans le bandeau)</label>
            <input style={S.input} value={teaser} onChange={(e) => setTeaser(e.target.value)} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Corps de la page (Markdown : titres #, **gras**, listes -, liens [texte](url))</label>
            <textarea
              ref={bodyRef}
              style={{ ...S.input, fontFamily: "monospace", fontSize: 12, minHeight: 160, resize: "vertical" }}
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
            />
            {/* Insertion de liens internes — la liste vient de GAME_SECTIONS, donc
                les routes sont justes par construction (test de garde) : plus
                besoin de se souvenir que le marché est en /auction au singulier. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              <span style={{ fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif" }}>
                Insérer un lien vers :
              </span>
              {GAME_SECTIONS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => insertSectionLink(s)}
                  title={`Insère [${s.frLabel}](${s.href}) au curseur — ou transforme le texte sélectionné en lien`}
                  style={{ ...S.btnGhost, padding: "3px 8px", fontSize: 11 }}
                >
                  {s.frLabel}
                </button>
              ))}
            </div>
          </div>

          {/* ── Bouton d'action ── */}
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Bouton d&apos;action en pied de page (facultatif)</label>
            <select
              style={{ ...S.input, maxWidth: 280 }}
              value={ctaSection}
              onChange={(e) => setCtaSection(e.target.value)}
            >
              <option value="">— Aucun bouton —</option>
              {GAME_SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.frLabel}</option>
              ))}
            </select>
            <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
              Bouton doré sous l&apos;article. Son libellé est celui du menu, donc
              déjà traduit dans les 8 langues — rien à retraduire.
            </div>
          </div>

          {/* ── Visuel ── */}
          <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginBottom: 14 }}>
            <label style={S.label}>Visuel du bandeau (généré sans texte — le titre est superposé côté joueur)</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {NEWS_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyleId(s.id)}
                  title={s.hints}
                  style={{
                    ...S.btnGhost,
                    border: `1px solid ${styleId === s.id ? "#c8a84e" : "#ccc"}`,
                    background: styleId === s.id ? "#c8a84e" : "transparent",
                    color: styleId === s.id ? "#fff" : "#555",
                    fontWeight: 700,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                style={{ ...S.input, flex: 1 }}
                placeholder="Description libre du visuel (ajoutée au style choisi)…"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <select
                style={{ ...S.input, width: 110 }}
                value={variantMode}
                onChange={(e) => setVariantMode(Number(e.target.value) as 1 | 3)}
              >
                <option value={1}>1 variante</option>
                <option value={3}>3 variantes</option>
              </select>
              <button style={S.btn} onClick={generateVisual} disabled={generating}>
                {generating ? "Génération…" : "Générer"}
              </button>
              <label style={{ ...S.btnGhost, display: "inline-flex", alignItems: "center" }}>
                Importer…
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={onFileUpload} />
              </label>
            </div>
            {variations.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {variations.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => setPendingImage({ base64: v.base64, mime: v.mime })}
                    style={{
                      padding: 0, borderRadius: 6, overflow: "hidden", cursor: "pointer",
                      border: `2px solid ${pendingImage?.base64 === v.base64 ? "#c8a84e" : "#ddd"}`,
                      background: "none",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.url} alt={`Variante ${i + 1}`} style={{ width: 180, height: 76, objectFit: "cover", display: "block" }} />
                  </button>
                ))}
              </div>
            )}
            {/* Aperçu du bandeau tel que vu par le joueur */}
            <div style={{
              position: "relative", height: 120, borderRadius: 12, overflow: "hidden",
              background: "linear-gradient(120deg,#221c38,#5b3bb5 55%,#171327)",
            }}>
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              )}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,7,15,0.15) 30%, rgba(8,7,15,0.85))" }} />
              <div style={{ position: "absolute", left: 16, right: 16, bottom: 12 }}>
                <div style={{ fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#f4e09a", fontSize: 16, lineHeight: 1.2 }}>
                  {title || "Titre de la news"}
                </div>
                {teaser && (
                  <div style={{ fontStyle: "italic", color: "rgba(239,232,214,0.68)", fontSize: 12, marginTop: 2 }}>
                    {teaser}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn} onClick={save} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button style={S.btnGhost} onClick={() => { setFormOpen(false); resetForm(); }}>Annuler</button>
            <span style={{ fontSize: 10, color: "#999", alignSelf: "center" }}>
              La traduction se lance depuis la liste, après enregistrement.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
