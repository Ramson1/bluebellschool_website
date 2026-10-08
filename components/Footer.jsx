"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSettings } from "../lib/useSettings";
import {
  RiMailLine,
  RiPhoneLine,
  RiMapPinLine,
  RiGlobalLine,
} from "react-icons/ri";

// Site footer: school contact block (from bluebell_settings.contactContent) plus
// the Black-Box Tech credit linking to https://blackboxtech.online.
export default function Footer() {
  const { settings } = useSettings();
  const contact = settings?.contactContent || {};
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand text-white">
      <div className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-3 gap-10">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="Bluebell logo" width={44} height={44} className="rounded-full" />
            <p className="font-extrabold leading-tight">
              Bluebell
              <br />
              International School
            </p>
          </div>
          <p className="text-sm text-white/60 mt-4 leading-relaxed">
            A nurturing, values-driven education from Creche to Secondary —
            where every child is known, loved and equipped to excel.
          </p>
        </div>

        {/* Quick links */}
        <div>
          <p className="font-extrabold uppercase text-xs tracking-widest text-white/50">Explore</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              ["About the school", "/#about"],
              ["Programmes", "/#programs"],
              ["Facilities", "/#facilities"],
              ["Gallery", "/#gallery"],
              ["Admissions", "/admissions"],
              ["Take a CBT Quiz", "/cbt"],
              ["Contact & enquiries", "/contact"],
            ].map(([label, href]) => (
              <li key={label}>
                <Link href={href} className="text-white/80 hover:text-white hover:underline">
                  {label}
                </Link>
              </li>
            ))}
            {process.env.NEXT_PUBLIC_STUDENT_PORTAL_URL && (
              <li>
                <a
                  href={process.env.NEXT_PUBLIC_STUDENT_PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/80 hover:text-white hover:underline"
                >
                  Check Result
                </a>
              </li>
            )}
          </ul>
        </div>

        {/* Contact */}
        <div>
          <p className="font-extrabold uppercase text-xs tracking-widest text-white/50">Reach us</p>
          <ul className="mt-4 space-y-3 text-sm text-white/80">
            {contact.address && (
              <li className="flex gap-2">
                <RiMapPinLine className="shrink-0 mt-0.5 text-white" /> {contact.address}
              </li>
            )}
            {contact.phone && (
              <li className="flex gap-2">
                <RiPhoneLine className="shrink-0 mt-0.5 text-white" />
                <a href={`tel:${String(contact.phone).replace(/\s/g, "")}`} className="hover:underline">
                  {contact.phone}
                </a>
              </li>
            )}
            {contact.email && (
              <li className="flex gap-2">
                <RiMailLine className="shrink-0 mt-0.5 text-white" />
                <a href={`mailto:${contact.email}`} className="hover:underline break-all">
                  {contact.email}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-white/50">
          <p>© {year} Bluebell International School. All rights reserved.</p>
          <p className="flex items-center gap-2 flex-wrap justify-center">
            <span>Powered by</span>
            <a
              href="https://blackboxtech.online"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 font-semibold hover:underline inline-flex items-center gap-1.5"
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black overflow-hidden shrink-0">
                <Image src="/blackbox-tech.jpg" alt="Black-Box Tech logo" width={28} height={28} className="w-full h-full object-contain" />
              </span>
              Black-Box Tech <RiGlobalLine />
            </a>
            <span className="text-white/30">·</span>
            <a
              href="mailto:info@blackboxtech.online"
              className="text-white/70 hover:text-white hover:underline inline-flex items-center gap-1 break-all"
            >
              <RiMailLine className="shrink-0" /> info@blackboxtech.online
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
