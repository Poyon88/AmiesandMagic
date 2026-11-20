import { describe, expect, it } from "vitest";
import { assainirTri, decider, type Tri } from "./decision";

const SUJET = "5d1d6782-408e-409b-877c-5f98cb85b6f7";
const ouverts = new Set([SUJET]);

/** Sortie de modèle bien formée, que chaque test déforme sur un point. */
function sortie(surcharge: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "question",
    title_fr: "Vol face à Provocation",
    summary_fr: "Le joueur demande si Vol ignore Provocation.",
    severity: "low",
    area: "partie",
    category: "rules",
    reply: "Oui : Vol ignore Provocation.",
    reply_grounded: true,
    needs_info: false,
    topic: { action: "none", id: "", title: "", summary: "", repro: "" },
    ...surcharge,
  };
}

const tri = (surcharge: Record<string, unknown> = {}): Tri => {
  const t = assainirTri(sortie(surcharge), ouverts);
  if (!t) throw new Error("tri attendu");
  return t;
};

describe("decider — « automatique si sûr »", () => {
  it("envoie seule une réponse de règles tirée des connaissances", () => {
    expect(decider(tri())).toEqual({ reply: "send", status: "answered" });
  });

  it("met en brouillon une réponse de règles qui dépasse les connaissances", () => {
    expect(decider(tri({ reply_grounded: false }))).toEqual({ reply: "draft", status: "awaiting_admin" });
  });

  // Le cœur de la règle : aucune de ces catégories ne part sans relecture,
  // même si le modèle jure que sa réponse est fondée.
  it.each(["payment", "account", "complaint", "moderation", "legal", "other"])(
    "ne laisse jamais partir seule une réponse de catégorie %s",
    (category) => {
      expect(decider(tri({ category, reply_grounded: true })).reply).toBe("draft");
      expect(decider(tri({ category, reply_grounded: true, needs_info: true })).reply).toBe("draft");
    },
  );

  it("ne répond pas seul à un bug, même en catégorie sûre", () => {
    const d = decider(tri({ kind: "bug", category: "gameplay", reply: "Ce sera corrigé demain." }));
    expect(d).toEqual({ reply: "draft", status: "awaiting_admin" });
  });

  it("range sans rien dire un bug ou une idée compris", () => {
    expect(decider(tri({ kind: "bug", reply: "" }))).toEqual({ reply: "none", status: "triaged" });
    expect(decider(tri({ kind: "idea", reply: "" }))).toEqual({ reply: "none", status: "triaged" });
  });

  it("renvoie à l'admin une question restée sans réponse", () => {
    expect(decider(tri({ reply: "" }))).toEqual({ reply: "none", status: "awaiting_admin" });
    expect(decider(tri({ kind: "other", reply: "" }))).toEqual({ reply: "none", status: "awaiting_admin" });
  });

  it("demande seul une précision sur un bug, deux fois au plus", () => {
    const precision = tri({ kind: "bug", category: "gameplay", reply: "Quelle carte ?", needs_info: true });
    expect(decider(precision, 0)).toEqual({ reply: "send", status: "awaiting_player" });
    expect(decider(precision, 1)).toEqual({ reply: "send", status: "awaiting_player" });
    expect(decider(precision, 2)).toEqual({ reply: "draft", status: "awaiting_admin" });
  });
});

describe("assainirTri", () => {
  it("rejette ce qui n'est pas un classement", () => {
    expect(assainirTri(null, ouverts)).toBeNull();
    expect(assainirTri("bug", ouverts)).toBeNull();
    expect(assainirTri(sortie({ title_fr: "  " }), ouverts)).toBeNull();
  });

  it("ramène les valeurs inconnues à des valeurs sûres", () => {
    const t = tri({ kind: "urgent", severity: "apocalypse", area: "ailleurs", category: "vip" });
    expect(t.kind).toBe("other");
    expect(t.severity).toBe("medium");
    expect(t.area).toBe("autre");
    // Une catégorie inconnue n'est pas une catégorie sûre.
    expect(t.category).toBe("other");
    expect(decider(t).reply).toBe("draft");
  });

  it("n'accepte que de vrais booléens pour ce qui autorise l'envoi", () => {
    const t = tri({ reply_grounded: "true", needs_info: 1 });
    expect(t.reply_grounded).toBe(false);
    expect(t.needs_info).toBe(false);
  });

  it("ne rattache qu'à un sujet ouvert connu", () => {
    const attache = { action: "attach", id: SUJET, title: "", summary: "", repro: "" };
    expect(tri({ kind: "bug", topic: attache }).topic).toMatchObject({ action: "attach", id: SUJET });
    // Id inventé, ou recopié d'un message de joueur.
    const inconnu = { ...attache, id: "00000000-0000-0000-0000-000000000000" };
    expect(tri({ kind: "bug", topic: inconnu }).topic.action).toBe("none");
  });

  it("ne crée de sujet que pour un bug ou une idée, et avec un titre", () => {
    const creation = { action: "create", id: "", title: "Deck de 52 cartes", summary: "s", repro: "r" };
    expect(tri({ kind: "bug", topic: creation }).topic).toMatchObject({ action: "create", title: "Deck de 52 cartes" });
    expect(tri({ kind: "question", topic: creation }).topic.action).toBe("none");
    expect(tri({ kind: "idea", topic: { ...creation, title: "" } }).topic.action).toBe("none");
  });

  it("ne retient la langue de la réponse que si c'est une langue du jeu", () => {
    expect(tri({ reply_lang: "fr" }).reply_lang).toBe("fr");
    expect(tri({ reply_lang: "zh-TW" }).reply_lang).toBe("zh-TW");
    expect(tri({ reply_lang: "autre" }).reply_lang).toBe("");
    expect(tri({ reply_lang: 12 }).reply_lang).toBe("");
    expect(tri({}).reply_lang).toBe("");
  });

  it("borne les textes", () => {
    const t = tri({ reply: "a".repeat(10_000), title_fr: "b".repeat(500) });
    expect(t.reply.length).toBe(3000);
    expect(t.title_fr.length).toBe(140);
  });
});
