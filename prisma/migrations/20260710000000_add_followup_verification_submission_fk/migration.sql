-- Adds the FK that ties FollowUpVerification.submissionId back to KYC.id.
-- On databases with pre-existing orphaned FollowUpVerification rows (submissionId
-- pointing at a deleted KYC record), this statement will fail with a foreign key
-- violation. Either delete the orphans first (scripts/clean-orphan-followups.js)
-- or apply the constraint as NOT VALID out-of-band and mark this migration
-- resolved (`prisma migrate resolve --applied 20260710000000_add_followup_verification_submission_fk`).
ALTER TABLE "FollowUpVerification" ADD CONSTRAINT "FollowUpVerification_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "KYC"("id") ON DELETE CASCADE ON UPDATE CASCADE;
