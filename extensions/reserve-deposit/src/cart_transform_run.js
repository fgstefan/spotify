// @ts-check

/**
 * @typedef {import("../generated/api").CartTransformRunInput} CartTransformRunInput
 * @typedef {import("../generated/api").CartTransformRunResult} CartTransformRunResult
 */

const NO_CHANGES = { operations: [] };

/**
 * @param {CartTransformRunInput} input
 * @returns {CartTransformRunResult}
 */
export function cartTransformRun(input) {
  const metafieldValue = input.cartTransform?.metafield?.value;
  if (!metafieldValue) {
    return NO_CHANGES;
  }

  let reservations;
  try {
    reservations = JSON.parse(metafieldValue);
  } catch {
    return NO_CHANGES;
  }

  const reservationMap = new Map();
  for (const r of reservations) {
    reservationMap.set(r.productId, r);
  }

  const operations = [];

  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;
    if (merchandise.__typename !== "ProductVariant") continue;

    const productId = merchandise.product.id;
    const reservation = reservationMap.get(productId);
    if (!reservation) continue;

    const originalPrice = parseFloat(line.cost.amountPerQuantity.amount);
    let depositPrice;

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
        title: "Reservation deposit",
      },
    });
  }

  return { operations };
}
