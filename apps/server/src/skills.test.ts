import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frontMatter, Skills, skillFolders } from "./skills";

const SKILL_MD = "---\nname: pdf\ndescription: Work with PDF files\nlicense: MIT\n---\n\n# PDF\n";

/** GitHub and skills.sh as far as the tests need them. */
function fakeWeb(calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    if (url.includes("/git/trees/"))
      return Response.json({
        tree: [
          { path: "skills/pdf/SKILL.md", type: "blob", size: SKILL_MD.length },
          { path: "skills/pdf/scripts/fill.py", type: "blob", size: 5 },
          { path: "template/SKILL.md", type: "blob", size: 10 },
        ],
      });
    if (url.endsWith("/SKILL.md")) return new Response(SKILL_MD);
    if (url.endsWith("/fill.py")) return new Response("print");
    if (url.includes("skills.sh/api/search"))
      return Response.json({
        skills: [{ source: "someone/skills", skillId: "pdf-tools", name: "pdf-tools", installs: 9 }],
      });
    return new Response("missing", { status: 404 });
  };
}

describe("skills", () => {
  test("front matter and skill folders are read from a repository", () => {
    expect(frontMatter(SKILL_MD)).toEqual({ name: "pdf", description: "Work with PDF files", license: "MIT" });
    expect([
      ...skillFolders([
        { path: "skills/pdf/SKILL.md", type: "blob" },
        { path: "template/SKILL.md", type: "blob" },
      ]),
    ]).toEqual([["pdf", "skills/pdf"]]);
  });

  test("search shows official skills first, then skills.sh", async () => {
    const skills = new Skills(() => mkdtempSync(join(tmpdir(), "skills-")), fakeWeb());
    const { hits, errors } = await skills.search("pdf");
    expect(errors).toEqual([]);
    expect(hits.map((h) => [h.id, h.official])).toEqual([
      ["anthropics/skills/pdf", true],
      ["someone/skills/pdf-tools", false],
    ]);
    expect(hits[0]?.description).toBe("Work with PDF files");
  });

  test("a preview names the programs in it; install copies the folder, remove takes it away", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skills-"));
    const skills = new Skills(() => dir, fakeWeb());
    const preview = await skills.preview("anthropics/skills", "pdf");
    expect(preview.scripts).toEqual(["scripts/fill.py"]);
    expect(preview.license).toBe("MIT");
    await skills.install("anthropics/skills", "pdf");
    expect(readFileSync(join(dir, "pdf", "scripts", "fill.py"), "utf8")).toBe("print");
    expect(skills.installed()).toEqual([
      { name: "pdf", description: "Work with PDF files", source: "anthropics/skills/pdf" },
    ]);
    skills.remove("pdf");
    expect(existsSync(join(dir, "pdf"))).toBe(false);
  });

  test("names that could leave the folder are refused before anything is fetched", async () => {
    const calls: string[] = [];
    const skills = new Skills(() => tmpdir(), fakeWeb(calls));
    await expect(skills.preview("../etc", "pdf")).rejects.toThrow();
    await expect(skills.preview("anthropics/skills", "..")).rejects.toThrow();
    expect(() => skills.remove("..")).toThrow();
    expect(calls).toEqual([]);
  });
});
