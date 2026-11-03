"use client";

/**
 * The line that says the reader is looking at a saved copy. The live region
 * is always in the page, so the line is announced when it appears. Never
 * printed: the notice page prints from the same layout.
 */
export function OfflineBanner({ message }: { message: string | null }) {
  return (
    <div role="status" aria-live="polite" className="print:hidden">
      {message ? (
        <p
          className="border-b-2 border-warn-ink bg-warn-bg px-4 py-3 text-center text-base font-bold text-warn-ink"
          data-offline-banner
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
