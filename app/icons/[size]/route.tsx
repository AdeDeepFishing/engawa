import { iconResponse } from "@/components/brand/icon-image";

/** Sizes the web app manifest lists (app/manifest.ts). Anything else is a 404. */
const MANIFEST_ICON_SIZES = [192, 512] as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return MANIFEST_ICON_SIZES.map((s) => ({ size: String(s) }));
}

/** /icons/192 and /icons/512: the manifest's icons, built once at build time. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = Number(size);
  if (!MANIFEST_ICON_SIZES.some((s) => s === px)) return new Response("Not found", { status: 404 });
  return iconResponse(px);
}
