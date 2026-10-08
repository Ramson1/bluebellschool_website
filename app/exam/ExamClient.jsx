"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import all exam components to avoid SSR issues
const QuizComponent = dynamic(() => import('../../src/pages_components/QuizComponent'), {
  ssr: false,
  loading: () => <div>Loading exam...</div>
});

const CompletionExam = dynamic(() => import('../../src/pages_components/CompletionExam'), {
  ssr: false,
  loading: () => <div>Loading exam...</div>
});

const EssayExam = dynamic(() => import('../../src/pages_components/EssayExam'), {
  ssr: false,
  loading: () => <div>Loading exam...</div>
});

export default function ExamClientComponent({ searchParams }) {
  const [isClient, setIsClient] = useState(false);
  const [sessionType, setSessionType] = useState('objective');

  useEffect(() => {
    setIsClient(true);
    // Get session type from URL parameters
    const type = searchParams?.sessionType || 'objective';
    setSessionType(type);
  }, [searchParams]);

  if (!isClient) {
    return <div>Loading exam...</div>;
  }

  // Route to appropriate exam component based on session type
  if (sessionType === 'completion') {
    return <CompletionExam />;
  } else if (sessionType === 'essay') {
    return <EssayExam />;
  } else {
    return <QuizComponent />;
  }
}
