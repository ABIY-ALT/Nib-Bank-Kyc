"use client";

import { type ReactNode, type WheelEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { PdfPreview } from "@/components/submissions/pdf-preview";
import { ImageViewerModal } from "@/components/submissions/image-viewer-modal";
import { cn } from "@/lib/utils";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function useZoomController() {
  const [zoomLevel, setZoomLevel] = useState(1);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
  }, []);

  const handleWheelZoom = useCallback((event: WheelEvent<HTMLDivElement>, requireModifier = true) => {
    if (requireModifier && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const adjustment = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoomLevel((current) => clampZoom(current + adjustment));
  }, []);

  return { zoomLevel, handleWheelZoom, resetZoom };
}

interface ZoomSurfaceProps {
  zoomLevel: number;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onDoubleClick?: () => void;
  className?: string;
  children: ReactNode;
  resetSignal?: number;
  showZoomBadge?: boolean;
  verticalAlign?: "center" | "start";
}

function ZoomSurface({
  zoomLevel,
  onWheel,
  onDoubleClick,
  className,
  children,
  resetSignal,
  showZoomBadge = false,
  verticalAlign = "center",
}: ZoomSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const resetOffset = useCallback(() => {
    setOffset({ x: 0, y: 0 });
    dragStateRef.current = { pointerId: -1, startX: 0, startY: 0, offsetX: 0, offsetY: 0 };
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (zoomLevel <= 1) {
      resetOffset();
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const maxX = ((zoomLevel - 1) * container.clientWidth) / 2;
    const maxY = ((zoomLevel - 1) * container.clientHeight) / 2;

    setOffset((current) => ({
      x: clampValue(current.x, -maxX, maxX),
      y: clampValue(current.y, -maxY, maxY),
    }));
  }, [zoomLevel, resetOffset]);

  useEffect(() => {
    if (resetSignal === undefined) return;
    resetOffset();
  }, [resetOffset, resetSignal]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (zoomLevel <= 1) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };

      container.setPointerCapture(event.pointerId);
      setIsDragging(true);
    },
    [offset, zoomLevel]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (dragStateRef.current.pointerId !== event.pointerId) return;
      const container = containerRef.current;
      if (!container) return;

      const deltaX = event.clientX - dragStateRef.current.startX;
      const deltaY = event.clientY - dragStateRef.current.startY;

      const maxX = ((zoomLevel - 1) * container.clientWidth) / 2;
      const maxY = ((zoomLevel - 1) * container.clientHeight) / 2;

      const nextX = clampValue(dragStateRef.current.offsetX + deltaX, -maxX, maxX);
      const nextY = clampValue(dragStateRef.current.offsetY + deltaY, -maxY, maxY);

      setOffset({ x: nextX, y: nextY });
    },
    [zoomLevel]
  );

  const releasePointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) return;
    const container = containerRef.current;
    if (container) {
      container.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current.pointerId = -1;
    setIsDragging(false);
  }, []);

  const transformStyle = {
    transform: `translate(${offset.x}px, ${offset.y}px)`,
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-auto transition-all duration-200",
        className,
        zoomLevel > 1 ? "cursor-grab" : "cursor-auto",
        isDragging && "cursor-grabbing"
      )}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerLeave={releasePointer}
      style={{ touchAction: zoomLevel > 1 ? "none" : "auto" }}
    >
      <div className={cn("flex h-full w-full justify-center", verticalAlign === "start" ? "items-start" : "items-center")}>
        <div
          className={cn("flex h-full w-full justify-center", verticalAlign === "start" ? "items-start" : "items-center")}
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center center" }}
        >
          <div className="w-full max-w-full" style={transformStyle}>
            {children}
          </div>
        </div>
      </div>
      {showZoomBadge ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm">
          Zoom {Math.round(zoomLevel * 100)}%
        </div>
      ) : null}
    </div>
  );
}

import {
  blobForDocumentPreview,
  downloadDocumentFile,
  formatFileSize,
  getPreviewFormatLabel,
  isImageDocument,
  isPdfBuffer,
  isPdfDocument,
  getDocumentDownloadUrl,
  resolveDownloadFileName,
  type PreviewableDocument,
} from "@/lib/documents";

