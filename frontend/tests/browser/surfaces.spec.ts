import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

async function login(page: Page) {
  const token = execFileSync(
    resolve("../backend/.venv/bin/python"),
    [
      "-m",
      "wenyuan.manage",
      "create-user",
      "--name",
      `surface-${randomUUID()}`,
    ],
    {
      cwd: resolve("../backend"),
      env: { ...process.env, WENYUAN_DATA: process.env.WENYUAN_E2E_DATA },
      encoding: "utf8",
    },
  ).trim();
  await page.goto("/");
  await page.getByLabel("登录令牌").fill(token);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
}

test("template catalog, real knowledge upload/search/original and reference attachment persist", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "模板库", exact: true }).click();
  await expect(page.locator(".catalog-card")).toHaveCount(4);
  await page.getByLabel("搜索模板").fill("通用文章");
  await expect(page.locator(".catalog-card")).toHaveCount(1);
  await page.getByRole("button", { name: "查看详情" }).click();
  await expect(page.getByRole("dialog")).toContainText("模板");
  await page.getByRole("button", { name: "关闭详情" }).click();
  await page.getByLabel("搜索模板").fill("");
  await page.getByRole("button", { name: "使用通知模板" }).click();
  await page
    .getByLabel("文章标题", { exact: true })
    .fill("知识库浏览器合成通知");
  await page.getByLabel("文章标题", { exact: true }).press("Tab");
  await expect(page.locator(".save-state")).toContainText("已保存");
  await page.getByRole("link", { name: "知识库", exact: true }).click();
  await page.getByRole("button", { name: "新建知识库", exact: true }).click();
  await page.getByLabel("知识库名称").fill("浏览器合成资料库");
  await page.getByLabel("用途说明").fill("仅为自动测试人工构造的资料");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByLabel("上传知识资料").setInputFiles({
    name: "合成阅读依据.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "合成阅读活动在社区图书室举行，现场报名，不收费。全部为人工编写的测试资料。",
    ),
  });
  await expect(page.locator(".knowledge-table")).toContainText("可检索");
  await page.getByRole("button", { name: "检索资料库", exact: true }).click();
  await page.getByLabel("知识库检索关键词").fill("社区图书室");
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await page.getByRole("button", { name: /打开原始片段/ }).click();
  await expect(
    page.locator(".knowledge-inspector .chunk.focused"),
  ).toContainText("现场报名");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载原件", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("合成阅读依据.txt");
  await page.getByRole("button", { name: "添加到当前文稿" }).click();
  await expect(page.getByRole("status")).toContainText("已添加引用副本");
  await page.getByRole("button", { name: /前往写作工作台/ }).click();
  await page.getByRole("button", { name: "资料", exact: true }).click();
  await expect(page.locator(".source-card")).toContainText(
    "来自知识库：浏览器合成资料库",
  );
  await page.getByRole("button", { name: "查看片段/原件" }).click();
  await expect(page.locator(".panel-body .chunk")).toContainText("社区图书室");
  await page.reload();
  await page.getByRole("link", { name: "知识库", exact: true }).click();
  await expect(page.locator(".knowledge-table")).toContainText(
    "合成阅读依据.txt",
  );
  await page.getByRole("link", { name: "模板库", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("link", { name: "知识库", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("Good AI retains the selected target and request across views; preview confirms through the existing transaction", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "新建文稿" }).click();
  await page.getByRole("textbox", { name: "文章正文" }).click();
  await page.keyboard.insertText("导航切换仍保留的合成原文");
  await expect(page.locator(".save-state")).toContainText("已保存");
  await page.locator(".ProseMirror p").evaluate((el) => {
    el.closest<HTMLElement>("[contenteditable]")!.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect(page.locator(".selection-card")).toContainText("合成原文");
  await page.getByRole("link", { name: "Good AI", exact: true }).click();
  await expect(page.locator(".good-ai-mode .selection-card")).toBeVisible();
  await page.getByLabel("写作任务").selectOption("rewrite");
  await page.getByLabel("写作要求").fill("测试模拟器：简明改写选区");
  await page.getByRole("link", { name: "模板库", exact: true }).click();
  await page.getByRole("link", { name: "Good AI", exact: true }).click();
  await expect(page.getByLabel("写作要求")).toHaveValue(
    "测试模拟器：简明改写选区",
  );
  const configured = await page.request.put("/api/provider", {
    data: {
      base_url: "http://127.0.0.1:9207/v1",
      model: "explicit-test-simulator",
      timeout: 10,
    },
  });
  expect(configured.ok()).toBeTruthy();
  let requests = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/proposals$/.test(r.url())) requests++;
  });
  const composer = page.getByLabel("写作要求");
  await composer.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  await composer.press("Shift+Enter");
  expect(requests).toBe(0);
  await composer.press("Enter");
  await expect(page.locator(".proposal")).toContainText("待确认");
  expect(requests).toBe(1);
  const box = (await page.locator(".assistant-composer").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(1000);
  await page.getByRole("button", { name: "资料", exact: true }).click();
  await expect(page.locator(".writer-context-host .panel-body")).toContainText(
    "资料与依据",
  );
  await expect(page.locator(".proposal")).toBeVisible();
  await page.getByRole("button", { name: "写作助手", exact: true }).click();
  await page.getByRole("button", { name: "返回正文选取文字 →" }).click();
  await expect(page.getByRole("textbox", { name: "文章正文" })).toHaveText(
    "导航切换仍保留的合成原文",
  );
  await page.getByRole("link", { name: "Good AI", exact: true }).click();
  await page.getByRole("button", { name: "确认应用" }).click();
  await expect(page.locator(".proposal")).toContainText("已应用");
  await page.getByRole("link", { name: "写作工作台", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "文章正文" })).toContainText(
    "模拟提供商",
  );
  await page.getByRole("textbox", { name: "文章正文" }).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("手工补充");
  await expect(page.locator(".save-state")).toContainText("已保存");
  await page.getByRole("link", { name: "模板库", exact: true }).click();
  await page.getByRole("link", { name: "写作工作台", exact: true }).click();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "文章正文" }),
  ).not.toContainText("手工补充");
  await expect(page.getByRole("textbox", { name: "文章正文" })).toContainText(
    "模拟提供商",
  );
});
