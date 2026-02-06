
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-mock.tsx";
import { 
  Loader2, 
  Settings, 
  ShieldCheck, 
  Clock
} from "lucide-react";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface GlobalSettings {
  autoEscalation: boolean;
  strictSla: boolean;
  lastUpdated?: string;
  updatedBy?: string;
}

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
    strictSla: true
  });

  useEffect(() => {
    if (remoteSettings) {
      setLocalSettings(remoteSettings);
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
      description: "System policies updated.",
    });
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

      <div className="grid gap-8 max-w-2xl">
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

            <div className="pt-4 border-t flex items-center justify-end">
              <Button onClick={handleSavePolicies} className="px-10 font-bold shadow-lg">
                Save System Policies
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
