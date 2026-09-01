import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  installAuthenticatedSession,
  installMockApi
} from "./fixtures/mock-api";

test("renders and validates the authentication experience", async ({ page }) => {
  await installMockApi(page);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 1024, height: 768 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to ExecLoom" })).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await expect(page).toHaveScreenshot(`login-${viewport.name}.png`, {
      animations: "disabled",
      maxDiffPixelRatio: 0.015
    });

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await expect(page).toHaveScreenshot(`register-${viewport.name}.png`, {
      animations: "disabled",
      maxDiffPixelRatio: 0.015
    });
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill("wrong@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.", { exact: true })).toBeVisible();

  await page.goto("/register");
  await page.getByLabel("Email").fill("taken@example.com");
  await page.getByLabel("Password", { exact: true }).fill("strong-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("An account already exists for this email.", { exact: true })).toBeVisible();
});

test("manages encrypted credential metadata and assigns it to an HTTP step", async ({
  page
}) => {
  const mock = await installMockApi(page, { seedWorkflow: true });
  await installAuthenticatedSession(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/credentials");
  await expect(page.getByRole("heading", { name: "Credentials" })).toBeVisible();
  await expect(page.getByText("No credentials", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New credential" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Production API key");
  await page.getByLabel("Header name").fill("x-production-key");
  await page.getByLabel("Secret", { exact: true }).fill("browser-only-secret");
  await page.getByRole("button", { name: "Create credential" }).click();

  await expect(page.getByText("Production API key", { exact: true })).toBeVisible();
  await expect(page.getByText("browser-only-secret", { exact: true })).toHaveCount(0);
  await hideNextPortal(page);
  await expect(page).toHaveScreenshot("credentials-desktop.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.015
  });

  await page.getByRole("link", { name: "Workflows" }).click();
  await page.getByText("API health monitor", { exact: true }).click();
  const httpNode = page.locator(".react-flow__node").filter({
    has: page.locator('[data-step-key="check-api"]')
  });
  await httpNode.click();
  await page.getByLabel("Credential").selectOption(mock.credentialId);
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const definition = mock.state.workflowDetail?.versions[0]?.definition;
  const savedHttpStep = definition?.steps.find((step) => step.key === "check-api");
  expect(savedHttpStep?.type).toBe("http");
  expect(savedHttpStep?.type === "http" ? savedHttpStep.config.credentialId : null).toBe(
    mock.credentialId
  );
  expect(JSON.stringify(definition)).not.toContain("browser-only-secret");

  await page.goto("/credentials");
  await page.getByRole("button", { name: "Edit Production API key" }).click();
  await page.getByLabel("New secret (optional)").fill("rotated-browser-secret");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Updated Production API key.", { exact: true })).toBeVisible();
  await expect(page.getByText("rotated-browser-secret", { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot("credentials-mobile.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.015
  });
});

test("registers, creates a template workflow, publishes, runs, and inspects it", async ({
  page
}) => {
  const mock = await installMockApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/register");
  await page.getByLabel("Email").fill("builder@example.com");
  await page.getByLabel("Password", { exact: true }).fill("strong-password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/workflows$/);
  await expect(page.getByText("Create your first workflow")).toBeVisible();
  await expect(page.getByRole("complementary")).toBeVisible();
  await hideNextPortal(page);
  await expect(page).toHaveScreenshot("workflow-library-empty-desktop.png", { animations: "disabled", maxDiffPixelRatio: 0.015 });

  await page.getByRole("link", { name: /API Health Check/ }).click();
  await expect(page).toHaveURL(/\/workflows\/new\?template=api-health-check/);
  await hideNextPortal(page);
  await expect(page).toHaveScreenshot("new-workflow-desktop.png", { animations: "disabled", maxDiffPixelRatio: 0.015 });
  await page.getByLabel("Name").fill("Production API check");
  await page.getByRole("button", { name: "Open editor" }).click();

  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "React Flow attribution" })).toBeVisible();
  // React Flow performs its development-only attribution visibility check one second after mount.
  await page.waitForTimeout(1_100);

  let leavePrompt = "";
  page.once("dialog", async (dialog) => {
    leavePrompt = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Back to workflows" }).click();
  expect(leavePrompt).toBe("Discard unsaved workflow changes?");
  await expect(page).toHaveURL(/\/workflows\/new\?template=api-health-check/);

  await page.getByRole("button", { name: "Add step" }).click();
  await page.locator('button[aria-label="Add Delay step"]:visible').click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByLabel("Display name").fill("Pause before completion");
  await page.getByLabel("Duration (milliseconds)").fill("1500");

  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page).toHaveURL(new RegExp(`/workflows/${mock.workflowId}$`));
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Run v1" }).click();
  await expect(page.getByRole("dialog", { name: "Run workflow" })).toBeVisible();
  await page.getByLabel("Execution input (JSON)").fill('{"requestId":"pw-e2e"}');
  await page.getByRole("button", { name: "Run version 1" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/workflows/${mock.workflowId}/executions/${mock.executionId}$`),
    { timeout: 25_000 }
  );
  await expect(page.getByText("Succeeded", { exact: true }).first()).toBeVisible({
    timeout: 7_000
  });
  await expect(page.locator('[aria-label="Succeeded"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="execution-graph"] .react-flow__node')).toHaveCount(4);
  await hideNextPortal(page);
  await expect(page).toHaveScreenshot("execution-detail-desktop.png", { animations: "disabled", maxDiffPixelRatio: 0.015 });

  await page.getByRole("link", { name: "Execution history" }).click();
  await expect(page.getByText(mock.executionId, { exact: true })).toBeVisible();
  await expect(page.getByText("v1", { exact: true }).first()).toBeVisible();
  await hideNextPortal(page);
  await expect(page).toHaveScreenshot("execution-history-desktop.png", { animations: "disabled", maxDiffPixelRatio: 0.015 });

  await page.getByRole("link", { name: "Versions" }).click();
  await expect(page).toHaveURL(new RegExp(`/workflows/${mock.workflowId}/versions$`));
  await expect(page.getByText("Version 1", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit as new draft" })).toBeVisible();
  await expect(page.locator('[data-testid="version-graph-preview"] .react-flow__node')).toHaveCount(4);
  await hideNextPortal(page);
  await expect(page).toHaveScreenshot("version-history-desktop.png", { animations: "disabled", maxDiffPixelRatio: 0.015 });

  const responsiveRoutes = [
    { name: "workflow-library", path: "/workflows", readyText: "Production API check" },
    { name: "new-workflow", path: "/workflows/new?template=api-health-check", readyText: "Create a workflow" },
    { name: "execution-history", path: `/workflows/${mock.workflowId}/executions`, readyText: "Execution history" },
    { name: "execution-detail", path: `/workflows/${mock.workflowId}/executions/${mock.executionId}`, readyText: mock.executionId },
    { name: "version-history", path: `/workflows/${mock.workflowId}/versions`, readyText: "Versions are immutable" }
  ];

  for (const viewport of [
    { name: "tablet", width: 1024, height: 768 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of responsiveRoutes) {
      await openVisualRoute(page, route.path, route.readyText, route.name !== "execution-detail");
      await expect(page.getByRole("link", { name: "ExecLoom" })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      const pageWidth = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth
      }));
      expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);

      if (viewport.name === "mobile" && route.name === "execution-detail") {
        await expect(page.getByTestId("execution-graph")).toHaveCSS("height", "240px");
      }

      if (viewport.name === "mobile" && route.name === "version-history") {
        await expect(page.getByTestId("version-graph-preview")).toHaveCSS("height", "240px");
      }

      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
        animations: "disabled",
        maxDiffPixelRatio: 0.015
      });
    }
  }
});

test("drags initialized workflow nodes without React Flow warnings", async ({ page }) => {
  const reactFlowWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("React Flow")) {
      reactFlowWarnings.push(message.text());
    }
  });

  const mock = await installMockApi(page, { seedWorkflow: true });
  await installAuthenticatedSession(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/workflows/${mock.workflowId}`);

  const node = page.locator(".react-flow__node").filter({
    has: page.locator('[data-step-key="check-api"]')
  });
  await expect(node).toBeVisible();
  const before = await node.boundingBox();
  expect(before).not.toBeNull();

  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width / 2 + 140, before!.y + before!.height / 2 + 80, {
    steps: 12
  });
  await page.mouse.up();

  const after = await node.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x).toBeGreaterThan(before!.x + 80);
  expect(after!.y).toBeGreaterThan(before!.y + 40);
  expect(reactFlowWarnings).toEqual([]);

  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const savedPosition = mock.state.workflowDetail?.versions[0]?.definition.layout?.positions[
    "check-api"
  ];
  expect(savedPosition?.x).toBeGreaterThan(360);
  expect(savedPosition?.y).toBeGreaterThan(220);
});

test("renders a nonblank workflow canvas across desktop, tablet, and mobile", async ({ page }) => {
  const mock = await installMockApi(page, { seedWorkflow: true });
  await installAuthenticatedSession(page);

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 1024, height: 768 },
    { name: "mobile", width: 390, height: 844 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openVisualRoute(page, `/workflows/${mock.workflowId}`, "API health monitor", true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 20_000 });
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

    const canvas = page.getByTestId("workflow-canvas");
    await expect(canvas).toBeVisible();
    await expectNonBlankPixels(page, canvas);
    await page.evaluate(() => window.scrollTo(0, 0));

    if (viewport.name === "mobile") {
      const appHeaderBox = await page.locator("header.sticky").boundingBox();
      const workflowHeaderBox = await page.locator("main > header").boundingBox();
      expect(appHeaderBox).not.toBeNull();
      expect(workflowHeaderBox).not.toBeNull();
      expect(appHeaderBox!.y).toBe(0);
      expect(appHeaderBox!.height).toBe(56);
      expect(workflowHeaderBox!.y).toBeGreaterThanOrEqual(appHeaderBox!.height);
    }

    await expect(page).toHaveScreenshot(`workflow-editor-${viewport.name}.png`, {
      animations: "disabled",
      maxDiffPixelRatio: 0.015
    });

    if (viewport.name === "mobile") {
      await page.getByRole("button", { name: "Add step" }).click();
      await expect(page.getByRole("dialog", { name: "Add a step" })).toBeVisible();
      await page.getByRole("button", { name: "Add Delay step" }).click();
      await expect(page.locator(".react-flow__node")).toHaveCount(4);
      await expect(page.getByRole("complementary", { name: "Configuration inspector" })).toBeVisible();
    }
  }
});

