import type { Playbook, PlaybookNeed } from "./types.ts";

const NEED_ORDER: Record<PlaybookNeed["where"], number> = { included: 0, computer: 1, service: 2 };

/** Every need in one list: what ships with the playbook, then what runs on the computer, then accounts; optional ones last. */
export function sortNeeds(needs: PlaybookNeed[]): PlaybookNeed[] {
  return [...needs].sort((a, b) => Number(!!a.optional) - Number(!!b.optional) || NEED_ORDER[a.where] - NEED_ORDER[b.where]);
}

/** The tag next to a need. */
export function needTag(need: PlaybookNeed): "Included" | "Free" | "Free tier" | "Paid" {
  if (need.where === "included") return "Included";
  if (need.where === "service" && need.cost === "paid") return "Paid";
  if (need.where === "service" && need.cost === "free tier") return "Free tier";
  return "Free";
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

/** What follows the style's name in the styles sentence, or null when the playbook doesn't use styles. */
export function stylesPredicate(p: Pick<Playbook, "styles" | "stylesNote">): string | null {
  switch (p.styles) {
    case "all":
      return "sets the whole look.";
    case "parts":
      return `sets the ${p.stylesNote ?? "graphics"}.`;
    case "inspiration":
      return "is the starting point. The video gets its own look built from it.";
    default:
      return null;
  }
}

/** One plain sentence on how a style combines with the playbook. `styleName` is the selected style, if any. */
export function stylesSentence(p: Pick<Playbook, "styles" | "stylesNote">, styleName?: string): string {
  const rest = stylesPredicate(p);
  return rest ? `${styleName ?? "Your style"} ${rest}` : "This playbook has its own look. Styles aren't used.";
}

/** What "Copy prompt" puts on the clipboard; the user adds their input after it. With a style, it asks for that look. */
export function playbookPrompt(p: Pick<Playbook, "id" | "name">, style?: { id: string; name: string }): string {
  if (style)
    return `Make a video with the FrameJam playbook "${p.name}" (id: ${p.id}) in the style "${style.name}" (id: ${style.id}). Call get_playbook with id "${p.id}" and styleId "${style.id}" and follow it. [Add more context here]`;
  return `Make a video with the FrameJam playbook "${p.name}" (id: ${p.id}). Call get_playbook("${p.id}") and follow it. [Add more context here]`;
}

const WHERE = new Set(["included", "computer", "service"]);
const COST = new Set(["free", "free tier", "paid"]);
const STYLES = new Set(["all", "parts", "inspiration", "none"]);
const FORMATS = new Set(["16:9", "9:16", "1:1", "any"]);
export const SEMVER = /^\d+\.\d+\.\d+$/;

/** Problems with a playbook.json, as plain messages. Empty when it's valid. */
export function validatePlaybook(p: Partial<Playbook>): string[] {
  const errors: string[] = [];
  for (const key of ["id", "name", "tagline", "description", "version", "get", "skill"] as const) {
    if (typeof p[key] !== "string" || !p[key]) errors.push(`${key} is required`);
  }
  if (p.id && !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) errors.push("id must be lowercase letters, numbers and dashes");
  if (p.minAppVersion !== undefined && (typeof p.minAppVersion !== "string" || !SEMVER.test(p.minAppVersion)))
    errors.push("minAppVersion must look like 0.6.0");
  if (!p.creator?.id || !p.creator?.name) errors.push("creator needs an id and a name");
  if (!Array.isArray(p.bring) || !p.bring.length) errors.push("bring needs at least one item");
  if (!Array.isArray(p.steps) || !p.steps.length) errors.push("steps needs at least one item");
  if (!p.format || !FORMATS.has(p.format)) errors.push("format must be 16:9, 9:16, 1:1 or any");
  if (p.project !== "new" && p.project !== "any") errors.push("project must be new or any");
  if (!p.styles || !STYLES.has(p.styles)) errors.push("styles must be all, parts, inspiration or none");
  if (p.styles === "parts" && !p.stylesNote) errors.push("stylesNote is required when styles is parts");
  if (p.featuredStyles !== undefined) {
    if (!Array.isArray(p.featuredStyles)) errors.push("featuredStyles must be a list");
    else {
      if (p.featuredStyles.length && p.styles === "none") errors.push("featuredStyles needs styles other than none");
      const seen = new Set<string>();
      p.featuredStyles.forEach((s, i) => {
        if (typeof s?.id !== "string" || !s.id) errors.push(`featuredStyles[${i}] needs an id`);
        else if (seen.has(s.id)) errors.push(`featuredStyles has ${s.id} twice`);
        else seen.add(s.id);
        if (s?.settings !== undefined && (typeof s.settings !== "object" || s.settings === null || Array.isArray(s.settings)))
          errors.push(`featuredStyles[${i}].settings must be an object`);
      });
    }
  }
  if (p.examples !== undefined) {
    if (!Array.isArray(p.examples)) errors.push("examples must be a list");
    else {
      const seen = new Set<string>(p.featuredStyles?.map((s) => s?.id) ?? []);
      p.examples.forEach((x, i) => {
        if (typeof x?.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(x.id)) errors.push(`examples[${i}] needs an id of lowercase letters, numbers and dashes`);
        else if (seen.has(x.id)) errors.push(`examples has ${x.id} twice`);
        else seen.add(x.id);
        if (typeof x?.label !== "string" || !x.label) errors.push(`examples[${i}] needs a label`);
      });
    }
  }
  if (!Array.isArray(p.needs)) errors.push("needs must be a list");
  else
    p.needs.forEach((n, i) => {
      if (!n?.name) errors.push(`needs[${i}] needs a name`);
      if (!WHERE.has(n?.where)) errors.push(`needs[${i}].where must be included, computer or service`);
      if (n?.where === "service" && !COST.has(n.cost as string)) errors.push(`needs[${i}].cost must be free, free tier or paid`);
    });
  return errors;
}
