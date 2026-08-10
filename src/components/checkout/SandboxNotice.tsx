import { PaymentMethod } from "@/generated/prisma/enums";
import { Icon } from "@/components/ui/Icon";

/**
 * "This is a test gateway, and your own account will not work here."
 *
 * Shown on the payment page whenever `PAYMENTS_MODE` is not `live`. It exists
 * because of a genuinely confusing failure: the sandbox gateways are
 * pixel-identical to the real ones, and signing in with a real wallet gets
 * "login failed" — which is the *correct* behaviour, and looks exactly like a
 * broken integration.
 *
 * The credentials below are the providers' own published test accounts, not
 * secrets: eSewa prints them on its Test Credentials page and Khalti on its
 * ePayment docs. Rendering them here is the whole point — the alternative is
 * every developer finding that page themselves, once, per person.
 *
 * It disappears entirely in live mode, so a real customer never sees it.
 */

const CREDENTIALS: Partial<Record<PaymentMethod, [string, string][]>> = {
  [PaymentMethod.ESEWA]: [
    ["eSewa ID", "9711111111, 9711111112 or 9711111113"],
    ["Password", "Nepal@123"],
    ["Token / OTP", "123456"],
  ],
  [PaymentMethod.KHALTI]: [
    ["Khalti ID", "9800000000 through 9800000005"],
    ["MPIN", "1111"],
    ["OTP", "987654"],
  ],
};

export function SandboxNotice({ method }: { method: PaymentMethod }) {
  const rows = CREDENTIALS[method];
  if (!rows) {
    // connectIPS has no public test account — NCHL issues one at onboarding —
    // so there is nothing to list, but the warning still matters.
    return (
      <p className="bg-surface-container text-on-surface-variant mt-2 flex items-start gap-2 rounded-lg px-4 py-3 text-left text-xs">
        <Icon name="science" size={16} className="mt-px shrink-0" />
        <span>
          <strong className="text-on-surface">Test mode.</strong> This is the
          gateway&apos;s sandbox — use the test credentials from your merchant
          pack, not a real account.
        </span>
      </p>
    );
  }

  return (
    <div className="bg-surface-container mt-2 rounded-lg px-4 py-3 text-left">
      <p className="text-on-surface flex items-start gap-2 text-xs">
        <Icon name="science" size={16} className="mt-px shrink-0" />
        <span>
          <strong>Test mode.</strong> Your own account will not work here — the
          sandbox only accepts these test credentials.
        </span>
      </p>

      <dl className="text-on-surface-variant mt-2 space-y-1 pl-6 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap gap-x-2">
            <dt className="min-w-24">{label}</dt>
            <dd className="text-on-surface font-mono">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
