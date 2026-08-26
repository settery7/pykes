import { test, expect } from "@playwright/test";
import { makeUser, registerViaUI, uniqueSuffix } from "../utils/helpers.js";

test.describe("Email verification banner", () => {
  test("shows after registering, and dismiss hides it", async ({ page }) => {
    const user = makeUser("verifybanner");
    await registerViaUI(page, user);

    const banner = page.locator(".verify-banner");
    await expect(banner).toBeVisible();

    await banner.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).not.toBeVisible();
  });

  test("Resend shows a confirmation", async ({ page }) => {
    const user = makeUser("verifyresend");
    await registerViaUI(page, user);

    // Not a hasText filter — clicking Resend changes the banner's own
    // text, which would stop matching a filter bound to the pre-click
    // wording. There's exactly one verify-banner on the page.
    const banner = page.locator(".verify-banner");
    await banner.getByRole("button", { name: "Resend email" }).click();

    await expect(banner).toContainText("Verification email sent");
  });
});

test.describe("Verification link handling", () => {
  test("an invalid token shows a clear error instead of silently failing", async ({ page }) => {
    const user = makeUser("verifybadlink");
    await registerViaUI(page, user);

    // Full success-path verification isn't E2E-testable without exposing
    // the real token via an API response (defeating its purpose) — see
    // backend/tests/verification.test.js for that coverage. This exercises
    // the same URL-handling code path with a token guaranteed not to match.
    await page.goto(`/?verify=not-a-real-token-${uniqueSuffix()}`);

    await expect(page.getByRole("status").filter({ hasText: /invalid or has expired/ })).toBeVisible();
    // The banner is still there afterward — an invalid link doesn't
    // silently mark the account verified.
    await expect(page.locator(".verify-banner")).toBeVisible();
  });
});
