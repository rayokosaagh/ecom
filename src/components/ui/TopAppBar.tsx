"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";

export interface TopAppBarProps {
  title: ReactNode;
  /** Usually the nav-drawer toggle. */
  onMenuClick?: () => void;
  /** Trailing slot: search, avatar, overflow menu. */
  actions?: ReactNode;
  leading?: ReactNode;
  className?: string;
}

/** M3 small top app bar — 64px tall, surface background, no elevation at rest. */
export function TopAppBar({
  title,
  onMenuClick,
  actions,
  leading,
  className,
}: TopAppBarProps) {
  return (
    <header
      className={cn(
        "bg-surface sticky top-0 z-30 flex h-16 items-center gap-2 px-2 sm:px-4",
        className,
      )}
    >
      {onMenuClick && (
        <IconButton
          icon="menu"
          label="Toggle navigation"
          onClick={onMenuClick}
          className="lg:hidden"
        />
      )}
      {leading}
      <h1 className="text-on-surface text-title-lg truncate">
        {title}
      </h1>
      <div className="ml-auto flex items-center gap-1">{actions}</div>
    </header>
  );
}
