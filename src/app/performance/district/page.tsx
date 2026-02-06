import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Map, TrendingUp, Building2, AlertTriangle } from "lucide-react"

export default function DistrictPerformancePage() {
  const districts = [
    { name: 'Central', branches: 5, volume: 450, compliance: '98%' },
    { name: 'Northern', branches: 3, volume: 210, compliance: '94%' },
    { name: 'Southern', branches: 4, volume: 320, compliance: '96%' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">District Performance</h1>
        <p className="text-muted-foreground">High-level oversight of regional KYC efficiency and compliance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {districts.map((district) => (
          <Card key={district.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg font-bold">{district.name} District</CardTitle>
              <Map className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Branches
                  </span>
                  <span className="font-semibold">{district.branches}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Total Volume
                  </span>
                  <span className="font-semibold">{district.volume}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> SLA Compliance
                  </span>
                  <span className="font-semibold text-blue-600">{district.compliance}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
