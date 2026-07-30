import { UserInputError } from './errors';

type SubscriptionLike = {
  topic: string;
  windowSeconds?: unknown;
};

export function validateTwapSubscriptionWindow(
  subscription: SubscriptionLike,
): void {
  if (
    subscription.topic === 'prices.crypto.chainlink.twap' &&
    subscription.windowSeconds !== 30 &&
    subscription.windowSeconds !== 60
  ) {
    throw new UserInputError(
      `TWAP window must be 30 or 60 seconds, received ${String(subscription.windowSeconds)}.`,
    );
  }
}
