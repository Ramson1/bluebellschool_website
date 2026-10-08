import React from "react";
import Hero from "../components/Hero";
import Programs from "../components/Programs";
import About from "../components/About";
import Facilities from "../components/Facilities";
import Gallery from "../components/Gallery";
import Testimonials from "../components/Testimonials";
import News from "../components/News";
import Faq from "../components/Faq";

// Public home page — marketing sections only; all data comes from the
// admin-managed jmis_settings row (same content pipeline as the old site).
export default function Home() {
  return (
    <>
      <Hero />
      <Programs />
      <About />
      <Facilities />
      <Gallery />
      <Testimonials />
      <News />
      <Faq />
    </>
  );
}
