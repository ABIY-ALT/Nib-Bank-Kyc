'use client';

import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { getGlobalSettings, updateGlobalSettings } from '@/actions/settings';

export default function SystemSettingsPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  
  const [localSettings, setLocalSettings] = useState<any>({
    autoEscalation: true,
    escalationHours: 72,
    strictSla: true,
    slaHours: 24,
    documentTypes: [],
    entityTypes: [],
    guidelines: []
  });

  const [newDocLabel, setNewDocLabel] = useState("");
  const [newEntityLabel, setNewEntityLabel] = useState("");
  const [newGuideline, setNewGuideline] = useState<any>({ title: "", description: "", type: 'info' });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const s = await getGlobalSettings();
    setLocalSettings(s);
    setLoading(false);
  };

  const handleSavePolicies = async () => {
    await updateGlobalSettings({
      ...localSettings,
      updatedBy: currentUser?.name
    });
    toast({ title: "Configuration Saved", description: "System policies updated in SQL." });
  };

  const handleAddDocType = () => {
    const id = newDocLabel.toLowerCase().replace(/\s+/g, '_');
    const updated = [...(localSettings.documentTypes || []), { id, label: newDocLabel }];
    setLocalSettings({ ...localSettings, documentTypes: updated });
    setNewDocLabel("");
  };

  const handleRemoveDocType = (id: string) => {
    const updated = localSettings.documentTypes.filter((t: any) => t.id !== id);
    setLocalSettings({ ...localSettings, documentTypes: updated });
  };

  if (loading) return <div className="py-24 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System Configuration</h1>
        </div>
        <p className="text-muted-foreground font-medium">Global SQL governance and institutional policy management.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <Card className="shadow-lg border-slate-200">
            <CardHeader className="bg-slate-50/50 border-b"><CardTitle className="text-xl flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Workflow Automation</CardTitle></CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-col p-4 rounded-xl border bg-white shadow-sm gap-4 group hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <div className="space-y-1"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-orange-600" /><Label className="text-base font-bold">Auto-escalation Policy</Label></div></div>
                  <Switch checked={localSettings.autoEscalation} onCheckedChange={(val) => setLocalSettings({...localSettings, autoEscalation: val})} />
                </div>
                {localSettings.autoEscalation && (
                  <div className="flex items-center gap-3 pl-6 pt-2 border-t border-dashed"><Label className="text-[10px] font-black uppercase text-slate-400">Hours</Label><Input type="number" className="w-24 h-9 font-bold" value={localSettings.escalationHours} onChange={(e) => setLocalSettings({...localSettings, escalationHours: parseInt(e.target.value) || 0})} /></div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="shadow-lg border-slate-200">
            <CardHeader className="bg-slate-50/50 border-b"><CardTitle className="text-xl flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Document Classifications</CardTitle></CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2"><Input placeholder="New type..." value={newDocLabel} onChange={(e) => setNewDocLabel(e.target.value)} /><Button size="icon" onClick={handleAddDocType}><Plus className="w-4 h-4" /></Button></div>
              <div className="grid gap-2">{localSettings.documentTypes?.map((type: any) => (
                <div key={type.id} className="flex items-center justify-between p-3 border rounded-lg bg-white group hover:border-primary/30 transition-all"><span className="text-sm font-medium text-slate-700">{type.label}</span><Button variant="ghost" size="icon" onClick={() => handleRemoveDocType(type.id)} className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></Button></div>
              ))}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="pt-4 border-t flex items-center justify-end"><Button onClick={handleSavePolicies} className="px-10 h-12 font-bold shadow-lg bg-primary">Save Institutional Settings</Button></div>
    </div>
  );
}
