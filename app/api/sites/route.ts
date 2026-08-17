import { NextRequest, NextResponse } from 'next/server';
import { getSession, generateApiKey } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await query(
    `SELECT id, domain, gtm_container_id, ga4_measurement_id, gads_conversion_id,
            meta_pixel_id, tiktok_pixel_id, api_key, first_party_domain, created_at
     FROM sites WHERE user_id = $1 ORDER BY created_at DESC`,
    [s.uid]
  );
  return NextResponse.json({ sites: result.rows });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { domain, gtm_container_id, ga4_measurement_id, gads_conversion_id, meta_pixel_id, tiktok_pixel_id, first_party_domain } = body;
  if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 });

  const apiKey = generateApiKey();
  const result = await query(
    `INSERT INTO sites
       (user_id, domain, gtm_container_id, ga4_measurement_id, gads_conversion_id,
        meta_pixel_id, tiktok_pixel_id, first_party_domain, api_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, api_key`,
    [s.uid, domain, gtm_container_id || null, ga4_measurement_id || null,
     gads_conversion_id || null, meta_pixel_id || null, tiktok_pixel_id || null,
     first_party_domain || null, apiKey]
  );
  return NextResponse.json({ site: result.rows[0] });
}
