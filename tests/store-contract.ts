import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StoreError, type Store } from "../src/core/store.ts";

/** Timestamps have millisecond resolution; "newest first" needs them to differ. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

/** Runs `fn` and returns what it threw (sync or async), or fails if it didn't throw. */
async function thrown(fn: () => unknown): Promise<StoreError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(StoreError);
    return err as StoreError;
  }
  throw new Error("Expected a StoreError");
}

/**
 * Behavior every Store must have. It only uses the interface and awaits every call, so it runs the same against a
 * synchronous store (JsonStore) and an asynchronous one. `create` gets an empty folder it may use for its data.
 */
export function storeContract(name: string, create: (dataDir: string) => Store | Promise<Store>) {
  describe(`Store contract: ${name}`, () => {
    let tmp: string;
    let store: Store;
    let media: string;

    const writeVideo = (file: string, content: string) => {
      const full = path.join(media, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      return full;
    };
    const writePanels = (dir: string, names: string[]) => {
      const full = path.join(media, dir);
      fs.mkdirSync(full, { recursive: true });
      for (const n of names) fs.writeFileSync(path.join(full, n), `img:${n}`);
      return full;
    };
    const read = (file: string | undefined) => fs.readFileSync(file!, "utf8");

    beforeEach(async () => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-contract-"));
      media = path.join(tmp, "media");
      fs.mkdirSync(media);
      fs.mkdirSync(path.join(tmp, "data"));
      store = await create(path.join(tmp, "data"));
    });
    afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

    describe("reviews", () => {
      it("opens a review and finds it again", async () => {
        const video = writeVideo("v1.mp4", "one");
        const { review, version, created } = await store.openReview({ title: "Launch", videoPath: video, note: "first" });
        expect(created).toBe(true);
        expect(version).toMatchObject({ number: 1, videoPath: video, note: "first" });
        expect(review).toMatchObject({ title: "Launch", comments: [], batches: [] });
        expect(await store.getReview(review.id)).toMatchObject({ id: review.id, title: "Launch" });
        expect(await store.findReview(review.id)).toMatchObject({ id: review.id });
        expect((await store.listReviews()).map((r) => r.id)).toEqual([review.id]);
      });

      it("treats the same title as the same project, and identical media as a no-op", async () => {
        const v1 = writeVideo("v1.mp4", "one");
        const first = await store.openReview({ title: "Launch", videoPath: v1 });
        const again = await store.openReview({ title: "launch ", videoPath: v1 });
        expect(again).toMatchObject({ created: false, version: { number: 1 } });
        const next = await store.openReview({ title: "Launch", videoPath: writeVideo("v2.mp4", "two") });
        expect(next.review.id).toBe(first.review.id);
        expect(next.version.number).toBe(2);
        await tick();
        const other = await store.openReview({ title: "Teaser", videoPath: v1 });
        expect(other.created).toBe(true);
        expect((await store.listReviews()).map((r) => r.id)).toEqual([other.review.id, first.review.id]);
      });

      it("reports missing reviews and bad media", async () => {
        expect(await store.findReview("rev_missing")).toBeUndefined();
        expect((await thrown(() => store.getReview("rev_missing"))).status).toBe(404);
        await thrown(() => store.getReview("../escape"));
        expect((await thrown(() => store.openReview({ title: "x" }))).message).toMatch(/videoPath/);
        expect((await thrown(() => store.openReview({ videoPath: path.join(media, "nope.mp4") }))).message).toMatch(/does not exist/);
      });

      it("keeps each version's render after the file is overwritten", async () => {
        const video = writeVideo("render.mp4", "one");
        const { review } = await store.openReview({ title: "Launch", videoPath: video });
        fs.writeFileSync(video, "two");
        const after = await store.addVersion(review.id, { videoPath: video, note: "second" });
        expect(after.versions.map((v) => v.note)).toEqual([undefined, "second"]);
        expect(read(await store.videoFileFor(review.id, after.versions[0]))).toBe("one");
        expect(read(await store.videoFileFor(review.id, after.versions[1]))).toBe("two");
      });

      it("stores storyboards and re-reads panelsDir when a version has no media", async () => {
        const dir = writePanels("board", ["02.png", "01.png", "10.png"]);
        const { review, version } = await store.openReview({ panelsDir: dir });
        expect(version.panels?.map((p) => path.basename(p.sourcePath))).toEqual(["01.png", "02.png", "10.png"]);
        expect(read(await store.panelFileFor(review.id, version, 1))).toBe("img:01.png");
        expect(await store.panelFileFor(review.id, version, 9)).toBeUndefined();
        fs.writeFileSync(path.join(dir, "01.png"), "img:new");
        const next = await store.addVersion(review.id, {});
        expect(read(await store.panelFileFor(review.id, next.versions[0], 1))).toBe("img:01.png");
        expect(read(await store.panelFileFor(review.id, next.versions[1], 1))).toBe("img:new");
      });

      it("remembers the playbook and style picked for a project", async () => {
        const { review } = await store.openReview({ title: "Launch", videoPath: writeVideo("v1.mp4", "one") });
        await store.setReviewPicks(review.id, { playbookId: "clean-cut", styleId: "bauhaus-grid" });
        await store.setReviewPicks(review.id, { styleId: null });
        const after = await store.getReview(review.id);
        expect(after.playbookId).toBe("clean-cut");
        expect(after.styleId).toBeUndefined();
      });

      it("keeps a transcript per version and attaches one to an unchanged version", async () => {
        const srt = writeVideo("v1.srt", "1\n00:00:00,000 --> 00:00:02,000\nHello there.\n");
        const video = writeVideo("v1.mp4", "one");
        const { review, version } = await store.openReview({ title: "Talk", videoPath: video, transcriptPath: srt });
        expect(version.transcript).toMatchObject({ words: 2, sourcePath: srt });
        expect((await store.transcriptFor(review.id, version))?.words.map((w) => w.text)).toEqual(["Hello", "there."]);
        const plain = await store.addVersion(review.id, { videoPath: writeVideo("v2.mp4", "two") });
        expect(plain.versions[1].transcript).toBeUndefined();
        const json = writeVideo("v2.json", JSON.stringify([{ text: "Hi", start: 0.5, end: 0.9 }]));
        const again = await store.openReview({ title: "Talk", videoPath: plain.versions[1].videoPath, transcriptPath: json });
        expect(again.version).toMatchObject({ number: 2, transcript: { words: 1 } });
        expect((await store.transcriptFor(review.id, plain.versions[0]))?.words).toHaveLength(2);
        expect((await thrown(() => store.addVersion(review.id, { videoPath: video, transcriptPath: writeVideo("bad.json", "{}") }))).message).toMatch(/No timed words/);
        expect((await thrown(() => store.openReview({ panelsDir: writePanels("board", ["01.png"]), transcriptPath: srt }))).message).toMatch(/storyboards/);
      });

      it("saves and serves a poster per version", async () => {
        const { review } = await store.openReview({ title: "Launch", videoPath: writeVideo("v1.mp4", "one") });
        expect(await store.posterFile(review.id, 1)).toBeUndefined();
        const saved = await store.savePoster(review.id, 1, Buffer.from("jpeg"));
        expect(await store.posterFile(review.id, 1)).toBe(saved);
        expect(read(saved)).toBe("jpeg");
      });
    });

    describe("comments and rounds", () => {
      const open = async () => (await store.openReview({ title: "Launch", videoPath: writeVideo("v1.mp4", "one") })).review.id;

      it("adds, edits and deletes draft comments with their frame images", async () => {
        const id = await open();
        const pin = await store.addComment(id, { time: 1.23456, x: 1.4, y: 0.5, text: "  Bigger logo " });
        expect(pin).toMatchObject({ version: 1, kind: "pin", time: 1.235, x: 1, y: 0.5, text: "Bigger logo", status: "draft" });
        const range = await store.addComment(id, { time: 2, endTime: 4, text: "Hold longer" });
        expect(range.kind).toBe("range");
        expect((await store.addComment(id, { time: 9, wholeVideo: true, text: "Warmer" })).kind).toBe("general");
        await thrown(() => store.addComment(id, { time: 1, text: "  " }));

        const file = await store.saveThumbnail(id, pin.id, Buffer.from("frame"));
        expect((await store.getReview(id)).comments.find((c) => c.id === pin.id)?.thumbnail).toBe(file);
        expect(read((await store.thumbnailFile(id, file)) ?? undefined)).toBe("frame");
        expect((await store.readThumbnail(id, file))?.toString()).toBe("frame");
        expect(await store.thumbnailFile(id, "missing.jpg")).toBeUndefined();
        expect(await store.thumbnailFile(id, "..%2F..%2Fescape.jpg")).toBeNull();

        expect((await store.updateComment(id, range.id, { text: "Hold much longer" })).text).toBe("Hold much longer");
        await store.deleteComment(id, pin.id);
        expect((await store.getReview(id)).comments.map((c) => c.id)).not.toContain(pin.id);
        expect(await store.thumbnailFile(id, file)).toBeUndefined();
        expect((await thrown(() => store.deleteComment(id, pin.id))).status).toBe(404);
      });

      it("keeps a spoken comment's pointing phrases, each with its own frame image", async () => {
        const id = await open();
        const c = await store.addComment(id, {
          time: 1,
          text: "This is too small",
          voice: { status: "transcribed", duration: 3, points: [{ phrase: "This", at: 0.4, time: 1 }, { phrase: "here", at: 2, time: 2 }] },
        });
        expect(c.voice?.points.map((p) => p.phrase)).toEqual(["This", "here"]);
        const file = await store.saveThumbnail(id, c.id, Buffer.from("second"), 1);
        expect((await store.getReview(id)).comments[0]!.voice!.points.map((p) => p.frame)).toEqual([undefined, file]);
        expect((await store.readThumbnail(id, file))?.toString()).toBe("second");
        await thrown(() => store.saveThumbnail(id, c.id, Buffer.from("x"), 5));
        await store.deleteComment(id, c.id);
        expect(await store.thumbnailFile(id, file)).toBeUndefined();
      });

      it("locks a version on submit and delivers the batch once", async () => {
        const id = await open();
        const c = await store.addComment(id, { time: 1, text: "First" });
        await store.submit(id, "x");
        expect((await thrown(() => store.submit(id))).message).toMatch(/already sent/);
        const review = await store.getReview(id);
        const batch = review.batches[0]!;
        expect(batch).toMatchObject({ commentIds: [c.id], message: "x" });
        expect(review.versions[0]!.sentAt).toBeDefined();
        expect(review.comments[0]).toMatchObject({ status: "sent", batchId: batch.id });
        expect((await thrown(() => store.addComment(id, { time: 2, text: "Late" }))).message).toMatch(/already sent/);
        expect((await thrown(() => store.updateComment(id, c.id, { text: "Edit" }))).message).toMatch(/already sent/);

        expect((await store.undeliveredBatches(id)).map((b) => b.id)).toEqual([batch.id]);
        await store.markDelivered(id, [batch.id]);
        expect(await store.undeliveredBatches(id)).toEqual([]);
      });

      it("refuses an empty submit and comments on old versions", async () => {
        const id = await open();
        expect((await thrown(() => store.submit(id))).message).toMatch(/Nothing to send/);
        await store.addVersion(id, { videoPath: writeVideo("v2.mp4", "two") });
        expect((await thrown(() => store.addComment(id, { version: 1, time: 0, text: "Old" }))).message).toMatch(/not the latest/);
        expect((await thrown(() => store.addComment(id, { version: 7, time: 0, text: "Nope" }))).message).toMatch(/Unknown version/);
      });

      it("moves unsent drafts to the next version", async () => {
        const id = await open();
        const c = await store.addComment(id, { time: 1, text: "Typed, not sent" });
        await store.addVersion(id, { videoPath: writeVideo("v2.mp4", "two") });
        expect((await store.getReview(id)).comments.find((x) => x.id === c.id)?.version).toBe(2);
      });

      it("adds a guest's comment once, with who wrote it and the version they saw", async () => {
        const id = await open();
        const guest = { time: 2, x: 0.3, y: 0.4, text: "Logo is small", author: "  Anna ", cloudId: "cmt_1" };
        const first = await store.addComment(id, guest);
        expect(first).toMatchObject({ author: "Anna", cloudId: "cmt_1", status: "draft", version: 1 });
        expect(first.fromVersion).toBeUndefined();
        const again = await store.addComment(id, guest);
        expect(again.id).toBe(first.id);
        expect((await store.getReview(id)).comments).toHaveLength(1);

        await store.addVersion(id, { videoPath: writeVideo("v2.mp4", "two") });
        expect((await store.getReview(id)).comments[0]).toMatchObject({ version: 2, fromVersion: 1 });
        const late = await store.addComment(id, { time: 1, text: "On v1", author: "Anna", cloudId: "cmt_2", fromVersion: 1 });
        expect(late).toMatchObject({ version: 2, fromVersion: 1 });
        const same = await store.addComment(id, { time: 1, text: "On v2", author: "Anna", cloudId: "cmt_3", fromVersion: 2 });
        expect(same.fromVersion).toBeUndefined();
      });

      it("reopens a round: withdrawn before delivery, retracted and replaced after", async () => {
        const id = await open();
        await store.addComment(id, { time: 1, text: "First" });
        await store.submit(id);
        expect(await store.reopen(id)).toEqual({ wasDelivered: false });
        let review = await store.getReview(id);
        expect(review.batches).toEqual([]);
        expect(review.comments[0]!.status).toBe("draft");
        expect((await thrown(() => store.reopen(id))).message).toMatch(/nothing to reopen/);

        const first = await store.submit(id);
        await store.markDelivered(id, [first.id]);
        expect(await store.reopen(id)).toEqual({ wasDelivered: true });
        const second = await store.submit(id);
        expect(second.replaces).toBe(first.id);
        review = await store.getReview(id);
        expect(review.batches.find((b) => b.id === first.id)?.retractedAt).toBeDefined();
      });

      it("resolves comments by id or all at once", async () => {
        const id = await open();
        const a = await store.addComment(id, { time: 1, text: "One" });
        await store.addComment(id, { time: 2, text: "Two" });
        await store.submit(id);
        expect(await store.resolveComments(id, [a.id, "c_missing"], "done")).toEqual({ resolved: [a.id], missing: ["c_missing"] });
        expect((await store.getReview(id)).comments.find((c) => c.id === a.id)).toMatchObject({ status: "resolved", resolution: { note: "done", version: 1 } });
        expect((await store.resolveComments(id, ["all"])).resolved).toHaveLength(1);
      });

      it("checks storyboard panels on comments", async () => {
        const { review } = await store.openReview({ panelsDir: writePanels("board", ["01.png", "02.png"]) });
        expect((await store.addComment(review.id, { time: 5, panel: 2, text: "Close-up" })).kind).toBe("panel");
        expect((await store.addComment(review.id, { time: 0, panel: 1, x: 0.2, y: 0.3, text: "Here" })).kind).toBe("pin");
        expect((await thrown(() => store.addComment(review.id, { time: 0, panel: 3, text: "x" }))).message).toMatch(/between 1 and 2/);
      });
    });

    describe("the agent", () => {
      it("tracks the listening heartbeat and changes the review's fingerprint", async () => {
        const { review } = await store.openReview({ title: "Launch", videoPath: writeVideo("v1.mp4", "one") });
        expect(await store.agentListening(review.id)).toBe(false);
        const before = await store.reviewMtime(review.id);
        await store.setAgentWaiting(review.id, true);
        expect(await store.agentListening(review.id)).toBe(true);
        expect(await store.reviewMtime(review.id)).not.toBe(before);
        await store.setAgentWaiting(review.id, false);
        expect(await store.agentListening(review.id)).toBe(false);
        await store.setAgentWaiting("rev_missing", true);
        expect(await store.agentListening("rev_missing")).toBe(false);
      });

      it("records the connected agent", async () => {
        expect((await store.getState()).agent).toBeUndefined();
        await store.recordAgent(undefined);
        expect((await store.getState()).agent).toBeUndefined();
        await store.recordAgent("Cursor", "1.2.3");
        expect((await store.getState()).agent).toMatchObject({ name: "Cursor", version: "1.2.3" });
        expect(typeof (await store.agentOutdated())).toBe("boolean");
      });
    });

    describe("picks", () => {
      it("runs a pick from waiting to picked", async () => {
        expect(await store.activePick()).toBeNull();
        const pick = await store.createPick(["playbook", "style"], " Launch ");
        expect(pick).toMatchObject({ kinds: ["playbook", "style"], title: "Launch", status: "waiting" });
        expect((await store.activePick())?.id).toBe(pick.id);
        await store.touchPick(pick.id);
        expect((await store.getPick(pick.id)).listenedAt).toBeDefined();
        const done = await store.resolvePick(pick.id, { playbookId: "clean-cut" });
        expect(done).toMatchObject({ status: "picked", playbookId: "clean-cut", styleId: null });
        expect((await thrown(() => store.resolvePick(pick.id, {}))).status).toBe(409);
        expect(await store.activePick()).toBeNull();
      });

      it("cancels older picks and lets the user dismiss one", async () => {
        const first = await store.createPick(["style"]);
        await tick();
        const second = await store.createPick(["playbook"]);
        expect((await store.getPick(first.id)).status).toBe("cancelled");
        expect((await store.listPicks()).map((p) => p.id)).toEqual([second.id, first.id]);
        expect((await store.dismissPick(second.id)).status).toBe("dismissed");
        expect((await thrown(() => store.resolvePick(second.id, {}))).message).toBe("This pick was closed");
        expect((await thrown(() => store.getPick("pick_missing"))).status).toBe(404);
      });
    });

    describe("presets and playbooks", () => {
      it("lists the built-in styles and keeps file access inside a preset", () => {
        const p = store.presets.get("data-story")!;
        expect(p.builtin).toBe(true);
        expect(store.presets.list({ query: p.style.name }).map((x) => x.style.id)).toContain("data-story");
        expect(store.presets.summary(p)).toMatchObject({ id: "data-story", hasPreview: true });
        expect(store.presets.templateFiles(p)).toContain("index.html");
        expect(store.presets.file(p, "style.json")).toBeDefined();
        expect(store.presets.file(p, "..%2F..%2Fpackage.json")).toBeUndefined();
        expect(store.presets.get("no-such-style")).toBeUndefined();
      });

      it("lists the built-in playbooks with their method", () => {
        const [first] = store.playbooks.list();
        expect(first).toBeDefined();
        const p = store.playbooks.get(first!.playbook.id)!;
        expect(store.playbooks.skillText(p).length).toBeGreaterThan(0);
        expect(store.playbooks.files(p)).toContain("playbook.json");
        expect(store.playbooks.summary(p)).toMatchObject({ id: p.playbook.id, builtin: true });
        expect(store.playbooks.file(p, "..%2F..%2Fpackage.json")).toBeUndefined();
      });
    });
  });
}
