/**
 * The teacher offer, self-service: who may open it, and when it ends.
 *
 * A reader whose verified address is on an academic domain is sent to Stripe
 * Checkout with the teacher coupon already applied, instead of writing to us
 * and waiting for a promotion code. Nothing else changes: the subscription is
 * an ordinary one at 0 €, so the plan is still written by the webhook alone
 * and the monthly allowance of `billing/quota.ts` applies to it as to any.
 *
 * Abuse is bounded three ways. The address has to be verified (a magic link
 * or Google said so), so it takes a real academic mailbox. The offer is for an
 * account that has never been through a checkout, so it is one per account.
 * And the coupon itself carries a maximum number of redemptions in Stripe.
 */
import type { UserRow } from '../db/types';
import type { StripeConfig } from './stripe';

/** The coupon to apply, or null while the offer is not configured on this deployment. */
export function teacherCoupon(config: StripeConfig | undefined): string | null {
  const id = config?.teacherCouponId;
  return id && !id.startsWith('PENDING_') ? id : null;
}

/**
 * The academic address domains: every académie (`ac-versailles.fr`, and the
 * overseas ones on their own top-level domain), the ministry and its services
 * (`education.gouv.fr` and its subdomains, Éduscol among them), the CLEMI and
 * the APDEN, the professional body of teacher-librarians.
 */
const ACADEMIC_DOMAIN = /^(?:ac-[a-z0-9-]+\.(?:fr|nc|pf|wf)|(?:[a-z0-9-]+\.)*education\.gouv\.fr|clemi\.fr|apden\.org)$/;

export function isAcademicEmail(email: string | null): boolean {
  const at = email?.lastIndexOf('@') ?? -1;
  return at > 0 && ACADEMIC_DOMAIN.test(email!.slice(at + 1).toLowerCase());
}

/** May this account open the teacher checkout? The server decides; the button only follows. */
export function teacherOfferOpen(config: StripeConfig | undefined, user: UserRow): boolean {
  return (
    teacherCoupon(config) !== null &&
    user.emailVerified &&
    isAcademicEmail(user.email) &&
    user.stripeCustomerId === null
  );
}

/**
 * The end of the school year the offer runs to: 1 July, 00:00 in Paris (UTC+2
 * in summer), the first instant after 30 June. From 1 July on, it is next
 * year's.
 */
export function schoolYearEnd(now: number): number {
  const year = new Date(now).getUTCFullYear();
  const end = Date.UTC(year, 5, 30, 22);
  return now < end ? end : Date.UTC(year + 1, 5, 30, 22);
}
