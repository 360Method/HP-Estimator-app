/**
 * OsLibrary — the HP-OS folder tree: the business's knowledge, SOPs, and
 * references, browsable and searchable from any device. Documents open at
 * /os/d/:docId.
 */
import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronRight, Folder, FolderOpen, FileText, Search, X, Compass, Zap,
} from "lucide-react";
import { OsShell } from "../OsShell";

type FolderRow = {
  id: number;
  parentId: number | null;
  name: string;
  areaCode: string | null;
  sortOrder: number;
  docCount: number;
};

const TYPE_BADGE: Record<string, string> = {
  SOP: "bg-amber-100 text-amber-800",
  REF: "bg-blue-100 text-blue-800",
  DATA: "bg-purple-100 text-purple-800",
  WF: "bg-emerald-100 text-emerald-800",
  TPL: "bg-gray-100 text-gray-700",
  DOC: "bg-gray-100 text-gray-600",
};

function FolderNode({
  folder,
  childrenByParent,
  expanded,
  toggle,
  activeFolderId,
  depth,
}: {
  folder: FolderRow;
  childrenByParent: Map<number | null, FolderRow[]>;
  expanded: Set<number>;
  toggle: (id: number) => void;
  activeFolderId: number | null;
  depth: number;
}) {
  const kids = childrenByParent.get(folder.id) ?? [];
  const isOpen = expanded.has(folder.id);
  const isActive = activeFolderId === folder.id;

  return (
    <div>
      <div
        className={
          "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors " +
          (isActive ? "bg-[rgba(200,146,42,0.14)] font-semibold" : "hover:bg-black/5")
        }
        style={{ paddingLeft: `${8 + depth * 14}px`, color: isActive ? "var(--hp-gold-deep)" : "var(--hp-ink)" }}
      >
        <button type="button" className="shrink-0 p-0.5" onClick={() => toggle(folder.id)} aria-label="Expand">
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-90" : ""} ${kids.length === 0 ? "opacity-0" : "text-muted-foreground"}`}
          />
        </button>
        <Link href={`/os/library/f/${folder.id}`}>
          <span className="flex items-center gap-1.5 flex-1 min-w-0">
            {folder.areaCode === "COMPASS" ? (
              <Compass className="w-4 h-4 shrink-0" style={{ color: "var(--hp-gold-deep)" }} />
            ) : isOpen ? (
              <FolderOpen className="w-4 h-4 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{folder.name}</span>
            {folder.docCount > 0 && <span className="text-[10px] text-muted-foreground">({folder.docCount})</span>}
          </span>
        </Link>
      </div>
      {isOpen &&
        kids.map((k) => (
          <FolderNode
            key={k.id}
            folder={k}
            childrenByParent={childrenByParent}
            expanded={expanded}
            toggle={toggle}
            activeFolderId={activeFolderId}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export default function OsLibrary() {
  const [, params] = useRoute("/os/library/f/:folderId");
  const activeFolderId = params?.folderId ? Number(params.folderId) : null;
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");

  const { data: folders, isLoading } = trpc.os.folders.tree.useQuery();
  const { data: docs } = trpc.os.docs.list.useQuery(
    { folderId: activeFolderId ?? undefined },
    { enabled: activeFolderId !== null },
  );
  const { data: searchResults } = trpc.os.docs.search.useQuery(
    { query },
    { enabled: query.trim().length >= 2 },
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, FolderRow[]>();
    for (const f of folders ?? []) {
      const list = map.get(f.parentId) ?? [];
      list.push(f as FolderRow);
      map.set(f.parentId, list);
    }
    return map;
  }, [folders]);

  const activeFolder = (folders ?? []).find((f) => f.id === activeFolderId) ?? null;

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const roots = childrenByParent.get(null) ?? [];
  const searching = query.trim().length >= 2;

  return (
    <OsShell active="/os/library">
      <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
        Library
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        The business's folders, SOPs, and references. Internal only.
      </p>

      {/* ── Search ──────────────────────────────────────────────── */}
      <div className="mt-4 relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the library (title, id, or text)..."
          className="w-full text-sm pl-9 pr-9 py-2.5 rounded-xl border bg-white"
          style={{ borderColor: "var(--hp-hairline)" }}
        />
        {query && (
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}>
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {searching ? (
        <div className="mt-4 space-y-1.5">
          {(searchResults ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No matches.</p>
          ) : (
            (searchResults ?? []).map((d) => (
              <Link key={d.docId} href={`/os/d/${d.docId}`}>
                <div
                  className="bg-white rounded-xl border px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:shadow-sm transition-shadow"
                  style={{ borderColor: "var(--hp-hairline)" }}
                >
                  <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--hp-ink)" }}>
                      {d.title}
                    </div>
                    <div className="text-xs text-muted-foreground">{d.docId}</div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_BADGE[d.type] ?? TYPE_BADGE.DOC}`}>{d.type}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      ) : (
        <div className="mt-4 grid md:grid-cols-[280px_1fr] gap-4">
          {/* ── Tree ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border p-2 md:max-h-[70vh] md:overflow-y-auto" style={{ borderColor: "var(--hp-hairline)" }}>
            {isLoading ? (
              <div className="h-40 animate-pulse bg-black/5 rounded-lg" />
            ) : (
              roots.map((root) => (
                <FolderNode
                  key={root.id}
                  folder={root as FolderRow}
                  childrenByParent={childrenByParent}
                  expanded={expanded}
                  toggle={toggle}
                  activeFolderId={activeFolderId}
                  depth={0}
                />
              ))
            )}
          </div>

          {/* ── Folder contents ───────────────────────────────────── */}
          <div>
            {activeFolderId === null ? (
              <div className="text-center py-12 bg-white rounded-xl border" style={{ borderColor: "var(--hp-hairline)" }}>
                <Zap className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--hp-gold-soft)" }} />
                <p className="hp-serif" style={{ color: "var(--hp-ink)" }}>
                  Pick a folder.
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Pioneers Compass holds the identity, operating rules, and the SOP library. The numbered areas mirror how the business runs.
                </p>
              </div>
            ) : (
              <>
                <h2 className="hp-serif text-lg mb-2" style={{ color: "var(--hp-ink)" }}>
                  {activeFolder?.name ?? "Folder"}
                </h2>
                <div className="space-y-1.5">
                  {(docs ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6">No documents here yet. Subfolders show in the tree.</p>
                  ) : (
                    (docs ?? []).map((d) => (
                      <Link key={d.docId} href={`/os/d/${d.docId}`}>
                        <div
                          className="bg-white rounded-xl border px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:shadow-sm transition-shadow"
                          style={{ borderColor: "var(--hp-hairline)" }}
                        >
                          <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: "var(--hp-ink)" }}>
                              {d.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {d.docId} · v{d.version}
                            </div>
                          </div>
                          {d.kind === "agent" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">agent</span>
                          )}
                          {d.type === "SOP" && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${d.enabled ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}
                            >
                              {d.enabled ? "ON" : "off"}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_BADGE[d.type] ?? TYPE_BADGE.DOC}`}>{d.type}</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </OsShell>
  );
}
