
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  ShieldCheck, 
  Plus,
  Settings2,
  Check,
  CheckCircle2,
  X,
  CheckSquare,
  Square,
  Zap,
  RefreshCcw,
  AlertTriangle,
  UserX,
  UserCheck,
  Workflow,
  Table as TableIcon,
  ChevronRight,
  Info,
  Database,
  UserCog,
  Lock
} from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRoleDefinitions, getAllPermissions, upsertRole, toggleRoleStatus, seedInstitutionalPermissions } from '@/actions/roles';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MATRIX_DATA = [
  { module: "Dashboard", page: "Dashboard", officer: "R", super: "R", director: "R", admin: "R" },
  { module: "KYC Operations", page: "Create Submission", officer: "W", super: "-", director: "-", admin: "-" },
  { module: "KYC Operations", page: "My Submissions", officer: "R", super: "-", director: "-", admin: "-" },
  { module: "KYC Operations", page: "Review & Action", officer: "W", super: "W", director: "-", admin: "-" },
  { module: "KYC Operations", page: "Returned Cases", officer: "R", super: "R", director: "-", admin: "-" },
  { module: "KYC Operations", page: "Escalated Cases", officer: "-", super: "R", director: "-", admin: "-" },
  { module: "KYC Operations", page: "Exceptional Cases", officer: "-", super: "R", director: "W", admin: "-" },
  { module: "KYC Operations", page: "Branch Monitoring", officer: "-", super: "R", director: "R", admin: "-" },
  { module: "KYC Operations", page: "District Monitoring", officer: "-", super: "-", director: "R", admin: "-" },
  { module: "KYC Operations", page: "Document Vault", officer: "R", super: "RW", director: "RW", admin: "-" },
  { module: "KYC Operations", page: "Case Archive", officer: "-", super: "R", director: "R", admin: "-" },
  { module: "KYC Operations", page: "KYC FAQ Reference", officer: "R", super: "R", director: "R", admin: "-" },
  { module: "Audit & Reporting", page: "Ops Monitoring", officer: "-", super: "R", director: "R", admin: "-" },
  { module: "Audit & Reporting", page: "Management Report", officer: "-", super: "-", director: "R", admin: "-" },
  { module: "Audit & Reporting", page: "System-wide", officer: "-", super: "R", director: "R", admin: "-" },
  { module: "Audit & Reporting", page: "Follow-up Audit", officer: "-", super: "R", director: "R", admin: "-" },
  { module: "Audit & Reporting", page: "Audit Reports", officer: "-", super: "R", director: "R", admin: "-" },
  { module: "Audit & Reporting", page: "Master Archive", officer: "-", super: "-", director: "R", admin: "-" },
  { module: "Administration", page: "User Access", officer: "-", super: "-", director: "-", admin: "W" },
  { module: "Administration", page: "Assign Roles", officer: "-", super: "-", director: "-", admin: "W" },
  { module: "Administration", page: "Portfolio Mapping", officer: "-", super: "W", director: "-", admin: "-" },
  { module: "Administration", page: "Hierarchy", officer: "-", super: "-", director: "R", admin: "W" },
  { module: "Administration", page: "Configuration", officer: "-", super: "-", director: "-", admin: "W" },
  { module: "Administration", page: "Audit Logs", officer: "-", super: "R", director: "-", admin: "R" },
];

