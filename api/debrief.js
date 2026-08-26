// api/debrief.js — Vercel serverless function
// Writes a debrief record as a JSON blob to Vercel Blob storage.
// Schema: { studentId, timestamp, hypothesis, conceptsTouched, exchangeCount, debriefSummary }
//
// Requires a Blob store connected to this Vercel project:
//   Vercel dashboard → project → Storage tab → Create Database → Blob →
//   connect it to this project. That auto-adds the BLOB_READ_WRITE_TOKEN
//   env var to all environments — no manual token/repo config needed
//   (this replaces the old GitHub-Contents-API approach, which broke
//   silently when GITHUB_TOKEN/GITHUB_DEBRIEF_REPO were misconfigured).

import { put } from '@vercel/blob';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders() });
  }

  const {
    studentId,
    hypothesis,
    debriefSummary,
    conceptsTouched = [],
    exchangeCount   = 0,
    timestamp       = new Date().toISOString(),
  } = body;

  if (!studentId || !hypothesis || !debriefSummary) {
    return new Response('Missing required fields', { status: 400, headers: corsHeaders() });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn('BLOB_READ_WRITE_TOKEN not configured — debrief not persisted (connect a Blob store to this project in Vercel → Storage)');
    return new Response(JSON.stringify({ ok: true, persisted: false }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  // Build the record
  const record = {
    studentId,
    timestamp,
    hypothesis,
    conceptsTouched,
    exchangeCount,
    debriefSummary,
  };

  // Blob pathname: debriefs/YYYY-MM-DD_studentId_<random>.json
  const dateStr  = timestamp.slice(0, 10);
  const rand     = Math.random().toString(36).slice(2, 8);
  const pathname = `debriefs/${dateStr}_${studentId}_${rand}.json`;

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
    // Log identifying info so a future failure doesn't also erase which
    // student's debrief was lost — check Vercel runtime logs for this.
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
