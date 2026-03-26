import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const customer = payload as any;
  const email = customer?.customer?.email;

  console.log(
    `[GDPR] Customer redact request for ${email || "unknown"} from ${shop}`,
  );

  // Redact customer email from deposit orders
  if (email) {
    await prisma.depositOrder.updateMany({
      where: { shop, customerEmail: email },
      data: { customerEmail: null },
    });
  }

  return new Response();
};
