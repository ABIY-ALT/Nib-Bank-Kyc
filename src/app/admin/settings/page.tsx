
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
  FileText
} from "lucide-react";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface DocType {
  id: string;
  label: string;
}

interface GlobalSettings {
  autoEscalation: boolean;
  strictSla: boolean;
  lastUpdated?: string;
  updatedBy?: string;
  documentTypes?: DocType[];
}

const DEFAULT_DOC_TYPES: DocType[] = [
  { id: "id_card", label: "ID Card / National ID" },
  { id: "passport", label: "Passport" },
  { id: "utility_bill", label: "Utility Bill" },
  { id: "bank_statement", label: "Bank Statement" },
  { id: "incorporation", label: "Certificate of Incorporation" },
  { id: "tax_cert", label: "Tax Certificate" },
  { id: "other", label: "Other Document" },
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
    strictSla: true,
    documentTypes: DEFAULT_DOC_TYPES
  });

  const [newDocLabel, setNewDocLabel] = useState("");

  useEffect(() => {
    if (remoteSettings) {
      setLocalSettings({
        ...remoteSettings,
        documentTypes: remoteSettings.documentTypes || DEFAULT_DOC_TYPES
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
      description: "System policies and classification registry updated.",
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

  const handleRemoveDocType = (id: string) => {
    const updatedTypes = localSettings.documentTypes?.filter(t => t.id !== id) || [];
    setLocalSettings({ ...localSettings, documentTypes: updatedTypes });
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
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Workflow Automation
            </CardTitle>
            <CardDescription>Define institutional SLA and escalation rules.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="flex items-center justify-between p-4 rounded-xl border bg-white shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <Label className="text-base font-bold">Auto-escalation Policy</Label>
                </div>
                <p className="text-sm text-muted-foreground">Escalate cases pending for over 72 hours.</p>
              </div>
              <Switch 
                checked={localSettings.autoEscalation} 
                onCheckedChange={(val) => setLocalSettings({...localSettings, autoEscalation: val})}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border bg-white shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <Label className="text-base font-bold">Strict SLA Enforcement</Label>
                </div>
                <p className="text-sm text-muted-foreground">Require supervisor remarks for cases exceeding 24 hours.</p>
              </div>
              <Switch 
                checked={localSettings.strictSla} 
                onCheckedChange={(val) => setLocalSettings({...localSettings, strictSla: val})}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 h-fit">
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
                placeholder="New classification name (e.g. Utility Bill)" 
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

      <div className="pt-4 border-t flex items-center justify-end max-w-none">
        <Button onClick={handleSavePolicies} className="px-10 h-12 font-bold shadow-lg">
          Save All System Configurations
        </Button>
      </div>
    </div>
  );
}
