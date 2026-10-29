import "@excalidraw/excalidraw/index.css";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ChannelMessage, MeetCall, Peer } from "./call";

/**
 * The meeting's whiteboard (plan.md 20.8): Excalidraw (MIT), loaded only when a meeting opens it.
 * Everyone draws at once; each change goes to the others on the call's data channels, newest
 * version of each shape winning, and everyone's pointer shows with their name.
 */
export default function MeetBoard({
  call,
  initial,
  dark,
  onScene,
}: {
  call: MeetCall;
  initial?: string;
  dark: boolean;
  /** The board as it is now, for saving with the meeting when it ends. */
  onScene: (elements: string) => void;
}) {
  const { i18n } = useTranslation();
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const last = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pointers = useRef(new Map<string, { x: number; y: number; name: string }>());

  useEffect(() => {
    const before = call.onMessage;
    call.onMessage = (from: Peer, m: ChannelMessage) => {
      before(from, m);
      const board = api.current;
      if (!board) return;
      if (m.t === "board") {
        const theirs = JSON.parse(m.elements) as { id: string; version: number }[];
        const mine = new Map(board.getSceneElementsIncludingDeleted().map((e) => [e.id, e]));
        // Per shape, the newer version wins, so two people drawing at once both keep their work.
        for (const e of theirs) if ((mine.get(e.id)?.version ?? -1) < e.version) mine.set(e.id, e as never);
        last.current = JSON.stringify([...mine.values()]);
        board.updateScene({ elements: [...mine.values()] });
      } else if (m.t === "pointer") {
        pointers.current.set(from.device, { x: m.x, y: m.y, name: from.name });
        const collaborators = new Map(
          [...pointers.current].map(([id, p]) => [
            id,
            { username: p.name, pointer: { x: p.x, y: p.y, tool: "pointer" } },
          ]),
        );
        board.updateScene({ collaborators: collaborators as never });
      }
    };
    return () => {
      call.onMessage = before;
      clearTimeout(timer.current);
    };
  }, [call]);

  return (
    <div className="h-full w-full">
      <Excalidraw
        excalidrawAPI={(a) => {
          api.current = a;
        }}
        initialData={{ elements: (initial ? JSON.parse(initial) : []) as never, scrollToContent: true }}
        theme={dark ? "dark" : "light"}
        langCode={i18n.language.startsWith("tr") ? "tr-TR" : "en"}
        onPointerUpdate={({ pointer }) => call.broadcast({ t: "pointer", x: pointer.x, y: pointer.y })}
        onChange={(elements) => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const next = JSON.stringify(elements);
            if (next === last.current) return;
            last.current = next;
            call.broadcast({ t: "board", elements: next });
            onScene(JSON.stringify(elements.filter((e) => !e.isDeleted)));
          }, 250);
        }}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
      />
    </div>
  );
}
