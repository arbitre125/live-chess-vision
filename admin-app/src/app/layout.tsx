import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "الشطرنج الحي بالكاميرا — صفحة الأدمن | Live Chess Vision",
  description:
    "لوحة تحكم نظام نقل نقلات الشطرنج من الرقع بالكاميرا إلى موقع النادي — نادي سبورتينغ أريانة، تونس",
  keywords: ["chess", "live chess", "camera", "raspberry pi", "شطرنج حي"],
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#065f46",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
