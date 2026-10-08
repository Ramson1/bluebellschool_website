"use client";

import React, { useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import { submitApplication } from "../../lib/enquiry";
import { RiSearchLine, RiFileTextLine, RiGraduationCapLine } from "react-icons/ri";

const FIELD =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light";
const LABEL = "block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1";

const CLASSES = [
  "Creche", "PreNursery1", "PreNursery2", "Nursery 1", "Nursery 2",
  "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12",
];

const STEPS = [
  {
    icon: <RiSearchLine />,
    t: "1 · Enquire & visit",
    d: "Send an enquiry or book a school tour. Meet the teachers, see the classrooms and ask us anything.",
  },
  {
    icon: <RiFileTextLine />,
    t: "2 · Apply",
    d: "Fill the short application below with your child's details. Our admissions team reviews every submission.",
  },
  {
    icon: <RiGraduationCapLine />,
    t: "3 · Enroll",
    d: "Receive the acceptance letter and fee list, complete payment and your child is ready to join the Bluebell family.",
  },
];

const EMPTY = {
  parentName: "", parentEmail: "", parentPhone: "", parentAddress: "",
  childName: "", childDOB: "", childSex: "", applyingClass: "",
  currentSchool: "", specialNeeds: "", preferredVisitDate: "", message: "",
};

// Admissions page: 3-step process + online application form. Writes
// jmis_admissions_applications + a linked jmis_enquiries row (follow-up
// pipeline) and notifies the school by email.
export default function AdmissionsPage() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await submitApplication(form);
      setDone(true);
      setForm(EMPTY);
      toast.success("Application submitted! The admissions team will contact you shortly.");
    } catch (err) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="py-16 bg-brand-soft/40 min-h-[70vh]">
      <ToastContainer position="top-center" />
      <div className="max-w-5xl mx-auto px-4">
        <h1 className="section-title text-center">Admissions at Bluebell</h1>
        <p className="section-sub mx-auto text-center">
          Joining our school is simple — three steps from first visit to first day.
        </p>

        {/* 3-step process */}
        <div className="grid md:grid-cols-3 gap-6 mt-10">
          {STEPS.map((s) => (
            <div key={s.t} className="bg-white rounded-2xl shadow-sm p-6">
              <span className="w-11 h-11 rounded-xl brand-gradient text-white flex items-center justify-center text-xl">
                {s.icon}
              </span>
              <h3 className="mt-4 font-extrabold text-gray-900">{s.t}</h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>

        {/* Application form */}
        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-sm p-6 md:p-8 mt-12">
          <h2 className="text-xl font-extrabold text-gray-900">Online application form</h2>
          <p className="text-sm text-gray-500 mt-1">
            All fields marked * are required. Submitting does not reserve a place — the office will confirm next steps.
          </p>

          <p className="mt-6 mb-2 text-xs font-extrabold uppercase tracking-widest text-brand">Parent / Guardian</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="a-pname" className={LABEL}>Full name *</label>
              <input id="a-pname" className={FIELD} required value={form.parentName} onChange={set("parentName")} placeholder="Mr./Mrs. ..." />
            </div>
            <div>
              <label htmlFor="a-pemail" className={LABEL}>Email *</label>
              <input id="a-pemail" type="email" className={FIELD} required value={form.parentEmail} onChange={set("parentEmail")} placeholder="you@example.com" />
            </div>
            <div>
              <label htmlFor="a-pphone" className={LABEL}>Phone *</label>
              <input id="a-pphone" className={FIELD} required value={form.parentPhone} onChange={set("parentPhone")} placeholder="+234 ..." />
            </div>
            <div>
              <label htmlFor="a-paddress" className={LABEL}>Home address</label>
              <input id="a-paddress" className={FIELD} value={form.parentAddress} onChange={set("parentAddress")} placeholder="Area, city" />
            </div>
          </div>

          <p className="mt-8 mb-2 text-xs font-extrabold uppercase tracking-widest text-brand">Child</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="a-cname" className={LABEL}>Child's full name *</label>
              <input id="a-cname" className={FIELD} required value={form.childName} onChange={set("childName")} placeholder="Full name" />
            </div>
            <div>
              <label htmlFor="a-cdob" className={LABEL}>Date of birth</label>
              <input id="a-cdob" type="date" className={FIELD} value={form.childDOB} onChange={set("childDOB")} />
            </div>
            <div>
              <label htmlFor="a-csex" className={LABEL}>Sex</label>
              <select id="a-csex" className={FIELD} value={form.childSex} onChange={set("childSex")}>
                <option value="">— select —</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label htmlFor="a-cclass" className={LABEL}>Class applying for *</label>
              <select id="a-cclass" className={FIELD} required value={form.applyingClass} onChange={set("applyingClass")}>
                <option value="">— select class —</option>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="a-cschool" className={LABEL}>Current / previous school</label>
              <input id="a-cschool" className={FIELD} value={form.currentSchool} onChange={set("currentSchool")} placeholder="Or 'none'" />
            </div>
            <div>
              <label htmlFor="a-cvisit" className={LABEL}>Preferred visit date</label>
              <input id="a-cvisit" type="date" className={FIELD} value={form.preferredVisitDate} onChange={set("preferredVisitDate")} />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="a-cneeds" className={LABEL}>Special needs or medical notes (optional)</label>
            <input id="a-cneeds" className={FIELD} value={form.specialNeeds} onChange={set("specialNeeds")} placeholder="Anything the school should know" />
          </div>
          <div className="mt-4">
            <label htmlFor="a-msg" className={LABEL}>Additional message</label>
            <textarea id="a-msg" rows={3} className={FIELD} value={form.message} onChange={set("message")} placeholder="Questions, preferred start date, etc." />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-8 w-full sm:w-auto px-10 py-3 rounded-full brand-gradient text-white font-extrabold hover:opacity-90 transition disabled:opacity-50"
          >
            {busy ? "Submitting..." : "Submit application"}
          </button>
          {done && (
            <p className="mt-4 text-sm font-semibold text-brand">
              ✓ Application received! Check your inbox — the admissions team will follow up shortly.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
