import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';

// GET /api/collections/role — list all profiles (admin only)
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from('profiles')
    .select('id, username, role')
    .order('username');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/collections/role — { userId, role } (admin only)
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = auth.supabase;

  const { userId, role } = await request.json() as { userId: string; role: string };

  if (!userId || !['player', 'testeur'].includes(role)) {
    return NextResponse.json({ error: 'userId et role (player|testeur) requis' }, { status: 400 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
