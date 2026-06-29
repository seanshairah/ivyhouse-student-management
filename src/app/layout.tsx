import type { Metadata, Viewport } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
// Editorial grotesque for display headings (modern, premium feel).
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "Ivy House — Student Living in Chinhoyi",
    template: "%s · Ivy House",
  },
  description:
    "Ivy House — secure, verified student accommodation a short walk from the Chinhoyi University of Technology main campus. Browse rooms, apply online, and manage everything from your portal.",
  keywords: [
    "Ivy House",
    "student housing",
    "student accommodation",
    "Chinhoyi",
    "Chinhoyi University of Technology",
    "CUT accommodation",
  ],
};

export const viewport: Viewport = {
  themeColor: "#ff6b2c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster richColors position="top-center" closeButton />
      </body>
    </html>
  );
}
