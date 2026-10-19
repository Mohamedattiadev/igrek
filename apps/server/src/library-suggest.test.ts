import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_PERSONAS } from "@igrek/core";
import { librarySuggestions, projectDependencies } from "./library-suggest";

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "igrek-suggest-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

describe("library suggestions", () => {
  test("dependencies come from npm (with workspaces) and Python manifests", () => {
    const dir = project({
      "package.json": JSON.stringify({ dependencies: { react: "19" }, devDependencies: { vite: "7" } }),
      "apps/api/package.json": JSON.stringify({ dependencies: { "@nestjs/core": "11" } }),
      "requirements.txt": "# web\nDjango>=5.0\npytest==8\n",
      "pyproject.toml": '[project]\ndependencies = [\n  "fastapi>=0.110",\n]\n',
    });
    const deps = projectDependencies(dir);
    for (const name of ["react", "vite", "@nestjs/core", "django", "pytest", "fastapi"]) expect(deps).toContain(name);
  });

  test("docs of what the projects use come first, most used first; what the library has is left out", () => {
    const shop = project({ "package.json": JSON.stringify({ dependencies: { react: "19", pg: "8" } }) });
    const blog = project({ "package.json": JSON.stringify({ dependencies: { "react-dom": "19" } }) });
    const list = librarySuggestions(
      [
        { name: "shop", path: shop },
        { name: "blog", path: blog },
      ],
      new Set(["https://owasp.org/Top10/"]),
    );
    expect(list[0]).toMatchObject({ title: "React reference", kind: "doc", projects: ["shop", "blog"] });
    expect(list.find((s) => s.title === "PostgreSQL documentation")?.projects).toEqual(["shop"]);
    expect(list.some((s) => s.url === "https://owasp.org/Top10/")).toBe(false);
    expect(list.some((s) => s.kind === "web")).toBe(true);
  });

  test("every suggestion is for experts that exist, over https", () => {
    const ids = new Set(BUILTIN_PERSONAS.map((p) => p.id));
    for (const s of librarySuggestions([], new Set())) {
      expect(s.url.startsWith("https://"), s.url).toBe(true);
      for (const id of s.personaIds) expect(ids.has(id), `${s.title}: ${id}`).toBe(true);
    }
  });
});
