import { test, expect } from "@playwright/test";
import { uniqueSuffix } from "../utils/helpers.js";
import { resetAuthRateLimit } from "../utils/resetAuthRateLimit.js";

test.describe("Forgot password", () => {
  test("link is visible on login and switches to the request form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();

    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByText("Reset your password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  });

  test("submitting shows a generic confirmation regardless of whether the email exists", async ({ page }) => {
    await resetAuthRateLimit();
    await page.goto("/");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.locator("#auth-email").fill(`nobody_${uniqueSuffix()}@e2e.test`);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText(/If that email is registered/)).toBeVisible();
  });

  test("has a way back to the login form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByRole("button", { name: "Back to log in" }).click();

    await expect(page.locator("#auth-email")).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  });
});

test.describe("Reset password link handling", () => {
  test("an invalid token shows a clear error instead of silently failing", async ({ page }) => {
    await page.goto(`/?reset=not-a-real-token-${uniqueSuffix()}`);

    await expect(page.getByText("Set a new password")).toBeVisible();
    await page.locator("#auth-password").fill("NewPass123!");
    await page.getByRole("button", { name: "Set new password" }).click();

    await expect(page.getByText(/invalid or has expired/)).toBeVisible();
  });
});
