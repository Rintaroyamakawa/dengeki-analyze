import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://dengeki-analyze-bn51.vercel.app";
const SITE_TITLE = "ニコすこ！⚡｜電撃ニコ 見どころアーカイブ解析所";
const SITE_DESCRIPTION =
  "電撃ニコの配信アーカイブから見どころ・チャット熱量・タイムスタンプを一覧で探せる非公式ファンサイト「ニコすこ！」です。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "ニコすこ！⚡",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "ja_JP",
    images: [
      {
        url: "/lottie/nicosuko_bookmark_on_picture.png",
        width: 512,
        height: 512,
        alt: "ニコすこ！⚡ 電撃ニコ 見どころアーカイブ解析所",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/lottie/nicosuko_bookmark_on_picture.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}