export interface PreviewableDocument {
  id: string;
  name: string;
  previewUrl: string;
  downloadUrl?: string;
  originalName?: string;
  mimeType?: string;
  documentType?: string;
  size?: number;
  status?: string;
}

const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
};

/** Filename for saving to disk (prefers original upload name with extension). */
export function resolveDownloadFileName(
  displayName?: string | null,
  originalName?: string | null,
  mimeType?: string | null
): string {
  if (originalName?.trim()) return originalName.trim();

  const base = (displayName?.trim() || 'document').replace(/[/\\]/g, '_');
  const mime = resolvePreviewMimeType(mimeType, base);
  const ext = mime ? MIME_TO_EXTENSION[mime] : undefined;

  if (!ext) return base;
  const lower = base.toLowerCase();
  if (lower.endsWith(ext)) return base;
  return `${base}${ext}`;
}

export function getDocumentDownloadUrl(file: Pick<PreviewableDocument, 'downloadUrl' | 'previewUrl'>): string {
  return file.downloadUrl || `${file.previewUrl}?download=1`;
}

/** Fetch an authenticated memo and save it locally (works when <a download> is ignored). */
export async function downloadDocumentFile(
  downloadUrl: string,
  filename: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(downloadUrl, { credentials: 'include' });
    if (!response.ok) {
      return { ok: false, error: `Download failed (${response.status})` };
    }

    const rawBlob = await response.blob();
    const blob = await blobForDocumentPreview(rawBlob, undefined, filename, response.headers.get('content-type'));
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Download failed. Please try again.' };
  }
}

/** Magic-byte keys stored on older memos (e.g. "jpg") mapped to HTTP MIME types. */const FILE_TYPE_KEY_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
};

function inferMimeFromFilename(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();

  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tiff') || lower.endsWith('.tif')) return 'image/tiff';

  return undefined;
}

/** Preview-only MIME normalization; does not affect upload or storage security. */
export function resolvePreviewMimeType(
  storedMime?: string | null,
  ...filenames: (string | null | undefined)[]
): string | undefined {
  const trimmed = storedMime?.trim();
  if (trimmed) {
    const lower = trimmed.toLowerCase().split(';')[0].trim();
    if (lower.includes('/')) {
      if (lower.startsWith('image/') || lower === 'application/pdf') return lower;
    } else if (FILE_TYPE_KEY_TO_MIME[lower]) {
      return FILE_TYPE_KEY_TO_MIME[lower];
    }
  }

  for (const name of filenames) {
    const inferred = inferMimeFromFilename(name);
    if (inferred) return inferred;
  }

  return undefined;
}

function resolvedMime(file: PreviewableDocument | null | undefined) {
  if (!file) return undefined;
  return resolvePreviewMimeType(file.mimeType, file.name);
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

export function isPdfDocument(file: PreviewableDocument | null | undefined) {
  if (!file) return false;
  const mime = resolvedMime(file);
  return mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isImageDocument(file: PreviewableDocument | null | undefined) {
  if (!file) return false;
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"];
  const mime = resolvedMime(file);
  return !!mime?.startsWith("image/") || imageExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
}

export function isPdfBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const header = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  return header === "%PDF";
}

/** Ensures fetched blobs use a browser-renderable MIME (e.g. application/pdf, not "pdf"). */
export async function blobForDocumentPreview(
  rawBlob: Blob,
  mimeType?: string | null,
  ...filenames: (string | null | undefined)[]
): Promise<Blob> {
  const previewMime = resolvePreviewMimeType(
    mimeType,
    ...filenames,
    rawBlob.type?.split(';')[0]
  );
  if (!previewMime || rawBlob.type === previewMime) return rawBlob;
  const buffer = await rawBlob.arrayBuffer();
  return new Blob([buffer], { type: previewMime });
}

export function getPreviewFormatLabel(file: PreviewableDocument | null | undefined) {
  if (!file) return "Document";
  if (isPdfDocument(file)) return "PDF";
  if (isImageDocument(file)) return "Image";

  const mime = resolvedMime(file);
  if (!mime) return "Document";
  const [type, subtype] = mime.split("/");
  const normalizedType = type ? type[0].toUpperCase() + type.slice(1) : "Document";
  return subtype ? `${normalizedType} / ${subtype.toUpperCase()}` : normalizedType;
}
