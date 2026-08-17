import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const siteId = new URL(req.url).searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const owner = await query('SELECT id FROM sites WHERE id = $1 AND user_id = $2', [siteId, s.uid]);
  if (!owner.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const totals = await query(
    `SELECT
       (SELECT COUNT(*) FROM adblock_events WHERE site_id = $1 AND detected_at > NOW() - INTERVAL '24 hours') as blocked_24h,
       (SELECT COUNT(DISTINCT client_id)
 FROM events
 WHERE site_id = $1
 AND received_at > NOW() - INTERVAL '24 hours')`,
    [siteId]
  );

  const byMethod = await query(
    `SELECT detection_method, COUNT(*)::int as cnt
     FROM adblock_events WHERE site_id = $1 AND detected_at > NOW() - INTERVAL '24 hours'
     GROUP BY detection_method ORDER BY cnt DESC`,
    [siteId]
  );

  const recent = await query(
    `SELECT detection_method, page_url, user_agent, detected_at
     FROM adblock_events WHERE site_id = $1
     ORDER BY detected_at DESC LIMIT 50`,
    [siteId]
  );

  return NextResponse.json({
    totals: totals.rows[0],
    byMethod: byMethod.rows,
    recent: recent.rows,
  });
}
