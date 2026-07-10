
import { Button } from "./button";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  // When provided, renders a "Showing X–Y of Z records" summary so the reader
  // can see how many records the whole (sorted/filtered) set contains, not just
  // the visible page.
  totalItems?: number;
  pageSize?: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  totalItems,
  pageSize,
}: PaginationProps) {
  const pages = [];

  // Generate page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  const showSummary = typeof totalItems === "number" && typeof pageSize === "number" && totalItems > 0;
  const rangeStart = showSummary ? (currentPage - 1) * pageSize! + 1 : 0;
  const rangeEnd = showSummary ? Math.min(currentPage * pageSize!, totalItems!) : 0;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {showSummary && (
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Showing {rangeStart}&ndash;{rangeEnd} of {totalItems} records &bull; Page {currentPage} of {totalPages}
        </p>
      )}
      <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="h-10 w-10"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      {pages.map((page, index) => (
        <Button
          key={index}
          variant={page === currentPage ? "default" : "outline"}
          size="icon"
          onClick={() => typeof page === "number" && onPageChange(page)}
          disabled={page === "..."}
          className="h-10 w-10"
        >
          {page === "..." ? <MoreHorizontal className="h-4 w-4" /> : page}
        </Button>
      ))}
      
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="h-10 w-10"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      </div>
    </div>
  );
}
