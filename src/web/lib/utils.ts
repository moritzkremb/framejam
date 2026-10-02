export { cn } from "cn"

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
/** Keyboard shortcut label for Finish review. */
export const FINISH_KEYS = IS_MAC ? "⌘↵" : "Ctrl+↵";
/** Keyboard shortcut label for copying the handoff line. */
export const COPY_KEYS = IS_MAC ? "⌘C" : "Ctrl+C";
