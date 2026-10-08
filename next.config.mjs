/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STUDENT_PORTAL_URL: process.env.NEXT_PUBLIC_STUDENT_PORTAL_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'BLUEBELL_SUPABASE_REF_PLACEHOLDER.supabase.co' },
      { protocol: 'https', hostname: 'localhost', port: '' },
    ],
  },
};

export default nextConfig;
