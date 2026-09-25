import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import "./globals.css";
import "../styles/page-coherence.css";
import GlobalCursorGlow from "@/components/GlobalCursorGlow";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import Preloader from "@/components/Preloader";
import SiteChrome from "@/components/SiteChrome";
import AuthProvider from "@/components/auth/AuthProvider";
import ApplicationStateProvider from "@/components/application/ApplicationStateProvider";

export const metadata: Metadata = {
  title: "Audvertax, Get a U.S. Company and Finally Get Paid",
  description:
    "We handle your U.S. LLC, UK Ltd, ITIN & Taxation, then set up Stripe, PayPal, Payoneer & Zelle so global clients pay you instantly.",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    shortcut: ["/favicon.ico"],
    apple: ["/favicon.ico"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <ApplicationStateProvider>
            <Preloader />
            <GlobalCursorGlow />
            <Suspense fallback={<>{children}</>}>{<SiteChrome>{children}</SiteChrome>}</Suspense>
            {/* <WhatsAppWidget /> */}
          </ApplicationStateProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
