import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TruthLens",
  description: "AI-generated content detection MVP for image, video, and text analysis.",
  icons: {
    icon: "/favicon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
