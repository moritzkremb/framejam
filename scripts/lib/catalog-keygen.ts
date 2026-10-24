import { generateKeyPairSync } from "node:crypto";
import { keyIdOf } from "../../src/server/catalog-keys.ts";
import { KEYCHAIN_SERVICE, type Run } from "./catalog-build.ts";

export interface KeygenResult {
  keyId: string;
  /** SPKI DER in base64: the value that goes in `src/server/catalog-keys.ts`. */
  publicKey: string;
}

/** Runs `security` with commands on stdin, so the private key never appears in a process list. */
export type RunWithInput = (command: string, args: string[], input: string) => void;

/**
 * Makes an Ed25519 key pair in memory and stores the private key (PKCS8 DER, base64) in the login Keychain as a
 * generic password named by its key id. `-T ""` trusts no application, so every read asks for approval. Only the
 * key id and the public key are returned; the private key leaves this function only through stdin to `security`.
 */
export function generateCatalogKey(options: { spare?: boolean }, runWithInput: RunWithInput, run: Run): KeygenResult {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const secret = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const keyId = keyIdOf(spki);
  const label = `FrameJam catalog signing key (${options.spare ? "spare" : "active"})`;
  runWithInput("security", ["-i"], `add-generic-password -a ${keyId} -s ${KEYCHAIN_SERVICE} -l "${label}" -T "" -w ${secret}\n`);
  // Metadata only: no -w, so this neither prints nor reads the key.
  try {
    run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", keyId]);
  } catch {
    throw new Error(`The Keychain has no entry for key ${keyId} after adding it. Nothing was saved.`);
  }
  return { keyId, publicKey: spki };
}
