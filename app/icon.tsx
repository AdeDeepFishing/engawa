import { iconResponse } from "@/components/brand/icon-image";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** 32 px PNG for browsers that skip the SVG favicon (app/icon.svg): the mark on the accent tile. */
export default function Icon() {
  return iconResponse(size.width, { mark: 0.75, radius: 7 });
}
