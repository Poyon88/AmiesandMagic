// OBJETS, LOT 1 — le socle.
//
// Le contrat de ce lot tient en une phrase : un objet se pose, il occupe une
// des places du plateau, et RIEN D'AUTRE DU JEU NE CHANGE. Ces tests vérifient
// donc surtout des absences — un objet qu'aucune aura ne voit, qu'aucun
// comptage ne compte, qu'aucune attaque ne peut viser.
//
// L'inertie n'est pas obtenue par une liste de gardes (il aurait fallu en poser
// ~135 dans engine.ts, et en manquer un se serait vu en partie, pas ici) mais
// par la STRUCTURE : les objets vivent hors de `board`, que tout le moteur
// balaie. Le dernier test de ce fichier est là pour que cette propriété ne se
// perde pas au prochain plafond écrit à la main.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { applyAction } from "./engine";
import { estUnObjet, estUneUnite, objetsDe, occupeUnePlace, placesOccupees } from "./items";
import { MAX_BOARD_SIZE } from "./constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, CardInstance, GameAction, GameState } from "./types";

/** Un objet : type `item`, et ses stats portent le bonus qu'il conférera. */
const objet = (name: string, over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({ name, card_type: "item", mana_cost: 0, attack: 2, health: 1, faction: "Humains", ...over }));

const creature = (name: string, over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 0, attack: 1, health: 1, faction: "Humains", ...over }));

const poser = (s: GameState, inst: CardInstance): GameState => {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId } as GameAction);
};

describe("Objets — la pose", () => {
  it("un objet joué rejoint la zone des objets, PAS le plateau", () => {
    const next = poser(mkState(), objet("Épée de Fer"));
    expect(next.players[0].board).toHaveLength(0);
    expect(objetsDe(next.players[0]).map(o => o.card.name)).toEqual(["Épée de Fer"]);
  });

  it("il ne part pas au cimetière comme le ferait un sort", () => {
    // Le défaut exact qu'il fallait éviter : sans branche dédiée dans playCard,
    // un objet tombait entre « créature » et « sort » — mana débité, carte
    // partie de la main, et rien nulle part.
    const next = poser(mkState(), objet("Épée de Fer"));
    expect(next.players[0].graveyard).toHaveLength(0);
    expect(next.players[0].hand).toHaveLength(0);
  });
});

describe("Objets — la place sur la table", () => {
  it("un objet compte dans les places occupées", () => {
    const s = mkState();
    s.players[0].board.push(creature("Soldat"));
    const next = poser(s, objet("Épée"));
    expect(placesOccupees(next.players[0])).toBe(2);
  });

  it("un plateau plein d'objets refuse une créature", () => {
    const s = mkState();
    s.players[0].items = Array.from({ length: MAX_BOARD_SIZE }, (_, i) => objet(`Objet${i}`));
    const soldat = creature("Soldat");

    const next = poser(s, soldat);
    expect(next.players[0].board).toHaveLength(0);
    // Action refusée ⇒ l'état d'origine est rendu tel quel, carte encore en main.
    expect(next.players[0].hand.some(c => c.instanceId === soldat.instanceId)).toBe(true);
  });

  it("un plateau plein de créatures refuse un objet", () => {
    const s = mkState();
    s.players[0].board = Array.from({ length: MAX_BOARD_SIZE }, (_, i) => creature(`Soldat${i}`));
    const epee = objet("Épée");

    const next = poser(s, epee);
    expect(objetsDe(next.players[0])).toHaveLength(0);
    expect(next.players[0].hand.some(c => c.instanceId === epee.instanceId)).toBe(true);
  });

  it("`items` absent (partie en cours d'avant les objets) ne casse pas le comptage", () => {
    const s = mkState();
    s.players[0].board.push(creature("Soldat"));
    expect(s.players[0].items).toBeUndefined();
    expect(placesOccupees(s.players[0])).toBe(1);
    expect(objetsDe(s.players[0])).toEqual([]);
  });
});

