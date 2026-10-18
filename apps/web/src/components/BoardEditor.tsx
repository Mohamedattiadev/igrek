import "@excalidraw/excalidraw/index.css";
import {
  convertToExcalidrawElements,
  Excalidraw,
  exportToBlob,
  exportToSvg,
  MainMenu,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { describeScene, type SceneElement, sceneText } from "@igrek/core";
import { useEffect, useRef, useState } from "react";

type Scene = { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> };

export interface BoardHandle {
  /** The board as a PNG (base64, no data: prefix), for the AI to look at. */
  png: () => Promise<string | undefined>;
  /** Mermaid → editable shapes, placed to the right of what is already there. */
  addMermaid: (code: string) => Promise<void>;
  exportPng: () => Promise<Blob | undefined>;
  exportSvg: () => Promise<string | undefined>;
  exportFile: () => string | undefined;
  /** The structure in plain lines (for a chat). */
  structure: () => string;
  /** The elements on screen now (saved or not), for the AI. */
  elements: () => unknown[];
  replace: (scene: string) => void;
}

const saveFields = (appState: Record<string, unknown>) => ({
  viewBackgroundColor: appState.viewBackgroundColor,
  gridSize: appState.gridSize,
  gridModeEnabled: appState.gridModeEnabled,
});

/**
 * The whiteboard (plan.md 12): Excalidraw (MIT), loaded only on the board page. Changes are saved
 * a moment after you stop drawing. Fonts come from Igrek itself, so it works offline.
 */
export default function BoardEditor({
  scene,
  dark,
  language,
  onChange,
  onReady,
}: {
  scene: string;
  dark: boolean;
  language: string;
  onChange: (scene: string) => void;
  onReady: (handle: BoardHandle) => void;
}) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const [initial] = useState<Scene>(() => {
    try {
      return JSON.parse(scene) as Scene;
    } catch {
      return {};
    }
  });
  const last = useRef(scene);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handle: BoardHandle = {
    png: async () => {
      const a = api.current;
      if (!a?.getSceneElements().length) return undefined;
      const blob = await exportToBlob({
        elements: a.getSceneElements(),
        appState: { ...a.getAppState(), exportBackground: true, exportWithDarkMode: false },
        files: a.getFiles(),
        mimeType: "image/png",
        maxWidthOrHeight: 1600,
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    },
    addMermaid: async (code: string) => {
      const a = api.current;
      if (!a) return;
      const { elements, files } = await parseMermaidToExcalidraw(code, { themeVariables: { fontSize: "16px" } });
      // Mermaid line breaks (<br>) stay literal in the converted labels; make them real ones.
      const br = (text: string) => text.replace(/<br\s*\/?>/gi, "\n");
      for (const el of elements as { text?: string; label?: { text?: string } }[]) {
        if (typeof el.text === "string") el.text = br(el.text);
        if (el.label && typeof el.label.text === "string") el.label.text = br(el.label.text);
      }
      const shapes = convertToExcalidrawElements(elements, { regenerateIds: true });
      const existing = a.getSceneElements();
      const right = existing.reduce((max, e) => Math.max(max, e.x + e.width), 0);
      const top = existing.length ? Math.min(...existing.map((e) => e.y)) : 0;
      const minX = Math.min(...shapes.map((e) => e.x));
      const minY = Math.min(...shapes.map((e) => e.y));
      const dx = existing.length ? right + 120 - minX : -minX;
      const dy = top - minY;
      const moved = shapes.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }));
      if (files) a.addFiles(Object.values(files));
      a.updateScene({ elements: [...existing, ...moved] });
      a.scrollToContent(moved, { fitToContent: true, animate: true });
    },
    exportPng: async () => {
      const a = api.current;
      if (!a) return undefined;
      return exportToBlob({
        elements: a.getSceneElements(),
        appState: { ...a.getAppState(), exportBackground: true },
        files: a.getFiles(),
        mimeType: "image/png",
      });
    },
    exportSvg: async () => {
      const a = api.current;
      if (!a) return undefined;
      const svg = await exportToSvg({
        elements: a.getSceneElements(),
        appState: { ...a.getAppState(), exportBackground: true },
        files: a.getFiles(),
      });
      return svg.outerHTML;
    },
    exportFile: () => {
      const a = api.current;
      return a ? serializeAsJSON(a.getSceneElements(), a.getAppState(), a.getFiles(), "local") : undefined;
    },
    elements: () => [...(api.current?.getSceneElements() ?? [])],
    structure: () => sceneText(describeScene((api.current?.getSceneElements() ?? []) as unknown as SceneElement[])),
    replace: (next: string) => {
      const a = api.current;
      if (!a) return;
      const parsed = JSON.parse(next) as Scene;
      last.current = next;
      if (parsed.files) a.addFiles(Object.values(parsed.files) as never);
      a.updateScene({ elements: (parsed.elements ?? []) as never });
    },
  };

  return (
    <div className="h-full w-full">
      <Excalidraw
        excalidrawAPI={(a) => {
          api.current = a;
          onReady(handle);
        }}
        initialData={{
          elements: (initial.elements ?? []) as never,
          appState: { ...(initial.appState ?? {}), collaborators: new Map() } as never,
          files: (initial.files ?? {}) as never,
          scrollToContent: true,
        }}
        theme={dark ? "dark" : "light"}
        langCode={language === "tr" ? "tr-TR" : language}
        onChange={(elements, appState, files) => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            // Only files the scene still uses are kept.
            const used = new Set(
              elements
                .filter((e) => !e.isDeleted && "fileId" in e && e.fileId)
                .map((e) => (e as { fileId: string }).fileId),
            );
            const next = JSON.stringify({
              elements: elements.filter((e) => !e.isDeleted),
              appState: saveFields(appState as unknown as Record<string, unknown>),
              files: Object.fromEntries(Object.entries(files).filter(([id]) => used.has(id))),
            });
            if (next !== last.current) {
              last.current = next;
              onChange(next);
            }
          }, 1200);
        }}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
