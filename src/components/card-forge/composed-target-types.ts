// Sélecteur « Type » des cibles d'un effet composé : cases CUMULABLES
// (Unité + Action + Objet…) traduites vers le couple (entité, nature) déjà
// stocké en base — aucun champ nouveau. Module pur, testé à part.
import type { ComposedEffectContent, TargetSpec } from "@/lib/game/types";

/** Contenus capables de viser une ACTION (hors plateau) : seul le Rappel sait
 *  en ramener une. Ailleurs, le moteur ne garde que les unités. */
export const ACTION_TARGET_CONTENTS = new Set<ComposedEffectContent>(["rappel"]);

/** Case du sélecteur « Type » des cibles. */
export type TypeCible = "unit" | "spell" | "item" | "hero" | "self" | "damage_source";
const TYPES_EXCLUSIFS: ReadonlySet<TypeCible> = new Set(["self", "damage_source"]);

/** Cases cochées pour une cible stockée. `avecAction` : le contenu propose la
 *  case Action — une entité « unit » SANS nature y vaut alors Unité + Action
 *  (c'est ce que le moteur ramène déjà : les non-objets de la zone). */
export function typesCoches(t: TargetSpec, avecAction: boolean): Set<TypeCible> {
  switch (t.entity) {
    case "self": case "damage_source": case "hero": return new Set([t.entity]);
    case "both": return new Set(["hero", "unit"]);
    case "item": return new Set(["item"]);
    default: {
      const s = new Set<TypeCible>(t.entity === "unit_or_item" ? ["item"] : []);
      if (t.cardKind !== "spell") s.add("unit");
      if (avecAction && t.cardKind !== "creature") s.add("spell");
      return s;
    }
  }
}

/** Coche/décoche un type. Self et Source des dégâts sont exclusifs ; Héros ne
 *  se combine qu'avec Unité (« les deux »). `null` si plus rien ne resterait. */
export function basculerType(coches: ReadonlySet<TypeCible>, ty: TypeCible): Set<TypeCible> | null {
  if (TYPES_EXCLUSIFS.has(ty)) return coches.has(ty) ? null : new Set([ty]);
  const s = new Set([...coches].filter((c) => !TYPES_EXCLUSIFS.has(c)));
  if (s.has(ty)) s.delete(ty);
  else {
    s.add(ty);
    if (ty === "hero") { s.delete("spell"); s.delete("item"); }
    if (ty === "spell" || ty === "item") s.delete("hero");
  }
  return s.size > 0 ? s : null;
}

/** Cases cochées → champs de la cible (entité, nature, et pour self/source la
 *  désignation automatique). */
export function cibleDesTypes(s: ReadonlySet<TypeCible>, avecAction: boolean): Partial<TargetSpec> {
  // "self" / "damage_source" visent la source : ils doivent se résoudre
  // automatiquement. On force designation:"automatic" (et count:1), sinon le
  // "choice" par défaut resterait stocké et casserait la résolution (le
  // déclencheur serait perdu — cf. Ours Maudit fin de tour).
  if (s.has("self")) return { entity: "self", designation: "automatic", count: 1, cardKind: undefined };
  if (s.has("damage_source")) return { entity: "damage_source", designation: "automatic", count: 1, cardKind: undefined };
  if (s.has("hero")) return { entity: s.has("unit") ? "both" : "hero", cardKind: undefined };
  const u = s.has("unit"), a = s.has("spell"), o = s.has("item");
  if (o && !u && !a) return { entity: "item", cardKind: undefined };
  return {
    entity: o ? "unit_or_item" : "unit",
    cardKind: !avecAction || u === a ? undefined : u ? "creature" : "spell",
  };
}
