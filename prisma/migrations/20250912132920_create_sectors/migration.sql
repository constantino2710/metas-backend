-- AlterEnum
ALTER TYPE "public"."GoalScope" ADD VALUE 'SECTOR';

-- CreateTable
CREATE TABLE "public"."Sector" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sector_storeId_idx" ON "public"."Sector"("storeId");

-- AddForeignKey
ALTER TABLE "public"."Sector" ADD CONSTRAINT "Sector_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
