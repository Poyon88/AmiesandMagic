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
- **Protection anti-robot Cloudflare Turnstile** sur les trois flux
  d'authentification, active et vérifiée côté serveur.

Migrations **appliquées en production** : `supabase-migration-signup-username.sql`
puis `supabase-migration-faction-entitlements.sql`.

---

## Prérequis avant d'ouvrir au public

L'ordre compte : le point 2 dépend du point 1.

### ~~1. Brancher un SMTP tiers~~ — **FAIT** (2026-07-22)

Le service intégré de Supabase plafonnait à quelques envois par heure — rencontré
en test : `email rate limit exceeded` après trois inscriptions. Un prestataire
tiers est branché, et la réinitialisation de mot de passe a été validée de bout
en bout.

**Piège associé, également traité** : brancher le SMTP ne relève PAS
automatiquement le plafond appliqué par Supabase. Il se règle à part, dans
Authentication → Rate Limits → « Rate limit for sending emails », et ce budget
est **global** (confirmations + réinitialisations + changements d'adresse). Le
champ n'est modifiable que lorsqu'un SMTP tiers est configuré — c'est d'ailleurs
un bon indicateur que la configuration a pris.

### 2. Vérifier l'état de « Confirm email »

Authentication → Providers → Email → « Confirm email ».

Il a été **désactivé temporairement** le 2026-07-21 pour débloquer les tests,
puis l'état a changé sans être retracé. À confirmer avant l'ouverture : sans
confirmation, n'importe qui crée un compte avec une adresse inexistante.

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

## URL Configuration — le réglage qui ne se voit qu'en production

**Authentication → URL Configuration.** Supabase valide chaque `emailRedirectTo`
contre une liste blanche. Si l'URL n'y figure pas, il ne renvoie **aucune
erreur** : il retombe silencieusement sur la *Site URL* du projet.

Rencontré le 2026-07-22 : un compte créé sur le site en ligne recevait bien son
email de confirmation, mais le lien renvoyait vers `localhost:3000` — la Site URL
étant restée sur sa valeur de développement. Le code était hors de cause,
`emailRedirectTo` transmettant bien l'origine réelle.

Doivent y figurer :

- **Site URL** → l'adresse de production en `https://` ;
- **Redirect URLs** → `https://<domaine-prod>/**` **et** `http://localhost:3000/**`,
  faute de quoi le développement local casse à son tour.

Le `/**` couvre les deux chemins utilisés par le code : `/auth/callback` et
`/auth/callback?next=/auth/reset-password`.

⚠️ La **réinitialisation de mot de passe** emprunte la même liste blanche. La
tester en local ne prouve donc rien pour la production : `localhost` y est
autorisé, le domaine de production peut ne pas l'être. Les deux flux doivent
être vérifiés en ligne.

Les emails **déjà envoyés** conservent leur ancien lien ; seuls les nouveaux
prennent la bonne adresse.

---

## Protection anti-robot (Turnstile)

Active en production. Points à connaître avant d'y toucher :

- **La protection Supabase n'est pas décomposable par point d'entrée.** L'activer
  couvre inscription, connexion ET réinitialisation de mot de passe. Un widget
  qui ne couvrirait que l'inscription rendrait la connexion impossible.
- **Le jeton est à USAGE UNIQUE.** `consumeCaptcha()` réinitialise le widget
  après chaque tentative ; sans cela le deuxième essai échoue sur
  `timeout-or-duplicate`, erreur que l'utilisateur ne peut relier à son geste.
  Ce défaut ne se voit **jamais au premier essai** — tout test doit en enchaîner
  deux.
- **Clé publique** dans `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (`.env.local` **et**
  Netlify, tous contextes). Étant `NEXT_PUBLIC_*`, elle est figée au build : une
  variable ajoutée après coup exige un redéploiement.
- **Clé secrète** uniquement dans Supabase. Nulle part ailleurs.
- **Ordre d'activation** : déployer le code qui transmet le jeton AVANT
  d'activer la protection côté Supabase. L'inverse casse l'authentification en
  production — c'est arrivé le 2026-07-22.
- **Retour arrière immédiat** en cas de problème : désactiver la protection dans
  Supabase rend le site fonctionnel sans redéploiement.

Sonde pour savoir si la protection est réellement active :

```bash
URL=$(grep -oE '^NEXT_PUBLIC_SUPABASE_URL=.*' .env.local | cut -d= -f2-)
KEY=$(grep -oE '^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*' .env.local | cut -d= -f2-)
curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"email":"sonde@example.invalid","password":"bidon"}'
```

`invalid_credentials` = inactive · `captcha_failed` = active.

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
