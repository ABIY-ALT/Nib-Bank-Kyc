"use client";

import { cn } from "@/lib/utils";

interface PdfPreviewProps {
  /** Blob URL with type application/pdf */
  blobUrl: string;
  /** Same-origin signed URL fallback when blob iframe fails */
  previewUrl?: string;
  className?: string;
  title?: string;
  onReady?: () => void;
}

/**
 * Native browser PDF rendering via iframe (same approach as opening a PDF tab).
 */
export function PdfPreview({
  blobUrl,
  previewUrl,
  className,
  title = "PDF preview",
  onReady,
}: PdfPreviewProps) {
  const src = blobUrl || previewUrl;

  if (!src) return null;

  return (
    <iframe
      src={src}
      title={title}
      onLoad={() => onReady?.()}
      className={cn("h-full w-full min-h-[420px] border-0 bg-white", className)}
    />
  );
}
