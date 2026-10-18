import type { RemoteEntry } from "@igrek/core";
import { ArrowUp, File, Folder, FolderOpen, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { fileSize } from "../lib/files";
import { relativeTime } from "../lib/format";
import { Button, Card } from "./ui";

/** Browse and edit text files on a server over SSH (plan.md 2.5). Saving keeps a dated backup there. */
export function RemoteFiles({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const [path, setPath] = useState("~");
  const [listing, setListing] = useState<{ path: string; entries: RemoteEntry[] }>();
  const [error, setError] = useState<string>();
  const [file, setFile] = useState<{ path: string; text: string; draft: string }>();
  const [note, setNote] = useState<string>();
  const open = (target: string) => {
    setError(undefined);
    api
      .serverFiles(serverId, target)
      .then((l) => {
        setListing(l);
        setPath(l.path);
      })
      .catch((err: Error) => setError(err.message));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: start at home once per server
  useEffect(() => open("~"), [serverId]);
  const join = (name: string) => `${(listing?.path ?? path).replace(/\/$/, "")}/${name}`;

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-pad py-2">
        <FolderOpen size={14} className="text-fg-subtle" aria-hidden="true" />
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && open(path)}
          aria-label={t("remote.path")}
          className="h-7 min-w-0 flex-1 bg-transparent font-mono text-[12px] outline-none"
        />
        <Button
          size="sm"
          variant="ghost"
          icon={ArrowUp}
          aria-label={t("remote.up")}
          onClick={() => open((listing?.path ?? path).replace(/\/[^/]+\/?$/, "") || "/")}
        />
      </div>
      {error && <p className="px-pad py-2 text-xs text-danger">{error}</p>}
      {file ? (
        <div className="space-y-2 p-pad">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{file.path}</code>
            <Button
              size="sm"
              variant="primary"
              icon={Save}
              disabled={file.draft === file.text}
              onClick={() =>
                window.confirm(t("remote.saveConfirm", { path: file.path })) &&
                void api
                  .saveServerFile(serverId, file.path, file.draft)
                  .then((r) => {
                    setNote(t("remote.saved", { backup: r.backup.split("/").pop() }));
                    setFile({ ...file, text: file.draft });
                  })
                  .catch((err: Error) => setError(err.message))
              }
            >
              {t("env.save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              aria-label={t("enhance.close")}
              onClick={() => setFile(undefined)}
            />
          </div>
          {note && <p className="text-[11px] text-success">{note}</p>}
          <textarea
            value={file.draft}
            onChange={(e) => setFile({ ...file, draft: e.target.value })}
            spellCheck={false}
            aria-label={file.path}
            className="h-[50vh] w-full resize-y rounded-ui border border-border bg-bg p-2 font-mono text-[12px] outline-none focus:border-accent"
          />
        </div>
      ) : (
        <ul className="max-h-[50vh] divide-y divide-border overflow-auto">
          {listing?.entries.map((e) => (
            <li key={e.name}>
              <button
                type="button"
                data-nav-item
                onClick={() =>
                  e.dir
                    ? open(join(e.name))
                    : api
                        .serverFile(serverId, join(e.name))
                        .then((r) => {
                          setNote(undefined);
                          setFile({ path: join(e.name), text: r.text, draft: r.text });
                        })
                        .catch((err: Error) => setError(err.message))
                }
                className="flex w-full items-center gap-2 px-pad py-1.5 text-start text-[12.5px] hover:bg-bg-hover"
              >
                {e.dir ? (
                  <Folder size={13} className="text-accent" aria-hidden="true" />
                ) : (
                  <File size={13} className="text-fg-subtle" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono">{e.name}</span>
                {!e.dir && <span className="text-[11px] text-fg-subtle">{fileSize(e.size)}</span>}
                <span className="w-24 text-end text-[11px] text-fg-subtle">{relativeTime(e.mtime)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
