import { test, expect } from "@playwright/test";
import { makeUser, registerViaUI, publishPost, openComposer, uniqueSuffix } from "../utils/helpers.js";

// A tiny (4x4) real PNG, embedded rather than read from disk — this suite
// doesn't need a real photo, just something sharp's re-encode (in
// uploads.js) accepts. Generated via `sharp({create:...}).png().toBuffer()`.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4UREARwzEcQCR0hkBElO0AgAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Post edit", () => {
  test("editing a post's caption updates it and shows an Edited badge", async ({ page }) => {
    const user = makeUser("editor");
    const original = `Original caption ${uniqueSuffix()}`;
    const updated = `Updated caption ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content: original });

    // Not postCardByContent(original) — editing swaps the caption <p> for a
    // <textarea>, whose value isn't part of the DOM's text content, so a
    // hasText filter bound to the pre-edit text stops matching mid-flow.
    // A fresh user's feed has exactly one card, so the plain locator is
    // unambiguous throughout.
    const card = page.locator("article.post-card");
    await expect(card).toContainText(original);

    await card.getByRole("button", { name: "Post options" }).click();
    await card.getByRole("menuitem", { name: "Edit" }).click();
    await card.locator("textarea").fill(updated);
    await card.getByRole("button", { name: "Save", exact: true }).click();

    await expect(card).toContainText(updated);
    await expect(card.getByText(original)).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Edited" })).toBeVisible();
  });

  test("saving with unchanged content does not add an Edited badge", async ({ page }) => {
    const user = makeUser("noopeditor");
    const content = `Unchanged content ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content });

    const card = page.locator("article.post-card");
    await card.getByRole("button", { name: "Post options" }).click();
    await card.getByRole("menuitem", { name: "Edit" }).click();
    await card.getByRole("button", { name: "Save", exact: true }).click();

    await expect(card).toContainText(content);
    await expect(card.getByRole("button", { name: "Edited" })).toHaveCount(0);
  });

  test("post edit history shows the prior version, most recent first", async ({ page }) => {
    const user = makeUser("historyuser");
    const v1 = `History v1 ${uniqueSuffix()}`;
    const v2 = `History v2 ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content: v1 });

    const card = page.locator("article.post-card");
    await card.getByRole("button", { name: "Post options" }).click();
    await card.getByRole("menuitem", { name: "Edit" }).click();
    await card.locator("textarea").fill(v2);
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card).toContainText(v2);

    await card.getByRole("button", { name: "Edited" }).click();
    const historyDialog = page.getByRole("dialog", { name: "Post edit history" });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog).toContainText(v1);

    await historyDialog.getByRole("button", { name: "Close" }).click();
    await expect(historyDialog).not.toBeVisible();
  });
});

test.describe("Post delete", () => {
  test("deleting a post removes it from the feed", async ({ page }) => {
    const user = makeUser("deleter");
    const content = `Post to delete ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content });

    const card = page.locator("article.post-card");
    await expect(card).toContainText(content);

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Post options" }).click();
    await card.getByRole("menuitem", { name: "Delete" }).click();

    await expect(card).toHaveCount(0);
    await expect(page.getByText("Your feed is quiet.")).toBeVisible();
  });

  test("canceling the delete confirmation keeps the post", async ({ page }) => {
    const user = makeUser("keeper");
    const content = `Post to keep ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content });

    const card = page.locator("article.post-card");

    page.once("dialog", (dialog) => dialog.dismiss());
    await card.getByRole("button", { name: "Post options" }).click();
    await card.getByRole("menuitem", { name: "Delete" }).click();

    await expect(card).toContainText(content);
  });
});

test.describe("Photo-only post", () => {
  test("publishing with only a photo and no caption succeeds", async ({ page }) => {
    const user = makeUser("photopost");
    await registerViaUI(page, user);

    await openComposer(page);
    const dialog = page.getByRole("dialog", { name: "New post" });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(dialog.getByRole("button", { name: "Remove", exact: true })).toBeVisible();

    const publish = dialog.getByRole("button", { name: "Publish", exact: true });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(dialog).not.toBeVisible();

    const card = page.locator("article.post-card");
    await expect(card.locator("img.post-photo")).toBeVisible();
  });
});

test.describe("Post detail modal", () => {
  test("clicking a post's caption opens the modal with the photo up top and comments below", async ({ page }) => {
    const user = makeUser("modaluser");
    const content = `Modal test post ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content });

    const card = page.locator("article.post-card");
    await card.locator(".post-content").click();

    const modal = page.locator(".post-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(content);
    await expect(modal.getByRole("region", { name: "Comments" })).toBeVisible();

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible();
  });
});

