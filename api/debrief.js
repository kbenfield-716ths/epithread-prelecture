// api/debrief.js — Vercel serverless function
// Writes a debrief record as a JSON file to a GitHub repository
// Schema: { studentId, timestamp, hypothesis, conceptsTouched, exchangeCount, debriefSummary }

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

  const githubToken  = process.env.GITHUB_TOKEN;
  const githubRepo   = process.env.GITHUB_DEBRIEF_REPO;  // e.g. "your-org/epithread-debriefs"
  const githubBranch = process.env.GITHUB_DEBRIEF_BRANCH || 'main';

  if (!githubToken || !githubRepo) {
    console.warn('GitHub env vars not configured — debrief not persisted');
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

  // File path: debriefs/YYYY-MM-DD_studentId_<random>.json
  const dateStr  = timestamp.slice(0, 10);
  const rand     = Math.random().toString(36).slice(2, 8);
  const filePath = `debriefs/${dateStr}_${studentId}_${rand}.json`;
  const content  = btoa(unescape(encodeURIComponent(JSON.stringify(record, null, 2))));

  const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/${filePath}`;

  const ghResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization:  `Bearer ${githubToken}`,
      'Content-Type': 'application/json',
      Accept:         'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message:  `debrief: ${studentId} @ ${timestamp}`,
      content,
      branch:   githubBranch,
    }),
  });

  if (!ghResp.ok) {
    const text = await ghResp.text();
    console.error('GitHub write failed:', ghResp.status, text);
    return new Response(JSON.stringify({ ok: false, error: 'GitHub write failed' }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, persisted: true, file: filePath }), {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
