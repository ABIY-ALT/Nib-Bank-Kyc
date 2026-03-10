'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth } from "@/lib/auth";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardDescription,
  CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Folders, 
  Filter, 
  Building2, 
  ShieldCheck, 
  Loader2,
  FileArchive,
  CheckCircle2,
  Clock,
  Search,
  RotateCcw
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import JSZip from 'jszip';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from "@/lib/utils";
import { getSubmissions, getSubmissionById } from "@/actions/submissions";
import { getBranches, getDistricts } from "@/actions/hierarchy";
import { KYC_STATUS } from "@/lib/kyc-data";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";

const STATUS_OPTIONS = [
  { id: KYC_STATUS.APPROVED, label: 'Approved' },
  { id: KYC_STATUS.SUBMITTED, label: 'Submitted / In Review' },
  { id: KYC_STATUS.ACTION_REQUIRED, label: 'Action Required' },
  { id: KYC_STATUS.REJECTED, label: 'Rejected' },
  { id: KYC_STATUS.ESCALATED, label: 'Escalated' }
];

export default function MasterBundleDownloadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentActionLabel, setCurrentActionLabel] = useState("");

  useEffect(() => {
    loadInitialData();
  }, [dateRange]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      let filters: any = { limit: 5000 };
      if (dateRange?.from) {
        filters.startDate = dateRange.from.toISOString();
        if (dateRange.to) filters.endDate = dateRange.to.toISOString();
      }

      const [subs, b, d] = await Promise.all([
        getSubmissions(filters),
        getBranches(),
        getDistricts()
      ]);
      setAllSubmissions(subs);
      setBranches(b);
      setDistricts(d);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Error", description: "Could not retrieve records." });
    } finally {
      setLoading(false);
    }
  };

  const filteredSubmissions = useMemo(() => {
    if (!allSubmissions) return [];
    
    return allSubmissions.filter(sub => {
      const matchesStatus = selectedStatuses.length === 0 || 
                           (selectedStatuses.includes(KYC_STATUS.SUBMITTED) ? [KYC_STATUS.SUBMITTED, KYC_STATUS.IN_REVIEW].includes(sub.status) : selectedStatuses.includes(sub.status));
      const matchesDistrict = selectedDistrict === 'all' || sub.branch?.district?.name === selectedDistrict;
      const matchesBranch = selectedBranch === 'all' || sub.branchName === selectedBranch;

      return matchesStatus && matchesDistrict && matchesBranch;
    });
  }, [allSubmissions, selectedStatuses, selectedDistrict, selectedBranch]);

  const handleToggleStatus = (statusId: string) => {
    setSelectedStatuses(prev => 
      prev.includes(statusId) ? prev.filter(s => s !== statusId) : [...prev, statusId]
    );
  };

  const handleDownloadMasterBundle = async () => {
    if (!user || filteredSubmissions.length === 0) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      const zip = new JSZip();
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');
      const bundleName = `NIB_BANK_MASTER_EXPORT_${timestamp}`;

      const manifestHeader = `NIB BANK MASTER KYC EXPORT\n--------------------------------------------------\nAUTHORIZING OFFICIAL: ${user.name}\nTOTAL CASES: ${filteredSubmissions.length}\n--------------------------------------------------\n\nSTRUCTURE: District / Branch / CaseID_CustomerName / Assets\n\nINVENTORY:\n`;
      
      let manifestBody = "";

      for (let i = 0; i < filteredSubmissions.length; i++) {
        const sub = filteredSubmissions[i];
        const distName = sub.branch?.district?.name || "Uncategorized";
        const branchName = sub.branchName || "Main";
        const folderSafeName = `${sub.id}_${sub.customerName.replace(/[^a-z0-9]/gi, '_')}`;
        
        setCurrentActionLabel(`Packaging: ${sub.id}`);
        
        const caseFolder = zip.folder(`${distName}/${branchName}/${folderSafeName}`);
        const fullSub = await getSubmissionById(sub.id);
        
        if (fullSub && fullSub.documents && fullSub.documents.length > 0) {
          for (const doc of fullSub.documents) {
            try {
              const fileRes = await fetch(doc.url);
              const blob = await fileRes.blob();
              caseFolder?.file(doc.name, blob);
            } catch (err) {
              console.error(`Failed to fetch asset: ${doc.name}`);
            }
          }
        }

        manifestBody += `- [${sub.status}] ${distName} > ${branchName} > ${sub.id} (${sub.customerName})\n`;
        setProgress(Math.round(((i + 1) / filteredSubmissions.length) * 100));
      }

      zip.file("nib_bank_manifest.txt", manifestHeader + manifestBody);

      setCurrentActionLabel("Compressing Archive...");
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${bundleName}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Successful", description: `Master Archive with folders and files is ready.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Export Failure" });
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setCurrentActionLabel("");
    }
  };

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedDistrict("all");
    setSelectedBranch("all");
    setDateRange(undefined);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-lg">
              <Folders className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Master Case Bundle</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Bulk institutional export with structured regional folders.</p>
        </div>
        <div className="flex items-center gap-3">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-4 py-1.5 font-bold h-10 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Authorized HQ Access
          </Badge>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-4 shadow-xl border-slate-200 h-fit sticky top-20">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              Export Control
            </CardTitle>
            <CardDescription>Organize bulk archiving by region or status.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-8">
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Queues</Label>
              <div className="grid gap-3">
                {STATUS_OPTIONS.map(status => (
                  <div key={status.id} className="flex items-center space-x-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                    <Checkbox 
                      id={`status-${status.id}`} 
                      checked={selectedStatuses.includes(status.id)}
                      onCheckedChange={() => handleToggleStatus(status.id)}
                    />
                    <label htmlFor={`status-${status.id}`} className="text-sm font-bold text-slate-700 cursor-pointer flex-1">
                      {status.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Regional District</Label>
                <Select value={selectedDistrict} onValueChange={(val) => { setSelectedDistrict(val); setSelectedBranch("all"); }}>
                  <SelectTrigger className="h-11 bg-white">
                    <SelectValue placeholder="All Regions" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-2xl border-none">
                    <SelectItem value="all">Global (All Regions)</SelectItem>
                    {districts?.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Branch Office</Label>
                <Select value={selectedBranch} onValueChange={setSelectedBranch} disabled={selectedDistrict === 'all'}>
                  <SelectTrigger className="h-11 bg-white">
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-2xl border-none">
                    <SelectItem value="all">All Branches in {selectedDistrict}</SelectItem>
                    {branches?.filter(b => selectedDistrict === 'all' || b.district?.name === selectedDistrict).map(b => (
                      <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button variant="ghost" onClick={resetFilters} className="w-full gap-2 font-bold text-slate-400 hover:text-primary">
              <RotateCcw className="w-4 h-4" /> Reset Workspace
            </Button>
          </CardContent>
          <CardFooter className="bg-slate-50 border-t p-6">
            <Button 
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg shadow-xl gap-3"
              onClick={handleDownloadMasterBundle}
              disabled={isProcessing || filteredSubmissions.length === 0}
            >
              {isProcessing ? (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{progress}% Complete</span>
                  </div>
                  <span className="text-[9px] font-bold uppercase mt-1 opacity-70 truncate max-w-[200px]">{currentActionLabel}</span>
                </div>
              ) : (
                <><FileArchive className="w-6 h-6" /> Export {filteredSubmissions.length} Cases</>
              )}
            </Button>
          </CardFooter>
        </Card>

        <div className="lg:col-span-8 space-y-6">
          <Card className="shadow-2xl border-slate-200 overflow-hidden min-h-[500px] bg-white">
            <CardHeader className="bg-slate-900 text-white border-b flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white/10 rounded-lg"><FileArchive className="w-5 h-5 text-emerald-400" /></div>
                <div><CardTitle className="text-xl">Export Discovery Queue</CardTitle></div>
              </div>
              <Badge className="bg-emerald-600 text-white font-black px-4 py-1">{filteredSubmissions.length} Records</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-40 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="font-black uppercase tracking-widest text-xs">Synchronizing Archive Registry...</p>
                </div>
              ) : filteredSubmissions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {filteredSubmissions.map(sub => (
                    <div key={sub.id} className="p-5 hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-4">
                          <div className={cn("p-2 rounded-lg", sub.status === KYC_STATUS.APPROVED ? 'bg-emerald-50 text-emerald-600' : 'bg-primary/5 text-primary')}>
                            {sub.status === KYC_STATUS.APPROVED ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900">{sub.customerName}</span>
                              <Badge variant="outline" className="text-[8px] font-black uppercase px-1.5 h-4">{sub.entityType || 'Individual'}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <span className="text-primary font-black">{sub.id}</span>
                              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {sub.branchName} Node</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-white border font-bold text-[10px] uppercase text-slate-500">{sub.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-48 text-center space-y-6">
                  <div className="p-8 bg-slate-50 rounded-full">
                    <Search className="w-16 h-16 text-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-black text-slate-900 text-xl">Archive Discovery Standby</p>
                    <p className="text-sm text-slate-400 font-medium">Adjust filters to populate the master export queue.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