describe("Objets — l'inertie", () => {
  /** Plateau : un capitaine Commandement 2, un soldat, et un objet. */
  function table(): GameState {
    const s = mkState();
    s.players[0].board.push(creature("Soldat"));
    s.players[0].hand.push(mkInstance(mkCard({
      name: "Capitaine", mana_cost: 0, attack: 2, health: 3, faction: "Humains",
      keywords: ["commandement"] as never,
      capabilities: [{ uid: "cw_0", targets: [], trigger: "automatic", effectKind: "immediate", abilityId: "commandement", params: { x: 2 } }] as never,
    })));
    return s;
  }

  it("aucune aura ne buffe un objet", () => {
    const s = table();
    s.players[0].items = [objet("Épée")];
    const cap = s.players[0].hand[0];
    const next = applyAction(s, { type: "play_card", cardInstanceId: cap.instanceId } as GameAction);

    const epee = objetsDe(next.players[0])[0];
    // Les stats de l'objet sont son BONUS futur, pas des stats de combat :
    // Commandement 2 ne doit pas les gonfler.
    expect(epee.currentAttack).toBe(2);
    expect(epee.maxHealth).toBe(1);
    // Le soldat, lui, reçoit bien son +2/+2 — l'aura fonctionne toujours.
    const soldat = next.players[0].board.find(c => c.card.name === "Soldat")!;
    expect(soldat.currentAttack).toBe(3);
  });

  it("un objet n'est pas une cible d'attaque", () => {
    const s = mkState();
    s.players[0].board.push(creature("Attaquant"));
    s.players[1].items = [objet("Bouclier adverse")];
    const attaquant = s.players[0].board[0];
    attaquant.hasSummoningSickness = false;

    // Viser l'objet : le moteur ne le trouve nulle part sur le plateau adverse,
    // l'action est donc sans effet.
    const cible = objetsDe(s.players[1])[0];
    const next = applyAction(s, {
      type: "attack", attackerInstanceId: attaquant.instanceId, targetInstanceId: cible.instanceId,
    } as GameAction);

    expect(objetsDe(next.players[1])[0].currentHealth).toBe(1);
  });

  it("les prédicats disent la même chose que la structure", () => {
    const epee = objet("Épée").card;
    const soldat = creature("Soldat").card;
    const sort = mkCard({ card_type: "spell", attack: null, health: null });

    expect(estUnObjet(epee)).toBe(true);
    expect(estUneUnite(epee)).toBe(false);
    expect(occupeUnePlace(epee)).toBe(true);

    expect(estUneUnite(soldat)).toBe(true);
    expect(occupeUnePlace(soldat)).toBe(true);

    expect(estUneUnite(sort)).toBe(false);
    expect(occupeUnePlace(sort)).toBe(false);
  });
});

describe("Objets — garde-fou de structure", () => {
  it("aucun plafond de plateau n'est écrit sur `board.length` seul", () => {
    // CE test est la raison pour laquelle l'inertie tient sans 135 gardes.
    //
    // Tout test de place doit passer par `placesOccupees`, sinon les objets
    // deviennent gratuits en place — ce qui viderait de son sens le choix de
    // les poser sur le plateau, et le ferait EN SILENCE : le jeu continue de
    // fonctionner, on tient juste 9, 10, 12 cartes sur une table de 8.
    const racine = path.join(__dirname, "..", "..", "..", "src");
    const fautifs: string[] = [];

    const visiter = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { visiter(p); continue; }
        if (!/\.tsx?$/.test(e.name) || e.name.includes(".test.")) continue;
        fs.readFileSync(p, "utf8").split("\n").forEach((ligne, i) => {
          if (!ligne.includes("MAX_BOARD_SIZE")) return;
          // `opponent.board.length === 0` (« y a-t-il un ennemi ? ») peut
          // légitimement cohabiter sur la même ligne : on ne s'alarme que d'un
          // `board.length` COMPARÉ au plafond.
          if (/\.board\.length\s*(>=|<=|>|<|-)[^=]/.test(ligne)) {
            fautifs.push(`${path.relative(racine, p)}:${i + 1}`);
          }
        });
      }
    };
    visiter(racine);

    // Si ce test tombe : remplacez `X.board.length` par `placesOccupees(X)`.
    expect(fautifs).toEqual([]);
  });
});
