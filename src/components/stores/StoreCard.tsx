import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { StoreMap } from "@/components/stores/StoreMap";
import { parseHours } from "@/lib/stores/hours";
import { telHref } from "@/lib/stores/validation";
import { mapQuery, type StoreLocationView } from "@/lib/stores/service";

/**
 * One branch on the Stores page.
 *
 * A server component holding one client island — the map facade. Everything a
 * visitor came for (where, when, what number) is plain server-rendered text, so
 * it is in the HTML, readable without JavaScript and indexable. The only thing
 * that needs a browser is the decision to load a map, which is exactly the
 * boundary `StoreMap` draws.
 *
 * Text left of the map on a wide screen and above it on a phone: the address is
 * the answer, the map is the confirmation, and on a narrow screen the answer
 * should not be below the fold.
 */
export function StoreCard({ store }: { store: StoreLocationView }) {
  const hours = parseHours(store.hours);

  return (
    <Card variant="outlined" className="overflow-hidden">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_minmax(0,22rem)] lg:gap-8">
        <div className="min-w-0">
          <h2 className="text-on-surface text-title-lg">
            {store.name}
          </h2>

          {store.description && (
            <p className="text-on-surface-variant mt-2 text-sm leading-relaxed">
              {store.description}
            </p>
          )}

          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex gap-3">
              <dt className="shrink-0">
                <Icon
                  name="location_on"
                  size={20}
                  className="text-primary mt-px"
                  filled
                />
                <span className="sr-only">Address</span>
              </dt>
              {/* `pre-line` rather than joining with commas: the admin typed
                  the line breaks, and an address is read down. */}
              <dd className="text-on-surface min-w-0 leading-relaxed whitespace-pre-line">
                {store.address}
              </dd>
            </div>

            {store.phone && (
              <div className="flex gap-3">
                <dt className="shrink-0">
                  <Icon name="call" size={20} className="text-primary mt-px" filled />
                  <span className="sr-only">Phone</span>
                </dt>
                <dd className="min-w-0">
                  {/* A tappable number, which on the device most likely to be
                      standing outside the shop is the whole point of printing
                      it. Shown as typed; dialled as digits. */}
                  <a
                    href={telHref(store.phone)}
                    className="text-on-surface hover:text-primary rounded-sm font-medium transition-colors duration-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {store.phone}
                  </a>
                </dd>
              </div>
            )}

            {hours.length > 0 && (
              <div className="flex gap-3">
                <dt className="shrink-0">
                  <Icon name="schedule" size={20} className="text-primary mt-px" filled />
                  <span className="sr-only">Opening hours</span>
                </dt>
                <dd className="min-w-0 flex-1">
                  {/* A pair of columns sized to the content, not to the card.
                      Spreading days and times to opposite edges left a hand's
                      width of nothing between "Sat" and "Closed" on a wide
                      card, and two things that have to be read together should
                      not need a saccade to cross. `max-content` sizes the left
                      column to the longest day label across every row, so the
                      times still line up as a column — the part
                      `justify-between` was actually buying. */}
                  <ul className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1">
                    {hours.map((row, index) => (
                      <li
                        key={index}
                        className={cn(
                          "col-span-2",
                          // Two columns when the line split, one when it did
                          // not — a note like "Public holidays vary" runs the
                          // full width rather than being squeezed into a day
                          // column it was never meant for. `subgrid` is what
                          // lets each row borrow the list's columns instead of
                          // measuring its own.
                          row.time ? "grid grid-cols-subgrid" : "text-on-surface-variant",
                        )}
                      >
                        <span className="text-on-surface-variant">{row.days}</span>
                        {row.time && (
                          <span
                            className={
                              row.closed
                                ? "text-on-surface-variant"
                                : "text-on-surface tabular-nums"
                            }
                          >
                            {row.time}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </div>

        <StoreMap query={mapQuery(store)} name={store.name} />
      </div>
    </Card>
  );
}
