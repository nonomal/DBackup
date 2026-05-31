-- CreateTable
CREATE TABLE "DbVersionHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adapterConfigId" TEXT NOT NULL,
    "previousVersion" TEXT,
    "newVersion" TEXT NOT NULL,
    "edition" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DbVersionHistory_adapterConfigId_fkey" FOREIGN KEY ("adapterConfigId") REFERENCES "AdapterConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DbVersionHistory_adapterConfigId_detectedAt_idx" ON "DbVersionHistory"("adapterConfigId", "detectedAt");
