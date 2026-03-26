/**
 * Cron job: Process expired reservations
 *
 * 1. Find active deposit orders past their expiry date
 * 2. Restock inventory (+1 per expired reservation)
 * 3. Send balance-due reminder emails before expiry
 * 4. Mark expired orders as "expired"
 *
 * Run via: npx tsx jobs/process-expired-reservations.ts
 * Scheduled via GitHub Actions (see .github/workflows/cron-reservations.yml)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SHOPIFY_API_VERSION = "2025-01";
const REMINDER_DAYS_BEFORE = 2;

interface ShopSession {
  shop: string;
  accessToken: string;
}

async function getShopSession(shop: string): Promise<ShopSession | null> {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
  });

  if (!session) return null;
  return { shop: session.shop, accessToken: session.accessToken };
}

async function shopifyGraphQL(session: ShopSession, query: string, variables: Record<string, any> = {}) {
  const response = await fetch(
    `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  return response.json();
}

async function restockInventory(session: ShopSession, variantId: string, quantity: number = 1) {
  // Get inventory item and location
  const inventoryResult = await shopifyGraphQL(session, `
    query GetInventoryItem($variantId: ID!) {
      productVariant(id: $variantId) {
        inventoryItem {
          id
          inventoryLevels(first: 1) {
            edges {
              node {
                location { id }
              }
            }
          }
        }
      }
    }
  `, { variantId });

  const inventoryItem = inventoryResult.data?.productVariant?.inventoryItem;
  const location = inventoryItem?.inventoryLevels?.edges?.[0]?.node?.location;

  if (!inventoryItem || !location) {
    console.error(`Could not find inventory for variant ${variantId}`);
    return false;
  }

  // Add inventory back
  const adjustResult = await shopifyGraphQL(session, `
    mutation InventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        userErrors { field message }
      }
    }
  `, {
    input: {
      reason: "reservation_expired",
      name: "available",
      changes: [{
        delta: quantity,
        inventoryItemId: inventoryItem.id,
        locationId: location.id,
      }],
    },
  });

  const errors = adjustResult.data?.inventoryAdjustQuantities?.userErrors;
  if (errors?.length) {
    console.error(`Inventory adjust errors for ${variantId}:`, errors);
    return false;
  }

  return true;
}

async function sendBalanceDueEmail(session: ShopSession, depositOrder: any) {
  // Use Shopify's email notification via the Marketing API or a direct email
  // For now, we trigger a customer notification via order note update
  // In production, integrate with an email service (SendGrid, Shopify Email, etc.)

  console.log(
    `[REMINDER] Balance due email for order ${depositOrder.orderName} to ${depositOrder.customerEmail}`,
    `- Expires: ${depositOrder.expiresAt}`,
  );

  // Tag the order to trigger Shopify Flow or email automation
  await shopifyGraphQL(session, `
    mutation OrderUpdate($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { id }
        userErrors { field message }
      }
    }
  `, {
    input: {
      id: depositOrder.orderId,
      tags: ["balance-due-reminder-sent"],
      note: `Reservation expires on ${new Date(depositOrder.expiresAt).toLocaleDateString()}. Balance due reminder sent.`,
    },
  });

  return true;
}

async function processExpiredReservations() {
  const now = new Date();

  console.log(`[CRON] Processing expired reservations at ${now.toISOString()}`);

  // 1. Find and expire active orders past expiry date
  const expiredOrders = await prisma.depositOrder.findMany({
    where: {
      status: "active",
      expiresAt: { lte: now },
    },
  });

  console.log(`[CRON] Found ${expiredOrders.length} expired reservations`);

  for (const order of expiredOrders) {
    const session = await getShopSession(order.shop);
    if (!session) {
      console.error(`No session found for shop ${order.shop}`);
      continue;
    }

    // Auto-restock inventory
    const restocked = await restockInventory(session, order.variantId);

    if (restocked) {
      await prisma.depositOrder.update({
        where: { id: order.id },
        data: {
          status: "expired",
          restockedAt: now,
        },
      });
      console.log(`[CRON] Expired and restocked: ${order.orderName} (${order.variantId})`);
    } else {
      console.error(`[CRON] Failed to restock: ${order.orderName}`);
    }
  }

  // 2. Send balance-due reminders for orders expiring soon
  const reminderThreshold = new Date();
  reminderThreshold.setDate(reminderThreshold.getDate() + REMINDER_DAYS_BEFORE);

  const upcomingExpiry = await prisma.depositOrder.findMany({
    where: {
      status: "active",
      expiresAt: { lte: reminderThreshold, gt: now },
      reminderSentAt: null,
      customerEmail: { not: null },
    },
  });

  console.log(`[CRON] Found ${upcomingExpiry.length} orders needing balance-due reminders`);

  for (const order of upcomingExpiry) {
    const session = await getShopSession(order.shop);
    if (!session) continue;

    await sendBalanceDueEmail(session, order);

    await prisma.depositOrder.update({
      where: { id: order.id },
      data: { reminderSentAt: now },
    });
    console.log(`[CRON] Reminder sent: ${order.orderName} -> ${order.customerEmail}`);
  }

  console.log(`[CRON] Done.`);
}

processExpiredReservations()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
