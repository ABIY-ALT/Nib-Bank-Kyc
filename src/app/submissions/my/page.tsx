import { MOCK_SUBMISSIONS } from "@/lib/kyc-data";
import { currentUser } from "@/lib/auth-mock";
import { SubmissionsPageContent } from "../submissions-content";

export default function MySubmissionsPage() {
  const user = currentUser;
  const submissions = MOCK_SUBMISSIONS.filter(s => s.submittedBy === user.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Submissions</h1>
        <p className="text-muted-foreground">Track identity verification requests you initiated.</p>
      </div>
      <SubmissionsPageContent submissions={submissions} />
    </div>
  );
}
