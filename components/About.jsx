"use client";

import React from "react";
import { useSettings } from "../lib/useSettings";

// Mission + principal's welcome, both fed by bluebell_settings.aboutContent
// (managed on the admin Settings page — same fields as the old site).
export default function About() {
  const { settings } = useSettings();
  const about = settings?.aboutContent || {};
  const missionText = about?.text && !/bluebell/i.test(about.text)
    ? about.text
    : "Black-Box Institution exists to give every child a first-class foundation: literacy and numeracy taught properly, character formed deliberately around our motto Discover, Design and Deliver, and curiosity protected in a warm, orderly, well-resourced environment.";
  const principalText = about?.text2 || "We receive every child as a gift and teach them as though we knew it. Our promise to parents is simple: your child will be safe, known, and taught to the very best of our ability from their first day in early years to their last day in Secondary.";

  return (
    <section id="about" className="py-16 bg-brand-soft/60">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="section-title text-center">About the school</h2>
        <p className="section-sub mx-auto text-center">
          A legacy of care, learning and character — from Creche to Secondary.
        </p>

        <div className="mt-10 space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-white rounded-2xl shadow-sm p-7 border-l-4 border-brand">
            <h3 className="text-brand font-extrabold text-lg mb-2">Our Mission</h3>
            <p className="whitespace-pre-line">{missionText}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-7">
            <p className="italic text-gray-600 whitespace-pre-line">"{principalText}"</p>
            <p className="mt-3 text-sm font-bold text-brand">
              — The Principal, Black-Box Institution
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
