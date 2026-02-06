import { MOCK_SUBMISSIONS } from "@/lib/kyc-data";
import { SubmissionsPageContent } from "../submissions-content";

export default function EscalatedCasesPage() {
  const submissions = MOCK_SUBMISSIONS.filter(s => s.status === 'Escalated');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Escalated Cases</h1>
        <p className="text-muted-foreground">High-priority cases requiring supervisor or director oversight.</p>
      </div>
      <SubmissionsPageContent submissions={submissions} />
    </div>
  );
}
