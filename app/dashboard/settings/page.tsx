'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [sites, setSites] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const res = await fetch('/api/sites');
    if (res.ok) {
      const data = await res.json();
      setSites(data.sites || []);
      if (data.sites.length === 0) setShowAdd(true);
    }
  }

  async function addSite(form: FormData) {
    setSaving(true);
    const body: any = {};
    form.forEach((v, k) => (body[k] = v || null));
    const res = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setShowAdd(false);
      await load();
      router.refresh();
    }
    setSaving(false);
  }

  async function updateSite(id: number, form: FormData) {
    setSaving(true);
    const body: any = {};
    form.forEach((v, k) => (body[k] = v || null));
    const res = await fetch(`/api/sites/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditing(null);
      await load();
    }
    setSaving(false);
  }

  async function deleteSite(id: number) {
    if (!confirm('Delete this site and all its data? This cannot be undone.')) return;
    await fetch(`/api/sites/${id}`, { method: 'DELETE' });
    await load();
    router.refresh();
  }

  return (
    <div className="fade-in max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Sites</h2>
          <p className="text-sm text-ink-500 mt-0.5">Manage the domains you&apos;re monitoring.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-ink-950 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-ink-800">
          {showAdd ? 'Cancel' : '+ Add site'}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={(e) => { e.preventDefault(); addSite(new FormData(e.currentTarget)); }}
          className="bg-white rounded-xl border border-ink-200 p-6 mb-6 space-y-4"
        >
          <h3 className="font-semibold text-ink-950 mb-2">Add a new site</h3>
          <Field name="domain" label="Domain" placeholder="shop.acme.com" required />
          <div className="grid md:grid-cols-2 gap-4">
            <Field name="gtm_container_id" label="GTM Container ID" placeholder="GTM-XXXXXXX" />
            <Field name="ga4_measurement_id" label="GA4 Measurement ID" placeholder="G-XXXXXXXXXX" />
            <Field name="gads_conversion_id" label="Google Ads Conversion ID" placeholder="AW-XXXXXXXXX" />
            <Field name="meta_pixel_id" label="Meta Pixel ID" placeholder="1234567890" />
            <Field name="tiktok_pixel_id" label="TikTok Pixel ID" placeholder="CXXXXXXXX" />
            <Field name="first_party_domain" label="First-party domain (optional)" placeholder="analytics.shop.acme.com" />
          </div>
          <button type="submit" disabled={saving} className="bg-ink-950 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-ink-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create site'}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {sites.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-ink-200 p-6">
            {editing === s.id ? (
              <form onSubmit={(e) => { e.preventDefault(); updateSite(s.id, new FormData(e.currentTarget)); }} className="space-y-4">
                <Field name="domain" label="Domain" defaultValue={s.domain} required />
                <div className="grid md:grid-cols-2 gap-4">
                  <Field name="gtm_container_id" label="GTM Container ID" defaultValue={s.gtm_container_id} />
                  <Field name="ga4_measurement_id" label="GA4 Measurement ID" defaultValue={s.ga4_measurement_id} />
                  <Field name="gads_conversion_id" label="Google Ads Conversion ID" defaultValue={s.gads_conversion_id} />
                  <Field name="meta_pixel_id" label="Meta Pixel ID" defaultValue={s.meta_pixel_id} />
                  <Field name="tiktok_pixel_id" label="TikTok Pixel ID" defaultValue={s.tiktok_pixel_id} />
                  <Field name="first_party_domain" label="First-party domain" defaultValue={s.first_party_domain} placeholder="analytics.yourdomain.com" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="bg-ink-950 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Save changes</button>
                  <button type="button" onClick={() => setEditing(null)} className="border border-ink-200 px-4 py-2 rounded-lg text-sm">Cancel</button>
                </div>
              </form>
            ) : (
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-ink-950">{s.domain}</h3>
                    <p className="text-xs text-ink-500 mt-0.5">API key: <span className="mono">{s.api_key.slice(0, 12)}…</span></p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(s.id)} className="border border-ink-200 px-3 py-1 rounded-lg text-xs">Edit</button>
                    <button onClick={() => deleteSite(s.id)} className="border border-red-200 text-red-600 px-3 py-1 rounded-lg text-xs">Delete</button>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Row label="GTM" v={s.gtm_container_id} />
                  <Row label="GA4" v={s.ga4_measurement_id} />
                  <Row label="Google Ads" v={s.gads_conversion_id} />
                  <Row label="Meta Pixel" v={s.meta_pixel_id} />
                  <Row label="TikTok Pixel" v={s.tiktok_pixel_id} />
                  <Row label="First-party domain" v={s.first_party_domain} highlight />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ name, label, placeholder, defaultValue, required }: any) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-600 mb-1">{label}{required && ' *'}</label>
      <input
        name={name}
        type="text"
        defaultValue={defaultValue || ''}
        placeholder={placeholder}
        required={required}
        className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ink-500 focus:ring-2 focus:ring-brand-500/20"
      />
    </div>
  );
}

function Row({ label, v, highlight }: any) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-500">{label}</span>
      <span className={`mono ${highlight && v ? 'text-brand-600' : 'text-ink-800'}`}>{v || '—'}</span>
    </div>
  );
}
