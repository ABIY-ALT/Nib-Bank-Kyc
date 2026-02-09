
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-mock.tsx";
import { 
  Loader2, 
  Settings, 
  ShieldCheck, 
  Clock,
  Plus,
  Trash2,
  FileText,
  Users,
  Megaphone,
  AlertTriangle,
  Info
} from "lucide-react";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

interface ConfigItem {
  id: string;
  label: string;
}

interface Guideline {
  id: string;
  title: string;
  description: string;
  type: 'alert' | 'info';
}

interface GlobalSettings {
  autoEscalation: boolean;
  escalationHours: number;
  strictSla: boolean;
  slaHours: number;
  lastUpdated?: string;
  updatedBy?: string;
  documentTypes?: ConfigItem[];
  entityTypes?: ConfigItem[];
  guidelines?: Guideline[];
}

const DEFAULT_DOC_TYPES: ConfigItem[] = [
  { id: "id_card", label: "ID Card / National ID" },
  { id: "passport", label: "Passport" },
  { id: "utility_bill", label: "Utility Bill" },
  { id: "bank_statement", label: "Bank Statement" },
  { id: "incorporation", label: "Certificate of Incorporation" },
  { id: "tax_cert", label: "Tax Certificate" },
  { id: "other", label: "Other Document" },
];

const DEFAULT_ENTITY_TYPES: ConfigItem[] = [
  { id: "individual", label: "Individual" },
  { id: "corporate", label: "Corporate" },
  { id: "sme", label: "SME (Small/Medium Enterprise)" },
  { id: "ngo", label: "NGO (Non-Profit Organization)" },
];

const DEFAULT_GUIDELINES: Guideline[] = [
  { id: "risk-alert", title: "High-Risk Alert", description: "Enhanced Due Diligence (EDD) is now required for all corporate entities in the industrial sector.", type: 'alert' },
  { id: "sla-info", title: "SLA Enforcement", description: "All \"Action Required\" items must be addressed within 24 hours to maintain branch performance rankings.", type: 'info' }
];

