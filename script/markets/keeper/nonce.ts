import { provider, ethersWallet } from "./clients";
import { log } from "./logger";

/**
 * Centralised nonce manager for a single signer.
 *
 * Design: every tx is fully serialised through a promise lock, and each tx
 * fetches its nonce FRESH from the chain ("pending") right before sending —
 * inside the lock. Because the previous tx is always awaited to confirmation
 * before the lock releases, the pending count is authoritative for the next
 * tx. This eliminates local-counter drift, which is the failure mode when:
 *   - the keeper is restarted while txs are still pending in the mempool, or
 *   - a flaky/slow RPC makes ticks overrun and confirmations lag.
 *
 * Cost: one extra `eth_getTransactionCount` per tx — negligible at keeper
 * throughput, and far cheaper than a stuck "nonce too low" cycle.
 */
class NonceManager {
  private lock: Promise<void> = Promise.resolve();

  async withNonce<T>(label: string, fn: (nonce: number) => Promise<T>): Promise<T> {
    let release!: () => void;
    const prev = this.lock;
    this.lock = new Promise((res) => {
      release = res;
    });

    try {
      await prev;

      // Authoritative next nonce: previous tx already confirmed (we awaited it
      // before releasing the lock), so "pending" reflects the true next slot.
      const nonce = await provider.getTransactionCount(ethersWallet.address, "pending");
      log.debug("nonce.use", { label, nonce });

      return await fn(nonce);
    } catch (err) {
      log.warn("nonce.txError", {
        label,
        err: err instanceof Error ? err.message : String(err)
      });
      throw err;
    } finally {
      release();
    }
  }
}

export const nonceManager = new NonceManager();
