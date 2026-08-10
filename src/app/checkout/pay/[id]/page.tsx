import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { GatewayRedirect } from "@/components/checkout/GatewayRedirect";
import { SandboxNotice } from "@/components/checkout/SandboxNotice";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { orderReference } from "@/lib/orders/reference";
import { OrderStatus, PaymentMethod } from "@/generated/prisma/enums";
import {
  connectipsConfig,
  esewaConfig,
  khaltiConfig,
  paymentsAreSandbox,
} from "@/lib/payments/config";
import {
  formatAmount as formatConnectipsAmount,
  formatTxnDate,
  sign as signConnectips,
  tokenMessage as connectipsTokenMessage,
  txnIdFor,
} from "@/lib/payments/connectips";
import { SHOP_CURRENCY } from "@/lib/money/currency";
import { buildFormFields, nextTransactionUuid } from "@/lib/payments/esewa";
import { initiate } from "@/lib/payments/khalti";

export const metadata: Metadata = { title: "Payment" };

/**
 * The step between placing a wallet order and paying for it.
 *
 * Its whole job is to hand the customer to the gateway, and the two gateways
 * want handing over in opposite ways:
 *
 * - **Khalti** is started server-side. We call `initiate` with the secret key,
 *   store the `pidx` it mints, and redirect to the hosted URL it returns.
 * - **eSewa** wants a *browser form POST* to its own endpoint, signed with the
 *   merchant secret. There is no server-side start and no URL to redirect to,
 *   so the form is rendered here — already signed — and submitted on arrival.
 *
 * Either way the customer sees this page for a moment at most; it is a landing,
 * not a screen. What it renders is the fallback for when that fails — a real
 * button, so a blocked redirect or a browser with no JavaScript is a click
 * rather than a dead end.
 *
 * Rendering is dynamic and uncached by necessity: it writes a payment reference
 * and talks to a gateway.
 */
