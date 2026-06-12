import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "Transit — Developer API Gateway",
    template: "%s · Transit",
  },
  description:
    "Transit is an AI gateway — a secure, rate-limited proxy for NVIDIA open LLMs. One authenticated endpoint, server-side keys, per-key quotas, and usage analytics.",
  metadataBase: new URL("https://transit.dev"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-terminal-bg text-slate-200 antialiased">
        <div className="flex min-h-screen flex-col">
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
