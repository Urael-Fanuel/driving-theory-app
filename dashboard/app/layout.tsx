import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "דשבורד הסוכן הלומד",
  description: "מדדי הסוכן הלומד עבור אפליקציית תיאוריית הנהיגה",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
