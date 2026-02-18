'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Users, 
  Building2, 
  UserPlus, 
  X,
  Search,
  MapPin,
  ShieldAlert,
  SearchCheck
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { getAllUsers, updateUserPortfolio } from '@/actions/users';
import { getBranches } from '@/actions/hierarchy';

export default function StaffAssignmentsPage() {
  const { toast } = useToast();
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, b] = await Promise.all([getAllUsers(), getBranches()]);
      setUsers(u || []);
      setBranches(b || []);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed", description: "Could not retrieve SQL mappings." });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBranchAssignment = async (user: any, branchName: string, isAdding: boolean) => {
    let updatedBranches = user.assignedBranches || [];
    if (isAdding) {
      if (!updatedBranches.includes(branchName)) updatedBranches = [...updatedBranches, branchName];
    } else {
      updatedBranches = updatedBranches.filter((b: string) => b !== branchName);
    }

    try {
      await updateUserPortfolio(user.id, updatedBranches);
      toast({ title: isAdding ? "Coverage Assigned" : "Coverage Revoked" });
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Update Failed", description: e.message });
    }
  };

  /**
   * Specialist Detection Logic.
   * Matches manually created roles like KYC_SPECIALIST or KYC_OFFICER.
   */
  const isSpecialist = (user: any) => {
    return user.roles?.some((ur: any) => {
      const roleName = ur.role?.name?.toUpperCase() || "";
      return roleName === 'KYC_SPECIALIST' || roleName === 'KYC_OFFICER';
    });
  };

  const assignedUsers = users.filter(u => {
    const hasSpecialistRole = isSpecialist(u);
    const isAtBranch = u.assignedBranches?.includes(selectedBranch);
    return hasSpecialistRole && isAtBranch && selectedBranch !== "";
  });

  const unassignedUsers = users.filter(u => {
    const hasSpecialistRole = isSpecialist(u);
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(searchTerm.toLowerCase());
    const isNotAtSelected = !u.assignedBranches?.includes(selectedBranch);
    const isActive = u.status === 'ACTIVE';
    return hasSpecialistRole && matchesSearch && isNotAtSelected && isActive;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Retrieving specialist directory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <SearchCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">KYC Specialist Coverage</h1>
          </div>
          <p className="text-muted-foreground text-lg">Manage multi-branch portfolios for verification staff.</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-4 shadow-lg border-slate-200 h-fit sticky top-24">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /> Jurisdiction Node</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Branch Name</Label>
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select branch..." /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex gap-2 text-amber-800">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium leading-relaxed"><strong>SLA Protocol:</strong> Portfolio assignments expand verification visibility for shared regional queues.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-8 space-y-6">
          {!selectedBranch ? (
            <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-4">
              <MapPin className="w-16 h-16 text-slate-200" />
              <p className="font-bold text-slate-900 text-xl">No Branch Selected</p>
              <p className="text-sm text-muted-foreground">Select a node from the left to manage specialist mapping.</p>
            </div>
          ) : (
            <div className="grid gap-6">
              <Card className="shadow-xl border-slate-200 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b">
                  <CardTitle className="text-xl flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Mapped KYC Specialists</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[300px]">
                    <div className="divide-y">
                      {assignedUsers.length === 0 ? (
                        <p className="p-12 text-center text-muted-foreground italic text-sm">No specialists mapped to this node.</p>
                      ) : assignedUsers.map(u => {
                        const fullName = `${u.firstName} ${u.lastName}`;
                        return (
                          <div key={u.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">{fullName.charAt(0)}</div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-900">{fullName}</span>
                                <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-white border-primary/30 text-primary font-bold">{u.assignedBranches?.length || 0} Nodes Covered</Badge>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-destructive font-bold" onClick={() => handleToggleBranchAssignment(u, selectedBranch, false)}><X className="w-4 h-4 mr-2" /> Revoke Authority</Button>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="shadow-xl border-slate-200 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b flex justify-between items-center">
                  <CardTitle className="text-xl">Network Specialist Registry</CardTitle>
                  <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input placeholder="Search staff..." className="pl-9 h-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="divide-y">
                      {unassignedUsers.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground space-y-2">
                          <Users className="w-8 h-8 mx-auto opacity-20" />
                          <p className="italic text-sm">No available specialists discovered in registry.</p>
                        </div>
                      ) : unassignedUsers.map(u => {
                        const fullName = `${u.firstName} ${u.lastName}`;
                        return (
                          <div key={u.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-primary/5 text-primary flex items-center justify-center font-bold">{fullName.charAt(0)}</div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-900">{fullName}</span>
                                <span className="text-[10px] text-muted-foreground">{u.email}</span>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="font-bold border-primary/20 text-primary hover:bg-primary hover:text-white" onClick={() => handleToggleBranchAssignment(u, selectedBranch, true)}><UserPlus className="w-4 h-4 mr-2" /> Add to Coverage</Button>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
