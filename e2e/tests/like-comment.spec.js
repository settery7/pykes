import { test, expect } from "@playwright/test";
import { makeUser, registerViaUI, publishPost, postCardByContent, uniqueSuffix } from "../utils/helpers.js";

test.describe("Like", () => {
  test("liking and unliking a post toggles the count and state", async ({ page }) => {
    const user = makeUser("liker");
    const content = `Post to like ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content });

    const card = postCardByContent(page, content);
    const likeBtn = card.getByRole("button", { name: /Like this post/ });

    await expect(likeBtn).toBeVisible();
    await expect(likeBtn).toHaveAttribute("aria-pressed", "false");
    await expect(likeBtn).toContainText("0");

    await likeBtn.click();

    const likedBtn = card.getByRole("button", { name: /Unlike this post/ });
    await expect(likedBtn).toHaveAttribute("aria-pressed", "true");
    await expect(likedBtn).toContainText("1");

    // Toggling back off is the actual point of this test — the button used
    // to permanently disable itself once liked, with no way to undo it.
    await likedBtn.click();

    const unlikedBtn = card.getByRole("button", { name: /Like this post/ });
    await expect(unlikedBtn).toHaveAttribute("aria-pressed", "false");
    await expect(unlikedBtn).toContainText("0");
  });
});

test.describe("Comment", () => {
  test("a new comment appears in the thread with the correct author", async ({ page }) => {
    const user = makeUser("commenter");
    const content = `Post to comment on ${uniqueSuffix()}`;
    const commentText = `Nice work! ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content });

    const card = postCardByContent(page, content);
    // Not a `/comment/i` name regex — this test's own username
    // ("commenter_...") also matches that pattern via the author-name and
    // avatar buttons in the card, which is a strict-mode violation. The
    // `.comment-toggle` class is the stable, unambiguous hook.
    await card.locator(".comment-toggle").click();

    await expect(card.getByText("No comments yet. Be the first!")).toBeVisible();

    await card.getByTestId("comment-input").fill(commentText);
    await card.getByRole("button", { name: "Post", exact: true }).click();

    const commentItem = card.locator(".comment-item").filter({ hasText: commentText });
    await expect(commentItem).toBeVisible();
    await expect(commentItem.locator(".comment-author")).toHaveText(user.username);
    await expect(card.getByRole("button", { name: "1 comment", exact: true })).toBeVisible();
  });
});
