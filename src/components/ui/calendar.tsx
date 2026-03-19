"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export type CalendarProps = React.HTMLAttributes<HTMLDivElement> & {
  showOutsideDays?: boolean
  classNames?: Record<string, string>
  components?: Record<string, unknown>
}

function Calendar({ className, children, ...props }: CalendarProps) {
  return (
    <div
      className={cn("rounded-xl border bg-card p-4 text-sm text-muted-foreground", className)}
      {...props}
    >
      {children ?? "Calendar component is not configured in this build."}
    </div>
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
