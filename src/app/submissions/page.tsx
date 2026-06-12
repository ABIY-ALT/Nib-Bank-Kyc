
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
  RotateCcw,
  ShieldAlert,
  Flame,
  Download,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown
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
import { getSubmissions, getSubmissionById, logBundleDownload } from "@/actions/submissions";
import { KYC_STATUS } from "@/lib/kyc-data";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import { format } from "date-fns";
import { sortSubmissionsOldestFirst } from "@/lib/submission-sort";
import JSZip from 'jszip';
import { sanitizeBundleSegment } from "@/lib/bundle-path";
import { resolveDownloadFileName } from "@/lib/documents";
import { cn } from "@/lib/utils";

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
  const [sortField, setSortField] = useState<string>('submittedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isZipping, setIsZipping] = useState<string | null>(null);

  // FILTER SYNCHRONIZATION: dashboard cards redirect here with their active
  // filters (e.g. /submissions?status=SUBMITTED&district=X&branch=Y&from=...&to=...)
  // so the archive shows exactly the records behind the clicked card.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (status) setSelectedStatuses(status.split(',').filter(Boolean));
    const district = params.get('district');
    if (district) setSelectedDistricts(district.split(',').filter(Boolean));
    const branch = params.get('branch');
    if (branch) setSelectedBranches(branch.split(',').filter(Boolean));
    const from = params.get('from');
    const to = params.get('to');
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        const toDate = to ? new Date(to) : undefined;
        setDateRange({ from: fromDate, to: toDate && !isNaN(toDate.getTime()) ? toDate : undefined });
      }
    }
  }, []);

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

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Default oldest-first ordering, overridable by clicking column headers.
  const orderedFilteredSubmissions = useMemo(() => {
    const base = sortSubmissionsOldestFirst(filteredSubmissions || []);
    const valueOf = (s: any): string | number => {
      switch (sortField) {
        case 'id': return (s.id || '').toLowerCase();
        case 'customer': return (s.customerName || '').toLowerCase();
        case 'branch': return (s.branchName || '').toLowerCase();
        case 'district': return (s.districtName || '').toLowerCase();
        case 'status': return s.status || '';
        case 'updatedAt': return s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
        case 'submittedAt':
        default: return s.submittedAt ? new Date(s.submittedAt).getTime() : 0;
      }
    };
    return [...base].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredSubmissions, sortField, sortOrder]);

  const handleDownloadZip = async (sub: any) => {
    setIsZipping(sub.id);
    try {
      const fullSub = await getSubmissionById(sub.id);
      if (!fullSub || !fullSub.documents || fullSub.documents.length === 0) {
        toast({ variant: "destructive", title: "No Documents", description: "This case has no documents available for download." });
        return;
      }
      const zip = new JSZip();
      const folderName = `${sanitizeBundleSegment(sub.id, 'CASE')}_${sanitizeBundleSegment(sub.customerName, 'CUSTOMER')}`;
      const folder = zip.folder(folderName);
      for (const doc of fullSub.documents) {
        try {
          const downloadUrl = doc.downloadUrl || (doc.previewUrl ? `${doc.previewUrl}?download=1` : doc.url);
          const res = await fetch(downloadUrl, { method: 'GET', credentials: 'include' });
          if (!res.ok) throw new Error(`Fetch status: ${res.status}`);
          const buffer = await res.arrayBuffer();
          if (buffer.byteLength === 0) throw new Error("Empty buffer received");
          folder?.file(resolveDownloadFileName(doc.name, doc.originalName, doc.mimeType), buffer, { binary: true });
        } catch (err) {
          console.error(`Archive ZIP extraction failed for ${doc.name}:`, err);
        }
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      await logBundleDownload({ submissionId: sub.id, bundleName: folderName });
      toast({ title: "ZIP Downloaded", description: `${fullSub.documents.length} document(s) bundled.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Download Failed", description: "Could not assemble the case ZIP bundle." });
    } finally {
      setIsZipping(null);
    }
  };

  const SortIndicator = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 ml-1 inline-block text-slate-300" />;
    return sortOrder === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 inline-block text-primary" />
      : <ArrowDown className="w-3 h-3 ml-1 inline-block text-primary" />;
  };

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
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {status === KYC_STATUS.APPROVED && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold px-3 py-1">Authorized</Badge>}
          {(status === KYC_STATUS.SUBMITTED || status === KYC_STATUS.IN_REVIEW) && <Badge variant="outline" className="text-slate-500 font-bold px-3 py-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Analysis</Badge>}
          {status === KYC_STATUS.ACTION_REQUIRED && <Badge className="bg-orange-100 text-orange-800 border-orange-200 font-bold px-3 py-1">Returned</Badge>}
          {status === KYC_STATUS.REJECTED && <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 font-bold px-3 py-1">Risk Rejected</Badge>}
          {status === KYC_STATUS.ESCALATED && <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-bold px-3 py-1">Escalated</Badge>}
          {![KYC_STATUS.APPROVED, KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW, KYC_STATUS.ACTION_REQUIRED, KYC_STATUS.REJECTED, KYC_STATUS.ESCALATED].includes(status) && <Badge variant="secondary" className="font-bold px-3 py-1">{status}</Badge>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sub.isUrgent && (
            <Badge variant="outline" className="font-black px-2 py-0.5 uppercase text-[8px] tracking-widest border-red-200 bg-red-50 text-red-700">
              <Flame className="w-2.5 h-2.5 mr-1" /> Urgent
            </Badge>
          )}
          {sub.status === KYC_STATUS.ESCALATED && (
            <Badge className="border-purple-200 bg-purple-100 text-purple-700 shadow-none font-black text-[8px] uppercase tracking-widest px-2 py-0.5 flex items-center gap-1">
              <ShieldAlert className="w-2.5 h-2.5" />
              Escalated
            </Badge>
          )}
        </div>
      </div>
    );
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
              <TableHead className={cn("font-bold w-[120px] py-4 cursor-pointer select-none", sortField === 'id' ? "text-primary" : "text-slate-600")} onClick={() => toggleSort('id')}>
                Case ID<SortIndicator field="id" />
              </TableHead>
              <TableHead className={cn("font-bold cursor-pointer select-none", sortField === 'customer' ? "text-primary" : "text-slate-600")} onClick={() => toggleSort('customer')}>
                Customer Details<SortIndicator field="customer" />
              </TableHead>
              <TableHead
                className={cn("font-bold cursor-pointer select-none", ['branch', 'district'].includes(sortField) ? "text-primary" : "text-slate-600")}
                onClick={() => {
                  // Cycle: branch asc -> branch desc -> district asc -> district desc -> branch asc
                  if (sortField === 'branch' && sortOrder === 'asc') setSortOrder('desc');
                  else if (sortField === 'branch') { setSortField('district'); setSortOrder('asc'); }
                  else if (sortField === 'district' && sortOrder === 'asc') setSortOrder('desc');
                  else { setSortField('branch'); setSortOrder('asc'); }
                }}
              >
                District & Branch
                {sortField === 'district' && <span className="text-[9px] uppercase ml-1">(District)</span>}
                {sortField === 'branch' && <span className="text-[9px] uppercase ml-1">(Branch)</span>}
                <SortIndicator field={['branch', 'district'].includes(sortField) ? sortField : 'branch'} />
              </TableHead>
              <TableHead className={cn("font-bold cursor-pointer select-none", sortField === 'status' ? "text-primary" : "text-slate-600")} onClick={() => toggleSort('status')}>
                Workflow Status<SortIndicator field="status" />
              </TableHead>
              <TableHead className={cn("font-bold cursor-pointer select-none", sortField === 'submittedAt' ? "text-primary" : "text-slate-600")} onClick={() => toggleSort('submittedAt')}>
                Submitted On<SortIndicator field="submittedAt" />
              </TableHead>
              <TableHead className={cn("font-bold cursor-pointer select-none", sortField === 'updatedAt' ? "text-primary" : "text-slate-600")} onClick={() => toggleSort('updatedAt')}>
                Updated On<SortIndicator field="updatedAt" />
              </TableHead>
              <TableHead className="text-right font-bold text-slate-600 pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-20"><Loader2 className="animate-spin inline-block w-6 h-6 text-primary" /></TableCell></TableRow>
            ) : orderedFilteredSubmissions.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-20">No records found matching your selection.</TableCell></TableRow>
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
                <TableCell className="text-slate-500 font-medium text-xs">{sub.updatedAt ? format(new Date(sub.updatedAt), 'MMM dd, yyyy') : 'N/A'}</TableCell>
                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownloadZip(sub)}
                      disabled={isZipping === sub.id}
                      className="rounded-full text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                      title="Download all case documents (ZIP)"
                    >
                      {isZipping === sub.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" asChild className="rounded-full text-primary"><Link href={`/submissions/${sub.id}`}><Eye className="h-4 w-4" /></Link></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
