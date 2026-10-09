import { ChevronDown, X } from "lucide-react";
import { Menu, MenuItem } from "@/components/menu";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** A gallery filter: a menu of options, which turns into a clear chip once one is chosen. */
export function FilterDropdown({ label, value, options, onChange }: { label: string; value: string | null; options: string[]; onChange(v: string | null): void }) {
  if (value) {
    return (
      <button type="button" className="fc-drop on" onClick={() => onChange(null)} aria-label={`Clear ${label}`}>
        {cap(value)} <X className="fc-i xs" />
      </button>
    );
  }
  return (
    <Menu
      align="start"
      label={label}
      trigger={
        <button type="button" className="fc-drop">
          {label} <ChevronDown className="fc-i xs" />
        </button>
      }
    >
      {options.map((o) => (
        <MenuItem key={o} onSelect={() => onChange(o)}>
          {cap(o)}
        </MenuItem>
      ))}
    </Menu>
  );
}
