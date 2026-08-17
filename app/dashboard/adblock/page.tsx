'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AdblockPage() {
  const search = useSearchParams();
  const siteId = search.get('siteId');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!siteId) return;
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
    async function load() {
      try {
        const res = await fetch(`/api/adblock?siteId=${siteId}`);
        if (res.ok) setData(await res.json());
      } catch {}
    }
  }, [siteId]);

  if (!siteId) return <div className="text-ink-400 text-sm">Select a site.</div>;
  if (!data) return <div className="text-ink-400 text-sm">Loading…</div>;

  const totals = data.totals || {};
  const methods = data.byMethod || [];
  const recent = data.recent || [];

  const blocked = Number(totals.blocked_24h) || 0;
  const totalSessions = Math.max(1, Number(totals.total_sessions_24h) || 0);
  const rate = ((blocked / (blocked + totalSessions)) * 100).toFixed(1);

  const maxMethodCount = methods.reduce((m: number, x: any) => Math.max(m, Number(x.cnt)), 1);

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-950">Ad-blocker impact</h2>
        <p className="text-sm text-ink-500 mt-0.5">
          Sessions detected via first-party fallback beacon and Google ad-script bait check.
          For maximum accuracy, configure a first-party domain on the Settings page.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-ink-200">
          <div className="text-xs text-ink-400 uppercase">Ad-blocker rate</div>
          <div className="text-2xl font-semibold mt-1">{rate}%</div>
          <div className="text-xs text-ink-500 mt-1">Sessions with any block</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-ink-200">
          <div className="text-xs text-ink-400 uppercase">Blocked sessions (24h)</div>
          <div className="text-2xl font-semibold mt-1">{blocked.toLocaleString()}</div>
          <div className="text-xs text-ink-500 mt-1">Fallback beacon fires</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-ink-200">
          <div className="text-xs text-ink-400 uppercase">Total sessions (24h)</div>
          <div className="text-2xl font-semibold mt-1">{totalSessions.toLocaleString()}</div>
          <div className="text-xs text-ink-500 mt-1">Distinct visitors</div>
        </div>
      </div>

      {methods.length > 0 && (
        <div className="bg-white rounded-xl border border-ink-200 p-5 mb-6">
          <h3 className="font-semibold text-ink-950 mb-4">Detection method breakdown</h3>
          <div className="space-y-3">
            {methods.map((m: any) => {
              const pct = Math.round((Number(m.cnt) / maxMethodCount) * 100);
              return (
                <div key={m.detection_method}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{describeMethod(m.detection_method)}</span>
                    <span className="font-medium">{Number(m.cnt).toLocaleString()}</span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                    <div className="h-full bg-brand-500" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-ink-200">
        <div className="p-4 border-b border-ink-100">
          <h3 className="font-semibold text-ink-950">Recent detections</h3>
          <p className="text-xs text-ink-500 mt-0.5">Last 50 sessions where our monitor.js was blocked, in whole or in part.</p>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">No ad-blocker detections yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-ink-500 uppercase bg-ink-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">Method</th>
                  <th className="text-left px-4 py-2 font-medium">Page</th>
                  <th className="text-left px-4 py-2 font-medium">Browser</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {recent.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-ink-50">
                    <td className="px-4 py-2 mono text-xs">{new Date(r.detected_at).toLocaleTimeString()}</td>
                    <td className="px-4 py-2">
                      <span className="pill bg-red-100 text-red-800">{describeMethod(r.detection_method)}</span>
                    </td>
                    <td className="px-4 py-2 mono text-xs truncate max-w-[240px]">{r.page_url || '—'}</td>
                    <td className="px-4 py-2 text-ink-500 text-xs truncate max-w-[240px]">{shortUA(r.user_agent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function describeMethod(m: string) {
  if (m === 'bait_blocked') return 'Google ad script blocked';
  if (m === 'bait_timeout') return 'Ad script network timeout';
  if (m === 'script_error') return 'monitor.js failed to load';
  if (m === 'timeout') return 'monitor.js timeout';
  if (m === 'get_beacon') return 'Fallback beacon';
  return m || 'Unknown';
}

function shortUA(ua: string) {
  if (!ua) return '';
  const m = ua.match(/(Chrome|Firefox|Safari|Edge)\/(\d+)/);
  if (m) return `${m[1]} ${m[2]}`;
  return ua.slice(0, 40);
}
