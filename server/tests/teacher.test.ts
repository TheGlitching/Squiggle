/**
 * The self-service teacher offer: an academic address opens Checkout with the
 * teacher coupon applied, and the webhook, still the only writer of a plan,
 * ends the subscription with the school year.
 */
import { describe, expect, it } from 'vitest';

import { isAcademicEmail, schoolYearEnd } from '../src/billing/teacher';
import {
  magicLogin,
  makeTestEnv,
  postStripeEvent,
  STRIPE_PRICE_ID,
  STRIPE_TEACHER_COUPON_ID,
  T0,
  type TestEnv,
} from './helpers';

function web(env: TestEnv, path: string, cookie: string, method = 'GET'): Promise<Response> {
  return env.handler(
    new Request(`${env.webAppOrigin}${path}`, {
      method,
      headers: { origin: env.webAppOrigin, cookie, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      body: method === 'POST' ? '{}' : undefined,
    }),
  );
}

const teacherCheckout = (env: TestEnv, cookie: string) => web(env, '/web/account/teacher-checkout', cookie, 'POST');

describe('which addresses are academic', () => {
  it('takes the académies, the ministry, the CLEMI and the APDEN', () => {
    for (const email of [
      'marie.curie@ac-versailles.fr',
      'Prof@AC-Lyon.FR',
      'enseignant@ac-noumea.nc',
      'doc@ac-polynesie.pf',
      'redaction@education.gouv.fr',
      'equipe@eduscol.education.gouv.fr',
      'formation@clemi.fr',
      'bureau@apden.org',
    ]) {
      expect(isAcademicEmail(email), email).toBe(true);
    }
  });

  it('refuses look-alikes and everything else', () => {
    for (const email of [
      'marie@gmail.com',
      'marie@ac-versailles.fr.evil.example',
      'marie@notac-versailles.fr',
      'marie@education.gouv.fr.example',
      'marie@fakeeducation.gouv.fr',
      'ac-versailles.fr',
      '@ac-versailles.fr',
      null,
    ]) {
      expect(isAcademicEmail(email), String(email)).toBe(false);
    }
  });
});

describe('the end of the school year', () => {
  it('is the first instant after 30 June in Paris, this year or the next', () => {
    expect(new Date(schoolYearEnd(Date.UTC(2026, 10, 3))).toISOString()).toBe('2027-06-30T22:00:00.000Z');
    expect(new Date(schoolYearEnd(Date.UTC(2027, 5, 30, 21))).toISOString()).toBe('2027-06-30T22:00:00.000Z');
    expect(new Date(schoolYearEnd(Date.UTC(2027, 5, 30, 22))).toISOString()).toBe('2028-06-30T22:00:00.000Z');
  });
});

describe('POST /web/account/teacher-checkout', () => {
  it('opens Checkout with the teacher coupon and no promotion-code field', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie.curie@ac-versailles.fr');

    const account = await (await web(env, '/web/account', sessionCookie)).json();
    expect(account.teacherOffer).toBe(true);

    const res = await teacherCheckout(env, sessionCookie);
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://checkout.stripe.example/cs_test_1');

    const call = env.stripe.calls.find((c) => c.path === '/checkout/sessions');
    expect(call?.form['line_items[0][price]']).toBe(STRIPE_PRICE_ID);
    expect(call?.form['discounts[0][coupon]']).toBe(STRIPE_TEACHER_COUPON_ID);
    expect(call?.form.allow_promotion_codes).toBeUndefined();
    expect(call?.form.payment_method_collection).toBe('if_required');
    expect(call?.form['metadata[user_id]']).toBe(user.id);
    expect(call?.form['subscription_data[metadata][offer]']).toBe('teacher');
    expect(call?.form.customer_email).toBe('marie.curie@ac-versailles.fr');
  });

  it('refuses an address that is not academic, and says so on the account', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');

    expect((await (await web(env, '/web/account', sessionCookie)).json()).teacherOffer).toBe(false);
    const res = await teacherCheckout(env, sessionCookie);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('teacher_offer_closed');
    expect(env.stripe.calls).toHaveLength(0);
  });

  it('is one per account: an account that has been through a checkout is refused', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie.curie@ac-versailles.fr');
    await postStripeEvent(env, {
      id: 'evt_teacher_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_t', subscription: 'sub_t', metadata: { user_id: user.id, offer: 'teacher' } } },
    });

    expect((await (await web(env, '/web/account', sessionCookie)).json()).teacherOffer).toBe(false);
    expect((await teacherCheckout(env, sessionCookie)).status).toBe(403);
  });

  it('stays closed while the coupon is not configured', async () => {
    const env = makeTestEnv();
    env.services.stripe!.teacherCouponId = 'PENDING_TEACHER_COUPON_ID';
    const { sessionCookie } = await magicLogin(env, 'marie.curie@ac-versailles.fr');

    expect((await (await web(env, '/web/account', sessionCookie)).json()).teacherOffer).toBe(false);
    expect((await teacherCheckout(env, sessionCookie)).status).toBe(502);
    expect(env.stripe.calls).toHaveLength(0);
  });

  it('needs the web app’s Origin', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie.curie@ac-versailles.fr');
    const res = await env.handler(
      new Request(`${env.webAppOrigin}/web/account/teacher-checkout`, { method: 'POST', headers: { cookie: sessionCookie } }),
    );
    expect(res.status).toBe(403);
  });
});

