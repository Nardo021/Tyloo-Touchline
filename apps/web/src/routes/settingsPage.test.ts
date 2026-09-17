import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/database";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("still shows settings after live queries when presets have not been seeded", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(SettingsPage)));
    });
    await act(async () => {
      for (let attempt = 0; attempt < 20 && !host.textContent?.includes("First half"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    });

    expect(host.textContent).toContain("Settings");
    expect(host.textContent).toContain("First half");

    root.unmount();
    host.remove();
  });
});
