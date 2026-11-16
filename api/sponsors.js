/**
 * api/sponsors.js  (Vercel serverless function, runs on the SERVER, never in the browser)
 *
 * Back end of the sponsors dashboard (docs/admin/sponsors.html). The browser never sees the Supabase
 * service-role key: it only sends the dashboard user name and password, this function checks it and talks to Supabase.
 *
 * Environment variables to set in Vercel (Project Settings, Environment Variables):
 *   DRIVING_THEORY_APP_DASHBOARD_USER      user name (not secret, but not in the code)
 *   DRIVING_THEORY_APP_DASHBOARD_PASSWORD  long password of the owner (not stored in the code; the name says which app it belongs to)
 *   SUPABASE_URL               same value as EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  the service-role key (server only)
 *
 * Actions (POST JSON {action, ...}), all need headers x-admin-user and x-admin-password:
 *   list     -> { sponsors, monthly, mrr }
 *   add      -> insert one sponsor
 *   extend   -> add N days to the subscription end (from today or from the current end, whichever is later)
 *   toggle   -> switch is_active
 *   update   -> change price / currency / featured on one sponsor
 * Tables and views come from backend/migration_sponsor_ads_international.sql.
 */
const crypto = require('crypto');

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.DRIVING_THEORY_APP_DASHBOARD_PASSWORD;
const USER = process.env.DRIVING_THEORY_APP_DASHBOARD_USER;

function same(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

async function sb(path, opts = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const ALLOWED_ADD = ['name', 'tagline_amharic', 'tagline_local', 'phone', 'whatsapp_number', 'city', 'country_code',
  'contact_lang', 'lat', 'lon', 'monthly_price', 'currency_code', 'is_featured', 'category'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!URL_ || !KEY || !PASS || !USER) return res.status(500).json({ error: 'server is not configured' });
  if (!same(req.headers['x-admin-user'], USER) | !same(req.headers['x-admin-password'], PASS)) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down password guessing
    return res.status(401).json({ error: 'wrong password' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { action } = body;

    if (action === 'list') {
      const [sponsors, monthly, mrr] = await Promise.all([
        sb('sponsor_ads?select=*&order=created_at.desc'),
        sb('sponsor_ad_monthly_stats?select=*&order=month.desc'),
        sb('sponsor_mrr_by_currency?select=*'),
      ]);
      return res.status(200).json({ sponsors, monthly, mrr });
    }

    if (action === 'add') {
      const row = {};
      for (const k of ALLOWED_ADD) if (body[k] !== undefined && body[k] !== '') row[k] = body[k];
      if (!row.name || !row.tagline_amharic || !row.phone || !row.city) return res.status(400).json({ error: 'name, tagline_amharic, phone and city are required' });
      const days = Math.min(Math.max(parseInt(body.trial_days, 10) || 14, 1), 365);
      row.expires_at = new Date(Date.now() + days * 86400000).toISOString();
      const out = await sb('sponsor_ads', { method: 'POST', body: JSON.stringify(row) });
      return res.status(200).json({ ok: true, sponsor: out[0] });
    }

    if (action === 'extend') {
      const id = String(body.id || '');
      const days = Math.min(Math.max(parseInt(body.days, 10) || 30, 1), 365);
      const cur = await sb(`sponsor_ads?id=eq.${encodeURIComponent(id)}&select=expires_at`);
      if (!cur || !cur.length) return res.status(404).json({ error: 'sponsor not found' });
      const base = cur[0].expires_at && new Date(cur[0].expires_at) > new Date() ? new Date(cur[0].expires_at) : new Date();
      base.setDate(base.getDate() + days);
      const out = await sb(`sponsor_ads?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ expires_at: base.toISOString(), is_active: true }) });
      return res.status(200).json({ ok: true, sponsor: out[0] });
    }

    if (action === 'toggle') {
      const id = String(body.id || '');
      const out = await sb(`sponsor_ads?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ is_active: !!body.is_active }) });
      return res.status(200).json({ ok: true, sponsor: out[0] });
    }

    if (action === 'update') {
      const id = String(body.id || '');
      const patch = {};
      for (const k of ['monthly_price', 'currency_code', 'is_featured']) if (body[k] !== undefined) patch[k] = body[k];
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to update' });
      const out = await sb(`sponsor_ads?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
      return res.status(200).json({ ok: true, sponsor: out[0] });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
