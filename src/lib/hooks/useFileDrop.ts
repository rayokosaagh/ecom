"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";

/**
 * Pulls an image address out of a drag that carries no file.
 *
 * Dragging a picture from another tab hands over markup and a URL rather than
 * bytes. `file://` and `blob:` are rejected: both would resolve on the admin's
 * own machine and nowhere else, so the product would look fine to whoever
 * added it and be broken for every shopper.
 */
function imageUrlFrom(transfer: DataTransfer): string | null {
  const raw = transfer.getData("text/uri-list") || transfer.getData("text/plain");
  if (!raw) return null;

  // text/uri-list is a list, and `#` marks a comment line.
  const first = raw
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  if (!first) return null;
  return /^https?:\/\//i.test(first) ? first : null;
}

export interface FileDropResult {
  /** True while a droppable drag is over the target. */
  dragging: boolean;
  /** Spread onto the element that should accept the drop. */
  dropProps: {
    onDragEnter: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
}

/**
 * Drag-and-drop plumbing for an upload field.
 *
 * Three things here are easy to get wrong by hand, which is why this is shared
 * rather than repeated in each field:
 *
 *  1. **`preventDefault` on both `dragenter` and `dragover`.** Miss either and
 *     the browser declines the drop and opens the file as a page instead —
 *     navigating away from a half-filled form and losing the lot.
 *  2. **Enter/leave counting.** `dragleave` fires every time the pointer
 *     crosses into a child element, and these fields are full of buttons,
 *     previews and inputs. A boolean set by `dragenter` and cleared by
 *     `dragleave` strobes the whole way across the target, which reads as the
 *     drop being refused.
 *  3. **Refusing drags that carry nothing usable.** Selected text and dragged
 *     links otherwise light the target up and then do nothing when let go.
 *
 * @param onFiles Called with at least one file.
 * @param onUrl   Optional. Called instead when the drag carried an image
 *   address but no file — dragging a picture straight out of another tab.
 *   Omit it and such drags are refused outright rather than accepted silently.
 */
export function useFileDrop({
  onFiles,
  onUrl,
}: {
  onFiles: (files: File[]) => void;
  onUrl?: (url: string) => void;
}): FileDropResult {
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  // Only `types` is readable mid-drag — the payload itself is withheld until
  // the drop, so this is as much as can be known about what is coming.
  const droppable = (transfer: DataTransfer) => {
    const types = Array.from(transfer.types);
    if (types.includes("Files")) return true;
    return (
      onUrl !== undefined &&
      (types.includes("text/uri-list") || types.includes("text/plain"))
    );
  };

  const settle = () => {
    depth.current = 0;
    setDragging(false);
  };

  return {
    dragging,
    dropProps: {
      onDragEnter: (event) => {
        if (!droppable(event.dataTransfer)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      },
      onDragOver: (event) => {
        if (!droppable(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: () => {
        depth.current = Math.max(depth.current - 1, 0);
        if (depth.current === 0) setDragging(false);
      },
      onDrop: (event) => {
        if (!droppable(event.dataTransfer)) return;
        event.preventDefault();
        settle();

        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) {
          onFiles(files);
          return;
        }

        const url = imageUrlFrom(event.dataTransfer);
        if (url) onUrl?.(url);
      },
    },
  };
}
