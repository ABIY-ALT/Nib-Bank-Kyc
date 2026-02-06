"use client"

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
  Legend
} from "recharts";
import { Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

const barData = [
  { month: "Jan", approved: 45, rejected: 12 },
  { month: "Feb", approved: 52, rejected: 15 },
  { month: "Mar", approved: 48, rejected: 8 },
  { month: "Apr", approved: 61, rejected: 10 },
  { month: "May", approved: 55, rejected: 5 },
  { month: "Jun", approved: 67, rejected: 18 },
];

const pieData = [
  { name: 'Downtown', value: 400 },
  { name: 'Uptown', value: 300 },
  { name: 'East Side', value: 300 },
  { name: 'Industrial', value: 200 },
];

const COLORS = ['#3F51B5', '#FF9800', '#4CAF50', '#F44336'];

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
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Workflow Analytics</h1>
          <p className="text-muted-foreground">Monitor performance metrics and branch trends.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Time Range
          </Button>
          <Button className="gap-2">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Approval vs Rejection Trend</CardTitle>
            <CardDescription>Monthly volume of KYC decisions.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ChartContainer config={chartConfig} className="w-full h-full">
              <BarChart data={barData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="approved" fill="var(--color-approved)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" fill="var(--color-rejected)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submission Distribution by Branch</CardTitle>
            <CardDescription>Breakdown of KYC traffic across network.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>SLA Compliance</CardTitle>
            <CardDescription>Percentage of cases resolved within 24 and 48 hour windows.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="flex flex-col items-center justify-center p-6 border rounded-xl bg-green-50/50">
                 <span className="text-4xl font-bold text-green-700">92%</span>
                 <span className="text-sm font-medium mt-1">Within 24 Hours</span>
              </div>
              <div className="flex flex-col items-center justify-center p-6 border rounded-xl bg-blue-50/50">
                 <span className="text-4xl font-bold text-blue-700">98%</span>
                 <span className="text-sm font-medium mt-1">Within 48 Hours</span>
              </div>
              <div className="flex flex-col items-center justify-center p-6 border rounded-xl bg-orange-50/50">
                 <span className="text-4xl font-bold text-orange-700">1.2d</span>
                 <span className="text-sm font-medium mt-1">Avg Resolution Time</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}