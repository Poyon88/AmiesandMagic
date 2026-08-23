# Le coût d'ÉVEIL

> Écrit à la main. `docs/capacites.md` est généré depuis `abilities.ts` et ne
> recense que les capacités du registre ; l'éveil n'en est pas une, c'est un
> **coût**, porté par la colonne `cards.eveil_cost`.

## En une phrase

Une carte à coût d'éveil peut être **mise en éveil** au lieu d'être jouée : elle
quitte la main pour une zone hors du jeu avec autant de points que son coût
d'éveil, le joueur y verse **1 mana à la fois**, et au dernier point elle entre
en jeu **comme si elle venait de la main**.

## Ce que l'éveil n'est pas

Les cinq coûts existants — vie, défausse, sacrifice, exil, repli — sont
**additionnels** : ils s'ajoutent au coût en mana. L'éveil est le premier coût
**alternatif** général : il le **remplace**. Sur une carte à 8 mana / éveil 3, on
lit « 8 mana **OU** 3 points d'éveil », jamais « 8 **et** 3 ». C'est ce que la
teinte à part de sa pastille (ambre, cf. `eveil-theme.ts`) sert à empêcher de
confondre.

Ce n'est pas non plus une remise : c'est un **échange**. On gagne de pouvoir
poser la carte bien plus tôt qu'on ne pourrait la payer ; on perd le temps
qu'elle met à venir, et le secret — la zone d'éveil est publique.

## Les règles

| Point | Règle |
|---|---|
| Mise en éveil | Depuis la main, à son tour. **Coûte 0 mana.** |
| Premier versement | Possible **dès le même tour**. |
| Montant | Libre : de 1 point jusqu'à **restant − 1**, dans la limite du mana. |
| Réductions | **Aucune.** Ni Canalisation, ni Entraide, ni Concentration, ni Chant — comme les cinq coûts additionnels, seul `mana_cost` est réductible. |
| Coûts additionnels de la carte | Payés **à l'arrivée**, pas à la mise en éveil. |
| Visibilité | **Publique** des deux côtés : la carte est face visible, avec son compteur. |
| Atteignable | **Non.** La carte est hors du jeu : aucune défausse, aucun Silence, aucun ciblage ne la voit. |
| Arrivée impossible | Le **dernier** versement est refusé, rien n'est prélevé, la carte reste en éveil. Causes : plateau plein, sort sans cible valide, coût additionnel impayable. |
| Dernier point | Ne peut **jamais** être fondu dans un versement en gros : c'est l'entrée en jeu, et c'est là qu'on désigne les cibles, la place sur le plateau et les coûts additionnels. |
| Provenance à l'arrivée | Compte comme **posée depuis la main** — Esprit de corps s'incrémente. |
| Créature | Arrive avec le **mal d'invocation**, sauf Traque. |
| Plafond | **3 cartes** en éveil par joueur (`MAX_EVEIL`). |

## Pour l'auteur de cartes

Aucun garde-fou dans la forge : le champ « Éveil » accepte 0 à 10, librement.
Mais gardez en tête que **le premier versement est possible dès le même tour**.
Un coût d'éveil INFÉRIEUR au coût en mana rend donc le coût normal mort-né — la
carte se jouerait toujours par l'éveil, et l'attente n'aurait jamais lieu. Pour
que l'éveil soit un vrai pari sur le temps, il doit coûter **plus cher au
total** que le coût normal.

## Sous le capot

- Colonne `cards.eveil_cost` (nullable ; null ou 0 ⇒ pas d'éveil).
- Zone `PlayerState.eveil: EveilEntry[]` — hashée comme le reste de l'état.
- Deux actions : `suspend_eveil` et `pay_eveil` (qui porte un `amount`, borné
  par `maxEveilPayment` = min(mana, restant − 1) — source unique du moteur et du
  sélecteur de l'interface ; un montant trop grand est refusé, jamais écrêté).
- **Le dernier point et l'entrée en jeu sont UNE SEULE action** : `play_card`
  avec `fromEveil: true`, quatrième provenance de `playCard` après la main, le
  cimetière (Seconde vie) et les sorts mémorisés (Apprentissage). C'est ce qui
  garantit qu'une carte ne séjourne jamais en éveil à zéro point — un état qui
  aurait exigé ses propres règles — et que le refus d'arrivée ne prélève rien.
- Prédicats partagés moteur/interface : `canSuspendToEveil`, `canPayEveil`,
  `maxEveilPayment`, `eveilArrivalBlocker` (qui rend la RAISON du blocage,
  affichée au joueur).
