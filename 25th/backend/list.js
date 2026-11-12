/**
 * The sign-up list for Joyce's 25th: the guests themselves, and the web
 * requests around them. Nothing Cloudflare-specific is imported here, so
 * `node worker.test.mjs` can run it as it is.
 *
 * For the invitation page (anyone):
 *   GET  /               how many are going, and who has signed up
 *   POST /               add or change one RSVP
 *
 * For Joyce (needs the list key, sent as "Authorization: Bearer <key>"):
 *   GET    /admin            the full list, messages included
 *   POST   /admin/base       set how many said yes outside the page
 *   DELETE /admin/guest?id=  remove one entry
 */

const ANSWERS = ["yes", "maybe", "no"];
export const MAX_GUESTS = 300; // the form is public: cap what anyone can write
const MAX_BODY = 4000;
const DEFAULT_ORIGINS = "https://joycesqlee.com,https://www.joycesqlee.com";
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const clean = (value, max) =>
  String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

const wholeNumber = (value) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// "Britney Jean Spears" -> "Britney S." for the list everyone can see
function publicName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || "";
  return parts[0] + " " + parts[parts.length - 1].charAt(0).toUpperCase() + ".";
}

/**
 * The guests, kept in SQLite. `sql` is a Durable Object's `ctx.storage.sql`.
 * Every method runs start to finish without waiting on anything, so two
 * people signing up at the same moment are simply handled one after the other.
 */
export class Guests {
  constructor(sql, baseFallback) {
    this.sql = sql;
    this.baseFallback = wholeNumber(baseFallback) ?? 0;
    sql.exec(`CREATE TABLE IF NOT EXISTS guests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      song TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      at INTEGER NOT NULL,
      updated INTEGER NOT NULL
    )`);
    sql.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }

  // how many said yes to Joyce directly, before or outside the page
  base() {
    const saved = this.sql.exec("SELECT value FROM settings WHERE key = 'base'").toArray()[0];
    return (saved && wholeNumber(saved.value)) ?? this.baseFallback;
  }

  // every RSVP in full, first to sign up first
  all() {
    return this.sql
      .exec("SELECT id, name, status, song, note, at, updated FROM guests ORDER BY at, rowid")
      .toArray()
      .map((g) => ({ id: g.id, name: g.name, status: g.status, song: g.song, note: g.note, at: g.at, updated: g.updated }));
  }

  // what the invitation page shows: first names only, no messages, nobody who can't come
  summary() {
    const shown = this.all().filter((g) => g.status === "yes" || g.status === "maybe");
    const base = this.base();
    return {
      ok: true,
      base,
      going: base + shown.filter((g) => g.status === "yes").length,
      maybe: shown.filter((g) => g.status === "maybe").length,
      guests: shown.map((g) => ({ name: publicName(g.name), status: g.status, song: g.song })),
    };
  }

  // what Joyce sees
  full() {
    return { ok: true, base: this.base(), guests: this.all() };
  }

  save(d) {
    if (!d || typeof d !== "object") return { status: 400, body: { ok: false, error: "Could not read that." } };
    const name = clean(d.name, 60);
    const status = ANSWERS.includes(d.status) ? d.status : "";
    if (!name || !status) return { status: 400, body: { ok: false, error: "Name and answer are needed." } };

    // the page keeps its id, so someone changing their answer updates their own entry
    let id = (typeof d.id === "string" ? d.id : "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    if (id.length < 8) id = crypto.randomUUID();

    const earlier = this.sql.exec("SELECT at FROM guests WHERE id = ?", id).toArray()[0];
    if (!earlier) {
      const count = this.sql.exec("SELECT COUNT(*) AS n FROM guests").one().n;
      if (count >= MAX_GUESTS) return { status: 429, body: { ok: false, error: "The list is full." } };
    }

    const now = Date.now();
    this.sql.exec(
      `INSERT INTO guests (id, name, status, song, note, at, updated) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, status = excluded.status,
         song = excluded.song, note = excluded.note, updated = excluded.updated`,
      id, name, status, status === "no" ? "" : clean(d.song, 120), clean(d.note, 500), earlier ? earlier.at : now, now,
    );
    return { status: 200, body: this.summary() };
  }

  setBase(n) {
    this.sql.exec(
      "INSERT INTO settings (key, value) VALUES ('base', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      String(n),
    );
    return this.full();
  }

  remove(id) {
    this.sql.exec("DELETE FROM guests WHERE id = ?", id);
    return this.full();
  }
}

function corsFor(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || DEFAULT_ORIGINS).split(",").map((s) => s.trim());
  const known = allowed.includes(origin) || LOCAL_ORIGIN.test(origin);
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (known) headers["Access-Control-Allow-Origin"] = origin;
  return { headers, known };
}

const reply = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isJoyce(request, env) {
  const sent = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return !!env.ADMIN_KEY && sameKey(sent, env.ADMIN_KEY);
}

/**
 * Answer one web request. `list` is the guest list: a `Guests`, or the
 * Durable Object that wraps one (its answers then arrive as promises).
 */
export async function handle(request, env, list) {
  const { headers, known } = corsFor(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (!list) return reply({ ok: false, error: "Sign-up list not set up." }, 503, headers);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (path === "/" && request.method === "GET") return reply(await list.summary(), 200, headers);

    if (path === "/" && request.method === "POST") {
      // browsers on other sites cannot post here; this is a courtesy lock, not security
      if (!known) return reply({ ok: false, error: "Not allowed from here." }, 403, headers);
      const raw = await request.text();
      if (raw.length > MAX_BODY) return reply({ ok: false, error: "That's too long." }, 413, headers);
      let d;
      try { d = JSON.parse(raw); } catch (e) { d = null; }
      if (!d || typeof d !== "object") return reply({ ok: false, error: "Could not read that." }, 400, headers);
      const out = await list.save({ id: d.id, name: d.name, status: d.status, song: d.song, note: d.note });
      return reply(out.body, out.status, headers);
    }

    if (path === "/admin" || path.startsWith("/admin/")) {
      if (!isJoyce(request, env)) return reply({ ok: false, error: "Wrong list key." }, 401, headers);

      if (path === "/admin" && request.method === "GET") return reply(await list.full(), 200, headers);

      if (path === "/admin/base" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const base = parseInt(body && body.base, 10);
        if (!Number.isFinite(base) || base < 0 || base > 500) return reply({ ok: false, error: "Give a number from 0 to 500." }, 400, headers);
        return reply(await list.setBase(base), 200, headers);
      }

      if (path === "/admin/guest" && request.method === "DELETE") {
        const id = String(url.searchParams.get("id") || "").replace(/[^A-Za-z0-9_-]/g, "");
        if (!id) return reply({ ok: false, error: "Which one?" }, 400, headers);
        return reply(await list.remove(id), 200, headers);
      }
    }

    return reply({ ok: false, error: "Not found." }, 404, headers);
  } catch (err) {
    console.error("sign-up list error:", err && err.stack ? err.stack : err);
    return reply({ ok: false, error: "Something went wrong. Try again." }, 500, headers);
  }
}
