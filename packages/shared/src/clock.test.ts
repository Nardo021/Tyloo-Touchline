import { describe, expect, it } from "vitest";
import {
  applyClockTransition,
  createInitialClock,
  displayedElapsedMs,
  endPeriod,
  pauseClock,
  reconstructClock,
  resumeClock,
  startMatch,
  startNextPeriod,
} from "./clock.js";

describe("MatchClockService", () => {
  it("starts from zero using timestamps", () => {
    const started = startMatch(createInitialClock(), 1_000);
    expect(started.phase).toBe("RUNNING");
    expect(started.running).toBe(true);
    expect(displayedElapsedMs(started, 1_000)).toBe(0);
    expect(displayedElapsedMs(started, 13_000)).toBe(12_000);
  });

  it("pauses by folding elapsed time into accumulatedMs", () => {
    const started = startMatch(createInitialClock(), 0);
    const paused = pauseClock(started, 8_000);
    expect(paused.running).toBe(false);
    expect(paused.lastStartedAt).toBeNull();
    expect(paused.accumulatedMs).toBe(8_000);
    expect(paused.phase).toBe("PAUSED");
    expect(displayedElapsedMs(paused, 80_000)).toBe(8_000);
  });

  it("resumes without losing paused time", () => {
    const started = startMatch(createInitialClock(), 0);
    const paused = pauseClock(started, 5_000);
    const resumed = resumeClock(paused, 20_000);
    expect(resumed.running).toBe(true);
    expect(resumed.lastStartedAt).toBe(20_000);
    expect(displayedElapsedMs(resumed, 25_000)).toBe(10_000);
  });

  it("keeps time correct across a background gap", () => {
    const started = startMatch(createInitialClock(), 1_000);
    const afterGap = displayedElapsedMs(started, 1_000 + 30_000);
    expect(afterGap).toBe(30_000);
  });

  it("reconstructs running time after a crash", () => {
    const persisted = startMatch(createInitialClock(), 10_000);
    const restored = reconstructClock(persisted, 40_000);
    expect(displayedElapsedMs(restored, 40_000)).toBe(30_000);
    expect(restored.running).toBe(true);
  });

  it("starts the next period from 00:00", () => {
    const started = startMatch(createInitialClock(), 0);
    const ended = endPeriod(started, 20 * 60 * 1000, 2);
    expect(ended.phase).toBe("HALFTIME");
    expect(ended.running).toBe(false);
    expect(ended.period).toBe(1);
    expect(ended.accumulatedMs).toBe(20 * 60 * 1000);

    const next = startNextPeriod(ended, 25 * 60 * 1000, 2);
    expect(next.phase).toBe("RUNNING");
    expect(next.period).toBe(2);
    expect(next.accumulatedMs).toBe(0);
    expect(displayedElapsedMs(next, 25 * 60 * 1000)).toBe(0);
    expect(displayedElapsedMs(next, 25 * 60 * 1000 + 8_000)).toBe(8_000);
  });

  it("does not treat the display ticker as source of truth", () => {
    const clock = applyClockTransition(createInitialClock(), "START", 100, 2);
    const first = displayedElapsedMs(clock, 1_100);
    const later = displayedElapsedMs(clock, 6_100);
    expect(later - first).toBe(5_000);
    expect(clock.accumulatedMs).toBe(0);
  });
});
