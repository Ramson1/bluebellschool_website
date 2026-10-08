import nlp from 'compromise';

/**
 * Evaluate completion question answer using Compromise NLP
 * @param {string} studentAnswer - Student's text answer
 * @param {object} question - Question data with expectedAnswers, acceptableSynonyms, requiredKeywords
 * @returns {object} { isCorrect: boolean, score: number, feedback: string }
 */
export const evaluateCompletion = (studentAnswer, question) => {
  if (!studentAnswer || studentAnswer.trim() === '') {
    return { isCorrect: false, score: 0, feedback: 'No answer provided' };
  }

  const normalizedAnswer = studentAnswer.toLowerCase().trim();
  const { expectedAnswers = [], acceptableSynonyms = [], requiredKeywords = [] } = question;

  // Check exact match with expected answers
  if (expectedAnswers.some(ans => ans.toLowerCase() === normalizedAnswer)) {
    return { isCorrect: true, score: question.points || 1, feedback: 'Perfect match!' };
  }

  // Check acceptable synonyms (exact match)
  if (acceptableSynonyms.some(syn => syn.toLowerCase() === normalizedAnswer)) {
    return { isCorrect: true, score: question.points || 1, feedback: 'Correct! (Synonym accepted)' };
  }

  // Use Compromise NLP for semantic similarity
  const studentDoc = nlp(normalizedAnswer);
  
  for (const expected of expectedAnswers) {
    const expectedDoc = nlp(expected.toLowerCase());
    
    // Check if key nouns/verbs match
    const studentNouns = studentDoc.nouns().out('array');
    const expectedNouns = expectedDoc.nouns().out('array');
    
    const hasMatch = expectedNouns.some(en => 
      studentNouns.some(sn => sn.includes(en) || en.includes(sn))
    );
    
    if (hasMatch) {
      return { isCorrect: true, score: question.points || 1, feedback: 'Correct! (Semantic match)' };
    }
  }

  // Check required keywords
  if (requiredKeywords.length > 0) {
    const keywordMatches = requiredKeywords.filter(kw => 
      normalizedAnswer.includes(kw.toLowerCase())
    ).length;
    
    if (keywordMatches === requiredKeywords.length) {
      return { isCorrect: true, score: question.points || 1, feedback: 'Correct! (Keywords matched)' };
    }
  }

  return { isCorrect: false, score: 0, feedback: 'Incorrect answer' };
};

/**
 * Evaluate essay question answer using Compromise NLP
 * @param {string} studentAnswer - Student's essay text
 * @param {object} question - Question data with expectedAnswer, requiredKeywords, acceptableSynonyms, minWords
 * @returns {object} { score: number, maxScore: number, percentage: number, feedback: string, keywordMatches: object }
 */
export const evaluateEssay = (studentAnswer, question) => {
  if (!studentAnswer || studentAnswer.trim() === '') {
    return { 
      score: 0, 
      maxScore: question.points || 10, 
      percentage: 0, 
      feedback: 'No answer provided',
      keywordMatches: {},
      wordCount: 0,
      meetsMinWords: false
    };
  }

  const normalizedAnswer = studentAnswer.toLowerCase().trim();
  const { 
    expectedAnswer = '', 
    requiredKeywords = [], 
    acceptableSynonyms = {},
    minWords = 0,
    points = 10
  } = question;

  // Word count check
  const wordCount = normalizedAnswer.split(/\s+/).filter(w => w.length > 0).length;
  const meetsMinWords = wordCount >= minWords;

  // Keyword matching with synonyms
  const keywordResults = {};
  let matchedKeywords = 0;

  for (const keyword of requiredKeywords) {
    const keywordLower = keyword.toLowerCase();
    const synonyms = acceptableSynonyms[keywordLower] || [];
    
    // Check if keyword or any synonym appears in answer
    const found = normalizedAnswer.includes(keywordLower) ||
                  synonyms.some(syn => normalizedAnswer.includes(syn.toLowerCase()));
    
    keywordResults[keyword] = found;
    if (found) matchedKeywords++;
  }

  const keywordScore = requiredKeywords.length > 0 
    ? (matchedKeywords / requiredKeywords.length) 
    : 1;

  // Semantic similarity using Compromise
  let semanticScore = 0;
  if (expectedAnswer) {
    const studentDoc = nlp(normalizedAnswer);
    const expectedDoc = nlp(expectedAnswer.toLowerCase());
    
    // Compare key concepts (nouns and verbs)
    const studentConcepts = [
      ...studentDoc.nouns().out('array'),
      ...studentDoc.verbs().out('array')
    ];
    const expectedConcepts = [
      ...expectedDoc.nouns().out('array'),
      ...expectedDoc.verbs().out('array')
    ];
    
    const conceptMatches = expectedConcepts.filter(ec =>
      studentConcepts.some(sc => sc.includes(ec) || ec.includes(sc))
    ).length;
    
    semanticScore = expectedConcepts.length > 0 
      ? conceptMatches / expectedConcepts.length 
      : 0;
  }

  // Calculate final score (70% keywords, 30% semantic)
  const finalScore = (keywordScore * 0.7 + semanticScore * 0.3) * points;
  const percentage = (finalScore / points) * 100;

  // Generate feedback
  const feedback = generateEssayFeedback(percentage, matchedKeywords, requiredKeywords.length, wordCount, minWords, meetsMinWords);

  return {
    score: Math.round(finalScore * 100) / 100,
    maxScore: points,
    percentage: Math.round(percentage * 100) / 100,
    feedback,
    keywordMatches: keywordResults,
    wordCount,
    meetsMinWords
  };
};

/**
 * Generate human-readable feedback for essay
 */
const generateEssayFeedback = (percentage, matched, total, words, minWords, meetsMin) => {
  let feedback = [];
  
  if (percentage >= 80) {
    feedback.push('Excellent answer!');
  } else if (percentage >= 60) {
    feedback.push('Good answer with room for improvement.');
  } else if (percentage >= 40) {
    feedback.push('Fair attempt, but missing key concepts.');
  } else {
    feedback.push('Needs significant improvement.');
  }
  
  feedback.push(`Keywords matched: ${matched}/${total}`);
  
  if (!meetsMin && minWords > 0) {
    feedback.push(`Word count: ${words}/${minWords} (minimum not met)`);
  } else {
    feedback.push(`Word count: ${words}`);
  }
  
  return feedback.join(' ');
};
