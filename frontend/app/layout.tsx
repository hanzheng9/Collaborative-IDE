import type { Metadata } from "next";
import Script from "next/script";
import "@carbon/styles/css/styles.css";
import "./ideTokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collaborative IDE",
  description: "A collaborative code editor skeleton"
};

const themeBootScript = `
(() => {
  try {
    const savedTheme = localStorage.getItem("collaborativeIde.theme");
    const preference = ["light", "dark"].includes(savedTheme)
      ? savedTheme
      : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    document.documentElement.dataset.theme = preference;
    document.documentElement.style.colorScheme = preference;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script
          id="theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
        {children}
      </body>
    </html>
  );
}
