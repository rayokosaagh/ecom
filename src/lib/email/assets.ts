/**
 * The line art a mail can draw, and how it refers to it.
 *
 * Every one of these ships *inside* the message as an inline attachment rather
 * than being linked to, which is what makes them work at all. The alternatives
 * each fail somewhere that matters: inline `<svg>` is dropped by Outlook's Word
 * rendering engine, a `data:` URI in an `<img src>` is blocked by Gmail, and a
 * hosted URL needs `APP_URL` pointing somewhere a mail client can reach — which
 * a shop running on localhost has not got. A `cid:` reference has none of those
 * problems and needs no configuration.
 *
 * Deliberately free of `server-only` and of `node:fs`: the templates that name
 * these assets are pure so they can be exercised under `tsx`, so this half is
 * only the names. `lib/email/send` does the reading and the attaching.
 */

export const EMAIL_ASSETS = {
  truck: "icon-truck.png",
  truckOn: "icon-truck-on.png",
  truckOff: "icon-truck-off.png",
  box: "icon-box.png",
  boxOn: "icon-box-on.png",
  boxOff: "icon-box-off.png",
  home: "icon-home.png",
  homeOn: "icon-home-on.png",
  homeOff: "icon-home-off.png",
  pin: "icon-pin.png",
  bag: "icon-bag.png",
  bagOn: "icon-bag-on.png",
  receipt: "icon-receipt.png",
  receiptOn: "icon-receipt-on.png",
  reset: "icon-reset.png",
  card: "icon-card.png",
  clock: "icon-clock.png",
  check: "icon-check.png",
  cancel: "icon-cancel.png",
  lock: "icon-lock.png",
  heart: "icon-heart.png",
  headerArt: "art-header.png",
  headerArtWelcome: "art-header-welcome.png",
  welcomeArt: "art-welcome.png",
  deliveryArt: "art-delivery.png",
} as const;

export type EmailAsset = keyof typeof EMAIL_ASSETS;

/**
 * The Content-ID a message refers to one by.
 *
 * Prefixed, because a bare `heart` would be a plausible id for something else
 * in the same message and a collision resolves to whichever attachment the
 * client happened to index last.
 */
export function assetCid(key: EmailAsset): string {
  return `ecom-${key}`;
}

/** What goes in `src`. Only resolves once the asset is attached alongside. */
export function assetSrc(key: EmailAsset): string {
  return `cid:${assetCid(key)}`;
}
