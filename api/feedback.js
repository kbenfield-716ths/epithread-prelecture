// api/feedback.js — Vercel serverless function (Node.js runtime)
// Writes a short course-feedback record as a JSON blob to Vercel Blob
// storage. Mirrors api/debrief.js's storage pattern exactly — see that
// file's comments for the Blob-auth (OIDC vs static token) background.
// Schema: { studentId, timestamp, learned, liked, disliked }

import { put } from '@vercel/blob';

export async function OPTIONS(req) {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders() });
  }

  const {
    studentId,
    learned  = '',
    liked    = '',
    disliked = '',
    timestamp = new Date().toISOString(),
  } = body;

  const hasContent = [learned, liked, disliked].some(s => String(s).trim().length > 0);

  if (!studentId || !hasContent) {
    return new Response('Missing required fields', { status: 400, headers: corsHeaders() });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    console.warn('No Blob credentials found (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID) — feedback not persisted (connect a Blob store to this project in Vercel → Storage)');
    return new Response(JSON.stringify({ ok: true, persisted: false }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  const record = {
    studentId,
    timestamp,
    learned:  String(learned).trim(),
    liked:    String(liked).trim(),
    disliked: String(disliked).trim(),
  };

  const dateStr  = timestamp.slice(0, 10);
  const rand     = Math.random().toString(36).slice(2, 8);
  const pathname = `feedback/${dateStr}_${studentId}_${rand}.json`;

  try {
    const blob = await put(pathname, JSON.stringify(record, null, 2), {
      access:      'private',
      contentType: 'application/json',
    });

    return new Response(JSON.stringify({ ok: true, persisted: true, pathname: blob.pathname }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`Blob write failed for studentId=${studentId}:`, err && err.message ? err.message : err);
    return new Response(JSON.stringify({ ok: false, error: 'Blob write failed' }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