export default function SystemSettingsPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  
  const settingsRef = useMemoFirebase(() => {
    return db ? doc(db, "settings", "global") : null;
  }, [db]);

  const { data: remoteSettings, loading: fetchLoading } = useDoc<GlobalSettings>(settingsRef);
  
  const [localSettings, setLocalSettings] = useState<GlobalSettings>({
    autoEscalation: true,
    escalationHours: 72,
    strictSla: true,
    slaHours: 24,
    documentTypes: DEFAULT_DOC_TYPES,
    entityTypes: DEFAULT_ENTITY_TYPES,
    guidelines: DEFAULT_GUIDELINES
  });

  const [newDocLabel, setNewDocLabel] = useState("");
  const [newEntityLabel, setNewEntityLabel] = useState("");
  
  const [newGuideline, setNewGuideline] = useState<Partial<Guideline>>({
    title: "",
    description: "",
    type: 'info'
  });

  useEffect(() => {
    if (remoteSettings) {
      setLocalSettings({
        ...remoteSettings,
        escalationHours: remoteSettings.escalationHours ?? 72,
        slaHours: remoteSettings.slaHours ?? 24,
        documentTypes: remoteSettings.documentTypes || DEFAULT_DOC_TYPES,
        entityTypes: remoteSettings.entityTypes || DEFAULT_ENTITY_TYPES,
        guidelines: remoteSettings.guidelines || DEFAULT_GUIDELINES
      });
    }
  }, [remoteSettings]);

  const handleSavePolicies = () => {
    if (!db || !settingsRef) return;
    
    const data = {
      ...localSettings,
      lastUpdated: new Date().toISOString(),
      updatedBy: currentUser.name
    };

    setDoc(settingsRef, data)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: settingsRef.path,
          operation: 'update',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({
      title: "Configuration Saved",
      description: "System policies, registries, and guidelines updated.",
    });
  };

  const handleAddDocType = () => {
    if (!newDocLabel.trim()) return;
    const newId = newDocLabel.toLowerCase().replace(/\s+/g, '_');
    if (localSettings.documentTypes?.some(t => t.id === newId)) {
      toast({ variant: "destructive", title: "Duplicate Entry", description: "This classification already exists." });
      return;
    }

    const updatedTypes = [...(localSettings.documentTypes || []), { id: newId, label: newDocLabel }];
    setLocalSettings({ ...localSettings, documentTypes: updatedTypes });
    setNewDocLabel("");
  };

  const handleAddEntityType = () => {
    if (!newEntityLabel.trim()) return;
    const newId = newEntityLabel.toLowerCase().replace(/\s+/g, '_');
    if (localSettings.entityTypes?.some(t => t.id === newId)) {
      toast({ variant: "destructive", title: "Duplicate Entry", description: "This entity classification already exists." });
      return;
    }

    const updatedTypes = [...(localSettings.entityTypes || []), { id: newId, label: newEntityLabel }];
    setLocalSettings({ ...localSettings, entityTypes: updatedTypes });
    setNewEntityLabel("");
  };

  const handleAddGuideline = () => {
    if (!newGuideline.title?.trim() || !newGuideline.description?.trim()) {
      toast({ variant: "destructive", title: "Missing Fields", description: "Title and description are required for guidelines." });
      return;
    }

    const id = `guide-${Date.now()}`;
    const updated = [...(localSettings.guidelines || []), { 
      id, 
      title: newGuideline.title, 
      description: newGuideline.description, 
      type: newGuideline.type as 'alert' | 'info' 
    }];
    
    setLocalSettings({ ...localSettings, guidelines: updated });
    setNewGuideline({ title: "", description: "", type: 'info' });
  };

  const handleRemoveDocType = (id: string) => {
    const updatedTypes = localSettings.documentTypes?.filter(t => t.id !== id) || [];
    setLocalSettings({ ...localSettings, documentTypes: updatedTypes });
  };

  const handleRemoveEntityType = (id: string) => {
    const updatedTypes = localSettings.entityTypes?.filter(t => t.id !== id) || [];
    setLocalSettings({ ...localSettings, entityTypes: updatedTypes });
  };

  const handleRemoveGuideline = (id: string) => {
    const updated = localSettings.guidelines?.filter(g => g.id !== id) || [];
    setLocalSettings({ ...localSettings, guidelines: updated });
  };

  if (fetchLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground">Syncing configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System Configuration</h1>
        </div>
        <p className="text-muted-foreground font-medium">Global governance and institutional policy management.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <Card className="shadow-lg border-slate-200">
            <CardHeader className="bg-slate-50/50 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Workflow Automation
              </CardTitle>
              <CardDescription>Define institutional SLA and escalation rules.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-col p-4 rounded-xl border bg-white shadow-sm gap-4 group hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-600" />
                      <Label className="text-base font-bold">Auto-escalation Policy</Label>
                    </div>
                    <p className="text-[12px] text-muted-foreground font-medium">Escalate cases pending for over {localSettings.escalationHours} hours.</p>
                  </div>
                  <Switch 
                    checked={localSettings.autoEscalation} 
                    onCheckedChange={(val) => setLocalSettings({...localSettings, autoEscalation: val})}
                  />
                </div>
                {localSettings.autoEscalation && (
                  <div className="flex items-center gap-3 pl-6 pt-2 border-t border-dashed animate-in slide-in-from-top-2 duration-300">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Escalation Window (Hours)</Label>
                    <Input 
                      type="number" 
                      className="w-24 h-9 font-bold bg-slate-50 border-primary/20" 
                      value={localSettings.escalationHours} 
                      onChange={(e) => setLocalSettings({...localSettings, escalationHours: parseInt(e.target.value) || 0})}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col p-4 rounded-xl border bg-white shadow-sm gap-4 group hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <Label className="text-base font-bold">Strict SLA Enforcement</Label>
                    </div>
                    <p className="text-[12px] text-muted-foreground font-medium">Require supervisor remarks for cases exceeding {localSettings.slaHours} hours.</p>
                  </div>
                  <Switch 
                    checked={localSettings.strictSla} 
                    onCheckedChange={(val) => setLocalSettings({...localSettings, strictSla: val})}
                  />
                </div>
                {localSettings.strictSla && (
                  <div className="flex items-center gap-3 pl-6 pt-2 border-t border-dashed animate-in slide-in-from-top-2 duration-300">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">SLA Deadline (Hours)</Label>
                    <Input 
                      type="number" 
                      className="w-24 h-9 font-bold bg-slate-50 border-primary/20" 
                      value={localSettings.slaHours} 
                      onChange={(e) => setLocalSettings({...localSettings, slaHours: parseInt(e.target.value) || 0})}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200">
            <CardHeader className="bg-slate-50/50 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-primary" />
                System Guidelines
              </CardTitle>
              <CardDescription>Manage the bulletins shown on the main dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-4 p-4 border rounded-xl bg-slate-50/50">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Alert Title</Label>
                    <Input 
                      placeholder="e.g. Policy Update" 
                      value={newGuideline.title}
                      onChange={(e) => setNewGuideline({...newGuideline, title: e.target.value})}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Alert Description</Label>
                    <Textarea 
                      placeholder="Institutional update details..." 
                      value={newGuideline.description}
                      onChange={(e) => setNewGuideline({...newGuideline, description: e.target.value})}
                      className="bg-white min-h-[80px]"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Alert Type</Label>
                      <Select 
                        value={newGuideline.type} 
                        onValueChange={(val) => setNewGuideline({...newGuideline, type: val as 'alert' | 'info'})}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alert" className="font-bold text-orange-600">High-Risk Alert (Gold)</SelectItem>
                          <SelectItem value="info" className="font-bold text-blue-600">General Update (Blue)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleAddGuideline} className="mt-6 gap-2">
                      <Plus className="w-4 h-4" /> Add Bulletin
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {localSettings.guidelines?.map((guide) => (
                  <div key={guide.id} className="flex items-start justify-between p-4 border rounded-xl bg-white group hover:border-primary/30 transition-all">
                    <div className="flex gap-3">
                      {guide.type === 'alert' ? (
                        <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                      ) : (
                        <Info className="w-5 h-5 text-blue-600 shrink-0" />
                      )}
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-900">{guide.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{guide.description}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemoveGuideline(guide.id)}
                      className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="shadow-lg border-slate-200">
            <CardHeader className="bg-slate-50/50 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Entity Classification Registry
              </CardTitle>
              <CardDescription>Manage the list of customer entity types (e.g. Individual, Corporate).</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="New entity type (e.g. Partnership)" 
                  value={newEntityLabel}
                  onChange={(e) => setNewEntityLabel(e.target.value)}
                  className="h-10"
                />
                <Button size="icon" onClick={handleAddEntityType} className="shrink-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid gap-2">
                {localSettings.entityTypes?.map((type) => (
                  <div key={type.id} className="flex items-center justify-between p-3 border rounded-lg bg-white group hover:border-primary/30 transition-all">
                    <span className="text-sm font-medium text-slate-700">{type.label}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemoveEntityType(type.id)}
                      className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200">
            <CardHeader className="bg-slate-50/50 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Document Classification Registry
              </CardTitle>
              <CardDescription>Manage the list of acceptable file types for KYC submissions.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="New document type (e.g. Utility Bill)" 
                  value={newDocLabel}
                  onChange={(e) => setNewDocLabel(e.target.value)}
                  className="h-10"
                />
                <Button size="icon" onClick={handleAddDocType} className="shrink-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid gap-2">
                {localSettings.documentTypes?.map((type) => (
                  <div key={type.id} className="flex items-center justify-between p-3 border rounded-lg bg-white group hover:border-primary/30 transition-all">
                    <span className="text-sm font-medium text-slate-700">{type.label}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemoveDocType(type.id)}
                      className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="pt-4 border-t flex items-center justify-end max-w-none">
        <Button onClick={handleSavePolicies} className="px-10 h-12 font-bold shadow-lg bg-primary hover:bg-primary/90">
          Save All System Configurations
        </Button>
      </div>
    </div>
  );
}
