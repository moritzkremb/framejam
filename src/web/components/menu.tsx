import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The design system's Menu: a popover of 36px rows. Destructive items go last. */
export function Menu({
  trigger,
  children,
  align = "end",
  label,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  label?: string;
}) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content className="fc-menu fc-menu-pop" align={align} sideOffset={6} aria-label={label}>
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="lbl">{children}</M.Label>;
}

export function MenuItem({
  icon,
  children,
  hint,
  checked,
  danger,
  onSelect,
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  onSelect(): void;
}) {
  return (
    <M.Item className={cn("fc-menu-item", danger && "danger")} onSelect={onSelect}>
      {icon}
      <span className="fc-grow fc-truncate">{children}</span>
      {hint && <span className="r">{hint}</span>}
      {checked && <span className="chk">✓</span>}
    </M.Item>
  );
}

export function MenuSeparator() {
  return <M.Separator className="fc-menu-sep" />;
}
