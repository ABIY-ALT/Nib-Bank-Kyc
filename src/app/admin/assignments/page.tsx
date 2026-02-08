'use client';

import { useState } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { doc, updateDoc, collection, query, orderBy } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/lib/auth-mock.tsx";
import { 
  Loader2, 
  Users, 
  Building2, 
  UserPlus, 
  X,
  Search,
  MapPin,
  ArrowRightLeft,
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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';

export default function StaffAssignmentsPage() {
  const db = useFirestore();
  const { toast } = useToast();
  
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const branchesQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "branches"), orderBy("name")) : null;
  }, [db]);

  const { data: branches, loading: branchesLoading } = useCollection<{id: string, name: string}>(branchesQuery);

  const usersQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "users"), orderBy("name")) : null;
  }, [db]);

  const { data: allUsers, loading: usersLoading } = useCollection<User>(usersQuery);

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
      title: "Specialist Reassigned",
      description: `KYC verification mapping updated to ${branchName || 'Central HQ'}.`,
    });
  };

  // Filter only for KYC Officers as requested
  const assignedUsers = allUsers?.filter(u => 
    u.role === 'KYC Officer' && 
    u.branch === selectedBranch && 
    selectedBranch !== ""
  ) || [];

  const unassignedUsers = allUsers?.filter(u => {
    const isKYCOfficer = u.role === 'KYC Officer';
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase());
    const isNotAtSelected = u.branch !== selectedBranch;
    const isActive = u.status !== 'Inactive';
    return isKYCOfficer && matchesSearch && isNotAtSelected && isActive;
  }) || [];

  if (branchesLoading || usersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground">Synchronizing institutional personnel mapping...</p>
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
          <p className="text-muted-foreground text-lg font-medium">Manage the geographic distribution of KYC Officers for document verification.</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-4 shadow-lg border-slate-200 h-fit sticky top-24">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Jurisdiction Node
            </CardTitle>
            <CardDescription>Select a branch to manage its assigned verification specialists.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Branch Name</Label>
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Central HQ">Central HQ (Main Office)</SelectItem>
                    {branches?.map(b => (
                      <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedBranch && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Active Mapping</span>
                  <span className="text-lg font-black text-slate-900">{selectedBranch}</span>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="font-bold">{assignedUsers.length} Active KYC Officers</Badge>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex gap-2 text-amber-800">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium leading-relaxed">
                    <strong>Coverage Protocol:</strong> KYC Officers reassigned here will immediately gain authority to approve/reject cases submitted within this jurisdiction.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-8 space-y-6">
          {!selectedBranch ? (
            <div className="flex flex-col items-center justify-center py-32 bg-slate-50 border-2 border-dashed rounded-3xl gap-4">
              <MapPin className="w-16 h-16 text-slate-200" />
              <div className="text-center space-y-1">
                <p className="font-bold text-slate-900 text-xl">No Branch Selected</p>
                <p className="text-sm text-slate-500 max-w-xs mx-auto">Please select a branch to begin managing specialist coverage and verification assignments.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              <Card className="shadow-xl border-slate-200 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        Mapped KYC Officers
                      </CardTitle>
                      <CardDescription>Specialists currently authorized for {selectedBranch}.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[300px]">
                    <div className="divide-y">
                      {assignedUsers.map(u => (
                        <div key={u.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                              {u.name.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900">{u.name}</span>
                              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Verification Specialist</span>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-destructive font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleAssignUser(u.id, "Central HQ")}
                          >
                            <X className="w-4 h-4 mr-2" />
                            Revoke Authority
                          </Button>
                        </div>
                      ))}
                      {assignedUsers.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground italic">
                          No specialists currently mapped to this node.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="shadow-xl border-slate-200 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <CardTitle className="text-xl">Network Specialist Registry</CardTitle>
                      <CardDescription>Reassign authorized KYC Officers to {selectedBranch}.</CardDescription>
                    </div>
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        placeholder="Search specialists..." 
                        className="pl-9 h-9" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="divide-y">
                      {unassignedUsers.map(u => (
                        <div key={u.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary/5 text-primary flex items-center justify-center font-bold border border-primary/10">
                              {u.name.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900">{u.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">KYC Specialist</span>
                                <span className="text-slate-200 text-xs">•</span>
                                <Badge variant="outline" className="text-[9px] h-4 font-bold bg-white">{u.branch || 'Central HQ'}</Badge>
                              </div>
                            </div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="font-bold border-primary/20 text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                            onClick={() => handleAssignUser(u.id, selectedBranch)}
                          >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Assign Coverage
                          </Button>
                        </div>
                      ))}
                      {unassignedUsers.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground italic">
                          No other specialists available for reassignment.
                        </div>
                      )}
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
