"use client";

import { useEffect } from "react";

// After a new version is published, a tab opened before it still asks for
// the old version's files, which no longer exist ("ChunkLoadError"). Reload
// once to get the new version; anything else shows a plain message with a
// Reload button instead of Next.js's bare "Application error".
function isStaleVersion(error: Error): boolean {
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    `${error.name} ${error.message}`
  );
}

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!isStaleVersion(error)) return;
    try {
      // Only once, so a genuinely broken page can't reload forever.
      if (sessionStorage.getItem("mm-reloaded-for-update")) return;
      sessionStorage.setItem("mm-reloaded-for-update", "1");
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center">
        <p className="text-base font-semibold text-gray-900">Something went wrong on this page</p>
        <p className="mt-2 text-sm text-gray-600">
          {isStaleVersion(error)
            ? "A new version of the app was published while this page was open."
            : "Reload the page. If it keeps happening, the servers may be stopped — start them with start-servers.bat."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
