import { currentUser } from "@/lib/auth-mock";
import { MOCK_SUBMISSIONS } from "@/lib/kyc-data";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  FileCheck, 
  Clock, 
  AlertCircle, 
  ArrowUpRight,
  TrendingUp,
  History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const user = currentUser;
  const submissions = MOCK_SUBMISSIONS;

  const stats = [
    { label: 'Pending Reviews', value: '12', icon: Clock, color: 'text-blue-600' },
    { label: 'Approved Today', value: '5', icon: FileCheck, color: 'text-green-600' },
    { label: 'Amended Cases', value: '3', icon: AlertCircle, color: 'text-orange-600' },
    { label: 'Average SLA', value: '1.4 Days', icon: TrendingUp, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user.name}</h1>
          <p className="text-muted-foreground">Here is what is happening in your {user.branch || 'system'} workflow today.</p>
        </div>
        {user.role === 'Branch Officer' && (
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link href="/submissions/new">
              New KYC Submission
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest KYC submissions and status changes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {submissions.map((sub) => (
                <div key={sub.id} className="flex items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{sub.customerName}</p>
                    <p className="text-sm text-muted-foreground">{sub.id} • {sub.branch}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-4">
                    <Badge variant={
                      sub.status === 'Approved' ? 'default' : 
                      sub.status === 'Amended' ? 'secondary' : 
                      sub.status === 'Pending' ? 'outline' : 'destructive'
                    }>
                      {sub.status}
                    </Badge>
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/submissions/${sub.id}`}>
                        <ArrowUpRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>System Notifications</CardTitle>
            <CardDescription>Stay updated with workflow events.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
                <div className="flex gap-4 p-3 rounded-lg border bg-accent/5">
                  <History className="w-5 h-5 text-accent shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">Policy Update</p>
                    <p className="text-muted-foreground">New KYC guidelines for high-risk corporate clients are now in effect.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-3 rounded-lg border">
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">Action Required</p>
                    <p className="text-muted-foreground">Submission KYC-1002 has been pending for over 48 hours.</p>
                  </div>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}