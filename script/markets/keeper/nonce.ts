import { provider, ethersWallet } from "./clients";
import { log } from "./logger";

/**
 * Centralised nonce manager. Serialises every transaction sent by the keeper so
 * concurrent state-machine ticks cannot reuse the same nonce. Reads on-chain
 * pending nonce on first call, then increments locally.
 *
 * On error (revert / replacement underpriced), the chain copy is re-fetched so
 * the next attempt starts clean.
 */
class NonceManager {
  private next: number | null = null;
  private lock: Promise<void> = Promise.resolve();

  async withNonce<T>(label: string, fn: (nonce: number) => Promise<T>): Promise<T> {
    // Serialise: chain `lock` so callers wait for previous tx to settle.
    let release!: () => void;
    const prev = this.lock;
    this.lock = new Promise((res) => {
      release = res;
    });

    try {
      await prev;
      if (this.next === null) {
        this.next = await provider.getTransactionCount(ethersWallet.address, "pending");
        log.info("nonce.init", { address: ethersWallet.address, nonce: this.next });
      }
      const nonce = this.next;
      try {
        const out = await fn(nonce);
        this.next = nonce + 1;
        log.debug("nonce.advance", { label, nonce, next: this.next });
        return out;
      } catch (err) {
        // Refresh from chain so the next caller starts from a known-good state.
        const fresh = await provider.getTransactionCount(ethersWallet.address, "pending");
        log.warn("nonce.refresh", {
          label,
          attempted: nonce,
          fresh,
          err: err instanceof Error ? err.message : String(err)
        });
        this.next = fresh;
        throw err;
      }
    } finally {
      release();
    }
  }
}

export const nonceManager = new NonceManager();
