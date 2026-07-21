-- Inscription — pseudo fiable et consentement (2026-07-21)
-- ---------------------------------------------------------------------------
-- Relevé de l'existant en prod AVANT cette migration :
--   public.profiles = (id uuid NN, username text NN, created_at timestamptz
--                      default now(), role text NN default 'player')
--   AUCUNE contrainte d'unicité sur username · AUCUN doublon (vérifié)
--   trigger on_auth_user_created → public.handle_new_user(), qui faisait
--     seulement : insert into public.profiles (id, username)
--                 values (new.id, coalesce(meta->>'username',
--                                          'Player_' || left(new.id::text, 8)));
--
-- Deux défauts à corriger ENSEMBLE, et dans cet ordre :
--
--   1. l'insert n'a AUCUNE gestion de conflit. Poser l'index unique en premier
--      transformerait la moindre collision de pseudo en échec du trigger, donc
--      en échec de l'INSCRIPTION ENTIÈRE : le joueur reçoit une erreur opaque
--      et aucun compte n'est créé. Le filet doit exister avant le piège.
--   2. rien ne distingue un pseudo CHOISI d'un repli généré, donc rien ne
--      permet de savoir à qui proposer d'en choisir un vrai.
--
-- Idempotente : rejouable sans effet de bord (add column if not exists,
-- create index if not exists, create or replace function).
-- ---------------------------------------------------------------------------

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Colonnes
-- ═══════════════════════════════════════════════════════════════════════

-- Le joueur a-t-il VALIDÉ son pseudo ? false ⇒ /onboarding/pseudo le lui
-- demande au prochain passage. Faux par défaut : un compte OAuth, ou un pseudo
-- suffixé pour cause de collision, n'a été choisi par personne.
alter table public.profiles
  add column if not exists username_confirmed boolean not null default false;

-- Preuve d'acceptation des CGU, horodatée côté client au signUp et transmise
-- dans raw_user_meta_data. Nullable : les comptes antérieurs n'en ont pas, et
-- les comptes OAuth l'obtiennent à l'écran d'accueil.
alter table public.profiles
  add column if not exists cgu_accepted_at timestamptz;

-- Comptes EXISTANTS : on les considère comme ayant validé leur pseudo. Les
-- renvoyer tous vers l'écran de choix serait une surprise désagréable pour des
-- joueurs installés. (Pour inviter aussi les `Player_xxxxxxxx` historiques à en
-- choisir un vrai, remplacer la clause par :
--    where username !~ '^Player_[0-9a-f]{8}$'  )
update public.profiles
   set username_confirmed = true
 where username_confirmed = false;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Unicité du pseudo, insensible à la casse
-- ═══════════════════════════════════════════════════════════════════════
-- Sur lower(username) plutôt qu'en citext : pas d'extension à installer, et
-- l'intention reste lisible. « Grognak » et « grognak » deviennent le même
-- pseudo — deux comptes ne peuvent plus se faire passer l'un pour l'autre.
--
-- Sans doublon en base, l'index se crée directement. S'il échouait malgré tout,
-- c'est qu'un doublon est apparu depuis le relevé :
--   select lower(username), count(*) from public.profiles
--    group by 1 having count(*) > 1;
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Trigger — ne doit JAMAIS faire échouer une inscription
-- ═══════════════════════════════════════════════════════════════════════
-- `security definer` + `search_path = ''` conservés de la version d'origine :
-- tout identifiant doit donc rester qualifié (public.profiles).
--
-- Ce trigger ASSAINIT, il ne VALIDE pas. La règle métier vit dans
-- src/lib/auth/username.ts et l'autorité est la route POST /api/profile/username.
-- Ici, refuser n'est pas une option : le compte auth.users est déjà en train
-- d'être créé, et lever une exception l'annulerait.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_requested text;
  v_base      text;
  v_candidate text;
  v_confirmed boolean;
  v_cgu       timestamptz;
