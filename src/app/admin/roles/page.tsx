'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  ShieldCheck, 
  Plus,
  Settings2,
  Check,
  CheckCircle2,
  Zap,
  RefreshCcw,
  UserX,
  UserCheck,
  LayoutDashboard,
  FileText,
  Building2,
  HardDrive,
  Folders,
  BookOpen,
  FileBarChart,
  Settings,
  X,
  Search,
  History,
  AlertCircle,
  ShieldAlert,
  Inbox,
  PlusCircle,
  BarChart3,
  Map,
  FileArchive,
  Monitor
} from "lucide-react";
import { Badge } from '@/components/ui/badge';
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
import { usePermissions } from '@/hooks/use-permissions';

const SIDEBAR_GROUPS = [
  { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'CASE_MANAGEMENT', label: 'Case Management', icon: FileText },
  { id: 'MONITORING', label: 'Monitoring', icon: BarChart3 },
  { id: 'INFRASTRUCTURE', label: 'Infrastructure', icon: HardDrive },
  { id: 'REFERENCE', label: 'KYC F&Q Reference', icon: BookOpen },
  { id: 'REPORTING', label: 'Reporting Suite', icon: FileBarChart },
  { id: 'SYSTEM', label: 'Administration', icon: Settings },
];

export default function StaffRolesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [roleName, setRoleName] = useState("");
  const [permissionsForm, setPermissionsForm] = useState<string[]>([]);

  useEffect(() => {
    if (!permissionsLoading && !hasPermission('ROLE_CREATE')) {
      router.push('/');
    }
  }, [hasPermission, permissionsLoading, router]);

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
          description: `Designated as ${role.active ? 'Inactive' : 'Active'} in the Vault.`
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
    const groups: Record<string, any[]> = {
      'DASHBOARD': [],
      'CASE_MANAGEMENT': [],
      'MONITORING': [],
      'INFRASTRUCTURE': [],
      'REFERENCE': [],
      'REPORTING': [],
      'SYSTEM': []
    };

    allPermissions.forEach(p => {
      const slug = p.slug;
      
      // Categorize based on slug and navigation logic
      if (slug === 'DASHBOARD_VIEW' || slug === 'DASHBOARD_VIEW_SYSTEM' || slug === 'DASHBOARD_VIEW_BRANCH') {
        groups['DASHBOARD'].push({ ...p, desc: "Permit view of general oversight dashboard", icon: LayoutDashboard });
      } else if (slug === 'DASHBOARD_VIEW_DISTRICT' || slug === 'CASE_VIEW_BRANCH' || slug === 'DASHBOARD_VIEW_DISTRICT_NODE') {
        groups['MONITORING'].push({ ...p, desc: "Permit operational monitoring at authorized nodes", icon: BarChart3 });
      } else if (slug === 'CASE_SUBMIT') {
        groups['CASE_MANAGEMENT'].push({ ...p, desc: "Permit upload documents and other necessary initiation steps", icon: PlusCircle });
      } else if (slug === 'CASE_VIEW_OWN') {
        groups['CASE_MANAGEMENT'].push({ ...p, desc: "Permit view personal submission history", icon: Inbox });
      } else if (slug === 'KYC_VIEW_QUEUE') {
        groups['CASE_MANAGEMENT'].push({ ...p, desc: "Permit view and process the verification queue", icon: Search });
      } else if (slug === 'VIEW_AMENDMENT_QUEUE') {
        groups['CASE_MANAGEMENT'].push({ ...p, desc: "Permit view and process resubmitted cases from Branch Officers", icon: History });
      } else if (slug === 'CASE_VIEW_ACTION_REQUIRED') {
        groups['CASE_MANAGEMENT'].push({ ...p, desc: "Permit manage returned cases and respond to comments", icon: AlertCircle });
      } else if (slug === 'VIEW_ESCALATED_CASES') {
        groups['CASE_MANAGEMENT'].push({ ...p, desc: "Permit access high-priority senior assessments", icon: ShieldAlert });
      } else if (slug === 'VIEW_GOVERNANCE_QUEUE') {
        groups['CASE_MANAGEMENT'].push({ ...p, desc: "Permit process hierarchy governance flows", icon: Zap });
      } else if (slug === 'MANAGE_VAULT_STORAGE') {
        groups['INFRASTRUCTURE'].push({ ...p, desc: "Permit management of jurisdictional vault assets", icon: HardDrive });
      } else if (slug === 'VIEW_ARCHIVED_CASE') {
        groups['INFRASTRUCTURE'].push({ ...p, desc: "Permit access to global historical records", icon: Folders });
      } else if (slug === 'EXPORT_CASE_ZIP') {
        groups['INFRASTRUCTURE'].push({ ...p, desc: "Permit batch export of institutional bundles", icon: FileArchive });
      } else if (p.group === 'REFERENCE') {
        groups['REFERENCE'].push({ ...p, desc: "Permit management of the standardized findings knowledge base", icon: BookOpen });
      } else if (p.group === 'REPORTING') {
        groups['REPORTING'].push({ ...p, desc: "Permit generation of institutional reports", icon: FileBarChart });
      } else if (p.group === 'SYSTEM') {
        groups['SYSTEM'].push({ ...p, desc: "Permit administration of personnel and configuration", icon: Settings });
      }
    });

    return groups;
  }, [allPermissions]);

  const handleToggleGroup = (groupId: string) => {
    const groupPerms = groupedPermissions[groupId] || [];
    const groupIds = groupPerms.map(p => p.id);
    const allSelected = groupIds.every(id => permissionsForm.includes(id));

    if (allSelected) {
      setPermissionsForm(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      setPermissionsForm(prev => [...new Set([...prev, ...groupIds])]);
    }
  };

  if (loading || permissionsLoading) return <div className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;

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
          <p className="text-muted-foreground text-lg font-medium">Define authorities precisely aligned with operational requirements.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSyncPermissions} disabled={isSyncing} className="border-primary/20 text-primary font-black gap-2">
            <RefreshCcw className="w-4 h-4" /> Provision Registry
          </Button>
          <Button onClick={handleOpenAdd} className="bg-primary shadow-xl font-black h-11 px-8 text-white hover:bg-primary/90 rounded-xl">
            <Plus className="w-4 h-4 mr-2" /> Define New Role
          </Button>
        </div>
      </div>

      <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
        <CardHeader className="bg-primary text-white border-b py-6">
          <CardTitle className="text-xl font-black">Personnel Designations</CardTitle>
          <CardDescription className="text-white/70 font-medium">Manage jurisdictional and operational authority levels.</CardDescription>
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
                <TableRow><TableCell colSpan={4} className="py-32 text-center text-muted-foreground italic">No roles defined in the vault.</TableCell></TableRow>
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
                    <div className="flex items-center justify-center gap-2 mx-auto p-3 rounded-xl">
                      <span className="font-black text-slate-700 text-xs">{role.permissions.length} Capabilities</span>
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(role)} className="h-10 w-10 text-slate-400 rounded-full hover:bg-primary/5 hover:text-primary transition-colors"><Settings2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(role)} disabled={isToggling === role.id} className={cn("h-10 w-10 rounded-full", role.active ? "text-destructive" : "text-emerald-600")}>
                        {isToggling === role.id ? <Loader2 className="w-4 h-4 animate-spin" /> : role.active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
          <div className="bg-white flex flex-col h-[90vh]">
            <DialogHeader className="p-8 bg-primary text-white border-b space-y-0 shrink-0">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-2xl">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black tracking-tight text-white">
                      {selectedRole ? 'Update Role Rights' : 'Define New Role'}
                    </DialogTitle>
                    <DialogDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest mt-0.5">
                      Institutional Mapping: Aligning rights to operational nodes
                    </DialogDescription>
                  </div>
                </div>
              </div>
            </DialogHeader>
            
            <div className="p-8 flex-1 overflow-hidden flex flex-col gap-8">
              <div className="space-y-2 max-w-sm shrink-0">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Designation Label</Label>
                <input 
                  placeholder="e.g. KYC_AUDITOR" 
                  className="h-12 w-full px-4 bg-slate-50 border border-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-xl" 
                  value={roleName} 
                  onChange={(e) => setRoleName(e.target.value.toUpperCase().replace(/\s+/g, '_'))} 
                />
              </div>

              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-12">
                  {SIDEBAR_GROUPS.map((section) => {
                    const perms = groupedPermissions[section.id] || [];
                    if (perms.length === 0) return null;

                    const groupIds = perms.map(p => p.id);
                    const allSelectedInGroup = groupIds.every(id => permissionsForm.includes(id));
                    const SectionIcon = section.icon;
                    
                    return (
                      <div key={section.id} className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="p-2 bg-primary/5 rounded-lg text-primary">
                              <SectionIcon className="w-4 h-4" />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 whitespace-nowrap">{section.label}</span>
                            <div className="h-px flex-1 bg-slate-100" />
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleToggleGroup(section.id)} className="ml-4 h-8 px-3 rounded-lg hover:bg-primary/5 text-primary font-black text-[10px] uppercase tracking-wider gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 
                            {allSelectedInGroup ? "Deselect Section" : "Grant All in Section"}
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {perms.map((p: any) => {
                            const isSelected = permissionsForm.includes(p.id);
                            const PermIcon = p.icon || SectionIcon;
                            return (
                              <div 
                                key={p.id} 
                                onClick={() => handleTogglePermission(p.id)}
                                className={cn(
                                  "flex items-start justify-between p-5 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden",
                                  isSelected ? "bg-[#FCFAF7] border-primary shadow-[0_0_0_1px_rgba(184,147,52,1)]" : "bg-white border-slate-100 hover:border-slate-200"
                                )}
                              >
                                <div className="flex gap-4 z-10">
                                  <div className={cn("p-2 rounded-xl h-fit transition-all", isSelected ? "bg-primary text-white" : "bg-slate-50 text-slate-400")}>
                                    <PermIcon className="w-4 h-4" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className={cn("text-sm font-black transition-colors", isSelected ? "text-slate-900" : "text-slate-400")}>
                                      {p.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold mt-1 line-clamp-2">{p.desc}</span>
                                  </div>
                                </div>
                                <div className="z-10 mt-0.5">
                                  {isSelected ? (
                                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg"><Check className="w-3.5 h-3.5 text-white stroke-[4px]" /></div>
                                  ) : (
                                    <div className="w-6 h-6 rounded-full border-2 border-slate-100 group-hover:border-primary/20" />
                                  )}
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
            </div>

            <DialogFooter className="p-8 bg-slate-50 border-t flex flex-row justify-end items-center gap-6 rounded-b-3xl shrink-0">
              <button onClick={() => setIsDialogOpen(false)} className="text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors">Discard Changes</button>
              <Button onClick={handleSave} disabled={isSaving} className="h-14 px-12 bg-primary hover:bg-primary/90 text-white font-black rounded-xl shadow-2xl">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Commit Authority Map
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
