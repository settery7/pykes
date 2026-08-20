import { test, expect } from "@playwright/test";
import {
  makeUser,
  registerViaUI,
  registerViaApi,
  hydrateSession,
  createProject,
  publishPost,
  toastAppeared,
  isFrameOfType,
  uniqueSuffix,
} from "../utils/helpers.js";

// Regression test: `project_growth` is broadcast to every connected client
// (so anyone watching the project page sees it grow live), but the "Your
// garden grew." toast must only render for the project's *owner*
// (App.jsx checks `project.owner_id === session.user.id`). Before this
// session's fix, the toast fired for every connected user regardless of
// ownership.
test.describe("Garden growth ownership", () => {
  test("only the project owner sees the growth toast; an unrelated logged-in user does not", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const otherCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const otherPage = await otherCtx.newPage();

    try {
      const owner = makeUser("owner");
      const other = makeUser("other");
      const projectName = `Garden ${uniqueSuffix()}`;

      // "Other" is an incidental actor here: just some other logged-in
      // user, unrelated to owner's project. Seed via API and hydrate the
      // browser session directly — faster and keeps this test focused on
      // the toast-ownership behavior rather than re-driving the auth form.
      const otherSession = await registerViaApi(otherCtx.request, other);
      const otherWs = await hydrateSession(otherPage, otherSession);

      await registerViaUI(ownerPage, owner);
      await createProject(ownerPage, { name: projectName, description: "growth ownership regression" });

      // Set up the "other" user's frame listener BEFORE the action that
      // triggers the broadcast, so we can't miss it.
      const growthFramePromise = otherWs.waitForEvent("framereceived", {
        predicate: (f) => isFrameOfType(f, "project_growth"),
        timeout: 8000,
      });

      await test.step("owner publishes a 'shipped' post against their project", async () => {
        await publishPost(ownerPage, {
          content: `Shipped it ${uniqueSuffix()}`,
          postType: "shipped",
          projectName,
        });
      });

      await test.step("owner sees the growth toast", async () => {
        await expect(ownerPage.getByRole("status")).toHaveText("Your garden grew.", { timeout: 5000 });
      });

      await test.step("the other user's socket receives the broadcast, but shows no toast", async () => {
        // Proves the broadcast really reached this client (so a "no toast"
        // result below is a real pass, not just an untriggered listener).
        await growthFramePromise;
        const appeared = await toastAppeared(otherPage);
        expect(appeared, "a non-owner should not see the growth toast").toBe(false);
      });
    } finally {
      await ownerCtx.close();
      await otherCtx.close();
    }
  });
});
