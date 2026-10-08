"use client";

import React from "react";
import { useSettings } from "../lib/useSettings";
import { settingFileUrl } from "../lib/supabaseClient";
import { RiBuildingLine } from "react-icons/ri";

// Facilities grid fed by jmis_settings.facilitiesContent [{image, heading, content}].
export default function Facilities() {
  const { settings } = useSettings();
  const facilities = settings?.facilitiesContent || [];

  return (
    <section id="facilities" className="py-16 bg-white">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="section-title text-center">Our facilities</h2>
        <p className="section-sub mx-auto text-center">
          Empowering our students with the best resources for a holistic experience.
        </p>

        {facilities.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
            {facilities.map((f, i) => (
              <div
                key={i}
                className="group rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg transition bg-white"
              >
                <div className="h-44 overflow-hidden bg-brand-soft">
                  {f.image ? (
                    <img
                      src={settingFileUrl(f.image)}
                      alt={f.heading}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-brand-light text-4xl">
                      <RiBuildingLine />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-extrabold text-gray-900">{f.heading}</h3>
                  <p className="text-sm text-gray-600 mt-1.5 line-clamp-3">{f.content}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400 mt-10">Facility photos coming soon.</p>
        )}
      </div>
    </section>
  );
}
