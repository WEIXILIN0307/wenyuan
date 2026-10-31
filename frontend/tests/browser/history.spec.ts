import { test, expect } from "@playwright/test";

test("real browser: 60 separate keyboard edits undo and redo, then cross-paragraph replacement", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("登录令牌").fill(process.env.WENYUAN_E2E_TOKEN!);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.getByRole("button", { name: "新建文稿" }).click();
  const editor = page.getByRole("textbox", { name: "文章正文" });
  await editor.click();
  await page.keyboard.insertText("基础段落");
  await expect(page.locator(".save-state")).toContainText("已保存");
  // Alternate distant positions to create distinct real PM history groups without test hooks.
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press(i % 2 === 0 ? "Control+Home" : "Control+End");
    await page.keyboard.insertText(i % 2 === 0 ? "甲" : "乙");
  }
  const finalText = "甲".repeat(30) + "基础段落" + "乙".repeat(30);
  await expect(editor).toHaveText(finalText);
  for (let i = 0; i < 60; i++) await page.keyboard.press("Control+z");
  await expect(editor).toHaveText("基础段落");
  for (let i = 0; i < 60; i++) await page.keyboard.press("Control+Shift+z");
  await expect(editor).toHaveText(finalText);
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("第二段😀é");
  await page.locator(".ProseMirror").evaluate((el) => {
    const paragraphs = el.querySelectorAll("p");
    const range = document.createRange();
    range.setStart(paragraphs[0].firstChild!, 2);
    range.setEnd(paragraphs[1].firstChild!, 3);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText("跨段替换");
  await expect(editor).toContainText("跨段替换");
  await expect(page.locator(".save-state")).toContainText("已保存");
});
