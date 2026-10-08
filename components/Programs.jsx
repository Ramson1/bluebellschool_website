"use client";

import React from "react";
import { useSettings } from "../lib/useSettings";
import {
  RiParentLine,
  RiBookOpenLine,
  RiGraduationCapLine,
  RiHeartPulseLine,
  RiLightbulbLine,
  RiShieldCheckLine,
} from "react-icons/ri";

// "Why Bluebell" strip + age-programme cards with curriculum highlights.
const PROGRAMS = [
  {
    icon: <RiParentLine />,
    title: "Creche & Nursery",
    ages: "3 months – 5 years",
    points: ["Montessori-inspired play learning", "Literacy, numeracy & pre-writing", "Safe, homely care environment"],
  },
  {
    icon: <RiBookOpenLine />,
    title: "Primary (Years 1–6)",
    ages: "6 – 11 years",
    points: ["Strong literacy & numeracy foundation", "Computing and character studies", "Continuous CBT assessments"],
  },
  {
    icon: <RiGraduationCapLine />,
    title: "Secondary (Years 7–12)",
    ages: "11 – 17 years",
    points: ["Full national curriculum", "Science, arts & technical subjects", "Exam-class coaching (BECE/WAEC)"],
  },
];

const WHY = [
  { icon: <RiHeartPulseLine />, t: "Child-first care", d: "Small classes where every child is known by name." },
  { icon: <RiLightbulbLine />, t: "21st-century learning", d: "Computer labs, CBT practice and modern teaching aids." },
  { icon: <RiShieldCheckLine />, t: "Values & character", d: "Faith, discipline and integrity woven into daily school life." },
];

export default function Programs() {
  const { settings } = useSettings();
  const highlights = settings?.aboutContent?.details || [];

  return (
    <section id="programs" className="py-16 bg-white">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="section-title text-center">Programmes for every stage</h2>
        <p className="section-sub mx-auto text-center">
          From the crèche to graduation — one continuous, caring journey.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mt-10">
          {PROGRAMS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition p-6 bg-white">
              <div className="w-12 h-12 rounded-xl brand-gradient text-white flex items-center justify-center text-2xl">
                {p.icon}
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-gray-900">{p.title}</h3>
              <p className="text-xs font-bold text-brand-light uppercase tracking-wide">{p.ages}</p>
              <ul className="mt-3 space-y-2">
                {p.points.map((pt) => (
                  <li key={pt} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-brand-light mt-0.5">✓</span> {pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Why strip — prefers the school-managed "Why Choose Us" points */}
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          {(highlights.length ? highlights.slice(0, 3) : WHY.map((w) => ({ heading: w.t, content: w.d }))).map((h, i) => (
            <div key={h.heading} className="flex gap-4 items-start rounded-2xl bg-brand-soft p-5">
              <span className="text-brand-light text-2xl shrink-0">{WHY[i]?.icon}</span>
              <div>
                <p className="font-extrabold text-gray-900">{h.heading}</p>
                <p className="text-sm text-gray-600 mt-1">{h.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
