import { createWalletClient, custom, type EIP1193Provider } from "viem";

import { STORY_TESTNET_CHAIN } from "./story";

export interface PrivyWalletAdapter {
  address: `0x${string}`;
  getEthereumProvider: () => Promise<unknown>;
}

export async function createPrivyWalletClient(wallet: PrivyWalletAdapter) {
  const provider = (await wallet.getEthereumProvider()) as EIP1193Provider;

  return createWalletClient({
    account: wallet.address,
    chain: STORY_TESTNET_CHAIN,
    transport: custom(provider)
  });
}
