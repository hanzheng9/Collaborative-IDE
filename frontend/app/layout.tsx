import type { Metadata } from "next";
import "@carbon/styles/css/styles.css";
import "./ideTokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collaborative IDE",
  description: "A collaborative code editor skeleton"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