async function triggerDocumentDownload(file: PreviewableDocument) {
  await downloadDocumentFile(
    getDocumentDownloadUrl(file),
    resolveDownloadFileName(file.name, file.originalName, file.mimeType)
  );
}

export type { PreviewableDocument };

interface DocumentPreviewViewerProps {
  file?: PreviewableDocument | null;
  files?: PreviewableDocument[];
  showMultipleView?: boolean;
  className?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  onFileSelect?: (file: PreviewableDocument) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  currentIndex?: number;
}

export interface DocumentPreviewNavigationProps {
  currentIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  buttonClassName?: string;
  counterClassName?: string;
}

export function DocumentPreviewNavigation({
  currentIndex,
  total,
  onPrevious,
  onNext,
  buttonClassName,
  counterClassName,
}: DocumentPreviewNavigationProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={currentIndex <= 0}
        className={cn("h-10 w-10 rounded-full", buttonClassName)}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <div
        className={cn(
          "flex h-10 min-w-[80px] items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm",
          counterClassName
        )}
      >
        {total > 0 ? `${currentIndex + 1} / ${total}` : "0 / 0"}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={currentIndex >= total - 1}
        className={cn("h-10 w-10 rounded-full", buttonClassName)}
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

function MultipleFileCard({ file, onSelect }: { file: PreviewableDocument; onSelect?: (file: PreviewableDocument) => void }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const isPdf = isPdfDocument(file);
  const isImage = isImageDocument(file);

  // Only fetch the thumbnail once the card scrolls into view.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    let active = true;
    setIsLoaded(false);
    setError(null);

    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }

    if (!file?.previewUrl || (!isPdf && !isImage)) return;

    const loadPreview = async () => {
      try {
        const response = await fetch(file.previewUrl, { credentials: "include" });
        if (!active) return;

        if (!response.ok) {
          const status = response.status;
          if (status === 429) {
            setError("Too many requests — please wait a moment and try again.");
          } else if (status === 401 || status === 403) {
            setError("Access denied.");
          } else {
            setError("Preview unavailable.");
          }
          setIsLoaded(true);
          return;
        }

        const rawBlob = await response.blob();
        if (!active) return;

        const blob = await blobForDocumentPreview(
          rawBlob,
          file.mimeType,
          file.name,
          response.headers.get("content-type")
        );

        if (isPdf) {
          const buffer = await blob.arrayBuffer();
          if (!isPdfBuffer(buffer)) {
            setError("Not a valid PDF.");
            setIsLoaded(true);
            return;
          }
        }

        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch {
        if (!active) return;
        setError("Preview unavailable.");
        setIsLoaded(true);
      }
    };

    loadPreview();

    return () => {
      active = false;
    };
  }, [isVisible, file?.id, file?.previewUrl, file?.mimeType, file?.name, isPdf, isImage]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    void triggerDocumentDownload(file);
  };

  return (
    <div
      ref={cardRef}
      className="group relative flex flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition-all duration-500 hover:border-primary/40 hover:shadow-[0_20px_40px_rgba(15,23,42,0.12)] cursor-pointer"
      onClick={() => onSelect?.(file)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(file);
        }
      }}
    >
      <div className="relative h-56 w-full overflow-hidden bg-slate-50">
        {!isLoaded && (isPdf || isImage) && !error && isVisible && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {error ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-red-50 px-4 text-center">
            <div className="rounded-full bg-red-100 p-4">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-[10px] font-bold text-red-500 leading-tight">{error}</p>
          </div>
        ) : isPdf && blobUrl ? (
          <PdfPreview
            blobUrl={blobUrl}
            previewUrl={file.previewUrl}
            className="pointer-events-none h-full min-h-0"
            title={`Thumbnail of ${file.name}`}
            onReady={() => setIsLoaded(true)}
          />
        ) : isImage && blobUrl ? (
          <img
            src={blobUrl}
            alt={file.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => { setError("Failed to load image"); setIsLoaded(true); }}
            className={cn(
              "h-full w-full object-cover transition-all duration-300 group-hover:scale-105",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="rounded-full bg-slate-100 p-6">
              <FileText className="h-12 w-12 text-slate-300" />
            </div>
          </div>
        )}

        {/* Status Overlay */}
        <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2">
          {file.documentType && (
            <Badge className="bg-white/90 backdrop-blur-md text-slate-900 border-slate-200/50 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 shadow-sm">
              {file.documentType}
            </Badge>
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-end p-4">
           <div className="flex items-center gap-2 text-white">
             <Search className="w-4 h-4" />
             <span className="text-xs font-black uppercase tracking-widest">Inspect File</span>
           </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2 transition-colors group-hover:bg-primary/10">
            <FileText className="h-5 w-5 text-slate-400 transition-colors group-hover:text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-800">{file.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                {getPreviewFormatLabel(file)}
              </span>
              {file.size ? (
                <>
                  <span className="text-[10px] text-slate-300">•</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                    {formatFileSize(file.size)}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        
        {/* Verification indicator and download button */}
        <div className="flex items-center justify-between mt-1 pt-3 border-t border-slate-100">
           <div className="flex items-center gap-1.5 text-emerald-600">
             <CheckCircle2 className="w-3.5 h-3.5" />
             <span className="text-[9px] font-black uppercase tracking-widest">Vault Storage</span>
           </div>
           <Button
             variant="ghost"
             size="icon"
             onClick={handleDownload}
             className="h-8 w-8 rounded-full text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors"
             title="Download file"
           >
             <Download className="w-4 h-4" />
           </Button>
        </div>
      </div>
    </div>
  );
}

export function DocumentPreviewViewer({
  file,
  files,
  showMultipleView = false,
  className,
  emptyStateTitle = "Select a document",
  emptyStateDescription = "Choose a file from the list to inspect it here.",
  onFileSelect,
  onNext,
  onPrevious,
  currentIndex,
}: DocumentPreviewViewerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const { zoomLevel, handleWheelZoom, resetZoom } = useZoomController();
  const [zoomResetSignal, setZoomResetSignal] = useState(0);
  const resetZoomWithSignal = useCallback(() => {
    resetZoom();
    setZoomResetSignal((prev) => prev + 1);
  }, [resetZoom]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFullViewerOpen, setIsFullViewerOpen] = useState(false);
  const { zoomLevel: multiZoomLevel, handleWheelZoom: handleMultiWheelZoom, resetZoom: resetMultiZoom } = useZoomController();
  const [multiZoomResetSignal, setMultiZoomResetSignal] = useState(0);
  const resetMultiZoomWithSignal = useCallback(() => {
    resetMultiZoom();
    setMultiZoomResetSignal((prev) => prev + 1);
  }, [resetMultiZoom]);
  const fileList = files ?? [];
  const filesLength = fileList.length;
  const isMultiMode = showMultipleView && filesLength > 0;

  useEffect(() => {
    let active = true;
    setIsLoaded(false);
    setError(null);
    
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }

    if (!file?.previewUrl) return;

    const loadPreview = async () => {
      try {
        const response = await fetch(file.previewUrl, { credentials: "include" });
        
        if (!active) return;

        if (!response.ok) {
          const status = response.status;
          let message: string;

          if (status === 401) {
            message = "Your session has expired. Please log in again to view this document.";
          } else if (status === 403) {
            message = "You do not have permission to view this document.";
          } else if (status === 404) {
            message = "This document could not be found. It may have been removed.";
          } else if (status === 429) {
            message = "You have viewed too many documents in a short time. Please wait a few minutes and try again.";
          } else if (status >= 500) {
            message = "A server error occurred while loading this document. Please try again.";
          } else {
            message = "Unable to load document preview. Please try downloading the file instead.";
          }

          setError(message);
          setIsLoaded(true);
          return;
        }

        const rawBlob = await response.blob();
        if (!active) return;

        const blob = await blobForDocumentPreview(
          rawBlob,
          file.mimeType,
          file.name,
          response.headers.get("content-type")
        );

        if (isPdfDocument(file)) {
          const buffer = await blob.arrayBuffer();
          if (!isPdfBuffer(buffer)) {
            setError("This file is not a valid PDF.");
            setIsLoaded(true);
            return;
          }
        }

        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (err) {
        if (!active) return;
        setError("Network error or security block prevented loading the preview.");
        setIsLoaded(true);
      }
    };

    loadPreview();

    return () => {
      active = false;
    };
  }, [file?.id, file?.previewUrl, file?.mimeType, file?.name]);

  useEffect(() => {
    resetZoomWithSignal();
  }, [file?.id, resetZoomWithSignal]);

  useEffect(() => {
    if (!isMultiMode) return;
    resetMultiZoomWithSignal();
  }, [isMultiMode, selectedIndex, resetMultiZoomWithSignal]);

  useEffect(() => {
    if (!isMultiMode) return;
    setSelectedIndex((prev) => {
      if (filesLength === 0) return 0;
      return prev < filesLength ? prev : filesLength - 1;
    });
  }, [filesLength, isMultiMode]);

  const selectedFile = isMultiMode ? fileList[selectedIndex] : null;

  // Navigation functions for multi-mode
  const goToPrevious = () => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filesLength - 1));
  };

  const goToNext = () => {
    setSelectedIndex((prev) => (prev < filesLength - 1 ? prev + 1 : 0));
  };

  // --- Multiple View Mode ---
  if (isMultiMode) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-[32px] border border-slate-200 bg-slate-50/50 shadow-inner",
          className
        )}
      >
        {/* Header */}
        <div className="border-b border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-2.5">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                  Institutional Vault
                </p>
                <h3 className="text-lg font-black text-slate-900">Document Inventory</h3>
              </div>
            </div>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 shadow-sm">
              {filesLength} item{filesLength === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>

        {/* Preview Section */}
        <div className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white p-6">
          <div className="space-y-4">
            {/* Selected File Preview */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <ZoomSurface
                className="h-64 w-full bg-slate-100"
                zoomLevel={multiZoomLevel}
                onWheel={(event) => handleMultiWheelZoom(event, selectedFile ? !isImageDocument(selectedFile) : true)}
                onDoubleClick={resetMultiZoomWithSignal}
                resetSignal={multiZoomResetSignal}
                showZoomBadge={!!selectedFile && isImageDocument(selectedFile)}
                verticalAlign={selectedFile && isPdfDocument(selectedFile) ? "start" : "center"}
              >
                {selectedFile ? (
                  <>
                    {isPdfDocument(selectedFile) ? (
                      <PdfPreview
                        blobUrl=""
                        previewUrl={selectedFile.previewUrl}
                        title={`Preview of ${selectedFile.name}`}
                        className="min-h-0"
                      />
                    ) : isImageDocument(selectedFile) ? (
                      <div className="relative h-full w-full group/preview">
                        <img
                          src={selectedFile.previewUrl}
                          alt={selectedFile.name}
                          draggable={false}
                          className="h-full w-full select-none object-contain"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity bg-black/5">
                          <Button
                            variant="secondary"
                            onClick={(e) => { e.stopPropagation(); setIsFullViewerOpen(true); }}
                            className="rounded-full shadow-lg font-bold"
                          >
                            <Search className="w-4 h-4 mr-2" />
                            View Fullscreen
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-3">
                        <FileText className="h-12 w-12 text-slate-300" />
                        <p className="text-sm font-bold text-slate-400">Preview unavailable</p>
                      </div>
                    )}
                  </>
                ) : null}
              </ZoomSurface>

              {/* File Info */}
              <div className="p-4 border-t border-slate-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900">{selectedFile?.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-slate-200 bg-slate-50 text-slate-600">
                        {getPreviewFormatLabel(selectedFile)}
                      </Badge>
                      {selectedFile?.size && (
                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-slate-200 bg-slate-50 text-slate-600">
                          {formatFileSize(selectedFile.size)}
                        </Badge>
                      )}
                      {selectedFile?.documentType && (
                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-emerald-200 bg-emerald-50 text-emerald-700">
                          {selectedFile.documentType}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {selectedFile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-primary/20 text-primary hover:bg-primary/5 font-bold"
                      onClick={() => void triggerDocumentDownload(selectedFile)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center justify-between gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevious}
                className="h-10 rounded-full px-4 font-bold border-slate-200 hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {selectedIndex + 1} of {filesLength}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={goToNext}
                className="h-10 rounded-full px-4 font-bold border-slate-200 hover:bg-slate-100"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>

        {/* Gallery Grid */}
        <div className="overflow-auto p-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {fileList.map((f, index) => (
              <div
                key={f.id}
                onClick={() => { setSelectedIndex(index); onFileSelect?.(f); }}
                className={cn(
                  "cursor-pointer rounded-2xl border-2 transition-all duration-200",
                  selectedIndex === index
                    ? "border-primary bg-primary/5 shadow-lg"
                    : "border-slate-200 bg-white hover:border-primary/40 hover:shadow-md"
                )}
              >
                <MultipleFileCard file={f} onSelect={onFileSelect} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Empty state (no file, or showMultipleView with no files) ---
  if (!file && !isMultiMode) {
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

  if (!file) return null;

  // --- Single View Mode (default) ---
  const isPdf = isPdfDocument(file);
  const isImage = isImageDocument(file);
  const shouldShowLoader = (isPdf || isImage) && !isLoaded && !error;

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

      {error ? (
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-6 p-10 text-center">
          <div className="rounded-full bg-red-100 p-6">
            <FileText className="h-14 w-14 text-red-500" />
          </div>
          <div className="space-y-2">
            <p className="text-xl font-black text-slate-900">Preview Error</p>
            <p className="max-w-md text-sm font-medium text-slate-500">{error}</p>
          </div>
          <Button
            type="button"
            className="h-11 rounded-full bg-primary px-6 font-bold text-white shadow-lg"
            onClick={() => void triggerDocumentDownload(file)}
          >
            <Download className="h-4 w-4" />
            Download Original
          </Button>
        </div>
      ) : isPdf ? (
        <div className="h-full min-h-[420px] w-full overflow-hidden rounded-2xl bg-white">
          {blobUrl ? (
            <PdfPreview
              key={`${file.id}-${blobUrl}`}
              blobUrl={blobUrl}
              previewUrl={file.previewUrl}
              title={`Preview of ${file.name}`}
              onReady={() => setIsLoaded(true)}
            />
          ) : null}
        </div>
      ) : isImage ? (
        <div className="relative h-full min-h-[420px] w-full group/preview">
          <ZoomSurface
            className="h-full min-h-[420px] w-full p-6 sm:p-8"
            zoomLevel={zoomLevel}
            onWheel={(event) => handleWheelZoom(event, false)}
            onDoubleClick={resetZoomWithSignal}
            resetSignal={zoomResetSignal}
            showZoomBadge
          >
            <img
              key={file.id}
              src={blobUrl || undefined}
              alt={file.name}
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={() => setIsLoaded(true)}
              onError={() => setError("Failed to load image.")}
              className={cn(
                "max-h-full max-w-full select-none rounded-2xl object-contain shadow-[0_18px_60px_rgba(15,23,42,0.18)] transition-all duration-300 will-change-transform",
                isLoaded ? "scale-100 opacity-100" : "scale-[0.985] opacity-0"
              )}
            />
          </ZoomSurface>
          {isLoaded && !error && (
            <div className="absolute bottom-6 right-6 opacity-0 group-hover/preview:opacity-100 transition-opacity">
               <Button
                 onClick={() => setIsFullViewerOpen(true)}
                 className="rounded-full shadow-lg font-bold bg-slate-900 text-white hover:bg-slate-800"
               >
                 <Search className="w-4 h-4 mr-2" />
                 High Quality Viewer
               </Button>
            </div>
          )}
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
          <Button
            type="button"
            className="h-11 rounded-full bg-primary px-6 font-bold text-white shadow-lg"
            onClick={() => void triggerDocumentDownload(file)}
          >
            <Download className="h-4 w-4" />
            Download Original
          </Button>
        </div>
      )}

      {/* Fullscreen High-Quality Image Viewer Modal */}
      {(isImage || (isMultiMode && selectedFile && isImageDocument(selectedFile))) && (
        <ImageViewerModal
          isOpen={isFullViewerOpen}
          onClose={() => setIsFullViewerOpen(false)}
          src={isMultiMode ? (selectedFile?.previewUrl || "") : (file.previewUrl || "")}
          title={isMultiMode ? (selectedFile?.name || "") : file.name}
          description={isMultiMode ? selectedFile?.documentType : file.documentType}
          onNext={isMultiMode ? goToNext : onNext}
          onPrevious={isMultiMode ? goToPrevious : onPrevious}
          currentIndex={isMultiMode ? selectedIndex : currentIndex}
          total={isMultiMode ? filesLength : (files?.length || 0)}
        />
      )}
    </div>
  );
}
