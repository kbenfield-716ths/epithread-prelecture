// debrief-sync.js
// Shared helper for logging pre-lecture debriefs to /api/debrief.
//
// Why this exists: /api/debrief can fail silently from the student's
// point of view (misconfigured GITHUB_TOKEN / GITHUB_DEBRIEF_REPO, a
// GitHub outage, etc.) — a failed fetch() to a 4xx/5xx response does NOT
// throw, so code that doesn't check resp.ok will report success anyway.
// This wraps every debrief POST with: check resp.ok -> retry once ->
// fall back to a localStorage queue so nothing is lost. Any page that
// includes this file will also opportunistically retry anything still
// queued from a past failed session.
//
// Used by: tutor.html (submits), course.html / index.html (retries
// anything left in the queue on load).

(function (global) {
  const QUEUE_KEY = 'epithreadUnsyncedDebriefs';

  function readQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function writeQueue(items) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('EpiThread: could not persist debrief queue', e);
    }
  }

  function queueDebrief(payload) {
    const items = readQueue();
    items.push(payload);
    writeQueue(items);
  }

  async function postDebrief(payload) {
    const resp = await fetch('/api/debrief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`Debrief POST failed: ${resp.status}`);
    }
    return resp;
  }

  // Send one debrief now. Retries once immediately; on continued
  // failure, queues it in localStorage for later retry.
  // Returns { synced: true } or { synced: false, queued: true }.
  async function logDebrief(payload) {
    try {
      await postDebrief(payload);
      return { synced: true };
    } catch (err1) {
      console.warn('EpiThread: debrief POST failed, retrying once', err1);
      try {
        await postDebrief(payload);
        return { synced: true };
      } catch (err2) {
        console.warn('EpiThread: debrief POST failed after retry, queuing locally', err2);
        queueDebrief(payload);
        return { synced: false, queued: true };
      }
    }
  }

  // Attempt to flush anything queued from a previous failed session.
  // Safe to call on every page load; no-ops if the queue is empty.
  async function flushQueuedDebriefs() {
    const items = readQueue();
    if (!items.length) return { flushed: 0, remaining: 0 };

    const stillQueued = [];
    let flushed = 0;
    for (const item of items) {
      try {
        await postDebrief(item);
        flushed++;
      } catch (err) {
        stillQueued.push(item);
      }
    }
    writeQueue(stillQueued);
    if (flushed) {
      console.info(`EpiThread: synced ${flushed} previously queued debrief(s).`);
    }
    return { flushed, remaining: stillQueued.length };
  }

  global.EpiThreadDebrief = { logDebrief, flushQueuedDebriefs, queueDebrief, readQueue };
})(window);
