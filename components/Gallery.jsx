"use client";

import React, { useState } from "react";
import { useSettings } from "../lib/useSettings";
import { settingFileUrl } from "../lib/supabaseClient";
import { RiCloseLargeLine, RiArrowLeftSLine, RiArrowRightSLine } from "react-icons/ri";

// Gallery grid with show-more + custom lightbox (no extra deps).
export default function Gallery() {
  const { settings } = useSettings();
  const images = settings?.galleryContent || [];
  const [showMore, setShowMore] = useState(false);
  const [open, setOpen] = useState(-1); // lightbox index, -1 = closed

  const visible = showMore ? images : images.slice(0, 6);
  const hasMore = images.length > 6;

  const prev = () => setOpen((i) => (i - 1 + visible.length) % visible.length);
  const next = () => setOpen((i) => (i + 1) % visible.length);

  return (
    <section id="gallery" className="py-16 bg-brand-soft/60">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="section-title text-center">School life in pictures</h2>
        <p className="section-sub mx-auto text-center">
          Moments from classrooms, events and everyday joy at Bluebell.
        </p>

        {visible.length ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-10">
              {visible.map((g, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setOpen(i)}
                  className="group relative rounded-xl overflow-hidden aspect-[4/3] bg-gray-200 focus:outline-none"
                >
                  <img
                    src={settingFileUrl(g.image)}
                    alt={g.content || g.description || "School gallery"}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                  {g.content && (
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs font-semibold p-3 text-left">
                      {g.content}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  className="px-6 py-2.5 rounded-full border-2 border-brand text-brand font-bold hover:bg-brand hover:text-white transition"
                >
                  {showMore ? "Show Less" : "View More"}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-gray-400 mt-10">Gallery photos coming soon.</p>
        )}
      </div>

      {/* Lightbox */}
      {open >= 0 && visible[open] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(-1)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute top-4 right-4 text-white text-3xl hover:text-gold"
            onClick={() => setOpen(-1)}
          >
            <RiCloseLargeLine />
          </button>
          <button
            type="button"
            aria-label="Previous"
            className="absolute left-2 md:left-6 text-white text-4xl p-2 hover:text-gold"
            onClick={(e) => { e.stopPropagation(); prev(); }}
          >
            <RiArrowLeftSLine />
          </button>
          <figure className="max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={settingFileUrl(visible[open].image)}
              alt={visible[open].content || "School gallery"}
              className="max-h-[80vh] w-auto mx-auto rounded-lg"
            />
            {visible[open].content && (
              <figcaption className="text-white/90 text-center text-sm mt-3">
                {visible[open].content}
              </figcaption>
            )}
          </figure>
          <button
            type="button"
            aria-label="Next"
            className="absolute right-2 md:right-6 text-white text-4xl p-2 hover:text-gold"
            onClick={(e) => { e.stopPropagation(); next(); }}
          >
            <RiArrowRightSLine />
          </button>
        </div>
      )}
    </section>
  );
}
