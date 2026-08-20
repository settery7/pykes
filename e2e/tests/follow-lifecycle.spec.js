import { test, expect } from "@playwright/test";
import {
  makeUser,
  registerViaUI,
  publishPost,
  goToNav,
  toggleFollowInExplore,
  postCardByContent,
  toastAppeared,
  isFrameOfType,
  uniqueSuffix,
} from "../utils/helpers.js";

// Covers the fan-out-on-write feed line end to end for two real users:
// follow-time backfill, the per-user (not broadcast) new-follower WS
// notification, live fan-out of a post created after the follow, and
// unfollow-time purge. Written as one continuous journey (via test.step)
// because each stage's assertion depends on the state left by the last.
test.describe("Follow lifecycle", () => {
  test("follow backfills the feed and notifies only the followed user; unfollow purges it", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      const userA = makeUser("followerA");
      const userB = makeUser("followedB");
      const preFollowContent = `B's pre-follow update ${uniqueSuffix()}`;
      const postFollowContent = `B's new update while followed ${uniqueSuffix()}`;

      const wsB = await registerViaUI(pageB, userB);
      const wsA = await registerViaUI(pageA, userA);

      await test.step("B has an existing post before A follows them", async () => {
        await publishPost(pageB, { content: preFollowContent });
      });

      await test.step("A's feed starts empty (follows nobody yet)", async () => {
        await expect(pageA.getByText("Your feed is quiet.", { exact: false })).toBeVisible();
      });

      const followFramePromise = wsB.waitForEvent("framereceived", {
        predicate: (f) => isFrameOfType(f, "new_follower"),
        timeout: 8000,
      });

      await test.step("A follows B", async () => {
        await toggleFollowInExplore(pageA, userB.username, { expectFollowing: true });
      });

      await test.step("B gets a targeted 'started following you' toast", async () => {
        await followFramePromise;
        await expect(pageB.getByRole("status")).toHaveText(`${userA.username} started following you.`, { timeout: 5000 });
      });

      await test.step("A (the follower) does not get a toast for their own follow action", async () => {
        const appeared = await toastAppeared(pageA);
        expect(appeared, "the follower should not see a notification toast").toBe(false);
      });

      await test.step("follow-time backfill: B's pre-existing post now appears in A's feed", async () => {
        await goToNav(pageA, "Home");
        const card = postCardByContent(pageA, preFollowContent);
        await expect(card).toBeVisible();
        await expect(card.getByText(`@${userB.username}`)).toBeVisible();
      });

      await test.step("fan-out on write: a new post from B shows up in A's feed after revisiting it", async () => {
        await publishPost(pageB, { content: postFollowContent });
        // FeedScreen only fetches on mount (session/dataVersion), not live —
        // so A has to revisit the route to see posts fanned out by someone
        // else's write.
        await goToNav(pageA, "Explore");
        await goToNav(pageA, "Home");
        await expect(postCardByContent(pageA, postFollowContent)).toBeVisible();
      });

      await test.step("unfollow purges B's posts from A's feed", async () => {
        await toggleFollowInExplore(pageA, userB.username, { expectFollowing: false });
        await goToNav(pageA, "Explore");
        await goToNav(pageA, "Home");
        await expect(pageA.getByText("Your feed is quiet.", { exact: false })).toBeVisible();
        await expect(postCardByContent(pageA, preFollowContent)).toHaveCount(0);
        await expect(postCardByContent(pageA, postFollowContent)).toHaveCount(0);
      });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
