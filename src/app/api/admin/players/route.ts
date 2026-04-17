import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };

  const supabase = getAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) };
  }
  return { user, supabase };
}

// GET /api/admin/players — list all players with auth info
export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;
  const { supabase } = auth as { user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>; supabase: ReturnType<typeof getAdminClient> };

  // Fetch profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, role, created_at')
    .order('username');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch auth users for email and ban status
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUsers = authData?.users ?? [];
  const authMap = new Map(authUsers.map(u => [u.id, u]));

  // Fetch wallet balances
  const { data: wallets } = await supabase
    .from('wallets')
    .select('user_id, balance');
  const walletMap = new Map((wallets ?? []).map(w => [w.user_id, w.balance]));

  // Fetch collection counts
  const { data: collections } = await supabase
    .from('user_collections')
    .select('user_id');
  const collectionCounts = new Map<string, number>();
  for (const c of collections ?? []) {
    collectionCounts.set(c.user_id, (collectionCounts.get(c.user_id) ?? 0) + 1);
  }

  // Fetch owned prints count
  const { data: prints } = await supabase
    .from('card_prints')
    .select('owner_id')
    .not('owner_id', 'is', null);
  const printCounts = new Map<string, number>();
  for (const p of prints ?? []) {
    if (p.owner_id) printCounts.set(p.owner_id, (printCounts.get(p.owner_id) ?? 0) + 1);
  }

  const players = (profiles ?? []).map(p => {
    const authUser = authMap.get(p.id);
    return {
      id: p.id,
      username: p.username,
      email: authUser?.email ?? null,
      role: p.role,
      banned: authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false,
      banned_until: authUser?.banned_until ?? null,
      gold: walletMap.get(p.id) ?? 0,
      cards_collected: collectionCounts.get(p.id) ?? 0,
      prints_owned: printCounts.get(p.id) ?? 0,
      last_sign_in: authUser?.last_sign_in_at ?? null,
      created_at: p.created_at,
    };
  });

  return NextResponse.json({ players });
}

// POST /api/admin/players — perform action on a player
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;
  const { supabase } = auth as { user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>; supabase: ReturnType<typeof getAdminClient> };

  const body = await request.json();
  const { action, userId, value } = body as {
    action: string;
    userId: string;
    value?: string;
  };

  if (!action || !userId) {
    return NextResponse.json({ error: 'action et userId requis' }, { status: 400 });
  }

  switch (action) {
    case 'reset_password': {
      // Generate a password reset link
      if (!value) return NextResponse.json({ error: 'Nouveau mot de passe requis' }, { status: 400 });
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: value,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, message: 'Mot de passe réinitialisé' });
    }

    case 'change_role': {
      if (!value || !['player', 'testeur', 'admin'].includes(value)) {
        return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
      }
      const { error } = await supabase
        .from('profiles')
        .update({ role: value })
        .eq('id', userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, message: `Rôle changé en ${value}` });
    }

    case 'suspend': {
      // Ban for a duration (value = ISO date or 'permanent')
      const banUntil = value === 'permanent'
        ? new Date('2099-12-31').toISOString()
        : value ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Default 7 days
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: banUntil === new Date('2099-12-31').toISOString() ? 'none' : undefined,
        user_metadata: { banned_until: banUntil },
      });
      // Use banned_until approach
      const { error: error2 } = await supabase.auth.admin.updateUserById(userId, {
        banned_until: banUntil,
      } as Parameters<typeof supabase.auth.admin.updateUserById>[1]);
      if (error || error2) return NextResponse.json({ error: (error || error2)?.message }, { status: 500 });
      return NextResponse.json({ success: true, message: 'Joueur suspendu' });
    }

    case 'unsuspend': {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        banned_until: 'none' as unknown as string,
      } as Parameters<typeof supabase.auth.admin.updateUserById>[1]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, message: 'Suspension levée' });
    }

    case 'change_username': {
      if (!value || value.trim().length < 2) {
        return NextResponse.json({ error: 'Nom d\'utilisateur invalide' }, { status: 400 });
      }
      const { error } = await supabase
        .from('profiles')
        .update({ username: value.trim() })
        .eq('id', userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, message: 'Nom modifié' });
    }

    case 'change_email': {
      if (!value || !value.includes('@')) {
        return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
      }
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        email: value,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, message: 'Email modifié' });
    }

    case 'delete': {
      // Delete auth user (cascades to profiles)
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, message: 'Joueur supprimé' });
    }

    default:
      return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 });
  }
}
