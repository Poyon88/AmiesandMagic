// LE CONTRAT D'ACTIVATION — « la créature active un pouvoir » a un sens unique,
// et il doit valoir pour TOUS les chemins d'activation.
//
// Pourquoi ce fichier existe : ces règles vivaient en clair dans `tapActivate`,
// seul chemin d'activation du jeu. Apprentissage en a ouvert un SECOND, qui
// passe par `playCard` — et la révélation de l'Ombre y a été oubliée. Une
// créature tapie relançait son sort tour après tour en restant intouchable.
//
// Le correctif a été d'extraire `peutActiverPouvoir` (ce qui autorise) et
// `engagerPourActivation` (ce que ça coûte). Ce test est l'autre moitié du
// correctif : il compare les chemins entre eux, pour qu'une règle ajoutée à
// l'un et pas à l'autre tombe ici plutôt qu'en partie.
//
// ⚠️ Un TROISIÈME chemin d'activation qui n'appellerait pas le contrat ne serait
// PAS attrapé par ces tests — ils comparent les chemins connus. Tout nouveau
// pouvoir activable doit être ajouté à la liste ci-dessous.
import { describe, expect, it } from "vitest";
import { applyAction, creatureCanCastLearnedSpell, peutActiverPouvoir } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, CardInstance, GameState, KeywordInstance, SpellKeywordInstance } from "./types";

/** Sort d'appoint, mémorisé par les créatures d'Apprentissage. */
const trait = () => mkInstance(mkCard({
  name: "Trait", card_type: "spell", mana_cost: 1, attack: null, health: null,
  spell_keywords: [{ id: "impact", amount: 3 }] as SpellKeywordInstance[],
} as Partial<Card>));

/** Les DEUX chemins d'activation du moteur, présentés à l'identique : une
 *  créature prête, et l'action qui l'active. */
const CHEMINS: Array<{
  nom: string;
  poser: (s: GameState) => CardInstance;
  activer: (s: GameState, src: CardInstance) => GameState;
}> = [
  {
    nom: "mot-clé au TAP",
    poser: (s) => {
      const c = mkInstance(mkCard({
        name: "Tapeuse", mana_cost: 1, attack: 2, health: 4,
        keywords: ["douleur", "ombre"] as never,
        keyword_instances: [{ id: "douleur", mode: "tap", x: 1 }] as KeywordInstance[],
      } as Partial<Card>));
      c.hasSummoningSickness = false;
      s.players[0].board.push(c);
      return c;
    },
    activer: (s, src) => applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
    }),
  },
  {
    nom: "SORT APPRIS (Apprentissage)",
    poser: (s) => {
      const c = mkInstance(mkCard({
        name: "Savante", mana_cost: 1, attack: 2, health: 4,
        keywords: ["apprentissage", "ombre"] as never,
        keyword_instances: [{ id: "apprentissage" }] as KeywordInstance[],
      } as Partial<Card>));
      c.hasSummoningSickness = false;
      c.apprentissageSpell = trait();
      s.players[0].board.push(c);
      return c;
    },
    activer: (s, src) => applyAction(s, {
      type: "play_card",
      cardInstanceId: src.apprentissageSpell!.instanceId,
      learnedFromInstanceId: src.instanceId,
      targetInstanceId: "enemy_hero",
    }),
  },
];

/** Les états qui INTERDISENT d'activer, et le nom de la règle qu'ils portent. */
const EMPECHEMENTS: Array<{ nom: string; abimer: (c: CardInstance) => void }> = [
  { nom: "déjà engagée", abimer: (c) => { c.tapped = true; } },
  { nom: "paralysée", abimer: (c) => { c.isParalyzed = true; } },
  { nom: "mal d'invocation", abimer: (c) => { c.hasSummoningSickness = true; } },
];

const prete = (chemin: typeof CHEMINS[number]) => {
  const s = mkState();
  s.players[0].mana = 10;
  return { s, src: chemin.poser(s) };
};

// ───────────────────────────────────────────────────────────────────────────

