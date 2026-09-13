"use client";

import { useEffect, useState } from "react";
import { fetchAssetBlob } from "@/lib/api";

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
