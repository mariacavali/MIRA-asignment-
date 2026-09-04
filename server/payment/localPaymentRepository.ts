import {
  consumeLocalPendingCheckout,
  getLocalPendingCheckoutIdentity,
  hasProcessedLocalStripeEvent,
  recordProcessedLocalStripeEvent,
} from "../localFileStore";
import type { PaymentEventRepository, PaymentIdentity, PaymentState } from "./paymentEventProcessor";

export class LocalPaymentRepository implements PaymentEventRepository {
  getPending(referenceId: string) {
    return getLocalPendingCheckoutIdentity(referenceId);
  }

  consumePending(referenceId: string, identity: Omit<PaymentIdentity, "openId" | "state">) {
    return consumeLocalPendingCheckout(referenceId, identity);
  }

  findPaymentIdentity() {
    return null;
  }

  updatePaymentState(_openId: string, _state: PaymentState) {
    return null;
  }

  hasProcessedEvent(eventId: string) {
    return hasProcessedLocalStripeEvent(eventId);
  }

  recordProcessedEvent(eventId: string) {
    return recordProcessedLocalStripeEvent(eventId);
  }
}
