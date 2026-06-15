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
import { sortSubmissionsOldestFirst } from "@/lib/submission-sort";
import {
  buildBundleRootName,
  getSubmissionBranchName,
  getSubmissionDistrictName,
  sanitizeBundleSegment,
} from "@/lib/bundle-path";
import { resolveDownloadFileName } from "@/lib/documents";

const STATUS_OPTIONS = [
  { id: KYC_STATUS.APPROVED, label: 'Approved' },
  { id: KYC_STATUS.SUBMITTED, label: 'Submitted / In Review' },
  { id: KYC_STATUS.ACTION_REQUIRED, label: 'Need Amendment' },
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
      const matchesDistrict = selectedDistrict === 'all' || getSubmissionDistrictName(sub) === selectedDistrict;
      const matchesBranch = selectedBranch === 'all' || getSubmissionBranchName(sub) === selectedBranch;

      return matchesStatus && matchesDistrict && matchesBranch;
    });
  }, [allSubmissions, selectedStatuses, selectedDistrict, selectedBranch]);

  const orderedFilteredSubmissions = useMemo(() => {
    return sortSubmissionsOldestFirst(filteredSubmissions || []);
  }, [filteredSubmissions]);

  const handleToggleStatus = (statusId: string) => {
    setSelectedStatuses(prev => 
      prev.includes(statusId) ? prev.filter(s => s !== statusId) : [...prev, statusId]
    );
  };

  /** Fetch a document with up to 3 retries on rate-limit (429) responses. */
  const fetchDocumentWithRetry = async (url: string, retries = 3): Promise<ArrayBuffer | null> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      const res = await fetch(url, { method: 'GET', credentials: 'include', headers: { 'Accept': '*/*' } });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return buf.byteLength > 0 ? buf : null;
      }
      if (res.status === 429 && attempt < retries - 1) {
        // Back off before retrying: 3 s, 6 s …
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      // Non-retryable error
      return null;
    }
    return null;
  };

  const handleDownloadMasterBundle = async () => {
    if (!user || filteredSubmissions.length === 0) return;
    setIsProcessing(true);
    setProgress(0);

    const failedDocs: { caseId: string; docName: string; reason: string }[] = [];

    try {
      const zip = new JSZip();
      const now = new Date();
      const timestamp = format(now, 'yyyyMMdd_HHmmss');

      const filterTypeLabel = selectedStatuses.length === 0
        ? 'ALL_STATUSES'
        : selectedStatuses.map(s => STATUS_OPTIONS.find(opt => opt.id === s)?.label || s).join('_');

      const dateRangeLabel = dateRange?.from && dateRange?.to
        ? `${format(dateRange.from, 'yyyyMMdd')}_to_${format(dateRange.to, 'yyyyMMdd')}`
        : dateRange?.from
        ? `from_${format(dateRange.from, 'yyyyMMdd')}`
        : 'ALL_DATES';

      const rootFolder = zip.folder('NIB_KYC_MASTER_EXPORT');

      const groupedByDistrict: Record<string, Record<string, any[]>> = {};
      for (const sub of filteredSubmissions) {
        const distName = getSubmissionDistrictName(sub);
        const branchName = getSubmissionBranchName(sub);
        if (!groupedByDistrict[distName]) groupedByDistrict[distName] = {};
        if (!groupedByDistrict[distName][branchName]) groupedByDistrict[distName][branchName] = [];
        groupedByDistrict[distName][branchName].push(sub);
      }

      let manifestBody = "";
      let processedCount = 0;

      for (const [districtName, branches] of Object.entries(groupedByDistrict)) {
        const districtFolder = rootFolder?.folder(sanitizeBundleSegment(districtName, 'DISTRICT'));

        for (const [branchName, submissions] of Object.entries(branches)) {
          const branchFolder = districtFolder?.folder(sanitizeBundleSegment(branchName, 'BRANCH'));
          const filterFolder = branchFolder?.folder(`${sanitizeBundleSegment(filterTypeLabel, 'FILTER')}_${dateRangeLabel}`);

          for (const sub of submissions) {
            const customerFolderName = sanitizeBundleSegment(sub.customerName, 'CUSTOMER');
            const customerFolder = filterFolder?.folder(customerFolderName);

            setCurrentActionLabel(`Packaging: ${sub.id} (${sub.customerName})`);

            const fullSub = await getSubmissionById(sub.id);
            let successfulDocs = 0;

            if (fullSub?.documents?.length) {
              for (const doc of fullSub.documents) {
                const downloadUrl = doc.downloadUrl || (doc.previewUrl ? `${doc.previewUrl}?download=1` : null);
                if (!downloadUrl) {
                  failedDocs.push({ caseId: sub.id, docName: doc.name || 'Unknown', reason: 'No download URL available' });
                  continue;
                }

                try {
                  const buffer = await fetchDocumentWithRetry(downloadUrl);
                  if (!buffer) {
                    failedDocs.push({ caseId: sub.id, docName: doc.name || 'Unknown', reason: 'File could not be retrieved from server' });
                    continue;
                  }
                  const safeFileName = resolveDownloadFileName(doc.name, doc.originalName, doc.mimeType);
                  customerFolder?.file(safeFileName, buffer, { binary: true });
                  successfulDocs++;
                } catch {
                  failedDocs.push({ caseId: sub.id, docName: doc.name || 'Unknown', reason: 'Download error' });
                }
              }
            }

            const caseMetadata = `CASE METADATA
==================================================
Case ID:           ${sub.id}
Customer Name:     ${sub.customerName}
Entity Type:       ${sub.entityType || 'Individual'}
Branch:            ${branchName}
District:          ${districtName}
Status:            ${sub.status}
Submitted Date:    ${sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : 'N/A'}
Last Updated:      ${sub.updatedAt ? new Date(sub.updatedAt).toLocaleString() : 'N/A'}
Documents Included: ${successfulDocs} of ${fullSub?.documents?.length || 0}
==================================================`;

            customerFolder?.file('CASE_METADATA.txt', caseMetadata);
            manifestBody += `[${sub.status}] ${districtName} > ${branchName} > ${sub.id} (${sub.customerName}) - ${successfulDocs}/${fullSub?.documents?.length || 0} documents\n`;
            processedCount++;
            setProgress(Math.round((processedCount / filteredSubmissions.length) * 100));
          }
        }
      }

      // Failure report appended to manifest when docs were skipped
      let failureReport = '';
      if (failedDocs.length > 0) {
        failureReport = `\n\nFAILED DOCUMENTS (${failedDocs.length} file(s) could not be included)\n==================================================\n`;
        failureReport += failedDocs.map(f => `Case ${f.caseId} | ${f.docName}: ${f.reason}`).join('\n');
        failureReport += '\n';
      }

      const manifestHeader = `NIB BANK MASTER KYC EXPORT
==================================================
EXPORT METADATA
==================================================
Authorizing Official:  ${user.name}
Export Timestamp:      ${now.toLocaleString()}
Total Cases:           ${filteredSubmissions.length}
Documents Requested:   ${filteredSubmissions.reduce((sum, sub) => sum + (sub.documents?.length || 0), 0)}
Documents Included:    ${filteredSubmissions.reduce((sum, sub) => sum + (sub.documents?.length || 0), 0) - failedDocs.length}
Documents Failed:      ${failedDocs.length}

FILTER CRITERIA
==================================================
Status Filter:         ${filterTypeLabel}
Date Range:            ${dateRangeLabel}
District Filter:       ${selectedDistrict !== 'all' ? selectedDistrict : 'All Districts'}
Branch Filter:         ${selectedBranch !== 'all' ? selectedBranch : 'All Branches'}

==================================================
Root: NIB_KYC_MASTER_EXPORT
  └─ [District Name]
      └─ [Branch Name]
          └─ [${sanitizeBundleSegment(filterTypeLabel, 'FILTER')}_${dateRangeLabel}]
              └─ [Customer Name]
                  ├─ [Document Files]
                  └─ CASE_METADATA.txt

CASE INVENTORY
==================================================
`;

      rootFolder?.file('EXPORT_MANIFEST.txt', manifestHeader + manifestBody + failureReport);

      const filterSummary = `FILTER SUMMARY
==================================================
Export Date:           ${format(now, 'yyyy-MM-dd HH:mm:ss')}
Status Filters:        ${selectedStatuses.length === 0 ? 'All Statuses' : selectedStatuses.map(s => STATUS_OPTIONS.find(opt => opt.id === s)?.label).join(', ')}
Date Range:            ${dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : 'Start'} to ${dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : 'End'}
District:              ${selectedDistrict !== 'all' ? selectedDistrict : 'All'}
Branch:                ${selectedBranch !== 'all' ? selectedBranch : 'All'}
Total Records:         ${filteredSubmissions.length}
Failed Documents:      ${failedDocs.length}
==================================================`;

      rootFolder?.file('FILTER_SUMMARY.txt', filterSummary);

      setCurrentActionLabel("Compressing Archive...");
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `NIB_KYC_EXPORT_${timestamp}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (failedDocs.length > 0) {
        toast({
          variant: "destructive",
          title: "Export completed with warnings",
          description: `${processedCount} cases exported. ${failedDocs.length} document(s) could not be retrieved and were skipped. See EXPORT_MANIFEST.txt inside the ZIP for details.`,
        });
      } else {
        toast({
          title: "Export Successful",
          description: `${processedCount} cases exported successfully, organized by district, branch, and filter criteria.`,
        });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Export Failed", description: "The export could not be completed. Please try again. If the problem persists, try narrowing your filter criteria." });
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
                    <SelectItem value="all">Overall (All Regions)</SelectItem>
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
              disabled={isProcessing || orderedFilteredSubmissions.length === 0}
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
                <><FileArchive className="w-6 h-6" /> Export {orderedFilteredSubmissions.length} Cases</>
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
              <Badge className="bg-emerald-600 text-white font-black px-4 py-1">{orderedFilteredSubmissions.length} Records</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-40 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="font-black uppercase tracking-widest text-xs">Synchronizing Archive Registry...</p>
                </div>
              ) : orderedFilteredSubmissions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {orderedFilteredSubmissions.map(sub => (
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
                              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {sub.branchName?.toLowerCase().includes('branch') ? sub.branchName : `${sub.branchName} Branch`}</span>
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
