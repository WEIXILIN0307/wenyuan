import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("登录令牌").fill(process.env.WENYUAN_E2E_TOKEN!);
  await page.getByRole("button", { name: "打开工作台 →" }).click();
  await expect(page.getByRole("button", { name: "＋ 新建文章" })).toBeVisible();
}
async function create(page: Page) {
  await page.getByRole("button", { name: "＋ 新建文章" }).click();
  await expect(page.getByRole("textbox", { name: "文章正文" })).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.locator(".save-state")).toContainText("已保存", {
    timeout: 15000,
  });
}

test("create, edit Chinese/emoji, heading outline, save, refresh, rename and export", async ({
  page,
}) => {
  await login(page);
  await create(page);
  const editor = page.getByRole("textbox", { name: "文章正文" });
  await editor.click();
  await page.keyboard.insertText("合成中文😀é标题");
  await page.getByLabel("段落样式").selectOption("1");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.getByLabel("段落样式").selectOption("paragraph");
  await page.keyboard.insertText("这是一篇人工构造的测试文章。");
  await saved(page);
  await expect(page.locator(".outline")).toContainText("合成中文😀é标题");
  await page.getByLabel("文章标题", { exact: true }).fill("浏览器合成验收");
  await page.getByLabel("文章标题", { exact: true }).press("Tab");
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: /浏览器合成验收/ }).click();
  await expect(editor).toContainText("这是一篇人工构造的测试文章。");
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 DOCX ↓" }).click();
  expect((await file).suggestedFilename()).toBe("浏览器合成验收.docx");
  await page.getByRole("button", { name: "分页预览", exact: true }).click();
  await expect(page.locator(".preview-page")).toHaveCount(1);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.screenshot({ path: "test-results/workbench.png", fullPage: true });
});

test("save failure is visible; local recovery survives refresh and retries", async ({
  page,
}) => {
  await login(page);
  await create(page);
  const docTitle = "异常保存合成";
  await page.getByLabel("文章标题", { exact: true }).fill(docTitle);
  await page.getByLabel("文章标题", { exact: true }).press("Tab");
  await saved(page);
  await page.route("**/api/documents/*/transactions", (route) =>
    route.abort("failed"),
  );
  await page.getByRole("textbox", { name: "文章正文" }).click();
  await page.keyboard.insertText("异常保存不能丢失的中文😀");
  await expect(page.locator(".save-state")).toContainText("保存失败");
  await page.reload();
  await page.getByRole("button", { name: new RegExp(docTitle) }).click();
  await expect(page.getByRole("textbox", { name: "文章正文" })).toContainText(
    "异常保存不能丢失的中文😀",
  );
  await page.unroute("**/api/documents/*/transactions");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await saved(page);
});

test("two tabs reject stale revisions and retain the second draft", async ({
  page,
  context,
}) => {
  await login(page);
  await create(page);
  await page.getByLabel("文章标题", { exact: true }).fill("双标签冲突合成");
  await page.getByLabel("文章标题", { exact: true }).press("Tab");
  await saved(page);
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: /双标签冲突合成/ }).click();
  await page.getByRole("textbox", { name: "文章正文" }).click();
  await page.keyboard.insertText("第一个标签页保存");
  await saved(page);
  await other.getByRole("textbox", { name: "文章正文" }).click();
  await other.keyboard.insertText("第二个标签页保留此稿");
  await expect(other.locator(".save-state")).toContainText("版本冲突");
  await expect(other.getByRole("textbox", { name: "文章正文" })).toContainText(
    "第二个标签页保留此稿",
  );
  await other.close();
});

test("paste text, simple table, image, sources and actual unavailable-model message", async ({
  page,
}) => {
  await login(page);
  await create(page);
  await page.getByRole("textbox", { name: "文章正文" }).click();
  await page.keyboard.insertText("合成阅读活动");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() =>
    navigator.clipboard.writeText("剪贴板中文😀\n粘贴第二段"),
  );
  await page.keyboard.press("Control+V");
  await expect(page.locator(".ProseMirror")).toContainText("粘贴第二段");
  await page.getByRole("button", { name: "粗体", exact: true }).click();
  await page
    .locator(".file-button input")
    .setInputFiles(resolve("../examples/synthetic.png"));
  await expect(
    page.locator('.ProseMirror img[src^="data:image/"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.ProseMirror img[src^="data:image/"]'),
  ).toHaveAttribute("width", "120");
  await expect(
    page.locator('.ProseMirror img[src^="data:image/"]'),
  ).toHaveAttribute("height", "60");
  await page.getByRole("button", { name: "粗体", exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "表格", exact: true }).click();
  await saved(page);
  await expect(page.locator(".ProseMirror table")).toHaveCount(1);
  await page.getByRole("button", { name: "资料", exact: true }).click();
  await page.getByLabel("上传资料").setInputFiles({
    name: "合成资料.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("合成阅读活动在社区图书室举行，所有内容均为演示样例。"),
  });
  await expect(page.locator(".source-card")).toContainText("合成资料.txt");
  await page.getByRole("button", { name: "查看片段/原件" }).click();
  await expect(page.locator(".chunk")).toContainText("社区图书室");
  await page.getByRole("button", { name: "✧ 写作助手" }).click();
  await page.getByLabel("写作要求").fill("根据合成阅读资料起草通知");
  await page.getByRole("button", { name: "✧ 生成修改建议" }).click();
  await expect(page.locator(".proposal")).toContainText("尚未配置模型服务");
  await expect(page.locator(".ProseMirror")).not.toContainText("假草稿");
});

