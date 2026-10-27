import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s) => createHash("sha256").update(String(s)).digest();
const same = (a, b) => timingSafeEqual(sha(a), sha(b));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = (s) => { try { return decodeURIComponent(s || ""); } catch { return s || ""; } };
const NS = { "cache-control": "no-store" };
const str = (v, n) => String(v == null ? "" : v).slice(0, n);

// Quỹ team: ai cũng xem được; chỉ quản trị (ADMIN_PASSWORD) hoặc thủ quỹ (TREASURER_PASSWORD) được ghi.
export default async (req) => {
  const store = getStore({ name: "p5am", consistency: "strong" });
  if (req.method === "GET") {
    const d = await store.get("fund", { type: "json" });
    return Response.json(d || null, { headers: NS });
  }
  if (req.method === "POST") {
    const given = dec(req.headers.get("x-admin")).trim();
    const ap = (Netlify.env.get("ADMIN_PASSWORD") || "").trim();
    const tp = (Netlify.env.get("TREASURER_PASSWORD") || "").trim();
    const ok = given.length > 0 && ((ap && same(given, ap)) || (tp && same(given, tp)));
    if (!ok) { await wait(800); return new Response("forbidden", { status: 403 }); }

    const b = await req.json().catch(() => null);
    if (!b || !Array.isArray(b.tx) || b.tx.length > 20000) return new Response("bad request", { status: 400 });
    if (b.open != null && !(typeof b.open.ym === "string" && /^\d{4}-\d{2}$/.test(b.open.ym) && Number.isFinite(b.open.amt))) return new Response("bad request", { status: 400 });

    const cur = await store.get("fund", { type: "json" });
    const curRev = (cur && cur.rev) || 0;
    if ((b.rev || 0) !== curRev) return new Response("conflict", { status: 409 }); // người khác vừa cập nhật

    const tx = [];
    for (const t of b.tx) {
      if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || "") || (t.type !== "thu" && t.type !== "chi") || !Number.isFinite(t.amt) || t.amt < 0)
        return new Response("bad request", { status: 400 });
      tx.push({ id: str(t.id, 40), date: t.date, type: t.type, cat: str(t.cat, 20), amt: Math.round(t.amt), note: str(t.note, 200), who: str(t.who, 80), ts: Number(t.ts) || 0, upd: Number(t.upd) || 0 });
    }
    const out = { open: b.open ? { ym: b.open.ym, amt: Math.round(b.open.amt) } : null, tx, rev: curRev + 1, upd: Date.now() };
    await store.setJSON("fund", out);
    return Response.json({ ok: true, rev: out.rev });
  }
  return new Response("method not allowed", { status: 405 });
};
export const config = { path: "/api/fund" };
