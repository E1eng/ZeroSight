import { useState, useEffect, useCallback } from "react";

export interface LocalBet {
  vaultId: string;
  market: string;
  direction: number; // 0 for Down, 1 for Up
  amount: number;
  placedAt: number;
  txHash: string;
}

export function useBets(walletAddress?: string) {
  const [localBets, setLocalBets] = useState<LocalBet[]>([]);

  // Load from local storage on mount or wallet change
  useEffect(() => {
    if (!walletAddress) {
      setLocalBets([]);
      return;
    }

    try {
      const stored = localStorage.getItem(`zeroSightBets_${walletAddress}`);
      if (stored) {
        setLocalBets(JSON.parse(stored));
      } else {
        setLocalBets([]);
      }
    } catch (err) {
      console.error("Failed to load bets from localStorage", err);
    }
  }, [walletAddress]);

  // Add a new bet to local storage
  const addBet = useCallback(
    (bet: LocalBet) => {
      if (!walletAddress) return;

      setLocalBets((prev) => {
        const updated = [bet, ...prev];
        try {
          localStorage.setItem(`zeroSightBets_${walletAddress}`, JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to save bet to localStorage", err);
        }
        return updated;
      });
    },
    [walletAddress]
  );

  return {
    localBets,
    addBet
  };
}
