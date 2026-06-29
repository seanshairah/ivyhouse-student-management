"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth/actions";

export function LogoutButton({ collapsed }: { collapsed?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
        title="Sign out"
      >
        <LogOut className="size-5 shrink-0" />
        {!collapsed && <span>Sign out</span>}
      </button>
    </form>
  );
}
