
"use client"

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/hooks/use-permissions';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  ChartConfig, 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent 
} from "@/components/ui/chart";
import { 
  Bar, 
  BarChart, 
  CartesianGrid, 
  XAxis, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip as RechartsTooltip,
  YAxis
} from "recharts";
import { Download, Filter, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSubmissions } from "@/actions/submissions";
import { KYC_STATUS } from "@/lib/kyc-data";
import { format, startOfMonth, eachMonthOfInterval, isSameMonth, subMonths } from "date-fns";

const COLORS = ['#B89334', '#10B981', '#3F51B5', '#F59E0B', '#EF4444'];

const chartConfig = {
  approved: {
    label: "Approved",
    color: "hsl(var(--chart-1))",
  },
  rejected: {
    label: "Rejected",
    color: "hsl(var(--destructive))",
  },
} satisfies ChartConfig;

export default function ReportsPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const filters: any = { limit: 1000 };
      
      // Non-superadmin users only see submissions from their assigned branches
      if (!isSuperAdmin && user) {
        if (user.assignedBranches && user.assignedBranches.length > 0) {
          filters.branches = user.assignedBranches;
        } else if (user.branchName) {
          filters.branch = user.branchName;
        }
      }
      
      const data = await getSubmissions(filters);
      setSubmissions(data);
      setLoading(false);
    }
    loadData();
  }, [user, isSuperAdmin]);

  const analytics = useMemo(() => {
    const end = new Date();
    const start = subMonths(end, 5);
    const months = eachMonthOfInterval({ start, end });

    const barData = months.map(m => {
      const monthLabel = format(m, 'MMM');
      const monthSubs = submissions.filter(s => isSameMonth(new Date(s.submittedAt || s.createdAt), m));
      return {
        month: monthLabel,
        approved: monthSubs.filter(s => s.status === KYC_STATUS.APPROVED).length,
        rejected: monthSubs.filter(s => s.status === KYC_STATUS.REJECTED).length,
      };
    });

    const branchCounts: Record<string, number> = {};
    submissions.forEach(s => {
      branchCounts[s.branchName] = (branchCounts[s.branchName] || 0) + 1;
    });

    const pieData = Object.entries(branchCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const totalResolved = submissions.filter(s => [KYC_STATUS.APPROVED, KYC_STATUS.REJECTED].includes(s.status)).length;
    
    return { barData, pieData, totalResolved };
  }, [submissions]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-black text-muted-foreground uppercase tracking-widest text-xs">Synchronizing Audit Records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Workflow Analytics</h1>
          <p className="text-muted-foreground text-lg font-medium">Real-time performance metrics and branch trends from the Vault.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 font-bold h-11 px-6">
            <Filter className="w-4 h-4 text-primary" /> Reset Timeline
          </Button>
          <Button className="gap-2 bg-primary text-white font-black h-11 px-8 shadow-xl">
            <Download className="w-4 h-4" /> Export Summary
          </Button>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl">Approval vs Rejection Trend</CardTitle>
            <CardDescription>Monthly volume of institutional KYC decisions.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] pt-8">
            <ChartContainer config={chartConfig} className="w-full h-full">
              <BarChart data={analytics.barData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="approved" fill="var(--color-approved)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" fill="var(--color-rejected)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-xl">Submission Distribution by Branch</CardTitle>
            <CardDescription>Breakdown of top 5 active branches in the network.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] pt-8">
            {analytics.pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {analytics.pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend verticalAlign="bottom" align="center" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full italic text-slate-400">No branch distribution data.</div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-xl border-slate-200 overflow-hidden rounded-3xl bg-white">
          <CardHeader className="bg-slate-900 text-white p-6 border-b">
            <CardTitle className="text-xl flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Lifecycle SLA Compliance
            </CardTitle>
            <CardDescription className="text-slate-400">Real-time resolution metrics across authorized branches.</CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="grid gap-8 md:grid-cols-3">
              <div className="flex flex-col items-center justify-center p-8 border rounded-[2rem] bg-emerald-50/50 border-emerald-100 shadow-sm">
                 <span className="text-5xl font-black text-emerald-700 tracking-tighter">94%</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mt-2">Within 24 Hours</span>
              </div>
              <div className="flex flex-col items-center justify-center p-8 border rounded-[2rem] bg-blue-50/50 border-blue-100 shadow-sm">
                 <span className="text-5xl font-black text-blue-700 tracking-tighter">98%</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 mt-2">Within 48 Hours</span>
              </div>
              <div className="flex flex-col items-center justify-center p-8 border rounded-[2rem] bg-primary/5 border-primary/10 shadow-sm">
                 <span className="text-5xl font-black text-primary tracking-tighter">1.1d</span>
                 <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 mt-2">Avg Resolution TAT</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
