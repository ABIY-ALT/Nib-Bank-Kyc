'use client';

import * as React from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isWithinInterval, 
  isBefore, 
  isAfter,
  getYear,
  getMonth,
  setMonth,
  setYear,
  startOfToday,
  isValid
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ChevronDown, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// --- Types ---
export interface DateRange {
  from: Date | undefined;
  to?: Date | undefined;
}

interface DateRangePickerProps {
  date: DateRange | undefined;
  onDateChange: (date: DateRange | undefined) => void;
  className?: string;
  label?: string;
}

// --- Sub-Components ---

const MonthDropdown = ({ value, onChange }: { value: number; onChange: (m: number) => void }) => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return (
    <div className="relative group">
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="h-10 appearance-none bg-card border rounded-lg px-3 pr-8 text-[11px] font-black uppercase tracking-widest text-foreground cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
      >
        {months.map((m, i) => (
          <option key={m} value={i}>{m}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none group-hover:text-primary" />
    </div>
  );
};

const YearDropdown = ({ value, onChange }: { value: number; onChange: (y: number) => void }) => {
  const currentYear = getYear(new Date());
  const years = Array.from({ length: 31 }, (_, i) => currentYear - 15 + i);
  return (
    <div className="relative group">
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="h-10 appearance-none bg-card border rounded-lg px-3 pr-8 text-[11px] font-black tracking-widest text-foreground cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none group-hover:text-primary" />
    </div>
  );
};

const DayCell = ({ 
  day, 
  currentMonth, 
  selectedFrom, 
  selectedTo, 
  hoverDate,
  onClick,
  onMouseEnter 
}: { 
  day: Date; 
  currentMonth: Date; 
  selectedFrom?: Date; 
  selectedTo?: Date; 
  hoverDate: Date | null;
  onClick: (d: Date) => void;
  onMouseEnter: (d: Date) => void;
}) => {
  const isDayInCurrentMonth = isSameMonth(day, currentMonth);
  const isToday = isSameDay(day, startOfToday());
  const isSelectedFrom = selectedFrom && isSameDay(day, selectedFrom);
  const isSelectedTo = selectedTo && isSameDay(day, selectedTo);
  
  let isInRange = false;
  if (selectedFrom && selectedTo) {
    isInRange = isWithinInterval(day, { start: selectedFrom, end: selectedTo });
  } else if (selectedFrom && hoverDate) {
    const range = isBefore(hoverDate, selectedFrom) 
      ? { start: hoverDate, end: selectedFrom } 
      : { start: selectedFrom, end: hoverDate };
    isInRange = isWithinInterval(day, range);
  }

  return (
    <button
      type="button"
      disabled={!isDayInCurrentMonth}
      onClick={() => onClick(day)}
      onMouseEnter={() => onMouseEnter(day)}
      className={cn(
        "h-9 w-full relative flex items-center justify-center text-sm transition-all duration-200 rounded-lg",
        !isDayInCurrentMonth && "text-muted pointer-events-none opacity-0",
        isDayInCurrentMonth && !isSelectedFrom && !isSelectedTo && !isInRange && "text-muted-foreground hover:bg-muted",
        isToday && !isSelectedFrom && !isSelectedTo && "bg-muted font-bold border",
        isInRange && !isSelectedFrom && !isSelectedTo && "bg-[#a36224]/10 text-[#a36224] font-semibold rounded-none",
        isSelectedFrom && "bg-[#a36224] text-white font-bold shadow-lg z-10 scale-110",
        isSelectedTo && "bg-[#a36224] text-white font-bold shadow-lg z-10 scale-110",
        isInRange && isSelectedFrom && selectedTo && "rounded-r-none",
        isInRange && isSelectedTo && "rounded-l-none"
      )}
    >
      <span className="relative z-20">{format(day, 'd')}</span>
    </button>
  );
};

const CustomCalendar = ({ 
  monthDate, 
  setMonthDate, 
  selectedDate, 
  onSelect,
  hoverDate,
  setHoverDate,
  isLeft = true
}: { 
  monthDate: Date; 
  setMonthDate: (d: Date) => void; 
  selectedDate: DateRange | undefined;
  onSelect: (d: Date) => void;
  hoverDate: Date | null;
  setHoverDate: (d: Date | null) => void;
  isLeft?: boolean;
}) => {
  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate));
    const end = endOfWeek(endOfMonth(monthDate));
    return eachDayOfInterval({ start, end });
  }, [monthDate]);

  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div className={cn("w-[280px] py-4", isLeft ? "pl-14 pr-4" : "pl-4 pr-14")}>
      <div className="flex min-h-10 items-center justify-center gap-2 mb-6">
        <div className="flex items-center justify-center gap-2">
          <MonthDropdown 
            value={getMonth(monthDate)} 
            onChange={(m) => setMonthDate(setMonth(monthDate, m))} 
          />
          <YearDropdown 
            value={getYear(monthDate)} 
            onChange={(y) => setMonthDate(setYear(monthDate, y))} 
          />
        </div>
      </div>

      <div className="grid grid-cols-7 mb-3">
        {weekdays.map(d => (
          <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day, i) => (
          <DayCell 
            key={i} 
            day={day} 
            currentMonth={monthDate} 
            selectedFrom={selectedDate?.from}
            selectedTo={selectedDate?.to}
            hoverDate={hoverDate}
            onClick={onSelect}
            onMouseEnter={setHoverDate}
          />
        ))}
      </div>
    </div>
  );
};

