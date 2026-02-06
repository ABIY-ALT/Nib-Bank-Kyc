import { MOCK_SUBMISSIONS } from "@/lib/kyc-data";
import { SubmissionsPageContent } from "../submissions-content";

export default function AmendmentReviewPage() {
  const submissions = MOCK_SUBMISSIONS.filter(s => s.status === 'Amended');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Amendment Review</h1>
        <p className="text-muted-foreground">Review submissions that have been updated following amendment requests.</p>
      </div>
      <SubmissionsPageContent submissions={submissions} />
    </div>
  );
}
