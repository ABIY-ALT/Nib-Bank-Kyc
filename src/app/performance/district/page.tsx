"use client"

import { useFirestore, useCollection } from "@/firebase";
import { collection, query } from "firebase/firestore";
import { useMemo } from "react";
import { KYCSubmission } from "@/lib/kyc-data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Map, TrendingUp, Building2, AlertTriangle, Loader2, BarChart3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

export default function DistrictPerformancePage() {
  const db = useFirestore();
  const { data: submissions, loading } = useCollection<KYCSubmission>(
    db ? query(collection(db, "submissions")) : null
  );

  const districtMetrics = useMemo(() => {
    if (!submissions) return [];
    
    const districts: Record<string, any> = {};
    
    // Simple branch to district mapping for demo purposes
    const branchToDistrict: Record<string, string> = {
      'Downtown': 'Central',
      'Uptown': 'Central',
      'East Side': 'Central',
      'Northern Branch': 'Northern',
      'Valley Branch': 'Northern',
      'South Coast': 'Southern',
      'Port City': 'Southern',
      'Headquarters': 'Central'
    };

    submissions.forEach(sub => {
      const branch = sub.branch || "Headquarters";
      const districtName = (sub as any).district || branchToDistrict[branch] || "Unassigned";
      
      if (!districts[districtName]) {
        districts[districtName] = { 
          name: districtName, 
          branches: new Set(), 
          volume: 0, 
          compliant: 0, 
          totalProcessed: 0 
        };
      }
      
      districts[districtName].volume += 1;
      districts[districtName].branches.add(branch);
      
      // SLA Compliance: Assume Approved/Rejected cases are "resolved" 
      if (['Approved', 'Rejected'].includes(sub.status)) {
        districts[districtName].compliant += 1;
      }
      if (sub.status !== 'Pending') {
        districts[districtName].totalProcessed += 1;
      }
    });

    return Object.values(districts).map((d: any) => ({
      ...d,
      branchCount: d.branches.size,
      complianceRate: d.volume > 0 ? Math.round((d.compliant / d.volume) * 100) : 0
    })).sort((a, b) => b.volume - a.volume);
  }, [submissions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">District Performance</h1>
          <p className="text-muted-foreground text-lg">Regional oversight of KYC efficiency and institutional compliance.</p>
        </div>
        <div className="flex gap-3">
          <Badge variant="outline" className="px-4 py-1.5 bg-white shadow-sm font-bold text-primary border-primary/20">
            Total Districts: {districtMetrics.length}
          </Badge>
          <Badge variant="outline" className="px-4 py-1.5 bg-white shadow-sm font-bold text-slate-600">
            Total Network Volume: {submissions?.length || 0}
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-bold animate-pulse">Aggregating regional district data...</p>
        </div>
      ) : districtMetrics.length === 0 ? (
        <div className="p-20 border-2 border-dashed rounded-3xl text-center bg-slate-50/50">
          <Map className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-bold text-lg">No regional data available.</p>
          <p className="text-slate-400 text-sm mt-1">Districts will appear once submissions are mapped and processed.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {districtMetrics.map((district) => (
            <Card key={district.name} className="shadow-lg border-slate-200 overflow-hidden group hover:border-primary/40 transition-all duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-slate-50/80 border-b pb-4 px-6">
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">{district.name} District</CardTitle>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5 text-primary">Regional Operations</p>
                </div>
                <div className="p-2.5 bg-white rounded-xl border shadow-sm text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                  <Map className="w-5 h-5" />
                </div>
              </CardHeader>
              <CardContent className="pt-8 px-6 space-y-6 pb-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">District Volume</p>
                    <p className="text-3xl font-bold text-slate-900">{district.volume}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Branches</p>
                    <p className="text-3xl font-bold text-primary">{district.branchCount}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> SLA Compliance</span>
                    <span className="text-orange-600">{district.complianceRate}%</span>
                  </div>
                  <Progress value={district.complianceRate} className="h-2 bg-slate-100" />
                </div>

                <div className="pt-6 border-t border-slate-100 grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      Coverage Efficiency
                    </span>
                    <span className="text-primary font-bold">High</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      Resolution Rate
                    </span>
                    <span className="text-emerald-600">{district.complianceRate}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Institutional Summary Card */}
      <Card className="border-primary/20 bg-slate-900 text-white shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <BarChart3 className="w-32 h-32" />
        </div>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Network Summary</CardTitle>
          <p className="text-slate-400">Aggregated insights across all regional districts.</p>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-8 py-4">
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Global Volume</p>
              <p className="text-5xl font-extrabold">{submissions?.length || 0}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Districts</p>
              <p className="text-5xl font-extrabold text-primary">{districtMetrics.length}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Health</p>
              <p className="text-5xl font-extrabold text-emerald-500">98%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
