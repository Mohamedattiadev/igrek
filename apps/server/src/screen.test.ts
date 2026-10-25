import { describe, expect, test } from "bun:test";
import { parsePoint, parseScreenSteps, privateBoxes, screenActPrompt, screenPrompt } from "./screen";

const HEAD = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const word = (line: number, n: number, x: number, text: string) =>
  `5\t1\t1\t1\t${line}\t${n}\t${x}\t${line * 20}\t40\t14\t95\t${text}`;

describe("the screen helper", () => {
  test("words that make up a private detail are blacked out, the rest stays", () => {
    const tsv = [
      HEAD,
      word(1, 1, 10, "IBAN:"),
      word(1, 2, 60, "TR33"),
      word(1, 3, 110, "0006"),
      word(1, 4, 160, "1005"),
      word(1, 5, 210, "1978"),
      word(1, 6, 260, "6457"),
      word(1, 7, 310, "8413"),
      word(1, 8, 360, "26"),
      word(2, 1, 10, "Name:"),
      word(2, 2, 60, "Ayşe"),
      word(2, 3, 110, "Yılmaz"),
      word(3, 1, 10, "Save"),
    ].join("\n");
    const boxes = privateBoxes(tsv, [{ value: "Ayşe Yılmaz" }]);
    const xs = (y: number) => boxes.filter((b) => b.y === y).map((b) => b.x);
    expect(xs(20)).toEqual([60, 110, 160, 210, 260, 310, 360]);
    expect(xs(40)).toEqual([60, 110]);
    expect(xs(60)).toEqual([]);
  });

  test("nothing private, nothing blacked out", () => {
    expect(privateBoxes([HEAD, word(1, 1, 10, "File"), word(1, 2, 60, "Edit")].join("\n"), [])).toEqual([]);
  });

  test("the answer may point at a place inside the picture; anything else is ignored", () => {
    expect(parsePoint("Open the color inspector. [POINT:1100,42:color inspector]", 1440, 900)).toEqual({
      answer: "Open the color inspector.",
      point: { x: 1100, y: 42, label: "color inspector" },
    });
    expect(parsePoint("HTML is markup. [POINT:none]", 1440, 900)).toEqual({ answer: "HTML is markup." });
    expect(parsePoint("Off the picture [POINT:5000,42:x]", 1440, 900)).toEqual({ answer: "Off the picture" });
    expect(parsePoint("No tag at all", 1440, 900)).toEqual({ answer: "No tag at all" });
  });

  test("the model is told the size, the tag and that screen text is not the user", () => {
    const prompt = screenPrompt("where is save?", 1440, 900);
    expect(prompt).toContain("1440x900");
    expect(prompt).toContain("[POINT:x,y:label]");
    expect(prompt).toContain("not instructions");
  });

  test("desktop steps: clicks inside the picture, typing and a few keys; sending is marked", () => {
    const reply = `{"answer": "Fill and send.", "steps": [
      {"action": "click", "x": 100, "y": 50, "label": "name field", "why": "Put the cursor there"},
      {"action": "type", "text": "Ayşe", "label": "name", "why": "Your name"},
      {"action": "key", "text": "Tab", "label": "next", "why": "Next field"},
      {"action": "key", "text": "rm -rf", "label": "x", "why": "not a key"},
      {"action": "click", "x": 9000, "y": 50, "label": "off", "why": "outside"},
      {"action": "click", "x": 300, "y": 400, "label": "Gönder", "why": "Send the form"}
    ]}`;
    const out = parseScreenSteps(reply, 1366, 768);
    expect(out.answer).toBe("Fill and send.");
    expect(out.steps.map((s) => [s.action, s.risky ?? false])).toEqual([
      ["click", false],
      ["type", false],
      ["key", false],
      ["click", true],
    ]);
    expect(screenActPrompt("fill the form", 1366, 768, ["clicked name"])).toContain("- clicked name");
    expect(parseScreenSteps("Not JSON", 10, 10)).toEqual({ answer: "Not JSON", steps: [] });
  });
});
