import express from 'express';
import { supabase } from '../supabaseClient.js';

/**
 * /robots.txt and /sitemap.xml.
 *
 * Absolute URLs come from APP_URL. Without it they fall back to the request's
 * own host, which is fine for local testing but should not be relied on in
 * production (a proxy could cache a response built for a forged Host header).
 */
const router = express.Router();

const STATIC_PAGES = ['/', '/signup', '/login', '/terms', '/privacy'];
const SITEMAP_LIMIT = 45000; // the sitemap protocol allows 50,000 URLs per file
const CACHE_SECONDS = 60 * 60;

function origin(req) {
  if (process.env.APP_URL) {
    try {
      return new URL(process.env.APP_URL).origin;
    } catch {
      /* fall through */
    }
  }
  return `${req.protocol}://${req.get('host')}`;
}

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

router.get('/robots.txt', (req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', `public, max-age=${CACHE_SECONDS}`)
    .send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /settings',
        'Disallow: /forgot-password',
        'Disallow: /reset-password',
        '',
        `Sitemap: ${origin(req)}/sitemap.xml`,
        '',
      ].join('\n')
    );
});

router.get('/sitemap.xml', async (req, res) => {
  try {
    const base = origin(req);
    const urls = STATIC_PAGES.map((path) => ({ loc: `${base}${path}` }));

    // Anonymous reads only: exactly what a logged-out visitor could open.
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('username, created_at')
      .order('created_at', { ascending: false })
      .limit(SITEMAP_LIMIT);
    if (profileErr) throw profileErr;
    for (const p of profiles) {
      urls.push({ loc: `${base}/profile?u=${encodeURIComponent(p.username)}`, lastmod: day(p.created_at) });
    }

    const { data: collections, error: colErr } = await supabase
      .from('collections')
      .select('id, created_at, updated_at')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(Math.max(0, SITEMAP_LIMIT - urls.length));
    if (colErr) throw colErr;
    for (const c of collections) {
      urls.push({
        loc: `${base}/collection?id=${encodeURIComponent(c.id)}`,
        lastmod: day(c.updated_at || c.created_at),
      });
    }

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map(
        (u) =>
          `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`
      ),
      '</urlset>',
      '',
    ].join('\n');

    res.type('application/xml').set('Cache-Control', `public, max-age=${CACHE_SECONDS}`).send(body);
  } catch (err) {
    console.error('[GET /sitemap.xml]', err.message || err);
    res.status(503).type('text/plain').send('Sitemap temporarily unavailable.');
  }
});

export default router;
