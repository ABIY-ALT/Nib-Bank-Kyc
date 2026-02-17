'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  ShieldCheck, 
  Plus,
  Settings2,
  Trash2,
  ShieldAlert,
  Zap,
  CheckCircle2,
  FilePlus,
  Search,
  AlertCircle,
  FileText,
  Users,
  Settings,
  TrendingUp,
  ClipboardCheck,
  Archive,
  Check
} from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRoleDefinitions, getAllPermissions, upsertRole, deactivateRole, seedInstitutionalPermissions } from '@/actions/roles';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const ROLE_MATRIX_CONFIG = [
  {
    section: "OPERATIONAL AUTHORITY",
    items: [
      { id: 'case_submission', label: 'Case Submission', slugs: ['CASE_UPLOAD_DOCUMENT', 'CASE_SUBMIT', 'CASE_VIEW_OWN', 'CASE_RESUBMIT', 'DASHBOARD_VIEW_BRANCH'] },
      { id: 'kyc_review', label: 'KYC Review', slugs: ['KYC_VIEW_QUEUE', 'KYC_VERIFY_CHECKLIST', 'KYC_REQUEST_AMENDMENT', 'KYC_APPROVE_STANDARD'] },
      { id: 'risk_escalation', label: 'Risk Escalation', slugs: ['VIEW_ESCALATED_CASES', 'ESCALATE_TO_SENIOR', 'APPROVE_ESCALATED_CASE', 'REJECT_ESCALATED_CASE'] },
      { id: 'audit_reports', label: 'Audit Reports', slugs: ['REPORT_VIEW_SYSTEM', 'REPORT_EXPORT_SYSTEM', 'REPORT_VIEW_DISTRICT', 'REPORT_EXPORT_DISTRICT', 'VIEW_AUDIT_LOGS', 'EXPORT_AUDIT_LOGS', 'VIEW_IP_ACTIVITY', 'VIEW_STATUS_TRANSITIONS', 'DASHBOARD_VIEW_SYSTEM'] },
      { id: 'user_access', label: 'User Access', slugs: ['USER_CREATE', 'USER_EDIT', 'USER_DEACTIVATE', 'USER_ASSIGN_ROLE', 'USER_RESET_PASSWORD'] },
      { id: 'system_config', label: 'System Config', slugs: ['ROLE_CREATE', 'ROLE_EDIT', 'MANAGE_PERMISSION_MATRIX', 'MANAGE_DISTRICTS', 'MANAGE_BRANCHES', 'MAP_USERS_TO_BRANCH', 'CONFIG_GOVERNANCE_STRUCTURE', 'EDIT_APPROVAL_SEQUENCE', 'EDIT_SLA_POLICY', 'EDIT_SAMPLING_PERCENTAGE', 'CONFIG_RISK_RULES', 'ENABLE_GOVERNANCE_FLOW', 'SYSTEM_EXPORT_CONFIG', 'VIEW_SYSTEM_AUDIT', 'EXPORT_SYSTEM_AUDIT'] }
    ]
  },
  {
    section: "MODULE ACCESS (BY PAGE)",
    items: [
      { id: 'performance', label: 'Performance Analytics', slugs: ['VIEW_SPECIALIST_PRODUCTIVITY', 'VIEW_SLA_METRICS', 'VIEW_ACCURACY_INDEX', 'EXPORT_ANALYTICS', 'DASHBOARD_VIEW_DISTRICT'] },
      { id: 'follow_up', label: 'Follow-up Audit', slugs: ['ACCESS_RANDOM_SAMPLING', 'ASSIGN_AUDIT_CASE', 'LOG_AUDIT_DISCREPANCY', 'SCORE_BRANCH', 'CLOSE_AUDIT_CASE', 'VIEW_AUDIT_POOL'] },
      { id: 'master_archive', label: 'Master Archive', slugs: ['VIEW_ARCHIVED_CASE', 'EXPORT_CASE_ZIP', 'BULK_EXPORT_CASES', 'GENERATE_REGULATORY_PACKAGE', 'DOWNLOAD_MASTER_ARCHIVE'] }
    ]
  }
];

