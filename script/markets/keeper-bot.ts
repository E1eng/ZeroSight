import { exec } from "child_process";
import { promisify } from "util";
import { ethers } from "ethers";
import "dotenv/config";
import { MARKET_ABI, requireEnv } from "./utils";

const execAsync = promisify(exec);

const rpcUrl = requireEnv("STORY_RPC_URL");
const contractAddress = requireEnv("NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS");

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(contractAddress, MARKET_ABI, provider);

const CHECK_INTERVAL_MS = 15000; // Every 15 seconds

const ASSETS = ["ip", "btc", "eth"];

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

async function checkAsset(asset: string, assetIndex: number) {
  try {
    const marketState = await contract.markets(assetIndex);
    const status = Number(marketState.status);
    const deadline = Number(marketState.deadline);
    const now = Math.floor(Date.now() / 1000);

    // Status 0: Open, 1: Locked, 2: Resolved
    // If deadline is 0, it means the market has never been initialized. Treat it as resolved to start a new one.
    if (status === 2 || deadline === 0) {
      // If resolved, check if distribution is fully complete (skip if deadline === 0 as it's uninitialized)
      if (status === 2) {
        const isDistributed = await contract.isFullyDistributed(assetIndex);
        if (!isDistributed) {
          console.log(`[${asset.toUpperCase()}] Market resolved but not fully distributed. Distributing...`);
          await runScript(`Distribute Winnings (${asset})`, `npx tsx script/markets/distribute.ts ${asset}`);
          return;
        }
      }

      // PHASE 1: Market is settled. Start next hourly round automatically.
      const d = new Date();
      let targetHour = d.getHours();
      
      // If we're already past minute 50, schedule for the next hour's 50th minute
      if (d.getMinutes() >= 50) {
        targetHour += 1;
      }
      
      // Set deadline exactly to the 50th minute of the target hour
      const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), targetHour, 50, 0, 0);
      const targetUnix = Math.floor(targetDate.getTime() / 1000);
      
      // Fallback safeguard just in case
      let offsetSeconds = targetUnix - now;
      if (offsetSeconds <= 0) {
        offsetSeconds = 3000; // default 50 mins
      }
      
      console.log(`[${asset.toUpperCase()}] Starting new market. Deadline set to ${targetDate.toLocaleTimeString()} (Offset: ${offsetSeconds}s)`);
      // Start market defaulting to crypto category
      await runScript(`Start Market (${asset})`, `npx tsx script/markets/start-market.ts ${asset} crypto ${offsetSeconds}`);
      return;
    }

    if (now > deadline) {
      // PHASE 2: Deadline passed, market should be locked/revealed (Minute 50)
      if (status === 0) {
        console.log(`[${asset.toUpperCase()}] Deadline passed (${now} > ${deadline}). Locking and revealing choices...`);
        const revealSuccess = await runScript(
          `Reveal Choices (${asset})`,
          `npx tsx script/markets/reveal-choices.ts ${asset}`
        );
        if (!revealSuccess) {
          console.error(`[${asset.toUpperCase()}] Reveal failed. Aborting cycle.`);
          return;
        }
      }

      // PHASE 3: Check if it is time to resolve and distribute (Minute 60)
      // Resolve happens exactly 10 minutes after the deadline.
      const RESOLVE_TIME = deadline + (10 * 60);
      if (now >= RESOLVE_TIME) {
        console.log(`[${asset.toUpperCase()}] 10 minutes passed since deadline. Executing resolution cycle...`);
        
        const resolveSuccess = await runScript(
          `Resolve Market (${asset})`,
          `npx tsx script/markets/resolve-market.ts ${asset}`
        );
        if (resolveSuccess) {
          await runScript(`Distribute Winnings (${asset})`, `npx tsx script/markets/distribute.ts ${asset}`);
        }
      } else {
        console.log(`[${asset.toUpperCase()}] Market Locked. Waiting for resolution time (in ${RESOLVE_TIME - now} seconds)...`);
      }
    } else {
      console.log(`[${asset.toUpperCase()}] Market Open. Time left until lock: ${deadline - now} seconds...`);
    }
  } catch (err) {
    console.error(`Error in keeper loop for asset ${asset}:`, err);
  }
}

async function checkAndExecute() {
  // Check all assets concurrently
  await Promise.all(ASSETS.map((asset, index) => checkAsset(asset, index)));
}

async function main() {
  console.log("Starting ZeroSight Hourly Keeper Bot 🤖...");
  console.log(`Monitoring Contract: ${contractAddress}`);

  // Run immediately, then loop
  await checkAndExecute();
  setInterval(checkAndExecute, CHECK_INTERVAL_MS);
}

main().catch(console.error);
