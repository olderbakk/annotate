import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Annotate — Website feedback tool",
  description: "Pin comments on any website and share with your clients",
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
