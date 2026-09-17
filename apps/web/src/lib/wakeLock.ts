export type WakeStatus = "awake" | "released" | "failed" | "unsupported";

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

export class WakeLockService {
  private sentinel: WakeLockSentinel | null = null;
  private desired = false;
  private listeners = new Set<(status: WakeStatus) => void>();
  private status: WakeStatus = this.isSupported() ? "released" : "unsupported";
  private requesting = false;

  supported(): boolean {
    return this.isSupported();
  }

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
    if (!this.isSupported()) {
      this.setStatus("unsupported");
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    if (this.requesting) {
      return;
    }
    if (this.sentinel && !this.sentinel.released) {
      this.setStatus("awake");
      return;
    }
    this.requesting = true;
    try {
      const nav = navigator as Navigator & {
        wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> };
      };
      this.sentinel = await nav.wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => {
        this.sentinel = null;
        if (this.desired) {
          this.setStatus("released");
        }
      });
      this.setStatus("awake");
    } catch {
      this.sentinel = null;
      this.setStatus("failed");
    } finally {
      this.requesting = false;
    }
  }

  async release(): Promise<void> {
    this.desired = false;
    if (this.sentinel && !this.sentinel.released) {
      await this.sentinel.release().catch(() => undefined);
    }
    this.sentinel = null;
    this.setStatus(this.isSupported() ? "released" : "unsupported");
  }

  async onVisible(): Promise<void> {
    if (this.desired) {
      await this.request();
    }
  }

  private isSupported(): boolean {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  }

  private setStatus(status: WakeStatus): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export const wakeLockService = new WakeLockService();
