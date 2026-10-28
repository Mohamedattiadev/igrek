import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { saveUpload, unzip } from "./chat-uploads";

/** A zip as Office writes it: deflated entries, a central directory, the end record. */
function zip(files: Record<string, string>, deflate = true): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content);
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const folder = () => mkdtempSync(join(tmpdir(), "igrek-upload-"));

describe("files added to a chat", () => {
  test("a zip is read whether its parts are stored or deflated", () => {
    expect(new TextDecoder().decode(unzip(zip({ "a.txt": "plain" }, false)).get("a.txt"))).toBe("plain");
    expect(new TextDecoder().decode(unzip(zip({ "b.xml": "<x>deflated</x>" })).get("b.xml"))).toBe("<x>deflated</x>");
    expect(unzip(new Uint8Array([1, 2, 3])).size).toBe(0);
  });

  test("an Excel transcript gets a CSV per sheet that Claude can add up", () => {
    const xlsx = zip({
      "xl/workbook.xml": '<workbook><sheets><sheet name="Fall 2025" sheetId="1"/></sheets></workbook>',
      "xl/sharedStrings.xml": "<sst><si><t>Course</t></si><si><t>ECTS</t></si><si><t>Math, I</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>6</v></c></row></sheetData></worksheet>',
    });
    const saved = saveUpload(folder(), "transcript.xlsx", xlsx);
    expect(saved.readable).toHaveLength(1);
    expect(saved.readable[0]).toEndWith("transcript.xlsx.Fall 2025.csv");
    expect(readFileSync(saved.readable[0] ?? "", "utf8")).toBe('Course,ECTS\n"Math, I",,6');
  });

  test("a Word file gets its text, paragraphs on lines, table cells split by tabs", () => {
    const docx = zip({
      "word/document.xml":
        "<w:document><w:body><w:p><w:r><w:t>Grades &amp; credits</w:t></w:r></w:p>" +
        "<w:tbl><w:tr><w:tc><w:p><w:t>Physics</w:t></w:p></w:tc><w:tc><w:p><w:t>5</w:t></w:p></w:tc></w:tr></w:tbl></w:body></w:document>",
    });
    const saved = saveUpload(folder(), "notes.docx", docx);
    expect(readFileSync(saved.readable[0] ?? "", "utf8")).toContain("Grades & credits");
    expect(readFileSync(saved.readable[0] ?? "", "utf8")).toContain("Physics");
  });

  test("a PDF or text is kept as it is; a name cannot leave the chat's folder; empty is refused", () => {
    const dir = folder();
    const saved = saveUpload(dir, "../../etc/passwd", new TextEncoder().encode("x"));
    expect(saved.path.startsWith(dir)).toBe(true);
    expect(saved.readable).toEqual([]);
    expect(() => saveUpload(dir, "e.txt", new Uint8Array(0))).toThrow(/empty/);
  });
});