async function expectNonBlankPixels(page: Page, locator: Locator) {
  const screenshot = await locator.screenshot({ animations: "disabled" });
  const stats = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      throw new Error("Unable to inspect screenshot pixels");
    }

    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minimumLuminance = 255;
    let maximumLuminance = 0;
    let darkPixels = 0;
    let coloredPixels = 0;

    for (let index = 0; index < pixels.length; index += 16) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const luminance = (red + green + blue) / 3;
      minimumLuminance = Math.min(minimumLuminance, luminance);
      maximumLuminance = Math.max(maximumLuminance, luminance);

      if (luminance < 100) {
        darkPixels += 1;
      }

      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 18) {
        coloredPixels += 1;
      }
    }

    return {
      luminanceRange: maximumLuminance - minimumLuminance,
      darkPixels,
      coloredPixels
    };
  }, screenshot.toString("base64"));

  expect(stats.luminanceRange).toBeGreaterThan(100);
  expect(stats.darkPixels).toBeGreaterThan(150);
  expect(stats.coloredPixels).toBeGreaterThan(15);
}

async function hideNextPortal(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function openVisualRoute(page: Page, path: string, readyText: string, exact: boolean) {
  const marker = page.getByText(readyText, { exact }).first();
  await page.goto(path);

  try {
    await expect(marker).toBeVisible({ timeout: 10_000 });
  } catch {
    await page.reload();
    await expect(marker).toBeVisible({ timeout: 20_000 });
  }
}
