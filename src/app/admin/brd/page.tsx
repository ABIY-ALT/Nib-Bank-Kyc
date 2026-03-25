'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  ShieldCheck, 
  Zap, 
  Users, 
  BarChart3, 
  Lock, 
  Globe, 
  ClipboardCheck,
  CheckCircle2,
  Building2,
  Scale,
  History,
  Info,
  Loader2
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { usePermissions } from '@/hooks/use-permissions';

export default function SystemBRDPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();

  useEffect(() => {
    if (!permissionsLoading && !isSuperAdmin) {
      router.push('/unauthorized?required=SUPER_ADMIN');
    }
  }, [isSuperAdmin, permissionsLoading, router]);

  if (permissionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Verifying Clearance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">System Governance & BRD</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Official Business Requirements and Institutional Capability Framework.</p>
        </div>
        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-4 py-1.5 font-bold h-10 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> v1.0 Production Blueprint
        </Badge>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-8 shadow-xl border-slate-200 overflow-hidden">
          <CardHeader className="bg-primary text-white border-b">
            <CardTitle className="text-xl flex items-center gap-2 text-white">
              <Globe className="w-5 h-5 text-white" />
              1. Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 space-y-6">
            <p className="text-slate-700 leading-relaxed font-medium">
              The **Nib Bank KYC Flow** is a mission-critical institutional platform designed to digitize and secure the Know Your Customer lifecycle. It replaces manual, fragmented verification processes with a unified, role-based workflow that ensures absolute regulatory compliance, operational transparency, and high-velocity account opening.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                <h3 className="font-black text-slate-900 uppercase tracking-widest text-[11px]">Primary Mission</h3>
                <p className="text-sm text-slate-600 leading-relaxed">To mitigate institutional risk through standardized identity verification and multi-level oversight.</p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                <h3 className="font-black text-slate-900 uppercase tracking-widest text-[11px]">Regulatory Anchor</h3>
                <p className="text-sm text-slate-600 leading-relaxed">Aligned with National Bank of Ethiopia (NBE) mandates for digital identity preservation.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-4 space-y-6">
          <Card className="shadow-lg border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-primary">Workflow Architecture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">Approval Levels</span>
                <Badge variant="secondary" className="bg-white border-primary/20 font-black">7 Branches</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">User Roles</span>
                <Badge variant="secondary" className="bg-white border-primary/20 font-black">11 Designations</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">Audit Retention</span>
                <Badge variant="secondary" className="bg-white border-primary/20 font-black">7 Years</Badge>
              </div>
            </CardContent>
          </Card>
          <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
            <div className="flex items-center gap-2 text-amber-800">
              <Info className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest">Compliance Note</span>
            </div>
            <p className="text-xs text-amber-900 font-medium leading-relaxed italic">
              "This system is an immutable record. All determination events are timestamped and cryptographically linked to individual staff identities."
            </p>
          </div>
        </div>

        <Card className="lg:col-span-12 shadow-xl border-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              2. Functional Capability Matrix
            </CardTitle>
            <CardDescription>Core institutional features and business logic requirements.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x border-b">
              <div className="p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Building2 className="w-5 h-5" /></div>
                  <h3 className="font-black text-slate-900">Branch Operations</h3>
                </div>
                <ul className="space-y-3">
                  <li className="flex gap-2 text-sm text-slate-600 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Multi-file customer asset uploads</li>
                  <li className="flex gap-2 text-sm text-slate-600 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Corrective "Response Note" workspace</li>
                  <li className="flex gap-2 text-sm text-slate-600 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Real-time status tracking</li>
                </ul>
              </div>
              <div className="p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Scale className="w-5 h-5" /></div>
                  <h3 className="font-black text-slate-900">Verification Logic</h3>
                </div>
                <ul className="space-y-3">
                  <li className="flex gap-2 text-sm text-slate-600 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Dynamic Checklist Verification</li>
                  <li className="flex gap-2 text-sm text-slate-600 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Standardized Finding Registry (F&Q)</li>
                  <li className="flex gap-2 text-sm text-slate-600 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Sequential Hierarchy Flow</li>
                </ul>
              </div>
              <div className="p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><History className="w-5 h-5" /></div>
                  <h3 className="font-black text-slate-900">Oversight & Audit</h3>
                </div>
                <ul className="space-y-3">
                  <li className="flex gap-2 text-sm text-slate-600 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Head Office Follow-up Shared Pool</li>
                  <li className="flex gap-2 text-sm text-slate-600 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Overall Audit Archive with IP Logs</li>
                  <li className="flex gap-2 text-sm text-slate-600 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Bulk Master Archive (ZIP) Exports</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-6 shadow-xl border-slate-200">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              3. Institutional Security Standards
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 space-y-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <Badge variant="outline" className="bg-slate-900 text-white font-black shrink-0 h-fit">REQ-01</Badge>
                <div>
                  <p className="font-bold text-slate-900">Domain Lockdown</p>
                  <p className="text-sm text-slate-500">Mandatory authentication via @nibbank.com.et institutional addresses only.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Badge variant="outline" className="bg-slate-900 text-white font-black shrink-0 h-fit">REQ-02</Badge>
                <div>
                  <p className="font-bold text-slate-900">Zero-Deletion Policy</p>
                  <p className="text-sm text-slate-500">Staff records are preserved indefinitely; status toggles (Active/Inactive) manage access without purging data.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Badge variant="outline" className="bg-slate-900 text-white font-black shrink-0 h-fit">REQ-03</Badge>
                <div>
                  <p className="font-bold text-slate-900">Granular RBAC</p>
                  <p className="text-sm text-slate-500">Permission Matrix architecture allows for custom role definitions while locking core system roles.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-6 shadow-xl border-slate-200">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              4. Analytics & Reporting
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 space-y-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <Badge variant="outline" className="bg-primary text-white font-black shrink-0 h-fit">METRIC-A</Badge>
                <div>
                  <p className="font-bold text-slate-900">Officer Productivity Index</p>
                  <p className="text-sm text-slate-500">Tracks individual resolution accuracy and cycle times per officer.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Badge variant="outline" className="bg-primary text-white font-black shrink-0 h-fit">METRIC-B</Badge>
                <div>
                  <p className="font-bold text-slate-900">Branch Velocity</p>
                  <p className="text-sm text-slate-500">Aggregates regional district performance and SLA compliance health.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Badge variant="outline" className="bg-primary text-white font-black shrink-0 h-fit">METRIC-C</Badge>
                <div>
                  <p className="font-bold text-slate-900">Compliance Reporting</p>
                  <p className="text-sm text-slate-500">Automated CSV generators for regulatory audit cycles.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
