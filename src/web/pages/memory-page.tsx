import { Brain, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { HomeHeader } from "@/components/header";
import { Menu, MenuItem } from "@/components/menu";
import { isOffline, Offline } from "@/components/states";
import { api, relativeTime, type Memory } from "@/lib/api";

function MemoryItem({ memory, projects, onChanged }: { memory: Memory; projects: Record<string, string>; onChanged(): void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memory.text);
  const fromProjects = [...new Set(memory.sources.map((s) => s.reviewId))].filter((id) => projects[id]);

  const save = async () => {
    if (!text.trim()) return;
    try {
      await api.updateMemory(memory.id, text);
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const forget = async () => {
    try {
      await api.forget(memory.id);
      toast.success("Forgotten", { description: memory.text });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <li className="fc-item" data-testid="memory">
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <div className="fc-edit">
            <textarea
              autoFocus
              value={text}
              aria-label="Memory"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void save();
                }
                if (e.key === "Escape") {
                  setText(memory.text);
                  setEditing(false);
                }
              }}
            />
            <div className="fc-row" style={{ justifyContent: "flex-end", gap: 4 }}>
              <button
                type="button"
                className="fc-btn ghost sm"
                onClick={() => {
                  setText(memory.text);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <button type="button" className="fc-btn sm" disabled={!text.trim()} onClick={() => void save()}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="body">{memory.text}</p>
        )}
        <div className="ctx">
          {memory.confidence === "tentative" && (
            <span className="fc-badge" title="Seen once. Your agent treats it as a hint until it comes up again.">
              Hint
            </span>
          )}
          {fromProjects.length > 0 && (
            <span className="fc-truncate">
              From{" "}
              {fromProjects.map((id, i) => (
                <span key={id}>
                  {i > 0 && ", "}
                  <Link to={`/review/${id}`}>{projects[id]}</Link>
                </span>
              ))}
            </span>
          )}
          <span>{relativeTime(memory.updatedAt)}</span>
        </div>
      </div>
      {!editing ? (
        <Menu
          label="Memory actions"
          trigger={
            <button type="button" className="fc-btn ghost icon sm round" aria-label="Memory actions">
              <MoreHorizontal className="fc-i sm" />
            </button>
          }
        >
          <MenuItem icon={<Pencil className="fc-i sm" />} onSelect={() => setEditing(true)}>
            Edit
          </MenuItem>
          <MenuItem danger icon={<Trash2 className="fc-i sm" />} onSelect={() => void forget()}>
            Forget
          </MenuItem>
        </Menu>
      ) : (
        <span />
      )}
    </li>
  );
}

/** What your agent learned about your taste and your clients', from your comments. You can edit or forget any of it. */
export function MemoryPage() {
  const [data, setData] = useState<{ memories: Memory[]; projects: Record<string, string> } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    api
      .memory()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch(setError);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const mine = data?.memories.filter((m) => m.scope === "me") ?? [];
  const clients = new Map<string, Memory[]>();
  for (const m of data?.memories ?? []) {
    if (m.scope !== "client" || !m.client) continue;
    const key = [...clients.keys()].find((k) => k.toLowerCase() === m.client!.toLowerCase()) ?? m.client;
    clients.set(key, [...(clients.get(key) ?? []), m]);
  }

  return (
    <div className="fc-screen">
      <HomeHeader />
      <main className="fc-main fc-narrow">
        <div>
          <h1 className="fc-h1">Memory</h1>
          <p className="fc-caption" style={{ margin: "4px 0 0" }}>
            What your agent learned from your comments. It uses these as defaults for new videos; what you ask for always comes first.
          </p>
        </div>
        {error && !data ? (
          isOffline(error) ? (
            <Offline />
          ) : (
            <p className="fc-caption">{String((error as Error).message)}</p>
          )
        ) : !data ? (
          <div className="fc-skel" style={{ height: 76 }} aria-busy="true" />
        ) : data.memories.length === 0 ? (
          <div className="fc-card fc-empty" data-testid="memory-empty">
            <span className="ic">
              <Brain className="fc-i" />
            </span>
            <div className="fc-h3">Nothing yet</div>
            <p>When a comment is about your taste rather than one video, like "hard cuts only", your agent saves it here. You can also tell it "remember that…".</p>
          </div>
        ) : (
          <>
            {mine.length > 0 && (
              <section className="fc-col" style={{ gap: 6 }} aria-label="You">
                <h2 className="fc-h2">You</h2>
                <ul className="fc-thread fc-memory">
                  {mine.map((m) => (
                    <MemoryItem key={m.id} memory={m} projects={data.projects} onChanged={load} />
                  ))}
                </ul>
              </section>
            )}
            {[...clients].map(([name, list]) => (
              <section key={name} className="fc-col" style={{ gap: 6 }} aria-label={name}>
                <h2 className="fc-h2">{name}</h2>
                <ul className="fc-thread fc-memory">
                  {list.map((m) => (
                    <MemoryItem key={m.id} memory={m} projects={data.projects} onChanged={load} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
