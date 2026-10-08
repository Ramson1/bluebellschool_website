// Offline CBT submission queue.
//
// Exams are written on school machines whose connection is often too slow (or
// too shared) to persist a result at the moment the student submits. A failed
// upload used to be swallowed and the marks were lost. Instead every submission
// is written to localStorage first and flushed by this module whenever a
// connection is available, so the answer sheet survives a closed tab, a power
// cut or an hour of downtime.
//
// A job carries the student's RAW answers and never a score: the flush re-derives
// the marks through cbtScoring.js, so a queued item cannot smuggle an inflated
// number into a result. Each job also carries a stable submissionKey, which lets
// a retry recognise an already-recorded attempt instead of adding it twice.

import { buildSubmissionKey } from "./cbtScoring.js";

const QUEUE_KEY = "cbt_submit_queue";
const LOCK_KEY = "cbt_submit_lock";
const LOCK_STALE_MS = 60000; // a crashed tab must not block the queue forever
const MAX_BACKOFF_MS = 30000;

const listeners = new Set();
let inFlight = null; // the flush currently running, so two triggers never overlap

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

function readRaw() {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((j) => j && j.submissionKey) : [];
  } catch {
    return [];
  }
}

function writeRaw(jobs) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs));
  } catch (error) {
    console.error("❌ [CbtQueue] Unable to persist the queue:", error);
  }
  notify();
}

function notify() {
  const jobs = readRaw();
  listeners.forEach((cb) => {
    try {
      cb(jobs);
    } catch {
      /* a listener must never break the queue */
    }
  });
}

export function subscribeToQueue(callback) {
  listeners.add(callback);
  callback(readRaw());
  return () => listeners.delete(callback);
}

export const pendingJobs = () => readRaw();

export const pendingCount = () => readRaw().length;

// Add (or refresh) a submission. Same key = same attempt, so a second submit
// from a retry replaces the payload rather than piling up duplicates.
export function enqueueJob(job) {
  const jobs = readRaw();
  const next = jobs.filter((j) => j.submissionKey !== job.submissionKey);
  next.push({
    ...job,
    queuedAt: job.queuedAt || new Date().toISOString(),
    attempts: job.attempts || 0,
    nextAttemptAt: job.nextAttemptAt || 0,
  });
  writeRaw(next);
  return next.length;
}

export function removeJob(submissionKey) {
  writeRaw(readRaw().filter((j) => j.submissionKey !== submissionKey));
}

export function clearQueue() {
  writeRaw([]);
}

// Build a job from an answered paper. Stored shape is fixed so the flush can
// always re-derive the score instead of trusting anything persisted.
export function buildJob({
  studentId,
  studentName,
  studentClass,
  examRowId,
  subject,
  termKey,
  termLabel,
  normPurpose,
  answers,
  questions,
  paperMax,
  sessionType = "objective",
}) {
  return {
    submissionKey: buildSubmissionKey({ studentId, examRowId, subject, termKey, normPurpose, sessionType }),
    studentId,
    studentName,
    studentClass,
    examRowId,
    subject,
    termKey,
    termLabel,
    normPurpose,
    sessionType,
    answers,
    questionCount: Array.isArray(questions) ? questions.length : 0,
    paperMax,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: 0,
  };
}

// Cross-tab lock: the exam screen can be open in two tabs on the same machine,
// and two parallel writers of one student's result row would overwrite each
// other's subject. Only the lock holder flushes.
function takeLock() {
  if (!canUseStorage()) return true;
  const myTab = getTabId();
  try {
    const lock = JSON.parse(window.localStorage.getItem(LOCK_KEY) || "null");
    const held = lock && lock.tabId !== myTab && Date.now() - (lock.at || 0) < LOCK_STALE_MS;
    if (held) return false;
    window.localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: myTab, at: Date.now() }));
    return true;
  } catch {
    return true;
  }
}

function refreshLock() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: getTabId(), at: Date.now() }));
  } catch {
    /* ignore */
  }
}

function releaseLock() {
  if (!canUseStorage()) return;
  try {
    const lock = JSON.parse(window.localStorage.getItem(LOCK_KEY) || "null");
    if (lock && lock.tabId === getTabId()) window.localStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
}

let tabId = null;
function getTabId() {
  if (tabId) return tabId;
  tabId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return tabId;
}

// One flush at a time, jobs processed sequentially. `submitJob` does the actual
// grading + database write and returns:
//   true   -> accepted (already recorded counts as accepted), job is dropped
//   'skip' -> belongs to another session type, leave it queued and carry on
//   false  -> failed, job stays queued with backoff
export async function flushQueue({ submitJob, force = false } = {}) {
  if (typeof submitJob !== "function") return { flushed: 0, failed: 0, remaining: pendingCount() };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    if (!takeLock()) return { flushed: 0, failed: 0, remaining: pendingCount(), skipped: "locked" };
    let flushed = 0;
    let failed = 0;
    try {
      for (const job of readRaw()) {
        if (!force && (job.nextAttemptAt || 0) > Date.now()) continue;
        refreshLock();
        let ok = false;
        try {
          ok = await submitJob(job);
        } catch (error) {
          console.error("❌ [CbtQueue] Submit threw:", error);
          ok = false;
        }
        if (ok === "skip") continue;
        if (ok === true) {
          removeJob(job.submissionKey);
          flushed++;
        } else {
          failed++;
          const attempts = (job.attempts || 0) + 1;
          const delay = Math.min(2000 * 2 ** (attempts - 1), MAX_BACKOFF_MS);
          const jobs = readRaw().map((j) =>
            j.submissionKey === job.submissionKey ? { ...j, attempts, nextAttemptAt: Date.now() + delay } : j
          );
          writeRaw(jobs);
          // A failing job usually means the network is down again; stop this pass
          // instead of hammering it with the rest of the queue.
          break;
        }
      }
    } finally {
      releaseLock();
    }
    return { flushed, failed, remaining: pendingCount() };
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
