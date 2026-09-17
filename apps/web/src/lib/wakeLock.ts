export type WakeStatus = "awake" | "released" | "unsupported";

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

export class WakeLockService {
  private sentinel: WakeLockSentinel | null = null;
  private desired = false;
  private listeners = new Set<(status: WakeStatus) => void>();
  private status: WakeStatus = "unsupported";

  subscribe(listener: (status: WakeStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  current(): WakeStatus {
    return this.status;
  }

  async setDesired(running: boolean): Promise<void> {
    this.desired = running;
    if (running) {
      await this.request();
    } else {
      await this.release();
    }
  }

  async request(): Promise<void> {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      this.setStatus("unsupported");
      return;
    }
    if (document.visibilityState !== "visible") {
      return;
    }
    try {
      const nav = navigator as Navigator & {
        wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> };
      };
      this.sentinel = await nav.wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => {
        if (this.desired) {
          this.setStatus("released");
        }
      });
      this.setStatus("awake");
    } catch {
      this.setStatus("released");
    }
  }

  async release(): Promise<void> {
    this.desired = false;
    if (this.sentinel && !this.sentinel.released) {
      await this.sentinel.release().catch(() => undefined);
    }
    this.sentinel = null;
    this.setStatus(typeof navigator !== "undefined" && "wakeLock" in navigator ? "released" : "unsupported");
  }

  private setStatus(status: WakeStatus): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export const wakeLockService = new WakeLockService();
