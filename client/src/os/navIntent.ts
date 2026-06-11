/**
 * os/navIntent.ts
 *
 * Tiny handshake between deep-link navigators (the notification bell) and
 * OsRoom. The bell dispatches estimator-context state (active customer,
 * conversation, section) and THEN navigates to the room URL; OsRoom's mount
 * effect normally resets the room to its top-level section, which would
 * clobber that deep state. Marking intent before navigating tells the next
 * room mount to skip the reset, once. The timestamp keeps a stale flag from
 * suppressing a genuine room entry later (lazy chunks can delay the mount).
 */

let markedAt = 0;

export function markNavIntent(): void {
  markedAt = Date.now();
}

/** True (and consumes the flag) when intent was marked in the last 5s. */
export function consumeNavIntent(): boolean {
  const fresh = Date.now() - markedAt < 5000;
  markedAt = 0;
  return fresh;
}