describe('the webhook ends a teacher subscription on 30 June', () => {
  const subscription = (userId: string, extra: Record<string, unknown> = {}) => ({
    id: 'sub_teacher',
    customer: 'cus_teacher',
    status: 'active',
    metadata: { user_id: userId, offer: 'teacher' },
    items: { data: [{ current_period_start: T0 / 1000, current_period_end: T0 / 1000 + 30 * 86400 }] },
    ...extra,
  });

  it('sets the end date on a teacher subscription that has none, and the plan as for any other', async () => {
    const env = makeTestEnv();
    const { user } = await magicLogin(env, 'marie.curie@ac-versailles.fr');
    await postStripeEvent(env, {
      id: 'evt_sub_1',
      type: 'customer.subscription.created',
      data: { object: subscription(user.id) },
    });

    const end = env.stripe.calls.find((c) => c.path === '/subscriptions/sub_teacher');
    expect(end?.method).toBe('POST');
    expect(end?.form.cancel_at).toBe(String(schoolYearEnd(T0) / 1000));
    expect(end?.form.proration_behavior).toBe('none');
    expect((await env.db.getUserById(user.id))?.plan).toBe('active');
  });

  it('leaves alone a subscription that already ends, and one that is not a teacher’s', async () => {
    const env = makeTestEnv();
    const { user } = await magicLogin(env, 'marie.curie@ac-versailles.fr');
    await postStripeEvent(env, {
      id: 'evt_sub_2',
      type: 'customer.subscription.updated',
      data: { object: subscription(user.id, { cancel_at: schoolYearEnd(T0) / 1000 }) },
    });
    await postStripeEvent(env, {
      id: 'evt_sub_3',
      type: 'customer.subscription.updated',
      data: { object: subscription(user.id, { metadata: { user_id: user.id } }) },
    });
    expect(env.stripe.calls.filter((c) => c.path.startsWith('/subscriptions/'))).toHaveLength(0);
  });

  it('keeps the plan when Stripe refuses the end date, and tries again on the next event', async () => {
    const env = makeTestEnv();
    const { user } = await magicLogin(env, 'marie.curie@ac-versailles.fr');
    env.stripe.failNext = true;
    const first = await postStripeEvent(env, {
      id: 'evt_sub_4',
      type: 'customer.subscription.created',
      data: { object: subscription(user.id) },
    });
    expect(first.status).toBe(200);
    expect((await env.db.getUserById(user.id))?.plan).toBe('active');

    await postStripeEvent(env, {
      id: 'evt_sub_5',
      type: 'customer.subscription.updated',
      data: { object: subscription(user.id) },
    });
    expect(env.stripe.calls.filter((c) => c.path === '/subscriptions/sub_teacher')).toHaveLength(2);
  });
});
