import "./globals.css";
import "react-toastify/dist/ReactToastify.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export const metadata = {
  title: "Black-Box Institution",
  description:
    "Black-Box Institution — a values-driven international school education built on Discover, Design and Deliver. Discover our programmes, facilities and admissions process.",
  icons: { icon: "/favicon.ico?v=4", apple: "/apple-touch-icon.png" },
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
