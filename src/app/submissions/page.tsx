
"use client"

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
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
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getSubmissions } from "@/actions/submissions";
import { KYC_STATUS } from "@/lib/kyc-data";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import { format } from "date-fns";
import { sortSubmissionsOldestFirst } from "@/lib/submission-sort";

const STATUS_OPTIONS = [
  { id: KYC_STATUS.APPROVED, label: 'Authorized' },
  { id: KYC_STATUS.SUBMITTED, label: 'Submitted' },
  { id: KYC_STATUS.IN_REVIEW, label: 'In Review' },
  { id: KYC_STATUS.ACTION_REQUIRED, label: 'Returned' },
  { id: KYC_STATUS.ESCALATED, label: 'Escalated' },
  { id: KYC_STATUS.REJECTED, label: 'Rejected' }
];

export default function CaseArchivePage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    loadArchive();
  }, [dateRange]);

  const loadArchive = async () => {
    setLoading(true);
    try {
      let filters: any = { limit: 1000 };
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }
      // Non-superadmin users only see submissions from their assigned branches
      if (!isSuperAdmin && user) {
        if (user.assignedBranches && user.assignedBranches.length > 0) {
          filters.branches = user.assignedBranches;
        } else if (user.branchName) {
          filters.branch = user.branchName;
        }
      }
      const data = await getSubmissions(filters);
      setSubmissions(data || []);
    } catch (error) {
      toast({ variant: "destructive", title: "Archive Error", description: "Could not retrieve archive records." });
    } finally {
      setLoading(false);
    }
  };

  const districts = useMemo(() => {
    if (!submissions) return [];
    return Array.from(new Set(submissions.map(s => s.districtName).filter(Boolean))).sort() as string[];
  }, [submissions]);

  const branches = useMemo(() => {
    if (!submissions) return [];
    let relevantSubmissions = submissions;
    if (selectedDistricts.length > 0) {
      relevantSubmissions = submissions.filter(s => selectedDistricts.includes(s.districtName));
    }
    return Array.from(new Set(relevantSubmissions.map(s => s.branchName || "Unknown"))).sort();
  }, [submissions, selectedDistricts]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    
    return submissions.filter(s => {
      const matchesSearch = s.customerName.toLowerCase().includes(term) ||
                          s.id.toLowerCase().includes(term) ||
                          (s.branchName || "").toLowerCase().includes(term) ||
                          (s.districtName || "").toLowerCase().includes(term);
      
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(s.status);
      const matchesDistrict = selectedDistricts.length === 0 || selectedDistricts.includes(s.districtName);
      const matchesBranch = selectedBranches.length === 0 || selectedBranches.includes(s.branchName);
      
      return matchesSearch && matchesStatus && matchesDistrict && matchesBranch;
    });
  }, [submissions, searchTerm, selectedStatuses, selectedDistricts, selectedBranches]);

  // Ensure oldest-first ordering (first submitted at top)
  const orderedFilteredSubmissions = useMemo(() => {
    return sortSubmissionsOldestFirst(filteredSubmissions || []);
  }, [filteredSubmissions]);

  const handleExportCSV = () => {
    if (filteredSubmissions.length === 0) return;
    const headers = ['Case ID', 'Customer', 'Branch', 'Status', 'Submitted At'];
    const rows = filteredSubmissions.map(s => [s.id, s.customerName, s.branchName, s.status, new Date(s.submittedAt).toLocaleDateString()]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-kyc-archive-export.csv`);
    link.click();
    toast({ title: "Archive Exported" });
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };

  const toggleBranch = (branch: string) => {
    setSelectedBranches(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]);
  };

  const toggleDistrict = (district: string) => {
    setSelectedDistricts(prev => prev.includes(district) ? prev.filter(d => d !== district) : [...prev, district]);
    setSelectedBranches([]); // Clear selected branches when district selection changes
  };

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedDistricts([]);
    setSelectedBranches([]);
    setSearchTerm("");
    setDateRange(undefined);
  };

  const getStatusBadge = (sub: any) => {
    const status = sub.status;
    switch (status) {
      case KYC_STATUS.APPROVED: return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold px-3 py-1">Authorized</Badge>;
      case KYC_STATUS.SUBMITTED: 
      case KYC_STATUS.IN_REVIEW: return <Badge variant="outline" className="text-slate-500 font-bold px-3 py-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Analysis</Badge>;
      case KYC_STATUS.ACTION_REQUIRED: return <Badge className="bg-orange-100 text-orange-800 border-orange-200 font-bold px-3 py-1">Returned</Badge>;
      case KYC_STATUS.REJECTED: return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 font-bold px-3 py-1">Risk Rejected</Badge>;
      case KYC_STATUS.ESCALATED: return <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-bold px-3 py-1">Escalated</Badge>;
      default: return <Badge variant="secondary" className="font-bold px-3 py-1">{status}</Badge>;
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
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange} 
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-12 px-4 border-slate-200 bg-white font-medium shadow-sm">
                <Filter className="w-4 h-4 text-slate-400" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl shadow-2xl">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Institutional Filter</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Workflow Status</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {STATUS_OPTIONS.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status.id}
                      checked={selectedStatuses.includes(status.id)}
                      onCheckedChange={() => toggleStatus(status.id)}
                    >
                      {status.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>District Name</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56 max-h-64 overflow-y-auto">
                  {districts.map((district) => (
                    <DropdownMenuCheckboxItem
                      key={district}
                      checked={selectedDistricts.includes(district)}
                      onCheckedChange={() => toggleDistrict(district)}
                    >
                      {district}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Branch Name</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56 max-h-64 overflow-y-auto">
                  {branches.map((branch) => (
                    <DropdownMenuCheckboxItem
                      key={branch}
                      checked={selectedBranches.includes(branch)}
                      onCheckedChange={() => toggleBranch(branch)}
                    >
                      {branch}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resetFilters} className="text-destructive font-bold">Reset All Filters</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="gap-2 h-12 px-6 bg-primary hover:bg-primary/90 text-white font-bold" onClick={handleExportCSV}>
            <FileDown className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search archive by name, ID or branch..." className="pl-11 h-12 rounded-xl border-slate-200 bg-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-xl bg-card overflow-hidden shadow-xl border-slate-200 bg-white">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold text-slate-600 w-[120px] py-4">Case ID</TableHead>
              <TableHead className="font-bold text-slate-600">Customer Details</TableHead>
              <TableHead className="font-bold text-slate-600">District & Branch</TableHead>
              <TableHead className="font-bold text-slate-600">Workflow Status</TableHead>
              <TableHead className="font-bold text-slate-600">Submitted On</TableHead>
              <TableHead className="text-right font-bold text-slate-600 pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-20"><Loader2 className="animate-spin inline-block w-6 h-6 text-primary" /></TableCell></TableRow>
            ) : orderedFilteredSubmissions.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-20">No records found matching your selection.</TableCell></TableRow>
            ) : orderedFilteredSubmissions.map((sub) => (
              <TableRow key={sub.id} className="group hover:bg-slate-50">
                <TableCell className="font-bold text-primary py-4">{sub.id}</TableCell>
                <TableCell><div className="flex flex-col"><span className="font-bold text-slate-900 leading-tight">{sub.customerName}</span><span className="text-[10px] text-muted-foreground uppercase">{sub.entityType || 'Individual'}</span></div></TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900 leading-tight">{sub.branchName}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{sub.districtName || 'No District'}</span>
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(sub)}</TableCell>
                <TableCell className="text-slate-500 font-medium text-xs">{sub.submittedAt ? format(new Date(sub.submittedAt), 'MMM dd, yyyy') : 'N/A'}</TableCell>
                <TableCell className="text-right pr-8"><Button variant="ghost" size="icon" asChild className="rounded-full text-primary"><Link href={`/submissions/${sub.id}`}><Eye className="h-4 w-4" /></Link></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
