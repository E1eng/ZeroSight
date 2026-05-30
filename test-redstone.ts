import { requestDataPackages } from "@redstone-finance/sdk";

async function test() {
  try {
    console.log("Fetching...");
    const result = await requestDataPackages({
      dataServiceId: "redstone-primary-prod",
      uniqueSignersCount: 1,
      dataPackagesIds: ["IP"],
      authorizedSigners: []
    } as any);
    console.log("Success:", Object.keys(result));
  } catch (err) {
    console.error(err);
  }
}

test();
