// Server Component wrapper - handles searchParams and routing config
import ExamClientComponent from './ExamClient';

// Disable static generation - this page requires URL parameters
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default function ExamPage({ searchParams }) {
  return <ExamClientComponent searchParams={searchParams} />;
}
