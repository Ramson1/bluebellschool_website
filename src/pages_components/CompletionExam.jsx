'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import 'bootstrap/dist/css/bootstrap.min.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { supabase } from "../supabaseClient.js";
import { sendEmailNotification } from '../api/emailNotificationService';
import { resolveResultRecipients } from '../utils/resultRecipients';
import '../styles/QuizComponent.css';
import { evaluateCompletion } from '../utils/nlpScorer';
import { schoolSubjects } from '../utils/subjectUtils';
import { paperMaxScore } from '../utils/cbtScoring';
import { buildJob, enqueueJob, flushQueue, subscribeToQueue } from '../utils/cbtSubmitQueue';

const logo = '/logo.jpg';

const CompletionExam = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const name = searchParams.get('name')?.trim();
  const newClass = searchParams.get('newClass')?.trim();
  const currentTerm = searchParams.get('currentTerm')?.trim();
  const newSex = searchParams.get('newSex');
  const subject = searchParams.get('subject')?.trim();
  const duration = searchParams.get('duration');
  const purpose = searchParams.get('purpose')?.trim();

  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [answers, setAnswers] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [examResults, setExamResults] = useState(null);
  const [adminPassword, setAdminPassword] = useState(null);
  const [isLocked, setIsLocked] = useState(true);
  const [passwordInput, setPasswordInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [queueCount, setQueueCount] = useState(0); // results waiting on this device
  // The paper as loaded from the database: its id and declared marks decide the
  // score, so nothing held on this machine can
  const [examRow, setExamRow] = useState(null);
  
  // Auto-save features
  const [isSavingToStorage, setIsSavingToStorage] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // One attempt is submitted once, however it is triggered (button or the clock)
  const submittedRef = useRef(false);

  // The attempt is keyed on the paper rather than Date.now(), so reloading the
  // same exam resumes it instead of leaking a new record on every mount
  const keyPart = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const attemptKeyFor = (rowId) =>
    rowId ? `cbt_completion_${rowId}_${keyPart(name)}_${keyPart(subject)}_${keyPart(newClass)}` : null;
  const examId = attemptKeyFor(examRow?.id);

  // Marks this paper is worth: the teacher's declaration when present, otherwise
  // the sum of the question points
  const pointsTotal = questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);
  const paperMax = paperMaxScore(examRow, pointsTotal);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const withMax = await supabase
          .from('jmis_cbt_completion')
          .select('id, questions, subject, class, purpose, term, maxScore, created_at')
          .ilike('subject', `%${subject?.trim() || ''}%`)
          .ilike('class', `%${newClass?.trim() || ''}%`)
          .order('created_at', { ascending: false });

        // A paper is still gradeable from its question points when the declared-marks
        // column has not been created yet, so the exam must open without it
        const result = withMax.error && /maxScore/i.test(withMax.error.message || '')
          ? await supabase
            .from('jmis_cbt_completion')
            .select('id, questions, subject, class, purpose, term, created_at')
            .ilike('subject', `%${subject?.trim() || ''}%`)
            .ilike('class', `%${newClass?.trim() || ''}%`)
            .order('created_at', { ascending: false })
          : withMax;

        const { data, error } = result;
        if (error) throw error;
        
        if (!data || data.length === 0) {
          toast.error(`No completion questions available for ${subject}, ${newClass}.`);
          return;
        }
        
        if (data.length > 1) {
          console.warn('⚠️ [Completion] Several papers match this search, using the newest:',
            data.map((row) => row.id));
        }

        const chosenRow = data[0];
        setExamRow(chosenRow);
        const fetchedQuestions = chosenRow.questions || [];
        setQuestions(fetchedQuestions);
        
        // Try to load saved progress of this same paper
        setTimeout(() => loadFromLocalStorage(attemptKeyFor(chosenRow.id)), 500);
      } catch (error) {
        console.error('Error fetching questions:', error);
        toast.error('Error fetching questions: ' + error.message);
      }
    };
    fetchQuestions();
  }, [subject, newClass]);

  // Timer
  useEffect(() => {
    if (timeLeft <= 0 || showScore || isLocked) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          toast.warning('Time is up! Submitting your exam...');
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeLeft, showScore, isLocked]);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const secs = seconds % 60;
    return `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleAnswerChange = (index, value) => {
    const newAnswers = { ...answers, [index]: value };
    setAnswers(newAnswers);
    saveToLocalStorage(newAnswers);
  };

  const saveToLocalStorage = (currentAnswers) => {
    if (!examId) return;
    try {
      setIsSavingToStorage(true);
      const examData = {
        examId, name, newClass, currentTerm, subject, purpose, duration,
        answers: currentAnswers,
        questionCount: questions.length,
        currentQuestion, timeLeft,
        timestamp: new Date().toISOString(),
        isComplete: false
      };
      localStorage.setItem(examId, JSON.stringify(examData));
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    } finally {
      setIsSavingToStorage(false);
    }
  };

  // Resume only the saved attempt of THIS paper. The old lookup took the newest
  // record whose key merely contained the student's name and the subject, which
  // could hand one paper's answers to another.
  const loadFromLocalStorage = (key) => {
    try {
      if (!key) return false;
      const raw = localStorage.getItem(key);
      if (!raw) return false;

      const savedData = JSON.parse(raw);
      if (!savedData || savedData.isComplete) return false;

      const savedCount = Number(savedData.questionCount || 0);
      if (savedCount && savedCount !== questions.length) {
        localStorage.removeItem(key);
        toast.info('Starting a fresh attempt — the previous paper differs.');
        return false;
      }

      setAnswers(savedData.answers || {});
      setCurrentQuestion(savedData.currentQuestion || 0);
      setTimeLeft(savedData.timeLeft || duration * 60);
      toast.info('Restored your previous exam progress!');
      return true;
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
    return false;
  };

  // ---- offline submission queue ------------------------------------------
  // Completion results live in the same queue as the other sessions: the sitting
  // is written to this device first and only dropped once the server accepts it,
  // so a slow connection in the exam room cannot lose the student's marks.
  const flushRef = useRef(null);
  const submitJobRef = useRef(null);

  useEffect(() => {
    // keep pointing at the freshest closures (supabase writes, paper, answers)
    submitJobRef.current = persistQueuedResult;
    flushRef.current = async () => {
      if (!submitJobRef.current) return;
      const { flushed } = await flushQueue({ submitJob: submitJobRef.current });
      if (flushed > 0) toast.success(`✅ ${flushed} completion result(s) uploaded.`);
    };
  });

  useEffect(() => {
    const unsubscribe = subscribeToQueue((jobs) => setQueueCount(jobs.length));
    flushRef.current?.();
    const goOnline = () => flushRef.current?.();
    const becameVisible = () => { if (!document.hidden) flushRef.current?.(); };
    window.addEventListener('online', goOnline);
    document.addEventListener('visibilitychange', becameVisible);
    const heartbeat = setInterval(() => flushRef.current?.(), 20000);
    return () => {
      window.removeEventListener('online', goOnline);
      document.removeEventListener('visibilitychange', becameVisible);
      clearInterval(heartbeat);
      unsubscribe();
    };
  }, []);

  const handleSubmitExam = async () => {
    // One sitting is recorded once, whichever route reaches it (button or clock)
    if (submittedRef.current) return;
    submittedRef.current = true;

    // Evaluate all answers using NLP
    let totalScore = 0;
    const results = questions.map((q, index) => {
      const evaluation = evaluateCompletion(answers[index] || '', q);
      totalScore += evaluation.score;
      return {
        questionIndex: index,
        questionText: q.questionText,
        studentAnswer: answers[index] || '',
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation.feedback,
        expectedAnswers: q.expectedAnswers
      };
    });

    // The marks the paper is worth are the ceiling: a sitting can never report
    // more than the teacher declared, even if the question points add up higher
    const earned = Math.min(totalScore, paperMax);

    setExamResults({ totalScore: earned, maxScore: paperMax, results });
    setScore(earned);
    
    // Mark exam as complete in localStorage
    try {
      const examData = JSON.parse(localStorage.getItem(examId) || '{}');
      examData.isComplete = true;
      localStorage.setItem(examId, JSON.stringify(examData));
    } catch (error) {
      console.error('Error marking exam complete:', error);
    }
    
    await uploadResults();
    setShowScore(true);
    setIsSubmitted(true);
  };

  // Queue this sitting and try to push it straight away. Nothing is reported as
  // saved until the flush has been acknowledged, and the answers (never a score)
  // are what travel, so the marks are re-derived on the way in.
  const uploadResults = async () => {
    if (purpose === 'practice') {
      toast.success("Practice test completed! Results not saved.");
      return;
    }

    if (!examRow?.id) {
      toast.error("Error: this paper has no identity on the server, so its result cannot be recorded.");
      return;
    }

    setIsSaving(true);
    try {
      const studentId = await fetchStudentId();
      if (!studentId) {
        toast.error("Error: your name and class do not match a student record, so the result cannot be saved.");
        return;
      }

      enqueueJob(buildJob({
        studentId,
        studentName: name,
        studentClass: newClass,
        examRowId: examRow.id,
        subject: subject || examRow.subject,
        termKey: currentTerm,
        termLabel: currentTerm,
        normPurpose: purpose,
        answers,
        questions,
        paperMax,
        sessionType: 'completion',
      }));

      await flushRef.current?.();
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadNow = async () => {
    setIsSaving(true);
    try {
      const { flushed, remaining } = await flushQueue({ submitJob: persistQueuedResult, force: true });
      if (flushed > 0) toast.success(`\u2705 ${flushed} result(s) uploaded.`);
      else if (remaining > 0) toast.error('Still offline \u2014 the result stays queued on this device and will upload automatically.');
    } finally {
      setIsSaving(false);
    }
  };

  const fetchStudentId = async () => {
    try {
      const { data } = await supabase
        .from('jmis_student')
        .select('id')
        .eq('name', name)
        .eq('class', newClass)
        .order('id', { ascending: true })
        .limit(1);
      if (data?.[0]?.id) return data[0].id;

      // Same student recorded with different spacing or case
      const { data: fuzzy } = await supabase
        .from('jmis_student')
        .select('id')
        .ilike('name', String(name || '').trim())
        .ilike('class', String(newClass || '').trim().replace(/\s+/g, '%'))
        .order('id', { ascending: true })
        .limit(1);
      return fuzzy?.[0]?.id || null;
    } catch (error) {
      console.error('Error matching the student:', error.message);
      return null;
    }
  };

  // Read one paper by id, degrading to the pre-migration column list when the
  // declared-marks column does not exist yet
  const loadPaper = async (rowId) => {
    const withMax = await supabase
      .from('jmis_cbt_completion')
      .select('id, questions, subject, class, purpose, term, maxScore')
      .eq('id', rowId)
      .limit(1);
    if (withMax.error && /maxScore/i.test(withMax.error.message || '')) {
      return supabase
        .from('jmis_cbt_completion')
        .select('id, questions, subject, class, purpose, term')
        .eq('id', rowId)
        .limit(1);
    }
    return withMax;
  };

  // ---- persistence --------------------------------------------------------
  // Driven entirely by the queued job: it refetches the paper, re-scores every
  // answer against it and clamps the total to the marks the paper is worth, so a
  // retry or an offline flush can neither double-count nor exceed the maximum.
  // true = recorded (or already recorded), false = retry later, 'skip' = another
  // session type's job.
  const persistQueuedResult = async (job) => {
    if (job.sessionType !== 'completion') return 'skip';
    if (!job?.examRowId) {
      console.warn('⚠️ [Persist] Job has no paper id, cannot grade it reliably.');
      return false;
    }

    const { data: rows, error: paperError } = await loadPaper(job.examRowId);
    if (paperError) {
      console.error('❌ [Persist] Could not read the paper:', paperError);
      return false;
    }
    const paper = rows && rows.length ? rows[0] : null;
    if (!paper) {
      console.error('❌ [Persist] The paper is no longer available:', job.examRowId);
      return true; // stop retrying a paper that is gone
    }

    const paperQuestions = Array.isArray(paper.questions) ? paper.questions : [];
    const questionCount = paperQuestions.length;
    const pointsTotal = paperQuestions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);
    const max = paperMaxScore(paper, pointsTotal);

    // Re-score from the stored answers, never from a number that came off disk
    const breakdown = paperQuestions.map((q, index) => {
      const evaluation = evaluateCompletion(job.answers?.[index] || '', q);
      return {
        questionText: q.questionText,
        studentAnswer: job.answers?.[index] || '',
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation.feedback,
      };
    });
    const earned = breakdown.reduce((sum, r) => sum + (Number(r.score) || 0), 0);
    const marks = Math.min(earned, max);
    const correctCount = breakdown.filter((r) => r.isCorrect).length;

    try {
      const { data: claim } = await supabase
        .from('jmis_cbt_results')
        .select('id')
        .eq('submissionKey', job.submissionKey)
        .limit(1);
      if (claim && claim.length) {
        // Already on file: this is a retry, so the sitting is complete
        cleanupAfterSuccess(job);
        return true;
      }
    } catch (error) {
      // A missing submissionKey column must never block the result itself
      console.warn('⚠️ [Persist] Dedupe check unavailable:', error.message);
    }

    const payload = {
      studentId: job.studentId,
      studentName: job.studentName,
      studentClass: String(job.studentClass || '').toUpperCase(),
      score: marks,
      totalQuestions: questionCount,
      percentage: max > 0 ? ((marks / max) * 100).toFixed(2) : '0',
      subject: job.subject,
      term: job.termLabel,
      purpose: paper.purpose ?? job.normPurpose,
      sessionType: 'completion',
      answers: job.answers,
      submissionKey: job.submissionKey,
      created_at: new Date().toISOString(),
    };
    if (Number.isFinite(max) && max > 0) payload.maxScore = max;

    let attempt = await supabase.from('jmis_cbt_results').insert([payload]);
    if (attempt.error && /maxScore|submissionKey/i.test(attempt.error.message || '')) {
      // Migration not pasted yet: record the result without the new columns
      console.warn('⚠️ [Persist] Saving without the new columns:', attempt.error.message);
      delete payload.maxScore;
      delete payload.submissionKey;
      attempt = await supabase.from('jmis_cbt_results').insert([payload]);
    }
    if (attempt.error) {
      console.error('❌ [Persist] Insert failed:', attempt.error);
      // 23505 = the unique index says this attempt is already recorded
      if (attempt.error.code === '23505') {
        cleanupAfterSuccess(job);
        return true;
      }
      return false;
    }

    await sendResultEmail({
      studentName: job.studentName,
      studentClass: job.studentClass,
      term: job.termLabel,
      subject: job.subject,
      questionCount,
      correctCount,
      marks,
      max,
      breakdown,
    });
    cleanupAfterSuccess(job);
    return true;
  };

  const cleanupAfterSuccess = (job) => {
    const key = attemptKeyFor(job.examRowId);
    if (key) {
      try { localStorage.removeItem(key); } catch (error) { /* ignore */ }
    }
  };

  // Built from the record that was just persisted, not from component state, so
  // the email can never describe a different sitting than the one on file
  const sendResultEmail = async (record) => {
    const examType = 'Completion Session';
    const { studentName, studentClass, term, subject: paperSubject, questionCount, correctCount, marks, max, breakdown } = record;
    const incorrectCount = questionCount - correctCount;

    const detailedScores = (breakdown || []).map((r, idx) => {
      return `Q${idx + 1}: ${r.isCorrect ? '✓ Correct' : '✗ Wrong'} - "${r.studentAnswer}" (${r.feedback})`;
    }).join('\n');

    const emailSubject = `CBT ${examType} Result - ${studentName}`;
    const emailMessage = `Student has completed a CBT ${examType.toLowerCase()}:

