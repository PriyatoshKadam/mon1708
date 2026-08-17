import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const allowed = ['domain', 'gtm_container_id', 'ga4_measurement_id', 'gads_conversion_id',
                   'meta_pixel_id', 'tiktok_pixel_id', 'first_party_domain', 'slack_webhook_url'];
  const updates: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const k of allowed) {
    if (k in body) {
      updates.push(`${k} = $${i++}`);
      values.push(body[k] || null);
    }
  }
  if (!updates.length) return NextResponse.json({ ok: true });
  values.push(params.id, s.uid);
  await query(
    `UPDATE sites SET ${updates.join(', ')} WHERE id = $${i} AND user_id = $${i + 1}`,
    values
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await query('DELETE FROM sites WHERE id = $1 AND user_id = $2', [params.id, s.uid]);
  return NextResponse.json({ ok: true });
}
