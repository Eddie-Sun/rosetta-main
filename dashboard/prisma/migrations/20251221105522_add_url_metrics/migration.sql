-- CreateTable
CREATE TABLE "UrlMetrics" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "htmlTokens" INTEGER,
    "mdTokens" INTEGER,
    "optimizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrlMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UrlMetrics_customerId_optimizedAt_idx" ON "UrlMetrics"("customerId", "optimizedAt");

-- CreateIndex
CREATE INDEX "UrlMetrics_customerId_url_idx" ON "UrlMetrics"("customerId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "UrlMetrics_customerId_url_key" ON "UrlMetrics"("customerId", "url");

-- AddForeignKey
ALTER TABLE "UrlMetrics" ADD CONSTRAINT "UrlMetrics_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
