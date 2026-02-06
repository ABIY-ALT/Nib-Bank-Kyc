
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useDoc } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-mock";
import { Loader2, Settings, ShieldCheck, Clock } from "lucide-react";

interface GlobalSettings {
  autoEscalation: boolean;
  strictSla: boolean;
  lastUpdated?: string;
  updatedBy?: string;
}

export default function SystemSettingsPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const settingsRef = db ? doc(db, "settings", "global") : null;
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

  const handleSave = async () => {
    if (!db || !settingsRef) return;
    
    setLoading(true);
    try {
      await setDoc(settingsRef, {
        ...localSettings,
        lastUpdated: new Date().toISOString(),
        updatedBy: user.name
      });
      toast({
        title: "Configuration Saved",
        description: "Global system policies have been updated successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "There was an error updating the system configuration.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground">Syncing global configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System Configuration</h1>
        </div>
        <p className="text-muted-foreground text-lg">Manage global workflow parameters and automated compliance rules.</p>
      </div>

      <div className="grid gap-6 max-w-3xl">
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl">Workflow Automation</CardTitle>
            <CardDescription>Control how the system handles aging cases and escalations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 pt-8">
            <div className="flex items-center justify-between p-4 rounded-xl border bg-white shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <Label className="text-base font-bold">Auto-escalation Policy</Label>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Automatically flag and escalate cases pending for over 72 hours to regional supervisors.
                </p>
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
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Require mandatory supervisor remarks for any case that exceeds the 24-hour initial review window.
                </p>
              </div>
              <Switch 
                checked={localSettings.strictSla} 
                onCheckedChange={(val) => setLocalSettings({...localSettings, strictSla: val})}
              />
            </div>

            <div className="pt-4 border-t flex items-center justify-between">
              {localSettings.lastUpdated && (
                <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                  Last Updated: {new Date(localSettings.lastUpdated).toLocaleString()} by {localSettings.updatedBy}
                </div>
              )}
              <Button 
                onClick={handleSave} 
                disabled={loading} 
                className="px-10 font-bold shadow-lg"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save System Policies
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