Student Name: ${studentName}
Class: ${studentClass}
Term: ${term || 'N/A'}
Subject: ${paperSubject}
Session Type: Completion

Performance Summary:
Total Questions: ${questionCount}
Correct Answers: ${correctCount}
Incorrect Answers: ${incorrectCount}
Score: ${marks}/${max}
Percentage: ${max > 0 ? ((marks / max) * 100).toFixed(2) : '0.00'}%

Detailed Breakdown:
${detailedScores}

---
Automated notification from Bluebell CBT System`;

    // Delivered to the addresses this school configures — see src/utils/resultRecipients.js
    const recipients = await resolveResultRecipients(supabase);
    
    try {
      await sendEmailNotification(supabase, emailSubject, emailMessage, recipients);
    } catch (error) {
      console.error('Email error:', error);
    }
  };

  const handleUnlock = async () => {
    if (!passwordInput) {
      toast.error("Please enter the admin password.");
      return;
    }

    const { data, error } = await supabase
      .from('jmis_settings')
      .select('cbtPassword')
      .single();

    if (error) {
      toast.error('Error fetching admin password.');
      return;
    }

    if (passwordInput === data.cbtPassword) {
      setAdminPassword(passwordInput);
      setIsLocked(false);
      toast.success("Exam unlocked. Good luck!");
    } else {
      toast.error("Incorrect admin password.");
    }
  };

  if (isLocked) {
    return (
      <div className="lock-screen">
        <div className="lock-screen-content">
          <h2>🔒 Locked Exam</h2>
          <p>Please enter the admin password to start the completion exam.</p>
          <input
            type="password"
            className="form-control mb-3"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Enter admin password"
          />
          <button className="btn btn-primary" onClick={handleUnlock}>Unlock Exam</button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return <div className="container mt-5"><h3>No completion questions available.</h3></div>;
  }

  return (
    <div className="container">
      <ToastContainer />
      
      {/* Auto-Save Indicator */}
      {lastSaved && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          padding: '6px 12px', borderRadius: '15px', fontSize: '0.85rem',
          backgroundColor: isSavingToStorage ? '#FFC107' : '#2196F3', color: 'white'
        }}>
          {isSavingToStorage ? '💾 Saving...' : `💾 Saved ${lastSaved.toLocaleTimeString()}`}
        </div>
      )}

      {/* Anything still waiting on this device stays visible while the student writes */}
      {queueCount > 0 && (
        <div
          role="status"
          onClick={handleUploadNow}
          style={{
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999,
            padding: '8px 14px', borderRadius: '15px', fontSize: '0.85rem',
            backgroundColor: '#fff3cd', color: '#664d03', cursor: 'pointer',
            border: '1px solid #ffe69c', maxWidth: '320px'
          }}
        >
          {`⏳ ${queueCount} exam result(s) queued on this device — will upload automatically when the connection returns`}
        </div>
      )}

      {/* Navbar */}
      <nav className="navbar navbar-light bg-light cbtNavbar mb-4">
        <div className="navbar-brand" style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
          <img src={logo} alt="Logo" style={{height: '40px'}} />
          <h4>Completion Exam - {subject}</h4>
        </div>
        <div className="d-flex align-items-center gap-3">
          <span className="badge bg-info">Student: {name}</span>
          <span className="badge bg-secondary">Class: {newClass}</span>
          <span className="badge bg-warning text-dark">Time: {formatTime(timeLeft)}</span>
          <span className="badge bg-light text-dark">Out of {paperMax} marks</span>
        </div>
      </nav>

      {/* Question Display */}
      {!showScore ? (
        <div className="quiz">
          <div className="question-card">
            <h5>Question {currentQuestion + 1} of {questions.length}</h5>
            <p className="question-text">{questions[currentQuestion].questionText}</p>
            <input
              type="text"
              className="form-control form-control-lg"
              value={answers[currentQuestion] || ''}
              onChange={(e) => handleAnswerChange(currentQuestion, e.target.value)}
              placeholder="Type your answer here..."
            />
          </div>

          {/* Navigation */}
          <div className="navigation-buttons mt-4">
            <button 
              className="btn btn-secondary me-2"
              onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
              disabled={currentQuestion === 0}
            >
              Previous
            </button>
            <button 
              className="btn btn-primary me-2"
              onClick={() => setCurrentQuestion(Math.min(questions.length - 1, currentQuestion + 1))}
              disabled={currentQuestion === questions.length - 1}
            >
              Next
            </button>
            <button className="btn btn-success" onClick={handleSubmitExam} disabled={isSaving || isSubmitted}>
              {isSaving ? 'Saving...' : 'Submit Exam'}
            </button>
          </div>

          {/* Question Navigation Grid */}
          <div className="question-grid mt-4">
            {questions.map((_, idx) => (
              <button
                key={idx}
                className={`btn btn-sm m-1 ${idx === currentQuestion ? 'btn-primary' : answers[idx] ? 'btn-success' : 'btn-outline-secondary'}`}
                onClick={() => setCurrentQuestion(idx)}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Results Display */
        <div className="score-modal">
          <div className="score-content">
            <h2>📊 Exam Results</h2>
            <div className="score-section">
              <p><strong>Total Questions:</strong> {questions.length}</p>
              <p><strong>Correct Answers:</strong> {examResults?.results.filter(r => r.isCorrect).length}</p>
              <p><strong>Incorrect Answers:</strong> {examResults?.results.filter(r => !r.isCorrect).length}</p>
              <p><strong>Score:</strong> {score}/{paperMax}</p>
              <p><strong>Percentage:</strong> {paperMax > 0 ? ((score / paperMax) * 100).toFixed(2) : '0.00'}%</p>
            </div>

            {queueCount > 0 && (
              <div className="alert alert-warning mt-3">
                <p className="mb-2">
                  {`⏳ ${queueCount} exam result(s) queued on this device — will upload automatically when the connection returns.`}
                </p>
                <button className="btn btn-sm btn-outline-dark" onClick={handleUploadNow} disabled={isSaving}>
                  {isSaving ? 'Uploading...' : 'Upload now'}
                </button>
              </div>
            )}

            <h4 className="mt-4">Detailed Breakdown:</h4>
            <div className="results-breakdown">
              {examResults?.results.map((r, idx) => (
                <div key={idx} className={`result-item ${r.isCorrect ? 'correct' : 'incorrect'}`}>
                  <p><strong>Q{idx + 1}:</strong> {r.questionText}</p>
                  <p>Your Answer: "{r.studentAnswer}"</p>
                  {!r.isCorrect && <p>Expected: {r.expectedAnswers.join(' or ')}</p>}
                  <p className="feedback">{r.feedback}</p>
                </div>
              ))}
            </div>

            <button className="btn btn-primary mt-4" onClick={() => router.push('/cbt')}>
              Back to CBT Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompletionExam;
