import { before, after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, resetAuthRateLimits } from "./setup.js";
import { apiRequest, registerUser, createPost } from "./helpers.js";

before(startServer);
after(stopServer);
// Each test registers 1-4 fresh users; well over RATE_LIMIT_MAX (10/60s per
// IP+path) across the whole file. This file isn't testing that limiter
// (api.test.js already does), so reset it before every test instead.
beforeEach(resetAuthRateLimits);

describe("POST /api/posts", () => {
  test("rejects a post with neither content nor a photo", async () => {
    const { token } = await registerUser("nopost");
    const { status, data } = await apiRequest("/api/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "   " }),
    });
    assert.equal(status, 400);
    assert.ok(data.error);
  });

  test("accepts a photo-only post with empty content", async () => {
    const { token } = await registerUser("photoonly");
    const { status, data } = await apiRequest("/api/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "", mediaUrl: "/media/pykes-media/uploads/fake.webp" }),
    });
    assert.equal(status, 201);
    assert.equal(data.content, "");
    assert.equal(data.media_url, "/media/pykes-media/uploads/fake.webp");
    assert.equal(data.edited_at, null);
  });
});

describe("PATCH /api/posts/:id", () => {
  test("author can edit content, which sets edited_at", async () => {
    const { token } = await registerUser("editpost");
    const post = await createPost(token, { content: "original" });

    const { status, data } = await apiRequest(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "changed" }),
    });
    assert.equal(status, 200);
    assert.equal(data.content, "changed");
    assert.ok(data.edited_at);
  });

  test("a no-op edit (identical content) leaves edited_at unset and creates no history", async () => {
    const { token } = await registerUser("nooppost");
    const post = await createPost(token, { content: "same content" });

    const { status, data } = await apiRequest(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "same content" }),
    });
    assert.equal(status, 200);
    assert.equal(data.edited_at, null);

    const hist = await apiRequest(`/api/posts/${post.id}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(hist.data.length, 0);
  });

  test("each real edit snapshots the prior content into history, most recent first", async () => {
    const { token } = await registerUser("histpost");
    const post = await createPost(token, { content: "v1" });

    await apiRequest(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "v2" }),
    });
    await apiRequest(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "v3" }),
    });

    const { status, data } = await apiRequest(`/api/posts/${post.id}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(status, 200);
    assert.equal(data.length, 2);
    assert.equal(data[0].content, "v2");
    assert.equal(data[1].content, "v1");
  });

  test("rejects editing to empty content when the post has no photo", async () => {
    const { token } = await registerUser("emptyeditpost");
    const post = await createPost(token, { content: "has text" });

    const { status, data } = await apiRequest(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "   " }),
    });
    assert.equal(status, 400);
    assert.ok(data.error);
  });

  test("a non-owner cannot edit someone else's post", async () => {
    const owner = await registerUser("postOwnerA");
    const intruder = await registerUser("postIntruderA");
    const post = await createPost(owner.token, { content: "owned" });

    const { status } = await apiRequest(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${intruder.token}` },
      body: JSON.stringify({ content: "hijacked" }),
    });
    assert.equal(status, 404);
  });
});

describe("DELETE /api/posts/:id", () => {
  test("a non-owner cannot delete someone else's post", async () => {
    const owner = await registerUser("postOwnerB");
    const intruder = await registerUser("postIntruderB");
    const post = await createPost(owner.token, { content: "keep me" });

    const { status } = await apiRequest(`/api/posts/${post.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${intruder.token}` },
    });
    assert.equal(status, 404);
  });

  test("the author can delete their own post, and it disappears from their post list", async () => {
    const { token, id: userId } = await registerUser("postDeleter");
    const post = await createPost(token, { content: "temporary" });

    const del = await apiRequest(`/api/posts/${post.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(del.status, 204);

    const list = await apiRequest(`/api/posts/user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.ok(!list.data.some((p) => p.id === post.id));
  });
});

describe("GET /api/posts/:id/history", () => {
  test("requires auth", async () => {
    const { token } = await registerUser("histauthpost");
    const post = await createPost(token, { content: "x" });

    const { status } = await apiRequest(`/api/posts/${post.id}/history`);
    assert.equal(status, 401);
  });

  test("a never-edited post has an empty history", async () => {
    const { token } = await registerUser("neveredited");
    const post = await createPost(token, { content: "untouched" });

    const { status, data } = await apiRequest(`/api/posts/${post.id}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(status, 200);
    assert.deepEqual(data, []);
  });
});
