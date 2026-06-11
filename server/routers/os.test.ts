/**
 * HP-OS router access tests. The library holds margin-sensitive content
 * (hard cost rates, markup rules), so every surface must be admin-gated:
 * no user and non-admin users are both rejected before any resolver runs.
 */
import { describe, it, expect } from "vitest";
import { osRouter } from "./os";

function callerFor(user: unknown) {
  return osRouter.createCaller({ user } as any);
}

const READ_SURFACES: Array<[string, (c: ReturnType<typeof callerFor>) => Promise<unknown>]> = [
  ["business.get", (c) => c.business.get()],
  ["folders.tree", (c) => c.folders.tree()],
  ["docs.list", (c) => c.docs.list({})],
  ["docs.get", (c) => c.docs.get({ docId: "HP-REF-001" })],
  ["docs.search", (c) => c.docs.search({ query: "margin" })],
  ["tasks.list", (c) => c.tasks.list({})],
  ["decisions.list", (c) => c.decisions.list()],
];

describe("os router is staff-admin only (margin privacy)", () => {
  it("rejects unauthenticated callers on every read surface", async () => {
    const c = callerFor(null);
    for (const [name, call] of READ_SURFACES) {
      await expect(call(c), name).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("rejects non-admin users on every read surface", async () => {
    const c = callerFor({ id: 7, role: "user" });
    for (const [name, call] of READ_SURFACES) {
      await expect(call(c), name).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("rejects non-admin users on mutations", async () => {
    const c = callerFor({ id: 7, role: "user" });
    await expect(
      c.docs.save({ docId: "HP-SOP-001", body: "tampered" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      c.docs.publish({ docId: "HP-SOP-001" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      c.tasks.create({ title: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
