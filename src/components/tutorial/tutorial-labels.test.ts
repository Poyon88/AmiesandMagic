// Le tutoriel doit appeler les capacités par le nom que le JOUEUR voit sur ses
// cartes.
//
// Signalé en partie : la page parlait de « Charge » alors que l'id moteur
// `charge` s'affiche « Traque ». Même dérive pour `divine_shield`, décrit comme
// « Bouclier divin » quand son libellé est « Bouclier ». Rien ne le signalait :
// la prose est écrite à la main, seule la table des mots-clés en bas de page est
// générée depuis le registre — donc elle, elle était juste, et la contradiction
// vivait dans la même page.
//
// Deux garde-fous ici, l'un général, l'autre ciblé.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ABILITIES } from "@/lib/game/abilities";

const SRC = fs.readFileSync("src/components/tutorial/TutorialView.tsx", "utf8");

/** Libellés officiels côté créature ET côté sort. */
function libellesOfficiels(): Set<string> {
  const out = new Set<string>();
  for (const a of Object.values(ABILITIES)) {
    out.add(a.label);
    if (a.creature?.label) out.add(a.creature.label);
  }
  return out;
}

/** Anciens noms, ou noms approchants, qui ne doivent plus apparaître dans la
 *  prose. À COMPLÉTER à chaque renommage de capacité : c'est le seul endroit qui
 *  garde trace des libellés abandonnés, le registre ne conservant que l'actuel. */
const LIBELLES_PERIMES: Record<string, string> = {
  "Charge": "Traque",
  "Bouclier divin": "Bouclier",
  "Berserk": "Gloire +X/+Y",
};

describe("tutoriel — noms de capacités", () => {
  it("n'emploie aucun libellé périmé", () => {
    const fautes = Object.entries(LIBELLES_PERIMES)
      .filter(([perime]) => new RegExp(`<Hi>${perime}</Hi>`).test(SRC))
      .map(([perime, actuel]) => `« ${perime} » → devrait être « ${actuel} »`);
    expect(fautes).toEqual([]);
  });

  it("les remplaçants existent bien dans le registre", () => {
    // Sans cette contre-épreuve, la table ci-dessus pourrait pointer vers un
    // libellé lui-même périmé et le test resterait vert.
    const officiels = libellesOfficiels();
    const inconnus = Object.values(LIBELLES_PERIMES).filter(l => !officiels.has(l));
    expect(inconnus).toEqual([]);
  });

  it("ne met pas en avant une VARIANTE d'un libellé officiel", () => {
    // Attrape la dérive par ajout de mot (« Bouclier divin » pour « Bouclier »)
    // sans avoir à la connaître d'avance : un terme mis en valeur qui CONTIENT
    // un libellé officiel sans lui être égal est presque toujours une paraphrase.
    const officiels = [...libellesOfficiels()].filter(l => l.length >= 6);
    const misEnAvant = [...SRC.matchAll(/<Hi>([^<]{3,40})<\/Hi>/g)].map(m => m[1].trim());
    const variantes = [...new Set(misEnAvant)]
      .filter(t => officiels.some(l => t !== l && t.includes(l)))
      .map(t => `« ${t} »`);
    expect(variantes).toEqual([]);
  });
});
