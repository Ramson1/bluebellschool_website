"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { RiMenu3Line, RiCloseLine, RiExternalLinkLine, RiArrowDownSLine, RiDownloadLine } from "react-icons/ri";

const LINKS = [
  { href: "/#about", label: "About" },
  { href: "/#programs", label: "Programmes" },
  { href: "/#facilities", label: "Facilities" },
  { href: "/#gallery", label: "Gallery" },
  { href: "/contact", label: "Contact", exact: true },
];

// Sticky glass navbar. Student/Staff portal CTAs use env URLs when set and
// fall back to the live student.bluebellschool.com / staff.bluebellschool.com addresses.
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [mobilePortalOpen, setMobilePortalOpen] = useState(false);
  const dropdownRef = useRef(null);
  const studentPortal = process.env.NEXT_PUBLIC_STUDENT_PORTAL_URL || "https://student.bluebellschool.com";
  const staffPortal = process.env.NEXT_PUBLIC_STAFF_PORTAL_URL || "https://staff.bluebellschool.com";
  // Attendance app (Android APK on Google Drive) — for admin / security staff.
  const attendanceApp =
    process.env.NEXT_PUBLIC_ATTENDANCE_APP_URL ||
    "https://drive.google.com/file/d/1GaQ2VK-xJD32cnQR1i3n3Zsm4VRkz7d-/view?usp=sharing";

  // Close the desktop Portal dropdown when clicking outside or pressing Escape.
  useEffect(() => {
    if (!portalOpen) return;
    const onClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setPortalOpen(false);
    };
    const onEscape = (e) => {
      if (e.key === "Escape") setPortalOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [portalOpen]);

  const PORTAL_ITEMS = [
    { label: "CBT Portal", href: "/cbt", external: false },
    { label: "Student Portal", href: studentPortal, external: true },
    { label: "Staff Portal", href: staffPortal, external: true },
    { label: "Attendance App", href: attendanceApp, external: true, download: true },
  ];

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-white/85 border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/logo.jpg" alt="Bluebell logo" width={40} height={40} className="rounded-full" priority />
          <span className="font-extrabold text-brand text-lg leading-tight">
            Bluebell
            <span className="block text-[10px] font-semibold text-gray-500 tracking-wide">
              Bluebell International School
            </span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-6 ml-auto">
          {LINKS.map((l) =>
            l.exact ? (
              <Link key={l.href} href={l.href} className="text-sm font-semibold text-gray-700 hover:text-brand-light">
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} className="text-sm font-semibold text-gray-700 hover:text-brand-light">
                {l.label}
              </a>
            )
          )}
        </nav>

        <div className="hidden lg:flex items-center gap-2 ml-4">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={portalOpen}
              onClick={() => setPortalOpen((v) => !v)}
              className="text-sm font-bold px-4 py-2 rounded-full border border-brand text-brand hover:bg-brand-soft inline-flex items-center gap-1"
            >
              Portal <RiArrowDownSLine className={`transition-transform ${portalOpen ? "rotate-180" : ""}`} />
            </button>
            {portalOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-gray-100 bg-white shadow-lg py-2 z-50">
                {PORTAL_ITEMS.map((item) =>
                  item.external ? (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setPortalOpen(false)}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-brand-soft hover:text-brand"
                    >
                      {item.label} {item.download ? <RiDownloadLine className="text-gray-400" /> : <RiExternalLinkLine className="text-gray-400" />}
                    </a>
                  ) : (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setPortalOpen(false)}
                      className="block px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-brand-soft hover:text-brand"
                    >
                      {item.label}
                    </Link>
                  )
                )}
              </div>
            )}
          </div>
          <Link href="/admissions" className="text-sm font-bold px-4 py-2 rounded-full brand-gradient text-white hover:opacity-90">
            Enroll Your Child
          </Link>
        </div>

        <button type="button" aria-label="Menu" className="lg:hidden ml-auto text-2xl text-brand" onClick={() => setOpen((v) => !v)}>
          {open ? <RiCloseLine /> : <RiMenu3Line />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-3">
          {LINKS.map((l) =>
            l.exact ? (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-sm font-semibold text-gray-700">
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-sm font-semibold text-gray-700">
                {l.label}
              </a>
            )
          )}
          <button
            type="button"
            aria-expanded={mobilePortalOpen}
            onClick={() => setMobilePortalOpen((v) => !v)}
            className="flex items-center gap-1 text-sm font-semibold text-brand w-fit"
          >
            Portal <RiArrowDownSLine className={`transition-transform ${mobilePortalOpen ? "rotate-180" : ""}`} />
          </button>
          {mobilePortalOpen && (
            <div className="flex flex-col gap-2 pl-4 border-l-2 border-brand-soft">
              <Link href="/cbt" onClick={() => setOpen(false)} className="text-sm font-semibold text-gray-700">CBT Portal</Link>
              <a href={studentPortal} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="flex items-center gap-1 text-sm font-semibold text-gray-700">
                Student Portal <RiExternalLinkLine className="text-gray-400" />
              </a>
              <a href={staffPortal} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="flex items-center gap-1 text-sm font-semibold text-gray-700">
                Staff Portal <RiExternalLinkLine className="text-gray-400" />
              </a>
              <a href={attendanceApp} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="flex items-center gap-1 text-sm font-semibold text-gray-700">
                Attendance App <RiDownloadLine className="text-gray-400" />
              </a>
            </div>
          )}
          <Link href="/admissions" onClick={() => setOpen(false)} className="text-sm font-bold px-4 py-2 rounded-full brand-gradient text-white text-center">
            Enroll Your Child
          </Link>
        </div>
      )}
    </header>
  );
}
