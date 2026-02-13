
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy, getDocs, doc } from "firebase/firestore";
import { useAuth } from "@/lib/auth-mock";
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
  Download, 
  Filter, 
  Calendar as CalendarIcon, 
  MapPin, 
  Building2, 
  ShieldCheck, 
  Loader2,
  FileArchive,
  Info,
  Archive,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  ChevronRight,
  Search
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { subDays, startOfDay, endOfDay, format, isWithinInterval } from "date-fns";
import JSZip from 'jszip';
import { KYCSubmission, Document } from "@/lib/kyc-data";
import { Checkbox } from '@/components/ui/checkbox';

const STATUS_OPTIONS = [
  { id: 'Approved', label: 'Approved' },
  { id: 'Pending', label: 'Pending / In Review' },
  { id: 'Amended', label: 'Action Required' },
  { id: 'Rejected', label: 'Rejected' },
  { id: 'Escalated', label: 'Escalated' }
];

export default function MasterBundleDownloadPage() {
  const db = useFirestore();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const branchesQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "branches"), orderBy("name")) : null;
  }, [db]);
  const { data: branches } = useCollection<{id: string, name: string, district: string}>(branchesQuery);

  const districtsQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "districts"), orderBy("name")) : null;
  }, [db]);
  const { data: districts } = useCollection<{id: string, name: string}>(districtsQuery);

  const submissionsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, "submissions"), orderBy("submittedAt", "desc"));
  }, [db]);
  const { data: allSubmissions, loading: subsLoading } = useCollection<KYCSubmission>(submissionsQuery);

  const filteredSubmissions = useMemo(() => {
    if (!allSubmissions) return [];
    
    const start = startOfDay(new Date(fromDate));
    const end = endOfDay(new Date(toDate));

    return allSubmissions.filter(sub => {
      const matchesDate = isWithinInterval(new Date(sub.submittedAt), { start, end });
      const matchesStatus = selectedStatuses.length === 0 || 
                           (selectedStatuses.includes('Pending') ? ['Pending', 'In Review'].includes(sub.status) : selectedStatuses.includes(sub.status));
      const matchesDistrict = selectedDistrict === 'all' || sub.district === selectedDistrict;
      const matchesBranch = selectedBranch === 'all' || sub.branch === selectedBranch;

      return matchesDate && matchesStatus && matchesDistrict && matchesBranch;
    });
  }, [allSubmissions, fromDate, toDate, selectedStatuses, selectedDistrict, selectedBranch]);

  const handleToggleStatus = (statusId: string) => {
    setSelectedStatuses(prev => 
      prev.includes(statusId) ? prev.filter(s => s !== statusId) : [...prev, statusId]
    );
  };

  const handleDownloadMasterBundle = async () => {
    if (!db || !user || filteredSubmissions.length === 0) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      const zip = new JSZip();
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');
      const bundleName = `NIB_BANK_MASTER_KYC_EXPORT_${timestamp}`;

      const manifestHeader = `NIB BANK MASTER KYC EXPORT
--------------------------------------------------
AUTHORIZING OFFICIAL: ${user.name}
INSTITUTIONAL ROLE: ${user.role}
EXPORT TIMESTAMP: ${now.toLocaleString()}
DATE RANGE: ${fromDate} to ${toDate}
FILTERS: Status(${selectedStatuses.join(', ') || 'All'}), Region(${selectedDistrict}), Node(${selectedBranch})
TOTAL CASES EXPORTED: ${filteredSubmissions.length}
--------------------------------------------------

INVENTORY OF EXPORTED CASES:
`;
      let caseList = "";

      for (let i = 0; i < filteredSubmissions.length; i++) {
        const sub = filteredSubmissions[i];
        const statusFolder = sub.status === 'In Review' ? 'Pending' : sub.status;
        const subPath = `${statusFolder}/${sub.district}/${sub.branch}/${sub.id}_${sub.customerName.replace(/\s+/g, '_')}`;
        
        caseList += `- [${sub.status}] ${sub.id} | ${sub.customerName} | ${sub.branch} | Submitted: ${new Date(sub.submittedAt).toLocaleDateString()}\n`;

        const docsSnap = await getDocs(collection(doc(db, "submissions", sub.id), "documents"));
        const docList = docsSnap.docs.map(d => ({ ...d.data(), id: d.id }) as Document);

        if (docList.length > 0) {
          const caseFolder = zip.folder(subPath);
          for (const docObj of docList) {
            try {
              const sourceUrl = docObj.url === '#' 
                ? (docObj.name.toLowerCase().endsWith('.pdf') 
                    ? 'https://placehold.co/1200x1600/png?text=Institutional+PDF+Asset' 
                    : `https://picsum.photos/seed/${docObj.id}/1200/1600`)
                : docObj.url;

              const response = await fetch(sourceUrl);
              const blob = await response.blob();
              caseFolder?.file(docObj.name, blob);
            } catch (err) {
              caseFolder?.file(`${docObj.name}_ERROR.txt`, `Institutional error: Could not capture file source.`);
            }
          }
        } else {
          zip.folder(subPath);
        }

        setProgress(Math.round(((i + 1) / filteredSubmissions.length) * 100));
      }

      zip.file("NIB_BANK_MASTER_MANIFEST.txt", manifestHeader + caseList);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${bundleName}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);

      toast({
        title: "Master Bundle Complete",
        description: `Exported ${filteredSubmissions.length} cases into institutional archive.`,
      });
    } catch (error) {
      console.error("Master bundle failed:", error);
      toast({
        variant: "destructive",
        title: "Critical Export Failure",
        description: "An internal error occurred during the institutional packaging process."
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
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
          <p className="text-muted-foreground text-lg font-medium">Global institutional export for compliance archiving and bulk audit.</p>
        </div>
        <div className="flex items-center gap-3">
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
            <CardDescription>Define criteria for institutional bulk archiving.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-8">
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Workflow Queues</Label>
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
                <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
                  <SelectTrigger className="h-11 bg-white">
                    <SelectValue placeholder="All Regions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions (Global)</SelectItem>
                    {districts?.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Institutional Node</Label>
                <Select value={selectedBranch} onValueChange={setSelectedBranch} disabled={selectedDistrict === 'all'}>
                  <SelectTrigger className="h-11 bg-white">
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches in {selectedDistrict === 'all' ? 'Network' : selectedDistrict}</SelectItem>
                    {branches?.filter(b => selectedDistrict === 'all' || b.district === selectedDistrict).map(b => (
                      <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Date</Label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="pl-9 h-10 font-bold" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">To Date</Label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="pl-9 h-10 font-bold" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-slate-50 border-t p-6">
            <Button 
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg shadow-xl shadow-emerald-100 gap-3 transition-all active:scale-95"
              onClick={handleDownloadMasterBundle}
              disabled={isProcessing || filteredSubmissions.length === 0}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Capturing {progress}%
                </>
              ) : (
                <>
                  <FileArchive className="w-6 h-6" />
                  Export {filteredSubmissions.length} Cases
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <div className="lg:col-span-8 space-y-6">
          <Alert className="bg-blue-50 border-blue-200 text-blue-900 border-l-4 border-l-blue-600">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-xs font-bold uppercase tracking-tight text-blue-800">
              Institutional Protocol: Exported bundles contain highly sensitive identity documents. Ensure secure storage after download.
            </AlertDescription>
          </Alert>

          <Card className="shadow-2xl border-slate-200 overflow-hidden min-h-[500px]">
            <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Export Discovery Queue</CardTitle>
                <CardDescription>Preview of cases matching the current institutional filters.</CardDescription>
              </div>
              <Badge className="bg-slate-900 text-white font-black px-4 py-1">
                {filteredSubmissions.length} Matches Found
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {subsLoading ? (
                <div className="flex flex-col items-center justify-center py-40 text-muted-foreground gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="font-black uppercase tracking-widest text-xs">Querying Institutional Archive...</p>
                </div>
              ) : filteredSubmissions.length > 0 ? (
                <div className="divide-y">
                  {filteredSubmissions.map(sub => (
                    <div key={sub.id} className="p-5 hover:bg-slate-50/50 transition-colors group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-4">
                          <div className="mt-1">
                            <div className={cn(
                              "p-2 rounded-lg",
                              sub.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 
                              sub.status === 'Amended' ? 'bg-orange-50 text-orange-600' :
                              sub.status === 'Rejected' ? 'bg-red-50 text-red-600' :
                              'bg-primary/5 text-primary'
                            )}>
                              {sub.status === 'Approved' ? <CheckCircle2 className="w-5 h-5" /> :
                               sub.status === 'Amended' ? <AlertCircle className="w-5 h-5" /> :
                               sub.status === 'Rejected' ? <XCircle className="w-5 h-5" /> :
                               <Clock className="w-5 h-5" />}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900">{sub.customerName}</span>
                              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter border-slate-200">
                                {sub.entityType || 'Individual'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <span className="text-primary font-black">{sub.id}</span>
                              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {sub.district} District</span>
                              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {sub.branch} Node</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                            Submitted: {new Date(sub.submittedAt).toLocaleDateString()}
                          </span>
                          <Badge variant="secondary" className="bg-white border font-bold text-[10px]">
                            {sub.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-48 text-center space-y-6">
                  <div className="p-8 bg-slate-50 rounded-full border-2 border-dashed border-slate-200">
                    <Search className="w-16 h-16 text-slate-200" />
                  </div>
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="font-black text-slate-900 text-xl">Discovery Exhausted</p>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">
                      No cases match your institutional filters. Try expanding your date range or selecting additional queues.
                    </p>
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
