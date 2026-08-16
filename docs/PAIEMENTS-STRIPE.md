# Paiements Stripe — circuit fermé

> **Conformité.** L'argent réel **entre** (inscriptions aux tournois payants,
> achats de packs de pièces d'or) et **ne ressort jamais** vers les joueurs. Les
> pièces d'or sont une monnaie interne : non convertibles en euros, non
> transférables, non remboursables — le seul argent qui repart est le
> remboursement Stripe du paiement d'origine, vers le moyen de paiement
> d'origine.
>
> N'ajoutez **aucun** mécanisme de sortie d'argent (payout, retrait, revente
> contre euros, Stripe Connect, transfert entre joueurs) sans revalidation
> juridique préalable : agrément PSD2 et qualification « jeu d'argent » sont en
> jeu. Un test (`payment-surface.test.ts`) échoue si une telle route apparaît.

---

## Comment ça marche

Un seul principe : **le webhook fait foi**. La redirection de succès ne crédite
rien — elle peut ne jamais arriver, et son URL est devinable.

```
navigateur          serveur A&M                Stripe
    │  clic « acheter »   │                        │
    ├────────────────────►│  crée la session       │
    │                     ├───────────────────────►│   (prix = price_id serveur)
    │                     │  écrit payments        │
    │                     │  status = pending      │
    │◄────────────────────┤  url de redirection    │
    │                                              │
    ├──────────── paie sur la page Stripe ────────►│
    │                                              │
    │                     │◄── webhook signé ──────┤   checkout.session.completed
    │                     │  apply_checkout_completed()
    │                     │  → pending → completed
    │                     │  → crédite l'or / inscrit au tournoi
    │◄─ /paiement/succes ─┤  (sonde le statut, n'écrit rien)
```

Tout l'effet de bord vit dans des **fonctions PL/pgSQL** (voir
`supabase-migration-stripe-payments.sql`) : atomiques par construction, et
gardées par le statut du paiement, donc **rejouables sans effet**. Stripe
redélivre ses événements ; un rejeu ne doit jamais recréditer.

## Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `STRIPE_SECRET_KEY` | serveur | Clé secrète (`sk_test_…` en développement). **Jamais côté client.** |
| `STRIPE_WEBHOOK_SECRET` | serveur | Secret de signature du webhook (`whsec_…`). |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | Clé publiable. Non utilisée par Checkout hébergé, prévue pour la suite. |
| `STRIPE_PRICE_TICKET_PACK_S` | serveur | `price_…` du ticket à l'unité (2,50 €). |
| `STRIPE_PRICE_TICKET_PACK_M` | serveur | `price_…` du carnet de 5 (11,50 €). |
| `STRIPE_PRICE_TICKET_PACK_L` | serveur | `price_…` du carnet de 12 (25,00 €). |
| `STRIPE_PRICE_TOURNAMENT_ENTRY` | serveur | **Historique.** Plus aucun code ne l'utilise depuis le passage aux tickets. |
| `STRIPE_PRICE_GOLD_PACK_S` | serveur | `price_…` du petit pack. |
| `STRIPE_PRICE_GOLD_PACK_M` | serveur | `price_…` du pack moyen. |
| `STRIPE_PRICE_GOLD_PACK_L` | serveur | `price_…` du grand pack. |
| `NEXT_PUBLIC_SITE_URL` | serveur | Base des URL de retour. À défaut, l'origine de la requête. |

Les montants d'or de chaque pack sont dans `src/lib/payments/config.ts`. Les
prix en euros, eux, vivent **chez Stripe** : le champ `displayPriceCents` du
code n'est qu'un affichage, et doit être tenu d'accord avec le Price
correspondant.

## Mise en place (mode test)

1. **Créer les produits et prix** dans le tableau de bord Stripe, en mode test :
   une entrée de tournoi à 2,50 €, et trois packs de pièces d'or. Relever les
   quatre `price_…` et les mettre dans `.env.local`.

2. **Appliquer la migration** `supabase-migration-stripe-payments.sql` dans le
   SQL Editor Supabase.

3. **Installer le CLI Stripe** puis se connecter :

   ```bash
   brew install stripe/stripe-cli/stripe   # macOS
   stripe login
   ```

## Tester les webhooks en local

Le webhook est une route Next (`/api/stripe/webhook`), donc une fonction
serverless une fois déployée sur Netlify — rien à configurer de plus.

