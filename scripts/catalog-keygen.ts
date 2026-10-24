/**
 * Makes a catalog signing key and stores the private half in the macOS login Keychain. Run once for the active key and
 * once with --spare for the spare. Prints only the key id and the public key. See docs/catalog.md, steps A and B.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { generateCatalogKey } from "./lib/catalog-keygen.ts";

if (process.platform !== "darwin") {
  console.error("The signing key lives in the macOS Keychain, so this only runs on a Mac.");
  process.exit(1);
}

try {
  const { keyId, publicKey } = generateCatalogKey(
    { spare: process.argv.includes("--spare") },
    (command, args, input) => {
      const result = spawnSync(command, args, { input, encoding: "utf8", stdio: ["pipe", "ignore", "pipe"] });
      if (result.status !== 0) throw new Error(`security failed (exit ${result.status}): ${result.stderr.trim()}`);
    },
    (command, args) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  );
  console.log(`Key id:     ${keyId}`);
  console.log(`Public key: ${publicKey}`);
  console.log(`\nThe private key is in your login Keychain (service framejam-catalog-signing, account ${keyId}).`);
  console.log(`Check it exists without showing it: security find-generic-password -s framejam-catalog-signing -a ${keyId}`);
  console.log("Next: put both public keys in src/server/catalog-keys.ts (docs/catalog.md, step B).");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
