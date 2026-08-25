import { before, after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, resetAuthRateLimits } from "./setup.js";
import { apiRequest, registerUser, createPost, createComment } from "./helpers.js";

before(startServer);
after(stopServer);
// Same reasoning as posts.test.js — this file isn't testing the register
// rate limiter, so reset it before every test rather than let its own
// volume of registerUser calls trip it.
beforeEach(resetAuthRateLimits);

describe("PATCH /api/comments/:id", () => {
  test("author can edit a comment's content, which sets edited_at", async () => {
    const { token } = await registerUser("editcomment");
    const post = await createPost(token, { content: "post for comments" });
    const comment = await createComment(token, post.id, "original comment");

    const { status, data } = await apiRequest(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "edited comment" }),
    });
    assert.equal(status, 200);
    assert.equal(data.content, "edited comment");
    assert.ok(data.edited_at);
  });

  test("a no-op edit leaves edited_at unset and creates no history", async () => {
    const { token } = await registerUser("commentnoop");
    const post = await createPost(token, { content: "post" });
    const comment = await createComment(token, post.id, "same text");

    const { data } = await apiRequest(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "same text" }),
    });
    assert.equal(data.edited_at, null);

    const hist = await apiRequest(`/api/comments/${comment.id}/history`);
    assert.equal(hist.data.length, 0);
  });

  test("each real edit snapshots the prior content into history, most recent first", async () => {
    const { token } = await registerUser("commenthist");
    const post = await createPost(token, { content: "post" });
    const comment = await createComment(token, post.id, "v1");

    await apiRequest(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "v2" }),
    });
    await apiRequest(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "v3" }),
    });

    const { status, data } = await apiRequest(`/api/comments/${comment.id}/history`);
    assert.equal(status, 200);
    assert.equal(data.length, 2);
    assert.equal(data[0].content, "v2");
    assert.equal(data[1].content, "v1");
  });

  test("rejects empty content", async () => {
    const { token } = await registerUser("commentempty");
    const post = await createPost(token, { content: "post" });
    const comment = await createComment(token, post.id, "has text");

    const { status } = await apiRequest(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "   " }),
    });
    assert.equal(status, 400);
  });

  test("a non-owner cannot edit someone else's comment", async () => {
    const owner = await registerUser("commentOwnerA");
    const intruder = await registerUser("commentIntruderA");
    const post = await createPost(owner.token, { content: "post" });
    const comment = await createComment(owner.token, post.id, "owned comment");

    const { status } = await apiRequest(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${intruder.token}` },
      body: JSON.stringify({ content: "hijacked" }),
    });
    assert.equal(status, 404);
  });
});

describe("DELETE /api/comments/:id", () => {
  test("a non-owner cannot delete someone else's comment", async () => {
    const owner = await registerUser("commentOwnerB");
    const intruder = await registerUser("commentIntruderB");
    const post = await createPost(owner.token, { content: "post" });
    const comment = await createComment(owner.token, post.id, "keep me");

    const { status } = await apiRequest(`/api/comments/${comment.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${intruder.token}` },
    });
    assert.equal(status, 404);
  });

  test("the author can delete their own comment", async () => {
    const { token } = await registerUser("commentDeleter");
    const post = await createPost(token, { content: "post" });
    const comment = await createComment(token, post.id, "temporary");

    const del = await apiRequest(`/api/comments/${comment.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(del.status, 204);

    const list = await apiRequest(`/api/comments/post/${post.id}`);
    assert.ok(!list.data.some((c) => c.id === comment.id));
  });
});

describe("GET /api/comments/:id/history", () => {
  test("is public — no auth required, matching GET /comments/post/:postId", async () => {
    const { token } = await registerUser("commentHistPublic");
    const post = await createPost(token, { content: "post" });
    const comment = await createComment(token, post.id, "v1");
    await apiRequest(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "v2" }),
    });

    const { status, data } = await apiRequest(`/api/comments/${comment.id}/history`);
    assert.equal(status, 200);
    assert.equal(data.length, 1);
    assert.equal(data[0].content, "v1");
  });

  test("a never-edited comment has an empty history", async () => {
    const { token } = await registerUser("commentNeverEdited");
    const post = await createPost(token, { content: "post" });
    const comment = await createComment(token, post.id, "untouched");

    const { status, data } = await apiRequest(`/api/comments/${comment.id}/history`);
    assert.equal(status, 200);
    assert.deepEqual(data, []);
  });
});
