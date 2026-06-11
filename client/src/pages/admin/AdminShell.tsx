/**
 * AdminShell — now a thin adapter over the OS shell. The vendors and
 * scheduling pages (and anything else still wearing this wrapper) render
 * inside the same chrome as the rest of HP-OS: ink header, rail, phone
 * tabs, staff auth gate. Kept as its own component so those pages did not
 * need touching at the cutover; they migrate to OsShell directly whenever
 * they get their full OS treatment.
 */
import { ReactNode } from "react";
import { OsShell } from "@/os/OsShell";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <OsShell wide>
      <div className="container py-4 sm:py-6 px-3 sm:px-4">{children}</div>
    </OsShell>
  );
}