test("browser IME protocol simulation and a measured long-document baseline", async ({
  page,
  context,
}) => {
  await login(page);
  await create(page);
  await page.getByRole("textbox", { name: "文章正文" }).click();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.imeSetComposition", {
    text: "中文输入",
    selectionStart: 4,
    selectionEnd: 4,
  });
  await cdp.send("Input.insertText", { text: "中文输入" });
  await saved(page);
  await expect(page.getByRole("textbox", { name: "文章正文" })).toContainText(
    "中文输入",
  );
  const sample =
    "这是合成长文，用于测量当前环境中的输入、保存与布局基线。😀".repeat(150);
  const start = Date.now();
  await page.keyboard.insertText(sample);
  await saved(page);
  const saveMs = Date.now() - start;
  const layoutStart = Date.now();
  await page.getByRole("button", { name: "分页预览", exact: true }).click();
  await expect(page.locator(".preview-page").first()).toBeVisible();
  const result = {
    browser: await page.evaluate(() => navigator.userAgent),
    font: "Noto Serif CJK SC (system)",
    utf16Length: sample.length,
    insertAndSaveMs: saveMs,
    openPreviewMs: Date.now() - layoutStart,
    pages: await page.locator(".preview-page").count(),
  };
  await test.info().attach("baseline.json", {
    body: Buffer.from(JSON.stringify(result, null, 2)),
    contentType: "application/json",
  });
  console.log("MEASURED_BASELINE", JSON.stringify(result));
});

test("HTTP simulator: preview, reject, accept, repeated text targeting and stale proposal refusal", async ({
  page,
}) => {
  await login(page);
  await create(page);
  const configured = await page.request.put("/api/provider", {
    data: {
      base_url: "http://127.0.0.1:9207/v1",
      model: "explicit-test-simulator",
      api_key: "not-a-real-secret",
      timeout: 10,
    },
  });
  expect(configured.ok()).toBeTruthy();
  await page.getByRole("textbox", { name: "文章正文" }).click();
  await page.keyboard.insertText("重复原文");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("重复原文");
  await saved(page);
  const selectLast = async () => {
    await page
      .locator(".ProseMirror p")
      .last()
      .evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
    await expect(page.locator(".selection-card")).toContainText("重复原文");
  };
  await selectLast();
  await page.getByLabel("写作任务").selectOption("rewrite");
  await page.getByLabel("写作要求").fill("测试模拟器：改写选区");
  await page.getByRole("button", { name: "✧ 生成修改建议" }).click();
  await expect(page.locator(".proposal")).toContainText("待确认");
  await expect(page.locator(".ProseMirror")).not.toContainText("模拟提供商");
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await expect(page.locator(".proposal")).toContainText("已拒绝");
  await page.getByRole("button", { name: "✧ 生成修改建议" }).click();
  await expect(page.locator(".proposal")).toContainText("待确认");
  await page.getByRole("button", { name: "确认应用" }).click();
  await expect(page.locator(".ProseMirror p").first()).toHaveText("重复原文");
  await expect(page.locator(".ProseMirror p").last()).toContainText(
    "模拟提供商",
  );
  await page
    .locator(".ProseMirror p")
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
  await page.getByLabel("写作要求").fill("测试模拟器延迟：改写选区");
  await page.getByRole("button", { name: "✧ 生成修改建议" }).click();
  await page.locator(".ProseMirror p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("人工作出的新修改");
  await saved(page);
  await expect(page.locator(".proposal")).toContainText("待确认");
  await page.getByRole("button", { name: "确认应用" }).click();
  await expect(page.locator(".error.banner")).toContainText(
    "生成期间文档已经变化",
  );
  await expect(page.locator(".ProseMirror p").first()).toContainText(
    "人工作出的新修改",
  );
});
