"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { SubmissionsPageContent } from "../submissions-content";
import { Zap, Loader2, Search, Info, Upload, Filter, X, ChevronDown, ChevronUp, SlidersHorizontal, FileDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getSubmissions, initiateExceptionalWorkflow } from "@/actions/submissions";
import { getGlobalSettings } from "@/actions/settings";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import Link from "next/link";
import { KYC_STATUS, EXCEPTIONAL_STATUS } from "@/lib/kyc-data";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB
const ITEMS_PER_PAGE = 10;

export default function ExceptionalCasesPage() {
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [availableCases, setAvailableCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'submittedAt', order: 'asc' });
  const [entityTypes, setEntityTypes] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [riskJustification, setRiskJustification] = useState("");
  const [remarks, setRemarks] = useState("");
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Advanced filters state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<any>({
    caseId: "",
    customerName: "",
    customerType: "",
    authorizedBranch: "",
    currentDistrict: "",
    exceptionalStatus: "",
    requestType: "",
    requestedBy: "",
    currentApprover: "",
    dispatchDatePreset: "",
    dispatchStartDate: "",
    dispatchEndDate: "",
    statusChangedDatePreset: "",
    statusChangedStartDate: "",
    statusChangedEndDate: "",
    cycleCount: "",
    hasComments: ""
  });
  const [appliedFilters, setAppliedFilters] = useState<any>({});

  const isAdmin = isSuperAdmin;
  const canTrigger = hasPermission('TRIGGER_GOVERNANCE_FLOW');
  const isDistrictDirector = hasPermission('DISTRICT_DIRECTOR_REVIEW');
  // Governance reviewers above district level see all exceptional cases (bank-wide)
  const isGlobalGovernanceReviewer =
    hasPermission('KYC_DIRECTOR_APPROVAL') ||
    hasPermission('CHIEF_RETAIL_REVIEW') ||
    hasPermission('DIVISION_MANAGER_REVIEW');

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const assignedBranches = user.assignedBranches || [];
      const branchContext = isAdmin || isGlobalGovernanceReviewer ? undefined : (user.branchName || "RESTRICTED_BRANCH");
      const branchesContext = isAdmin || isGlobalGovernanceReviewer ? undefined : (assignedBranches.length > 0 ? assignedBranches : branchContext ? [branchContext] : undefined);
      const districtContext = isDistrictDirector && !isGlobalGovernanceReviewer ? (user.districtName ?? undefined) : undefined;

      const exceptionalPromise = getSubmissions({
        isExceptional: true,
        branches: (!isDistrictDirector && !isGlobalGovernanceReviewer) ? branchesContext : undefined,
        district: districtContext,
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
        search: debouncedSearch || undefined,
        sortField: sort.field as any,
        sortOrder: sort.order,
        // Applied advanced filters
        caseId: appliedFilters.caseId || undefined,
        customerName: appliedFilters.customerName || undefined,
        entityType: appliedFilters.customerType || undefined,
        authorizedBranch: appliedFilters.authorizedBranch || undefined,
        currentDistrict: appliedFilters.currentDistrict || undefined,
        exceptionalStatus: appliedFilters.exceptionalStatus || undefined,
        requestedBy: appliedFilters.requestedBy || undefined,
        currentApprover: appliedFilters.currentApprover || undefined,
        dispatchStartDate: appliedFilters.dispatchStartDate || undefined,
        dispatchEndDate: appliedFilters.dispatchEndDate || undefined,
        statusChangedStartDate: appliedFilters.statusChangedStartDate || undefined,
        statusChangedEndDate: appliedFilters.statusChangedEndDate || undefined,
        cycleCount: appliedFilters.cycleCount ? parseInt(appliedFilters.cycleCount) : undefined,
        hasComments: appliedFilters.hasComments === "yes" ? true : (appliedFilters.hasComments === "no" ? false : undefined)
      });

      const availablePromise = getSubmissions({
        isExceptional: false,
        branches: (!isDistrictDirector && !isGlobalGovernanceReviewer) ? branchesContext : undefined,
        district: districtContext,
      });

      const [exceptionalResult, allResult] = await Promise.all([exceptionalPromise, availablePromise]);
      const activeExceptional = exceptionalResult.submissions || [];
      // SECURITY: Exclude cases that are already authorized or already in the exceptional workflow
      const available = (allResult.submissions || []).filter((candidate: any) =>
        candidate.status !== KYC_STATUS.APPROVED &&
        !activeExceptional.some((existing: any) => existing.id === candidate.id)
      );
      setSubmissions(activeExceptional);
      setTotalCount(exceptionalResult.total || 0);
      setAvailableCases(available);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  // Server-side search: the list is paginated, so a client-side match over the
  // 10 visible rows could never find a case sitting on another page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadData();
  }, [user, isAdmin, isDistrictDirector, isGlobalGovernanceReviewer, currentPage, sort, debouncedSearch, appliedFilters]);

  // Helper to count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    Object.keys(appliedFilters).forEach(key => {
      if (appliedFilters[key] && appliedFilters[key] !== "") count++;
    });
    return count;
  }, [appliedFilters]);

  // Handle filter input changes
  const handleFilterChange = (key: string, value: any) => {
    setAdvancedFilters((prev: any) => ({
      ...prev,
      [key]: value
    }));
  };

  // Apply filters
  const applyFilters = () => {
    setAppliedFilters({ ...advancedFilters });
    setCurrentPage(1); // Reset to first page
  };

  // Reset filters
  const resetFilters = () => {
    const resetState = {
      caseId: "",
      customerName: "",
      customerType: "",
      authorizedBranch: "",
      currentDistrict: "",
      exceptionalStatus: "",
      requestType: "",
      requestedBy: "",
      currentApprover: "",
      dispatchDatePreset: "",
      dispatchStartDate: "",
      dispatchEndDate: "",
      statusChangedDatePreset: "",
      statusChangedStartDate: "",
      statusChangedEndDate: "",
      cycleCount: "",
      hasComments: ""
    };
    setAdvancedFilters(resetState);
    setAppliedFilters(resetState);
    setCurrentPage(1);
  };

  // Helper to get preset dates
  const getPresetDates = (preset: string) => {
    const today = new Date();
    const start = new Date(today);
    const end = new Date(today);

    switch(preset) {
      case "today":
        return { startDate: formatDate(start), endDate: formatDate(end) };
      case "yesterday":
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { startDate: formatDate(yesterday), endDate: formatDate(yesterday) };
      case "last7days":
        const last7 = new Date(today);
        last7.setDate(last7.getDate() - 7);
        return { startDate: formatDate(last7), endDate: formatDate(end) };
      case "last30days":
        const last30 = new Date(today);
        last30.setDate(last30.getDate() - 30);
        return { startDate: formatDate(last30), endDate: formatDate(end) };
      default:
        return { startDate: "", endDate: "" };
    }
  };

  // Format date as YYYY-MM-DD
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Effect to update date range when preset changes
  useEffect(() => {
    if (advancedFilters.dispatchDatePreset) {
      const dates = getPresetDates(advancedFilters.dispatchDatePreset);
      handleFilterChange("dispatchStartDate", dates.startDate);
      handleFilterChange("dispatchEndDate", dates.endDate);
    }
  }, [advancedFilters.dispatchDatePreset]);

  useEffect(() => {
    if (advancedFilters.statusChangedDatePreset) {
      const dates = getPresetDates(advancedFilters.statusChangedDatePreset);
      handleFilterChange("statusChangedStartDate", dates.startDate);
      handleFilterChange("statusChangedEndDate", dates.endDate);
    }
  }, [advancedFilters.statusChangedDatePreset]);

  // Load entity types on mount
  useEffect(() => {
    const loadEntityTypes = async () => {
      try {
        const settings = await getGlobalSettings();
        if (settings?.entityTypes && Array.isArray(settings.entityTypes)) {
          setEntityTypes(settings.entityTypes as any[]);
        }
      } catch (error) {
        console.error("Failed to load entity types:", error);
        // Fallback to default types
        setEntityTypes([
          { id: "individual", label: "Individual" },
          { id: "joint", label: "Joint" },
          { id: "sole_proprietorship", label: "Sole Proprietorship" },
          { id: "corporate", label: "Corporate" },
          { id: "associations_organisations", label: "Associations & Organisations" },
          { id: "institutions", label: "Institutions" },
          { id: "ngos", label: "NGOs" },
          { id: "other", label: "Other" },
        ]);
      }
    };
    loadEntityTypes();
  }, []);

  const selectedCase = useMemo(() => 
    availableCases.find(c => c.id === selectedCaseId), 
  [availableCases, selectedCaseId]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];
    const term = searchTerm.toLowerCase();
    return submissions.filter(sub => 
      sub.customerName.toLowerCase().includes(term) || 
      sub.id.toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  const handleMemoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast({ variant: "destructive", title: "File is too big", description: "The file exceeds the 30MB limit." });
        return;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({ variant: "destructive", title: "Unsupported file type", description: "Only PDF or image files are allowed." });
        return;
      }
      setMemoFile(file);
    }
  };

  const handleInitiateException = async () => {
    if (!user || !selectedCaseId || !exceptionReason || !riskJustification || !memoFile) {
      toast({ variant: "destructive", title: "Information missing", description: "Please fill in all fields and attach a document." });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('id', selectedCaseId);
      formData.append('reason', exceptionReason);
      formData.append('justification', riskJustification);
      formData.append('remarks', remarks);
      formData.append('initiatedBy', user.name);
      formData.append('userId', user.id);
      formData.append('memo', memoFile);

      const res = await initiateExceptionalWorkflow(formData);
      
      if (res.success) {
        toast({ title: "Successful", description: "Case sent for review." });
        setIsAddDialogOpen(false);
        resetForm();
        await loadData();
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action failed", description: error.message || "We couldn't process this request. Please try again." });
    }
  };

  const resetForm = () => {
    setSelectedCaseId("");
    setExceptionReason("");
    setRiskJustification("");
    setRemarks("");
    setMemoFile(null);
  };

  const handleExportCSV = async () => {
    if (submissions.length === 0) {
      toast({ variant: "destructive", title: "No data to export", description: "There are no exceptional cases to export." });
      return;
    }

    setIsExporting(true);
    try {
      // Prepare CSV data
      const headers = ["Case ID", "Customer Name", "Entity Type", "Status", "Exceptional Status", "Authorized Branch", "District", "Dispatch Date", "Status Changed Date"];
      const rows = submissions.map(sub => [
        sub.id || "",
        sub.customerName || "",
        sub.entityType || "",
        sub.status || "",
        sub.exceptionalStatus || "",
        sub.branchName || "",
        sub.districtName || "",
        sub.dispatchDate ? new Date(sub.dispatchDate).toLocaleDateString() : "",
        sub.statusChangedDate ? new Date(sub.statusChangedDate).toLocaleDateString() : ""
      ]);

      // Convert to CSV string
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      // Create blob and download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().slice(0, 10);
      link.setAttribute("href", url);
      link.setAttribute("download", `exceptional-cases-${timestamp}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Success", description: `Exported ${submissions.length} exceptional cases to CSV.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Export failed", description: "Failed to export data. Please try again." });
    } finally {
      setIsExporting(false);
    }
  };

  if (permissionsLoading) return <div className="py-32 text-center"><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Special Approvals</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Review process for high-risk or non-standard verification requests.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {canTrigger && (
            <Button 
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-[#B89334] hover:bg-[#A6822D] text-white font-bold h-12 px-8 shadow-xl gap-2 rounded-lg transition-all active:scale-95"
            >
              <Zap className="w-5 h-5 fill-white" />
              Request Exception
            </Button>
          )}
          <Button 
            onClick={handleExportCSV}
            disabled={isExporting || submissions.length === 0}
            variant="outline"
            className="h-12 px-4 gap-2 rounded-lg font-bold"
            title="Export current results to CSV"
          >
            <FileDown className="w-5 h-5" />
            Export
          </Button>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search exceptions..." 
              className="pl-11 h-12 rounded-full border-2 border-yellow-600/30 focus-visible:ring-yellow-600/20 bg-white shadow-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Alert className="bg-amber-50 border-amber-200 text-amber-900 shadow-sm border-l-4 border-l-yellow-600">
        <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-xs font-bold text-amber-800 uppercase tracking-tight">
            Standard Protocol: Exceptional cases require sequential sign-off from District, Director, and Supervisor branches.
          </AlertDescription>
      </Alert>

      {/* ADVANCED FILTER CONSOLE (MATCHES DOCUMENT VAULT STYLE) */}
      <Card className="border-slate-200 shadow-xl overflow-hidden bg-white rounded-[2rem]">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div 
              className="flex items-center gap-2 text-slate-900 font-bold cursor-pointer" 
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <SlidersHorizontal className="w-5 h-5" /> Advanced Filters
              {activeFilterCount > 0 && (
                <Badge className="bg-yellow-600 hover:bg-yellow-700">{activeFilterCount} Active</Badge>
              )}
              {showAdvancedFilters ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </div>
          </div>
          
          {showAdvancedFilters && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Search (like vault's Search) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      placeholder="Case ID, Customer Name..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-11 bg-slate-50 border-slate-200 rounded-xl font-medium focus-visible:ring-primary/20"
                    />
                  </div>
                </div>

                {/* Case ID */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Case ID</label>
                  <Input 
                    placeholder="Case ID..."
                    value={advancedFilters.caseId}
                    onChange={(e) => handleFilterChange("caseId", e.target.value)}
                    className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                  />
                </div>

                {/* Customer Type */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Customer Type</label>
                  <Select 
                    value={advancedFilters.customerType} 
                    onValueChange={(v) => handleFilterChange("customerType", v)}
                  >
                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {entityTypes.map((type: any) => (
                        <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Current Status (Exceptional Status) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Status</label>
                  <Select 
                    value={advancedFilters.exceptionalStatus} 
                    onValueChange={(v) => handleFilterChange("exceptionalStatus", v)}
                  >
                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {Object.values(EXCEPTIONAL_STATUS).map(s => (
                        <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Authorized Branch */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Authorized Branch</label>
                  <Input 
                    placeholder="Branch Name..."
                    value={advancedFilters.authorizedBranch}
                    onChange={(e) => handleFilterChange("authorizedBranch", e.target.value)}
                    className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                  />
                </div>

                {/* District */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">District</label>
                  <Input 
                    placeholder="District Name..."
                    value={advancedFilters.currentDistrict}
                    onChange={(e) => handleFilterChange("currentDistrict", e.target.value)}
                    className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                  />
                </div>

                {/* Request Type */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Request Type</label>
                  <Select 
                    value={advancedFilters.requestType} 
                    onValueChange={(v) => handleFilterChange("requestType", v)}
                  >
                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="NEW_EXCEPTION">New Exception</SelectItem>
                      <SelectItem value="AMENDMENT">Amendment</SelectItem>
                      <SelectItem value="RESUBMISSION">Resubmission</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Requested By */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Requested By</label>
                  <Input 
                    placeholder="Name..."
                    value={advancedFilters.requestedBy}
                    onChange={(e) => handleFilterChange("requestedBy", e.target.value)}
                    className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                  />
                </div>

                {/* Current Approver */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Current Approver</label>
                  <Input 
                    placeholder="Name..."
                    value={advancedFilters.currentApprover}
                    onChange={(e) => handleFilterChange("currentApprover", e.target.value)}
                    className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                  />
                </div>

                {/* Has Comments */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Has Comments</label>
                  <Select 
                    value={advancedFilters.hasComments} 
                    onValueChange={(v) => handleFilterChange("hasComments", v)}
                  >
                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Cycle Count */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Cycle Count</label>
                  <Input 
                    type="number"
                    placeholder="Number..."
                    value={advancedFilters.cycleCount}
                    onChange={(e) => handleFilterChange("cycleCount", e.target.value)}
                    className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                  />
                </div>

                {/* Dispatch Date Preset */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Dispatch Date</label>
                  <Select 
                    value={advancedFilters.dispatchDatePreset} 
                    onValueChange={(v) => handleFilterChange("dispatchDatePreset", v)}
                  >
                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="last7days">Last 7 Days</SelectItem>
                      <SelectItem value="last30days">Last 30 Days</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Dispatch Date Range (if custom) */}
                {advancedFilters.dispatchDatePreset === "custom" && (
                  <div className="space-y-1.5 md:col-span-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Dispatch Date Range</label>
                    <div className="flex gap-2">
                      <Input 
                        type="date" 
                        value={advancedFilters.dispatchStartDate} 
                        onChange={(e) => handleFilterChange("dispatchStartDate", e.target.value)} 
                        className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                      />
                      <Input 
                        type="date" 
                        value={advancedFilters.dispatchEndDate} 
                        onChange={(e) => handleFilterChange("dispatchEndDate", e.target.value)} 
                        className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                      />
                    </div>
                  </div>
                )}

                {/* Status Changed Preset */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Status Changed Date</label>
                  <Select 
                    value={advancedFilters.statusChangedDatePreset} 
                    onValueChange={(v) => handleFilterChange("statusChangedDatePreset", v)}
                  >
                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="last7days">Last 7 Days</SelectItem>
                      <SelectItem value="last30days">Last 30 Days</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status Changed Range (if custom) */}
                {advancedFilters.statusChangedDatePreset === "custom" && (
                  <div className="space-y-1.5 md:col-span-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Status Changed Date Range</label>
                    <div className="flex gap-2">
                      <Input 
                        type="date" 
                        value={advancedFilters.statusChangedStartDate} 
                        onChange={(e) => handleFilterChange("statusChangedStartDate", e.target.value)} 
                        className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                      />
                      <Input 
                        type="date" 
                        value={advancedFilters.statusChangedEndDate} 
                        onChange={(e) => handleFilterChange("statusChangedEndDate", e.target.value)} 
                        className="h-11 bg-slate-50 border-slate-200 rounded-xl font-medium"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Actions */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs font-bold text-slate-500">
                  Showing {filteredSubmissions.length} of {totalCount} results
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={resetFilters} 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-600"
                  >
                    Reset Filters
                  </Button>
                  <Button 
                    onClick={applyFilters} 
                    className="h-8 bg-primary hover:bg-primary/90 text-white text-[10px] font-black uppercase tracking-widest rounded-xl"
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Synchronizing exceptions...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-6 text-center">
          <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
            <Zap className="w-12 h-12 text-slate-200" />
          </div>
          <div className="space-y-2">
            <p className="font-bold text-slate-900 text-xl">Exception Queue Empty</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">No high-risk cases currently require hierarchy oversight in your branch.</p>
          </div>
        </div>
      ) : (
        <>
          <SubmissionsPageContent submissions={filteredSubmissions || []} sort={sort} onSortChange={(field, order) => { setSort({ field, order }); setCurrentPage(1); }} />
          
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

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white space-y-1">
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl"><Zap className="w-6 h-6 text-white fill-white" /></div>
              Initiate Exceptional Flow
            </DialogTitle>
            <DialogDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest pl-11">
              Promoting case to hierarchy governance
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Case ID</Label>
                <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                  <SelectTrigger className="h-12 border-slate-200 rounded-xl font-bold"><SelectValue placeholder="Select ID..." /></SelectTrigger>
                  <SelectContent>
                    {availableCases.length === 0 ? (
                      <SelectItem value="none" disabled>No cases discovered in branch</SelectItem>
                    ) : availableCases.map(c => <SelectItem key={c.id} value={c.id}>{c.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Customer Identity</Label>
                <div className="h-12 border rounded-xl bg-slate-50 px-4 flex items-center text-sm font-black text-slate-900 truncate">
                  {selectedCase ? selectedCase.customerName : "---"}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Escalation Trigger</Label>
              <Select value={exceptionReason} onValueChange={setExceptionReason}>
                <SelectTrigger className="h-12 border-slate-200 rounded-xl font-bold"><SelectValue placeholder="Select classification..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Missing critical documents">Missing critical documents</SelectItem>
                  <SelectItem value="High deposit amount">High deposit amount</SelectItem>
                  <SelectItem value="High-risk profile">High-risk profile</SelectItem>
                  <SelectItem value="Case aging beyond SLA">Case aging beyond SLA</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Governance Justification</Label>
              <Textarea 
                placeholder="Detail why this case requires high-level sign-off..." 
                className="min-h-[100px] rounded-xl font-medium" 
                value={riskJustification} 
                onChange={(e) => setRiskJustification(e.target.value)} 
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Institutional Memo (PDF/Image)</Label>
              <div 
                onClick={() => fileInputRef.current?.click()} 
                className="border-2 border-dashed border-primary/20 rounded-2xl p-8 text-center cursor-pointer hover:bg-primary/5 transition-all bg-white group"
              >
                <div className="bg-primary/10 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <p className="text-sm font-black text-slate-900">{memoFile ? memoFile.name : "Select Signature-Authorized Memo"}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Maximum 30MB • Only PDF or Image</p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".pdf,.jpg,.jpeg,.png" 
                onChange={handleMemoChange} 
              />
            </div>
          </div>

          <DialogFooter className="p-8 bg-slate-50 border-t flex flex-row items-center justify-end gap-4 rounded-b-3xl">
            <button 
              onClick={() => setIsAddDialogOpen(false)} 
              className="text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors"
            >
              Abort Request
            </button>
            <Button 
              className="bg-primary hover:bg-primary/90 text-white font-black px-10 shadow-xl h-14 rounded-xl" 
              disabled={!selectedCaseId || !memoFile} 
              onClick={handleInitiateException}
            >
              Dispatch to Governance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
