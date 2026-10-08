"use client";

import React from "react";
import { useSettings } from "../lib/useSettings";

// Mission + principal's welcome, both fed by jmis_settings.aboutContent
// (managed on the admin Settings page — same fields as the old site).
export default function About() {
  const { settings } = useSettings();
  const about = settings?.aboutContent;

  return (
    <section id="about" className="py-16 bg-brand-soft/60">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="section-title text-center">About the school</h2>
        <p className="section-sub mx-auto text-center">
          A legacy of care, learning and character — from Creche to Secondary.
        </p>

        <div className="mt-10 space-y-6 text-gray-700 leading-relaxed">
          {about?.text && (
            <div className="bg-white rounded-2xl shadow-sm p-7 border-l-4 border-brand">
              <h3 className="text-brand font-extrabold text-lg mb-2">Our Mission</h3>
              <p className="whitespace-pre-line">{about.text}</p>
            </div>
          )}
          {about?.text2 && (
            <div className="bg-white rounded-2xl shadow-sm p-7">
              <p className="italic text-gray-600 whitespace-pre-line">"{about.text2}"</p>
              <p className="mt-3 text-sm font-bold text-brand">
                — The Principal, Bluebell International School
              </p>
            </div>
          )}
          {!about?.text && !about?.text2 && (
            <p className="text-center text-gray-500">
              Bluebell International School provides a nurturing,
              values-driven education for every stage of a child's growth.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
