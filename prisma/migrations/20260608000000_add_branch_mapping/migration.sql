-- CreateEnum
CREATE TYPE "MappingType" AS ENUM ('PERMANENT', 'TEMPORARY');

-- CreateTable
CREATE TABLE "BranchMapping" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "MappingType" NOT NULL DEFAULT 'PERMANENT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchMappingOfficer" (
    "mappingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BranchMappingOfficer_pkey" PRIMARY KEY ("mappingId","userId")
);

-- CreateIndex
CREATE INDEX "BranchMapping_branchId_idx" ON "BranchMapping"("branchId");

-- CreateIndex
CREATE INDEX "BranchMappingOfficer_userId_idx" ON "BranchMappingOfficer"("userId");

-- AddForeignKey
ALTER TABLE "BranchMapping" ADD CONSTRAINT "BranchMapping_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMappingOfficer" ADD CONSTRAINT "BranchMappingOfficer_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "BranchMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMappingOfficer" ADD CONSTRAINT "BranchMappingOfficer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
