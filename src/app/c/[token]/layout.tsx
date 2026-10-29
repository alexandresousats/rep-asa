import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Calendário do cliente",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#141211" },
  ],
};

export default function ClientShareLayout({ children }: LayoutProps<"/c/[token]">) {
  return children;
}
