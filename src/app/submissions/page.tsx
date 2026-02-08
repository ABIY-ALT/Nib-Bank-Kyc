
"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
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
  Calendar as CalendarIcon
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
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { useToast } from "@/hooks/use-toast";

const STATUS_OPTIONS = [
  { id: 'Approved', label: 'Approved' },
  { id: 'Pending', label: 'Pending' },
  { id: 'In Review', label: 'In Review' },
  { id: 'Amended', label: 'Action Required' },
  { id: 'Escalated', label: 'Escalated' },
  { id: 'Rejected', label: 'Rejected' }
];

export default function SubmissionsPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [timeHorizon, setTimeHorizon] = useState("all");

  const allSubmissionsQuery = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "submissions"), orderBy("submittedAt", "desc"));
  }, [db]);

  const { data: submissions, loading } = useCollection<KYCSubmission>(allSubmissionsQuery);

  const branches = useMemo(() => {
    if (!submissions) return [];
    return Array.from(new Set(submissions.map(s => s.branch))).sort();
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    
    return submissions.filter(s => {
      const matchesSearch = s.customerName.toLowerCase().includes(term) ||
                          s.id.toLowerCase().includes(term) ||
                          s.branch.toLowerCase().includes(term);
      
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(s.status);
      const matchesBranch = selectedBranches.length === 0 || selectedBranches.includes(s.branch);
      
      const subDate = new Date(s.submittedAt);
      const now = new Date();
      let matchesTime = true;
      if (timeHorizon === '7d') matchesTime = (now.getTime() - subDate.getTime()) <= (7 * 24 * 60 * 60 * 1000);
      if (timeHorizon === '30d') matchesTime = (now.getTime() - subDate.getTime()) <= (30 * 24 * 60 * 60 * 1000);
      if (timeHorizon === '90d') matchesTime = (now.getTime() - subDate.getTime()) <= (90 * 24 * 60 * 60 * 1000);

      return matchesSearch && matchesStatus && matchesBranch && matchesTime;
    });
  }, [submissions, searchTerm, selectedStatuses, selectedBranches, timeHorizon]);

  const handleExportCSV = () => {
    if (filteredSubmissions.length === 0) return;
    
    const headers = ['Case ID', 'Customer', 'Branch', 'Status', 'Submitted At'];
    const rows = filteredSubmissions.map(s => [
      s.id,
      s.customerName,
      s.branch,
      s.status,
      new Date(s.submittedAt).toLocaleDateString()
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nib-kyc-archive-${timeHorizon}-${new Date().toISOString().split('T')[0]}.csv`);
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
    setTimeHorizon("all");
  };

  const timeRangeLabel = {
    all: "Full Archive",
    "7d": "Last 7 Days",
    "30d": "Last 30 Days",
    "90d": "Last 90 Days"
  }[timeHorizon];

  const getStatusBadge = (sub: KYCSubmission) => {
    const status = sub.status;
    switch (status) {
      case 'Approved': 
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-bold px-3 py-1">Approved</Badge>;
      case 'Pending': 
      case 'In Review':
        return <Badge variant="outline" className="text-slate-500 font-bold px-3 py-1 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> {status}
        </Badge>;
      case 'Amended': 
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100 font-bold px-3 py-1">Action Required</Badge>;
      case 'Rejected': 
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 font-bold px-3 py-1">Rejected</Badge>;
      case 'Escalated': 
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
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Master Case Archive</h1>
            <p className="text-muted-foreground text-lg font-medium">Historical directory of all network submissions.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 border-slate-200 bg-white font-medium shadow-sm hover:bg-slate-50 gap-2 min-w-[140px] justify-between">
                <span className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-slate-400" />
                  {timeRangeLabel}
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setTimeHorizon("all")} className="cursor-pointer">Full Archive</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeHorizon("7d")} className="cursor-pointer">Last 7 Days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeHorizon("30d")} className="cursor-pointer">Last 30 Days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeHorizon("90d")} className="cursor-pointer">Last 90 Days</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
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
            className="gap-2 h-10 px-6 bg-[#B89334] hover:bg-[#A6822D] text-white font-bold shadow-sm rounded-md transition-all active:scale-95" 
            onClick={handleExportCSV}
          >
            <FileDown className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Search by Customer Name, Case ID, or Branch..." 
          className="pl-10 h-11 border-slate-200 bg-white shadow-sm" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

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
                  <div className="animate-spin inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full mb-2" />
                  <p>Syncing archive...</p>
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
                <TableCell className="font-medium text-slate-600">{sub.branch}</TableCell>
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