test.describe("Comment edit", () => {
  test("editing a comment updates it and shows an Edited badge", async ({ page }) => {
    const user = makeUser("commenteditor");
    const postContent = `Post for comment edit ${uniqueSuffix()}`;
    const originalComment = `Original comment ${uniqueSuffix()}`;
    const updatedComment = `Updated comment ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content: postContent });

    const card = page.locator("article.post-card");
    await card.locator(".comment-toggle").click();
    await card.getByTestId("comment-input").fill(originalComment);
    await card.getByRole("button", { name: "Post", exact: true }).click();

    // .first() rather than filtering by comment text — same reasoning as
    // the post-edit test: editing swaps the comment's <p> for a <textarea>.
    const commentItem = card.locator(".comment-item").first();
    await expect(commentItem).toContainText(originalComment);

    await commentItem.getByRole("button", { name: "Edit comment" }).click();
    await commentItem.locator("textarea").fill(updatedComment);
    await commentItem.getByRole("button", { name: "Save", exact: true }).click();

    await expect(commentItem).toContainText(updatedComment);
    await expect(commentItem.getByRole("button", { name: "Edited" })).toBeVisible();
  });

  test("comment edit history shows the prior version", async ({ page }) => {
    const user = makeUser("commenthistory");
    const postContent = `Post for comment history ${uniqueSuffix()}`;
    const v1 = `Comment v1 ${uniqueSuffix()}`;
    const v2 = `Comment v2 ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content: postContent });

    const card = page.locator("article.post-card");
    await card.locator(".comment-toggle").click();
    await card.getByTestId("comment-input").fill(v1);
    await card.getByRole("button", { name: "Post", exact: true }).click();

    const commentItem = card.locator(".comment-item").first();
    await commentItem.getByRole("button", { name: "Edit comment" }).click();
    await commentItem.locator("textarea").fill(v2);
    await commentItem.getByRole("button", { name: "Save", exact: true }).click();
    await expect(commentItem).toContainText(v2);

    await commentItem.getByRole("button", { name: "Edited" }).click();
    const historyDialog = page.getByRole("dialog", { name: "Comment edit history" });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog).toContainText(v1);
  });
});

test.describe("Comment delete", () => {
  test("deleting a comment removes it from the thread", async ({ page }) => {
    const user = makeUser("commentdeleter");
    const postContent = `Post for comment delete ${uniqueSuffix()}`;
    const commentText = `Comment to delete ${uniqueSuffix()}`;

    await registerViaUI(page, user);
    await publishPost(page, { content: postContent });

    const card = page.locator("article.post-card");
    await card.locator(".comment-toggle").click();
    await card.getByTestId("comment-input").fill(commentText);
    await card.getByRole("button", { name: "Post", exact: true }).click();

    const commentItem = card.locator(".comment-item").filter({ hasText: commentText });
    await expect(commentItem).toBeVisible();
    await commentItem.getByRole("button", { name: "Delete comment" }).click();

    await expect(card.locator(".comment-item")).toHaveCount(0);
    await expect(card.getByText("No comments yet. Be the first!")).toBeVisible();
  });
});
