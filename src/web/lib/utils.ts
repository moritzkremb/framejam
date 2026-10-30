export { cn } from "cn"

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const SHIFT_KEY = IS_MAC ? "⇧" : "Shift";
export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";
/** Keyboard shortcut label for Finish review. */
export const FINISH_KEYS = IS_MAC ? "⌘↩" : "Ctrl+Enter";
/** Keyboard shortcut label for copying the handoff line. */
export const COPY_KEYS = IS_MAC ? "⌘C" : "Ctrl+C";

/** Media from another origin (a shared link's storage) must load in CORS mode, or its frames can't be drawn to a canvas. */
export function crossOriginFor(url: string): "anonymous" | undefined {
  try {
    return new URL(url, window.location.href).origin === window.location.origin ? undefined : "anonymous";
  } catch {
    return undefined;
  }
}
