// Same Supabase project as the admin dashboard — anon key only (public site).
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Public storage folder holding hero/gallery/facility images (same bucket the
// admin Settings page uploads to).
export const settingFileUrl = (file) => {
  if (!file) return file;
  const value = String(file);
  // Seeded /site/* imagery and absolute URLs resolve as-is; a bare
  // storage key still comes from the public `setting` bucket.
  if (value.startsWith('/') || /^https?:\/\//i.test(value)) return value;
  return `${supabaseUrl}/storage/v1/object/public/setting/${value}`;
};
