import { test, expect } from "@playwright/test";
import { makeUser, registerViaUI, publishPost, postCardByContent, uniqueSuffix } from "../utils/helpers.js";

test.describe("Post + feed", () => {
  test("a post created via the Composer appears in the author's own feed", async ({ page }) => {
    const user = makeUser("poster");
    const content = `Shipped the e2e harness itself ${uniqueSuffix()}`;

    await registerViaUI(page, user);

    await test.step("publish a post via the Composer", async () => {
      await publishPost(page, { content });
      // handlePublish's confirmation toast
      await expect(page.getByRole("status")).toHaveText("Posted.");
    });

    await test.step("the post shows up in the feed with the right author and type", async () => {
      const card = postCardByContent(page, content);
      await expect(card).toBeVisible();
      await expect(card.getByText(`@${user.username}`)).toBeVisible();
      await expect(card.getByText("update", { exact: true })).toBeVisible();
    });
  });
});
