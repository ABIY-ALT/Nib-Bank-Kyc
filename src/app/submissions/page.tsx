
"use client"

import { useState, useEffect, useMemo } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Filter, 
  Eye,
  FileDown,
  Archive,
  Clock,
  Calendar as CalendarIcon,
  Loader2,
  RotateCcw
} from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { subDays, format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getSubmissions } from "@/actions/submissions";
import { KYCStatus } from "@prisma/client";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";

const STATUS_OPTIONS = [
  { id: KYCStatus.APPROVED, label: 'Approved' },
  { id: KYCStatus.SUBMITTED, label: 'Submitted' },
  { id: KYCStatus.IN_REVIEW, label: 'In Review' },
  { id: KYCStatus.ACTION_REQUIRED, label: 'Action Required' },
  { id: KYCStatus.ESCALATED, label: 'Escalated' },
  { id: KYCStatus.REJECTED, label: 'Rejected' }
];

export default function CaseArchivePage() {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  useEffect(() => {
    loadArchive();
  }, [dateRange]);

  const loadArchive = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    try {
      const data = await getSubmissions({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd')
      });
      setSubmissions(data);
    } catch (error) {
      console.error("Archive load failed:", error);
      toast({ variant: "destructive", title: "Archive Error", description: "Could not retrieve archive records." });
    } finally {
      setLoading(false);
    }
  };

  const branches = useMemo(() => {
    if (!submissions) return [];
    return Array.from(new Set(submissions.map(s => s.branchName || "Unknown"))).sort();
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    
    return submissions.filter(s => {
      const matchesSearch = s.customerName.toLowerCase().includes(term) ||
                          s.id.toLowerCase().includes(term) ||
                          (s.branchName || "").toLowerCase().includes(term);
      
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(s.status);
      const matchesBranch = selectedBranches.length === 0 || selectedBranches.includes(s.branchName);
      
      return matchesSearch && matchesStatus && matchesBranch;
    });
  }, [submissions, searchTerm, selectedStatuses, selectedBranches]);

  const handleExportCSV = () => {
    if (filteredSubmissions.length === 0) return;
    
    const headers = ['Case ID', 'Customer', 'Branch', 'Status', 'Submitted At'];
    const rows = filteredSubmissions.map(s => [
      s.id,
      s.customerName,
      s.branchName,
      s.status,
      new Date(s.submittedAt).toLocaleDateString()
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-kyc-archive-export.csv`);
    link.click();
    
    toast({
      title: "Archive Exported",
      description: `Master list of ${filteredSubmissions.length} records saved to CSV.`,
    });
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleBranch = (branch: string) => {
    setSelectedBranches(prev => 
      prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]
    );
  };

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedBranches([]);
    setSearchTerm("");
    setDateRange({ from: subDays(new Date(), 30), to: new Date() });
  };

  const getStatusBadge = (sub: any) => {
    const status = sub.status as KYCStatus;
    switch (status) {
      case KYCStatus.APPROVED: 
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-bold px-3 py-1">Authorized</Badge>;
      case KYCStatus.SUBMITTED: 
      case KYCStatus.IN_REVIEW:
        return <Badge variant="outline" className="text-slate-500 font-bold px-3 py-1 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Analysis
        </Badge>;
      case KYCStatus.ACTION_REQUIRED: 
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100 font-bold px-3 py-1">Returned</Badge>;
      case KYCStatus.REJECTED: 
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 font-bold px-3 py-1">Risk Rejected</Badge>;
      case KYCStatus.ESCALATED: 
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100 font-bold px-3 py-1">Escalated</Badge>;
      default: 
        return <Badge variant="secondary" className="font-bold px-3 py-1">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-lg shadow-lg">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Case Archive</h1>
            <p className="text-muted-foreground text-lg font-medium">Historical directory of all network submissions.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-10 px-4 border-slate-200 bg-white font-medium shadow-sm hover:bg-slate-50">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter
                {(selectedStatuses.length > 0 || selectedBranches.length > 0) && (
                  <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold">
                    {selectedStatuses.length + selectedBranches.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Institutional Filter</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer py-3">
                  <span>Workflow Status</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {STATUS_OPTIONS.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status.id}
                      checked={selectedStatuses.includes(status.id)}
                      onCheckedChange={() => toggleStatus(status.id)}
                      className="cursor-pointer py-2.5"
                    >
                      {status.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer py-3">
                  <span>Branch Name</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56 max-h-64 overflow-y-auto">
                  {branches.map((branch) => (
                    <DropdownMenuCheckboxItem
                      key={branch}
                      checked={selectedBranches.includes(branch)}
                      onCheckedChange={() => toggleBranch(branch)}
                      className="cursor-pointer py-2.5"
                    >
                      {branch}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resetFilters} className="text-destructive font-bold cursor-pointer py-3">
                Reset All Filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            className="gap-2 h-10 px-6 bg-primary hover:bg-primary/90 text-white font-bold shadow-sm rounded-md transition-all active:scale-95" 
            onClick={handleExportCSV}
          >
            <FileDown className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-end gap-6">
            <div className="flex-1 w-full">
              <DatePickerWithRange 
                date={dateRange} 
                onDateChange={setDateRange} 
                label="Archive Analysis window" 
              />
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search archive..." 
                className="pl-11 h-12 rounded-xl border-slate-200 bg-white" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-xl bg-card overflow-hidden shadow-xl border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold text-slate-600 w-[120px] py-4">Case ID</TableHead>
              <TableHead className="font-bold text-slate-600">Customer Details</TableHead>
              <TableHead className="font-bold text-slate-600">Branch Name</TableHead>
              <TableHead className="font-bold text-slate-600">Workflow Status</TableHead>
              <TableHead className="font-bold text-slate-600">Submitted On</TableHead>
              <TableHead className="text-right font-bold text-slate-600 pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                  <Loader2 className="animate-spin inline-block w-6 h-6 text-primary mb-2" />
                  <p className="font-bold">Syncing archive...</p>
                </TableCell>
              </TableRow>
            ) : filteredSubmissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                  <Archive className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                  <p className="font-bold text-slate-900">No records found matching your selection.</p>
                  <Button variant="link" onClick={resetFilters} className="text-primary font-bold mt-2">Reset Filters</Button>
                </TableCell>
              </TableRow>
            ) : filteredSubmissions.map((sub) => (
              <TableRow key={sub.id} className="group hover:bg-slate-50 transition-colors">
                <TableCell className="font-bold text-primary tabular-nums py-4">{sub.id}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900 leading-tight">{sub.customerName}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{sub.entityType || 'Individual'}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium text-slate-600">{sub.branchName}</TableCell>
                <TableCell>{getStatusBadge(sub)}</TableCell>
                <TableCell className="text-slate-500 font-medium tabular-nums text-xs">
                  {new Date(sub.submittedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </TableCell>
                <TableCell className="text-right pr-8">
                  <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/5 text-primary">
                    <Link href={`/submissions/${sub.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
