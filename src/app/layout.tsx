import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AyuScholar Quiz Bot — Team Admin Dashboard",
  description: "Sleek, real-time control center for managing Telegram quizzes, scheduled times, target groups, and Excel file progress tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
