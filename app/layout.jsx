import "./globals.css";
import "react-toastify/dist/ReactToastify.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export const metadata = {
  title: "Bluebell School — Bluebell International School",
  description:
    "Bluebell International School — a values-driven international school education built on Wisdom, Integrity and Courage. Discover our programmes, facilities and admissions process.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
