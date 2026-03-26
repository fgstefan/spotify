-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "depositType" TEXT NOT NULL DEFAULT 'fixed',
    "depositAmount" REAL NOT NULL,
    "expiryDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Reservation_shop_idx" ON "Reservation"("shop");

-- CreateIndex
CREATE INDEX "Reservation_shop_productId_idx" ON "Reservation"("shop", "productId");
