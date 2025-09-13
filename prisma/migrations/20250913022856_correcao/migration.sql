-- AlterTable
ALTER TABLE "public"."Employee" ADD COLUMN     "sectorId" UUID;

-- CreateIndex
CREATE INDEX "Employee_storeId_idx" ON "public"."Employee"("storeId");

-- CreateIndex
CREATE INDEX "Employee_sectorId_idx" ON "public"."Employee"("sectorId");

-- AddForeignKey
ALTER TABLE "public"."Employee" ADD CONSTRAINT "Employee_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "public"."Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
