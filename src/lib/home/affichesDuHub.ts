// Les illustrations des tuiles du hub : de vraies cartes du catalogue, une par
// faction, qui changent chaque jour. Fonction pure — la page serveur lui passe
// les lignes et le jour, le test aussi.

export interface LigneIllustration {
  id: number;
  faction: string | null;
  image_url: string | null;
}

/** Numéro du jour (UTC) : la sélection tourne à minuit, pas à chaque visite. */
export function jourCourant(maintenant: number = Date.now()): number {
  return Math.floor(maintenant / 86_400_000);
}

/**
 * `n` illustrations de factions toutes différentes. Le jour décale à la fois
 * la faction de départ et la carte retenue dans chaque faction : deux jours
 * de suite ne montrent pas le même hub. Moins de `n` factions illustrées ⇒
 * moins de `n` résultats, à l'appelant de prévoir un repli.
 */
export function choisirAffiches(
  lignes: LigneIllustration[],
  factionsAdmises: (faction: string) => boolean,
  jour: number,
  n: number,
): string[] {
  const parFaction = new Map<string, string[]>();
  for (const l of [...lignes].sort((a, b) => a.id - b.id)) {
    if (!l.faction || !l.image_url || !factionsAdmises(l.faction)) continue;
    const liste = parFaction.get(l.faction) ?? [];
    liste.push(l.image_url);
    parFaction.set(l.faction, liste);
  }
  const factions = [...parFaction.keys()].sort();
  if (factions.length === 0) return [];
  const j = Math.abs(Math.trunc(jour));
  const out: string[] = [];
  for (let i = 0; i < Math.min(n, factions.length); i++) {
    const images = parFaction.get(factions[(j + i) % factions.length])!;
    out.push(images[j % images.length]);
  }
  return out;
}
