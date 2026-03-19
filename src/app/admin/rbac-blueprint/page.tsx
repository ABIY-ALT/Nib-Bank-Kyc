'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, 
  Printer, 
  Database, 
  UserPlus, 
  Settings2, 
  Lock, 
  ArrowRight, 
  ChevronRight,
  Info,
  CheckCircle2,
  Table as TableIcon,
  Workflow,
  LayoutDashboard,
  Building2,
  FileBarChart,
  UserCog,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { SYSTEM_SECTION_COPY } from "@/lib/access-ui";

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
  { module: "Audit & Reporting", page: "Follow-up Workspace", officer: "-", super: "R", director: "R", admin: "-" },
  { module: "Audit & Reporting", page: "Audit Reports", officer: "-", super: "R", director: "R", admin: "-" },
  { module: "Audit & Reporting", page: "Master Archive", officer: "-", super: "-", director: "R", admin: "-" },

  { module: "Administration", page: SYSTEM_SECTION_COPY.USER_CREATE.label, officer: "-", super: "-", director: "-", admin: "W" },
  { module: "Administration", page: SYSTEM_SECTION_COPY.ROLE_CREATE.label, officer: "-", super: "-", director: "-", admin: "W" },
  { module: "Administration", page: SYSTEM_SECTION_COPY.MAP_USERS_TO_BRANCH.label, officer: "-", super: "W", director: "-", admin: "-" },
  { module: "Administration", page: SYSTEM_SECTION_COPY.MANAGE_BRANCHES.label, officer: "-", super: "-", director: "R", admin: "W" },
  { module: "Administration", page: SYSTEM_SECTION_COPY.EDIT_SLA_POLICY.label, officer: "-", super: "-", director: "-", admin: "W" },
  { module: "Administration", page: SYSTEM_SECTION_COPY.VIEW_SYSTEM_AUDIT.label, officer: "-", super: "R", director: "-", admin: "R" },
];

export default function RBACBlueprintPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();

  useEffect(() => {
    if (!permissionsLoading && !isSuperAdmin) {
      router.push('/unauthorized?required=SUPER_ADMIN');
    }
  }, [isSuperAdmin, permissionsLoading, router]);

  const handlePrint = () => {
    window.print();
  };

  const getPermBadge = (val: string) => {
    if (val === 'R') return <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center font-black text-xs">R</div>;
    if (val === 'W') return <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center font-black text-xs">W</div>;
    if (val === 'RW') return <div className="w-12 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center font-black text-xs gap-1">R/W</div>;
    return <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-300 flex items-center justify-center font-black text-xs">-</div>;
  };

  if (permissionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Verifying Clearance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-20 print:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">RBAC Blueprint</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Institutional framework for role-based governance and access enforcement.</p>
        </div>
        <Button onClick={handlePrint} className="gap-2 h-12 px-8 bg-slate-900 text-white font-black shadow-xl rounded-xl transition-all active:scale-95">
          <Printer className="w-5 h-5" /> Export Blueprint
        </Button>
      </div>

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
                  <UserPlus className="w-6 h-6" />
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
          <CardHeader className="bg-primary text-white p-8">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl font-black text-white">Role-Based Capability Matrix</CardTitle>
                <CardDescription className="text-white/70 font-bold text-[10px] uppercase tracking-widest mt-1">Single Source of Truth for Security Audits</CardDescription>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-500" /><span className="text-[10px] font-black uppercase text-white/60">Read Only</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-500" /><span className="text-[10px] font-black uppercase text-white/60">Write Access</span></div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left py-6 pl-10 font-black text-[11px] uppercase tracking-widest text-slate-500 w-[240px]">Module / Branch</th>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 print:hidden">
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Level R: Read</CardTitle></CardHeader>
          <CardContent className="text-xs text-slate-500 font-medium leading-relaxed">
            Authorized to visualize data entries, download records, and monitor workflow status. No modification rights.
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Level W: Write</CardTitle></CardHeader>
          <CardContent className="text-xs text-slate-500 font-medium leading-relaxed">
            Authorized to initiate submissions, record technical determinations, and update institutional metadata.
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Level -: No Access</CardTitle></CardHeader>
          <CardContent className="text-xs text-slate-500 font-medium leading-relaxed">
            Restricted zone. Entry is blocked via institutional gateway and data is not synchronized to the session.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
