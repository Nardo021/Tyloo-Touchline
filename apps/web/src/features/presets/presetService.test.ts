import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { presetService } from "./presetService";

describe("PresetService", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("can list presets inside a readonly transaction when none are stored", async () => {
    await db.transaction("r", db.formationPresets, async () => {
      await expect(presetService.list()).resolves.toEqual([]);
    });
  });
});
