"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { RiMegaphoneLine, RiCalendarLine } from "react-icons/ri";

// News & events strip fed by bluebell_announcements rows with audience='public'
// (posted from the admin dashboard / staff portal). Table may not exist yet —
// the fetch degrades gracefully to an empty list.
export default function News() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(
      supabase
        .from("bluebell_announcements")
        .select("title, body, created_at")
        .eq("audience", "public")
        .order("created_at", { ascending: false })
        .limit(3)
    )
      .then(({ data }) => {
        if (!cancelled) setItems(data || []);
      })
      .catch(() => !cancelled && setItems([]));
    return () => { cancelled = true; };
  }, []);

  if (!items.length) return null;

  return (
    <section id="news" className="py-16 bg-brand-soft/60">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="section-title text-center">News &amp; announcements</h2>
        <p className="section-sub mx-auto text-center">
          The latest from the Bluebell community.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mt-10">
          {items.map((n, i) => (
            <article key={i} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 flex flex-col">
              <span className="w-10 h-10 rounded-xl brand-gradient text-white flex items-center justify-center text-xl">
                <RiMegaphoneLine />
              </span>
              <h3 className="mt-4 font-extrabold text-gray-900 leading-snug">{n.title}</h3>
              <p className="mt-2 text-sm text-gray-600 line-clamp-4 grow whitespace-pre-line">{n.body}</p>
              {n.created_at && (
                <p className="mt-4 text-xs font-bold text-brand-light uppercase tracking-wide flex items-center gap-1">
                  <RiCalendarLine /> {new Date(n.created_at).toLocaleDateString()}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
