import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Select,
  Button,
  IndexTable,
  Badge,
  InlineStack,
  EmptyState,
  Modal,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const reservations = await prisma.reservation.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  return json({ reservations, shop: session.shop });
};

async function syncCartTransform(admin: any, shop: string) {
  const reservations = await prisma.reservation.findMany({
    where: { shop },
  });

  const config = reservations.map((r) => ({
    productId: r.productId,
    depositType: r.depositType,
    depositAmount: r.depositAmount,
  }));

  const configValue = JSON.stringify(config);

  // Check if a cart transform already exists
  const existingResponse = await admin.graphql(
    `#graphql
    query {
      cartTransforms(first: 10) {
        nodes {
          id
          functionId
        }
      }
    }`,
  );
  const existingData = await existingResponse.json();
  const existing = existingData.data?.cartTransforms?.nodes?.[0];

  if (existing) {
    // Update existing cart transform with new metafield
    await admin.graphql(
      `#graphql
      mutation CartTransformUpdate($id: ID!, $metafields: [MetafieldInput!]) {
        cartTransformUpdate(id: $id, metafields: $metafields) {
          cartTransform { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: existing.id,
          metafields: [
            {
              namespace: "reserve-deposit",
              key: "config",
              type: "json",
              value: configValue,
            },
          ],
        },
      },
    );
  } else {
    // Find the function ID for our cart transform
    const functionsResponse = await admin.graphql(
      `#graphql
      query {
        shopifyFunctions(first: 25) {
          nodes {
            id
            title
            apiType
          }
        }
      }`,
    );
    const functionsData = await functionsResponse.json();
    const cartTransformFn = functionsData.data?.shopifyFunctions?.nodes?.find(
      (fn: any) => fn.apiType === "cart_transform",
    );

    if (!cartTransformFn) {
      console.error("Cart transform function not found");
      return;
    }

    // Create new cart transform
    await admin.graphql(
      `#graphql
      mutation CartTransformCreate($functionId: String!, $metafields: [MetafieldInput!]) {
        cartTransformCreate(functionId: $functionId, metafields: $metafields) {
          cartTransform { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          functionId: cartTransformFn.id,
          metafields: [
            {
              namespace: "reserve-deposit",
              key: "config",
              type: "json",
              value: configValue,
            },
          ],
        },
      },
    );
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const productId = formData.get("productId") as string;
    const productTitle = formData.get("productTitle") as string;
    const depositType = formData.get("depositType") as string;
    const depositAmount = parseFloat(formData.get("depositAmount") as string);
    const expiryDays = parseInt(formData.get("expiryDays") as string, 10);

    await prisma.reservation.create({
      data: {
        shop: session.shop,
        productId,
        productTitle,
        depositType,
        depositAmount,
        expiryDays,
      },
    });

    try {
      await syncCartTransform(admin, session.shop);
    } catch (e) {
      console.error("syncCartTransform error:", e);
    }
    return json({ success: true });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.reservation.delete({ where: { id } });
    try {
      await syncCartTransform(admin, session.shop);
    } catch (e) {
      console.error("syncCartTransform error:", e);
    }
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function Reservations() {
  const { reservations } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [depositType, setDepositType] = useState("fixed");
  const [depositAmount, setDepositAmount] = useState("10");
  const [expiryDays, setExpiryDays] = useState("7");

  const isSubmitting = fetcher.state !== "idle";

  const handleProductPicker = useCallback(async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: false,
    });

    if (selected && selected.length > 0) {
      const product = selected[0];
      setSelectedProduct({
        id: product.id,
        title: product.title,
      });
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!selectedProduct) return;

    fetcher.submit(
      {
        intent: "create",
        productId: selectedProduct.id,
        productTitle: selectedProduct.title,
        depositType,
        depositAmount,
        expiryDays,
      },
      { method: "POST" },
    );

    setShowModal(false);
    setSelectedProduct(null);
    setDepositType("fixed");
    setDepositAmount("10");
    setExpiryDays("7");
  }, [selectedProduct, depositType, depositAmount, expiryDays, fetcher]);

  const handleDelete = useCallback(
    (id: string) => {
      fetcher.submit({ intent: "delete", id }, { method: "POST" });
    },
    [fetcher],
  );

  const depositTypeOptions = [
    { label: "Fixed amount", value: "fixed" },
    { label: "Percentage of price", value: "percentage" },
  ];

  const rowMarkup = reservations.map((reservation, index) => (
    <IndexTable.Row id={reservation.id} key={reservation.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {reservation.productTitle}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={reservation.depositType === "fixed" ? "info" : "success"}>
          {reservation.depositType === "fixed" ? "Fixed" : "Percentage"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {reservation.depositType === "fixed"
          ? `$${reservation.depositAmount.toFixed(2)}`
          : `${reservation.depositAmount}%`}
      </IndexTable.Cell>
      <IndexTable.Cell>{reservation.expiryDays} days</IndexTable.Cell>
      <IndexTable.Cell>
        <Button
          tone="critical"
          variant="plain"
          onClick={() => handleDelete(reservation.id)}
        >
          Remove
        </Button>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page>
      <TitleBar title="Reservations">
        <button variant="primary" onClick={() => setShowModal(true)}>
          Add product reservation
        </button>
      </TitleBar>
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {reservations.length === 0 ? (
              <EmptyState
                heading="No reservation products yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{
                  content: "Add product reservation",
                  onAction: () => setShowModal(true),
                }}
              >
                <p>
                  Select products customers can reserve with a deposit payment.
                </p>
              </EmptyState>
            ) : (
              <IndexTable
                itemCount={reservations.length}
                headings={[
                  { title: "Product" },
                  { title: "Deposit type" },
                  { title: "Deposit amount" },
                  { title: "Expiry" },
                  { title: "" },
                ]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Add product reservation"
        primaryAction={{
          content: "Save",
          onAction: handleSave,
          disabled: !selectedProduct || isSubmitting,
          loading: isSubmitting,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setShowModal(false) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Button onClick={handleProductPicker} variant="secondary">
              {selectedProduct
                ? selectedProduct.title
                : "Select a product"}
            </Button>

            <Select
              label="Deposit type"
              options={depositTypeOptions}
              value={depositType}
              onChange={setDepositType}
            />

            <TextField
              label={
                depositType === "fixed"
                  ? "Deposit amount ($)"
                  : "Deposit percentage (%)"
              }
              type="number"
              value={depositAmount}
              onChange={setDepositAmount}
              min={depositType === "percentage" ? "1" : "0.01"}
              max={depositType === "percentage" ? "100" : undefined}
              autoComplete="off"
            />

            <TextField
              label="Reservation expiry (days)"
              type="number"
              value={expiryDays}
              onChange={setExpiryDays}
              min="1"
              helpText="How many days the reservation is held after deposit payment"
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
