import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Building2, TrendingUp, Users, Clock } from "lucide-react"

export default function BranchPerformancePage() {
  const branches = [
    { name: 'Downtown', volume: 154, approvalRate: '94%', avgTime: '1.2d' },
    { name: 'Uptown', volume: 89, approvalRate: '88%', avgTime: '1.5d' },
    { name: 'East Side', volume: 112, approvalRate: '91%', avgTime: '1.4d' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Branch Performance</h1>
        <p className="text-muted-foreground">Comparative analysis of KYC workflow efficiency across branches.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {branches.map((branch) => (
          <Card key={branch.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg font-bold">{branch.name}</CardTitle>
              <Building2 className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Volume
                  </span>
                  <span className="font-semibold">{branch.volume}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> Approval Rate
                  </span>
                  <span className="font-semibold text-green-600">{branch.approvalRate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Avg. Time
                  </span>
                  <span className="font-semibold">{branch.avgTime}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