export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
}: {
  // Next 16: params is a Promise and must be awaited.
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      totalCents: true,
      shippingCents: true,
      paymentMethod: true,
      paymentRef: true,
      createdAt: true,
      shippingName: true,
      shippingPhone: true,
      user: { select: { email: true } },
    },
  });

  // Scoped to the owner, not just to an existing id: an order reference is
  // short and guessable, and this page starts a payment against it.
  if (!order || order.userId !== user.id) notFound();

  // Nothing to pay. Someone has hit back, or the callback already settled it.
  if (order.status !== OrderStatus.PENDING) {
    redirect(`/orders/${order.id}`);
  }
  if (order.paymentMethod === PaymentMethod.COD) {
    redirect(`/orders/${order.id}?placed=1`);
  }

  const reference = orderReference(order.id);
  const nav = await getNavData();
  // Read once: every branch below needs to know whether to warn.
  const sandbox = paymentsAreSandbox();

  const shell = (children: React.ReactNode) => (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />
      <main className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
        <Card variant="outlined">
          <CardContent className="space-y-4 py-10 text-center">{children}</CardContent>
        </Card>
      </main>
      <Footer variant="minimal" />
    </div>
  );

  const failed = (message: string) =>
    shell(
      <>
        <Icon name="error" size={40} className="text-error mx-auto" />
        <h1 className="text-on-surface text-xl font-medium">
          Could not start the payment
        </h1>
        <p className="text-on-surface-variant text-sm">{message}</p>
        <p className="text-on-surface-variant text-xs">
          Order {reference} is saved and unpaid — nothing has been charged.
        </p>
        <a
          href={`/orders/${order.id}`}
          className="bg-primary text-on-primary state-layer mx-auto inline-flex h-11 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Go to your order
        </a>
      </>,
    );

  if (order.paymentMethod === PaymentMethod.KHALTI) {
    const config = khaltiConfig();
    if (!config) return failed("Khalti is not configured on this store.");

    let started;
    try {
      started = await initiate(config, {
        // Khalti's `amount` is paisa, which is what this database stores.
        amountMinorUnits: order.totalCents,
        purchaseOrderId: order.id,
        purchaseOrderName: `Order ${reference}`,
        returnUrl: appUrl("/api/payments/khalti/callback"),
        websiteUrl: appUrl("/"),
        customer: {
          ...(order.shippingName ? { name: order.shippingName } : {}),
          ...(order.user?.email ? { email: order.user.email } : {}),
          ...(order.shippingPhone ? { phone: order.shippingPhone } : {}),
        },
      });
    } catch (error) {
      console.error(`[khalti] initiate failed for order ${order.id}`, error);
      return failed(
        "Khalti did not accept the payment request. Please try again, or choose a different method.",
      );
    }

    // Stored *before* the redirect: the callback finds the order by this, so a
    // customer who pays faster than this write lands would come back to an
    // order nothing can match.
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentRef: started.pidx },
    });

    redirect(started.payment_url);
  }

  if (order.paymentMethod === PaymentMethod.CONNECTIPS) {
    const cips = connectipsConfig();
    if (!cips) return failed("connectIPS is not configured on this store.");

    /**
     * `TXNDATE` is the order's own creation date, not today's.
     *
     * Derived rather than read from a clock, which keeps this render pure — and
     * is more correct anyway: retrying tomorrow must not re-date a transaction
     * connectIPS already knows about under yesterday's date.
     */
    const fields = {
      MERCHANTID: cips.merchantId,
      APPID: cips.appId,
      APPNAME: cips.appName,
      TXNID: txnIdFor(order.id),
      TXNDATE: formatTxnDate(order.createdAt),
      TXNCRNCY: SHOP_CURRENCY.code,
      // Paisa, unlike eSewa's rupees — see the note in lib/payments/connectips.
      TXNAMT: formatConnectipsAmount(order.totalCents),
      REFERENCEID: order.id,
      REMARKS: `Order ${reference}`,
      PARTICULARS: `Order ${reference}`,
    };

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentRef: order.id },
    });

    return shell(
      <>
        <Icon name="account_balance" size={40} className="text-primary mx-auto" />
        <h1 className="text-on-surface text-xl font-medium">
          Taking you to connectIPS
        </h1>
        <p className="text-on-surface-variant text-sm">
          Order {reference} · nothing is charged until you confirm it with your
          bank.
        </p>
        {sandbox && <SandboxNotice method={PaymentMethod.CONNECTIPS} />}
        <GatewayRedirect
          action={cips.gatewayUrl}
          fields={{
            ...fields,
            TOKEN: signConnectips(connectipsTokenMessage(fields), cips.privateKey),
          }}
        />
      </>,
    );
  }

  // eSewa.
  const config = esewaConfig();
  if (!config) return failed("eSewa is not configured on this store.");

  /**
   * The transaction id we mint, and the one the callback looks the order up by.
   *
   * Derived from whatever the previous attempt used, so a retry gets a fresh id
   * without reaching for a clock — see `nextTransactionUuid`. eSewa rejects a
   * transaction_uuid it has seen before, and hyphens are the one
   * non-alphanumeric character it allows.
   */
  const transactionUuid = nextTransactionUuid(order.id, order.paymentRef);

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentRef: transactionUuid },
  });

  const fields = buildFormFields({
    // Declared to eSewa as goods plus delivery, because it checks that they add
    // up to the total. `totalCents` already includes delivery, so goods is the
    // difference rather than a second reading of the cart.
    goodsMinorUnits: order.totalCents - order.shippingCents,
    deliveryMinorUnits: order.shippingCents,
    transactionUuid,
    productCode: config.productCode,
    secret: config.secret,
    successUrl: appUrl("/api/payments/esewa/callback"),
    // Carries the order so an abandoned payment can still land the customer on
    // their own receipt; eSewa sends no `data` blob on failure.
    failureUrl: appUrl(`/api/payments/esewa/callback?order=${order.id}`),
  });

  return shell(
    <>
      <Icon name="account_balance_wallet" size={40} className="text-primary mx-auto" />
      <h1 className="text-on-surface text-xl font-medium">Taking you to eSewa</h1>
      <p className="text-on-surface-variant text-sm">
        Order {reference} · nothing is charged until you confirm it there.
      </p>
      <GatewayRedirect action={config.formUrl} fields={fields} />
      {sandbox && <SandboxNotice method={PaymentMethod.ESEWA} />}
    </>,
  );
}
