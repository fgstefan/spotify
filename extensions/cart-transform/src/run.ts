import type { RunInput, FunctionRunResult, CartOperation } from "../generated/api";

interface ReservationConfig {
  productId: string;
  depositType: "fixed" | "percentage";
  depositAmount: number;
}

export function run(input: RunInput): FunctionRunResult {
  const operations: CartOperation[] = [];

  const metafieldValue = input.cartTransform?.metafield?.value;
  if (!metafieldValue) {
    return { operations: [] };
  }

  let reservations: ReservationConfig[];
  try {
    reservations = JSON.parse(metafieldValue);
  } catch {
    return { operations: [] };
  }

  const reservationMap = new Map<string, ReservationConfig>();
  for (const r of reservations) {
    reservationMap.set(r.productId, r);
  }

  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;
    if (!("product" in merchandise)) continue;

    const productId = merchandise.product.id;
    const reservation = reservationMap.get(productId);
    if (!reservation) continue;

    const originalPrice = parseFloat(line.cost.amountPerQuantity.amount);
    let depositPrice: number;

    if (reservation.depositType === "fixed") {
      depositPrice = Math.min(reservation.depositAmount, originalPrice);
    } else {
      depositPrice = (reservation.depositAmount / 100) * originalPrice;
    }

    operations.push({
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: depositPrice.toFixed(2),
            },
          },
        },
        title: `Reservation deposit`,
      },
    });
  }

  return { operations };
}
