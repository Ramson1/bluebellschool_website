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
import '../styles/DetailedResults.css';
import { FaCheck, FaTrophy, FaEye, FaEyeSlash } from 'react-icons/fa';
import { schoolSubjects } from '../utils/subjectUtils';
import {
  normalizePurpose,
  sectionMaxFor,
  SECTION_LABEL,
  SECTION_MAX,
  recomputeCorrect,
  sanitizeAnswers,
  paperMaxScore,
  scaleScore,
  storedScore,
  gradeFor,
} from '../utils/cbtScoring';
import { buildJob, enqueueJob, flushQueue, subscribeToQueue } from '../utils/cbtSubmitQueue';

// Using logo from public directory
const logo = '/logo.jpg';

// Log of attempts whose email notification has already gone out
const EMAIL_LOG_KEY = 'cbt_email_keys';



const QuizComponent = () => {
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
  const [timeLeft, setTimeLeft] = useState(duration * 60); // Convert duration from minutes to seconds
  const [answers, setAnswers] = useState({}); // Store user answers
  const [adminPassword, setAdminPassword] = useState(null); // State to store admin password, init to null
  const [isLocked, setIsLocked] = useState(true); // State to manage lock screen visibility, default to true
  const [passwordInput, setPasswordInput] = useState(""); // State to manage password input visibility
  const [showPassword, setShowPassword] = useState(false); // State to manage password visibility
  const [isSubmitted, setIsSubmitted] = useState(false); // State to manage submission status

  // The paper actually loaded from the database. Its id and declared marks drive
  // every calculation, so nothing saved on the machine can decide a score.
  const [examRow, setExamRow] = useState(null);

  // Network reliability features
  const [networkStatus, setNetworkStatus] = useState({ isOnline: true, quality: 'good' });
  const [isSaving, setIsSaving] = useState(false);
  const [queueCount, setQueueCount] = useState(0); // results waiting on this device

  // Result review features
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(null);

  // LocalStorage auto-save features
  const [isSavingToStorage, setIsSavingToStorage] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // One attempt is submitted once, however it is triggered (button, timer expiry
  // or a re-render calling submit again)
  const submittedRef = useRef(false);

  // The attempt record is keyed on the exam row id rather than Date.now(), so
  // reloading the same paper resumes it instead of opening a brand new record.
  const keyPart = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const attemptKeyFor = (rowId) =>
    rowId ? `cbt_attempt_${rowId}_${keyPart(name)}_${keyPart(newClass)}_${keyPart(currentTerm)}` : null;
  const examKey = attemptKeyFor(examRow?.id);

  // Where the marks go is decided by the purpose stored on the paper (falling
  // back to the URL), normalised so 'Midterm' / 'EXAM ' cannot slip past the
  // clamps. null = nothing is persisted (practice papers).
  const normPurpose = normalizePurpose(examRow?.purpose ?? purpose);
  const sectionMax = normPurpose ? sectionMaxFor(normPurpose) : 0;

  // Live, always-recomputed view of this attempt
  const correctCount = recomputeCorrect(answers, questions);
  const paperMax = paperMaxScore(examRow, questions.length);
  const scaledScore = scaleScore(correctCount, questions.length, paperMax);
  const storedMarks = storedScore({
    correct: correctCount,
    questionCount: questions.length,
    paperMax,
    purpose: normPurpose,
  });

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        console.log('🔍 [QuizComponent] Fetching questions with params:', { 
          subject, 
          newClass, 
          purpose, 
          currentTerm 
        });
        
        // First, let's see what's actually in the database for this subject
        const { data: allQuestions, error: checkError } = await supabase
          .from('jmis_cbtQuestions')
          .select('subject, class, purpose, term')
          .ilike('subject', `%${subject?.trim() || ''}%`);
        
        if (checkError) {
          console.error('❌ [QuizComponent] Error checking database:', checkError);
        } else {
          console.log('📋 [QuizComponent] All matching questions in database:', allQuestions);
        }
        
        // Reusable filter chain, so the search can be repeated without the
        // declared-marks column when that column does not exist yet
        const withPaperFilters = (paperQuery) => {
          if (subject) {
            paperQuery = paperQuery.ilike('subject', `%${subject.trim()}%`);
          }

          if (newClass) {
            // Make class matching case-insensitive
            paperQuery = paperQuery.ilike('class', `%${newClass.trim()}%`);
          }

          if (purpose) {
            const trimmedPurpose = purpose.trim().toLowerCase();
            // Allow 'test' to match 'midterm' as well, since they are often used interchangeably in result processing
            if (trimmedPurpose === 'test' || trimmedPurpose === 'midterm') {
              paperQuery = paperQuery.or(`purpose.ilike.%test%,purpose.ilike.%midterm%`);
            } else {
              paperQuery = paperQuery.ilike('purpose', `%${trimmedPurpose}%`);
            }
          }

          if (currentTerm) {
            paperQuery = paperQuery.ilike('term', `%${currentTerm.trim()}%`);
          }

          // When several papers match, always take the same one (newest) instead of
          // whatever order the database happened to return
          return paperQuery.order('created_at', { ascending: false });
        };

        const searchPapers = async (columns) => withPaperFilters(
          supabase.from('jmis_cbtQuestions').select(columns)
        );

        let result = await searchPapers('id, questions, subject, class, purpose, term, maxScore, created_at');
        if (result.error && /maxScore/i.test(result.error.message || '')) {
          // The paper is still gradeable at one mark per question, so the exam must
          // open even before jmis_cbt_max_score.sql has been run
          result = await searchPapers('id, questions, subject, class, purpose, term, created_at');
        }

        const { data, error } = result;
        
        if (error) {
          console.error('❌ [QuizComponent] Database error:', error);
          throw error;
        }
        
        console.log('📊 [QuizComponent] Query result:', { 
          found: data?.length || 0, 
          data: data,
          searchedParams: { subject, newClass, purpose, currentTerm }
        });
        
        if (!data || data.length === 0) {
          console.warn('⚠️ [QuizComponent] No questions found!');
          console.warn('   Search params:', { subject, newClass, purpose, currentTerm });
          console.warn('   Available in DB:', allQuestions);
          toast.error(`No questions available for Subject: ${subject}, Class: ${newClass}, Purpose: ${purpose || 'Any'}.`);
        }
        
        const chosenRow = (data && data.length > 0)
          ? [...data].sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))[0]
          : null;
        if (data && data.length > 1) {
          console.warn('⚠️ [QuizComponent] Several papers match this search, using the newest:',
            data.map((row) => row.id));
        }

        setExamRow(chosenRow);
        const fetchedQuestions = chosenRow?.questions || [];
        setQuestions(fetchedQuestions);

        // Resume an interrupted attempt of THIS paper, if there is one
        if (fetchedQuestions.length > 0) {
          loadFromLocalStorage(fetchedQuestions, attemptKeyFor(chosenRow?.id));
        }
      } catch (error) {
        console.error('❌ [QuizComponent] Error fetching questions:', error);
        toast.error('Error fetching questions: ' + error.message);
      }
    };
    fetchQuestions();
  }, [subject, newClass, purpose, currentTerm]);

  useEffect(() => {
    const fetchAdminPassword = async () => {
      try {
        const { data, error } = await supabase
          .from('jmis_settings')
          .select('cbtPassword');
        if (error) throw error;
        // Use the first row if data exists, otherwise default to empty string
        setAdminPassword(data && data.length > 0 ? data[0].cbtPassword : "");
      } catch (error) {
        toast.error('Error fetching admin password: ' + error.message);
        setAdminPassword(""); // Fallback
      }
    };
    fetchAdminPassword();
  }, []);

  // Network quality monitoring - check every 5 seconds
  useEffect(() => {
    const checkNetworkQuality = async () => {
      const startTime = Date.now();
      try {
        // Test connectivity with a quick Supabase query
        const { error } = await supabase
          .from('jmis_cbtQuestions')
          .select('id')
          .limit(1)
          .maybeSingle();
        
        const latency = Date.now() - startTime;
        
        if (error) {
          setNetworkStatus({ isOnline: false, quality: 'offline' });
        } else {
          const quality = latency < 1000 ? 'good' : latency < 3000 ? 'poor' : 'offline';
          setNetworkStatus({ isOnline: true, quality });
          // A reachable server is the signal to push whatever is queued
          if (quality !== 'offline') flushRef.current?.();
        }
      } catch {
        setNetworkStatus({ isOnline: false, quality: 'offline' });
      }
    };

    checkNetworkQuality();
    const interval = setInterval(checkNetworkQuality, 5000);
    return () => clearInterval(interval);
  }, []);

  // ---- offline submission queue ------------------------------------------
  // The internet in the exam room is slow and shared, so a submission is written
  // to localStorage first and only removed once the server has acknowledged it.
  // Jobs are flushed on mount, when the browser says it is back online, when the
  // tab becomes visible, on the network tick and every 20 seconds here.
  const flushRef = useRef(null);
  const submitJobRef = useRef(null);

  useEffect(() => {
    // always point at the freshest closures (supabase writes, student details)
    submitJobRef.current = persistQueuedSubmission;
    flushRef.current = async () => {
      if (!submitJobRef.current) return;
      const { flushed } = await flushQueue({ submitJob: submitJobRef.current });
      if (flushed > 0) toast.success(`✅ ${flushed} exam result(s) uploaded.`);
    };
  });

  useEffect(() => {
    const unsubscribe = subscribeToQueue((jobs) => setQueueCount(jobs.length));

    // Clear attempt records written by the old Date.now() key format, which could
    // be resumed onto an unrelated paper and carry its marks along
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('cbt_exam_'))
        .slice(0, 200)
        .forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.warn('⚠️ [Queue] Could not prune old attempt records:', error);
    }

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

  useEffect(() => {
    if (isLocked) return;

    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timer);
          setShowScore(true);
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLocked]);

  // Running out of time used to only show the score screen, so those scripts were
  // never recorded. The clock reaching zero now submits the attempt as well
  // (handleSubmitExam ignores a repeat call).
  useEffect(() => {
    if (isLocked || timeLeft !== 0) return;
    handleSubmitExam();
  }, [timeLeft, isLocked]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      const password = prompt("Enter admin password to continue the exam:");
      if (password !== adminPassword) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [adminPassword]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsLocked(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleUnlock = () => {
    if (adminPassword === null) {
      toast.info("Please wait, loading system configuration...");
      return;
    }
    if (passwordInput === adminPassword) {
      setIsLocked(false);
      setPasswordInput("");
    } else {
      toast.error("Incorrect admin password.");
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const secs = seconds % 60;
    return `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleAnswerOptionClick = (index) => {
    const newAnswers = sanitizeAnswers({ ...answers, [currentQuestion]: index }, questions);
    setAnswers(newAnswers);

    // Auto-save to localStorage; the count is derived from `answers` on render
    saveToLocalStorage(newAnswers, questions.length);
  };
  
  // Save exam progress to localStorage. Only the raw answers are kept: the score
  // is always recounted on restore, so a number saved against one paper can never
  // be carried into another.
  const saveToLocalStorage = (currentAnswers, questionCount) => {
    if (!examKey) return;
    try {
      setIsSavingToStorage(true);
      const examData = {
        examKey,
        examRowId: examRow?.id ?? null,
        name,
        newClass,
        currentTerm,
        subject,
        purpose,
        duration,
        answers: currentAnswers,
        questionCount,
        currentQuestion,
        timeLeft,
        timestamp: new Date().toISOString(),
        isComplete: false
      };
      
      localStorage.setItem(examKey, JSON.stringify(examData));
      setLastSaved(new Date());
      console.log('💾 [AutoSave] Saved to localStorage');
    } catch (error) {
      console.error('❌ [AutoSave] Error saving to localStorage:', error);
    } finally {
      setIsSavingToStorage(false);
    }
  };
  
  // Resume the saved attempt of THIS paper, keyed on the exam row id. The old
  // lookup matched any record whose key merely contained the student's name and
  // the subject word, so a 50-question sitting could hand its score to a
  // 20-question exam and the student would finish "above the maximum".
  const loadFromLocalStorage = (loadedQuestions, key) => {
    try {
      if (!key || !loadedQuestions?.length) return false;
      const raw = localStorage.getItem(key);
      if (!raw) return false;

      const savedData = JSON.parse(raw);
      if (!savedData || savedData.isComplete) return false;

      const savedCount = Number(savedData.questionCount || 0);
      if (savedCount && savedCount !== loadedQuestions.length) {
        localStorage.removeItem(key);
        toast.info('Starting a fresh attempt — the previous paper differs.');
        return false;
      }

      const cleanAnswers = sanitizeAnswers(savedData.answers || {}, loadedQuestions);
      console.log('📂 [AutoLoad] Found saved attempt:', savedData.timestamp);
      setAnswers(cleanAnswers);
      setCurrentQuestion(
        Number.isInteger(savedData.currentQuestion) && savedData.currentQuestion >= 0 && savedData.currentQuestion < loadedQuestions.length
          ? savedData.currentQuestion
          : 0
      );
      setTimeLeft(savedData.timeLeft || duration * 60);
      toast.info('Restored your previous exam progress!');
      return true;
    } catch (error) {
      console.error('❌ [AutoLoad] Error loading from localStorage:', error);
    }
    return false;
  };

  const handlePreviousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handleSubmitExam = async () => {
    // A student can press Submit and the clock can expire in the same second, or
    // press it twice on a slow connection. One attempt, one result.
    if (submittedRef.current) return;
    submittedRef.current = true;

    // Flag the local record only once the submission is safely queued, and delete
    // it only after the server has acknowledged it (inside uploadResults)
    if (examKey) {
      try {
        const examData = JSON.parse(localStorage.getItem(examKey) || '{}');
        examData.isComplete = true;
        localStorage.setItem(examKey, JSON.stringify(examData));
      } catch (error) {
        console.error('Error marking exam complete:', error);
      }
    }

    setShowScore(true);
    setIsSubmitted(true);
    await uploadResults();
  };

  const getCongratulationMessage = (percentage) => {
    if (percentage >= 70) {
      return <span style={{ color: 'green' }}>Excellent! You did a great job!</span>;
    } else if (percentage >= 50) {
      return <span style={{ color: 'orange' }}>Good job! Keep it up!</span>;
    } else if (percentage >= 30) {
      return <span style={{ color: 'red' }}>You passed! But there's room for improvement.</span>;
    } else {
      return <span style={{ color: 'red' }}>You didn't pass. Better luck next time!</span>;
    }
  };

  // What the student sees: marks out of the paper's own maximum. The old display
  // hardcoded 40 for exams, while the school's Examination column is worth 60.
  const displayedScore = normPurpose ? scaledScore : correctCount;
  const displayedTotal = normPurpose ? paperMax : questions.length;
  const percentageScore = displayedTotal > 0 ? (displayedScore / displayedTotal) * 100 : 0;
  const displayedGrade = gradeFor(displayedScore, displayedTotal);

  // Categorize questions for detailed review
  const getQuestionCategories = () => {
    const correct = [];
    const incorrect = [];
    const unattempted = [];

    questions.forEach((question, index) => {
      const userAnswer = answers[index];
      
      if (userAnswer === undefined) {
        unattempted.push({
          questionNumber: index + 1,
          questionText: question.questionText,
          options: question.answerOptions
        });
      } else {
        const isCorrect = question.answerOptions[userAnswer]?.isCorrect;
        if (isCorrect) {
          correct.push({
            questionNumber: index + 1,
            questionText: question.questionText,
            selectedOption: userAnswer,
            selectedText: question.answerOptions[userAnswer].answerText,
            options: question.answerOptions
          });
        } else {
          incorrect.push({
            questionNumber: index + 1,
            questionText: question.questionText,
            selectedOption: userAnswer,
            selectedText: question.answerOptions[userAnswer].answerText,
            correctOption: question.answerOptions.findIndex(opt => opt.isCorrect),
            correctText: question.answerOptions.find(opt => opt.isCorrect)?.answerText,
            options: question.answerOptions
          });
        }
      }
    });

    return { correct, incorrect, unattempted };
  };

  const handleDownloadResultsReview = () => {
    const categories = getQuestionCategories();
    
    // Determine school name based on class/year
    const schoolName = (newClass.toLowerCase().includes('year') && 
                       parseInt(newClass.split(' ')[1]) >= 7) 
      ? 'Bluebell International High School'
      : 'Bluebell International School';
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    
    // Generate HTML content with exact styling
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Detailed CBT Results - ${name}</title>
  <style>
    @page {
      margin: 1.5cm;
      size: A4;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #000;
      font-size: 11pt;
    }
    
    .header {
      border-bottom: 3px solid #007bff;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    
    .school-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 15px;
    }
    
    .school-logo {
      width: 80px;
      height: 80px;
      object-fit: contain;
    }
    
    .school-info {
      flex: 1;
      text-align: center;
    }
    
    h1 {
      color: #2c3e50;
      font-size: 24pt;
      margin-bottom: 5px;
    }
    
    .subtitle {
      color: #7f8c8d;
      font-size: 14pt;
      font-weight: normal;
    }
    
    h2 {
      color: #34495e;
      font-size: 18pt;
      margin-top: 20px;
      margin-bottom: 15px;
      border-bottom: 2px solid #3498db;
      padding-bottom: 5px;
    }
    
    h3 {
      color: #2c3e50;
      font-size: 14pt;
      margin-top: 15px;
      margin-bottom: 10px;
    }
    
    .student-info {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      margin-top: 10px;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    
    .info-item {
      margin-bottom: 8px;
    }
    
    .info-label {
      font-weight: bold;
      color: #495057;
    }
    
    .summary-stats {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-top: 15px;
    }
    
    .stat-card {
      padding: 15px;
      border-radius: 5px;
      text-align: center;
    }
    
    .stat-correct {
      background: #d4edda;
      color: #155724;
    }
    
    .stat-incorrect {
      background: #f8d7da;
      color: #721c24;
    }
    
    .stat-unattempted {
      background: #fff3cd;
      color: #856404;
    }
    
    .stat-total {
      background: #d1ecf1;
      color: #0c5460;
    }
    
    .stat-number {
      font-size: 2rem;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .stat-label {
      font-size: 0.9rem;
    }
    
    .question-card {
      border: 2px solid;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    
    .question-correct {
      border-color: #28a745;
      background: #d4edda;
    }
    
    .question-incorrect {
      border-color: #dc3545;
      background: #f8d7da;
    }
    
    .question-unattempted {
      border-color: #ffc107;
      background: #fff3cd;
    }
    
    .question-title {
      font-weight: bold;
      font-size: 12pt;
      margin-bottom: 10px;
    }
    
    .option {
      padding: 8px;
      margin: 5px 0;
      border-radius: 4px;
      border: 1px solid #ddd;
    }
    
    .option-correct {
      background: #28a745;
      color: white;
      border-color: #28a745;
    }
    
    .option-user-wrong {
      background: #ffc107;
      color: black;
      border-color: #007bff;
      border-width: 2px;
    }
    
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #007bff;
      text-align: center;
      color: #6c757d;
    }
    
    @media print {
      body {
        font-size: 11pt;
      }
      
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="school-header">
      <img src="${window.location.origin}/logo.jpg" alt="School Logo" class="school-logo" />
      <div class="school-info">
        <h1>${schoolName}</h1>
        <div class="subtitle">Detailed CBT Exam Results - Review</div>
      </div>
    </div>
    <div class="student-info">
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Student Name:</div>
          <div>${name}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Class:</div>
          <div>${newClass}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Subject:</div>
          <div>${subject}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Exam Type:</div>
          <div>${purpose === 'midterm' || purpose === 'test' ? 'Mid-term Exam' : purpose === 'exam' ? 'Final Exam' : 'Practice Test'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Term:</div>
          <div>${currentTerm || 'N/A'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Date:</div>
          <div>${new Date().toLocaleDateString()}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="summary-stats">
    <h2>Exam Summary</h2>
    <div class="stats-grid">
      <div class="stat-card stat-correct">
        <div class="stat-number">${categories.correct.length}</div>
        <div class="stat-label">Correct</div>
      </div>
      <div class="stat-card stat-incorrect">
        <div class="stat-number">${categories.incorrect.length}</div>
        <div class="stat-label">Incorrect</div>
      </div>
      <div class="stat-card stat-unattempted">
        <div class="stat-number">${categories.unattempted.length}</div>
        <div class="stat-label">Unattempted</div>
      </div>
      <div class="stat-card stat-total">
        <div class="stat-number">${questions.length}</div>
        <div class="stat-label">Total</div>
      </div>
    </div>
  </div>

  ${categories.correct.length > 0 ? `
  <h2>✅ Correct Answers (${categories.correct.length})</h2>
  ${categories.correct.map(item => `
    <div class="question-card question-correct">
      <div class="question-title">Question ${item.questionNumber}: ${item.questionText}</div>
      <div style="margin-top: 10px;">
        ${item.options.map((opt, idx) => `
          <div class="option ${opt.isCorrect ? 'option-correct' : ''}" style="${answers[item.questionNumber - 1] === idx ? 'border: 2px solid #007bff;' : ''}">
            ${String.fromCharCode(65 + idx)}. ${opt.answerText}${opt.isCorrect ? ' ✓' : ''}${answers[item.questionNumber - 1] === idx ? ' (Your Answer)' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')}
  ` : ''}

  ${categories.incorrect.length > 0 ? `
  <h2>❌ Incorrect Answers (${categories.incorrect.length})</h2>
  ${categories.incorrect.map(item => `
    <div class="question-card question-incorrect">
      <div class="question-title">Question ${item.questionNumber}: ${item.questionText}</div>
      <div style="margin-top: 10px;">
        ${item.options.map((opt, idx) => `
          <div class="option ${opt.isCorrect ? 'option-correct' : ''}" style="${answers[item.questionNumber - 1] === idx ? 'border: 2px solid #007bff; background: #ffc107; color: black;' : ''}">
            ${String.fromCharCode(65 + idx)}. ${opt.answerText}${opt.isCorrect ? ' ✓ Correct Answer' : ''}${answers[item.questionNumber - 1] === idx ? ' (Your Answer)' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')}
  ` : ''}

  ${categories.unattempted.length > 0 ? `
  <h2>⏭️ Unattempted Questions (${categories.unattempted.length})</h2>
  ${categories.unattempted.map(item => `
    <div class="question-card question-unattempted">
      <div class="question-title">Question ${item.questionNumber}: ${item.questionText}</div>
      <div style="margin-top: 10px;">
        ${item.options.map((opt, idx) => `
          <div class="option ${opt.isCorrect ? 'option-correct' : ''}">
            ${String.fromCharCode(65 + idx)}. ${opt.answerText}${opt.isCorrect ? ' ✓ Correct Answer' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')}
  ` : ''}

  <div class="footer">
    <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
    <div>Bluebell CBT Examination System</div>
  </div>

  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() {
        window.close();
      };
    };
  </script>
</body>
</html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    toast.success('PDF generation started - select "Save as PDF" in print dialog!');
  };

  const fetchStudentId = async (studentName, studentClass) => {
    try {
      const { data, error } = await supabase
        .from("jmis_student")
        .select("id")
        .eq("name", studentName)
        .eq("class", studentClass)
        .single();

      if (error) {
        throw error;
      }

      return data?.id || null;
    } catch (error) {
      console.error("Error fetching student ID: ", error.message);
      return null;
    }
  };

  // Marks a subject entry can hold: nothing may exceed its own section maximum
  // (Test 30, Project 10, Examination 60), whatever a caller hands in.
  const clampToSection = (field, value) => {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(Math.max(n, 0), SECTION_MAX[field]);
  };

  const asNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };

  const normalizeSubjectKey = (value) => String(value || '').toLowerCase().replace(/[\s.]/g, '');

  const termKeyFor = (term) => (term === "1st Term" ? "term1Subjects"
    : term === "2nd Term" ? "term2Subjects"
      : "term3Subjects");

  // The subject label stored for this class, so a paper named "Maths" still
  // updates the "Mathematics" row instead of creating a duplicate subject.
  const canonicalSubjectName = (value, studentClassName) => {
    const list = schoolSubjects[String(studentClassName || '').toLowerCase().replace(/\s+/g, '')] || [];
    return list.find((s) => normalizeSubjectKey(s) === normalizeSubjectKey(value)) || value;
  };

  // Refetch the paper so the marks are recounted from the questions on the
  // server, never from a number captured earlier (or saved on this machine).
  const loadPaper = async (examRowId) => {
    try {
      const read = async (columns) => supabase
        .from('jmis_cbtQuestions')
        .select(columns)
        .eq('id', examRowId)
        .maybeSingle();

      let { data, error } = await read('id, questions, subject, class, purpose, term, maxScore');
      if (error && /maxScore/i.test(error.message || '')) {
        // Marks default to one per question until the column is created
        ({ data, error } = await read('id, questions, subject, class, purpose, term'));
      }
      if (error) return { status: 'error', error };
      if (!data || !Array.isArray(data.questions) || data.questions.length === 0) return { status: 'missing' };
      return { status: 'ok', paper: data };
    } catch (error) {
      return { status: 'error', error };
    }
  };

  // Class labels and names are stored inconsistently, so an exact match miss
  // falls back to a case-insensitive one rather than dropping the result.
  const resolveStudentId = async () => {
    const direct = await fetchStudentId(name, newClass);
    if (direct) return direct;
    try {
      const { data } = await supabase
        .from("jmis_student")
        .select("id")
        .ilike("name", name.trim())
        .ilike("class", String(newClass || '').trim().replace(/\s+/g, '%'))
        .order('id', { ascending: true })
        .limit(1);
      return data?.[0]?.id || null;
    } catch (error) {
      console.error("Error matching the student: ", error.message);
      return null;
    }
  };

  // ---- persistence --------------------------------------------------------
  // One submission is recorded once. It is driven entirely by the queued job (the
  // student's raw answers and the paper id), recounts the marks against the paper
  // as it is stored, and clamps them to the section maximum, so a retry, an
  // offline flush or a double press can never add marks twice or record a score
  // above the maximum. Returns true when the server has accepted the attempt.
  const persistQueuedSubmission = async (job) => {
    // The queue is shared by the three session types; only the objective writer
    // runs here, anything else is left queued for its own screen to flush
    if ((job.sessionType || 'objective') !== 'objective') return 'skip';
    if (!job?.examRowId) {
      console.warn('⚠️ [Persist] Job has no paper id, cannot grade it reliably.');
      return false;
    }

    const loaded = await loadPaper(job.examRowId);
    if (loaded.status === 'error') return false;                     // offline: retry later
    if (loaded.status === 'missing') {
      console.error('❌ [Persist] The paper is no longer available:', job.examRowId);
      return true;                                                    // stop retrying a paper that is gone
    }

    const paper = loaded.paper;
    const questionCount = paper.questions.length;
    const correct = recomputeCorrect(job.answers, paper.questions);
    const max = paperMaxScore(paper, questionCount);
    const purposeNorm = normalizePurpose(paper.purpose ?? job.normPurpose);
    const marks = storedScore({ correct, questionCount, paperMax: max, purpose: purposeNorm });
    if (marks === null) return true;                                  // practice paper: nothing stored

    const termKey = termKeyFor(job.termLabel);

    // Newest row for this student: some students hold more than one jmis_result
    // row, and maybeSingle() would silently pick either of them
    const { data: rows, error: readError } = await supabase
      .from('jmis_result')
      .select(`id, studentId, ${termKey}`)
      .eq('studentId', job.studentId)
      .order('id', { ascending: false })
      .limit(1);
    if (readError) {
      console.error('❌ [Persist] Could not read the result row:', readError);
      return false;
    }

    const row = rows && rows.length ? rows[0] : null;
    const storedSubjects = row?.[termKey] || [];
    const index = storedSubjects.findIndex((e) => normalizeSubjectKey(e.subjectName) === normalizeSubjectKey(job.subject));

    // This exact attempt is already recorded — a retry, not new work
    if (row && index !== -1 && storedSubjects[index].cbtKey === job.submissionKey) {
      cleanupAfterSuccess(job);
      return true;
    }

    const previous = index !== -1 ? storedSubjects[index] : {};
    const entry = { ...previous, subjectName: previous.subjectName || canonicalSubjectName(job.subject, job.studentClass) };
    if (purposeNorm === 'midterm') entry.test = String(marks);
    else entry.examination = String(marks);

    // Rebuild the total from clamped components, so this row can never add up to
    // more than 100 or show an Examination above 60
    const testTotal = clampToSection('midterm', entry.test);
    const projectTotal = clampToSection('project', entry.project);
    const examTotal = clampToSection('exam', entry.examination);
    entry.total = testTotal + projectTotal + examTotal;
    entry.grade = gradeFor(entry.total, 100);
    if (entry.remark === undefined || entry.remark === null) entry.remark = "";
    entry.cbtKey = job.submissionKey;
    entry.cbt = {
      correct,
      questionCount,
      paperMax: max,
      stored: marks,
      section: purposeNorm === 'midterm' ? 'test' : 'examination',
      sessionType: job.sessionType || 'objective',
      submittedAt: job.queuedAt || new Date().toISOString(),
    };

    if (row) {
      // Merge this one subject onto the stored array; every other teacher's
      // subject is carried over exactly as it was read
      const merged = index !== -1
        ? storedSubjects.map((e, i) => (i === index ? entry : e))
        : [...storedSubjects, entry];
      const { error: updateError } = await supabase
        .from('jmis_result')
        .update({ [termKey]: merged })
        .eq('id', row.id);
      if (updateError) {
        console.error('❌ [Persist] Update failed:', updateError);
        return false;
      }
    } else {
      const list = schoolSubjects[String(job.studentClass || '').toLowerCase().replace(/\s+/g, '')] || [];
      const seeded = list.length
        ? list.map((subj) => (normalizeSubjectKey(subj) === normalizeSubjectKey(job.subject)
          ? entry
          : { subjectName: subj, test: "", grade: "", total: 0, remark: "", project: "", examination: "" }))
        : [entry];
      const { error: insertError } = await supabase.from('jmis_result').insert([{
        studentId: job.studentId,
        studentName: job.studentName,
        studentClass: job.studentClass ? String(job.studentClass).toUpperCase() : "",
        [termKey]: seeded,
      }]);
      if (insertError) {
        console.error('❌ [Persist] Insert failed:', insertError);
        return false;
      }
    }

    // Audit trail of the sitting (answers, marks, maximum). Tolerate any failure
    // here: the result itself is already recorded, and a missing column or table
    // must never lose a student's marks.
    try {
      const { data: existingClaim } = await supabase
        .from('jmis_cbt_results')
        .select('id')
        .eq('submissionKey', job.submissionKey)
        .maybeSingle();
      if (!existingClaim) {
        const { error: claimError } = await supabase.from('jmis_cbt_results').insert([{
          studentId: job.studentId,
          studentName: job.studentName,
          studentClass: job.studentClass,
          score: correct,
          totalQuestions: questionCount,
          maxScore: max,
          percentage: questionCount > 0 ? ((correct / questionCount) * 100).toFixed(2) : "0",
          subject: job.subject,
          term: job.termLabel,
          purpose: purposeNorm,
          sessionType: job.sessionType || 'objective',
          answers: job.answers,
          submissionKey: job.submissionKey,
        }]);
        if (claimError) console.warn('⚠️ [Persist] Audit row not recorded:', claimError.message);
      }
    } catch (error) {
      console.warn('⚠️ [Persist] Audit row not recorded:', error.message);
    }

    await notifySuccess(job, { correct, questionCount, max, marks, purposeNorm, entry, paperQuestions: paper.questions });
    cleanupAfterSuccess(job);
    return true;
  };

  const cleanupAfterSuccess = (job) => {
    // The saved attempt is only deleted once the server acknowledged it
    const key = attemptKeyFor(job.examRowId);
    if (key) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  };

  // ---- notifications ------------------------------------------------------
  // A result notification is emailed once per attempt. The queue can flush the
  // same submission from another tab or another session, and a retry that finds
  // the attempt already recorded must not reach the teachers a second time.
  const emailAlreadyNotified = (submissionKey) => {
    try {
      const sent = JSON.parse(localStorage.getItem(EMAIL_LOG_KEY) || '[]');
      return Array.isArray(sent) && sent.includes(submissionKey);
    } catch {
      return false;
    }
  };

  const markEmailNotified = (submissionKey) => {
    try {
      const sent = JSON.parse(localStorage.getItem(EMAIL_LOG_KEY) || '[]');
      const next = Array.isArray(sent) ? sent : [];
      if (!next.includes(submissionKey)) next.push(submissionKey);
      // Exam-room machines are shared, so this log must not grow without end
      localStorage.setItem(EMAIL_LOG_KEY, JSON.stringify(next.slice(-200)));
    } catch {
      /* a notification is a nicety and never a reason to lose a result */
    }
  };

  const notifySuccess = async (job, summary) => {
    if (emailAlreadyNotified(job.submissionKey)) return;
    markEmailNotified(job.submissionKey);
    await sendResultEmail(job, summary);
  };

  // The email describes the attempt exactly as it was graded on the server. It is
  // built from the queued job and the freshly loaded paper, never from the screen
  // state, so a result flushed an hour later (or from another tab) still reports
  // the right figures.
  const sendResultEmail = async (job, summary) => {
    const { correct, questionCount, max, marks, purposeNorm, paperQuestions } = summary;
    const examType = purposeNorm === 'midterm' ? 'Mid-term Test' : 'Exam';
    const sectionName = SECTION_LABEL[purposeNorm] || 'Examination';
    const sectionTop = sectionMaxFor(purposeNorm);
    const scaled = scaleScore(correct, questionCount, max);
    const percentage = questionCount > 0 ? ((correct / questionCount) * 100).toFixed(2) : '0.00';

    let wrong = 0;
    let unattempted = 0;
    const detailedScores = (paperQuestions || []).map((q, idx) => {
      const userAnswer = job.answers?.[idx];
      if (userAnswer === undefined) {
        unattempted++;
        return `Q${idx + 1}: ⏭ Unattempted`;
      }
      if (q.answerOptions?.[userAnswer]?.isCorrect) return `Q${idx + 1}: ✓ Correct`;
      wrong++;
      return `Q${idx + 1}: ✗ Wrong`;
    }).join('\n');

    const emailSubject = `CBT ${examType} Result Submitted - ${job.studentName}`;
    const emailMessage = `Student has submitted a CBT ${examType.toLowerCase()}:

Student Name: ${job.studentName}
Class: ${job.studentClass}
Term: ${job.termLabel || 'N/A'}
Subject: ${job.subject}
Exam Type: ${examType}

Performance Summary:
Total Questions: ${questionCount}
Correct Answers: ${correct}
Incorrect Answers: ${wrong}
Unattempted: ${unattempted}
Score: ${scaled}/${max} (${percentage}%)
Marks recorded: ${marks} in the ${sectionName} column (maximum ${sectionTop})
Grade: ${gradeFor(marks, sectionTop)}

Detailed Breakdown:
${detailedScores}

---
Automated notification from Bluebell CBT System`;

    // Delivered to the addresses this school configures — see src/utils/resultRecipients.js
    const recipients = await resolveResultRecipients(supabase);
    
    console.log('📨 [SendResultEmail] Recipients:', recipients.join(', '));
    console.log('📄 [SendResultEmail] Subject:', emailSubject);
    
    try {
      console.log('📤 [SendResultEmail] Calling sendEmailNotification...');
      const result = await sendEmailNotification(supabase, emailSubject, emailMessage, recipients);
      if (result && result.success) {
        console.log('✅ [SendResultEmail] Email sent successfully to:', recipients.join(', '));
        toast.info('Email notification sent!');
      } else {
        console.warn('⚠️ [SendResultEmail] Email sending failed:', result);
        const errorMsg = result?.details || result?.error || 'Unknown error';
        toast.warn('Email notification failed: ' + errorMsg);
      }
    } catch (error) {
      console.error('❌ [SendResultEmail] Email error:', error);
      toast.error('Failed to send email notification: ' + (error.message || 'Unknown error'));
    }
  };

  // Submitting never depends on the connection being good right now. The attempt
  // is queued on the machine first, so a tab closed a second later, a power cut or
  // an offline room still gets the result uploaded; only then is a flush attempted.
  const uploadResults = async () => {
    console.log('📝 [UploadResults] Queueing submission...');

    // Practice papers (and any purpose the marking scheme has no column for) are
    // never persisted
    if (!normPurpose) {
      toast.success(purpose === 'practice'
        ? 'Practice test completed! Results not saved.'
        : 'Test completed! This paper is not linked to a result column, so nothing was saved.');
      return;
    }

    if (!examRow?.id) {
      toast.error('This paper has no identity on the server, so it cannot be graded yet. Please tell your teacher.');
      return;
    }

    const studentId = await resolveStudentId();
    if (!studentId) {
      console.error('❌ [UploadResults] No student record matched this name and class');
      toast.error('Error: your name and class do not match a student record, so the result cannot be saved.');
      return;
    }

    const job = buildJob({
      studentId,
      studentName: name,
      studentClass: newClass,
      examRowId: examRow.id,
      subject: subject || examRow.subject,
      termKey: termKeyFor(currentTerm),
      termLabel: currentTerm,
      normPurpose,
      answers: sanitizeAnswers(answers, questions),
      questions,
      paperMax,
    });

    enqueueJob(job);
    setIsSaving(true);
    await flushRef.current?.();
    setIsSaving(false);
  };

  // Manual "Upload now": ignores the retry backoff, for a student who can see the
  // connection is back and wants the result pushed immediately.
  const handleUploadNow = async () => {
    setIsSaving(true);
    try {
      const { flushed, remaining } = await flushQueue({ submitJob: persistQueuedSubmission, force: true });
      if (flushed > 0) toast.success(`✅ ${flushed} result(s) uploaded.`);
      else if (remaining > 0) toast.error('Still offline — the result stays queued on this device and will upload automatically.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadResult = () => {
    const resultText = `
CBT EXAM RESULT
===============

Student Details:
- Name: ${name}
- Class: ${newClass}
- Term: ${currentTerm}
- Subject: ${subject}

Score:
- Correct Answers: ${correctCount} of ${questions.length}
- Score: ${displayedScore}/${displayedTotal} (${percentageScore.toFixed(2)}%)
- Grade: ${displayedGrade}
- Exam Type: ${purpose}
${normPurpose
  ? `- Marks recorded: ${storedMarks} in the ${SECTION_LABEL[normPurpose]} column (maximum ${sectionMax})`
  : '- Marks recorded: none (this paper is not linked to a result column)'}

Generated: ${new Date().toLocaleString()}
    `.trim();

    const blob = new Blob([resultText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}_${subject}_result.txt`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success('Result downloaded!');
  };

  return (
    <div className="container m-5 p-5">
      <ToastContainer />
      
      {/* Network Status Indicator */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        padding: '8px 16px',
        borderRadius: '20px',
        fontWeight: 'bold',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        backgroundColor: networkStatus.quality === 'good' ? '#4CAF50' : networkStatus.quality === 'poor' ? '#FFC107' : '#F44336',
        color: 'white'
      }}>
        {networkStatus.quality === 'good' ? '✓ Good Network' : networkStatus.quality === 'poor' ? '⚠ Poor Network' : '✗ Offline'}
      </div>

      {/* Persistent offline-queue notice: a submission is kept on the machine and
          retried until the server acknowledges it, so this stays visible from any
          screen rather than only on the results panel */}
      {queueCount > 0 && (
        <div
          onClick={handleUploadNow}
          title="Click to try uploading now"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 9999,
            padding: '8px 16px',
            borderRadius: '20px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            backgroundColor: '#FFC107',
            color: 'black'
          }}>
          ⏳ {queueCount} exam result(s) queued on this device — will upload automatically when the connection returns
        </div>
      )}
      
      {/* Auto-Save Status Indicator */}
      {lastSaved && (
        <div style={{
          position: 'fixed',
          top: '70px',
          right: '20px',
          zIndex: 9999,
          padding: '6px 12px',
          borderRadius: '15px',
          fontSize: '0.85rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          backgroundColor: isSavingToStorage ? '#FFC107' : '#2196F3',
          color: 'white'
        }}>
          {isSavingToStorage ? '💾 Saving...' : `💾 Saved ${lastSaved.toLocaleTimeString()}`}
        </div>
      )}

      <nav className="navbar navbar-light bg-light cbtNavbar">
        <div className="navbar-brand" style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
          <img src={logo} width="60" height="60" className="d-inline-block align-top" alt="" />
          <p style={{marginBottom: '0px', fontWeight: '600', wordWrap: 'break-word', textWrap: 'balance'}} className='headingText'>Bluebell International School</p>
        </div>
        <span className={`navbar-text ${timeLeft <= 600 ? 'text-danger' : 'text-primary'}`} style={{fontSize: '1rem', fontWeight: '700'}}>
          {timeLeft === 0 ? 'TIME UP!' : `Time Left: ${formatTime(timeLeft)}`}
        </span>
      </nav>
      <div className="quiz-info">
        <div className="info-item"><strong>Subject:</strong> {subject}</div>
        <div className="info-item"><strong>Class:</strong> {newClass}</div>
        <div className="info-item"><strong>Term:</strong> {currentTerm}</div>
        <div className="info-item"><strong>Gender:</strong> {newSex}</div>
        <div className="info-item"><strong>Student Name:</strong> <span className='text-primary'>{name}</span></div>
      </div>

      {isLocked ? (
        <div className="lock-screen">
          <div className="lock-screen-content">
            <h2>Exam Locked</h2>
            <p>Please enter the admin password to continue the exam.</p>
            <div style={{display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center'}}>
            <input
              type={showPassword ? "text" : "password"}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter admin password"
              className="form-control"
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="btn btn-secondary mt-2"
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
              </div>
            <button onClick={handleUnlock} className="btn btn-primary mt-3">Unlock</button>
          </div>
        </div>
      ) : (
        <>
          <div className="preview-section" style={{marginBottom: '30px'}}>
            {questions.map((_, index) => (
              <div key={index} className={`preview-item ${answers[index] !== undefined ? 'answered' : ''}`}>
                {answers[index] !== undefined ? <FaCheck /> : index + 1}
              </div>
            ))}
          </div>

          <div className="quiz">
            {showScore ? (
              <div className="score-modal">
                <div className="score-content">
                  <FaTrophy className="score-icon" />
                  <h2>Congratulations!</h2>
                  <p>Your {normPurpose === 'midterm' ? 'mid-term test' : normPurpose === 'exam' ? 'exam' : 'practice test'} has been submitted.</p>
                  <p>{getCongratulationMessage(percentageScore)}</p>
                  <p><strong>Subject:</strong> {subject}</p>
                  <p><strong>Score:</strong> {displayedScore} out of {displayedTotal} ({percentageScore.toFixed(2)}%)</p>
                  <p style={{ fontSize: '0.95rem', color: '#555' }}>
                    Correct answers: {correctCount} of {questions.length}
                    {normPurpose && paperMax > sectionMax
                      ? ` — capped at ${sectionMax} for the ${SECTION_LABEL[normPurpose]} section`
                      : ''}
                  </p>
                  {normPurpose && (
                    <p style={{ fontSize: '0.95rem', color: '#555' }}>
                      <strong>Grade:</strong> {displayedGrade}
                    </p>
                  )}
                  
                  {/* Anything still waiting on this device is shown here rather
                      than as a one-off "save failed" message */}
                  {queueCount > 0 && (
                    <div style={{ 
                      marginTop: '20px', 
                      padding: '15px', 
                      backgroundColor: 'var(--warning-bg, #fff3cd)',
                      borderLeft: '4px solid #ffc107',
                      borderRadius: '4px'
                    }}>
                      <p style={{ color: '#856404', marginBottom: '10px' }}>
                        ⏳ {queueCount} exam result(s) queued on this device — they will upload
                        automatically as soon as the connection allows.
                      </p>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button 
                          onClick={handleUploadNow}
                          disabled={isSaving}
                          className="btn btn-warning"
                        >
                          {isSaving ? 'Uploading...' : 'Upload now'}
                        </button>
                        <button onClick={handleDownloadResult} className="btn btn-success">
                          Download Result
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Action Buttons - Single Row */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
                    <button 
                      onClick={handleSubmitExam} 
                      className="btn btn-primary"
                      disabled={isSaving || isSubmitted}
                    >
                      {isSaving ? 'Saving...' : isSubmitted ? "✓ Exam Submitted" : "Submit Exam"}
                    </button>
                    {queueCount === 0 && (
                      <>
                        <button onClick={handleDownloadResult} className="btn btn-success">
                          📥 Download Result
                        </button>
                        <button onClick={() => {
                          router.push('/quiz');
                        }} className="btn btn-secondary">
                          Finish
                        </button>
                        <button 
                          onClick={() => setShowDetailedResults(true)} 
                          className="btn btn-info"
                        >
                          📊 View Detailed Results
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              questions.length > 0 ? (
                <>
                  <div className="question-section">
                    <div className="question-count text-primary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><span>Question {currentQuestion + 1}</span>/{questions.length}</div>
                      <button onClick={handleSubmitExam} className="btn btn-danger" disabled={isSaving || isSubmitted}>
                        {isSaving ? 'Submitting...' : 'Submit Exam'}
                      </button>
                    </div>
                    <div className="question-text">{currentQuestion + 1}. {questions[currentQuestion].questionText}</div>
                  </div>
                  <div className="answer-section">
                    {questions[currentQuestion].answerOptions.map((answerOption, index) => (
                      <button
                        key={index}
                        onClick={() => { handleAnswerOptionClick(index); handleNextQuestion(); }}
                        className={answers[currentQuestion] === index ? 'selected' : ''}
                      >
                        {String.fromCharCode(65 + index)}. {answerOption.answerText}
                      </button>
                    ))}
                  </div>
                  <div className="navigation-buttons">
                    <button onClick={handlePreviousQuestion} disabled={currentQuestion === 0} className="btn btn-secondary">
                      Previous
                    </button>
                    <button onClick={handleNextQuestion} disabled={currentQuestion === questions.length - 1} className="btn btn-primary">
                      Next
                    </button>
                  </div>
                </>
              ) : (
                <div className="no-questions">
                  No questions available for Subject: {subject}, Class: {newClass}, Purpose: {purpose || 'Any'}.
                </div>
              )
            )}
          </div>
        </>
      )}
      
      {/* Detailed Results Modal */}
      {showDetailedResults && (
        <div className="detailed-results-modal" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          overflow: 'auto',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '10px',
            maxWidth: '1000px',
            margin: '0 auto',
            padding: '30px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            {/* Header with Student Info */}
            <div style={{ 
              borderBottom: '3px solid #007bff', 
              paddingBottom: '20px', 
              marginBottom: '20px' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ margin: 0 }}>📊 Detailed Exam Results</h2>
                <button 
                  onClick={() => setShowDetailedResults(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '1.2rem' }}
                >
                  ✕ Close
                </button>
              </div>
              
              {/* Student Information */}
              <div style={{
                backgroundColor: 'var(--container-bg, #f8f9fa)',
                padding: '15px',
                borderRadius: '8px',
                marginTop: '10px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                  <div>
                    <strong>Student Name:</strong>
                    <p style={{ margin: '5px 0 0 0', color: '#495057' }}>{name}</p>
                  </div>
                  <div>
                    <strong>Class:</strong>
                    <p style={{ margin: '5px 0 0 0', color: '#495057' }}>{newClass}</p>
                  </div>
                  <div>
                    <strong>Subject:</strong>
                    <p style={{ margin: '5px 0 0 0', color: '#495057' }}>{subject}</p>
                  </div>
                  <div>
                    <strong>Exam Type:</strong>
                    <p style={{ margin: '5px 0 0 0', color: '#495057', textTransform: 'capitalize' }}>
                      {purpose === 'midterm' || purpose === 'test' ? 'Mid-term Exam' : purpose === 'exam' ? 'Final Exam' : purpose || 'Practice Test'}
                    </p>
                  </div>
                  <div>
                    <strong>Term:</strong>
                    <p style={{ margin: '5px 0 0 0', color: '#495057' }}>{currentTerm || 'N/A'}</p>
                  </div>
                  <div>
                    <strong>Date:</strong>
                    <p style={{ margin: '5px 0 0 0', color: '#495057' }}>{new Date().toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Exam Summary Stats */}
            <div style={{
              backgroundColor: 'var(--container-bg, #f8f9fa)',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '30px'
            }}>
              <h3 style={{ marginTop: 0 }}>Exam Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginTop: '15px' }}>
                <div style={{ padding: '15px', backgroundColor: '#d4edda', borderRadius: '5px', textAlign: 'center' }}>
                  <h4 style={{ margin: 0, color: '#155724', fontSize: '2rem' }}>{getQuestionCategories().correct.length}</h4>
                  <p style={{ margin: '5px 0 0 0', color: '#155724', fontSize: '0.9rem' }}>Correct</p>
                </div>
                <div style={{ padding: '15px', backgroundColor: '#f8d7da', borderRadius: '5px', textAlign: 'center' }}>
                  <h4 style={{ margin: 0, color: '#721c24', fontSize: '2rem' }}>{getQuestionCategories().incorrect.length}</h4>
                  <p style={{ margin: '5px 0 0 0', color: '#721c24', fontSize: '0.9rem' }}>Incorrect</p>
                </div>
                <div style={{ padding: '15px', backgroundColor: 'var(--warning-bg, #fff3cd)', borderRadius: '5px', textAlign: 'center' }}>
                  <h4 style={{ margin: 0, color: '#856404', fontSize: '2rem' }}>{getQuestionCategories().unattempted.length}</h4>
                  <p style={{ margin: '5px 0 0 0', color: '#856404', fontSize: '0.9rem' }}>Unattempted</p>
                </div>
                <div style={{ padding: '15px', backgroundColor: '#d1ecf1', borderRadius: '5px', textAlign: 'center' }}>
                  <h4 style={{ margin: 0, color: '#0c5460', fontSize: '2rem' }}>{questions.length}</h4>
                  <p style={{ margin: '5px 0 0 0', color: '#0c5460', fontSize: '0.9rem' }}>Total</p>
                </div>
              </div>
            </div>

            {/* Download Button */}
            <div style={{ marginBottom: '20px', textAlign: 'right' }}>
              <button onClick={handleDownloadResultsReview} className="btn btn-success">
                📥 Download Detailed Review
              </button>
            </div>

            {/* Tabs for categories */}
            <div style={{ marginBottom: '20px' }}>
              <ul className="nav nav-tabs" role="tablist">
                <li className="nav-item">
                  <a 
                    className={`nav-link ${!selectedQuestionIndex ? 'active' : ''}`}
                    onClick={() => setSelectedQuestionIndex(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    📋 All Questions
                  </a>
                </li>
                <li className="nav-item">
                  <a 
                    className="nav-link text-success"
                    onClick={() => setSelectedQuestionIndex('correct')}
                    style={{ cursor: 'pointer' }}
                  >
                    ✅ Correct ({getQuestionCategories().correct.length})
                  </a>
                </li>
                <li className="nav-item">
                  <a 
                    className="nav-link text-danger"
                    onClick={() => setSelectedQuestionIndex('incorrect')}
                    style={{ cursor: 'pointer' }}
                  >
                    ❌ Incorrect ({getQuestionCategories().incorrect.length})
                  </a>
                </li>
                <li className="nav-item">
                  <a 
                    className="nav-link text-warning"
                    onClick={() => setSelectedQuestionIndex('unattempted')}
                    style={{ cursor: 'pointer' }}
                  >
                    ⏭️ Unattempted ({getQuestionCategories().unattempted.length})
                  </a>
                </li>
              </ul>
            </div>

            {/* Questions Review */}
            <div className="print-content">
              {(!selectedQuestionIndex || selectedQuestionIndex === 'correct') && (
                <div style={{ display: !selectedQuestionIndex || selectedQuestionIndex === 'correct' ? 'block' : 'none' }}>
                  <h3>✅ Correct Answers</h3>
                  {getQuestionCategories().correct.map((item) => (
                    <div key={item.questionNumber} className="question-review-card" style={{
                      border: '2px solid #28a745',
                      borderRadius: '8px',
                      padding: '15px',
                      marginBottom: '15px',
                      backgroundColor: '#d4edda'
                    }}>
                      <h4>Question {item.questionNumber}</h4>
                      <p><strong>{item.questionText}</strong></p>
                      <div style={{ marginTop: '10px' }}>
                        {item.options.map((option, idx) => {
                          const isUserSelected = answers[item.questionNumber - 1] === idx;
                          const isCorrect = option.isCorrect;
                          
                          return (
                            <div 
                              key={idx}
                              style={{
                                padding: '8px',
                                margin: '5px 0',
                                borderRadius: '4px',
                                backgroundColor: isCorrect ? '#28a745' : 'white',
                                color: isCorrect ? 'white' : 'black',
                                border: isUserSelected ? '2px solid #007bff' : '1px solid #ddd'
                              }}
                            >
                              {String.fromCharCode(65 + idx)}. {option.answerText}
                              {isUserSelected && ' (Your Answer)'}
                              {isCorrect && ' ✓'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(!selectedQuestionIndex || selectedQuestionIndex === 'incorrect') && (
                <div style={{ display: !selectedQuestionIndex || selectedQuestionIndex === 'incorrect' ? 'block' : 'none' }}>
                  <h3>❌ Incorrect Answers</h3>
                  {getQuestionCategories().incorrect.map((item) => (
                    <div key={item.questionNumber} className="question-review-card" style={{
                      border: '2px solid #dc3545',
                      borderRadius: '8px',
                      padding: '15px',
                      marginBottom: '15px',
                      backgroundColor: '#f8d7da'
                    }}>
                      <h4>Question {item.questionNumber}</h4>
                      <p><strong>{item.questionText}</strong></p>
                      <div style={{ marginTop: '10px' }}>
                        {item.options.map((option, idx) => {
                          const isUserSelected = answers[item.questionNumber - 1] === idx;
                          const isCorrect = option.isCorrect;
                          
                          return (
                            <div 
                              key={idx}
                              style={{
                                padding: '8px',
                                margin: '5px 0',
                                borderRadius: '4px',
                                backgroundColor: isCorrect ? '#28a745' : (isUserSelected ? '#ffc107' : 'white'),
                                color: isCorrect ? 'white' : 'black',
                                border: isUserSelected ? '2px solid #007bff' : '1px solid #ddd'
                              }}
                            >
                              {String.fromCharCode(65 + idx)}. {option.answerText}
                              {isUserSelected && ' (Your Answer)'}
                              {isCorrect && ' ✓ Correct Answer'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(!selectedQuestionIndex || selectedQuestionIndex === 'unattempted') && (
                <div style={{ display: !selectedQuestionIndex || selectedQuestionIndex === 'unattempted' ? 'block' : 'none' }}>
                  <h3>⏭️ Unattempted Questions</h3>
                  {getQuestionCategories().unattempted.map((item) => (
                    <div key={item.questionNumber} className="question-review-card" style={{
                      border: '2px solid #ffc107',
                      borderRadius: '8px',
                      padding: '15px',
                      marginBottom: '15px',
                      backgroundColor: 'var(--warning-bg, #fff3cd)'
                    }}>
                      <h4>Question {item.questionNumber}</h4>
                      <p><strong>{item.questionText}</strong></p>
                      <div style={{ marginTop: '10px' }}>
                        {item.options.map((option, idx) => {
                          const isCorrect = option.isCorrect;
                          
                          return (
                            <div 
                              key={idx}
                              style={{
                                padding: '8px',
                                margin: '5px 0',
                                borderRadius: '4px',
                                backgroundColor: isCorrect ? '#28a745' : 'white',
                                color: isCorrect ? 'white' : 'black',
                                border: '1px solid #ddd'
                              }}
                            >
                              {String.fromCharCode(65 + idx)}. {option.answerText}
                              {isCorrect && ' ✓ Correct Answer'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>


          </div>
        </div>
      )}
    </div>
  );
};

export default QuizComponent;
