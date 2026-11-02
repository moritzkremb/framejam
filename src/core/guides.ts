/**
 * The FrameJam skill's guides (H3.7): the parts of the skill an agent reads when the moment comes, through `get_guide`,
 * so web chats load a short core. Each lives in `skills/framejam/guides/<topic>.md` as `# Title`, a `> when to read
 * it` line, then the body.
 */

export interface Guide {
  topic: string;
  title: string;
  /** When to read it. */
  summary: string;
  /** The whole file. */
  text: string;
}

export function parseGuide(topic: string, markdown: string): Guide {
  const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim();
  const summary = /^> (.+)$/m.exec(markdown)?.[1]?.trim();
  if (!title || !summary) throw new Error(`guides/${topic}.md needs a "# Title" line and a "> when to read it" line`);
  return { topic, title, summary, text: markdown.trim() };
}

/** The guide asked for, or the list of guides when the topic is missing or unknown. */
export function guideText(guides: Guide[], topic?: string): { found: boolean; text: string } {
  const wanted = topic?.trim().toLowerCase();
  const guide = wanted ? guides.find((g) => g.topic === wanted) : undefined;
  if (guide) return { found: true, text: guide.text };
  const list = guides.map((g) => `- \`${g.topic}\`: ${g.title}. ${g.summary}`).join("\n");
  const lead = wanted ? `There's no guide called "${topic}". ` : "";
  return { found: false, text: `${lead}FrameJam guides (call get_guide with one of these topics):\n${list}` };
}

export const GET_GUIDE_DESCRIPTION =
  "Read one part of the FrameJam skill when you need it: picking (playbooks and styles), feedback (transcripts, spoken comments, revised rounds), sharing (client links, guests, approvals), handover (notes, source, continuing a project), storyboards, tools (Hyperframes, other tools, long jobs) or cloud (FrameJam Cloud: uploads, no waiting). Without a topic it lists them.";
