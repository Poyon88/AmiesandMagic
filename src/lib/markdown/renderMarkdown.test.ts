// Tests du mini-renderer Markdown des news. Environnement node (pas de jsdom,
// convention du repo) : on inspecte l'ARBRE d'éléments React retourné — un
// élément hôte a `type: string` ("p", "strong"…), ses enfants sont dans
// `props.children`. Suffisant pour verrouiller structure, attributs et
// non-injection sans dépendance de test supplémentaire.
import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderMarkdown } from "./renderMarkdown";

type AnyProps = { children?: ReactNode; href?: string; target?: string; rel?: string };
const el = (n: ReactNode): ReactElement<AnyProps> => {
  if (!isValidElement(n)) throw new Error(`pas un élément React : ${JSON.stringify(n)}`);
  return n as ReactElement<AnyProps>;
};
const kids = (n: ReactNode): ReactNode[] => {
  const c = el(n).props.children;
  return Array.isArray(c) ? c : [c];
};
/** Texte brut concaténé d'un sous-arbre (traverse strings + éléments). */
const textOf = (n: ReactNode): string => {
  if (typeof n === "string") return n;
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (isValidElement(n)) return textOf(el(n).props.children ?? "");
  return "";
};

describe("renderMarkdown — blocs", () => {
  it("titres # ## ### → h2 h3 h4 (le h1 de la page est le titre de la news)", () => {
    const [a, b, c] = renderMarkdown("# Un\n## Deux\n### Trois");
    expect(el(a).type).toBe("h2");
    expect(el(b).type).toBe("h3");
    expect(el(c).type).toBe("h4");
    expect(textOf(a)).toBe("Un");
  });

  it("paragraphes séparés par des lignes vides ; lignes contiguës jointes par un espace", () => {
    const out = renderMarkdown("ligne 1\nligne 2\n\nsecond");
    expect(out).toHaveLength(2);
    expect(el(out[0]).type).toBe("p");
    expect(textOf(out[0])).toBe("ligne 1 ligne 2");
    expect(textOf(out[1])).toBe("second");
  });

  it("listes à puces et numérotées", () => {
    const [ul, ol] = renderMarkdown("- a\n- b\n\n1. x\n2. y");
    expect(el(ul).type).toBe("ul");
    expect(kids(ul).map(textOf)).toEqual(["a", "b"]);
    expect(el(ol).type).toBe("ol");
    expect(kids(ol).map(textOf)).toEqual(["x", "y"]);
  });
});

describe("renderMarkdown — inline", () => {
  it("gras, italique, et italique imbriqué dans le gras", () => {
    const [p] = renderMarkdown("**gras** et *ital* et **a *b* c**");
    const enfants = kids(p);
    const strongs = enfants.filter((n) => isValidElement(n) && el(n).type === "strong");
    const ems = enfants.filter((n) => isValidElement(n) && el(n).type === "em");
    expect(strongs).toHaveLength(2);
    expect(ems).toHaveLength(1);
    // Le second strong contient un em imbriqué.
    const inner = kids(strongs[1]).filter((n) => isValidElement(n) && el(n).type === "em");
    expect(inner).toHaveLength(1);
    expect(textOf(strongs[1])).toBe("a b c");
  });

  it("lien EXTERNE → <a target=_blank rel='noopener noreferrer'>", () => {
    const [p] = renderMarkdown("Voir [le site](https://exemple.com) !");
    const a = kids(p).find((n) => isValidElement(n) && el(n).type === "a");
    expect(a).toBeDefined();
    expect(el(a).props.href).toBe("https://exemple.com");
    expect(el(a).props.target).toBe("_blank");
    expect(el(a).props.rel).toBe("noopener noreferrer");
    expect(textOf(a)).toBe("le site");
  });

  it("lien INTERNE (/...) → composant Link, pas un <a> hôte", () => {
    const [p] = renderMarkdown("Va sur [ta collection](/collection-hub) vite");
    const lien = kids(p).find((n) => isValidElement(n) && typeof el(n).type !== "string");
    expect(lien).toBeDefined();
    expect(el(lien).props.href).toBe("/collection-hub");
    expect(textOf(lien)).toBe("ta collection");
  });

  it("le texte d'un lien garde son emphase", () => {
    const [p] = renderMarkdown("[**important**](https://exemple.com)");
    const a = kids(p).find((n) => isValidElement(n) && el(n).type === "a");
    const strong = kids(a).flat().find((n) => isValidElement(n) && el(n).type === "strong");
    expect(strong).toBeDefined();
  });
});

describe("renderMarkdown — sécurité", () => {
  it("du HTML injecté est rendu LITTÉRALEMENT (jamais interprété)", () => {
    const out = renderMarkdown('<script>alert("xss")</script>\n\n<img src=x onerror=alert(1)>');
    // Aucun élément script/img dans l'arbre : tout est resté du texte brut.
    const types: string[] = [];
    const walk = (n: ReactNode): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (isValidElement(n)) {
        if (typeof el(n).type === "string") types.push(el(n).type as string);
        walk(el(n).props.children ?? null);
      }
    };
    walk(out);
    expect(types).toEqual(["p", "p"]);
    expect(textOf(out[0])).toBe('<script>alert("xss")</script>');
  });

  it("un schéma non autorisé (javascript:) n'est PAS rendu comme lien", () => {
    const [p] = renderMarkdown("[clic](javascript:alert(1))");
    const a = kids(p).find((n) => isValidElement(n) && el(n).type === "a");
    expect(a).toBeUndefined();
    expect(textOf(p)).toContain("clic");
  });
});

describe("renderMarkdown — robustesse", () => {
  it("chaîne vide → aucun bloc", () => {
    expect(renderMarkdown("")).toEqual([]);
  });

  it("retours chariot Windows (\\r\\n) acceptés", () => {
    const out = renderMarkdown("# Titre\r\n\r\ncorps");
    expect(out).toHaveLength(2);
    expect(el(out[0]).type).toBe("h2");
  });
});
