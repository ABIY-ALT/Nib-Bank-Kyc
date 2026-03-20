"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];

function hasFileExtension(fileName: string, extensions: string[]) {
  const normalizedName = fileName.toLowerCase();
  return extensions.some((extension) => normalizedName.endsWith(extension));
}

export interface PreviewableDocument {
  id: string;
  name: string;
  previewUrl: string;
  mimeType?: string;
  documentType?: string;
  size?: number;
  status?: string;
}

interface DocumentPreviewViewerProps {
  file: PreviewableDocument | null;
  className?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
}

interface DocumentPreviewNavigationProps {
  currentIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
  buttonClassName?: string;
  counterClassName?: string;
}

export function isPdfDocument(file: PreviewableDocument | null | undefined) {
  if (!file) return false;
  return file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isImageDocument(file: PreviewableDocument | null | undefined) {
  if (!file) return false;
  return !!file.mimeType?.startsWith("image/") || hasFileExtension(file.name, IMAGE_EXTENSIONS);
}

export function getPreviewFormatLabel(file: PreviewableDocument | null | undefined) {
  if (!file) return "Document";
  if (isPdfDocument(file)) return "PDF";
  if (isImageDocument(file)) return "Image";

  if (!file.mimeType) return "Document";
  const [type, subtype] = file.mimeType.split("/");
  const normalizedType = type ? type[0].toUpperCase() + type.slice(1) : "Document";
  return subtype ? `${normalizedType} / ${subtype.toUpperCase()}` : normalizedType;
}

export function formatFileSize(size?: number) {
  if (!size) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function DocumentPreviewNavigation({
  currentIndex,
  total,
  onPrevious,
  onNext,
  className,
  buttonClassName,
  counterClassName,
}: DocumentPreviewNavigationProps) {
  const hasItems = total > 0;
  const previousDisabled = !hasItems || currentIndex <= 0;
  const nextDisabled = !hasItems || currentIndex >= total - 1;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={previousDisabled}
        className={cn("h-9 rounded-full px-4 font-bold", buttonClassName)}
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        Previous
      </Button>
      <div
        className={cn(
          "rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500",
          counterClassName
        )}
      >
        {hasItems ? `${currentIndex + 1} of ${total}` : "0 of 0"}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={nextDisabled}
        className={cn("h-9 rounded-full px-4 font-bold", buttonClassName)}
      >
        Next
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

export function DocumentPreviewViewer({
  file,
  className,
  emptyStateTitle = "Select a document",
  emptyStateDescription = "Choose a file from the list to inspect it here.",
}: DocumentPreviewViewerProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
  }, [file?.id]);

  if (!file) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-[#d9c7a4] bg-[radial-gradient(circle_at_top,_rgba(184,147,52,0.16),_rgba(255,251,245,0.98)_48%)] p-8 text-center",
          className
        )}
      >
        <div className="rounded-full bg-primary/10 p-4">
          <FileText className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-black text-slate-900">{emptyStateTitle}</p>
          <p className="max-w-md text-sm font-medium text-slate-500">{emptyStateDescription}</p>
        </div>
      </div>
    );
  }

  const isPdf = isPdfDocument(file);
  const isImage = isImageDocument(file);
  const shouldShowLoader = (isPdf || isImage) && !isLoaded;

  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-[28px] border border-[#d9c7a4] bg-[radial-gradient(circle_at_top,_rgba(184,147,52,0.14),_rgba(255,251,245,0.98)_56%)]",
        className
      )}
    >
      {shouldShowLoader ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading preview...
          </div>
        </div>
      ) : null}

      {isPdf ? (
        <iframe
          key={file.id}
          src={`${file.previewUrl}#toolbar=1&navpanes=0&scrollbar=1`}
          title={`Preview of ${file.name}`}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          className={cn(
            "h-full min-h-[420px] w-full border-0 transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
        />
      ) : isImage ? (
        <div className="flex h-full min-h-[420px] w-full items-center justify-center overflow-auto p-6 sm:p-8">
          <img
            key={file.id}
            src={file.previewUrl}
            alt={file.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            className={cn(
              "max-h-full max-w-full rounded-2xl object-contain shadow-[0_18px_60px_rgba(15,23,42,0.18)] transition-all duration-300",
              isLoaded ? "scale-100 opacity-100" : "scale-[0.985] opacity-0"
            )}
          />
        </div>
      ) : (
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-6 p-10 text-center">
          <div className="rounded-full bg-slate-100 p-6">
            <FileText className="h-14 w-14 text-slate-400" />
          </div>
          <div className="space-y-2">
            <p className="text-xl font-black text-slate-900">Preview unavailable</p>
            <p className="max-w-md text-sm font-medium text-slate-500">
              This document format does not have an in-browser preview. Download the original file to review it.
            </p>
          </div>
          <Button asChild className="h-11 rounded-full bg-primary px-6 font-bold text-white shadow-lg">
            <a href={file.previewUrl} download={file.name}>
              <Download className="h-4 w-4" />
              Download Original
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
