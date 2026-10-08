"use client";

import React, { useEffect, useState } from "react";
import { useSettings } from "../lib/useSettings";
import { settingFileUrl } from "../lib/supabaseClient";
import { RiDoubleQuotesL } from "react-icons/ri";

// Testimonials carousel fed by jmis_settings.testimonialContent [{text, image}].
export default function Testimonials() {
  const { settings } = useSettings();
  const items = settings?.testimonialContent || [];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [items.length]);

  if (!items.length) return null;
  const active = items[Math.min(idx, items.length - 1)];

  return (
    <section className="py-16 brand-gradient text-white">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-2xl md:text-3xl font-extrabold">What our community says</h2>
        <span className="inline-block text-4xl text-white/40 mt-6">
          <RiDoubleQuotesL />
        </span>
        <p className="mt-2 text-lg md:text-xl leading-relaxed text-white/95 min-h-[96px]">
          {active?.text}
        </p>
        {active?.image && (
          <img
            src={settingFileUrl(active.image)}
            alt="Author"
            className="w-16 h-16 rounded-full object-cover mx-auto mt-6 border-2 border-white/60"
          />
        )}
        {items.length > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Testimonial ${i + 1}`}
                onClick={() => setIdx(i)}
                className={"w-2.5 h-2.5 rounded-full transition " + (i === idx ? "bg-white" : "bg-white/35")}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
