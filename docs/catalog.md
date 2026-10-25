# The catalog

Playbooks and styles reach users two ways: bundled in the npm package, and from a signed catalog at
`https://www.framejam.ai/catalog/v1/`. A change that only touches `playbooks/` or `presets/` goes out by publishing
the catalog (step C below), with no npm release. Only Moritz signs, on his Mac.

## How it works

- `npm run catalog` turns `playbooks/` and `presets/` into `framejam-site/public/catalog/v1/`:
  - `index.json` lists every item with its `kind` (`playbook` or `style`), id, version, `minAppVersion`, and each
    file with its sha256, size and mode, plus `withdrawn` entries (kind and id).
  - `index.json.sig` is an Ed25519 signature (base64) of the exact bytes of `index.json`.
  - `blobs/<sha256>` holds every file once, named by its hash.
- The app (0.6.0 and later) refreshes in the background at start, every 6 hours, and 30 minutes after a failure. It
  verifies the signature with the public keys built into the app, then every file's hash and size. Files that already
  exist (in the bundled copy or an earlier version) are copied, not downloaded. A folder appears in
  `~/.framejam/catalog/items/<kind>/<id>/` only when it is complete. If anything fails, the last good catalog stays in
  use. Offline, the app uses the saved catalog, then the bundled copies.
- Which copy of a playbook or style the app uses (`layerCopies` in `src/server/catalog.ts`, the same for every kind):
  1. The user's own copy in `~/.framejam/playbooks/<id>` or `~/.framejam/presets/<id>` always wins. For playbooks,
     when the app has a higher version, the Playbooks page and `get_playbook` say so; nothing in the user's folder
     changes.
  2. Otherwise the higher `version` of the catalog and bundled copies. A tie keeps the bundled copy.
  3. An item whose `minAppVersion` is above the app's version is ignored.
  4. A `withdrawn` id hides the catalog copy only; the bundled copy still shows.
- Folders are named by version and file hash and are removed 7 days after nothing refers to them, so a folder an
  agent is using never changes during a session.
- Every style and playbook needs `version` and `minAppVersion` in its `style.json` or `playbook.json`. Raise
  `version` with every change: a catalog copy only replaces the bundled one when its version is higher. Styles are
  checked by `validateStyle` (`src/core/presets.ts`) and playbooks by `validatePlaybook` when the catalog is built.
- Preview videos stay out of the catalog, as they do in the npm package: the app streams them from the website
  (`public/presets/<id>/` and `public/playbooks/<id>/`). Posters and every other file are in it.

## Adding a kind

The format is built so more kinds can follow (for example a library of smaller editing elements). A new kind needs:

1. An entry in `CATALOG_KINDS` (`src/server/catalog-format.ts`) naming its manifest file.
2. A validator in `VALIDATORS` and its source folder in `scripts/catalog.ts` (and its website folder, if the site
   shows a copy of the manifest).
3. A library that reads `snapshot.items.<kind>` and layers it with `layerCopies`, plus a folder in `bundledDirs` in
   `startCatalog`.

Apps that don't know a kind skip its items and withdrawn entries, so a catalog can carry a new kind before every
install understands it. Set the new kind's `minAppVersion` to the first release that reads it.

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
about the user or their projects is sent. This is a network request that downloads code (playbook scripts and the
HTML and JavaScript of style examples), which is why every file is signed and verified before use.

## Catalog-only playbooks and styles

