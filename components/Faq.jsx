"use client";

import React, { useState } from "react";
import Link from "next/link";
import { RiAddLine, RiSubtractLine } from "react-icons/ri";

// Static FAQ accordion — admissions, fees and CBT questions parents ask most.
const FAQS = [
  {
    q: "How do I enroll my child?",
    a: "Fill the online application on our Admissions page or visit the school office. Our admissions team will schedule a tour, review the application and issue an acceptance letter with the fee list.",
  },
  {
    q: "What are the school fees like?",
    a: "Fees vary by class and are billed termly. Creche and nursery attract a higher care ratio, while primary and secondary follow our standard schedule. Use the Contact page to request the current fee list for your child's class.",
  },
  {
    q: "What is the CBT and how does my child take it?",
    a: "Our Computer-Based Testing (CBT) lets students practise and sit assessments online — building exam confidence early. Students can access it from the Take a CBT Quiz button; teachers track scores on the school dashboard.",
  },
  {
    q: "How do I check my child's results?",
    a: "Result sheets are checked online with your child's name and the result token issued by the school. Click “Check Result” and enter both details to view, print or email the termly report.",
  },
  {
    q: "What are your class sizes and opening hours?",
    a: "We keep classes small so every child is known by name. School runs Monday–Friday; extended crèche care is available for our youngest pupils. Call or message us for today's timetable.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="py-16 bg-white">
      <div className="max-w-3xl mx-auto px-4">
        <h2 className="section-title text-center">Frequently asked questions</h2>
        <p className="section-sub mx-auto text-center">
          Everything parents usually ask before joining Bluebell.
        </p>

        <div className="mt-10 divide-y divide-gray-100 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {FAQS.map((f, i) => (
            <div key={f.q} className="bg-white">
              <button
                type="button"
                onClick={() => setOpen(open === i ? -1 : i)}
                className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 font-bold text-gray-900 hover:bg-brand-soft/50 transition"
                aria-expanded={open === i}
              >
                {f.q}
                <span className="text-brand-light text-xl shrink-0">
                  {open === i ? <RiSubtractLine /> : <RiAddLine />}
                </span>
              </button>
              {open === i && (
                <p className="px-5 pb-5 text-sm text-gray-600 leading-relaxed">{f.a}</p>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          Still have a question?{" "}
          <Link href="/contact" className="font-bold text-brand hover:underline">
            Send us an enquiry →
          </Link>
        </p>
      </div>
    </section>
  );
}
