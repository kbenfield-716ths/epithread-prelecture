// debrief-sync.js
// Shared helper for POSTing records (debriefs, feedback, ...) to the
// project's API with resilience baked in.
//
// Why this exists: a failed fetch() to a 4xx/5xx response does NOT throw —
// code that doesn't check resp.ok will report success anyway, which is
// exactly how 79 debriefs got silently lost earlier in this project's
// history. This wraps every POST with: check resp.ok -> retry once ->
// fall back to a per-endpoint localStorage queue so nothing is lost. Any
// page that includes this file will also opportunistically retry anything
// still queued from a past failed session.
//
// Exposes:
//   EpiThreadDebrief  — .logDebrief(payload) / .flushQueuedDebriefs()
//   EpiThreadFeedback — .log(payload)        / .flushQueued()

(function (global) {
  function makeSync(endpoint, queueKey) {
    function readQueue() {
      try {
        return JSON.parse(localStorage.getItem(queueKey) || '[]');
      } catch (e) {
        return [];
      }
    }

    function writeQueue(items) {
      try {
        localStorage.setItem(queueKey, JSON.stringify(items));
      } catch (e) {
        console.warn(`EpiThread: could not persist queue for ${endpoint}`, e);
      }
    }

    function queue(payload) {
      const items = readQueue();
      items.push(payload);
      writeQueue(items);
    }

    async function post(payload) {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error(`POST ${endpoint} failed: ${resp.status}`);
      }
      return resp;
    }

    // Send one record now. Retries once immediately; on continued
    // failure, queues it in localStorage for later retry.
    // Returns { synced: true } or { synced: false, queued: true }.
    async function log(payload) {
      try {
        await post(payload);
        return { synced: true };
      } catch (err1) {
        console.warn(`EpiThread: POST ${endpoint} failed, retrying once`, err1);
        try {
          await post(payload);
          return { synced: true };
        } catch (err2) {
          console.warn(`EpiThread: POST ${endpoint} failed after retry, queuing locally`, err2);
          queue(payload);
          return { synced: false, queued: true };
        }
      }
    }

    // Attempt to flush anything queued from a previous failed session.
    // Safe to call on every page load; no-ops if the queue is empty.
    async function flushQueued() {
      const items = readQueue();
      if (!items.length) return { flushed: 0, remaining: 0 };

      const stillQueued = [];
      let flushed = 0;
      for (const item of items) {
        try {
          await post(item);
          flushed++;
        } catch (err) {
          stillQueued.push(item);
        }
      }
      writeQueue(stillQueued);
      if (flushed) {
        console.info(`EpiThread: synced ${flushed} previously queued record(s) to ${endpoint}.`);
      }
      return { flushed, remaining: stillQueued.length };
    }

    return { log, flushQueued, queue, readQueue };
  }

  const debriefSync  = makeSync('/api/debrief',  'epithreadUnsyncedDebriefs');
  const feedbackSync = makeSync('/api/feedback', 'epithreadUnsyncedFeedback');

  global.EpiThreadDebrief = {
    ...debriefSync,
    // Backward-compatible names used by tutor.html / course.html / index.html
    logDebrief:          debriefSync.log,
    flushQueuedDebriefs: debriefSync.flushQueued,
  };

  global.EpiThreadFeedback = feedbackSync;
})(window);
