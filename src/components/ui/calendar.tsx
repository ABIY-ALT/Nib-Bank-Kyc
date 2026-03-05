
"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, CaptionLabelProps } from "react-day-picker"
import { format, isValid } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-0 bg-white", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-0 sm:space-y-0 divide-x divide-slate-100",
        month: "space-y-6 p-6 w-[320px]",
        month_caption: "flex justify-center pt-1 relative items-center mb-6",
        caption_label: "hidden", // We use custom CaptionLabel component
        nav: "flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 bg-transparent p-0 text-slate-400 hover:text-slate-900 transition-colors absolute left-0 z-10"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 bg-transparent p-0 text-slate-400 hover:text-slate-900 transition-colors absolute right-0 z-10"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex w-full mb-4",
        weekday: "text-slate-400 rounded-md w-10 font-bold text-[10px] uppercase tracking-wider text-center",
        week: "flex w-full mt-2",
        day: "h-10 w-10 p-0 font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all flex items-center justify-center cursor-pointer",
        selected: "bg-[#a36224] text-white hover:bg-[#8a521e] focus:bg-[#a36224] focus:text-white rounded-xl shadow-lg font-bold",
        today: "bg-slate-100 text-slate-900",
        outside: "text-slate-300 opacity-50",
        disabled: "text-slate-300 opacity-50",
        range_start: "range-start rounded-r-none",
        range_end: "range-end rounded-l-none",
        range_middle: "bg-slate-50 text-[#a36224] font-bold rounded-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-5 w-5", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-5 w-5", className)} {...props} />
        ),
        CaptionLabel: ({ displayMonth }: CaptionLabelProps) => {
          // Robust check to prevent RangeError: Invalid time value
          if (!displayMonth || !isValid(displayMonth)) {
            return <div className="h-8" />; // Placeholder to maintain layout
          }
          
          return (
            <div className="flex gap-2">
              <span className="font-bold text-slate-800 border border-slate-200 px-4 py-1.5 rounded-lg bg-white shadow-sm text-[11px] uppercase tracking-widest">
                {format(displayMonth, "MMMM")}
              </span>
              <span className="font-bold text-slate-800 border border-slate-200 px-4 py-1.5 rounded-lg bg-white shadow-sm text-[11px] tracking-widest">
                {format(displayMonth, "yyyy")}
              </span>
            </div>
          );
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
