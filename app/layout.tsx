import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poop Clan Server HQ — Build together",
  description: "A private workspace for server ideas, decisions, delivery, and team knowledge.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
