
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
  History,
  Clock,
  X
} from "lucide-react";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useMemo, useState } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { Separator } from "@/components/ui/separator";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

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
      
      return matchesSearch && matchesStatus && matchesBranch;
    });
  }, [submissions, searchTerm, selectedStatuses, selectedBranches]);

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
  };

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
        <Button variant="outline" className="gap-2 font-bold shadow-sm">
          <FileDown className="w-4 h-4" />
          Export Master List
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search by Customer Name, Case ID, or Branch..." 
            className="pl-10 h-11 border-slate-200" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 h-11 px-6 font-bold text-slate-600 border-slate-200 relative">
              <Filter className="w-4 h-4" />
              Advanced Filters
              {(selectedStatuses.length > 0 || selectedBranches.length > 0) && (
                <Badge variant="default" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold">
                  {selectedStatuses.length + selectedBranches.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-6 space-y-6 shadow-2xl border-slate-200" align="end">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Archive Filters</h3>
              {(selectedStatuses.length > 0 || selectedBranches.length > 0 || searchTerm) && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-[11px] font-bold text-primary uppercase tracking-wider px-2 hover:bg-primary/5">
                  Clear All
                </Button>
              )}
            </div>
            
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Workflow Status</Label>
              <div className="grid gap-3">
                {STATUS_OPTIONS.map((status) => (
                  <div key={status.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`status-${status.id}`} 
                      checked={selectedStatuses.includes(status.id)}
                      onCheckedChange={() => toggleStatus(status.id)}
                    />
                    <Label htmlFor={`status-${status.id}`} className="text-sm font-medium cursor-pointer">{status.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-slate-100" />

            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Originating Branch</Label>
              <div className="grid gap-3 max-h-[200px] overflow-y-auto pr-2">
                {branches.map((branch) => (
                  <div key={branch} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`branch-${branch}`} 
                      checked={selectedBranches.includes(branch)}
                      onCheckedChange={() => toggleBranch(branch)}
                    />
                    <Label htmlFor={`branch-${branch}`} className="text-sm font-medium cursor-pointer">{branch}</Label>
                  </div>
                ))}
                {branches.length === 0 && <p className="text-xs text-slate-400 italic">No branches detected.</p>}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="border rounded-xl bg-card overflow-hidden shadow-xl border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold text-slate-600 w-[120px] py-4">Case ID</TableHead>
              <TableHead className="font-bold text-slate-600">Customer Details</TableHead>
              <TableHead className="font-bold text-slate-600">Branch Location</TableHead>
              <TableHead className="font-bold text-slate-600">Workflow Status</TableHead>
              <TableHead className="font-bold text-slate-600">Submitted On</TableHead>
              <TableHead className="text-right font-bold text-slate-600 pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                  <History className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                  Syncing archive...
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
