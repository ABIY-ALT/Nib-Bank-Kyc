import { PreviewableDocument } from '@/components/submissions/document-preview';

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
  return file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isImageDocument(file: PreviewableDocument | null | undefined) {
  if (!file) return false;
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
  return !!file.mimeType?.startsWith("image/") || imageExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
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
