-- ============================================================================
-- Voix d'entrée en jeu : clan + nom sans race (2026-10-13)
-- ============================================================================
--
-- `clan` (facultatif, NULL = voix commune à la race) distingue les accents
-- d'une même race répartie sur plusieurs clans (les Humains en ont 17).
-- Le nom perd son préfixe de race et prend celui du clan :
-- « <clan sans article>_<fichier>_<genre> » (cf. nomVoix,
-- src/lib/audio/voice-sfx.ts). Sans la race, il n'est plus unique que PAR RACE.
-- Les fichiers ne bougent pas : des cartes pointent sur leur URL.

ALTER TABLE public.voice_sfx ADD COLUMN IF NOT EXISTS clan TEXT;

ALTER TABLE public.voice_sfx DROP CONSTRAINT IF EXISTS voice_sfx_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS voice_sfx_race_name_key ON public.voice_sfx (race, name);
CREATE INDEX IF NOT EXISTS voice_sfx_race_clan_gender_idx ON public.voice_sfx (race, clan, gender);

-- Reprise des 190 voix : chaque race n'a qu'un clan côté cartes (Elfes : le
-- dossier voices/Hauts-Elfes). Aucun de ces fichiers ne commence par son clan,
-- donc le préfixe s'ajoute toujours (même résultat que nomVoix).
UPDATE public.voice_sfx v SET clan = m.clan,
  name = m.prefixe || '_' || regexp_replace(v.source_filename, '\.[A-Za-z0-9]{2,5}$', '') || '_' || v.gender
FROM (VALUES
  ('Nains', 'La Forge Ardente', 'Forge_Ardente'),
  ('Kobolds', 'Clan des Mille Tunnels', 'Clan_des_Mille_Tunnels'),
  ('Gnomes', 'La Guilde des Ingénieurs', 'Guilde_des_Ingénieurs'),
  ('Hommes-Arbres', 'La Combe Verte', 'Combe_Verte'),
  ('Elfes', 'Les Hauts-Elfes', 'Hauts-Elfes')
) AS m(race, clan, prefixe)
WHERE v.race = m.race AND v.clan IS NULL AND v.source_filename IS NOT NULL;

-- Bucket `sfx-tracks` : l'écran d'import des voix accepte le m4a et 10 Mo, mais
-- le bucket refusait le m4a (« Upload échoué (400) ») et plafonnait à 5 Mo.
-- Les autres écrans de sons gardent leur propre plafond de 5 Mo côté client.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['audio/mpeg','audio/ogg','audio/wav','audio/webm','audio/mp4','audio/x-m4a','audio/m4a'],
    file_size_limit = 10485760
WHERE id = 'sfx-tracks';
