import { useState } from "react";
import { toast } from "sonner";
import { PRESET_SELECTED_EVENT } from "@/components/header";
import { api, type PresetSummary } from "@/lib/api";

/** Use / clear a style from anywhere: updates the server, the header chip, and says what happened. */
export function useStyleSelection(initial: string | null) {
  const [selected, setSelected] = useState<string | null>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (preset: PresetSummary) => {
    const next = selected === preset.id ? null : preset.id;
    setBusy(preset.id);
    try {
      await api.selectPreset(next);
      setSelected(next);
      window.dispatchEvent(new Event(PRESET_SELECTED_EVENT));
      if (next) toast.success(`Using ${preset.name}`, { description: "Your agent builds your next video in this style." });
      else toast(`Stopped using ${preset.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return { selected, setSelected, toggle, busy };
}
