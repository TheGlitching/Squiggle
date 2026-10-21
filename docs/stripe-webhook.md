# Stripe webhook endpoint

The handler is `server/src/billing/webhook.ts`.

## API version

Create the endpoint on API version **2025-03-31.basil or later**, which is what a Stripe account created today gets by default. From that version the subscription no longer carries `current_period_end`; the period lives on `items.data[].current_period_end`.

The handler reads the smallest item period end and falls back to the legacy subscription-level field, so an endpoint pinned to an older version keeps working. An entitled subscription event with no period at all never clears the expiry on record; with none on record it grants the same provisional week as a checkout.

## Events

`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
