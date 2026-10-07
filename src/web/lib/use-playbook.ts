import { useState } from "react";
import { toast } from "sonner";
import { PLAYBOOK_SELECTED_EVENT } from "@/components/header";
import { api, type PlaybookSummary } from "@/lib/api";

/** Use / clear a playbook from anywhere: updates the server, the header chip, and says what happened. */
export function usePlaybookSelection(initial: string | null) {
  const [selected, setSelected] = useState<string | null>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (playbook: PlaybookSummary) => {
    const next = selected === playbook.id ? null : playbook.id;
    setBusy(playbook.id);
    try {
      await api.selectPlaybook(next);
      setSelected(next);
      window.dispatchEvent(new Event(PLAYBOOK_SELECTED_EVENT));
      if (next) toast.success(`Using ${playbook.name}`, { description: "Your agent follows this playbook for your next video." });
      else toast(`Stopped using ${playbook.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return { selected, setSelected, toggle, busy };
}
