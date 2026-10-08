// CBT scoring rules — single source of truth for every exam session type.
// The school's marking scheme is Test (30) + Project (10) + Examination (60) = 100,
// and the mid-term test alone is scored out of 30. A CBT paper contributes to
// exactly one of those sections, so its recorded marks can never exceed the
// section maximum, no matter how many questions the paper contains.

// Maximum marks each result column can hold
export const SECTION_MAX = { exam: 60, midterm: 30, test: 30, project: 10 };

// Human label of the section a purpose writes into (for on-screen notes)
export const SECTION_LABEL = { exam: "Examination", midterm: "Test" };

// 'exam' | 'midterm' | null — null means "do not persist" (practice/unknown).
// Comparison is trimmed + lowercased on purpose: papers stored with 'Midterm',
// 'EXAM' or trailing spaces must not fall through to the unclamped branch.
export function normalizePurpose(purpose) {
  const p = String(purpose || "").trim().toLowerCase();
  if (p === "exam") return "exam";
  if (p === "midterm" || p === "test") return "midterm";
  return null;
}

// Section ceiling for a normalized purpose ('exam' -> 60, everything else 30)
export const sectionMaxFor = (norm) =>
  norm === "exam" ? SECTION_MAX.exam : SECTION_MAX.midterm;

// Grade bands expressed as a percentage of the section maximum, so a 54/60 and a
// 27/30 both read as an A rather than being judged against the wrong scale.
export function gradeFor(score, sectionMax) {
  const max = Number(sectionMax) || 0;
  const pct = max > 0 ? ((Number(score) || 0) / max) * 100 : 0;
  if (pct >= 96) return "A+";
  if (pct >= 86) return "A";
  if (pct >= 80) return "B+";
  if (pct >= 70) return "B";
  if (pct >= 66) return "C+";
  if (pct >= 56) return "C";
  if (pct >= 46) return "D";
  return "E";
}

// Drop answers that cannot be graded: question index out of range, option index
// out of range, or a non-numeric key. Restoring a saved attempt onto a different
// paper used to keep stale indices, which inflated the score.
export function sanitizeAnswers(answers, questions) {
  const clean = {};
  const total = Array.isArray(questions) ? questions.length : 0;
  Object.keys(answers || {}).forEach((key) => {
    const qIdx = Number(key);
    const optIdx = Number(answers[key]);
    if (!Number.isInteger(qIdx) || qIdx < 0 || qIdx >= total) return;
    const options = questions[qIdx]?.answerOptions;
    if (!Array.isArray(options) || !Number.isInteger(optIdx) || optIdx < 0 || optIdx >= options.length) return;
    clean[qIdx] = optIdx;
  });
  return clean;
}

// Authoritative grading: recount correct answers against the questions actually
// loaded. This is the only place a score is derived, so a stored score can never
// survive into a result. Can never return more than questions.length.
export function recomputeCorrect(answers, questions) {
  const clean = sanitizeAnswers(answers, questions);
  let correct = 0;
  Object.keys(clean).forEach((qIdx) => {
    const question = questions[Number(qIdx)];
    if (question?.answerOptions?.[clean[qIdx]]?.isCorrect === true) correct++;
  });
  return Math.min(correct, Array.isArray(questions) ? questions.length : 0);
}

// Marks the paper is worth: the teacher-declared maxScore when present, else one
// mark per question. Read defensively — the column may not exist yet.
export function paperMaxScore(examRow, questionCount) {
  const total = Number(questionCount) || 0;
  const declared = Number(examRow?.maxScore);
  if (Number.isFinite(declared) && declared > 0) return declared;
  return total;
}

// Scale the raw correct count onto the paper's marks. A 45/50 paper worth 60
// marks becomes 54; full marks land exactly on the maximum, so the result can
// never be above what the paper is worth.
export function scaleScore(correct, questionCount, paperMax) {
  const total = Number(questionCount) || 0;
  const max = Number(paperMax) || 0;
  if (total <= 0 || max <= 0) return 0;
  const earned = Math.min(Math.max(Number(correct) || 0, 0), total);
  return Math.min(max, Math.round((earned / total) * max));
}

// Marks finally stored in the result column: the scaled score, capped at the
// section maximum. Returns null when the purpose must not be persisted.
export function storedScore({ correct, questionCount, paperMax, purpose }) {
  const norm = normalizePurpose(purpose);
  if (!norm) return null;
  const scaled = scaleScore(correct, questionCount, paperMax);
  return Math.min(scaled, sectionMaxFor(norm));
}

// Stable identity of one student's one attempt at one paper. Deliberately built
// from the exam row id (not Date.now()) so a reload, a retry or an offline flush
// recognises the same submission instead of creating a second result. sessionType
// is part of the key because the three session tables hold their own ids and the
// same numeric id can legitimately appear in more than one of them.
export function buildSubmissionKey({ studentId, examRowId, subject, termKey, normPurpose, sessionType }) {
  const normSubject = String(subject || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return [
    "cbt",
    String(sessionType || "objective").trim().toLowerCase(),
    String(studentId ?? "").trim(),
    String(examRowId ?? "unknown"),
    normSubject,
    String(termKey || "").trim(),
    String(normPurpose || "").trim(),
  ].join(":");
}
