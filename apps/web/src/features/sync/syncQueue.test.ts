import { createId } from "@tyloo/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { backoffMs, enqueueMutation, pendingCount, removeAccepted } from "./syncQueue";

describe("sync queue", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("keeps events locally until they are acknowledged", async () => {
    const id = createId();
    await enqueueMutation({
      id,
      kind: "VOID_EVENT",
      payload: { eventId: createId(), updatedAt: 1 },
    });
    expect(await pendingCount()).toBe(1);
    await removeAccepted([id]);
    expect(await pendingCount()).toBe(0);
  });

  it("backs off after repeated failures", () => {
    expect(backoffMs(0)).toBe(5_000);
    expect(backoffMs(2)).toBe(20_000);
    expect(backoffMs(8)).toBe(60_000);
  });
});
