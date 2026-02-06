
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, setDoc, updateDoc, collection, query, orderBy } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth, User } from "@/lib/auth-mock.tsx";
import { 
  Loader2, 
  Settings, 
  ShieldCheck, 
  Clock, 
  Building2, 
  UserPlus, 
  X,
  Users
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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

  const [selectedBranch, setSelectedBranch] = useState<string>("");

  const branchesQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "branches"), orderBy("name")) : null;
  }, [db]);

  const { data: branches } = useCollection<{id: string, name: string}>(branchesQuery);

  const usersQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "users"), orderBy("name")) : null;
  }, [db]);

  const { data: allUsers } = useCollection<User>(usersQuery);

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

  const handleAssignUser = (userId: string, branchName: string) => {
    if (!db) return;
    const userRef = doc(db, "users", userId);
    const updateData = { branch: branchName };

    updateDoc(userRef, updateData)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: userRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({
      title: "Staff Reassigned",
      description: `User moved to ${branchName || 'Central HQ'}.`,
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

  const assignedUsers = allUsers?.filter(u => u.branch === selectedBranch && selectedBranch !== "") || [];
  const unassignedUsers = allUsers?.filter(u => u.branch !== selectedBranch && u.status !== 'Inactive') || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System Configuration</h1>
        </div>
        <p className="text-muted-foreground font-medium">Global governance and regional resource management.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="shadow-lg border-slate-200 h-fit">
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

        <Card className="shadow-xl border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Regional Staff Mapping
            </CardTitle>
            <CardDescription>Assign specific officers to branch locations for localized review.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Target Branch</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select a branch to manage..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Central HQ">Central HQ</SelectItem>
                  {branches?.map(b => (
                    <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBranch ? (
              <div className="grid gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-widest text-primary">Assigned Personnel</Label>
                    <Badge variant="secondary" className="font-bold">{assignedUsers.length} Users</Badge>
                  </div>
                  <ScrollArea className="h-[200px] border rounded-xl p-4 bg-slate-50/50">
                    <div className="space-y-2">
                      {assignedUsers.map(u => (
                        <div key={u.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm group">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">{u.name}</span>
                            <span className="text-[10px] text-muted-foreground font-medium uppercase">{u.role}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleAssignUser(u.id, "Central HQ")}
                            title="Unassign from Branch"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      {assignedUsers.length === 0 && (
                        <p className="text-center py-10 text-sm text-muted-foreground italic">No staff assigned to this branch.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Available for Assignment</Label>
                  <ScrollArea className="h-[200px] border rounded-xl p-4 bg-white">
                    <div className="space-y-2">
                      {unassignedUsers.map(u => (
                        <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg hover:border-primary/30 transition-all group">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">{u.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground font-medium uppercase">{u.role}</span>
                              <span className="text-[10px] text-slate-400">•</span>
                              <span className="text-[10px] text-slate-400">{u.branch || 'No Branch'}</span>
                            </div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8 text-primary hover:bg-primary hover:text-white"
                            onClick={() => handleAssignUser(u.id, selectedBranch)}
                            title={`Assign to ${selectedBranch}`}
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-50 border border-dashed rounded-2xl gap-3">
                <Users className="w-10 h-10 text-slate-300" />
                <p className="text-sm text-slate-500 font-medium">Select a branch above to manage staff assignments.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
