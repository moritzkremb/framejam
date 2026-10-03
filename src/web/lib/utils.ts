export { cn } from "cn"

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const SHIFT_KEY = IS_MAC ? "⇧" : "Shift";
/** Keyboard shortcut label for Finish review. */
export const FINISH_KEYS = IS_MAC ? "⌘↩" : "Ctrl+Enter";
/** Keyboard shortcut label for copying the handoff line. */
export const COPY_KEYS = IS_MAC ? "⌘C" : "Ctrl+C";
