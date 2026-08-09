"use client";

import { useEffect, useRef, useState } from "react";

import { logout } from "@/lib/actions/auth";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { SessionUser } from "@/lib/auth/dal";

/** Avatar button that opens an M3 menu with the account summary and sign-out. */
export function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="bg-primary-container text-on-primary-container grid size-10 place-items-center rounded-full text-sm font-medium transition-shadow duration-200 hover:shadow-elevation-1 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="bg-surface-container-high shadow-elevation-2 absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="bg-primary-container text-on-primary-container grid size-10 shrink-0 place-items-center rounded-full text-sm font-medium">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-on-surface truncate text-sm font-medium">
                {user.name ?? "Account"}
              </p>
              <p className="text-on-surface-variant truncate text-xs">{user.email}</p>
            </div>
          </div>

          <div className="text-on-surface-variant mt-3 flex items-center gap-1.5 text-xs">
            <Icon name={user.role === "ADMIN" ? "shield_person" : "person"} size={16} />
            <span>{user.role === "ADMIN" ? "Administrator" : "Standard user"}</span>
          </div>

          <form action={logout} className="mt-4">
            <Button type="submit" variant="outlined" icon="logout" fullWidth>
              Sign out
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
