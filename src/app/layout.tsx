import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estate Current & Forecast Weather",
  description: "FOM Department TV Dashboard — Estate Weather Monitoring",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
