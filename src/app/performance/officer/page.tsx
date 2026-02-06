import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Users, TrendingUp, Clock, CheckCircle } from "lucide-react"

export default function OfficerPerformancePage() {
  const officers = [
    { name: 'Jane Smith', role: 'KYC Officer', processed: 42, approved: 38, avgTime: '0.8d' },
    { name: 'Robert Brown', role: 'Supervisor', processed: 15, approved: 14, avgTime: '1.5d' },
    { name: 'Alice Wilson', role: 'Director', processed: 8, approved: 6, avgTime: '2.1d' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Officer Performance</h1>
        <p className="text-muted-foreground">Productivity and accuracy metrics for verification staff.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {officers.map((officer) => (
          <Card key={officer.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-bold">{officer.name}</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-4">{officer.role}</div>
              <div className="space-y-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Processed
                  </span>
                  <span className="font-semibold">{officer.processed}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Approval Rate
                  </span>
                  <span className="font-semibold text-green-600">{Math.round((officer.approved / officer.processed) * 100)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Avg. Time
                  </span>
                  <span className="font-semibold">{officer.avgTime}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
