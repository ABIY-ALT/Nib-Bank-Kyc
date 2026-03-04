'use client';

import { useState, useEffect, useMemo } from 'react';
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
  SearchCheck,
  ShieldCheck,
  ChevronRight,
  ClipboardCheck,
  Check,
  ChevronsUpDown,
  ArrowRightLeft
} from "lucide-react";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { getAllUsers, updateUserPortfolio } from '@/actions/users';
import { getBranches } from '@/actions/hierarchy';
import { cn } from "@/lib/utils";

export default function StaffAssignmentsPage() {
  const { toast } = useToast();
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Searchable Popover State
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
  const [branchSearchQuery, setBranchSearchQuery] = useState("");

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
      toast({ variant: "destructive", title: "Sync Failed", description: "Could not retrieve staff mappings." });
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
      toast({ title: "Successful" });
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Update Failed", description: e.message });
    }
  };

  const isSpecialist = (user: any) => {
    return user.roles?.some((ur: any) => {
      const roleName = ur.role?.name?.toUpperCase() || "";
      return roleName.includes('KYC') && (roleName.includes('SPECIALIST') || roleName.includes('OFFICER'));
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

  const allMappedSpecialists = useMemo(() => {
    return users.filter(u => isSpecialist(u) && u.assignedBranches?.length > 0);
  }, [users]);

  const filteredBranches = useMemo(() => {
    return branches.filter(b => b.name.toLowerCase().includes(branchSearchQuery.toLowerCase()));
  }, [branches, branchSearchQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Retrieving specialist directory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Branch Mapping</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Manage multi-branch portfolios for verification staff.</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-4 shadow-lg border-slate-200 h-fit sticky top-24">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl flex items-center gap-2 font-bold"><Building2 className="w-5 h-5 text-primary" /> Jurisdiction Branch</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Branch Selection</Label>
                
                <Popover open={branchPopoverOpen} onOpenChange={setBranchPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={branchPopoverOpen}
                      className="w-full justify-between h-12 rounded-xl font-bold border-slate-200 bg-white"
                    >
                      {selectedBranch ? selectedBranch : "Select target branch..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <div className="flex items-center border-b px-3 py-2 bg-slate-50/50">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <Input
                        placeholder="Search branch name..."
                        value={branchSearchQuery}
                        onChange={(e) => setBranchSearchQuery(e.target.value)}
                        className="h-8 border-none focus-visible:ring-0 p-0 text-sm font-bold bg-transparent"
                      />
                    </div>
                    <ScrollArea className="h-72">
                      <div className="p-1">
                        {filteredBranches.map((branch) => (
                          <div
                            key={branch.id}
                            className={cn(
                              "relative flex cursor-pointer select-none items-center rounded-lg px-3 py-2.5 text-sm font-bold hover:bg-slate-100 transition-colors",
                              selectedBranch === branch.name && "bg-primary/10 text-primary"
                            )}
                            onClick={() => {
                              setSelectedBranch(branch.name);
                              setBranchPopoverOpen(false);
                              setBranchSearchQuery("");
                            }}
                          >
                            <Building2 className="mr-2 h-4 w-4 opacity-50" />
                            <span className="truncate">{branch.name}</span>
                            {selectedBranch === branch.name && (
                              <Check className="ml-auto h-4 w-4" />
                            )}
                          </div>
                        ))}
                        {filteredBranches.length === 0 && (
                          <div className="py-6 text-center text-sm text-muted-foreground font-bold">
                            No matching discovered.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 shadow-inner">
                <div className="flex gap-3 text-amber-800">
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-xs font-bold leading-relaxed">
                    <strong>Protocol:</strong> Specialist portfolio expansion grants visibility into shared regional queues. All assignments are logged.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-8 space-y-6">
          {!selectedBranch ? (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-3xl bg-white">
                <CardHeader className="bg-slate-900 text-white border-b flex flex-row items-center justify-between p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/20 rounded-2xl shadow-lg shadow-black/20">
                      <ShieldCheck className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black tracking-tight">Global Coverage Matrix</CardTitle>
                      <CardDescription className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Inventory of active specialist portfolios</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-white/5 border-primary/30 text-primary font-black px-4 py-1.5 h-9">
                    {allMappedSpecialists.length} Specialists Active
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50/80">
                      <TableRow>
                        <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Specialist Officer</TableHead>
                        <TableHead className="font-black py-5 text-[11px] uppercase tracking-widest text-slate-500">Jurisdiction Branch</TableHead>
                        <TableHead className="font-black py-5 text-right pr-8 text-[11px] uppercase tracking-widest text-slate-500">Portfolio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allMappedSpecialists.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-24 text-center text-muted-foreground italic bg-slate-50/30">
                            <div className="flex flex-col items-center gap-4">
                              <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
                                <Users className="w-12 h-12 text-slate-200" />
                              </div>
                              <p className="font-bold text-slate-900 text-lg">No specialists have been mapped yet.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : allMappedSpecialists.map(u => (
                        <TableRow key={u.id} className="hover:bg-slate-50 transition-colors group">
                          <TableCell className="py-6 pl-8">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                                {u.firstName.charAt(0)}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-black text-slate-900 leading-tight">{u.firstName} {u.lastName}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Verification Staff</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-6">
                            <div className="flex flex-wrap gap-1.5 max-w-[300px]">
                              {u.assignedBranches.map((b: string) => (
                                <Badge key={b} variant="secondary" className="bg-white border border-slate-200 text-slate-600 font-bold text-[9px] uppercase px-2">
                                  {b}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            <Badge className="bg-primary text-white font-black px-3 py-1 shadow-sm">
                              {u.assignedBranches.length} Branch
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              
              <div className="flex flex-col items-center justify-center py-16 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[2.5rem] gap-4">
                <div className="p-4 bg-white rounded-full shadow-sm">
                  <MapPin className="w-8 h-8 text-slate-300" />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-bold text-slate-900 text-lg">Expansion Workspace Standby</p>
                  <p className="text-sm text-muted-foreground font-medium">Select a node from the left card to manage specific specialist mappings.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 animate-in zoom-in-95 duration-300">
              <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl">
                <CardHeader className="bg-slate-50/50 border-b p-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl flex items-center gap-3 font-black text-slate-900">
                      <div className="p-2 bg-primary/10 rounded-xl text-primary"><Users className="w-5 h-5" /></div>
                      Mapped Specialists
                    </CardTitle>
                    <Badge className="bg-primary text-white font-black">{selectedBranch}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[300px]">
                    <div className="divide-y divide-slate-100">
                      {assignedUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground italic text-sm gap-3">
                          <Users className="w-8 h-8 opacity-20" />
                          <p className="font-bold uppercase tracking-widest text-[10px]">No specialists mapped to this branch.</p>
                        </div>
                      ) : assignedUsers.map(u => {
                        const fullName = `${u.firstName} ${u.lastName}`;
                        return (
                          <div key={u.id} className="flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center text-slate-500 font-black shadow-sm group-hover:border-primary/20 transition-all">
                                {u.firstName.charAt(0)}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-slate-900">{fullName}</span>
                                <Badge variant="outline" className="text-[8px] h-4.5 px-2 bg-white border-primary/30 text-primary font-black uppercase mt-1">
                                  {u.assignedBranches?.length || 0} Branch Covered
                                </Badge>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-destructive font-black hover:bg-red-50 rounded-xl h-10 px-4" onClick={() => handleToggleBranchAssignment(u, selectedBranch, false)}>
                              <X className="w-4 h-4 mr-2" /> Revoke Authority
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-3xl bg-white">
                <CardHeader className="bg-slate-50/50 border-b flex flex-col md:flex-row justify-between items-start md:items-center p-6 gap-4">
                  <div>
                    <CardTitle className="text-xl font-black">Specialist Registry</CardTitle>
                    <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Discover personnel for coverage</CardDescription>
                  </div>
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      placeholder="Search by name..." 
                      className="pl-11 h-11 bg-white border-slate-200 font-bold rounded-2xl focus-visible:ring-primary/20" 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="divide-y divide-slate-100">
                      {unassignedUsers.length === 0 ? (
                        <div className="p-20 text-center text-muted-foreground space-y-4">
                          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-inner">
                            <Users className="w-8 h-8 opacity-20" />
                          </div>
                          <p className="italic text-sm font-bold uppercase tracking-widest text-[10px]">No available specialists discovered in registry.</p>
                        </div>
                      ) : unassignedUsers.map(u => {
                        const fullName = `${u.firstName} ${u.lastName}`;
                        return (
                          <div key={u.id} className="flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center font-black shadow-sm group-hover:scale-105 transition-all">
                                {u.firstName.charAt(0)}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-slate-900">{fullName}</span>
                                <span className="text-[10px] text-muted-foreground font-bold tracking-tight">{u.email}</span>
                              </div>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="font-black border-primary/20 text-primary hover:bg-primary hover:text-white rounded-xl h-10 px-6 shadow-sm transition-all active:scale-[0.95]" 
                              onClick={() => handleToggleBranchAssignment(u, selectedBranch, true)}
                            >
                              <UserPlus className="w-4 h-4 mr-2" /> Add to Coverage
                            </Button>
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
