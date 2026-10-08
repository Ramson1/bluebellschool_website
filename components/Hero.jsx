"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSettings } from "../lib/useSettings";
import { settingFileUrl } from "../lib/supabaseClient";

// Full-bleed hero carousel fed by jmis_settings.heroContent (managed on the
// admin Settings page) with the two parent-facing CTAs.
export default function Hero() {
  const { settings } = useSettings();
  const slides = settings?.heroContent || [];
  const [idx, setIdx] = useState(0);
  const studentPortal = process.env.NEXT_PUBLIC_STUDENT_PORTAL_URL;

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);

  const slide = slides[idx];

  return (
    <section className="relative h-[70vh] min-h-[440px] overflow-hidden">
      {/* Background slides */}
      {slides.length > 0 ? (
        slides.map((s, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-1000"
            style={{ opacity: i === idx ? 1 : 0 }}
          >
            {/* plain <img>: remote Supabase images avoid next/image width juggling */}
            <img src={settingFileUrl(s.image)} alt={s.heading || "Bluebell school life"} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/20" />
          </div>
        ))
      ) : (
        <div className="absolute inset-0 brand-gradient" />
      )}

      {/* Copy */}
      <div className="relative h-full max-w-6xl mx-auto px-4 flex flex-col justify-end pb-16">
        <div className="max-w-2xl text-white">
          <span className="inline-block text-xs font-bold tracking-widest uppercase bg-white/15 border border-white/30 rounded-full px-3 py-1 mb-4">
            Wisdom · Integrity · Courage
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">
            {slide?.heading || "Bluebell International School"}
          </h1>
          <p className="mt-3 text-base md:text-lg text-white/90">
            {slide?.content ||
              "A nurturing, values-driven education where every child is known, loved and equipped to excel."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/admissions"
              className="px-6 py-3 rounded-full bg-white text-brand font-extrabold hover:bg-brand-soft transition"
            >
              Enroll Your Child
            </Link>
            {studentPortal ? (
              <a
                href={studentPortal}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full border-2 border-white text-white font-bold hover:bg-white/10 transition"
              >
                Check Result
              </a>
            ) : (
              <Link
                href="/cbt"
                className="px-6 py-3 rounded-full border-2 border-white text-white font-bold hover:bg-white/10 transition"
              >
                Take a CBT Quiz
              </Link>
            )}
          </div>
        </div>

        {/* slide dots */}
        {slides.length > 1 && (
          <div className="absolute bottom-5 right-6 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIdx(i)}
                className={"w-2.5 h-2.5 rounded-full transition " + (i === idx ? "bg-white" : "bg-white/40")}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
