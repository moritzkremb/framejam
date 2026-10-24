/**
 * Builds, signs and checks the playbook catalog. See docs/catalog.md for when to run which.
 *
 *   npm run catalog                       build and sign with the Keychain key, write ../framejam-site/public/catalog/v1
 *   npm run catalog -- --check            exit 1 when the published catalog doesn't match playbooks/ (no key needed)
 *   npm run catalog -- --verify-remote    fetch the live catalog and verify it
 *   npm run catalog -- --test-key --out DIR   sign with a throwaway key into DIR, to try a catalog locally
 *
 * Only Moritz runs the signing form, on his Mac. It never runs in CI.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseIndex } from "../src/server/catalog-format.ts";
import { ACTIVE_KEY_ID, CATALOG_PUBLIC_KEYS } from "../src/server/catalog-keys.ts";
import { packageRoot } from "../src/server/paths.ts";
import {
  buildCatalog,
  checkDrift,
  ephemeralSigner,
  folderSource,
  httpSource,
  keychainSigner,
  readWithdrawn,
  syncSiteCopies,
  verifyCatalog,
  writeCatalog,
  type Run,
  type Signer,
} from "./lib/catalog-build.ts";

const DEFAULT_REMOTE = "https://www.framejam.ai/catalog/v1";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const run: Run = (command, a) => execFileSync(command, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (...a: string[]) => run("git", ["-C", packageRoot, ...a]).trim();
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const siteDir = path.resolve(process.env.FRAMEJAM_SITE_DIR ?? path.join(packageRoot, "../framejam-site"));
const testKey = flag("--test-key");
const outDir = path.resolve(option("--out") ?? path.join(siteDir, "public/catalog/v1"));
const siteCopies = path.join(siteDir, "public/playbooks");
// With --out the catalog goes somewhere else on purpose, so the website's folders stay untouched.
const touchSite = !option("--out");
const extraKeys = option("--public-key") ? [option("--public-key")!] : [];

async function verifyRemote() {
  const url = option("--verify-remote");
  const base = url && !url.startsWith("--") ? url : DEFAULT_REMOTE;
  const { index, files, bytes } = await verifyCatalog(httpSource(base), extraKeys);
  console.log(`${base} verifies: ${index.items.length} playbooks, ${files} files, ${(bytes / 1e6).toFixed(1)} MB, key ${index.keyId}, generated ${index.generatedAt}.`);
}

function build(generatedAt: string, keyId: string) {
  const sourceCommit = (() => {
    try {
      return git("rev-parse", "HEAD");
    } catch {
      return "unknown";
    }
  })();
  return buildCatalog({
    playbooksDir: path.join(packageRoot, "playbooks"),
    keyId,
    sourceCommit,
    generatedAt,
    withdrawn: readWithdrawn(path.join(packageRoot, "scripts/catalog-withdrawn.json")),
  });
}

async function check() {
  const built = build(new Date().toISOString(), ACTIVE_KEY_ID || "00000000");
  const drift = await checkDrift(outDir, built, extraKeys);
  const reasons = drift.ok ? [] : drift.reasons;
  for (const id of touchSite ? syncSiteCopies(path.join(packageRoot, "playbooks"), siteCopies, built.index.items, true) : []) {
    reasons.push(`the website's playbooks/${id}/playbook.json differs from the app's`);
  }
  if (reasons.length) fail(`The catalog has drifted:\n- ${reasons.join("\n- ")}\nRun npm run catalog.`);
  console.log(`No drift: ${built.index.items.length} playbooks match ${outDir}.`);
}

async function publish() {
  if (testKey && !option("--out")) fail("--test-key needs --out <folder>, so a throwaway catalog never lands in the website.");
  if (!testKey && !flag("--allow-dirty")) {
    if (git("status", "--porcelain")) fail("The working tree isn't clean. Commit and push your playbook changes first.");
    if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("Run this on main, with your changes merged.");
  }

  let signer: Signer;
  if (testKey) {
    const ephemeral = ephemeralSigner();
    extraKeys.push(ephemeral.publicKey);
    signer = ephemeral;
    console.log(`Throwaway key ${ephemeral.keyId}. Use it with FRAMEJAM_CATALOG_PUBLIC_KEY=${ephemeral.publicKey}`);
  } else {
    if (!ACTIVE_KEY_ID || !CATALOG_PUBLIC_KEYS[ACTIVE_KEY_ID]) {
      fail("No signing key is set up yet. Run npm run catalog:keygen and add the public keys (docs/catalog.md, steps A and B).");
    }
    if (process.platform !== "darwin") fail("Signing reads the macOS Keychain, so it only runs on a Mac.");
    signer = keychainSigner(ACTIVE_KEY_ID, run);
  }

  // The index must be newer than the one it replaces, because apps ignore an index that goes backwards.
  let generatedAt = new Date().toISOString();
  const previous = path.join(outDir, "index.json");
  if (fs.existsSync(previous)) {
    try {
      const before = Date.parse(parseIndex(fs.readFileSync(previous)).generatedAt);
      if (before >= Date.parse(generatedAt)) generatedAt = new Date(before + 1000).toISOString();
    } catch {
      // An unreadable previous index doesn't constrain the new one.
    }
  }

  const built = build(generatedAt, signer.keyId);
  const playbooksDir = path.join(packageRoot, "playbooks");
  const drift = await checkDrift(outDir, built, extraKeys);
  const copiesToSync = touchSite ? syncSiteCopies(playbooksDir, siteCopies, built.index.items, true) : [];
  if (drift.ok && !copiesToSync.length && !flag("--force")) {
    console.log("The catalog is already up to date. Nothing signed.");
    return;
  }

  const { blobsWritten } = writeCatalog(outDir, built, signer);
  const synced = touchSite ? syncSiteCopies(playbooksDir, siteCopies, built.index.items) : [];
  const { files, bytes } = await verifyCatalog(folderSource(outDir), extraKeys);
  console.log(`Wrote ${outDir}`);
  console.log(`${built.index.items.length} playbooks, ${files} files (${(bytes / 1e6).toFixed(1)} MB), ${blobsWritten} new blobs, signed with ${signer.keyId}, verified.`);
  if (synced.length) console.log(`Updated the website's playbook.json for: ${synced.join(", ")}`);
  if (!testKey) console.log("Next: in framejam-site run tsc, lint and build, then commit public/catalog and public/playbooks and push (docs/catalog.md, step C).");
}

try {
  if (flag("--verify-remote")) await verifyRemote();
  else if (flag("--check")) await check();
  else await publish();
} catch (err) {
  fail((err as Error).message);
}
