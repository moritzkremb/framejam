import type { Playbook, PlaybookNeed } from "./types.ts";

export const NEED_GROUPS: { where: PlaybookNeed["where"]; label: string }[] = [
  { where: "included", label: "Included" },
  { where: "computer", label: "On your computer" },
  { where: "service", label: "Your accounts" },
];

export function groupNeeds(needs: PlaybookNeed[]) {
  return NEED_GROUPS.map((g) => ({ ...g, needs: needs.filter((n) => n.where === g.where) })).filter((g) => g.needs.length);
}

/** "A voice (paid, optional), e.g. ElevenLabs, OpenAI TTS" */
export function needLabel(need: PlaybookNeed): string {
  const cost = need.where === "service" ? need.cost : need.where === "computer" ? "free" : undefined;
  const tags = [cost, need.optional ? "optional" : undefined].filter(Boolean).join(", ");
  const examples = need.examples?.length ? `, e.g. ${need.examples.slice(0, 3).join(", ")}` : "";
  return `${need.name}${tags ? ` (${tags})` : ""}${examples}`;
}

/** "Free to run", "Needs 1 paid tool", "Needs 2 paid tools". Optional paid tools don't count. */
export function costBadge(needs: PlaybookNeed[]): string {
  const paid = needs.filter((n) => n.where === "service" && n.cost === "paid" && !n.optional).length;
  if (!paid) return "Free to run";
  return `Needs ${paid} paid tool${paid === 1 ? "" : "s"}`;
}

export function projectLabel(project: Playbook["project"]): string {
  return project === "new" ? "Starts a new project." : "Works in your existing project, with the tool it already uses.";
}

/** One plain sentence on how a style combines with the playbook. `styleName` is the selected style, if any. */
export function stylesSentence(p: Pick<Playbook, "styles" | "stylesNote">, styleName?: string): string {
  const subject = styleName ?? "Your style";
  switch (p.styles) {
    case "all":
      return `${subject} sets the whole look.`;
    case "parts":
      return `${subject} sets the ${p.stylesNote ?? "graphics"}.`;
    case "inspiration":
      return `${subject} is the starting point. The video gets its own look built from it.`;
    default:
      return "This playbook has its own look. Styles aren't used.";
  }
}

/** What "Copy prompt" puts on the clipboard; the user adds their input after it. */
export function playbookPrompt(p: Pick<Playbook, "id" | "name">): string {
  return `Make a video with the FrameJam playbook "${p.name}" (id: ${p.id}). Call get_playbook("${p.id}") and follow it. Here's what I have: `;
}

const WHERE = new Set(["included", "computer", "service"]);
const COST = new Set(["free", "free tier", "paid"]);
const STYLES = new Set(["all", "parts", "inspiration", "none"]);
const FORMATS = new Set(["16:9", "9:16", "1:1", "any"]);

/** Problems with a playbook.json, as plain messages. Empty when it's valid. */
export function validatePlaybook(p: Partial<Playbook>): string[] {
  const errors: string[] = [];
  for (const key of ["id", "name", "tagline", "description", "version", "get", "skill"] as const) {
    if (typeof p[key] !== "string" || !p[key]) errors.push(`${key} is required`);
  }
  if (p.id && !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) errors.push("id must be lowercase letters, numbers and dashes");
  if (!p.creator?.id || !p.creator?.name) errors.push("creator needs an id and a name");
  if (!Array.isArray(p.bring) || !p.bring.length) errors.push("bring needs at least one item");
  if (!Array.isArray(p.steps) || !p.steps.length) errors.push("steps needs at least one item");
  if (!p.format || !FORMATS.has(p.format)) errors.push("format must be 16:9, 9:16, 1:1 or any");
  if (p.project !== "new" && p.project !== "any") errors.push("project must be new or any");
  if (!p.styles || !STYLES.has(p.styles)) errors.push("styles must be all, parts, inspiration or none");
  if (p.styles === "parts" && !p.stylesNote) errors.push("stylesNote is required when styles is parts");
  if (!Array.isArray(p.needs)) errors.push("needs must be a list");
  else
    p.needs.forEach((n, i) => {
      if (!n?.name) errors.push(`needs[${i}] needs a name`);
      if (!WHERE.has(n?.where)) errors.push(`needs[${i}].where must be included, computer or service`);
      if (n?.where === "service" && !COST.has(n.cost as string)) errors.push(`needs[${i}].cost must be free, free tier or paid`);
    });
  return errors;
}
