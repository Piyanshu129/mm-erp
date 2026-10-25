"use client";

import { useEffect } from "react";

// Last-resort error screen (when even the root layout fails). Same idea as
// app/error.tsx: reload once for a stale version after an update, otherwise
// a Reload button. Must render its own <html>/<body>.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(`${error.name} ${error.message}`)) return;
    try {
      if (sessionStorage.getItem("mm-reloaded-for-update")) return;
      sessionStorage.setItem("mm-reloaded-for-update", "1");
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#f9fafb" }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <p style={{ fontWeight: 600, color: "#111827" }}>Something went wrong</p>
          <p style={{ fontSize: 14, color: "#4b5563" }}>
            Reload the page. If it keeps happening, the servers may be stopped — start them with start-servers.bat.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: "8px 16px", background: "#2563eb", color: "#fff", border: 0, borderRadius: 6, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
