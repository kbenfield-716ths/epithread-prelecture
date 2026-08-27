// api/list-debriefs.js — Vercel serverless function (Node.js runtime)
// One-off admin endpoint: reads every record under debriefs/ out of Vercel
// Blob and returns them as a single JSON array, so they can be pulled and
// analyzed without clicking through 60+ files in the dashboard one at a
// time. Gated by ADMIN_KEY (set in Vercel → Settings → Environment
// Variables) since this repo is public — never gate this on anything
// hardcoded in source.
//
// Usage: GET /api/list-debriefs?key=<ADMIN_KEY>&prefix=debriefs/
// (prefix defaults to "debriefs/"; pass prefix=feedback/ for the feedback
// records instead.)

import { list, get } from '@vercel/blob';

export async function GET(req) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');

  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  const prefix = url.searchParams.get('prefix') || 'debriefs/';

  try {
    const { blobs } = await list({ prefix, limit: 1000 });

    const records = await Promise.all(
      blobs.map(async (b) => {
        try {
          const result = await get(b.url, { access: 'private' });
          const text = await new Response(result.stream).text();
          return JSON.parse(text);
        } catch (err) {
          return { _error: `Failed to read ${b.pathname}: ${err.message || err}` };
        }
      })
    );

    return new Response(JSON.stringify({ count: records.length, records }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