export default function StaffRolesPage() {
  const { toast } = useToast();
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [roleName, setRoleName] = useState("");
  const [permissionsForm, setPermissionsForm] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([getRoleDefinitions(), getAllPermissions()]);
      setRoleDefinitions(r || []);
      setAllPermissions(p || []);
    } catch (e) {
      toast({ variant: "destructive", title: "Institutional Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPermissions = async () => {
    setIsSyncing(true);
    try {
      const res = await seedInstitutionalPermissions();
      if (res.success) {
        toast({ title: "Registry Synced", description: "Standard institutional capabilities have been provisioned." });
        await loadData();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenAdd = () => {
    setSelectedRole(null);
    setRoleName("");
    setPermissionsForm([]);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (role: any) => {
    setSelectedRole(role);
    setRoleName(role.name);
    setPermissionsForm(role.permissions.map((rp: any) => rp.permissionId));
    setIsDialogOpen(true);
  };

  const handleOpenInventory = (role: any) => {
    setSelectedRole(role);
    setIsInventoryOpen(true);
  };

  const handleSave = async () => {
    if (!roleName) {
      toast({ variant: "destructive", title: "Role Name Required" });
      return;
    }
    
    setIsSaving(true);
    try {
      const res = await upsertRole({
        id: selectedRole?.id,
        name: roleName.toUpperCase().replace(/\s+/g, '_'),
        description: "",
        permissionIds: permissionsForm
      });
      
      if (res.success) {
        toast({ title: "Authority Configuration Saved" });
        setIsDialogOpen(false);
        loadData();
      } else {
        toast({ variant: "destructive", title: "Error", description: res.error });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (role: any) => {
    setIsToggling(role.id);
    try {
      const res = await toggleRoleStatus(role.id, role.active);
      if (res.success) {
        toast({ 
          title: role.active ? "Role Deactivated" : "Role Restored", 
          description: `designated as ${role.active ? 'Inactive' : 'Active'} in the Vault.`
        });
        await loadData();
      }
    } finally {
      setIsToggling(null);
    }
  };

  const handleTogglePermission = (id: string) => {
    setPermissionsForm(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, any[]> = {};
    allPermissions.forEach(p => {
      const g = p.group;
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });
    return groups;
  }, [allPermissions]);

  const handleToggleGroup = (groupName: string) => {
    const groupPerms = groupedPermissions[groupName] || [];
    const groupIds = groupPerms.map(p => p.id);
    const allSelected = groupIds.every(id => permissionsForm.includes(id));

    if (allSelected) {
      setPermissionsForm(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      setPermissionsForm(prev => [...new Set([...prev, ...groupIds])]);
    }
  };

  const getPermBadge = (val: string) => {
    if (val === 'R') return <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center font-black text-xs">R</div>;
    if (val === 'W') return <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center font-black text-xs">W</div>;
    if (val === 'RW') return <div className="w-12 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center font-black text-xs gap-1">R/W</div>;
    return <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-300 flex items-center justify-center font-black text-xs">-</div>;
  };

  if (loading) return <div className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Institutional Roles</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Master Access Control Matrix.</p>
        </div>
        <div className="flex gap-2">
          {allPermissions.length === 0 && (
            <Button variant="outline" onClick={handleSyncPermissions} disabled={isSyncing} className="border-primary/20 text-primary font-black hover:bg-primary/5 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              Provision Registry
            </Button>
          )}
          <Button onClick={handleOpenAdd} className="bg-primary shadow-xl font-black h-11 px-8 text-white hover:bg-primary/90 rounded-xl">
            <Plus className="w-4 h-4 mr-2" /> Define New Role
          </Button>
        </div>
      </div>

      <Tabs defaultValue="management" className="space-y-8">
        <TabsList className="bg-slate-100 p-1 border h-12 rounded-xl">
          <TabsTrigger value="management" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8 rounded-lg">Authority Management</TabsTrigger>
          <TabsTrigger value="blueprint" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8 rounded-lg">Institutional Blueprint</TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="space-y-8 animate-in slide-in-from-left-4 duration-500">
          <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl">
            <CardHeader className="bg-primary text-white border-b py-6">
              <CardTitle className="text-xl font-black">Personnel Designations</CardTitle>
              <CardDescription className="text-white/70 font-medium">Manage regional and operational authority levels.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="font-black py-5 pl-8 text-[11px] uppercase tracking-widest text-slate-500">Role Name</TableHead>
                    <TableHead className="font-black text-[11px] uppercase tracking-widest text-slate-500">Institutional Status</TableHead>
                    <TableHead className="text-center font-black text-[11px] uppercase tracking-widest text-slate-500">Capability Authority</TableHead>
                    <TableHead className="text-right font-black pr-8 text-[11px] uppercase tracking-widest text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleDefinitions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-32 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <div className="p-6 bg-slate-50 rounded-full"><Zap className="w-12 h-12 text-slate-200" /></div>
                          <div className="space-y-1">
                            <p className="font-bold text-slate-900 text-lg">No roles defined</p>
                            <p className="text-sm text-muted-foreground">Establish authority groups to manage staff access.</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : roleDefinitions.map((role) => (
                    <TableRow key={role.id} className={cn("hover:bg-slate-50 transition-colors group", !role.active && "bg-slate-50/30 opacity-80")}>
                      <TableCell className={cn("font-black pl-8 py-6", role.active ? "text-slate-900" : "text-slate-400")}>
                        {role.name.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={role.active ? 'text-emerald-600 border-emerald-200 bg-emerald-50 font-black text-[9px] uppercase px-3' : 'text-slate-400 border-slate-200 bg-white font-black text-[9px] uppercase px-3'}>
                          {role.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <button 
                          onClick={() => handleOpenInventory(role)}
                          className="flex items-center justify-center gap-2 mx-auto hover:scale-105 transition-transform p-3 rounded-xl hover:bg-primary/5 group/btn"
                        >
                          <span className="font-black text-slate-700 group-hover/btn:text-primary text-xs">{role.permissions.length} Capabilities</span>
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        </button>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(role)} className="h-10 w-10 text-slate-400 rounded-full hover:bg-primary/5 hover:text-primary"><Settings2 className="w-4 h-4" /></Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleToggleStatus(role)} 
                            disabled={isToggling === role.id}
                            className={cn(
                              "h-10 w-10 rounded-full transition-colors",
                              role.active ? "text-destructive hover:bg-destructive/5" : "text-emerald-600 hover:bg-emerald-50"
                            )}
                          >
                            {isToggling === role.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : role.active ? (
                              <UserX className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blueprint" className="space-y-12 animate-in slide-in-from-right-4 duration-500">
          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <Workflow className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-black uppercase tracking-widest text-slate-900">Provisioning Lifecycle</h2>
            </div>
            
            <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white">
              <CardContent className="p-12">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 hidden lg:block -translate-y-1/2 z-0" />
                  
                  <div className="z-10 flex flex-col items-center gap-4 group">
                    <div className="w-20 h-20 rounded-3xl bg-slate-100 border-2 border-slate-200 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <div className="text-xs font-black text-slate-400 uppercase tracking-tighter">Start</div>
                    </div>
                    <div className="text-center">
                      <p className="font-black text-slate-900 leading-none">Decision</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Admin Intent</p>
                    </div>
                  </div>

                  <ChevronRight className="w-6 h-6 text-slate-200 lg:block hidden" />

                  <div className="z-10 flex flex-col items-center gap-4 group">
                    <div className="w-48 p-6 rounded-3xl bg-blue-500 text-white border-4 border-white shadow-xl shadow-blue-100 flex flex-col items-center text-center gap-2 group-hover:-translate-y-2 transition-transform">
                      <Plus className="w-6 h-6" />
                      <div>
                        <p className="font-black text-sm">Step 1: Roles Table</p>
                        <p className="text-[9px] font-bold text-blue-100 uppercase tracking-widest">e.g. "KYC Auditor"</p>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-6 h-6 text-slate-200 lg:block hidden" />

                  <div className="z-10 flex flex-col items-center gap-4 group">
                    <div className="w-48 p-6 rounded-3xl bg-blue-600 text-white border-4 border-white shadow-xl shadow-blue-100 flex flex-col items-center text-center gap-2 group-hover:-translate-y-2 transition-transform">
                      <Settings2 className="w-6 h-6" />
                      <div>
                        <p className="font-black text-sm">Step 2: Permissions</p>
                        <p className="text-[9px] font-bold text-blue-100 uppercase tracking-widest">Assign Read/Write</p>
                      </div>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2">
                      <Database className="w-3 h-3 text-emerald-600" />
                      <span className="text-[9px] font-black text-emerald-700 uppercase">Updates Table</span>
                    </div>
                  </div>

                  <ChevronRight className="w-6 h-6 text-slate-200 lg:block hidden" />

                  <div className="z-10 flex flex-col items-center gap-4 group">
                    <div className="w-48 p-6 rounded-3xl bg-blue-700 text-white border-4 border-white shadow-xl shadow-blue-100 flex flex-col items-center text-center gap-2 group-hover:-translate-y-2 transition-transform">
                      <UserCog className="w-6 h-6" />
                      <div>
                        <p className="font-black text-sm">Step 3: Assignment</p>
                        <p className="text-[9px] font-bold text-blue-100 uppercase tracking-widest">Map Role to User</p>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-6 h-6 text-slate-200 lg:block hidden" />

                  <div className="z-10 flex flex-col items-center gap-4 group">
                    <div className="w-48 p-6 rounded-3xl bg-slate-900 text-white border-4 border-white shadow-xl shadow-slate-200 flex flex-col items-center text-center gap-2 group-hover:-translate-y-2 transition-transform">
                      <Lock className="w-6 h-6" />
                      <div>
                        <p className="font-black text-sm">Step 4: Enforcement</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Backend/Frontend Check</p>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-6 h-6 text-slate-200 lg:block hidden" />

                  <div className="z-10 flex flex-col items-center gap-4 group">
                    <div className="w-20 h-20 rounded-full bg-emerald-500 text-white border-4 border-white shadow-xl shadow-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div className="text-center">
                      <p className="font-black text-slate-900 leading-none">Access Granted</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Lifecycle End</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <TableIcon className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-black uppercase tracking-widest text-slate-900">Institutional Access Matrix</h2>
            </div>

            <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-[2.5rem] bg-white">
              <CardHeader className="bg-slate-900 text-white p-8">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-2xl font-black">Role-Based Capability Matrix</CardTitle>
                    <CardDescription className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Single Source of Truth for Security Audits</CardDescription>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-500" /><span className="text-[10px] font-black uppercase text-slate-400">Read Only</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-500" /><span className="text-[10px] font-black uppercase text-slate-400">Write Access</span></div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left py-6 pl-10 font-black text-[11px] uppercase tracking-widest text-slate-500 w-[240px]">Module / Node</th>
                        <th className="text-left py-6 px-6 font-black text-[11px] uppercase tracking-widest text-slate-500">System Page</th>
                        <th className="text-center py-6 px-4 font-black text-[11px] uppercase tracking-widest text-slate-900">KYC Officer</th>
                        <th className="text-center py-6 px-4 font-black text-[11px] uppercase tracking-widest text-slate-900">Supervisor</th>
                        <th className="text-center py-6 px-4 font-black text-[11px] uppercase tracking-widest text-slate-900">KYC Director</th>
                        <th className="text-center py-6 px-4 pr-10 font-black text-[11px] uppercase tracking-widest text-slate-900">System Admin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {MATRIX_DATA.map((row, idx) => {
                        const isNewModule = idx === 0 || MATRIX_DATA[idx - 1].module !== row.module;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="py-5 pl-10">
                              {isNewModule ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-4 bg-primary rounded-full" />
                                  <span className="font-black text-xs text-primary uppercase tracking-tighter">{row.module}</span>
                                </div>
                              ) : null}
                            </td>
                            <td className="py-5 px-6">
                              <div className="flex items-center gap-3">
                                <ChevronRight className="w-3 h-3 text-slate-300 group-hover:translate-x-1 transition-transform" />
                                <span className="text-sm font-bold text-slate-700">{row.page}</span>
                              </div>
                            </td>
                            <td className="text-center py-5 px-4">{getPermBadge(row.officer)}</td>
                            <td className="text-center py-5 px-4">{getPermBadge(row.super)}</td>
                            <td className="text-center py-5 px-4">{getPermBadge(row.director)}</td>
                            <td className="text-center py-5 px-4 pr-10">{getPermBadge(row.admin)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t py-6 px-10 flex justify-between items-center">
                <div className="flex items-center gap-6">
                  <div className="flex gap-2 p-3 bg-white border border-slate-200 rounded-2xl">
                    <Info className="w-4 h-4 text-primary shrink-0" />
                    <p className="text-[10px] text-slate-500 font-bold leading-relaxed uppercase">
                      <strong>Validation Note:</strong> This matrix is enforced at both the UI Layer (Conditional Rendering) and the Data Layer (Firestore Rules / API Security).
                    </p>
                  </div>
                </div>
                <p className="text-[10px] font-mono font-black text-primary/40 uppercase tracking-tighter">
                  NIB Institutional Security Blueprint v1.0
                </p>
              </CardFooter>
            </Card>
          </section>
        </TabsContent>
      </Tabs>

      {/* DIALOGS & MODALS */}
      <Dialog open={isInventoryOpen} onOpenChange={setIsInventoryOpen}>
        <DialogContent className="max-w-3xl rounded-3xl overflow-hidden p-0 border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white border-b space-y-0">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black">{selectedRole?.name.replace(/_/g, ' ')} Authority</DialogTitle>
                <DialogDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest mt-1">
                  Institutional Capability Inventory
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-8">
            <ScrollArea className="h-[50vh] pr-4">
              <div className="space-y-8">
                {Object.entries(
                  selectedRole?.permissions.reduce((acc: any, curr: any) => {
                    const group = curr.permission.group;
                    if (!acc[group]) acc[group] = [];
                    acc[group].push(curr.permission);
                    return acc;
                  }, {}) || {}
                ).map(([group, perms]: [string, any]) => (
                  <div key={group} className="space-y-4">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">{group}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {perms.map((p: any) => (
                        <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(184,147,52,0.5)]" />
                          <span className="text-xs font-bold text-slate-700">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="p-6 bg-slate-50 border-t">
            <Button onClick={() => { setIsInventoryOpen(false); handleOpenEdit(selectedRole); }} className="bg-primary px-8 font-black text-white hover:bg-primary/90 rounded-xl h-11 shadow-lg">Edit Authority Map</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden border-none shadow-2xl rounded-3xl animate-in zoom-in-95 duration-300">
          <div className="bg-white">
            <DialogHeader className="p-8 bg-primary text-white border-b space-y-0">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-2xl">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black tracking-tight text-white">
                    {selectedRole ? 'Update Role Rights' : 'Define New Role'}
                  </DialogTitle>
                  <DialogDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest mt-1">
                    Institutional Capability Assignment Workspace
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            
            <div className="p-8">
              <div className="space-y-2 mb-10 max-w-sm">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Designation Label</Label>
                <Input 
                  placeholder="e.g. BRANCH_OFFICER" 
                  className="h-12 bg-slate-50 border-slate-200 font-bold focus-visible:ring-primary/20 rounded-xl"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                />
              </div>

              {allPermissions.length === 0 ? (
                <div className="py-20 text-center space-y-6 bg-slate-50 rounded-3xl border-2 border-dashed">
                  <div className="bg-white p-4 rounded-full shadow-sm w-fit mx-auto">
                    <AlertTriangle className="w-10 h-10 text-orange-400" />
                  </div>
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="font-bold text-slate-900">Registry Empty</p>
                    <p className="text-sm text-slate-500 font-medium">The capability registry must be provisioned before roles can be mapped.</p>
                  </div>
                  <Button onClick={handleSyncPermissions} disabled={isSyncing} className="bg-primary text-white font-black px-10 h-12 rounded-xl shadow-lg">
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                    Sync System Capabilities
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[50vh] pr-4">
                  <div className="space-y-12">
                    {Object.entries(groupedPermissions).map(([group, perms]) => {
                      const groupIds = perms.map(p => p.id);
                      const allSelectedInGroup = groupIds.every(id => permissionsForm.includes(id));
                      
                      return (
                        <div key={group} className="space-y-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-primary whitespace-nowrap">{group}</span>
                              <div className="h-px flex-1 bg-slate-100" />
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleToggleGroup(group)}
                              className="ml-4 h-8 px-3 rounded-lg hover:bg-primary/5 text-primary font-bold text-[10px] uppercase tracking-wider gap-2"
                            >
                              {allSelectedInGroup ? (
                                <><CheckSquare className="w-3.5 h-3.5" /> Deselect All</>
                              ) : (
                                <><Square className="w-3.5 h-3.5" /> Select All</>
                              )}
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {perms.map((p: any) => {
                              const isSelected = permissionsForm.includes(p.id);
                              return (
                                <div 
                                  key={p.id} 
                                  onClick={() => handleTogglePermission(p.id)}
                                  className={cn(
                                    "flex items-center justify-between p-5 rounded-2xl border transition-all cursor-pointer group",
                                    isSelected 
                                      ? "bg-primary/5 border-primary/40 shadow-sm" 
                                      : "bg-white border-slate-100 hover:border-slate-200 shadow-sm"
                                  )}
                                >
                                  <div className="flex items-center gap-4">
                                    <div className={cn(
                                      "w-2 h-2 rounded-full transition-all",
                                      isSelected ? "bg-primary scale-125 shadow-[0_0_8px_rgba(184,147,52,0.5)]" : "bg-slate-200"
                                    )} />
                                    <span className={cn(
                                      "text-xs font-bold transition-colors",
                                      isSelected ? "text-slate-900" : "text-slate-500 group-hover:text-slate-700"
                                    )}>{p.name}</span>
                                  </div>
                                  <div className={cn(
                                    "w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center",
                                    isSelected ? "bg-primary border-primary" : "bg-white border-slate-200 group-hover:border-primary/30"
                                  )}>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[4px]" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            <DialogFooter className="p-8 bg-slate-50 border-t flex flex-row justify-end items-center gap-6 rounded-b-3xl">
              <button 
                onClick={() => setIsDialogOpen(false)} 
                className="text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors"
              >
                Discard Changes
              </button>
              <Button 
                onClick={handleSave} 
                disabled={isSaving || allPermissions.length === 0}
                className="h-12 px-12 bg-primary hover:bg-primary/90 text-white font-black rounded-xl shadow-xl shadow-primary/20 transition-all active:scale-95"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Commit Rights Map
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
