"use client";

// Zone de saisie d'un retour : le texte et jusqu'à trois captures (choisies,
// déposées ou collées). Sert à l'ouverture d'un retour comme à la réponse
// dans un fil ; chaque capture part au stockage dès qu'elle est ajoutée.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { envoyerPiece, type ErreurPiece } from "@/lib/feedback/client";
import { MAX_ATTACHMENTS, MAX_BODY_CHARS, MIN_BODY_CHARS } from "@/lib/feedback/types";

interface Piece {
  cle: string;
  apercu: string;
  path?: string;
  enCours: boolean;
}

export interface Saisie {
  body: string;
  attachments: string[];
}

const champ: React.CSSProperties = {
  width: "100%",
  background: "var(--am-bg-0)",
  color: "var(--am-ink)",
  border: "1px solid var(--am-line-strong)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  lineHeight: 1.5,
  fontFamily: "inherit",
  resize: "vertical",
};

export default function FeedbackComposer({
  placeholder,
  submitLabel,
  rows = 6,
  autoFocus = false,
  onSubmit,
}: {
  placeholder: string;
  submitLabel: string;
  rows?: number;
  autoFocus?: boolean;
  /** Rend `null` si tout s'est bien passé, sinon le code d'erreur du serveur. */
  onSubmit: (saisie: Saisie) => Promise<string | null>;
}) {
  const t = useTranslations("feedback");
  const [body, setBody] = useState("");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const fichier = useRef<HTMLInputElement>(null);
  // Les aperçus sont des URL d'objet : à libérer quand le composant s'en va.
  const apercus = useRef<string[]>([]);
  useEffect(() => () => apercus.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const messageErreur = (code: ErreurPiece | string): string => {
    const cles: Record<string, string> = {
      bad_format: "err_format",
      too_big: "err_too_big",
      quota: "err_quota",
      upload: "err_upload",
      bad_body: "err_body",
      bad_attachments: "err_upload",
    };
    return t(cles[code] ?? "err_generic");
  };

  async function ajouter(fichiers: File[]) {
    setErreur(null);
    const place = MAX_ATTACHMENTS - pieces.length;
    if (place <= 0) { setErreur(t("err_too_many", { max: MAX_ATTACHMENTS })); return; }
    if (fichiers.length > place) setErreur(t("err_too_many", { max: MAX_ATTACHMENTS }));

    for (const f of fichiers.slice(0, place)) {
      const cle = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const apercu = URL.createObjectURL(f);
      apercus.current.push(apercu);
      setPieces((p) => [...p, { cle, apercu, enCours: true }]);
      const res = await envoyerPiece(f);
      if ("erreur" in res) {
        setPieces((p) => p.filter((x) => x.cle !== cle));
        setErreur(messageErreur(res.erreur));
      } else {
        setPieces((p) => p.map((x) => (x.cle === cle ? { ...x, path: res.path, enCours: false } : x)));
      }
    }
  }

  const enCours = pieces.some((p) => p.enCours);
  const texte = body.trim();
  const pret = texte.length >= MIN_BODY_CHARS && !enCours && !envoi;

  async function envoyer() {
    if (!pret) return;
    setEnvoi(true);
    setErreur(null);
    const code = await onSubmit({ body: texte, attachments: pieces.flatMap((p) => (p.path ? [p.path] : [])) });
    setEnvoi(false);
    if (code) { setErreur(messageErreur(code)); return; }
    setBody("");
    setPieces([]);
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const images = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
        if (images.length) void ajouter(images);
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY_CHARS))}
        onPaste={(e) => {
          const images = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
          if (images.length) { e.preventDefault(); void ajouter(images); }
        }}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        aria-label={placeholder}
        style={champ}
      />

      {pieces.length > 0 && (
        <ul style={{ display: "flex", gap: 8, flexWrap: "wrap", listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          {pieces.map((p) => (
            <li key={p.cle} style={{ position: "relative", width: 84, height: 60 }}>
              {/* Aperçu local d'un fichier du joueur : next/image n'y apporterait rien. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.apercu}
                alt=""
                style={{
                  width: "100%", height: "100%", objectFit: "cover", borderRadius: 6,
                  border: "1px solid var(--am-line-strong)", opacity: p.enCours ? 0.4 : 1,
                }}
              />
              <button
                type="button"
                onClick={() => setPieces((x) => x.filter((y) => y.cle !== p.cle))}
                aria-label={t("remove_attachment")}
                style={{
                  position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                  border: "1px solid var(--am-line-strong)", background: "var(--am-bg-0)", color: "var(--am-ink)",
                  fontSize: 11, lineHeight: 1, cursor: "pointer",
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {erreur && (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--am-ember, #ff8a70)" }}>{erreur}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
        <div>
          <input
            ref={fichier}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => {
              const choisis = [...(e.target.files ?? [])];
              e.target.value = "";
              if (choisis.length) void ajouter(choisis);
            }}
          />
          <button
            type="button"
            onClick={() => fichier.current?.click()}
            disabled={pieces.length >= MAX_ATTACHMENTS}
            style={{
              background: "transparent", color: "var(--am-ink-soft)", border: "1px solid var(--am-line-strong)",
              borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit",
              cursor: pieces.length >= MAX_ATTACHMENTS ? "default" : "pointer",
              opacity: pieces.length >= MAX_ATTACHMENTS ? 0.5 : 1,
            }}
          >
            {t("add_screenshot")}
          </button>
          <span style={{ marginLeft: 10, fontSize: 12, color: "var(--am-ink-faint)" }}>{t("attach_hint")}</span>
        </div>
        <button
          type="button"
          onClick={envoyer}
          disabled={!pret}
          style={{
            background: "var(--am-ink)", color: "var(--am-bg-0)", border: "none", borderRadius: 8,
            padding: "9px 18px", fontSize: 14, fontWeight: 600, fontFamily: "inherit",
            cursor: pret ? "pointer" : "default", opacity: pret ? 1 : 0.45, whiteSpace: "nowrap",
          }}
        >
          {envoi ? t("sending") : submitLabel}
        </button>
      </div>
    </div>
  );
}
