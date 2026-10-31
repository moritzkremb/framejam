// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrashScreen } from "@/components/crash-screen";
import { blockedByCors, corsMessage } from "@/lib/video-cors";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function Boom(): never {
  throw new Error("storage is not available");
}

describe("the creator page's crash screen", () => {
  it("shows a message with Reload instead of an empty page when something throws while rendering", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    act(() =>
      root!.render(
        <CrashScreen>
          <Boom />
        </CrashScreen>,
      ),
    );
    expect(host.textContent).toContain("Something went wrong on this page");
    expect(host.textContent).toContain("storage is not available");
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toContain("Reload");
    expect(host.querySelector('a[href="/projects"]')).toBeTruthy();
  });

  it("renders the page as usual when nothing throws", () => {
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    act(() =>
      root!.render(
        <CrashScreen>
          <p>review page</p>
        </CrashScreen>,
      ),
    );
    expect(host.textContent).toBe("review page");
  });
});

describe("a video that fails to load", () => {
  const src = "https://pub-123.r2.dev/renders/u/v1.mp4";

  it("is put down to CORS when a CORS request is refused but a no-cors one goes through", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.mode === "cors") throw new TypeError("Failed to fetch");
      return new Response(null, { status: 200 });
    });
    expect(await blockedByCors(src, fetchFn)).toBe(true);
  });

  it("isn't put down to CORS when the storage answers, or can't be reached at all", async () => {
    expect(await blockedByCors(src, vi.fn<typeof fetch>(async () => new Response(null, { status: 404 })))).toBe(false);
    expect(await blockedByCors(src, vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("offline"))))).toBe(false);
  });

  it("says plainly that previews can't play videos until R2 CORS allows the address", () => {
    const message = corsMessage("framejam-cloud-git-x.vercel.app");
    expect(message).toContain("framejam-cloud-git-x.vercel.app");
    expect(message).toMatch(/R2 CORS/);
    expect(message).toMatch(/Previews can't play videos until/);
  });
});
