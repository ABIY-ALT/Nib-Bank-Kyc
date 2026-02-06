import { MOCK_SUBMISSIONS } from "@/lib/kyc-data";
import { SubmissionsPageContent } from "../submissions-content";

export default function AmendmentRequestsPage() {
  // Logic to show cases currently needing branch action
  const submissions = MOCK_SUBMISSIONS.filter(s => s.status === 'Amended');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Amendment Requests</h1>
        <p className="text-muted-foreground">Active requests for additional documentation or information.</p>
      </div>
      <SubmissionsPageContent submissions={submissions} />
    </div>
  );
}
