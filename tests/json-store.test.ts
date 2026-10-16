import { JsonStore } from "../src/server/json-store.ts";
import { storeContract } from "./store-contract.ts";

storeContract("JsonStore", (dataDir) => new JsonStore(dataDir));
