import type { Board, BoardVersion, DbConnection } from "@godeye/core";
import {
  ArrowLeft,
  Database,
  Download,
  History,
  ListChecks,
  MessageSquare,
  Network,
  PenLine,
  Plus,
  ScanSearch,
  Sparkles,
  SquareCode,
  Trash2,
  Wand2,
  Workflow,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import type { BoardHandle } from "../../components/BoardEditor";
import { Markdown } from "../../components/Markdown";
import { Badge, Button, Card, Dialog, EmptyState } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { dateTime, relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";
import { dataApi, docsApi } from "../../lib/ops-api";

// The whiteboard's fonts are served by God Eye itself (see vite.config.ts), not a CDN.
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
const BoardEditor = lazy(() => import("../../components/BoardEditor"));

function download(name: string, data: Blob | string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(typeof data === "string" ? new Blob([data], { type }) : data);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Versions({
  boardId,
  open,
  onClose,
  onRestored,
}: {
  boardId: string;
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { t } = useTranslation();
  const [list, setList] = useState<BoardVersion[]>([]);
  useEffect(() => {
    if (open)
      docsApi
        .versions(boardId)
        .then(setList)
        .catch(() => undefined);
  }, [open, boardId]);
  return (
    <Dialog open={open} onClose={onClose} label={t("boards.history")}>
      <div className="space-y-3 p-5">
        <h2 className="text-[15px] font-semibold">{t("boards.history")}</h2>
        <p className="text-xs text-fg-muted">{t("boards.historyHint")}</p>
        <ul className="max-h-80 divide-y divide-border overflow-auto">
          {list.map((v) => (
            <li key={v.id} className="flex items-center gap-2 py-1.5 text-[13px]">
              <span className="flex-1">
                {dateTime(v.at)}
                <span className="ms-2 text-xs text-fg-subtle">
                  {t("boards.elements", { count: v.elements })}
                  {v.author && ` · ${v.author}`}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await docsApi.restoreVersion(boardId, v.id);
                  onClose();
                  onRestored();
                }}
              >
                {t("boards.restore")}
              </Button>
            </li>
          ))}
          {!list.length && <li className="py-2 text-xs text-fg-subtle">{t("boards.noVersions")}</li>}
        </ul>
        <div className="flex justify-end">
          <Button onClick={onClose}>{t("apperrors.done")}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function BoardView({ boardId, projectId, onBack }: { boardId: string; projectId: string; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [board, setBoard] = useState<Board & { scene: string }>();
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved");
  const [answer, setAnswer] = useState<{ title: string; text: string; mermaid?: string }>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [question, setQuestion] = useState("");
  const [flow, setFlow] = useState<string>();
  const [history, setHistory] = useState(false);
  const [conns, setConns] = useState<DbConnection[]>([]);
  const handle = useRef<BoardHandle>(undefined);
  const dark = document.documentElement.dataset.theme === "dark";
  useEffect(() => {
    docsApi
      .board(boardId)
      .then(setBoard)
      .catch((e: Error) => setError(e.message));
    dataApi
      .databases()
      .then((list) => setConns(list.filter((c) => c.projectId === projectId)))
      .catch(() => undefined);
  }, [boardId, projectId]);
  const save = useCallback(
    (scene: string) => {
      setSaved("saving");
      docsApi
        .saveBoard(boardId, { scene })
        .then(() => setSaved("saved"))
        .catch(() => setSaved("error"));
    },
    [boardId],
  );
  const ask = async (mode: "explain" | "missing" | "code" | "tidy" | "question") => {
    setBusy(mode);
    setError(undefined);
    try {
      const elements = handle.current?.elements() ?? [];
      if (!elements.length) throw new Error(t("boards.emptyBoard"));
      const png = await handle.current?.png();
      const r = await docsApi.ask(boardId, {
        mode,
        png,
        elements,
        language: i18n.language,
        ...(mode === "question" ? { question } : {}),
      });
      setAnswer({
        title: mode === "question" ? question : t(`boards.ask_${mode}`),
        text: r.answer,
        mermaid: r.mermaid,
      });
      if (mode === "tidy" && r.mermaid) await handle.current?.addMermaid(r.mermaid);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const draw = async (what: "schema" | "architecture" | "flow", prompt?: string) => {
    setBusy(what);
    setError(undefined);
    try {
      const r = await docsApi.draw(projectId, { what, prompt, language: i18n.language, connectionId: conns[0]?.id });
      await handle.current?.addMermaid(r.mermaid);
      setFlow(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const toChat = async () => {
    const chat = await api.startChat({ projectId });
    const text = t("boards.chatDraft", { title: board?.title ?? "", structure: handle.current?.structure() ?? "" });
    navigate(`/c/${chat.id}?draft=${encodeURIComponent(text)}`);
  };
  const tool = (key: string, icon: typeof Sparkles, onClick: () => void, label = t(`boards.ask_${key}`)) => (
    <Button size="sm" variant="ghost" icon={icon} disabled={!!busy} onClick={onClick} data-tip={t(`boards.tip_${key}`)}>
      {busy === key ? t("boards.thinking") : label}
    </Button>
  );
  return (
    <div className="-m-6 flex h-[calc(100vh-150px)] min-h-[480px] flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1.5">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack} aria-label={t("boards.back")} />
        <input
          key={board?.id}
          defaultValue={board?.title}
          aria-label={t("boards.title")}
          onBlur={(e) =>
            e.target.value.trim() &&
            e.target.value !== board?.title &&
            void docsApi.saveBoard(boardId, { title: e.target.value })
          }
          className="h-7 w-48 rounded-ui border border-transparent bg-transparent px-1.5 text-[13.5px] font-semibold outline-none hover:border-border focus:border-accent"
        />
        <span className={cn("text-[11px]", saved === "error" ? "text-danger" : "text-fg-subtle")}>
          {t(`boards.${saved}`)}
        </span>
        <div className="mx-1 h-5 w-px bg-border" />
        {tool("explain", ScanSearch, () => void ask("explain"))}
        {tool("missing", ListChecks, () => void ask("missing"))}
        {tool("code", SquareCode, () => void ask("code"))}
        {tool("tidy", Wand2, () => void ask("tidy"))}
        <div className="mx-1 h-5 w-px bg-border" />
        {tool("architecture", Network, () => void draw("architecture"), t("boards.draw_architecture"))}
        {tool("schema", Database, () => void draw("schema"), t("boards.draw_schema"))}
        {tool("flow", Workflow, () => setFlow(""), t("boards.draw_flow"))}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={MessageSquare}
          onClick={() => void toChat()}
          data-tip={t("boards.tip_chat")}
        >
          {t("boards.toChat")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={History}
          onClick={() => setHistory(true)}
          aria-label={t("boards.history")}
          data-tip={t("boards.history")}
        />
        <details className="relative">
          <summary className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-ui px-2 text-[12.5px] hover:bg-bg-hover">
            <Download size={14} aria-hidden="true" />
            {t("boards.export")}
          </summary>
          <div className="absolute end-0 z-20 mt-1 w-40 rounded-ui border border-border bg-bg p-1 shadow-ui">
            {(
              [
                [
                  "png",
                  async () => {
                    const blob = await handle.current?.exportPng();
                    if (blob) download(`${board?.title ?? "board"}.png`, blob, "image/png");
                  },
                ],
                [
                  "svg",
                  async () => {
                    const svg = await handle.current?.exportSvg();
                    if (svg) download(`${board?.title ?? "board"}.svg`, svg, "image/svg+xml");
                  },
                ],
                [
                  "excalidraw",
                  async () => {
                    const json = handle.current?.exportFile();
                    if (json) download(`${board?.title ?? "board"}.excalidraw`, json, "application/json");
                  },
                ],
              ] as const
            ).map(([kind, fn]) => (
              <button
                key={kind}
                type="button"
                onClick={() => void fn()}
                className="block w-full rounded-ui px-2 py-1 text-start text-[12.5px] hover:bg-bg-hover"
              >
                {kind === "excalidraw" ? ".excalidraw" : kind.toUpperCase()}
              </button>
            ))}
          </div>
        </details>
      </div>
      {flow !== undefined && (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-subtle px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            void draw("flow", flow);
          }}
        >
          <input
            value={flow}
            onChange={(e) => setFlow(e.target.value)}
            placeholder={t("boards.flowPlaceholder")}
            aria-label={t("boards.draw_flow")}
            className="h-8 min-w-0 flex-1 rounded-ui border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
          />
          <Button type="submit" size="sm" variant="primary" disabled={!flow.trim() || !!busy}>
            {busy === "flow" ? t("boards.thinking") : t("boards.drawIt")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFlow(undefined)}>
            {t("persona.cancel")}
          </Button>
        </form>
      )}
      {error && <p className="border-b border-border bg-danger-soft/30 px-3 py-1.5 text-xs text-danger">{error}</p>}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {board && (
            <Suspense fallback={<div className="h-full animate-pulse bg-bg-subtle" />}>
              <BoardEditor
                scene={board.scene}
                dark={dark}
                language={i18n.language}
                onChange={save}
                onReady={(h) => {
                  handle.current = h;
                }}
              />
            </Suspense>
          )}
        </div>
        {answer && (
          <aside className="flex w-[min(380px,45vw)] shrink-0 flex-col border-s border-border">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Sparkles size={14} className="text-accent" aria-hidden="true" />
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{answer.title}</p>
              <Button size="sm" variant="ghost" onClick={() => setAnswer(undefined)}>
                {t("boards.close")}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 text-[13px]">
              <Markdown text={answer.text} />
              {answer.mermaid && <p className="mt-2 text-xs text-success">{t("boards.tidied")}</p>}
            </div>
            <form
              className="flex gap-2 border-t border-border p-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (question.trim()) void ask("question");
              }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t("boards.askAnything")}
                aria-label={t("boards.askAnything")}
                className="h-8 min-w-0 flex-1 rounded-ui border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent"
              />
              <Button type="submit" size="sm" disabled={!question.trim() || !!busy}>
                {busy === "question" ? t("boards.thinking") : t("boards.ask")}
              </Button>
            </form>
          </aside>
        )}
      </div>
      <Versions
        boardId={boardId}
        open={history}
        onClose={() => setHistory(false)}
        onRestored={() => void docsApi.board(boardId).then((b) => handle.current?.replace(b.scene))}
      />
    </div>
  );
}

/** Boards of a project, or of one category page (plan.md 12). */
export function BoardsList({
  projectId,
  category,
  compact,
}: {
  projectId: string;
  category?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>();
  const load = useCallback(
    () =>
      void docsApi
        .boards(projectId, category)
        .then(setBoards)
        .catch(() => undefined),
    [projectId, category],
  );
  useEffect(load, [load]);
  useServerEvent("docs-changed", (m) => m.projectId === projectId && load());
  const open = (id: string) =>
    compact ? navigate(`/p/${projectId}?tab=docs&board=${id}`) : setParams({ tab: "docs", board: id });
  const create = async () => {
    const b = await docsApi.createBoard(projectId, {
      title: category
        ? t("boards.categoryTitle", { category: t(`category.${category}`, { defaultValue: category }) })
        : t("boards.newTitle"),
      category,
    });
    open(b.id);
  };
  if (boards && !boards.length && !compact)
    return (
      <EmptyState
        icon={PenLine}
        title={t("boards.emptyTitle")}
        body={t("boards.emptyBody")}
        action={
          <Button variant="primary" icon={Plus} onClick={() => void create()}>
            {t("boards.new")}
          </Button>
        }
      />
    );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {compact && <h3 className="min-w-0 flex-1 text-[13px] font-semibold">{t("boards.list")}</h3>}
        <Button size="sm" icon={Plus} onClick={() => void create()}>
          {t("boards.new")}
        </Button>
      </div>
      <ul className={cn("grid gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {(boards ?? []).map((b) => (
          <li key={b.id}>
            <Card className="group flex items-start gap-2 p-3 hover:border-accent">
              <button
                type="button"
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("text/plain", t("boards.dragText", { title: b.title, id: b.id }))
                }
                onClick={() => open(b.id)}
                className="min-w-0 flex-1 text-start"
              >
                <p className="truncate text-[13.5px] font-medium">{b.title}</p>
                <p className="text-[11px] text-fg-subtle">
                  {t("boards.elements", { count: b.elements })} · {relativeTime(b.updatedAt)}
                  {b.author && ` · ${b.author}`}
                </p>
              </button>
              {b.category && !category && <Badge>{t(`category.${b.category}`, { defaultValue: b.category })}</Badge>}
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                aria-label={t("boards.remove")}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => void docsApi.removeBoard(b.id)}
              />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BoardsTab({ projectId }: { projectId: string }) {
  const [params, setParams] = useSearchParams();
  const board = params.get("board");
  return board ? (
    <BoardView
      key={board}
      boardId={board}
      projectId={projectId}
      onBack={() => setParams({ tab: "docs", view: "boards" })}
    />
  ) : (
    <BoardsList projectId={projectId} />
  );
}
