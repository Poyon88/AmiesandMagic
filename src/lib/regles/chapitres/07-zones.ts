import type { Chapitre } from "../livret";

export const zones: Chapitre = {
  id: "zones",
  titre: "Changer de zone : ce qu'une unité garde",
  texte: () => `
Une unité qui change de zone reste la **même carte** : elle n'est pas recréée à neuf. Cela vaut pour un retour en main (Remontée), une sortie du cimetière vers le terrain ou la main (Exhumation, Rappel, Résurrection, Cycle éternel) et un renvoi dans le deck (Retour différé).

**Ce qu'elle garde.**
- Ses bonus et malus d'ATK et de PV permanents : Renforcement, Gloire, Entrainement, Affaiblissement, tout « +X/+Y » ou « -X/-Y » donné par une action ou une capacité, et les gains de Loyauté, Nécrophagie, Richesse, Instinct de meute et Dévoration.
- Les capacités qu'on lui a conférées.
Une unité morte garde donc ses bonus au cimetière, et les retrouve si elle revient.

**Ce qu'elle perd.**
- Les bonus qui dépendent du terrain, recalculés à son retour selon la situation du moment : auras comme Commandement, Sang mêlé, Force des ancêtres, Pureté, Seuil Sacrificiel ; la Fureur en cours.
- Le bonus de son objet : l'objet se détache et reste en jeu.
- Les valeurs relevées par un emblème ou un objet.
- Ses blessures, et ses états : Poison, Peste (sauf si elle la porte sur sa carte), Paralysie, neutralisation subie.
- Les décomptes de Retard en cours (ils repartent de zéro si elle est rejouée) et l'action mémorisée par Apprentissage.

**Ce qui se réarme.** Bouclier, Esquive, Ombre et Résurrection sont de nouveau disponibles. L'unité subit de nouveau le mal d'invocation (sauf Traque).

**PV au retour.** Elle revient soignée, à ses PV maximum bonus compris. Exception : Résurrection la fait revenir à 1 PV (avec ses bonus d'ATK).

**Effets d'entrée.** Rejouée, ses effets « à l'entrée en jeu » se déclenchent de nouveau, et leurs gains s'ajoutent aux bonus conservés.

**Unité volée.** Une unité dont l'adversaire a pris le contrôle (Domination) retourne à son propriétaire d'origine quand elle quitte le terrain : dans sa main, son cimetière ou son deck.

**En main.** Aucune capacité n'est active, protections comprises. Une unité blessée en main par un effet garde sa blessure (ses PV s'affichent en rouge) ; tombée à 0 PV en main, elle part au cimetière sans déclencher d'effet de mort.

**Silence.** C'est le Silence, et non le changement de zone, qui efface les gains personnels d'une unité et la ramène à ses ATK/PV imprimés. Il ne soigne pas, ne peut pas tuer, et ne touche ni aux auras ni au bonus d'un objet équipé.
`,
};
