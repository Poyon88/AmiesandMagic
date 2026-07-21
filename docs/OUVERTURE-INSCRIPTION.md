# Ouverture des inscriptions — état et prérequis

Au 2026-07-21. Fait suite au chantier « finaliser l'inscription » et au passage au
modèle économique **« une faction offerte »**.

---

## Ce qui est livré et vérifié

Parcours complet validé en conditions réelles sur la base de production :
**inscription → choix du pseudo → choix de la faction → collection filtrée**.

- **L'inscription ne peut plus être un cul-de-sac.** `signUp` ne lisait jamais sa
  réponse : confirmation par email, email déjà pris et OAuth annulé finissaient
  tous sur `/login` sans le moindre message. Un email déjà inscrit affiche
  volontairement **le même écran** qu'une inscription réussie — distinguer les
  deux livrerait la liste des comptes existants.
- **Pseudo unique**, validé (3-20 caractères, `[A-Za-z0-9_-]`, liste de noms
  réservés), insensible à la casse. Le trigger suffixe en cas de collision au
  lieu d'échouer.
- **Pages légales** `/legal/cgu` et `/legal/confidentialite` + case de
  consentement obligatoire, horodatée dans `profiles.cgu_accepted_at`.
- **Modèle « une faction offerte »** : un nouveau joueur reçoit les communes de
  la faction qu'il choisit, plus les neutres (Mercenaires). Les comptes
  antérieurs conservent leur accès (`legacy_full_access`).
- **Cartes verrouillées visibles** dans la collection, grisées et cadenassées :
  sans elles, l'offre de déblocage serait invisible.
- **Octroi manuel** depuis l'admin (`set_all_commons_unlocked`), qui tient lieu
  d'encaissement en attendant un prestataire de paiement.

Migrations **appliquées en production** : `supabase-migration-signup-username.sql`
puis `supabase-migration-faction-entitlements.sql`.

---

## Prérequis avant d'ouvrir au public

L'ordre compte : le point 2 dépend du point 1.

### 1. Brancher un SMTP tiers — **bloquant**

Le service d'email intégré de Supabase plafonne à quelques envois par heure et
est explicitement prévu pour le développement. Rencontré en test :
`email rate limit exceeded` après trois inscriptions.

→ Authentication → Emails → SMTP Settings (Resend, Brevo, Postmark…).

Sans cela, les premiers joueurs ne recevront tout simplement pas leur email de
confirmation.

### 2. Réactiver « Confirm email » — **bloquant**

⚠️ **Il est DÉSACTIVÉ aujourd'hui**, volontairement, pour débloquer les tests
(cf. point 1). En l'état, n'importe qui peut créer un compte avec une adresse
inexistante.

→ Authentication → Providers → Email → « Confirm email ».

Le code gère les deux cas sans modification : avec confirmation, l'écran
« vérifie ta boîte mail » s'affiche, avec un renvoi verrouillé 60 s.

### 3. Rédiger le texte juridique

`/legal/cgu` (10 sections) et `/legal/confidentialite` (9 sections) ne sont que
des **squelettes** : titres et encadrés « À COMPLÉTER ». Les pages portent
`robots: noindex` tant qu'elles sont vides.

Le contenu n'a délibérément pas été rédigé : un texte plausible mais inventé est
plus dangereux qu'une page vide. Les commentaires en tête de chaque fichier
listent les éléments **factuels vérifiables dans le code** à y reprendre (OAuth
Google/Discord, sous-traitants Supabase et Netlify, pseudo visible des autres
joueurs, revente entre joueurs désactivée par drapeau).

### 4. Propager les traductions

Environ 60 clés françaises ont été ajoutées (namespaces `auth`, `legal`, `deck`)
et **ne sont pas traduites**. Les 7 autres locales afficheront le français.

```
node scripts/translate-messages.mjs
```

