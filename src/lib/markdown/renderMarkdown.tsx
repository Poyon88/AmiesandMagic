// Mini-renderer Markdown maison pour le corps des news : string → ReactNode[].
//
// Pourquoi pas react-markdown / marked : le corpus est rédigé par l'admin
// (contrôlé), le sous-ensemble requis est trivial, et l'app n'a aujourd'hui
// AUCUNE dépendance Markdown ni AUCUN dangerouslySetInnerHTML — un renderer
// React préserve ces deux invariants (le texte passe par les children React,
// donc du HTML injecté est rendu LITTÉRALEMENT, jamais interprété : XSS
// impossible par construction).
//
// Sous-ensemble supporté :
//   - titres `#`, `##`, `###`  (rendus h2/h3/h4 — le h1 de la page est le titre)
//   - paragraphes (lignes contiguës), séparés par des lignes vides
//   - listes à puces `- ` / `* ` et numérotées `1. `
//   - `**gras**`, `*italique*` (imbrication simple gras > italique)
//   - liens `[texte](url)` — internes (`/...`) via <Link>, externes en
//     target=_blank rel="noopener noreferrer"
// Tout le reste est du texte brut.
import Link from "next/link";
import type { ReactNode } from "react";

let keySeq = 0;
function k(): number {
  return keySeq++;
}

/** Segments en ligne : liens d'abord (leur texte repasse par gras/italique). */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = linkRe.exec(text); m; m = linkRe.exec(text)) {
    if (m.index > last) out.push(...renderEmphasis(text.slice(last, m.index)));
    const [, label, href] = m;
    if (href.startsWith("/")) {
      out.push(
        <Link key={k()} href={href} className="am-news-link">
          {renderEmphasis(label)}
        </Link>,
      );
    } else if (/^https?:\/\//i.test(href)) {
      out.push(
        <a key={k()} href={href} target="_blank" rel="noopener noreferrer" className="am-news-link">
          {renderEmphasis(label)}
        </a>,
      );
    } else {
      // Schéma non autorisé (javascript:, data:, mailto…) : texte simple.
      out.push(...renderEmphasis(label));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...renderEmphasis(text.slice(last)));
  return out;
}

/** `**gras**` puis `*italique*` à l'intérieur du gras et entre les gras. */
function renderEmphasis(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Non-gourmand et tolérant aux `*` internes : `**a *b* c**` imbrique bien.
  const boldRe = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = boldRe.exec(text); m; m = boldRe.exec(text)) {
    if (m.index > last) out.push(...renderItalic(text.slice(last, m.index)));
    out.push(<strong key={k()}>{renderItalic(m[1])}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...renderItalic(text.slice(last)));
  return out;
}

function renderItalic(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const italicRe = /\*([^*]+)\*/g;
  let last = 0;
  for (let m = italicRe.exec(text); m; m = italicRe.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<em key={k()}>{m[1]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "p"; lines: string[] };

function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    // Paragraphe : lignes contiguës non vides, non titre, non liste.
    const para: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || /^(#{1,3})\s+/.test(t) || /^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) break;
      para.push(t);
      i++;
    }
    blocks.push({ kind: "p", lines: para });
  }
  return blocks;
}

/** Rend un corps Markdown en ReactNodes. Pur (pas de hook) : utilisable en
 *  RSC comme en client. Les classes `am-news-*` sont stylées par l'appelant. */
export function renderMarkdown(md: string): ReactNode[] {
  keySeq = 0;
  return parseBlocks(md).map((block) => {
    switch (block.kind) {
      case "heading": {
        // # → h2 (le h1 de la page est déjà le titre de la news).
        const Tag = (["h2", "h3", "h4"] as const)[block.level - 1];
        return <Tag key={k()}>{renderInline(block.text)}</Tag>;
      }
      case "ul":
        return (
          <ul key={k()}>
            {block.items.map((item) => (
              <li key={k()}>{renderInline(item)}</li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={k()}>
            {block.items.map((item) => (
              <li key={k()}>{renderInline(item)}</li>
            ))}
          </ol>
        );
      case "p":
        return (
          <p key={k()}>
            {block.lines.flatMap((line, idx) =>
              idx === 0 ? renderInline(line) : [" ", ...renderInline(line)],
            )}
          </p>
        );
    }
  });
}
