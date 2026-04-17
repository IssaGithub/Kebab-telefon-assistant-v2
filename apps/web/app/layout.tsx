import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kebab Telefon Assistant",
  description: "SaaS dashboard for AI-powered restaurant phone ordering"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}

