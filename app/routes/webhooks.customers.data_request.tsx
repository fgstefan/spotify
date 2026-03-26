import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const customer = payload as any;
  const email = customer?.customer?.email;

  console.log(
    `[GDPR] Customer data request for ${email || "unknown"} from ${shop}`,
  );

  // Return any deposit order data associated with this customer
  if (email) {
    const depositOrders = await prisma.depositOrder.findMany({
      where: { shop, customerEmail: email },
    });

    console.log(
      `[GDPR] Found ${depositOrders.length} deposit orders for ${email}`,
    );
  }

  return new Response();
};