```bash
# terminal 1
npm run dev

# terminal 2 — redirige les événements vers le serveur local
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

`stripe listen` affiche au démarrage un secret `whsec_…` : c'est **celui-là**
qu'il faut mettre dans `STRIPE_WEBHOOK_SECRET` pendant le développement, et non
celui du tableau de bord.

Cartes de test :

| Numéro | Comportement |
|---|---|
| `4242 4242 4242 4242` | Paiement accepté |
| `4000 0000 0000 9995` | Refus pour fonds insuffisants |
| `4000 0025 0000 3155` | Demande une authentification 3-D Secure |

Date d'expiration future quelconque, CVC quelconque.

Pour rejouer un événement à la main (vérifier l'idempotence sans repayer) :

```bash
stripe events resend evt_xxx
```

## Tickets de tournoi

**On n'achète pas une place, on achète un ticket.** Le ticket est un bien
détenu : valable **365 jours**, dépensable dans le tournoi de son choix. C'est
ce découplage qui fait qu'une inscription ne touche plus jamais Stripe — et qui
a supprimé du même coup le cas « tournoi rempli pendant le paiement ».

```
Boutique   → achat de tickets           (Stripe, webhook, 365 jours de validité)
Tournoi    → dépense d'un ticket        (aucun argent réel, une transaction SQL)
```

Un tournoi porte un **type** (`tournaments.kind`) qui dit ce qu'il coûte :

| Type | Coût | Usage |
|---|---|---|
| `weekly` | 1 ticket | le circuit payant régulier |
| `special` | 1 ticket | événements ponctuels |
| `free` | rien | initiation, circuit gratuit |

La règle vit **en base**, dans `tournament_requires_ticket(kind)` : les écrans la
lisent, ils ne la recopient pas.

**Consommation.** On dépense toujours le ticket qui **périme le plus tôt** —
sinon un joueur laisserait expirer un ticket encore valable pendant qu'un autre
dort. Un échec (tournoi complet, déjà inscrit, fermé) ne brûle jamais de ticket :
tout est dans une transaction unique.

**Péremption et affichage.** `expires_at` est une borne **exclusive**. Un ticket
acheté le 16 août 2026 porte `expires_at = 2027-08-16` et se présente au joueur
comme « valable jusqu'au **15 août 2027** ». Les écrans affichent `last_day`,
jamais `expires_at`, sinon ils annonceraient un jour de trop.

**Restitution.** Un tournoi annulé rend son ticket, **sans repousser la date
d'expiration** — sinon s'inscrire puis se désinscrire deviendrait un moyen de
rafraîchir un ticket indéfiniment.

## Remboursements

Pas de libre-service en V1 : les remboursements se font **manuellement depuis le
tableau de bord Stripe**. Le webhook `charge.refunded` fait le reste :

- **Pack de pièces d'or** — l'or est repris. S'il a déjà été dépensé, on débite
  ce qui reste et le solde manquant devient une **dette**
  (`wallets.gold_debt`). Tant qu'elle n'est pas résorbée, le joueur ne peut
  rien dépenser, et tout gain ultérieur l'éponge en priorité.
- **Pack de tickets** — dans cet ordre : les tickets **encore en main** sont
  annulés ; s'il en manque, les **inscriptions à des tournois non commencés**
  sont retirées et la place repart au pot ; s'il en manque encore, le reliquat
  correspond à des tournois **réellement joués** et devient une **dette de
  tickets** qui bloque toute inscription jusqu'à résorption. Un ticket **offert**
  par l'administration n'est jamais repris : il n'est rattaché à aucun
  encaissement.
- **Inscription à un tournoi** (chemin historique) — la place est rendue si le
  tournoi n'a pas commencé.

> **Pourquoi une dette et non un solde négatif ?** `wallets.balance` porte un
> `CHECK (balance >= 0)`, et ce contrôle est la **seule** chose qui empêche
> d'enchérir sans fonds — `place_bid` n'a aucune garde en propre. L'assouplir
> aurait ouvert un trou dans les enchères.

## Un tournoi qui se remplit pendant le paiement

Les vérifications faites à l'ouverture de la session (tournoi ouvert, place
libre) sont un confort. La vérification qui fait foi est refaite **sous verrou**
à la réception du webhook. Si la place a disparu entre-temps, le paiement est
marqué encaissé — l'argent **a** été pris — puis **remboursé automatiquement**,
et le joueur n'est pas inscrit.

## Tests

```bash
npx vitest run src/lib/payments
```

- `webhook-handlers.test.ts` — le vrai PL/pgSQL de production, exécuté dans un
  Postgres in-process (PGlite). Aucun bouchon : idempotence, tournoi complet,
  reprise d'or déjà dépensé, conservation de la monnaie.
- `tickets.test.ts` — péremption, ordre de consommation, restitution, et les
  trois étages du remboursement. Même banc PGlite, même absence de bouchon.
- `payment-surface.test.ts` — les invariants que le SQL ne peut pas garder :
  aucun montant venu du client, aucune clé secrète côté navigateur, signature
  vérifiée sur le corps brut avant tout effet, aucune route de sortie d'argent.

## Hors périmètre (volontairement)

Retraits en cash · revente de cartes contre euros · Mangopay · Stripe Connect ·
transferts d'argent entre joueurs · KYC joueur · moteur de tournoi (arbre,
appariement, distribution des gains) · TVA/OSS — seul `payments.customer_country`
est déjà capté, pour ce futur chantier.
