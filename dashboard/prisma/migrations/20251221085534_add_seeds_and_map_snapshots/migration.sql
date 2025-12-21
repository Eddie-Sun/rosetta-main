-- CreateEnum
CREATE TYPE "SeedUrlSource" AS ENUM ('firecrawl_map', 'manual');

-- CreateTable
CREATE TABLE "SeedUrl" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" "SeedUrlSource" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapSnapshot" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "urls" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeedUrl_customerId_enabled_idx" ON "SeedUrl"("customerId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "SeedUrl_customerId_url_key" ON "SeedUrl"("customerId", "url");

-- CreateIndex
CREATE INDEX "MapSnapshot_customerId_fetchedAt_idx" ON "MapSnapshot"("customerId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MapSnapshot_customerId_domainId_key" ON "MapSnapshot"("customerId", "domainId");

-- AddForeignKey
ALTER TABLE "SeedUrl" ADD CONSTRAINT "SeedUrl_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapSnapshot" ADD CONSTRAINT "MapSnapshot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapSnapshot" ADD CONSTRAINT "MapSnapshot_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
