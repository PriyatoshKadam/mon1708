'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function InstallPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [site, setSite] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    fetch('/api/sites').then((r) => r.json()).then((d) => {
      const s = d.sites.find((x: any) => x.id === Number(siteId));
      if (s) setSite(s);
    });
  }, [siteId]);

  if (!siteId) return <div className="text-ink-400 text-sm">Select a site to see its install snippet.</div>;
  if (!site) return <div className="text-ink-400 text-sm">Loading…</div>;

  // If a first-party domain is set, use it — otherwise fall back to current origin
  const base = site.first_party_domain
    ? `https://${site.first_party_domain}`
    : (typeof window !== 'undefined' ? window.location.origin : '');
  const gtmId = site.gtm_container_id || 'GTM-XXXXXXX';
  const apiKey = site.api_key;

  const snippet = `<script>
(function(k,c){var w=window,d=document,s=d.createElement('script');
w.__g4f={k:k,c:c,q:[],t:Date.now()};s.src='${base}/monitor.js?apiKey='+k+'&gtmContainerId='+c;
s.onerror=function(){navigator.sendBeacon('${base}/api/blocked?k='+k,'x')};
d.head.appendChild(s);setTimeout(function(){w.__g4f.r||navigator.sendBeacon('${base}/api/blocked?k='+k,'x')},3000);
})('${apiKey}','${gtmId}');
</script>`;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fade-in max-w-3xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-950">Install snippet for {site.domain}</h2>
        <p className="text-sm text-ink-500 mt-0.5">
          One tag. Five lines. Paste into GTM, publish, done. Events start streaming within seconds.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ink-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-ink-950">Your snippet</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Pre-filled with your API key
              {site.gtm_container_id ? <> and GTM container <span className="mono">{site.gtm_container_id}</span></> : <span className="text-amber-600"> (add your GTM container ID in Settings for full features)</span>}.
            </p>
          </div>
          <button
            onClick={copy}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${copied ? 'bg-green-500 text-white' : 'bg-ink-950 text-white hover:bg-ink-800'}`}
          >
            {copied ? '✓ Copied!' : 'Copy snippet'}
          </button>
        </div>
        <pre className="bg-ink-950 rounded-lg p-4 text-xs text-green-300 mono overflow-x-auto leading-relaxed">
          <code>{snippet}</code>
        </pre>
      </div>

      <div className="bg-white rounded-xl border border-ink-200 p-6 mb-6">
        <h3 className="font-semibold text-ink-950 mb-4">How to install in Google Tag Manager</h3>
        <ol className="space-y-4 text-sm text-ink-800">
          {[
            <>Go to <a href="https://tagmanager.google.com" target="_blank" className="text-brand-600 hover:underline">tagmanager.google.com</a> and open your container.</>,
            <>Click <b>Tags</b> in the left sidebar, then <b>New</b>.</>,
            <>Choose tag type <b>Custom HTML</b>, then paste the snippet above into the HTML box.</>,
            <>Set the trigger to <b>All Pages</b>. Under Advanced Settings, set <b>Tag firing priority</b> to <span className="mono">1000</span> so it loads before other tags.</>,
            <>Name the tag <span className="mono">GA4Fix Monitor</span>, click <b>Save</b>, then <b>Submit</b> → <b>Publish</b> your container.</>,
            <>Return here — events will appear on the Overview tab within seconds.</>,
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-ink-100 text-ink-800 flex-shrink-0 flex items-center justify-center text-xs font-semibold">{i + 1}</span>
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h3 className="font-semibold text-blue-950 mb-2 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          First-party domain (recommended for accurate ad-blocker detection)
        </h3>
        <p className="text-sm text-blue-900 mb-3">
          Ad blockers block requests to well-known analytics domains — including this one. To catch every real visitor,
          serve monitor.js and the ingest endpoint from your own subdomain instead.
        </p>
        <ol className="space-y-2 text-sm text-blue-900 mb-3">
          <li>1. Create a CNAME record: <span className="mono bg-white px-2 py-0.5 rounded text-xs">analytics.{site.domain}</span> → <span className="mono bg-white px-2 py-0.5 rounded text-xs">{typeof window !== 'undefined' ? new URL(window.location.origin).host : 'your-app.onrender.com'}</span></li>
          <li>2. On Render, add the custom domain <span className="mono bg-white px-2 py-0.5 rounded text-xs">analytics.{site.domain}</span> to your service.</li>
          <li>3. Enter it under Settings → First-party domain.</li>
          <li>4. Re-copy the snippet — it&apos;ll auto-update to use your first-party URL.</li>
        </ol>
        {site.first_party_domain ? (
          <div className="text-sm text-green-800 bg-green-100 border border-green-200 rounded-lg px-3 py-2 inline-block">
            ✓ Currently using: <span className="mono">{site.first_party_domain}</span>
          </div>
        ) : (
          <div className="text-sm text-amber-800 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 inline-block">
            Not yet configured — snippet uses default domain
          </div>
        )}
      </div>
    </div>
  );
}