describe("ce qui AUTORISE l'activation", () => {
  it.each(EMPECHEMENTS)("« $nom » : le prédicat refuse", ({ abimer }) => {
    const c = mkInstance(mkCard({ name: "X", attack: 1, health: 1 }));
    c.hasSummoningSickness = false;
    expect(peutActiverPouvoir(c)).toBe(true);
    abimer(c);
    expect(peutActiverPouvoir(c)).toBe(false);
  });

  it("la TRAQUE lève le mal d'invocation — y compris CONFÉRÉE", () => {
    // Le point qui divergeait : l'interface lisait `card.keywords`, le moteur
    // `hasKw`, qui voit aussi les capacités. Une Traque accordée en cours de
    // partie n'était donc pas vue des deux côtés.
    const imprimee = mkInstance(mkCard({
      name: "Rapide", attack: 1, health: 1, keywords: ["charge"] as never,
    } as Partial<Card>));
    imprimee.hasSummoningSickness = true;
    expect(peutActiverPouvoir(imprimee)).toBe(true);

    const conferee = mkInstance(mkCard({
      name: "Pressée", attack: 1, health: 1,
      keywords: [] as never,
      capabilities: [{ uid: "c1", trigger: "automatic", effectKind: "immediate", abilityId: "charge" }] as never,
    } as Partial<Card>));
    conferee.hasSummoningSickness = true;
    expect(peutActiverPouvoir(conferee)).toBe(true);
  });
});

describe("les deux chemins refusent la MÊME chose", () => {
  for (const chemin of CHEMINS) {
    for (const emp of EMPECHEMENTS) {
      it(`${chemin.nom} — « ${emp.nom} » : action rejetée, état intact`, () => {
        const { s, src } = prete(chemin);
        emp.abimer(src);
        expect(peutActiverPouvoir(src)).toBe(false);
        expect(chemin.activer(s, src)).toBe(s);
        // Et surtout : une activation refusée ne révèle RIEN. Révéler une Ombre
        // pour une activation qui n'a pas eu lieu la rendrait attaquable sans
        // qu'elle ait rien fait.
        expect(src.ombreRevealed).toBe(false);
      });
    }
  }
});

describe("les deux chemins paient le MÊME prix", () => {
  for (const chemin of CHEMINS) {
    it(`${chemin.nom} — engage la créature ET révèle l'Ombre`, () => {
      const { s, src } = prete(chemin);
      expect(src.tapped).toBe(false);
      expect(src.ombreRevealed).toBe(false);

      const st = chemin.activer(s, src);
      expect(st).not.toBe(s); // l'activation a bien eu lieu
      const apres = st.players[0].board.find((c) => c.instanceId === src.instanceId)!;
      expect(apres.tapped).toBe(true);
      expect(apres.ombreRevealed).toBe(true);
    });

    it(`${chemin.nom} — ne peut pas être rejoué dans le même tour`, () => {
      const { s, src } = prete(chemin);
      const st = chemin.activer(s, src);
      const apres = st.players[0].board.find((c) => c.instanceId === src.instanceId)!;
      expect(peutActiverPouvoir(apres)).toBe(false);
      expect(chemin.activer(st, apres)).toBe(st);
    });
  }
});

describe("le prédicat d'INTERFACE dit la même chose que le moteur", () => {
  // `creatureCanCastLearnedSpell` grise le bouton ; `playCard` refuse l'action.
  // Un écart entre les deux laisserait un bouton actif sur une activation
  // impossible — indiscernable d'un pouvoir cassé.
  const chemin = CHEMINS[1];
  it.each(EMPECHEMENTS)("« $nom » : les deux refusent", ({ abimer }) => {
    const { s, src } = prete(chemin);
    abimer(src);
    expect(creatureCanCastLearnedSpell(s, src.instanceId)).toBe(false);
    expect(chemin.activer(s, src)).toBe(s);
  });

  it("créature prête : les deux autorisent", () => {
    const { s, src } = prete(chemin);
    expect(creatureCanCastLearnedSpell(s, src.instanceId)).toBe(true);
    expect(chemin.activer(s, src)).not.toBe(s);
  });
});
