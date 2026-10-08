"use client";

import React, { useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import { useSettings } from "../../lib/useSettings";
import { submitEnquiry } from "../../lib/enquiry";
import { RiMailLine, RiPhoneLine, RiMapPinLine, RiChat3Line } from "react-icons/ri";

const FIELD =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-light";

// Enquiry capture: stores a jmis_enquiries row (admin follow-up pipeline)
// AND emails the school via EmailJS — the old site only emailed and lost leads.
export default function ContactPage() {
  const { settings } = useSettings();
  const contact = settings?.contactContent || {};
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    enquiry_type: "general",
    child_age_class: "",
    message: "",
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await submitEnquiry({
        name: form.name,
        email: form.email,
        phone: form.phone,
        message: form.message,
        enquiryType: form.enquiry_type,
        childAgeClass: form.child_age_class,
      });
      setSent(true);
      setForm({ name: "", email: "", phone: "", enquiry_type: "general", child_age_class: "", message: "" });
      toast.success("Message sent! We'll get back to you shortly.");
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
        <h1 className="section-title text-center">Get in touch</h1>
        <p className="section-sub mx-auto text-center">
          Questions about admissions, fees or a school visit? We're here to help.
        </p>

        <div className="grid md:grid-cols-5 gap-8 mt-12">
          {/* Contact details */}
          <div className="md:col-span-2 space-y-4">
            {[
              { icon: <RiMailLine />, label: "Email", value: contact.email, href: contact.email && `mailto:${contact.email}` },
              { icon: <RiPhoneLine />, label: "Phone", value: contact.phone, href: contact.phone && `tel:${String(contact.phone).replace(/\s/g, "")}` },
              { icon: <RiMapPinLine />, label: "Address", value: contact.address },
            ]
              .filter((c) => c.value)
              .map((c) => (
                <div key={c.label} className="bg-white rounded-2xl shadow-sm p-5 flex gap-4 items-start">
                  <span className="w-10 h-10 rounded-xl brand-gradient text-white flex items-center justify-center text-lg shrink-0">
                    {c.icon}
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{c.label}</p>
                    {c.href ? (
                      <a href={c.href} className="text-sm font-semibold text-gray-800 hover:text-brand break-all">
                        {c.value}
                      </a>
                    ) : (
                      <p className="text-sm font-semibold text-gray-800">{c.value}</p>
                    )}
                  </div>
                </div>
              ))}
            <div className="bg-white rounded-2xl shadow-sm p-5 flex gap-4 items-start">
              <span className="w-10 h-10 rounded-xl brand-gradient text-white flex items-center justify-center text-lg shrink-0">
                <RiChat3Line />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Visits</p>
                <p className="text-sm font-semibold text-gray-800">
                  Book a school tour — mention a preferred date in your message.
                </p>
              </div>
            </div>
          </div>

          {/* Enquiry form */}
          <form onSubmit={onSubmit} className="md:col-span-3 bg-white rounded-2xl shadow-sm p-6 md:p-8 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="c-name" className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                  Your name *
                </label>
                <input id="c-name" className={FIELD} required value={form.name} onChange={set("name")} placeholder="Full name" />
              </div>
              <div>
                <label htmlFor="c-email" className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                  Email *
                </label>
                <input id="c-email" type="email" className={FIELD} required value={form.email} onChange={set("email")} placeholder="you@example.com" />
              </div>
              <div>
                <label htmlFor="c-phone" className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                  Phone
                </label>
                <input id="c-phone" className={FIELD} value={form.phone} onChange={set("phone")} placeholder="+234 ..." />
              </div>
              <div>
                <label htmlFor="c-type" className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                  I'm enquiring about
                </label>
                <select id="c-type" className={FIELD} value={form.enquiry_type} onChange={set("enquiry_type")}>
                  <option value="admission">Admission / enrollment</option>
                  <option value="visit">School visit / tour</option>
                  <option value="general">General question</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="c-child" className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                Child's age or class (if applicable)
              </label>
              <input id="c-child" className={FIELD} value={form.child_age_class} onChange={set("child_age_class")} placeholder="e.g. 4 years old / Nursery 1" />
            </div>
            <div>
              <label htmlFor="c-msg" className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                Message *
              </label>
              <textarea id="c-msg" rows={5} className={FIELD} required value={form.message} onChange={set("message")} placeholder="How can we help?" />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full sm:w-auto px-8 py-3 rounded-full brand-gradient text-white font-extrabold hover:opacity-90 transition disabled:opacity-50"
            >
              {busy ? "Sending..." : "Send message"}
            </button>
            {sent && (
              <p className="text-sm font-semibold text-brand">
                ✓ Thank you! Your enquiry reached the school office — we'll follow up soon.
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
