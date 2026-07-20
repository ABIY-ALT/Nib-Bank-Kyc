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
  Archive
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
    }
  });

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
    setLoading(false);
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
