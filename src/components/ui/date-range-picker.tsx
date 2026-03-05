"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerWithRangeProps extends React.HTMLAttributes<HTMLDivElement> {
  date: DateRange | undefined
  onDateChange: (date: DateRange | undefined) => void
  label?: string
}

export function DatePickerWithRange({
  className,
  date,
  onDateChange,
  label
}: DatePickerWithRangeProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      {label && (
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
          {label}
        </label>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full md:w-[320px] justify-between text-left font-bold h-12 rounded-xl border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-all",
              !date && "text-muted-foreground"
            )}
          >
            <div className="flex items-center">
              <CalendarIcon className="mr-3 h-4 w-4 text-primary" />
              {date?.from ? (
                date.to ? (
                  <span className="text-slate-900">
                    {format(date.from, "LLL dd")} - {format(date.to, "LLL dd, y")}
                  </span>
                ) : (
                  <span className="text-slate-900">{format(date.from, "LLL dd, y")}</span>
                )
              ) : (
                <span>Pick analysis window</span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl overflow-hidden" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={onDateChange}
            numberOfMonths={2}
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