export function DatePickerWithRange({
  className,
  date,
  onDateChange,
  label
}: DateRangePickerProps) {
  const [leftMonth, setLeftMonth] = React.useState<Date>(date?.from || startOfMonth(new Date()));
  const [rightMonth, setRightMonth] = React.useState<Date>(addMonths(leftMonth, 1));
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null);

  const handleSetLeftMonth = (d: Date) => {
    setLeftMonth(d);
    setRightMonth(addMonths(d, 1));
  };

  const handleSetRightMonth = (d: Date) => {
    setRightMonth(d);
    setLeftMonth(subMonths(d, 1));
  };

  const handleSelect = (day: Date) => {
    if (!date?.from || (date.from && date.to)) {
      onDateChange({ from: day, to: undefined });
    } else {
      if (isBefore(day, date.from)) {
        onDateChange({ from: day, to: date.from });
      } else {
        onDateChange({ from: date.from, to: day });
      }
    }
  };

  const resetSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateChange(undefined);
    setHoverDate(null);
  };

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
            <div className="flex items-center gap-3">
              <CalendarIcon className="h-4 w-4 text-primary" />
              {date?.from ? (
                date.to ? (
                  <span className="text-slate-900 truncate">
                    {format(date.from, "LLL dd")} - {format(date.to, "LLL dd, y")}
                  </span>
                ) : (
                  <span className="text-slate-900">{format(date.from, "LLL dd, y")}</span>
                )
              ) : (
                <span className="text-slate-400 font-medium">Date Filter</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {date?.from && (
                <div 
                  onClick={resetSelection}
                  className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-destructive transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                </div>
              )}
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white" align="start">
          <div className="flex flex-col md:flex-row divide-x divide-slate-100 p-2">
            <div className="relative flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 z-30 h-10 w-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-0 text-slate-400 shadow-sm hover:bg-slate-50 hover:text-primary"
                onClick={() => handleSetLeftMonth(subMonths(leftMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CustomCalendar 
                monthDate={leftMonth} 
                setMonthDate={handleSetLeftMonth}
                selectedDate={date}
                onSelect={handleSelect}
                hoverDate={hoverDate}
                setHoverDate={setHoverDate}
                isLeft={true}
              />
            </div>
            <div className="relative flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 z-30 h-10 w-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-0 text-slate-400 shadow-sm hover:bg-slate-50 hover:text-primary"
                onClick={() => handleSetRightMonth(addMonths(rightMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <CustomCalendar 
                monthDate={rightMonth} 
                setMonthDate={handleSetRightMonth}
                selectedDate={date}
                onSelect={handleSelect}
                hoverDate={hoverDate}
                setHoverDate={setHoverDate}
                isLeft={false}
              />
            </div>
          </div>
          <div className="bg-slate-50 border-t p-4 flex items-center justify-end">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[10px] font-black uppercase text-slate-500"
              onClick={() => onDateChange(undefined)}
            >
              Clear Selections
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