A playbook or style can stay in `playbooks/<id>/` or `presets/<id>/` but be left out of the npm package, so users
get it only through the catalog. Add `"!playbooks/<id>"` or `"!presets/<id>"` to `files` in `package.json`; delete the
line to bundle it. A test checks that every excluded id is in the catalog and that `npm pack --dry-run` doesn't
contain it, while every other playbook and style is packed. A new catalog-only style still needs its folder on the
website (`public/presets/<id>/` with `preview.mp4`, `poster.jpg` and `style.json`).

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
5. Backup: Time Machine covers the login keychain, and the spare key (`afd98895`) is also in 1Password ("FrameJam
   catalog spare key"), copied by hand from Keychain Access. The active key (`1c6a8f72`) stays on this Mac only. If
   this Mac is lost, add the spare from 1Password to a new Mac's login keychain with
   `security add-generic-password -s framejam-catalog-signing -a afd98895 -T "" -w` (it asks for the value), set
   `ACTIVE_KEY_ID` to it, and sign with it; no release is needed. Then release a version with a new spare. If both
   keys are ever lost, a release with new public keys is the recovery, because the app trusts only the keys built
   into the npm package.

### B. Embed the public keys (before releasing 0.6.0)

1. Put both printed values in `src/server/catalog-keys.ts`: the table with the two key ids and their base64 public
   keys, and the active key's id as `ACTIVE_KEY_ID`. Public keys are safe to commit.
2. Until you do, the app rejects every catalog, and `npm publish` stops: `prepublishOnly` runs the tests with
   `FRAMEJAM_RELEASE_CHECK=1`, and `tests/catalog-keys.test.ts` fails unless the table holds exactly two keys and
   includes the active one.
3. To rotate a key later: release a version that adds the new public key, then sign with it.

### C. Sign and publish (the first catalog, and every update)

1. In the app repo on `main`, clean, with the playbook and style changes committed and pushed: `npm run catalog`.
   - It validates every playbook and style, hashes the files, builds the index and reads the private key with
     `security find-generic-password -s framejam-catalog-signing -a <activeKeyId> -w`.
   - macOS asks for the login password: click **Allow**, never **Always Allow**.
   - It signs in memory, writes `../framejam-site/public/catalog/v1/`, copies each `playbook.json` into the site's
     `public/playbooks/<id>/` and each `style.json` into `public/presets/<id>/`, and checks the result against the
     built-in public key.
   - It refuses a dirty tree or another branch, signs nothing when nothing changed, and never makes an index older than
     the last one.
2. `npm run catalog -- --check` should report no drift. It needs no key.
3. In `../framejam-site`: `npx tsc --noEmit`, `npm run lint`, `npm run build`, then
   `git add public/catalog public/playbooks public/presets && git commit -m "Catalog <short sha>"` and
   `git push origin main`.
   Vercel deploys it.
4. After the deploy: `npm run catalog -- --verify-remote`. It fetches the live index and every file and verifies them.
5. To roll back, publish a higher `version` with the fix, or add the id under its kind in
   `scripts/catalog-withdrawn.json` (for example `{ "playbook": ["editorial-reel"], "style": [] }`) and publish again.

To try a catalog without the real key: `npm run catalog -- --test-key --out <folder>` signs with a throwaway key
into that folder (the website stays untouched) and prints the public key to use with `FRAMEJAM_CATALOG_PUBLIC_KEY`
and a `FRAMEJAM_CATALOG_URL` pointing at the folder served over http.

### D. First rollout (0.6.0)

1. Merge S1 on the website (hosting headers), the catalog pull requests, and the three playbook pull requests, each
   with its `"!playbooks/<id>"` line and `"minAppVersion": "0.6.0"` in its `playbook.json`.
2. Do steps A and B, then step C: the first catalog has every playbook, all with `minAppVersion` 0.6.0. Run
   `--verify-remote`.
3. Test a packed build: `npm run build && npm pack`, install the tarball into a temp folder, and start it with a
   throwaway `FRAMEJAM_HOME` and `FRAMEJAM_CATALOG_URL` set. It should show 18 playbooks and 30 styles, with the
   three catalog-only playbooks downloaded and the rest seeded from the bundled copies. Turn the network off and start
   it again: it should still show them all.
4. Release 0.6.0 with the one-line command in `AGENTS.md`. The Anthropic directory reviewer sees the updated
   `plugin/README.md`.
5. First real use: change one playbook, publish with step C only, and confirm a 0.6.0 install picks it up within 6
   hours or on restart.

Make sure the player branch is merged before releasing 0.6.0, or let it ship as 0.6.x.
