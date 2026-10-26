import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s) => createHash("sha256").update(String(s)).digest();
const same = (a, b) => timingSafeEqual(sha(a), sha(b));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Trình duyệt gửi mật khẩu đã encodeURIComponent (để hỗ trợ tiếng Việt có dấu trong header)
const dec = (s) => { try { return decodeURIComponent(s || ""); } catch { return s || ""; } };
const NS = { "cache-control": "no-store" };

export default async (req) => {
  const store = getStore("p5am");
  const pw = (Netlify.env.get("ADMIN_PASSWORD") || "").trim();
  const given = dec(req.headers.get("x-admin")).trim();
  const configured = pw.length > 0;
  const okPw = configured && given.length > 0 && same(given, pw);
  const url = new URL(req.url);

  if (req.method === "GET") {
    // Kiểm tra mật khẩu khi đăng nhập
    if (url.searchParams.has("check")) {
      if (configured && !okPw) await wait(800); // làm chậm dò mật khẩu
      return Response.json({ configured, ok: okPw }, { headers: NS });
    }
    const d = await store.get("state", { type: "json" });
    return Response.json(d || null, { headers: NS });
  }

  if (req.method === "POST") {
    if (!okPw) {
      if (configured) await wait(800);
      return new Response("forbidden", { status: 403 });
    }
    const b = await req.json().catch(() => null);
    if (!b || !Array.isArray(b.members) || !Array.isArray(b.events)) return new Response("bad request", { status: 400 });
    await store.setJSON("state", b);
    return Response.json({ ok: true });
  }
  return new Response("method not allowed", { status: 405 });
};
export const config = { path: "/api/state" };
