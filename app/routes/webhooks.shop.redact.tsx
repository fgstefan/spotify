import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  console.log(`[GDPR] Shop redact request for ${shop}`);

  // Delete all app data for this shop
  await prisma.depositOrder.deleteMany({ where: { shop } });
  await prisma.reservation.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });

  return new Response();
};
