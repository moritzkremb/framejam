import { JsonStore } from "../src/server/json-store.ts";
import { CloudStore } from "../src/server/cloud-store.ts";
import { FakeCloud } from "./fake-cloud.ts";
import { storeContract } from "./store-contract.ts";

storeContract("CloudStore", async (dataDir) => {
  const cloud = new FakeCloud();
  return new CloudStore({ api: cloud, local: new JsonStore(dataDir), fetch: cloud.fetch, cacheMs: 0, posterFrame: async () => undefined });
});

storeContract("CloudStore with cached reads", async (dataDir) => {
  const cloud = new FakeCloud();
  return new CloudStore({ api: cloud, local: new JsonStore(dataDir), fetch: cloud.fetch, posterFrame: async () => undefined });
});
