import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);

  if (!admin) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const order = payload as any;

  const reservations = await prisma.reservation.findMany({
    where: { shop },
  });

  const reservationMap = new Map(
    reservations.map((r) => [r.productId, r]),
  );

  for (const lineItem of order.line_items || []) {
    const productGid = `gid://shopify/Product/${lineItem.product_id}`;
    const reservation = reservationMap.get(productGid);

    if (!reservation) continue;

    // Query the inventory item for this variant to adjust inventory
    const inventoryResponse = await admin.graphql(
      `#graphql
      query GetInventoryItem($variantId: ID!) {
        productVariant(id: $variantId) {
          inventoryItem {
            id
            inventoryLevels(first: 1) {
              edges {
                node {
                  id
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                  location {
                    id
                  }
                }
              }
            }
          }
        }
      }`,
      {
        variables: {
          variantId: `gid://shopify/ProductVariant/${lineItem.variant_id}`,
        },
      },
    );

    const inventoryData = await inventoryResponse.json();
    const inventoryItem =
      inventoryData.data?.productVariant?.inventoryItem;
    const inventoryLevel =
      inventoryItem?.inventoryLevels?.edges?.[0]?.node;

    if (!inventoryLevel) continue;

    // Track deposit order for expiry cron job
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + reservation.expiryDays);

    await prisma.depositOrder.create({
      data: {
        shop,
        orderId: `gid://shopify/Order/${order.id}`,
        orderName: order.name,
        productId: productGid,
        variantId: `gid://shopify/ProductVariant/${lineItem.variant_id}`,
        customerEmail: order.email || null,
        depositAmount: parseFloat(lineItem.price),
        fullPrice: parseFloat(lineItem.price),
        expiresAt,
      },
    });

    // Reserve the inventory by adjusting the available quantity down
    await admin.graphql(
      `#graphql
      mutation InventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          userErrors {
            field
            message
          }
          inventoryAdjustmentGroup {
            reason
          }
        }
      }`,
      {
        variables: {
          input: {
            reason: "reservation",
            name: "available",
            changes: [
              {
                delta: -lineItem.quantity,
                inventoryItemId: inventoryItem.id,
                locationId: inventoryLevel.location.id,
              },
            ],
          },
        },
      },
    );
  }

  return new Response("OK", { status: 200 });
};
