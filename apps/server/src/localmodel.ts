/**
 * Local model through Ollama (plan.md 13.1): free, on this computer, for small jobs God Eye does by
 * itself (session summaries, sorting, translation). Used when the setting says so, or when
 * Claude's limit is full and the setting allows it. Never for coding agents: those stay on the
 * user's own AI accounts.
 */
export interface LocalModelConfig {
  url: string;
  model: string;
}

export async function ollamaModels(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<{ running: boolean; models: string[] }> {
  try {
    const res = await fetcher(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { running: false, models: [] };
    const body = (await res.json()) as { models?: { name: string }[] };
    return { running: true, models: (body.models ?? []).map((m) => m.name) };
  } catch {
    return { running: false, models: [] };
  }
}

export async function ollamaChat(
  config: LocalModelConfig,
  prompt: string,
  system?: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const res = await fetcher(`${config.url}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
      options: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Ollama: ${(await res.text()).slice(0, 200) || res.status}`);
  const body = (await res.json()) as { message?: { content?: string } };
  const text = body.message?.content?.trim();
  if (!text) throw new Error("Ollama gave an empty answer");
  return text;
}

/** Words Claude Code prints when the plan's limit is reached. */
export const LIMIT_REACHED =
  /usage limit reached|limit reached\s*[∙·|-]|\b5-hour limit\b|\bweekly limit\b|rate.?limit(ed|_error| exceeded| reached)|too many requests/i;
