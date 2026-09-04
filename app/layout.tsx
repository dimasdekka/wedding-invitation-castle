import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pink Lewisia Foto",
  description: "Wedding invitation template",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
