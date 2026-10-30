"use client";

import { useEffect, useState } from "react";
import { assetUrl, fetchAssetBlob } from "@/lib/api";

function useAssetBlobUrl(src: string): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    fetchAssetBlob(src)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setBlobUrl(url);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  return blobUrl;
}

export function AuthedImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const blobUrl = useAssetBlobUrl(src);
  if (!blobUrl) return <div className={`${className ?? ""} animate-pulse bg-gray-100`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={blobUrl} alt={alt} className={className} />;
}

export function AuthedVideo({ src, className }: { src: string; className?: string }) {
  const blobUrl = useAssetBlobUrl(src);
  if (!blobUrl) return <div className={`${className ?? ""} animate-pulse bg-gray-100`} />;
  return <video src={blobUrl} className={className} controls />;
}

// A link to an uploaded file (bill, signed estimate...). A plain link would
// hit ngrok's browser-warning page instead of the file, so the click fetches
// the file with the skip header and opens that copy. The tab is opened
// straight away (still inside the click) so the browser doesn't block it as
// a pop-up, then pointed at the file once it has loaded.
export function AssetLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  async function open(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const win = window.open("", "_blank");
    if (win) win.document.write("<p style='font-family:sans-serif'>Opening…</p>");
    try {
      const blobUrl = await fetchAssetBlob(href);
      if (win) win.location.href = blobUrl;
      else window.location.href = blobUrl;
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60_000);
    } catch {
      if (win) win.close();
      alert("Couldn't open the file — check that the server is running and try again.");
    }
  }
  return (
    <a href={assetUrl(href)} onClick={open} className={className}>
      {children}
    </a>
  );
}
