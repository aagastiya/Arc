import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora, Syne } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["800"],
});

export const metadata: Metadata = {
  title: "NEWOOZ",
  description: "News feed with RSS and Supabase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-black text-zinc-100">
        {children}
      </body>
    </html>
  );
}
