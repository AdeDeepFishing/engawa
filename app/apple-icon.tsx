import { ICON_MARGIN, iconResponse } from "@/components/brand/icon-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home screen icon on iOS: square, iOS rounds the corners itself. */
export default function AppleIcon() {
  return iconResponse(size.width, { margin: ICON_MARGIN.apple });
}
