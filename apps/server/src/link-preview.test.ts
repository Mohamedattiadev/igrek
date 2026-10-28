import { afterAll, describe, expect, test } from "bun:test";
import { cleanPreview, linkPreview, parsePreview } from "./link-preview";

// A small site on this machine: a page with Open Graph tags, one with only a title, a big picture.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const site = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/og")
      return new Response(
        `<html><head><meta content="Cart &amp; checkout" property="og:title">
         <meta property="og:description" content="Pay in one step">
         <meta property="og:image" content="/pic.png"><title>ignored</title></head></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    if (path === "/plain")
      return new Response("<title>  Plain   page </title>", { headers: { "content-type": "text/html" } });
    if (path === "/pic.png") return new Response(PNG, { headers: { "content-type": "image/png" } });
    if (path === "/big")
      return new Response(`<meta property="og:title" content="Big"><meta property="og:image" content="/huge.png">`, {
        headers: { "content-type": "text/html" },
      });
    if (path === "/huge.png")
      return new Response(new Uint8Array(200_000), { headers: { "content-type": "image/png" } });
    return new Response("{}", { headers: { "content-type": "application/json" } });
  },
});
afterAll(() => site.stop(true));
const at = (path: string) => `http://127.0.0.1:${site.port}${path}`;

describe("link previews", () => {
  test("Open Graph comes first, entities are decoded, the picture comes along as a small data URL", async () => {
    const preview = await linkPreview(at("/og"));
    expect(preview).toMatchObject({ title: "Cart & checkout", description: "Pay in one step", site: "127.0.0.1" });
    expect(preview?.image).toStartWith("data:image/png;base64,");
  });

  test("a page with only a title still has a card; a big picture is left out; not a page, no card", async () => {
    expect(await linkPreview(at("/plain"))).toMatchObject({ title: "Plain page" });
    expect((await linkPreview(at("/big")))?.image).toBeUndefined();
    expect(await linkPreview(at("/json"))).toBeUndefined();
    expect(await linkPreview("file:///etc/passwd")).toBeUndefined();
    expect(await linkPreview("not a url")).toBeUndefined();
  });

  test("the attributes may come in any order and the site name defaults to the host without www", () => {
    expect(
      parsePreview(
        "https://www.example.com/a",
        `<meta content='Hi' name="twitter:title"><meta name="description" content="d">`,
      ),
    ).toEqual({ url: "https://www.example.com/a", title: "Hi", description: "d", site: "example.com" });
  });

  test("a preview that comes with a message keeps only its known parts; a script or a page as picture is dropped", () => {
    expect(cleanPreview({ url: "javascript:alert(1)", title: "x" })).toBeUndefined();
    expect(
      cleanPreview({ url: "https://a.b", title: "T", image: "data:text/html;base64,PHNjcmlwdD4=", extra: 1 }),
    ).toEqual({ url: "https://a.b", title: "T" });
  });
});
