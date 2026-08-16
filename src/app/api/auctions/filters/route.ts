// GET /api/auctions/filters — les valeurs réellement PRÉSENTES dans les
// enchères actives.
//
// Pourquoi ne pas servir les listes complètes du jeu : 36 clans et ~150
// capacités existent, mais l'hôtel des ventes n'en propose qu'une poignée à un
// instant donné. Un menu qui offre 36 clans dont 35 ne rendent rien fait perdre
// du temps à chaque essai — c'est la même leçon que la rareté « Commune »
// retirée du filtre.
//
// Le prix est une requête de plus au chargement de la page ; en échange, aucun
// choix du menu ne peut mener à une liste vide.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KEYWORD_LABELS } from '@/lib/game/keyword-labels';
import type { Keyword } from '@/lib/game/types';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface CardBrief {
  clan: string | null;
  keywords: string[] | null;
  spell_keywords: Array<{ id?: string }> | null;
}

export async function GET() {
  const supabase = getAdminClient();

  // Les cartes des enchères ACTIVES, en une requête. Le volume est celui du
  // marché ouvert — quelques dizaines de lignes, pas un catalogue.
  const { data, error } = await supabase
    .from('auction_items')
    .select('auction:auctions!inner(status), card:cards(clan, keywords, spell_keywords), source_type, source_id')
    .eq('auction.status', 'active');

  if (error) {
    console.error('[auctions/filters]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Array<{ card: CardBrief | null; source_type: string; source_id: number | null }>;

  const clans = new Set<string>();
  const abilities = new Set<string>();
  const printIds: number[] = [];

  for (const r of rows) {
    if (r.card?.clan) clans.add(r.card.clan);
    for (const k of r.card?.keywords ?? []) abilities.add(k);
    for (const sk of r.card?.spell_keywords ?? []) if (sk?.id) abilities.add(sk.id);
    if (r.source_type === 'print' && r.source_id != null) printIds.push(r.source_id);
  }

  // Numéros d'exemplaire réellement en vente : sert à borner le champ de saisie
  // plutôt qu'à peupler un menu (ils peuvent être nombreux et dispersés).
  let printNumbers: number[] = [];
  if (printIds.length > 0) {
    const { data: prints } = await supabase
      .from('card_prints').select('print_number').in('id', printIds);
    printNumbers = [...new Set((prints ?? [])
      .map((p) => p.print_number as number | null)
      .filter((n): n is number => n != null))].sort((a, b) => a - b);
  }

  return NextResponse.json({
    clans: [...clans].sort((a, b) => a.localeCompare(b, 'fr')),
    // Libellé résolu ici : le navigateur n'a pas à connaître le registre des
    // capacités, et l'ordre alphabétique porte sur ce qui est AFFICHÉ.
    abilities: [...abilities]
      .map((id) => ({ id, label: KEYWORD_LABELS[id as Keyword] ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    printNumbers,
  });
}
