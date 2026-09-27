import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createApp } from "./app.mjs"

test("accounts, isolation, validation, consent, providers, persistence and logout", async () => {
  const temp = mkdtempSync(join(tmpdir(), "pulse-test-")),
    path = join(temp, "test.sqlite")
  let calls = []
  const providerFetch = async (url, options) => {
    calls.push({ url, options })
    return url.includes("elevenlabs")
      ? new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "audio/mpeg" },
        })
      : Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: "Educational response from test provider." }],
              },
            },
          ],
        })
  }
  let { app, db } = createApp({ databasePath: path, providerFetch })
  let server = app.listen(0, "127.0.0.1")
  await new Promise((r) => server.once("listening", r))
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(path, method = "GET", body, cookie = "", extra = {}) {
    const res = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-PulseSense-Request": "1",
        Cookie: cookie,
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = res.headers.get("content-type")?.includes("application/json")
      ? await res.json()
      : await res.arrayBuffer()
    return {
      status: res.status,
      data,
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    }
  }
  const oldKey = process.env.GEMINI_API_KEY,
    oldVoice = process.env.ELEVENLABS_API_KEY
  try {
    assert.equal((await request("/records")).status, 401)
    assert.equal(
      (
        await request("/auth/register", "POST", {
          name: "A",
          email: "a@example.com",
          password: "short",
        })
      ).status,
      400,
    )
    const a = await request("/auth/register", "POST", {
      name: "Alex",
      email: "a@example.com",
      password: "correct horse battery staple",
    })
    assert.equal(a.status, 200)
    assert.ok(a.cookie)
    const b = await request("/auth/register", "POST", {
      name: "Blair",
      email: "b@example.com",
      password: "correct horse battery staple",
    })
    assert.equal(b.status, 200)
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "a@example.com",
          password: "wrong",
        })
      ).status,
      401,
    )
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "a@example.com",
          password: "correct horse battery staple",
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await request(
          "/records",
          "POST",
          { kind: "vitals", payload: { hr: 72 } },
          a.cookie,
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    )
    assert.equal(
      (
        await request(
          "/records",
          "POST",
          { kind: "vitals", payload: { hr: 999 } },
          a.cookie,
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await request(
          "/records",
          "POST",
          { kind: "vitals", payload: {} },
          a.cookie,
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await request(
          "/records",
          "POST",
          { kind: "vitals", payload: { sbp: 80, dbp: 120 } },
          a.cookie,
        )
      ).status,
      400,
    )
    const saved = await request(
      "/records",
      "POST",
      { kind: "vitals", payload: { hr: 72, spo2: 98, note: "After resting" } },
      a.cookie,
    )
    assert.equal(saved.status, 201)
    assert.equal(
      (await request("/records", "GET", undefined, b.cookie)).data.records
        .length,
      0,
    )
    assert.equal(
      (
        await request(
          "/records/" + saved.data.record.id,
          "DELETE",
          undefined,
          b.cookie,
        )
      ).status,
      404,
    )
    assert.equal(
      (await request("/export", "GET", undefined, a.cookie)).data.records
        .length,
      1,
    )
    assert.equal(
      (
        await request(
          "/analyze",
          "POST",
          { description: "An observation about my health." },
          a.cookie,
        )
      ).status,
      403,
    )
    assert.equal(calls.length, 0)
    await request("/preferences", "PATCH", { ai: true, voice: true }, a.cookie)
    delete process.env.GEMINI_API_KEY
    assert.equal(
      (
        await request(
          "/analyze",
          "POST",
          { description: "An observation about my health." },
          a.cookie,
        )
      ).status,
      503,
    )
    process.env.GEMINI_API_KEY = "test-key"
    process.env.ELEVENLABS_API_KEY = "test-voice"
    assert.equal(
      (
        await request(
          "/analyze",
          "POST",
          {
            description: "An observation about my health.",
            image: "data:image/png;base64,YWJj",
          },
          a.cookie,
        )
      ).status,
      400,
    )
    const result = await request(
      "/analyze",
      "POST",
      { description: "An observation about my health." },
      a.cookie,
    )
    assert.equal(result.status, 200)
    assert.equal(
      result.data.record.payload.result,
      "Educational response from test provider.",
    )
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.headers["x-goog-api-key"], "test-key")
    assert.equal(
      (
        await request(
          "/speech",
          "POST",
          { text: "A moment to check in." },
          a.cookie,
        )
      ).status,
      200,
    )
    assert.equal(calls.length, 2)
    await request(
      "/preferences",
      "PATCH",
      { ai: false, voice: false },
      a.cookie,
    )
    assert.equal(
      (
        await request(
          "/speech",
          "POST",
          { text: "A moment to check in." },
          a.cookie,
        )
      ).status,
      403,
    )
    assert.equal(calls.length, 2)
    assert.ok(
      (await request("/audit", "GET", undefined, a.cookie)).data.events
        .length >= 5,
    )
    assert.equal(
      (
        await request(
          "/records/" + saved.data.record.id,
          "DELETE",
          undefined,
          a.cookie,
        )
      ).status,
      200,
    )
    assert.equal(
      (await request("/records", "GET", undefined, a.cookie)).data.records
        .length,
      1,
    )
    await request("/auth/logout", "POST", {}, a.cookie)
    assert.equal((await request("/me", "GET", undefined, a.cookie)).status, 401)
    await new Promise((r) => server.close(r))
    db.close()
    const reopened = createApp({ databasePath: path })
    db = reopened.db
    assert.equal(db.prepare("SELECT count(*) AS n FROM records").get().n, 1)
    assert.equal(db.prepare("SELECT count(*) AS n FROM users").get().n, 2)
  } finally {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = oldKey
    if (oldVoice === undefined) delete process.env.ELEVENLABS_API_KEY
    else process.env.ELEVENLABS_API_KEY = oldVoice
    await new Promise((r) => server.close(r))
    db.close()
    rmSync(temp, { recursive: true, force: true })
  }
})
