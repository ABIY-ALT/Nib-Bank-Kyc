'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  ClipboardCheck, Download, Loader2, ShieldCheck, RotateCcw,
  Eye, User, Building2, FileText, CheckCircle2, AlertTriangle,
  CalendarDays, UserCheck, MessageSquare, Paperclip, X,
  ArrowDown, ArrowUp, ChevronsUpDown, Search
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFollowUpVerifications } from "@/actions/follow-up";
import { getSubmissionById } from "@/actions/submissions";
import { getMemoAccessUrl } from "@/actions/memos";
import { DatePickerWithRange, DateRange } from "@/components/ui/date-range-picker";
import {
  DocumentPreviewViewer,
  type PreviewableDocument,
} from "@/components/submissions/document-preview";
import { formatFileSize, getPreviewFormatLabel } from "@/lib/documents";
import { Pagination } from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 10;

export default function FollowUpReportsPage() {
  const { toast } = useToast();

  const [allVerifications, setAllVerifications] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Default: first-submitted (oldest) verification first.
  const [sort, setSort] = useState<{ field: 'id' | 'customer' | 'result' | 'verifiedBy' | 'verifiedAt'; order: 'asc' | 'desc' }>({ field: 'verifiedAt', order: 'asc' });

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVerification, setDetailVerification] = useState<any>(null);
  const [detailSubmission, setDetailSubmission] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Document preview state
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [activeDocumentAction, setActiveDocumentAction] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isDocPreviewOpen, setIsDocPreviewOpen] = useState(false);

  // Server-side search with debounce: the list is paginated, so a client-side
  // match over the 10 visible rows could never find a record on another page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange, selectedResult, sort]);

  useEffect(() => {
    loadData();
  }, [currentPage, dateRange, selectedResult, sort, debouncedSearch]);

  const buildServerFilters = () => {
    const filters: any = {
      search: debouncedSearch || undefined,
      result: selectedResult === "all" ? undefined : selectedResult,
      sortField: sort.field,
      sortOrder: sort.order,
    };
    if (dateRange?.from) {
      filters.startDate = dateRange.from.toISOString();
      if (dateRange.to) filters.endDate = dateRange.to.toISOString();
    }
    return filters;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const filters: any = buildServerFilters();
      filters.limit = ITEMS_PER_PAGE;
      filters.offset = (currentPage - 1) * ITEMS_PER_PAGE;

      const result = await getFollowUpVerifications(filters);
      setAllVerifications(result.verifications || []);
      setTotalCount(result.total || 0);
    } catch {
      toast({ variant: "destructive", title: "Sync Error" });
    } finally {
      setLoading(false);
    }
  };

  // Result/date/search filtering all happens server-side now (so counts and
  // pagination stay exact); the rows arrive ready to render.
  const filteredData = allVerifications;

  const toggleSort = (field: typeof sort.field) => {
    setSort(prev => ({ field, order: prev.field === field ? (prev.order === 'asc' ? 'desc' : 'asc') : 'asc' }));
  };

  const SortIndicator = ({ field }: { field: typeof sort.field }) => {
    if (sort.field !== field) return <ChevronsUpDown className="w-3 h-3 ml-1 inline-block text-slate-300" />;
    return sort.order === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 inline-block text-primary" />
      : <ArrowDown className="w-3 h-3 ml-1 inline-block text-primary" />;
  };

  const handleViewDetails = async (v: any) => {
    setDetailVerification(v);
    // Use the included kyc data directly!
    setDetailSubmission(v.kyc);
    setDetailOpen(true);
    setDetailLoading(false);
  };

  const handleDocumentAccess = async (memoId: string, fileName: string, mode: "view" | "download") => {
    if (mode === "view") {
      if (previewUrls[memoId]) {
        setActiveDocId(memoId);
        setIsDocPreviewOpen(true);
        return;
      }
      setActiveDocumentAction(`${memoId}:view`);
      try {
        const res = await getMemoAccessUrl(memoId, { download: false });
        if (res.success && res.url) {
          setPreviewUrls(prev => ({ ...prev, [memoId]: res.url! }));
          setActiveDocId(memoId);
          setIsDocPreviewOpen(true);
        } else throw new Error(res.error);
      } catch {
        toast({ variant: "destructive", title: "Open Failed" });
      } finally {
        setActiveDocumentAction(null);
      }
      return;
    }
    setActiveDocumentAction(`${memoId}:download`);
    try {
      const res = await getMemoAccessUrl(memoId, { download: true });
      if (!res.success || !res.url) throw new Error(res.error);
      const link = document.createElement("a");
      link.href = res.url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast({ variant: "destructive", title: "Download Failed" });
    } finally {
      setActiveDocumentAction(null);
    }
  };

  const previewableDocuments: PreviewableDocument[] = (detailSubmission?.documents || []).map((doc: any) => ({
    id: doc.id,
    name: doc.name,
    previewUrl: previewUrls[doc.id] || "",
    mimeType: doc.mimeType,
    size: doc.size,
    documentType: doc.type,
  }));

  const activeDocIndex = previewableDocuments.findIndex(d => d.id === activeDocId);
  const activeDocPreview = activeDocIndex >= 0 ? previewableDocuments[activeDocIndex] : null;

  const goToPreviousDoc = async () => {
    if (activeDocIndex > 0) {
      const next = previewableDocuments[activeDocIndex - 1];
      if (!previewUrls[next.id]) {
        setActiveDocumentAction(`${next.id}:view`);
        try {
          const res = await getMemoAccessUrl(next.id, { download: false });
          if (res.success && res.url) setPreviewUrls(prev => ({ ...prev, [next.id]: res.url! }));
        } finally { setActiveDocumentAction(null); }
      }
      setActiveDocId(next.id);
    }
  };

  const goToNextDoc = async () => {
    if (activeDocIndex >= 0 && activeDocIndex < previewableDocuments.length - 1) {
      const next = previewableDocuments[activeDocIndex + 1];
      if (!previewUrls[next.id]) {
        setActiveDocumentAction(`${next.id}:view`);
        try {
          const res = await getMemoAccessUrl(next.id, { download: false });
          if (res.success && res.url) setPreviewUrls(prev => ({ ...prev, [next.id]: res.url! }));
        } finally { setActiveDocumentAction(null); }
      }
      setActiveDocId(next.id);
    }
  };

  // Helper function to find who approved the KYC case
  const getAuthorizedBy = (verification: any) => {
    if (!verification.kyc?.commentHistory) return '—';
    const approvalEntry = verification.kyc.commentHistory.find(
      (entry: any) => entry.action === 'APPROVED'
    );
    return approvalEntry?.performedBy || '—';
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      // Refetch ALL matching verifications — the on-screen list is one 10-row
      // page of a server-paginated fetch, so exporting it would only ever
      // export the current page. Same search/result/date/sort as the table.
      const filters: any = { ...buildServerFilters(), limit: 100000 };
      const result = await getFollowUpVerifications(filters);
      const exportRows = result.verifications || [];
      if (exportRows.length === 0) {
        toast({ variant: "destructive", title: "Nothing to export", description: "No records match the current filters." });
        return;
      }
      const headers = ['Audit ID', 'Case ID', 'Customer', 'Branch', 'Result', 'Authorized By', 'Verified By', 'Date', 'Remarks'];
      const rows = exportRows.map((v: any) => [
        v.id, v.submissionId, v.customerName, v.branch,
        v.result || 'N/A', getAuthorizedBy(v), v.verifiedBy || 'N/A',
        v.verifiedAt ? format(new Date(v.verifiedAt), 'yyyy-MM-dd') : 'N/A',
        (v.remarks || '').replace(/"/g, '""') // Escape quotes for CSV
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'nib-followup-report.csv');
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export Successful", description: `${exportRows.length} record(s) exported.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Export Failed", description: "Could not compile the export file." });
    } finally {
      setIsExporting(false);
    }
  };

  const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) => (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 h-fit rounded-lg bg-slate-100 p-1.5 text-slate-500 shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="font-bold text-slate-900">{value || '—'}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Follow-up Report</h1>
          <p className="text-muted-foreground text-lg font-medium">Head Office follow-up review data for regulatory verification.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
          <Button variant="outline" className="gap-2 h-12 px-6 border-slate-200 bg-white" onClick={() => { setSelectedResult("all"); setDateRange(undefined); setSearchTerm(""); setSort({ field: 'verifiedAt', order: 'asc' }); }}>
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
          <Button className="gap-2 bg-primary hover:bg-primary/90 h-12 px-6 font-bold shadow-lg text-white" disabled={isExporting || totalCount === 0} onClick={handleExportCSV}>
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Download Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-2 w-full sm:w-56">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Review Outcome</Label>
              <Select value={selectedResult} onValueChange={setSelectedResult}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="All Results" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Results</SelectItem>
                  <SelectItem value="Correct">Correct (Compliant)</SelectItem>
                  <SelectItem value="Discrepancy">Discrepancy (Errors)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 w-full sm:flex-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Search</Label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by customer, case ID, branch, or reviewer..."
                  className="pl-11 h-12 rounded-xl border-slate-200 bg-white font-medium"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="py-40 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /></div>
      ) : (
        <>
          <Card className="border-slate-200 shadow-xl overflow-hidden rounded-[2rem] bg-white">
            <CardHeader className="bg-primary text-white p-6 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-2xl font-bold tracking-tight flex items-center gap-3">
                <ClipboardCheck className="w-6 h-6 text-white" /> Quality Control Log
              </CardTitle>
              <Badge variant="outline" className="bg-white/20 border-white/40 text-white font-black px-4 h-8">{totalCount} Records</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-black py-4 pl-8 text-[11px] uppercase cursor-pointer select-none hover:text-primary" onClick={() => toggleSort('id')}>
                      Follow-up ID<SortIndicator field="id" />
                    </TableHead>
                    <TableHead className="font-black text-[11px] uppercase cursor-pointer select-none hover:text-primary" onClick={() => toggleSort('customer')}>
                      Customer / Case<SortIndicator field="customer" />
                    </TableHead>
                    <TableHead className="font-black text-center text-[11px] uppercase cursor-pointer select-none hover:text-primary" onClick={() => toggleSort('result')}>
                      Result<SortIndicator field="result" />
                    </TableHead>
                    <TableHead className="font-black text-[11px] uppercase">Authorized By</TableHead>
                    <TableHead className="font-black text-[11px] uppercase cursor-pointer select-none hover:text-primary" onClick={() => toggleSort('verifiedBy')}>
                      Verified By<SortIndicator field="verifiedBy" />
                    </TableHead>
                    <TableHead className="font-black text-[11px] uppercase cursor-pointer select-none hover:text-primary" onClick={() => toggleSort('verifiedAt')}>
                      Date<SortIndicator field="verifiedAt" />
                    </TableHead>
                    <TableHead className="font-black text-[11px] uppercase">Remarks</TableHead>
                    <TableHead className="font-black text-center pr-8 text-[11px] uppercase">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-20 text-center text-slate-400 font-bold">
                        No follow-up records match your filters.
                      </TableCell>
                    </TableRow>
                  ) : filteredData.map((v) => (
                    <TableRow key={v.id} className="hover:bg-slate-50 border-b border-slate-100">
                      <TableCell className="font-bold text-primary py-5 pl-8 text-xs">{v.id}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{v.customerName}</span>
                          <span className="text-[10px] font-black uppercase text-slate-400">{v.submissionId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {v.result ? (
                          <Badge className={v.result === 'Correct' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}>
                            {v.result}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400 font-bold">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-bold text-slate-700">{getAuthorizedBy(v)}</TableCell>
                      <TableCell className="font-bold text-slate-700">{v.verifiedBy || '—'}</TableCell>
                      <TableCell className="text-xs font-bold text-slate-500">{v.verifiedAt ? format(new Date(v.verifiedAt), 'MMM dd, yyyy') : 'N/A'}</TableCell>
                      <TableCell className="text-xs font-bold text-slate-600 max-w-xs truncate">{v.remarks || '—'}</TableCell>
                      <TableCell className="text-center pr-8">
                        <Button
                          variant="default"
                          className="h-10 rounded-xl font-bold text-sm flex items-center gap-2 px-4 bg-primary hover:bg-primary/90"
                          onClick={() => handleViewDetails(v)}
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {totalCount > ITEMS_PER_PAGE && (
            <div className="mt-6">
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
                totalItems={totalCount}
                pageSize={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}

      {/* ─── View Details Modal ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-0">
          <DialogHeader className="px-8 pt-8 pb-4 border-b bg-primary text-white rounded-t-3xl">
            <DialogTitle className="flex items-center gap-3 text-xl font-black text-white">
              <ClipboardCheck className="w-5 h-5" />
              Follow-up Case Details
            </DialogTitle>
            {detailVerification && (
              <p className="text-white/70 text-sm font-medium mt-1">
                Audit ID: {detailVerification.id}
              </p>
            )}
          </DialogHeader>

          {detailLoading ? (
            <div className="py-24 text-center">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
              <p className="mt-3 text-sm text-slate-500 font-bold">Loading case details…</p>
            </div>
          ) : detailVerification && (
            <div className="p-8 space-y-8">
              {/* Status & Result badges */}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className={detailVerification.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 font-black px-3 py-1' : 'bg-amber-100 text-amber-700 border-amber-200 font-black px-3 py-1'}>
                  {detailVerification.status === 'COMPLETED' ? <CheckCircle2 className="w-3 h-3 mr-1 inline" /> : null}
                  {detailVerification.status}
                </Badge>
                {detailVerification.result && (
                  <Badge className={detailVerification.result === 'Correct' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 font-black px-3 py-1' : 'bg-orange-100 text-orange-700 border-orange-200 font-black px-3 py-1'}>
                    {detailVerification.result === 'Discrepancy' ? <AlertTriangle className="w-3 h-3 mr-1 inline" /> : <CheckCircle2 className="w-3 h-3 mr-1 inline" />}
                    {detailVerification.result}
                  </Badge>
                )}
              </div>

              {/* Remarks - Now at top! */}
              {detailVerification.remarks && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5" /> Follow-up Remarks & Findings
                  </p>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4 text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {detailVerification.remarks}
                  </div>
                </div>
              )}

              {/* Customer & Case Info */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Customer & Case Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <InfoRow icon={User} label="Customer Name" value={detailVerification.customerName} />
                  <InfoRow icon={Building2} label="Branch" value={detailVerification.branch} />
                  <InfoRow icon={FileText} label="Case ID" value={detailVerification.submissionId} />
                  <InfoRow icon={FileText} label="Account Type" value={detailVerification.accountType} />
                  {detailSubmission && (
                    <>
                      <InfoRow icon={User} label="KYC Officer" value={detailSubmission.createdBy?.firstName ? `${detailSubmission.createdBy.firstName} ${detailSubmission.createdBy.lastName}` : detailSubmission.branchName} />
                      <InfoRow icon={Building2} label="District" value={detailSubmission.districtName} />
                      <InfoRow icon={UserCheck} label="Authorized By" value={getAuthorizedBy(detailVerification)} />
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Review Info */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Review Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <InfoRow icon={UserCheck} label="Verified By" value={detailVerification.verifiedBy} />
                  <InfoRow icon={CalendarDays} label="Verified At" value={detailVerification.verifiedAt ? format(new Date(detailVerification.verifiedAt), 'MMM dd, yyyy – h:mm a') : undefined} />
                </div>
              </div>

              {/* Attachments */}
              {detailSubmission?.documents?.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                      <Paperclip className="w-3.5 h-3.5" /> Attachments ({detailSubmission.documents.length})
                    </p>
                    <div className="space-y-2">
                      {detailSubmission.documents.map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-primary/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-slate-100 p-2">
                              <FileText className="h-4 w-4 text-slate-400" />
                            </div>
                            <div>
                              <p className="font-bold text-sm text-slate-900">{doc.name}</p>
                              <p className="text-[10px] font-black uppercase text-slate-400">{doc.type}{doc.size ? ` · ${formatFileSize(doc.size)}` : ''}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 rounded-full"
                              disabled={activeDocumentAction !== null}
                              onClick={() => handleDocumentAccess(doc.id, doc.name, "view")}
                            >
                              {activeDocumentAction === `${doc.id}:view` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 rounded-full text-primary"
                              disabled={activeDocumentAction !== null}
                              onClick={() => handleDocumentAccess(doc.id, doc.name, "download")}
                            >
                              {activeDocumentAction === `${doc.id}:download` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Document Preview Modal ─── */}
      <Dialog open={isDocPreviewOpen} onOpenChange={setIsDocPreviewOpen}>
        <DialogContent className="max-w-6xl p-0 overflow-hidden border-none rounded-[32px] bg-slate-900/95 backdrop-blur-xl shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
          <div className="flex flex-col h-[90vh]">
            <div className="p-6 bg-slate-900 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-black text-white flex items-center gap-3">
                  <FileText className="w-5 h-5 text-primary" />
                  {activeDocPreview?.name || "Document Preview"}
                </DialogTitle>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-white/5 border-white/10 text-white/60 font-black uppercase text-[10px] tracking-widest px-2 py-0.5">
                    {activeDocPreview ? getPreviewFormatLabel(activeDocPreview) : "Unknown"}
                  </Badge>
                  {activeDocPreview?.size && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{formatFileSize(activeDocPreview.size)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeDocPreview && (
                  <Button variant="ghost" size="sm" className="h-10 rounded-full font-bold text-white hover:bg-white/10 gap-2 px-4"
                    onClick={() => handleDocumentAccess(activeDocPreview.id, activeDocPreview.name, "download")}>
                    <Download className="w-4 h-4" /> Download
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setIsDocPreviewOpen(false)}
                  className="rounded-full h-10 w-10 text-white/60 hover:text-white hover:bg-white/10">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950 p-6">
              <DocumentPreviewViewer
                file={activeDocPreview}
                files={previewableDocuments}
                onNext={goToNextDoc}
                onPrevious={goToPreviousDoc}
                currentIndex={activeDocIndex}
                className="h-full w-full rounded-2xl border border-white/5"
              />
            </div>
            <div className="p-6 bg-slate-900 border-t border-white/5 shrink-0 flex items-center justify-center gap-4">
              <Button variant="ghost" size="sm" onClick={goToPreviousDoc} disabled={activeDocIndex <= 0}
                className="h-9 rounded-full px-3 font-bold border-white/15 bg-white/10 text-white hover:bg-white/20">
                Previous
              </Button>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/60 px-3">
                {activeDocIndex >= 0 ? activeDocIndex + 1 : 0} / {previewableDocuments.length}
              </span>
              <Button variant="ghost" size="sm" onClick={goToNextDoc} disabled={activeDocIndex >= previewableDocuments.length - 1}
                className="h-9 rounded-full px-3 font-bold border-white/15 bg-white/10 text-white hover:bg-white/20">
                Next
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
