import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const reservations = await prisma.reservation.findMany({
    where: { shop: session.shop },
  });

  const config = reservations.map((r) => ({
    productId: r.productId,
    depositType: r.depositType,
    depositAmount: r.depositAmount,
  }));

  const response = await admin.graphql(
    `#graphql
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          namespace
          value
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            namespace: "reserve-deposit",
            key: "config",
            type: "json",
            value: JSON.stringify(config),
            ownerId: `gid://shopify/Shop/${session.shop}`,
          },
        ],
      },
    },
  );

  const result = await response.json();
  return json(result);
};
