import { describe, expect, test } from "bun:test";
// @ts-expect-error plain JS module that runs inside the project's Vite
import { addSourceAttrs } from "./vite-source-plugin.mjs";

const add = (code: string) => addSourceAttrs(code, "src/App.tsx") as string;

describe("source attributes for the picker", () => {
  test("DOM elements get file:line:column; components, strings and comparisons are left alone", () => {
    const code = `import { Card } from "./Card";
export function App({ items }: { items: string[] }) {
  const less = items.length < 3;
  const tip = "<b>not jsx</b>";
  // <span>comment</span>
  return (
    <div className="app">
      <Card title={\`Total \${items.length}\`}>
        <p>Don't stop {items.map((i) => <span key={i}>{i}</span>)}</p>
      </Card>
      {less && <button onClick={() => alert("<x>")}>Add</button>}
      <img src="/a.png" />
    </div>
  );
}
const id = <T,>(x: T) => x;
`;
    const out = add(code);
    expect(out).toContain('<div data-gd-src="src/App.tsx:7:5" className="app">');
    expect(out).toContain('<p data-gd-src="src/App.tsx:9:9">');
    expect(out).toContain('<span data-gd-src="src/App.tsx:9:41" key={i}>');
    expect(out).toContain('<button data-gd-src="src/App.tsx:11:16" onClick');
    expect(out).toContain('<img data-gd-src="src/App.tsx:12:7" src="/a.png" />');
    expect(out).toContain("<Card title=");
    expect(out).toContain('const tip = "<b>not jsx</b>";');
    expect(out).toContain("// <span>comment</span>");
    expect(out).toContain("const id = <T,>(x: T) => x;");
    expect(out).toContain("items.length < 3");
    // Line count never changes.
    expect(out.split("\n").length).toBe(code.split("\n").length);
  });

  test("fragments, nested expressions and already tagged elements", () => {
    const out = add('const a = <><li>{cond ? <b>y</b> : "n"}</li></>;\nconst b = <i data-gd-src="x:1:1">z</i>;');
    expect(out).toContain('<li data-gd-src="src/App.tsx:1:13">');
    expect(out).toContain('<b data-gd-src="src/App.tsx:1:25">');
    expect(out.match(/data-gd-src/g)?.length).toBe(3);
  });
});
