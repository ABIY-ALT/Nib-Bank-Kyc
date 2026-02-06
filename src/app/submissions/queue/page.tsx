import { MOCK_SUBMISSIONS } from "@/lib/kyc-data";
import { SubmissionsPageContent } from "../submissions-content";

export default function ReviewQueuePage() {
  const submissions = MOCK_SUBMISSIONS.filter(s => s.status === 'Pending' || s.status === 'In Review');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Review Queue</h1>
        <p className="text-muted-foreground">Manage and process pending KYC verification requests.</p>
      </div>
      <SubmissionsPageContent submissions={submissions} />
    </div>
  );
}