begin
  -- Un pseudo présent dans les métadonnées a été SAISI par le joueur : le
  -- formulaire n'en invente plus (il en générait un auparavant, ce qui rendait
  -- les deux cas indiscernables). Absent ⇒ inscription OAuth ⇒ à faire choisir.
  v_requested := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  v_confirmed := v_requested is not null;

  -- Assainissement : on retire les caractères hors jeu autorisé et on borne à
  -- 20. Ce qui ressort n'est pas forcément joli — c'est un filet, pas la règle.
  v_base := left(regexp_replace(coalesce(v_requested, ''), '[^A-Za-z0-9_-]', '', 'g'), 20);

  -- Trop court après nettoyage (ou absent) : repli sur l'identifiant, unique
  -- par construction.
  if length(v_base) < 3 then
    v_base := 'Player_' || left(new.id::text, 8);
    v_confirmed := false;
  end if;

  v_cgu := (new.raw_user_meta_data ->> 'cgu_accepted_at')::timestamptz;

  -- Collision de pseudo : on suffixe et on retente, plutôt que d'échouer.
  -- Chaque tentative est dans son propre bloc d'exception (sous-transaction) :
  -- c'est la seule façon de rattraper une unique_violation sans perdre
  -- l'insertion. On teste par l'INSERT et non par un `select exists` préalable,
  -- qui laisserait une fenêtre de course entre la vérification et l'écriture.
  for i in 0..20 loop
    begin
      v_candidate := case
        when i = 0 then v_base
        -- 16 + '_' + 2 chiffres ⇒ 19 caractères au plus, sous la borne de 20.
        else left(v_base, 16) || '_' || i::text
      end;

      insert into public.profiles (id, username, username_confirmed, cgu_accepted_at)
      values (new.id, v_candidate, v_confirmed and i = 0, v_cgu);

      return new;
    exception
      when unique_violation then
        -- Le profil existe déjà pour cet utilisateur (rejeu du trigger) :
        -- rien à faire, surtout ne pas écraser.
        if exists (select 1 from public.profiles where id = new.id) then
          return new;
        end if;
        -- Sinon c'est le pseudo qui est pris : on passe au suffixe suivant.
    end;
  end loop;

  -- 21 collisions d'affilée : on tombe sur l'identifiant, unique par
  -- construction. Ne devrait jamais arriver.
  insert into public.profiles (id, username, username_confirmed, cgu_accepted_at)
  values (new.id, 'Player_' || left(new.id::text, 8), false, v_cgu)
  on conflict (id) do nothing;

  return new;

exception
  when others then
    -- Dernier rempart. Une exception non rattrapée ici annulerait la création
    -- du compte dans auth.users : le joueur ne pourrait tout simplement pas
    -- s'inscrire. Un profil manquant se rattrape (voir §4) ; une inscription
    -- refusée sans explication, non.
    raise warning 'handle_new_user: profil non créé pour % (%)', new.id, sqlerrm;
    return new;
end;
$function$;

-- Le trigger lui-même est inchangé et reste en place (AFTER INSERT ON
-- auth.users FOR EACH ROW) : `create or replace function` suffit, il pointe
-- déjà sur cette fonction.

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Rattrapage des comptes sans profil
-- ═══════════════════════════════════════════════════════════════════════
-- Si un profil a été perdu par le passé (le trigger d'origine échouait sans
-- filet), l'utilisateur existe dans auth.users sans ligne dans profiles :
-- l'application affiche « Player » en dur et il n'a pas d'identité.
insert into public.profiles (id, username, username_confirmed)
select u.id, 'Player_' || left(u.id::text, 8), false
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
on conflict (id) do nothing;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- Vérifications après application (doivent toutes passer)
-- ═══════════════════════════════════════════════════════════════════════
-- Aucun compte orphelin :
--   select count(*) from auth.users u
--     left join public.profiles p on p.id = u.id where p.id is null;   -- 0
--
-- L'index existe :
--   select indexname from pg_indexes
--    where tablename = 'profiles' and indexname = 'profiles_username_lower_key';
--
-- Les comptes existants ne seront pas renvoyés vers l'écran de choix :
--   select username_confirmed, count(*) from public.profiles group by 1;
