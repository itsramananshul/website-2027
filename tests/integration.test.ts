import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { saveForm } from "../src/lib/intake/submission";
import { validateAnswers } from "../src/lib/intake/validation";
import { POST as upload, DELETE as discard } from "../src/app/api/resume-upload/route";
import { hacker, judge, sponsor } from "./fixtures";

test("existing SDK inserts, immediate Resend notifications, contact segments, and private resume transport", async (context) => {
  const rows = new Map<string, Record<string, unknown>[]>();
  const objects = new Map<string, Buffer>();
  const emails: Record<string, unknown>[] = [];
  const contacts: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost");
    const body: Buffer[] = [];
    for await (const chunk of request) body.push(Buffer.from(chunk));
    const bytes = Buffer.concat(body);
    response.setHeader("Content-Type", "application/json");
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").pop()!;
      if (request.method === "POST") {
        const row = JSON.parse(bytes.toString());
        rows.set(table, [...(rows.get(table) ?? []), { ...row, id: 1 }]);
        response.statusCode = 201;
        response.end("{}");
        return;
      }
      const path = url.searchParams.get("resume_path")?.slice(3);
      response.end(
        JSON.stringify(
          (rows.get(table) ?? [])
            .filter((row) => row.resume_path === path)
            .map((row) => ({ id: row.id })),
        ),
      );
      return;
    }
    if (url.pathname.startsWith("/storage/v1/object/")) {
      assert.equal(request.headers.apikey, "server-test-secret");
      const key = decodeURIComponent(url.pathname.replace("/storage/v1/object/", ""));
      if (request.method === "POST") {
        objects.set(key, bytes);
        response.end(JSON.stringify({ Key: key }));
        return;
      }
      if (request.method === "DELETE") {
        for (const path of JSON.parse(bytes.toString()).prefixes) objects.delete(`${key}/${path}`);
        response.end("[]");
        return;
      }
    }
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const previousEnv = { ...process.env };
  context.after(() => {
    process.env = previousEnv;
  });
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_SECRET_KEY: "server-test-secret",
    RESEND_API_KEY: "re_test_only",
    RESEND_FROM_EMAIL: "Legacy Sender <info@example.test>",
    HACKER_FROM_EMAIL: "Hacker Sender <info@example.test>",
    HACKER_SEGMENT_ID: "hacker-segment",
    JUDGE_SEGMENT_ID: "judge-segment",
    MENTOR_SEGMENT_ID: "mentor-segment",
    JUDGE_MENTOR_FROM_EMAIL: "Judge Sender <info@example.test>",
    JUDGE_MENTOR_NOTIFICATION_EMAILS: "judge-organizer@example.test,lead@example.test",
    SPONSOR_NOTIFICATION_EMAILS: "sponsor-organizer@example.test",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.resend.com/")) {
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/emails")) emails.push(body);
      else if (url.includes("/contacts")) contacts.push(body);
      else throw new Error("Unexpected provider endpoint");
      return Response.json({ id: "test-id" });
    }
    assert.ok(url.startsWith(base), "No live network requests are allowed in this test");
    return originalFetch(input, init);
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const handlers = {
    "/api/hacker-interest/notify": (await import("../src/app/api/hacker-interest/notify/route"))
      .POST,
    "/api/judge-mentor-interest/notify": (
      await import("../src/app/api/judge-mentor-interest/notify/route")
    ).POST,
    "/api/sponsor-interest/notify": (await import("../src/app/api/sponsor-interest/notify/route"))
      .POST,
  };
  const notify: typeof fetch = async (input, init) => {
    const handler = handlers[String(input) as keyof typeof handlers];
    assert.ok(handler);
    return handler(new Request(`${base}${input}`, init));
  };
  const client = createClient(base, "public-test-key", { auth: { persistSession: false } });
  const file = new File(["%PDF-1.7\nexample"], "resume.pdf", { type: "application/pdf" });
  const form = new FormData();
  form.set("resume", file);
  const response = await upload(
    new Request(`${base}/api/resume-upload`, { method: "POST", body: form }),
  );
  assert.equal(response.status, 200);
  const stored = await response.json();
  assert.match(stored.path, /^revuc-2027\/[0-9a-f-]{36}\.pdf$/);
  assert.equal(objects.size, 1);
  const saved = await saveForm(
    client,
    "hacker",
    validateAnswers("hacker", { ...hacker, major: "Computer Science", sponsorResumeConsent: true }),
    stored.path,
    notify,
  );
  assert.equal(saved.notificationWarning, "");
  const savedHacker = rows.get("hacker_interest")?.[0];
  assert.ok(savedHacker);
  assert.equal(savedHacker.resume_path, stored.path);
  assert.equal((savedHacker.extra_data as Record<string, unknown>).major, "Computer Science");
  assert.equal(emails.length, 1);
  assert.equal(emails[0].from, process.env.HACKER_FROM_EMAIL);
  assert.match(String(emails[0].html), /interest/i);
  await saveForm(client, "judge-mentor", validateAnswers("judge-mentor", judge), undefined, notify);
  await saveForm(client, "sponsor", validateAnswers("sponsor", sponsor), undefined, notify);
  assert.equal(emails.length, 5);
  assert.equal(contacts.length, 2);
  assert.deepEqual(contacts[0].segments, [{ id: "hacker-segment" }]);
  assert.deepEqual(contacts[1].segments, [{ id: "judge-segment" }, { id: "mentor-segment" }]);
  assert.ok(emails.some((mail) => mail.reply_to === "judge@example.test"));
  assert.ok(emails.some((mail) => mail.reply_to === "sponsor@example.test"));
  const linkedDelete = await discard(
    new Request(`${base}/api/resume-upload`, {
      method: "DELETE",
      body: JSON.stringify({ receipt: stored.receipt }),
    }),
  );
  assert.equal(linkedDelete.status, 200);
  assert.equal(objects.size, 1, "A saved resume must not be deleted by a cleanup receipt");
  const form2 = new FormData();
  form2.set("resume", file);
  const response2 = await upload(
    new Request(`${base}/api/resume-upload`, { method: "POST", body: form2 }),
  );
  const unsaved = await response2.json();
  assert.equal(objects.size, 2);
  assert.equal(
    (
      await discard(
        new Request(`${base}/api/resume-upload`, {
          method: "DELETE",
          body: JSON.stringify({ receipt: unsaved.receipt }),
        }),
      )
    ).status,
    200,
  );
  assert.equal(objects.size, 1, "Unattached upload cleanup removes only its own object");
  assert.equal(
    (
      await discard(
        new Request(`${base}/api/resume-upload`, {
          method: "DELETE",
          body: JSON.stringify({ receipt: "forged.receipt" }),
        }),
      )
    ).status,
    403,
  );
  const invalid = new FormData();
  invalid.set("resume", new File(["fake"], "resume.pdf", { type: "application/pdf" }));
  assert.equal(
    (await upload(new Request(`${base}/api/resume-upload`, { method: "POST", body: invalid })))
      .status,
    400,
  );
  assert.equal(
    (
      await upload(
        new Request(`${base}/api/resume-upload`, {
          method: "POST",
          headers: { "content-length": "9999999" },
          body: "oversized",
        }),
      )
    ).status,
    413,
  );
});
