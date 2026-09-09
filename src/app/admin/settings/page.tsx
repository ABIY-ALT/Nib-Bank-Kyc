'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { 
  Loader2, 
  Settings, 
  ShieldCheck, 
  Clock,
  Plus,
  Trash2,
  FileText,
  Megaphone,
  HardDrive,
  AlertTriangle,
  Info,
  Building2,
  Layers,
  Archive,
  Eye
} from "lucide-react";
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { getGlobalSettings, updateGlobalSettings } from '@/actions/settings';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';

/** Local byte formatter — the retention engine is server-only and must not be bundled here. */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function SystemSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  
  const [loading, setLoading] = useState(true);
  
  const [localSettings, setLocalSettings] = useState<any>({
    autoEscalation: true,
    escalationHours: 72,
    strictSla: true,
    slaHours: 24,
    documentTypes: [],
    entityTypes: [],
    guidelines: [],
    storageQuotaGb: 50,
    retentionConfig: {
      enabled: false,
      days: 30,
      statuses: []
    },
    autoPurgeConfig: {
      enabled: true,
      days: 6,
      keepStatuses: ['APPROVED'],
      dryRun: false
    },
    autoArchiveConfig: {
      enabled: false,
      days: 7,
      dryRun: false
    }
  });

  // Live picture of what the automatic cleanup currently holds eligible, plus
  // where the app is actually looking for the documents.
  const [autoPurgeStatus, setAutoPurgeStatus] = useState<{
    casesEligible: number;
    casesEligibleCapped: boolean;
    filesEligible: number;
    bytesEligible: number;
    storageRoot: string;
    storageRootAvailable: boolean;
    storageRootCode?: string;
    storageRootSource: string;
    filesSampled: number;
    filesFoundOnDisk: number;
    suggestedFolder?: string;
    suggestedFolderMatches?: number;
  } | null>(null);
  const [autoPurgeBusy, setAutoPurgeBusy] = useState(false);

  // Live picture of what automatic archiving would move, plus whether the
  // archive volume is actually reachable — eligibility counts come from the
  // database and cannot reveal a disconnected volume on their own.
  const [autoArchiveStatus, setAutoArchiveStatus] = useState<{
    eligibleCases: number;
    eligibleFiles: number;
    eligibleBytes: number;
    archiveRoot: string;
    archiveAvailable: boolean;
    archiveFreeBytes: number;
    archiveFreePercent: number | null;
  } | null>(null);
  const [autoArchiveBusy, setAutoArchiveBusy] = useState(false);

  const refreshAutoArchiveStatus = async () => {
    try {
      const res = await fetch('/api/admin/archive/auto', { cache: 'no-store' });
      if (!res.ok) throw new Error('unavailable');
      const data = await res.json();
      setAutoArchiveStatus({
        eligibleCases: data.eligibleCases,
        eligibleFiles: data.eligibleFiles,
        eligibleBytes: data.eligibleBytes,
        archiveRoot: data.archiveRoot,
        archiveAvailable: data.archiveAvailable,
        archiveFreeBytes: data.archiveFreeBytes,
        archiveFreePercent: data.archiveFreePercent,
      });
    } catch {
      setAutoArchiveStatus(null);
    }
  };

  const handleRunArchivingNow = async (dryRun: boolean) => {
    setAutoArchiveBusy(true);
    try {
      const res = await fetch('/api/admin/archive/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const result = await res.json();

      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Archiving failed', description: result?.error || 'Could not run the pass.' });
      } else if (!result.ran) {
        toast({ variant: 'destructive', title: 'Nothing ran', description: result.reason || 'The pass did not run.' });
      } else {
        toast({
          title: dryRun ? 'Simulation complete' : 'Archiving complete',
          description:
            `${result.filesMoved} file(s) across ${result.casesProcessed} case(s)` +
            (dryRun
              ? ' would be moved to the archive volume. Nothing was changed.'
              : ` moved, freeing ${formatBytes(result.bytesFreed)}.`) +
            (result.filesFailed > 0 ? ` ${result.filesFailed} failed.` : '') +
            (result.filesNotFreed > 0 ? ` ${result.filesNotFreed} original(s) could not be deleted.` : ''),
        });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Archiving failed', description: 'Could not reach the server.' });
    } finally {
      setAutoArchiveBusy(false);
      void refreshAutoArchiveStatus();
    }
  };

  const [newDocLabel, setNewDocLabel] = useState("");
  const [newEntityLabel, setNewEntityLabel] = useState("");
  const [newGuideline, setNewGuideline] = useState<any>({ title: "", description: "", type: 'info' });
  const [currentDocPage, setCurrentDocPage] = useState(1);
  const docPageSize = 10;

  useEffect(() => {
    if (!permissionsLoading && !hasPermission('EDIT_SLA_POLICY')) {
      router.push('/unauthorized?required=EDIT_SLA_POLICY');
    }
  }, [hasPermission, permissionsLoading, router]);

  useEffect(() => {
    loadSettings();
  }, []);

  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  
  const loadSettings = async () => {
    setLoading(true);
    const s = await getGlobalSettings();
    if (s) setLocalSettings(s);
    // Let's get available statuses from storage-vault's getVaultFilterOptions
    try {
      const { getVaultFilterOptions } = await import('@/actions/storage-vault');
      const filterOptions = await getVaultFilterOptions();
      setAvailableStatuses(filterOptions.statuses);
    } catch {
      // Fallback to common statuses
      setAvailableStatuses(['SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'ACTION_REQUIRED']);
    }
    void refreshAutoPurgeStatus();
    void refreshAutoArchiveStatus();
    setLoading(false);
  };

  const refreshAutoPurgeStatus = async () => {
    try {
      const { getAutoRetentionStatus } = await import('@/actions/storage-vault');
      const status = await getAutoRetentionStatus();
      if (status.success) {
        setAutoPurgeStatus({
          casesEligible: status.casesEligible,
          casesEligibleCapped: status.casesEligibleCapped,
          filesEligible: status.filesEligible,
          bytesEligible: status.bytesEligible,
          storageRoot: status.storageRoot,
          storageRootAvailable: status.storageRootAvailable,
          storageRootCode: status.storageRootCode,
          storageRootSource: status.storageRootSource,
          filesSampled: status.filesSampled,
          filesFoundOnDisk: status.filesFoundOnDisk,
          suggestedFolder: status.suggestedFolder,
          suggestedFolderMatches: status.suggestedFolderMatches,
        });
      }
    } catch {
      setAutoPurgeStatus(null);
    }
  };

  const handleRunCleanupNow = async () => {
    setAutoPurgeBusy(true);
    try {
      const { runAutoRetentionNow } = await import('@/actions/storage-vault');
      const response = await runAutoRetentionNow({ force: true });
      if (!response.success) {
        toast({ variant: 'destructive', title: 'Cleanup failed', description: response.error });
        return;
      }
      const result = response.result;
      if (!result.ran) {
        toast({ title: 'Cleanup skipped', description: result.skippedReason });
        return;
      }
      if (result.storageWarning) {
        toast({ variant: 'destructive', title: 'Storage path problem', description: result.storageWarning });
        return;
      }
      toast({
        title: result.config.dryRun ? 'Dry run complete' : 'Storage freed',
        description:
          `${result.filesPurged} file(s) across ${result.casesProcessed} case(s) — ${formatBytes(result.bytesFreed)}.` +
          (result.filesMissing > 0 ? ` ${result.filesMissing} stale record(s) cleared.` : '') +
          (result.filesBlocked > 0 ? ` ${result.filesBlocked} file(s) were locked and will be retried.` : '') +
          (result.moreRemaining ? ' More cases remain and will be handled on the next pass.' : ''),
      });
    } finally {
      setAutoPurgeBusy(false);
      void refreshAutoPurgeStatus();
    }
  };

  const documentTypeCount = localSettings.documentTypes?.length || 0;
  const totalDocPages = Math.max(1, Math.ceil(documentTypeCount / docPageSize));
  const documentTypesPage = localSettings.documentTypes?.slice((currentDocPage - 1) * docPageSize, currentDocPage * docPageSize) || [];
  const visibleGuidelines = (localSettings.guidelines || []).filter((guide: any) => guide?.kind !== 'storageQuota' && guide?.id !== '__storage_quota__');

  useEffect(() => {
    setCurrentDocPage((page) => Math.max(1, Math.min(page, totalDocPages)));
  }, [totalDocPages]);

  const handleSavePolicies = async () => {
    await updateGlobalSettings({
      ...localSettings,
      updatedBy: currentUser?.name
    });
    toast({ title: "Successful", description: "System configuration updated." });
  };

  const handleAddDocType = () => {
    if (!newDocLabel.trim()) return;
    const id = newDocLabel.toLowerCase().replace(/\s+/g, '_');
    const updated = [...(localSettings.documentTypes || []), { id, label: newDocLabel }];
    setLocalSettings({ ...localSettings, documentTypes: updated });
    setNewDocLabel("");
  };

  const handleRemoveDocType = (id: string) => {
    const updated = localSettings.documentTypes.filter((t: any) => t.id !== id);
    setLocalSettings({ ...localSettings, documentTypes: updated });
  };

  const handleAddEntityType = () => {
    if (!newEntityLabel.trim()) return;
    const id = newEntityLabel.toLowerCase().replace(/\s+/g, '_');
    const updated = [...(localSettings.entityTypes || []), { id, label: newEntityLabel }];
    setLocalSettings({ ...localSettings, entityTypes: updated });
    setNewEntityLabel("");
  };

  const handleRemoveEntityType = (id: string) => {
    const updated = localSettings.entityTypes.filter((t: any) => t.id !== id);
    setLocalSettings({ ...localSettings, entityTypes: updated });
  };

  const handleAddGuideline = () => {
    if (!newGuideline.title.trim() || !newGuideline.description.trim()) {
      toast({ variant: "destructive", title: "Information Required", description: "Title and description are mandatory for guidelines." });
      return;
    }
    const id = crypto.randomUUID();
    const updated = [...(localSettings.guidelines || []), { ...newGuideline, id }];
    setLocalSettings({ ...localSettings, guidelines: updated });
    setNewGuideline({ title: "", description: "", type: 'info' });
    toast({ title: "Guideline Staged", description: "Click 'Save Settings' to publish." });
  };

  const handleRemoveGuideline = (id: string) => {
    const updated = localSettings.guidelines.filter((g: any) => g.id !== id);
    setLocalSettings({ ...localSettings, guidelines: updated });
  };

  if (loading || permissionsLoading) return <div className="py-24 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System Configuration</h1>
        </div>
        <p className="text-muted-foreground font-medium">Overall governance and policy management.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-primary text-white border-b">
              <CardTitle className="text-xl flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-white" /> Workflow Automation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-col p-4 rounded-xl border bg-white shadow-sm gap-4 group hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-600" />
                      <Label className="text-base font-bold">Escalation Threshold</Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase px-6">Identify cases for manual supervisor escalation after threshold</p>
                  </div>
                  <Switch checked={localSettings.autoEscalation} onCheckedChange={(val) => setLocalSettings({...localSettings, autoEscalation: val})} />
                </div>
                {localSettings.autoEscalation && (
                  <div className="flex items-center gap-3 pl-6 pt-2 border-t border-dashed">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Breach Hours</Label>
                    <Input type="number" className="w-24 h-9 font-bold" value={localSettings.escalationHours} onChange={(e) => setLocalSettings({...localSettings, escalationHours: parseInt(e.target.value) || 0})} />
                  </div>
                )}
              </div>

              <div className="flex flex-col p-4 rounded-xl border bg-slate-50/70 shadow-sm gap-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" />
                  <Label className="text-base font-bold">Storage Quota</Label>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase px-1">Set the institutional vault quota shown on the storage dashboard</p>
                <div className="flex items-center gap-3 px-1">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    className="w-32 h-9 font-bold"
                    value={localSettings.storageQuotaGb !== undefined && localSettings.storageQuotaGb !== null ? localSettings.storageQuotaGb : ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw.trim() === '') {
                        setLocalSettings({ ...localSettings, storageQuotaGb: undefined })
                      } else {
                        const parsed = parseInt(raw)
                        setLocalSettings({ ...localSettings, storageQuotaGb: Number.isFinite(parsed) ? parsed : undefined })
                      }
                    }}
                  />
                  <span className="text-sm font-semibold text-slate-500">GB</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-primary text-white border-b">
              <CardTitle className="text-xl flex items-center gap-2"><Archive className="w-5 h-5 text-white" /> Document Retention Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-col p-4 rounded-xl border bg-white shadow-sm gap-4 group hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-600" />
                      <Label className="text-base font-bold">Enable Retention Reminders</Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase px-6">Show cases that exceed the retention period in the vault</p>
                  </div>
                  <Switch 
                    checked={localSettings.retentionConfig?.enabled || false} 
                    onCheckedChange={(val) => setLocalSettings({
                      ...localSettings,
                      retentionConfig: { ...localSettings.retentionConfig, enabled: val }
                    })} 
                  />
                </div>
                {localSettings.retentionConfig?.enabled && (
                  <>
                    <div className="flex items-center gap-3 pl-6 pt-2 border-t border-dashed">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Retention Period (Days)</Label>
                      <Input 
                        type="number" 
                        min="1"
                        className="w-24 h-9 font-bold" 
                        value={typeof localSettings.retentionConfig?.days === 'number' ? String(localSettings.retentionConfig.days) : (localSettings.retentionConfig?.days || "")} 
                        onChange={(e) => {
                          const rawValue = e.target.value;
                          setLocalSettings({
                            ...localSettings,
                            retentionConfig: { 
                              ...localSettings.retentionConfig, 
                              days: rawValue === "" ? "" : (parseInt(rawValue, 10) || 30)
                            }
                          });
                        }} 
                      />
                    </div>
                    <div className="flex flex-col gap-2 pl-6 pt-2 border-t border-dashed">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Apply to Statuses (Optional)</Label>
                      <div className="flex flex-wrap gap-2">
                        {availableStatuses.map(status => (
                          <div key={status} className="flex items-center gap-2">
                            <Checkbox 
                              id={`status-${status}`} 
                              checked={(localSettings.retentionConfig?.statuses || []).includes(status)} 
                              onCheckedChange={(checked) => {
                                const newStatuses = checked 
                                  ? [...(localSettings.retentionConfig?.statuses || []), status]
                                  : (localSettings.retentionConfig?.statuses || []).filter((s: string) => s !== status);
                                setLocalSettings({
                                  ...localSettings,
                                  retentionConfig: { 
                                    ...localSettings.retentionConfig, 
                                    statuses: newStatuses 
                                  }
                                });
                              }}
                            />
                            <Label 
                              htmlFor={`status-${status}`} 
                              className="text-xs font-medium cursor-pointer"
                            >
                              {status}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-primary text-white border-b">
              <CardTitle className="text-xl flex items-center gap-2"><Trash2 className="w-5 h-5 text-white" /> Automatic Storage Cleanup</CardTitle>
              <CardDescription className="text-white/80 text-xs">
                Frees server disk on its own — no manual deletion needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-col p-4 rounded-xl border bg-white shadow-sm gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-red-600" />
                      <Label className="text-base font-bold">Delete Documents of Un-Approved Cases</Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase px-6">
                      Runs hourly. Permanently removes uploaded files once a case has gone unapproved past the limit.
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.autoPurgeConfig?.enabled ?? true}
                    onCheckedChange={(val) => setLocalSettings({
                      ...localSettings,
                      autoPurgeConfig: { ...localSettings.autoPurgeConfig, enabled: val }
                    })}
                  />
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-medium text-red-800 leading-relaxed">
                    Deletion is permanent — the files cannot be recovered afterwards. The case record, its status
                    and all reporting figures are kept; only the uploaded documents are removed. Documents already
                    moved to the archive volume are never touched.
                  </p>
                </div>

                {(localSettings.autoPurgeConfig?.enabled ?? true) && (
                  <>
                    <div className="flex items-center gap-3 pl-6 pt-2 border-t border-dashed">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Delete After (Days From First Upload)</Label>
                      <Input
                        type="number"
                        min="1"
                        className="w-24 h-9 font-bold"
                        value={
                          typeof localSettings.autoPurgeConfig?.days === 'number'
                            ? String(localSettings.autoPurgeConfig.days)
                            : (localSettings.autoPurgeConfig?.days || "")
                        }
                        onChange={(e) => {
                          const rawValue = e.target.value;
                          setLocalSettings({
                            ...localSettings,
                            autoPurgeConfig: {
                              ...localSettings.autoPurgeConfig,
                              days: rawValue === "" ? "" : (parseInt(rawValue, 10) || 6)
                            }
                          });
                        }}
                      />
                    </div>

                    <div className="flex flex-col gap-2 pl-6 pt-2 border-t border-dashed">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Never Delete These Statuses</Label>
                      <div className="flex flex-wrap gap-2">
                        {availableStatuses.map(status => (
                          <div key={`keep-${status}`} className="flex items-center gap-2">
                            <Checkbox
                              id={`keep-status-${status}`}
                              checked={(localSettings.autoPurgeConfig?.keepStatuses || []).includes(status)}
                              onCheckedChange={(checked) => {
                                const current = localSettings.autoPurgeConfig?.keepStatuses || [];
                                const newStatuses = checked
                                  ? [...current, status]
                                  : current.filter((s: string) => s !== status);
                                setLocalSettings({
                                  ...localSettings,
                                  autoPurgeConfig: { ...localSettings.autoPurgeConfig, keepStatuses: newStatuses }
                                });
                              }}
                            />
                            <Label htmlFor={`keep-status-${status}`} className="text-xs font-medium cursor-pointer">
                              {status}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium">
                        Everything not ticked here is eligible for deletion once it passes the day limit.
                      </p>
                    </div>

                    <div className="flex items-center justify-between pl-6 pt-2 border-t border-dashed">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Simulation Mode</Label>
                        <p className="text-[10px] text-muted-foreground font-medium">
                          Log what would be deleted without deleting anything.
                        </p>
                      </div>
                      <Switch
                        checked={localSettings.autoPurgeConfig?.dryRun || false}
                        onCheckedChange={(val) => setLocalSettings({
                          ...localSettings,
                          autoPurgeConfig: { ...localSettings.autoPurgeConfig, dryRun: val }
                        })}
                      />
                    </div>
                  </>
                )}

                {/* Where the app actually stores documents — the same folder uploads
                    write to. Shown because eligibility counts come from the database
                    and cannot reveal whether the files are really there. */}
                {autoPurgeStatus && (
                  <div className="pl-6 pt-3 border-t border-dashed space-y-1">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Document Folder</Label>
                    <p className="text-[11px] font-mono break-all text-slate-700">{autoPurgeStatus.storageRoot}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      Using this path because: {autoPurgeStatus.storageRootSource}.
                    </p>
                    {!autoPurgeStatus.storageRootAvailable ? (
                      <p className="text-[11px] font-semibold text-red-700">
                        This folder does not exist on this server ({autoPurgeStatus.storageRootCode}). It is the same
                        folder uploads are written to, so nothing has been stored here — cleanup will free nothing and
                        will not touch any record.
                      </p>
                    ) : autoPurgeStatus.filesSampled > 0 ? (
                      <p className={cn(
                        "text-[11px] font-semibold",
                        autoPurgeStatus.filesFoundOnDisk === 0 ? "text-red-700" : "text-slate-600"
                      )}>
                        {autoPurgeStatus.filesFoundOnDisk} of {autoPurgeStatus.filesSampled} checked document(s) were
                        found here.
                        {autoPurgeStatus.filesFoundOnDisk === 0 &&
                          ' The database describes documents that are not in this folder, so cleanup will keep every record instead of deleting them.'}
                      </p>
                    ) : null}

                    {/* The documents were located elsewhere — name the folder so the
                        path can be corrected without deducing it from the launch dir. */}
                    {autoPurgeStatus.suggestedFolder && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 mt-2 space-y-1">
                        <p className="text-[11px] font-bold text-amber-900">
                          Your documents were found in a different folder:
                        </p>
                        <p className="text-[11px] font-mono break-all text-amber-900">
                          {autoPurgeStatus.suggestedFolder}
                        </p>
                        <p className="text-[11px] font-medium text-amber-800">
                          {autoPurgeStatus.suggestedFolderMatches} of the checked documents are there. To use it, add
                          this line to the server&apos;s .env file and restart:
                        </p>
                        <p className="text-[11px] font-mono break-all bg-white/70 rounded px-2 py-1 text-amber-900">
                          UPLOAD_DIR_PATH={autoPurgeStatus.suggestedFolder}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pl-6 pt-3 border-t border-dashed">
                  <p className="text-[11px] font-semibold text-slate-600">
                    {autoPurgeStatus
                      ? autoPurgeStatus.casesEligible === 0
                        ? 'Nothing is currently past the limit.'
                        : `Currently eligible: ${autoPurgeStatus.casesEligible.toLocaleString()}${autoPurgeStatus.casesEligibleCapped ? '+' : ''} case(s), ${autoPurgeStatus.filesEligible.toLocaleString()} file(s), ${formatBytes(autoPurgeStatus.bytesEligible)}.`
                      : 'Eligibility figures unavailable.'}
                  </p>
                  {hasPermission('PURGE_VAULT_STORAGE') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRunCleanupNow}
                      disabled={autoPurgeBusy}
                      className="border-red-200 text-red-700 hover:bg-red-50"
                    >
                      {autoPurgeBusy
                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        : <Trash2 className="w-4 h-4 mr-2" />}
                      Run Cleanup Now
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground font-medium pl-6">
                  Save first — “Run Cleanup Now” applies the saved policy, not unsaved edits. Otherwise changes take
                  effect on the next hourly pass.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-primary text-white border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-white" /> Automatic Archive Tiering
              </CardTitle>
              <CardDescription className="text-white/80 text-xs">
                Moves settled cases off the server onto the archive volume, on its own.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-col p-4 rounded-xl border bg-white shadow-sm gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-amber-600" />
                      <Label className="text-base font-bold">Move Approved Cases To The Archive Volume</Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase px-6">
                      Copies each document to the archive, verifies it, then frees the space here.
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.autoArchiveConfig?.enabled ?? false}
                    onCheckedChange={(val) => setLocalSettings({
                      ...localSettings,
                      autoArchiveConfig: { ...localSettings.autoArchiveConfig, enabled: val }
                    })}
                  />
                </div>

                {/* The volume is a hand-off point, not a store: until IT copies it,
                    it holds the only copy of everything moved there. */}
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-medium text-amber-900 leading-relaxed">
                    Nothing is deleted — documents stay readable, served from the archive volume. This never clears
                    the volume: once IT has copied it into the institutional backup, confirm that in Master Archive
                    to free it for the next batch.
                  </p>
                </div>

                {(localSettings.autoArchiveConfig?.enabled ?? false) && (
                  <>
                    <div className="flex items-center gap-3 pl-6 pt-2 border-t border-dashed">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Move After (Days From Approval)</Label>
                      <Input
                        type="number"
                        min="1"
                        className="w-24 h-9 font-bold"
                        value={
                          typeof localSettings.autoArchiveConfig?.days === 'number'
                            ? String(localSettings.autoArchiveConfig.days)
                            : (localSettings.autoArchiveConfig?.days || "")
                        }
                        onChange={(e) => {
                          const rawValue = e.target.value;
                          setLocalSettings({
                            ...localSettings,
                            autoArchiveConfig: {
                              ...localSettings.autoArchiveConfig,
                              days: rawValue === "" ? "" : (parseInt(rawValue, 10) || 7)
                            }
                          });
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between pl-6 pt-2 border-t border-dashed">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Simulation Mode</Label>
                        <p className="text-[10px] text-muted-foreground font-medium">
                          Log what would be moved without moving anything. Use this first.
                        </p>
                      </div>
                      <Switch
                        checked={localSettings.autoArchiveConfig?.dryRun || false}
                        onCheckedChange={(val) => setLocalSettings({
                          ...localSettings,
                          autoArchiveConfig: { ...localSettings.autoArchiveConfig, dryRun: val }
                        })}
                      />
                    </div>
                  </>
                )}

                {autoArchiveStatus && (
                  <div className="pl-6 pt-3 border-t border-dashed space-y-1">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Archive Volume</Label>
                    <p className="text-[11px] font-mono break-all text-slate-700">{autoArchiveStatus.archiveRoot}</p>
                    {autoArchiveStatus.archiveAvailable ? (
                      <p className={cn(
                        "text-[11px] font-semibold",
                        (autoArchiveStatus.archiveFreePercent ?? 100) < 10 ? "text-red-700" : "text-slate-600"
                      )}>
                        {formatBytes(autoArchiveStatus.archiveFreeBytes)} free
                        {autoArchiveStatus.archiveFreePercent !== null &&
                          ` (${autoArchiveStatus.archiveFreePercent.toFixed(0)}% of the volume)`}
                        {(autoArchiveStatus.archiveFreePercent ?? 100) < 5 &&
                          ' — below the 5% minimum, so archiving is paused until the volume is cleared.'}
                      </p>
                    ) : (
                      <p className="text-[11px] font-semibold text-red-700">
                        This volume is not reachable from this server. Archiving will not run until it is connected —
                        no files are moved and no record is changed.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pl-6 pt-3 border-t border-dashed">
                  <p className="text-[11px] font-semibold text-slate-600">
                    {autoArchiveStatus
                      ? autoArchiveStatus.eligibleCases === 0
                        ? 'Nothing is currently old enough to move.'
                        : `Currently eligible: ${autoArchiveStatus.eligibleCases.toLocaleString()} case(s), ${autoArchiveStatus.eligibleFiles.toLocaleString()} file(s), ${formatBytes(autoArchiveStatus.eligibleBytes)}.`
                      : 'Eligibility figures unavailable.'}
                  </p>
                  {hasPermission('DOWNLOAD_MASTER_ARCHIVE') && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRunArchivingNow(true)}
                        disabled={autoArchiveBusy}
                      >
                        {autoArchiveBusy
                          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          : <Eye className="w-4 h-4 mr-2" />}
                        Simulate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRunArchivingNow(false)}
                        disabled={autoArchiveBusy}
                        className="border-amber-200 text-amber-700 hover:bg-amber-50"
                      >
                        {autoArchiveBusy
                          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          : <Archive className="w-4 h-4 mr-2" />}
                        Archive Now
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground font-medium pl-6">
                  Save first — these buttons apply the saved policy, not unsaved edits. Otherwise changes take effect
                  on the next scheduled pass, with no restart needed.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-primary text-white border-b"><CardTitle className="text-xl flex items-center gap-2"><Building2 className="w-5 h-5 text-white" /> Customer Classifications</CardTitle></CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="New customer classification (e.g. Individual)..." 
                  value={newEntityLabel} 
                  onChange={(e) => setNewEntityLabel(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && handleAddEntityType()}
                />
                <Button size="icon" onClick={handleAddEntityType} className="bg-primary hover:bg-primary/90 text-white">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid gap-2">
                {localSettings.entityTypes?.length > 0 ? (
                  localSettings.entityTypes.map((type: any) => (
                    <div key={type.id} className="flex items-center justify-between p-3 border rounded-lg bg-white group hover:border-primary/30 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-slate-50 rounded text-slate-400"><Layers className="w-3.5 h-3.5" /></div>
                        <span className="text-sm font-bold text-slate-700">{type.label}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveEntityType(type.id)} className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-6 text-muted-foreground italic border-2 border-dashed rounded-lg">No entity types defined.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-primary text-white border-b"><CardTitle className="text-xl flex items-center gap-2"><FileText className="w-5 h-5 text-white" /> Document Classifications</CardTitle></CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="New type (e.g. National ID)..." 
                  value={newDocLabel} 
                  onChange={(e) => setNewDocLabel(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDocType()}
                />
                <Button size="icon" onClick={handleAddDocType} className="bg-primary hover:bg-primary/90 text-white">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid gap-2">
                {documentTypesPage.length > 0 ? (
                  documentTypesPage.map((type: any) => (
                    <div key={type.id} className="flex items-center justify-between p-3 border rounded-lg bg-white group hover:border-primary/30 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-slate-50 rounded text-slate-400"><FileText className="w-3.5 h-3.5" /></div>
                        <span className="text-sm font-bold text-slate-700">{type.label}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveDocType(type.id)} className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-6 text-muted-foreground italic border-2 border-dashed rounded-lg">No document types defined.</p>
                )}
              </div>
              {documentTypeCount > docPageSize && (
                <div className="flex items-center justify-between gap-3 pt-4">
                  <div className="text-sm text-slate-500">Page {currentDocPage} of {totalDocPages}</div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentDocPage((page) => Math.max(1, page - 1))}
                      disabled={currentDocPage === 1}
                      className="h-9 rounded-xl border-slate-200 bg-white font-bold text-slate-600 hover:text-primary"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentDocPage((page) => Math.min(totalDocPages, page + 1))}
                      disabled={currentDocPage >= totalDocPages}
                      className="h-9 rounded-xl border-slate-200 bg-white font-bold text-slate-600 hover:text-primary"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-primary text-white border-b">
              <CardTitle className="text-xl flex items-center gap-2 text-white">
                <Megaphone className="w-5 h-5 text-white" /> Overall Guidelines
              </CardTitle>
              <CardDescription className="text-white/70">Publish critical policy updates to the user dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-4 p-4 rounded-xl border bg-slate-50/30">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Title</Label>
                    <Input 
                      placeholder="Guideline Title..." 
                      value={newGuideline.title} 
                      onChange={(e) => setNewGuideline({ ...newGuideline, title: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notice Type</Label>
                    <Select 
                      value={newGuideline.type} 
                      onValueChange={(val) => setNewGuideline({ ...newGuideline, type: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Information (Blue)</SelectItem>
                        <SelectItem value="alert">Alert (Orange)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Description</Label>
                  <Textarea 
                    placeholder="Provide detailed policy context..." 
                    className="min-h-[80px]"
                    value={newGuideline.description}
                    onChange={(e) => setNewGuideline({ ...newGuideline, description: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddGuideline} className="w-full gap-2 font-bold shadow-sm">
                  <Plus className="w-4 h-4" /> Publish Guideline
                </Button>
              </div>

              <div className="space-y-3 pt-2">
                {visibleGuidelines.length > 0 ? (
                  visibleGuidelines.map((guide: any) => (
                    <div key={guide.id} className="flex items-start justify-between p-4 border rounded-xl bg-white group hover:border-primary/30 transition-all">
                      <div className="flex gap-3">
                        <div className={cn(
                          "p-2 rounded-lg h-fit",
                          guide.type === 'alert' ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                        )}>
                          {guide.type === 'alert' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{guide.title}</p>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{guide.description}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveGuideline(guide.id)} className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-10 text-muted-foreground italic border-2 border-dashed rounded-xl">No active guidelines published.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="pt-4 border-t flex items-center justify-end"><Button onClick={handleSavePolicies} className="px-10 h-12 font-bold shadow-lg bg-primary text-white">Save Settings</Button></div>
    </div>
  );
}
