-- CreateTable
CREATE TABLE "DepositOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "depositAmount" REAL NOT NULL,
    "fullPrice" REAL NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "restockedAt" DATETIME,
    "reminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "DepositOrder_shop_idx" ON "DepositOrder"("shop");

-- CreateIndex
CREATE INDEX "DepositOrder_status_expiresAt_idx" ON "DepositOrder"("status", "expiresAt");
