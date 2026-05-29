import { exec } from "child_process";
import { promisify } from "util";
import { ethers } from "ethers";
import "dotenv/config";
import { MARKET_ABI, requireEnv } from "./utils";

const execAsync = promisify(exec);

const rpcUrl = requireEnv("STORY_RPC_URL");
const contractAddress = requireEnv("ZERO_SIGHT_MARKET_ADDRESS");

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(contractAddress, MARKET_ABI, provider);

const CHECK_INTERVAL_MS = 15000; // Every 15 seconds

async function runScript(name: string, command: string) {
  console.log(`\n--- Running ${name} ---`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    console.log(`--- ${name} completed ---\n`);
    return true;
  } catch (error) {
    console.error(`--- ${name} failed ---`);
    console.error(error);
    return false;
  }
}

async function checkAndExecute() {
  try {
    const status = Number(await contract.marketStatus());

    // Status 0: Open, 1: Locked, 2: Resolved
    if (status === 2) {
      // If resolved, check if distribution is fully complete
      const isDistributed = await contract.isFullyDistributed();
      if (!isDistributed) {
        console.log("Market resolved but not fully distributed. Distributing...");
        await runScript("Distribute Winnings", "npx ts-node script/markets/distribute.ts");
      }
      return;
    }

    const deadline = Number(await contract.deadline());
    const now = Math.floor(Date.now() / 1000);

    if (now > deadline) {
      console.log(`Deadline passed (${now} > ${deadline}). Executing resolution cycle...`);

      if (status === 0) {
        // Market is Open, we need to decrypt and reveal choices
        const revealSuccess = await runScript(
          "Reveal Choices",
          "npx ts-node script/markets/reveal-choices.ts"
        );
        if (!revealSuccess) {
          console.error("Reveal failed. Aborting cycle.");
          return;
        }
      }

      // After reveal, market is locked (or we just go straight to resolve if no bets)
      // Resolve the market with Redstone oracle
      const resolveSuccess = await runScript(
        "Resolve Market",
        "npx ts-node script/markets/resolve-market.ts"
      );
      if (resolveSuccess) {
        // Finally, distribute the winnings
        await runScript("Distribute Winnings", "npx ts-node script/markets/distribute.ts");
      }
    } else {
      console.log(`Market Open. Time left: ${deadline - now} seconds...`);
    }
  } catch (err) {
    console.error("Error in keeper loop:", err);
  }
}

async function main() {
  console.log("Starting ZeroSight Keeper Bot 🤖...");
  console.log(`Monitoring Contract: ${contractAddress}`);

  // Run immediately, then loop
  await checkAndExecute();
  setInterval(checkAndExecute, CHECK_INTERVAL_MS);
}

main().catch(console.error);
