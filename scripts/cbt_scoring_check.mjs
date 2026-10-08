// Pure-logic checks for the CBT scoring rules and the offline submission queue.
// Run with: node scripts/cbt_scoring_check.mjs
// There is no test runner in this repository, so this is a plain script: it
// prints each group it checked and exits non-zero on the first failure.

import {
  SECTION_MAX,
  normalizePurpose,
  sectionMaxFor,
  gradeFor,
  sanitizeAnswers,
  recomputeCorrect,
  paperMaxScore,
  scaleScore,
  storedScore,
  buildSubmissionKey,
} from "../src/utils/cbtScoring.js";

let checks = 0;
const failures = [];

function check(label, actual, expected) {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label} -> ${JSON.stringify(actual)}`);
}

// A paper of `total` questions with the first `correct` answered right.
function objectivePaper(total, correct) {
  return Array.from({ length: total }, (_, q) => ({
    answerOptions: [
      { isCorrect: q < correct }, // option 0 is the right one for graded questions
      { isCorrect: false },
    ],
  }));
}

const answersFor = (count) => {
  const answers = {};
  for (let i = 0; i < count; i++) answers[i] = 0;
  return answers;
};

console.log("\n1. purpose routing is case and space insensitive");
check("normalizePurpose('exam')", normalizePurpose("exam"), "exam");
check("normalizePurpose('EXAM')", normalizePurpose("EXAM"), "exam");
check("normalizePurpose('Midterm')", normalizePurpose("Midterm"), "midterm");
check("normalizePurpose(' test ')", normalizePurpose(" test "), "midterm");
check("normalizePurpose('practice')", normalizePurpose("practice"), null);
check("normalizePurpose('')", normalizePurpose(""), null);
check("normalizePurpose(null)", normalizePurpose(null), null);
check("normalizePurpose('assignment')", normalizePurpose("assignment"), null);
check("sectionMaxFor('exam')", sectionMaxFor("exam"), SECTION_MAX.exam);
check("sectionMaxFor('midterm')", sectionMaxFor("midterm"), SECTION_MAX.midterm);

console.log("\n2. only real questions and real options are counted");
check("45 of 60 correct", recomputeCorrect(answersFor(45), objectivePaper(60, 45)), 45);
check("index 99 on a 60-question paper is ignored",
  recomputeCorrect({ ...answersFor(44), 99: 0 }, objectivePaper(60, 45)), 44);
check("out-of-range option index is dropped", sanitizeAnswers({ 0: 7 }, objectivePaper(3, 1)), {});
check("negative question index is dropped", sanitizeAnswers({ "-1": 0 }, objectivePaper(3, 1)), {});
check("non-numeric key is dropped", sanitizeAnswers({ abc: 0 }, objectivePaper(3, 1)), {});
check("answering a wrong question scores nothing",
  recomputeCorrect({ 0: 1 }, objectivePaper(3, 1)), 0);
check("a recount can never exceed the question count",
  recomputeCorrect(answersFor(500), objectivePaper(60, 60)), 60);

console.log("\n3. marks are scaled onto the paper's own maximum");
check("45 of 60, paper worth 60", scaleScore(45, 60, 60), 45);
check("45 of 50, paper worth 60", scaleScore(45, 50, 60), 54);
check("50 of 50, paper worth 60", scaleScore(50, 50, 60), 60);
check("0 of 50, paper worth 60", scaleScore(0, 50, 60), 0);
check("a raw count above the question count cannot inflate the marks",
  scaleScore(80, 50, 60), 60);
check("empty paper", scaleScore(0, 0, 60), 0);

console.log("\n4. the stored marks can never exceed the section maximum");
check("exam paper: 45 of 50 out of 60",
  storedScore({ correct: 45, questionCount: 50, paperMax: 60, purpose: "exam" }), 54);
check("exam paper at full marks",
  storedScore({ correct: 50, questionCount: 50, paperMax: 60, purpose: "exam" }), 60);
check("capital 'Midterm' routes to the 30-mark Test column",
  storedScore({ correct: 45, questionCount: 60, paperMax: 60, purpose: "Midterm" }), 30);
check("an 80-mark exam paper is still capped at 60",
  storedScore({ correct: 80, questionCount: 80, paperMax: 80, purpose: "exam" }), SECTION_MAX.exam);
check("practice writes nothing",
  storedScore({ correct: 40, questionCount: 40, paperMax: 60, purpose: "practice" }), null);
check("an empty purpose writes nothing",
  storedScore({ correct: 40, questionCount: 40, paperMax: 60, purpose: "" }), null);

console.log("\n5. the paper maximum falls back safely before the SQL is run");
check("maxScore not migrated yet (undefined)", paperMaxScore({ maxScore: undefined }, 50), 50);
check("maxScore null", paperMaxScore({ maxScore: null }, 50), 50);
check("maxScore as a string", paperMaxScore({ maxScore: "60" }, 50), 60);
check("maxScore NaN", paperMaxScore({ maxScore: "abc" }, 50), 50);
check("maxScore 0 falls back to the question count", paperMaxScore({ maxScore: 0 }, 50), 50);
check("a negative declaration is not trusted", paperMaxScore({ maxScore: -20 }, 50), 50);
check("no row at all", paperMaxScore(null, 40), 40);

console.log("\n6. grades follow the section the marks were stored in");
check("54 out of 60 is an A", gradeFor(54, 60), "A");
check("the same 54 read on a 100 scale would have been D", gradeFor(54, 100), "D");
check("30 out of 30 is A+", gradeFor(30, 30), "A+");
check("27 out of 30 is A", gradeFor(27, 30), "A");
check("a full 100 total is A+", gradeFor(100, 100), "A+");
check("46 out of 100 is D", gradeFor(46, 100), "D");
check("45 out of 100 is E", gradeFor(45, 100), "E");

console.log("\n7. the submission key is stable, and identifies one attempt");
const keyArgs = { studentId: 27, examRowId: 12, subject: "Mathematics", termKey: "term1", normPurpose: "exam" };
const first = buildSubmissionKey(keyArgs);
const second = buildSubmissionKey(keyArgs);
check("the same attempt produces the same key", first === second, true);
check("a different paper produces a different key",
  buildSubmissionKey({ ...keyArgs, examRowId: 13 }) !== first, true);
check("a different sitting time does not change the key (no Date.now())",
  buildSubmissionKey(keyArgs) === "cbt:objective:27:12:mathematics:term1:exam", true);
check("an objective and a completion paper with the same id do not collide",
  buildSubmissionKey({ ...keyArgs, sessionType: "completion" }) !== buildSubmissionKey({ ...keyArgs, sessionType: "objective" }), true);
check("subject spelling is normalised",
  buildSubmissionKey({ ...keyArgs, subject: "  math's " }) === buildSubmissionKey({ ...keyArgs, subject: "maths" }), true);

// ---------------------------------------------------------------------------
// The queue needs a browser-ish localStorage, so a small in-memory one is
// installed before the module is loaded.
console.log("\n8. the offline queue: dedupe, retry, and per-type flushing");
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};

const { enqueueJob, flushQueue, pendingCount, pendingJobs, removeJob, buildJob } = await import(
  "../src/utils/cbtSubmitQueue.js"
);

const job = buildJob({
  studentId: 27,
  studentName: "Ada Paul",
  studentClass: "ss1",
  examRowId: 12,
  subject: "Mathematics",
  termKey: "term1",
  termLabel: "1st Term",
  normPurpose: "exam",
  answers: answersFor(45),
  questions: objectivePaper(50, 45),
  paperMax: 60,
});
check("the job carries the answers and no score", job.answers !== undefined && job.score === undefined, true);
check("the job knows the paper it belongs to", `${job.examRowId}:${job.questionCount}:${job.paperMax}`, "12:50:60");

enqueueJob(job);
check("one submission queued", pendingCount(), 1);
enqueueJob(job);
check("re-submitting the same attempt does not duplicate it", pendingCount(), 1);

// A flush by the objective screen must leave another session type's job alone
let seen = [];
const onlyObjective = async (item) => {
  seen.push(item.sessionType);
  if (item.sessionType !== "objective") return "skip";
  return true;
};
let out = await flushQueue({ submitJob: onlyObjective, force: true });
check("the objective job was accepted", out.flushed, 1);
check("the queue is empty afterwards", pendingCount(), 0);
check("the job was the one offered", seen, ["objective"]);

// A failing write keeps the attempt queued, and the next pass tries again
enqueueJob(job);
out = await flushQueue({ submitJob: async () => false, force: true });
check("a failed upload leaves the result on the device", out.failed, 1);
check("and it is still queued", pendingCount(), 1);
const retrying = pendingJobs()[0];
check("the retry counts an attempt", retrying.attempts, 1);
check("with a backoff before the next try", retrying.nextAttemptAt > Date.now(), true);
out = await flushQueue({ submitJob: async () => true });
check("a blocked job is not retried before its backoff", out.flushed, 0);
out = await flushQueue({ submitJob: async () => true, force: true });
check("and succeeds when forced", out.flushed, 1);

// Only one tab flushes at a time
enqueueJob(job);
store.set("cbt_submit_lock", JSON.stringify({ tabId: "another-tab", at: Date.now() }));
out = await flushQueue({ submitJob: async () => true, force: true });
check("a second tab does not flush while the lock is held", out.skipped, "locked");
check("the attempt survives for the lock holder", pendingCount(), 1);
store.set("cbt_submit_lock", JSON.stringify({ tabId: "another-tab", at: Date.now() - 61000 }));
out = await flushQueue({ submitJob: async () => true, force: true });
check("a stale lock is taken over", out.flushed, 1);
removeJob("nothing-here");
check("removing an unknown key is harmless", pendingCount(), 0);

console.log(`\n${failures.length ? "FAILED" : "PASSED"}: ${checks - failures.length}/${checks} checks`);
if (failures.length) {
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
