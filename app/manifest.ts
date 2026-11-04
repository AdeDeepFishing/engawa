import type { MetadataRoute } from "next";
import { BRAND, BRAND_JA } from "@/components/brand/Mark";

/**
 * /manifest.webmanifest. The home screen label is "縁側 Engawa" (short_name,
 * and appleWebApp.title in app/layout.tsx for iOS). The icons come from
 * app/icons/[size]; the 512 px one doubles as the maskable icon, since the
 * mark sits inside the maskable safe circle (ICON_MARGIN in
 * components/brand/icon-image.tsx).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Engawa",
    short_name: `${BRAND_JA} Engawa`,
    description:
      "A neighbourhood board that turns paper notices, chat screenshots and text into cards everyone can read in six languages.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: BRAND.accent,
    background_color: BRAND.paper,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
