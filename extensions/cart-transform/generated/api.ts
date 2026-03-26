export interface RunInput {
  cart: {
    lines: CartLine[];
  };
  cartTransform?: {
    metafield?: {
      value: string;
    } | null;
  } | null;
}

export interface CartLine {
  id: string;
  quantity: number;
  merchandise: ProductVariant | { __typename: string };
  cost: {
    amountPerQuantity: {
      amount: string;
      currencyCode: string;
    };
  };
}

export interface ProductVariant {
  __typename: "ProductVariant";
  id: string;
  product: {
    id: string;
  };
}

export interface CartOperation {
  update: {
    cartLineId: string;
    price?: {
      adjustment: {
        fixedPricePerUnit: {
          amount: string;
        };
      };
    };
    title?: string;
  };
}

export interface FunctionRunResult {
  operations: CartOperation[];
}