export default function StaffRolesPage() {
  const { toast } = useToast();
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissionIds: [] as string[]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([getRoleDefinitions(), getAllPermissions()]);
      setRoleDefinitions(r);
      setAllPermissions(p);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setIsSyncing(true);
    await seedInstitutionalPermissions();
    toast({ title: "Permissions Initialized", description: "Institutional framework established." });
    await loadData();
    setIsSyncing(false);
  };

  const handleSaveRole = async () => {
    if (!roleForm.name) return;
    
    // Auto-add base dashboard view if anything is selected
    let finalIds = [...roleForm.permissionIds];
    const dashboardPermission = allPermissions.find(p => p.slug === 'DASHBOARD_VIEW');
    if (dashboardPermission && finalIds.length > 0 && !finalIds.includes(dashboardPermission.id)) {
      finalIds.push(dashboardPermission.id);
    }

    const res = await upsertRole({ ...roleForm, permissionIds: finalIds });
    if (res.success) {
      toast({ title: "Role Configuration Saved" });
      setIsRoleDialogOpen(false);
      loadData();
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error });
    }
  };

  const handleToggleCategory = (slugs: string[]) => {
    const targetIds = allPermissions.filter(p => slugs.includes(p.slug)).map(p => p.id);
    const allSelected = targetIds.length > 0 && targetIds.every(id => roleForm.permissionIds.includes(id));

    if (allSelected) {
      setRoleForm(prev => ({
        ...prev,
        permissionIds: prev.permissionIds.filter(id => !targetIds.includes(id))
      }));
    } else {
      setRoleForm(prev => ({
        ...prev,
        permissionIds: Array.from(new Set([...prev.permissionIds, ...targetIds]))
      }));
    }
  };

  const isCategorySelected = (slugs: string[]) => {
    const targetIds = allPermissions.filter(p => slugs.includes(p.slug)).map(p => p.id);
    if (targetIds.length === 0) return false;
    return targetIds.every(id => roleForm.permissionIds.includes(id));
  };

  const openEdit = (role: any) => {
    setEditingRole(role);
    setRoleForm({
      id: role.id,
      name: role.name,
      description: role.description || '',
      permissionIds: role.permissions.map((rp: any) => rp.permissionId)
    });
    setIsRoleDialogOpen(true);
  };

  const resetForm = () => {
    setEditingRole(null);
    setRoleForm({ name: '', description: '', permissionIds: [] });
    setIsRoleDialogOpen(true);
  };

  if (loading) return <div className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Institutional Permissions</h1>
          </div>
          <p className="text-muted-foreground text-lg">Dynamic Role-Based Access Control (RBAC) Matrix.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSeed} disabled={isSyncing} className="gap-2 border-primary/20 text-primary">
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Sync Permissions
          </Button>
          <Button onClick={resetForm} className="bg-primary shadow-xl font-bold h-11 px-6">
            <Plus className="w-4 h-4 mr-2" /> Create Role
          </Button>
        </div>
      </div>

      <Card className="shadow-xl border-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle>Role Management</CardTitle>
          <CardDescription>Define institutional designations and their authority levels.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="font-bold py-4 pl-8">Role Name</TableHead>
                <TableHead className="font-bold">Status</TableHead>
                <TableHead className="text-center font-bold">Privileges</TableHead>
                <TableHead className="text-right font-bold pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roleDefinitions.map((role) => (
                <TableRow key={role.id} className="hover:bg-slate-50">
                  <TableCell className="font-black text-slate-900 pl-8">{role.name.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={role.active ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-slate-400'}>
                      {role.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-primary/5 text-primary font-bold">
                      {role.permissions.length} Slugs
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(role)} className="h-8 w-8 text-primary"><Settings2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deactivateRole(role.id).then(loadData)} className="h-8 w-8 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden border-none shadow-2xl rounded-3xl animate-in zoom-in-95 duration-300">
          <div className="bg-white">
            <DialogHeader className="p-8 bg-white border-b space-y-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-xl">
                    <ShieldAlert className="w-6 h-6 text-primary" />
                  </div>
                  <DialogTitle className="text-3xl font-black text-slate-900 tracking-tight">
                    {editingRole ? 'Edit Role Authority' : 'Define New Role'}
                  </DialogTitle>
                </div>
              </div>
            </DialogHeader>
            
            <div className="p-8 space-y-10">
              {/* Designation Name */}
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Designation Name</Label>
                <Input 
                  placeholder="e.g. SENIOR_AUDITOR" 
                  className="h-14 bg-slate-50 border-slate-200 text-lg font-bold placeholder:text-slate-300 focus-visible:ring-primary/20 rounded-2xl"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({...roleForm, name: e.target.value.toUpperCase().replace(/\s+/g, '_')})}
                />
              </div>

              {ROLE_MATRIX_CONFIG.map((section) => (
                <div key={section.section} className="space-y-6">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{section.section}</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.items.map((item) => {
                      const selected = isCategorySelected(item.slugs);
                      return (
                        <div 
                          key={item.id}
                          onClick={() => handleToggleCategory(item.slugs)}
                          className={cn(
                            "flex items-center justify-between p-5 rounded-2xl border transition-all cursor-pointer group",
                            selected 
                              ? "bg-primary/5 border-primary/20 shadow-sm" 
                              : "bg-slate-50/50 border-slate-100 hover:border-slate-200"
                          )}
                        >
                          <span className={cn(
                            "text-sm font-bold transition-colors",
                            selected ? "text-primary" : "text-slate-600 group-hover:text-slate-900"
                          )}>
                            {item.label}
                          </span>
                          <div className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                            selected 
                              ? "bg-primary border-primary" 
                              : "bg-white border-slate-200 group-hover:border-primary/30"
                          )}>
                            {selected && <Check className="w-3.5 h-3.5 text-white stroke-[4px]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="p-8 bg-slate-50/50 border-t flex flex-row justify-end gap-3 rounded-b-3xl">
              <Button 
                variant="ghost" 
                onClick={() => setIsRoleDialogOpen(false)} 
                className="h-12 px-8 font-bold text-slate-500 rounded-xl hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveRole} 
                className="h-12 px-10 bg-primary hover:bg-primary/90 text-white font-black rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
              >
                Commit Role
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
