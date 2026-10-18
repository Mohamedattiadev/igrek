import { describe, expect, test } from "bun:test";
import type { ProjectListItem } from "@igrek/core";
import { CHAT, findProject, fold, has, LAST, WHERE_TYPE } from "./helper-match";

const project = (id: string, name: string, lastActivity = 0) => ({ id, name, lastActivity }) as ProjectListItem;

describe("helper matching", () => {
  test("Turkish letters fold and punctuation drops", () => {
    expect(fold("Kaldığım YERDEN, devam!")).toBe("kaldigim yerden devam");
    expect(fold("İŞ")).toBe("is");
  });

  test("intents are found by word starts", () => {
    const q = fold("Blog projemdeki son sohbeti aç");
    expect(has(q, LAST)).toBe(true);
    expect(has(q, CHAT)).toBe(true);
    expect(has(fold("Prompt'umu nereye yazacağım?"), WHERE_TYPE)).toBe(true);
    expect(has(fold("sonra bakarız"), ["son "])).toBe(false);
    const back = fold("Az önceki sohbetime nasıl dönerim?");
    expect(has(back, LAST) && has(back, CHAT)).toBe(true);
  });

  test("a project is named in full or by a part of its name", () => {
    const projects = [project("a", "my-blog"), project("b", "Project_manager_suit", 2), project("c", "tubitak-report")];
    expect(findProject(fold("my blog son sohbet"), projects)?.id).toBe("a");
    expect(findProject(fold("tubitak projesindeki session"), projects)?.id).toBe("c");
    expect(findProject(fold("manager"), projects)?.id).toBe("b");
    expect(findProject(fold("yeni sohbet başlat"), projects)).toBeUndefined();
  });
});
