"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Shared hook: every marketing section reads its content from the single
// jmis_settings row maintained by the admin dashboard's Settings page.
export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("jmis_settings").select("*").limit(1);
      if (cancelled) return;
      if (!error && data && data.length > 0) setSettings(data[0]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { settings, loading };
}
