import { test, expect } from "@playwright/test";
import { makeUser, registerViaUI, loginViaUI, logoutViaUI, goToNav } from "../utils/helpers.js";

test.describe("Auth", () => {
  test("register lands on the feed, log out, and log back in with the same credentials", async ({ page }) => {
    const user = makeUser("auth");

    await test.step("register a new user", async () => {
      await registerViaUI(page, user);
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
      // Empty-state copy for a brand-new account with no posts/follows yet.
      await expect(page.getByText("Your feed is quiet.", { exact: false })).toBeVisible();
    });

    await test.step("the registered identity is reflected on the profile", async () => {
      await goToNav(page, "Profile");
      await expect(page.getByText(`@${user.username}`)).toBeVisible();
    });

    await test.step("log out returns to the auth screen", async () => {
      await logoutViaUI(page);
      await expect(page.getByText("Post your progress. Watch your project grow.")).toBeVisible();
    });

    await test.step("log back in with the same credentials", async () => {
      await loginViaUI(page, user);
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
      await goToNav(page, "Profile");
      await expect(page.getByText(`@${user.username}`)).toBeVisible();
    });
  });
});
