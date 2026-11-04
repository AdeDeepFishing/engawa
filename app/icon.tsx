import { ICON_MARGIN, iconResponse } from "@/components/brand/icon-image";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * 32 px PNG for browsers that skip the SVG favicon (app/icon.svg): the mark
 * on the rounded accent tile. app/favicon.ico wraps this same PNG
 * (`pnpm brand:icons` writes it).
 */
export default function Icon() {
  return iconResponse(size.width, { margin: ICON_MARGIN.favicon, radius: 7 });
}
