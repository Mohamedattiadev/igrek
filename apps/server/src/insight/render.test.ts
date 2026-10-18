import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderAdvice } from "./render";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "gd-render-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("render strategy", () => {
  const root = project({
    "app/page.tsx": "export default function Home() { return <h1>Hi</h1>; }",
    "app/blog/[slug]/page.tsx":
      "export default async function Post({ params }) { const post = await fetch(`https://cms/x/${params.slug}`).then(r => r.json()); return <p>{post.title}</p>; }",
    "app/(shop)/products/page.tsx":
      '"use client";\nimport { useEffect, useState } from "react";\nexport default function P() { const [x, setX] = useState([]); useEffect(() => { fetch("/api/products").then(r => r.json()).then(setX); }, []); return <ul />; }',
    "app/dashboard/page.tsx":
      'import { cookies } from "next/headers";\nexport default async function D() { const c = cookies(); const data = await fetch("https://api/me", { cache: "no-store" }); return <div />; }',
    "app/news/page.tsx":
      'export default async function N() { const items = await fetch("https://api/news", { cache: "no-store" }); return <div />; }',
    "app/prices/page.tsx":
      "export const revalidate = 60;\nexport default async function P() { const p = await fetch('https://api/p'); return <div />; }",
    "pages/old.tsx":
      "export async function getServerSideProps() { return { props: {} }; }\nexport default function Old() { return null; }",
    "app/layout.tsx": "export default function L({ children }) { return children; }",
  });
  const advice = renderAdvice(root);
  const of = (route: string) => advice.find((a) => a.route === route);

  test("each page's current strategy comes from its code", () => {
    expect(advice.map((a) => a.route).sort()).toEqual(
      ["/", "/blog/:slug", "/dashboard", "/news", "/old", "/prices", "/products"].sort(),
    );
    expect(of("/")?.current).toBe("ssg");
    expect(of("/products")?.current).toBe("csr");
    expect(of("/dashboard")?.current).toBe("ssr");
    expect(of("/prices")?.current).toBe("isr");
    expect(of("/old")?.current).toBe("ssr");
  });

  test("suggestions come with the reason", () => {
    expect(of("/")).toMatchObject({ reasons: [] });
    expect(of("/products")).toMatchObject({ suggested: "ssg", reasons: ["browserFetchPublic"] });
    expect(of("/news")).toMatchObject({ suggested: "isr", reasons: ["dynamicNotPersonal"] });
    expect(of("/dashboard")).toMatchObject({ reasons: ["streamWithLoading"] });
    expect(of("/blog/:slug")).toMatchObject({ reasons: ["preRenderParams"] });
    expect(of("/old")).toMatchObject({ suggested: "isr", reasons: ["serverPropsPublic"] });
    // Pages with something to change come first.
    expect(advice[advice.length - 1]?.reasons).toEqual([]);
  });

  test("a loading.tsx in the page's folder or above counts as a streaming boundary", () => {
    const withLoading = project({
      "app/dashboard/loading.tsx": "export default function L() { return null; }",
      "app/dashboard/page.tsx":
        'import { cookies } from "next/headers";\nexport default async function D() { cookies(); return null; }',
    });
    expect(renderAdvice(withLoading)[0]?.reasons).toEqual([]);
  });
});