Consomme `ANTHROPIC_API_KEY`. Ne jamais éditer les locales cibles à la main.

### 5. Réparer les comptes orphelins

2 comptes existent dans `auth.users` sans ligne `profiles` (voir la section
suivante). Ils se réparent seuls au premier passage sur l'accueil grâce à
`src/lib/auth/ensureProfile.ts`, ou immédiatement :

```sql
insert into public.profiles (id, username, username_confirmed, cgu_accepted_at)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data ->> 'username'), ''),
                'Player_' || left(u.id::text, 8)),
       false,
       (u.raw_user_meta_data ->> 'cgu_accepted_at')::timestamptz
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
on conflict (id) do nothing;
```

---

## Point ouvert : le trigger `handle_new_user`

**Symptôme** : à l'inscription, Supabase renvoyait `Database error saving new
user`. Le trigger levait une exception, ce qui annule la création du compte.

**État** : plus bloquant. La migration l'enveloppe dans `exception when others`,
et `ensureProfile` recrée le profil manquant côté application. Mais **la cause
n'est pas identifiée** — le filet l'a rendue silencieuse : le compte se crée, le
profil non.

**Pistes déjà écartées par mesure**, à ne pas refaire :

- RLS / droits : la fonction appartient à `postgres` et est `SECURITY DEFINER`,
  donc même contexte que le SQL Editor ;
- unicité du pseudo : aucun doublon, l'index s'est créé sans erreur ;
- colonnes manquantes : `username_confirmed` et `cgu_accepted_at` existent ;
- `profiles_id_fkey` : réelle, mais le trigger est `AFTER INSERT`, la ligne
  `auth.users` existe donc déjà.

**Pour trancher** : la table `public.trigger_diagnostics` est en place et le
handler y écrit `sqlstate` + `message`. Il suffit d'une inscription pour obtenir
la réponse :

```sql
select occurred_at, sqlstate, message, metadata
  from public.trigger_diagnostics order by occurred_at desc limit 5;
```

---

## Reste à faire, non bloquant

- **Le paiement.** Aucun prestataire n'est intégré. Le droit `all_commons_unlocked`
  est un simple booléen : un futur webhook n'aura qu'à le basculer, rien d'autre
  à reprendre.
- **Un deck de départ.** Un nouveau joueur doit construire ses 50 cartes à la
  main. L'approche retenue si le besoin se confirme : marquer des decks
  `is_starter` construits dans le deck builder, puis les cloner — plutôt que de
  générer un deck valide par programme, ce qui est fragile (règles de capacités,
  mono-clan, héros, format).
- **Charge d'affichage.** La collection peut désormais rendre tout le catalogue
  pour un joueur ordinaire (cartes verrouillées comprises). Ce n'est pas un cas
  nouveau — admins et testeurs en font déjà autant — mais cela mérite une
  vérification sur iPad, où ce projet a déjà rencontré des limites de rendu.

---

## Pièges rencontrés, à ne pas réapprendre

- **Next 16 a renommé `middleware.ts` en `proxy.ts`.** Chercher l'ancien nom
  fait conclure à tort qu'il n'y a pas de rafraîchissement de session. Le build
  échoue explicitement si les deux fichiers coexistent.
- **`src/proxy.ts` porte la liste des chemins publics** (`PUBLIC_PATH_PREFIXES`).
  Toute nouvelle page publique doit y être ajoutée, sinon elle est
  silencieusement redirigée vers `/login`. C'est ce qui rendait `/landing`
  invisible aux visiteurs non connectés — le public qu'elle vise.
- **Le SQL Editor de Supabase avale des caractères** au collage de longs
  scripts. Passer par `pbcopy < fichier.sql`, et translittérer en ASCII : les
  accents déclenchent en plus un dialogue d'encodage si le fichier est ouvert
  dans TextEdit. L'éditeur n'affiche par ailleurs que le résultat de la
  **dernière** requête d'un script.
