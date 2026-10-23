// OoTR relay: a free Cloudflare Worker that lets the OoTR app roll seeds on
// ootrandomizer.com. Their API needs a key (ask TreZ on the OoT Randomizer
// Discord, discord.ootrandomizer.com), which must not sit in a web page, so
// it lives here as a secret and the app only ever talks to this worker.
//
// It only passes on what the app needs:
//   GET  /api/version?branch=dev|master       which versions exist (no key needed)
//   POST /api/v2/seed/create?version=&locked=  roll a seed (body: settings JSON)
//   GET  /api/v2/seed/status?id=               progress
//   GET  /api/v2/seed/patch?id=                the finished seed's patch file (.zpf)
// and only for the pages listed in ALLOWED.
//
// Deploy: dash.cloudflare.com → Workers & Pages → Create → Create Worker,
// name it "ootr-relay", Deploy, Edit code, paste this file, Deploy. Then
// Settings → Variables and Secrets → Add → type Secret, name OOTR_API_KEY,
// value: your API key → Deploy. The app uses
// https://ootr-relay.<your-subdomain>.workers.dev (change it in New seed →
// Seed relay if your subdomain differs).

const ALLOWED = [
  'https://hugecrankhank.github.io',
];
const SITE = 'https://ootrandomizer.com';

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const ok = ALLOWED.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!ok) return new Response('Not allowed', { status: 403 });
    const h = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    const url = new URL(request.url);
    const key = env.OOTR_API_KEY || '';
    const pass = async (r, type) => new Response(await r.arrayBuffer(), {
      status: r.status, headers: { ...h, 'Content-Type': type || r.headers.get('Content-Type') || 'application/json' },
    });
    const bad = (msg, code = 400) => new Response(JSON.stringify({ error: msg }), { status: code, headers: { ...h, 'Content-Type': 'application/json' } });

    if (url.pathname === '/api/version' && request.method === 'GET') {
      const br = url.searchParams.get('branch') || 'master';
      if (!/^[a-z0-9_-]{1,40}$/i.test(br)) return bad('bad branch');
      return pass(await fetch(`${SITE}/api/version?branch=${br}`, { cf: { cacheTtl: 3600, cacheEverything: true } }));
    }
    if (!key) return bad('This relay has no OOTR_API_KEY secret yet.', 401);

    if (url.pathname === '/api/v2/seed/create' && request.method === 'POST') {
      const body = await request.text();
      if (body.length > 64000) return bad('settings too big');
      try { JSON.parse(body); } catch (e) { return bad('settings are not JSON'); }
      const q = new URLSearchParams({ key });
      const v = url.searchParams.get('version');
      if (v) { if (!/^[a-z0-9_.+-]{1,40}$/i.test(v)) return bad('bad version'); q.set('version', v); }
      q.set('locked', url.searchParams.get('locked') === '1' ? '1' : '0');
      return pass(await fetch(`${SITE}/api/v2/seed/create?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
    }
    const id = url.searchParams.get('id') || '';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return bad('bad id');
    if (url.pathname === '/api/v2/seed/status' && request.method === 'GET')
      return pass(await fetch(`${SITE}/api/v2/seed/status?key=${encodeURIComponent(key)}&id=${id}`));
    if (url.pathname === '/api/v2/seed/patch' && request.method === 'GET')
      return pass(await fetch(`${SITE}/api/v2/seed/patch?key=${encodeURIComponent(key)}&id=${id}`), 'application/octet-stream');
    return bad('not relayed', 404);
  },
};
