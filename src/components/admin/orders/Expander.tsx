import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * The disclosure triangle that reveals what an order contains.
 *
 * A real `aria-expanded` button pointing at the row it controls, so a screen
 * reader is told there is something to open and where it went — a bare rotating
 * chevron announces as nothing at all.
 *
 * The label names the order and the count rather than saying "Expand": in a
 * list of fifty identical triangles, "Expand" fifty times is a menu with no
 * items on it.
 *
 * Its own file because both views use it, and the card list should not have to
 * pull in the table to borrow one button.
 */
export function Expander({
  open,
  onClick,
  controls,
  reference,
  count,
}: {
  open: boolean;
  onClick: () => void;
  controls: string;
  reference: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${open ? "Hide" : "Show"} the ${count} item${count === 1 ? "" : "s"} in order ${reference}`}
      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Icon
        name="chevron_right"
        size={18}
        className={cn(
          "transition-transform duration-200 ease-standard",
          open && "rotate-90",
        )}
      />
    </button>
  );
}
