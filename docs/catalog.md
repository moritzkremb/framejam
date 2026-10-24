# The playbook catalog

Playbooks reach users two ways: bundled in the npm package, and from a signed catalog at
`https://www.framejam.ai/catalog/v1/`. A playbook change that only touches `playbooks/` goes out by publishing the
catalog (step C below), with no npm release. Only Moritz signs, on his Mac.

## How it works

- `npm run catalog` turns `playbooks/` into `framejam-site/public/catalog/v1/`:
  - `index.json` lists every playbook (id, version, `minAppVersion`, and each file with its sha256, size and mode),
    plus `withdrawn` ids.
  - `index.json.sig` is an Ed25519 signature (base64) of the exact bytes of `index.json`.
  - `blobs/<sha256>` holds every file once, named by its hash.
- The app (0.6.0 and later) refreshes in the background at start, every 6 hours, and 30 minutes after a failure. It
  verifies the signature with the public keys built into the app, then every file's hash and size. Files that already
  exist (in the bundled copy or an earlier version) are copied, not downloaded. A folder appears in
  `~/.framejam/catalog/` only when it is complete. If anything fails, the last good catalog stays in use. Offline, the
  app uses the saved catalog, then the bundled playbooks.
- Which copy a playbook uses:
  1. The user's own copy in `~/.framejam/playbooks/<id>` always wins. When the app has a higher version, the
     Playbooks page and `get_playbook` say so; nothing in the user's folder changes.
  2. Otherwise the higher `version` of the catalog and bundled copies. A tie keeps the bundled copy.
  3. An item whose `minAppVersion` is above the app's version is ignored.
  4. A `withdrawn` id hides the catalog copy only; the bundled copy still shows.
- Folders are named by version and file hash and are removed 7 days after nothing refers to them, so a playbook folder
  an agent is using never changes during a session.

## Switches

| Setting | Effect |
| --- | --- |
| `FRAMEJAM_CATALOG_URL` | Where the catalog is. Default `https://www.framejam.ai/catalog/v1`. `off` (any case) turns it off. |
| `FRAMEJAM_NO_UPDATE_CHECK` | Turns the catalog off, together with the npm update check. It wins over a set URL. |
| `FRAMEJAM_CATALOG_PUBLIC_KEY` | Trusts one more public key (base64), to try a throwaway catalog. Only in a source checkout. |

The catalog is off in a source checkout (which already has every playbook in `playbooks/`) unless
`FRAMEJAM_CATALOG_URL` is set. An invalid or non-http(s) URL turns it off. There is no setting that skips
verification. `GET /api/catalog` shows whether it's on, when it last refreshed and the last error.

## What leaves the computer

One request for `index.json` and `index.json.sig` per refresh, and one per file that isn't already on disk. Nothing
about the user or their projects is sent. This is a network request that downloads code (playbook scripts), which is
why every file is signed and verified before use.

## Catalog-only playbooks

A playbook can stay in `playbooks/<id>/` but be left out of the npm package, so users get it only through the catalog.
Add `"!playbooks/<id>"` to `files` in `package.json`; delete the line to bundle it. A test checks that every excluded
id is in the catalog and that `npm pack --dry-run` doesn't contain it, while every other playbook is packed.

The first three are Editorial Reel, Anchor & Overlay and Whiteboard Reel. Their pull requests add their exclusion
lines.

## One-time steps on Moritz's Mac

### A. Generate the signing keys (once)

1. In a clean checkout of `main`: `cd "/Users/moritzkremb/Coding Projects/framejam" && npm run catalog:keygen`
2. It makes an Ed25519 key pair in memory and stores the private key in the login keychain (this Mac only, not iCloud
   Keychain) as a generic password: service `framejam-catalog-signing`, account = the key id (the first 8 hex
   characters of the public key's sha256). It's added with `-T ""`, so no app is trusted and every read asks for
   approval, and it goes to `security -i` over stdin, so it never appears in a command line or on disk.
3. It prints only the key id and the public key. Run it again with `--spare` for the spare key.
4. Check both exist without showing them: `security find-generic-password -s framejam-catalog-signing -a <keyId>`.
5. Nothing else to back up: Time Machine covers the login keychain. If both keys are ever lost, a release with new
   public keys is the recovery, because the app trusts only the keys built into the npm package.

### B. Embed the public keys (before releasing 0.6.0)

1. Put both printed values in `src/server/catalog-keys.ts`: the table with the two key ids and their base64 public
   keys, and the active key's id as `ACTIVE_KEY_ID`. Public keys are safe to commit.
2. Until you do, the app rejects every catalog, and `npm publish` stops: `prepublishOnly` runs the tests with
   `FRAMEJAM_RELEASE_CHECK=1`, and `tests/catalog-keys.test.ts` fails unless the table holds exactly two keys and
   includes the active one.
3. To rotate a key later: release a version that adds the new public key, then sign with it.

### C. Sign and publish (the first catalog, and every update)

1. In the app repo on `main`, clean, with the playbook changes committed and pushed: `npm run catalog`.
   - It validates every playbook, hashes the files, builds the index and reads the private key with
     `security find-generic-password -s framejam-catalog-signing -a <activeKeyId> -w`.
   - macOS asks for the login password: click **Allow**, never **Always Allow**.
   - It signs in memory, writes `../framejam-site/public/catalog/v1/`, copies each `playbook.json` into the site's
     `public/playbooks/<id>/`, and checks the result against the built-in public key.
   - It refuses a dirty tree or another branch, signs nothing when nothing changed, and never makes an index older than
     the last one.
2. `npm run catalog -- --check` should report no drift. It needs no key.
3. In `../framejam-site`: `npx tsc --noEmit`, `npm run lint`, `npm run build`, then
   `git add public/catalog public/playbooks && git commit -m "Catalog <short sha>"` and `git push origin main`.
   Vercel deploys it.
4. After the deploy: `npm run catalog -- --verify-remote`. It fetches the live index and every file and verifies them.
5. To roll back, publish a higher `version` with the fix, or add the id to the list in `scripts/catalog-withdrawn.json`
   (for example `["editorial-reel"]`) and publish again.

To try a catalog without the real key: `npm run catalog -- --test-key --out <folder>` signs with a throwaway key
into that folder (the website stays untouched) and prints the public key to use with `FRAMEJAM_CATALOG_PUBLIC_KEY`
and a `FRAMEJAM_CATALOG_URL` pointing at the folder served over http.

### D. First rollout (0.6.0)

1. Merge S1 on the website (hosting headers), the catalog pull requests, and the three playbook pull requests, each
   with its `"!playbooks/<id>"` line and `"minAppVersion": "0.6.0"` in its `playbook.json`.
2. Do steps A and B, then step C: the first catalog has every playbook, all with `minAppVersion` 0.6.0. Run
   `--verify-remote`.
3. Test a packed build: `npm run build && npm pack`, install the tarball into a temp folder, and start it with a
   throwaway `FRAMEJAM_HOME` and `FRAMEJAM_CATALOG_URL` set. It should show 18 playbooks, with the three catalog-only
   ones downloaded and the rest seeded from the bundled copy. Turn the network off and start it again: it should
   still show all 18.
4. Release 0.6.0 with the one-line command in `AGENTS.md`. The Anthropic directory reviewer sees the updated
   `plugin/README.md`.
5. First real use: change one playbook, publish with step C only, and confirm a 0.6.0 install picks it up within 6
   hours or on restart.

Make sure the player branch is merged before releasing 0.6.0, or let it ship as 0.6.x.
