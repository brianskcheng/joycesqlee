// Runs the sign-up list against an in-memory SQLite database:  node worker.test.mjs
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Guests, handle, MAX_GUESTS } from "./list.js";

// stands in for a Durable Object's ctx.storage.sql
function fakeSql() {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    exec(query, ...bindings) {
      const rows = db.prepare(query).all(...bindings);
      return {
        toArray: () => rows,
        one() {
          if (rows.length !== 1) throw new Error("expected exactly one row, got " + rows.length);
          return rows[0];
        },
      };
    },
  };
}

const SITE = "https://joycesqlee.com";
const sql = fakeSql();
const env = { ADMIN_KEY: "list-key-123", BASE_GOING: "15" };
const list = new Guests(sql, env.BASE_GOING);
const stored = () => sql.db.prepare("SELECT COUNT(*) AS n FROM guests").get().n;

const call = async (path, { method = "GET", body, origin = SITE, key, on = list } = {}) => {
  const headers = { Origin: origin };
  if (key) headers.Authorization = "Bearer " + key;
  const res = await handle(new Request("https://api.test" + path, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env, on);
  return { status: res.status, cors: res.headers.get("Access-Control-Allow-Origin"), data: res.status === 204 ? null : await res.json() };
};

// empty list starts from the 15 who had already said yes
let r = await call("/");
assert.equal(r.status, 200);
assert.equal(r.cors, SITE);
assert.deepEqual(r.data, { ok: true, base: 15, going: 15, maybe: 0, guests: [] });

// preflight
assert.equal((await call("/", { method: "OPTIONS" })).status, 204);

// bad sign-ups are refused
assert.equal((await call("/", { method: "POST", body: { name: "", status: "yes" } })).status, 400);
assert.equal((await call("/", { method: "POST", body: { name: "A", status: "definitely" } })).status, 400);
assert.equal((await call("/", { method: "POST", body: "not json" })).status, 400);
assert.equal((await call("/", { method: "POST", body: "[1,2]" })).status, 400);
assert.equal((await call("/", { method: "POST", body: { name: "A", status: "yes", note: "x".repeat(5000) } })).status, 413);
r = await call("/", { method: "POST", body: { name: "Mallory", status: "yes" }, origin: "https://evil.example" });
assert.equal(r.status, 403);
assert.equal(r.cors, null);
assert.equal(stored(), 0);

// a yes, a maybe and a no
r = await call("/", { method: "POST", body: { id: "guest-0001", name: "Britney Jean Spears", status: "yes", song: "Toxic", note: "Happy birthday!" } });
assert.equal(r.status, 200);
assert.equal(r.data.going, 16);
assert.deepEqual(r.data.guests, [{ name: "Britney S.", status: "yes", song: "Toxic" }]);
await call("/", { method: "POST", body: { id: "guest-0002", name: "Kylie", status: "maybe", song: "Spinning Around" } });
r = await call("/", { method: "POST", body: { id: "guest-0003", name: "Nelly", status: "no", song: "ignored", note: "so sorry" } });
assert.equal(r.data.going, 16);
assert.equal(r.data.maybe, 1);
assert.deepEqual(r.data.guests.map((g) => g.name), ["Britney S.", "Kylie"]); // people who can't come are not shown publicly
assert.equal(JSON.stringify(r.data).includes("so sorry"), false); // nor are messages
assert.equal((await call("/")).data.going, 16);

// the same guest changing their answer updates their entry instead of adding one
r = await call("/", { method: "POST", body: { id: "guest-0002", name: "Kylie", status: "yes", song: "Spinning Around" } });
assert.equal(r.data.going, 17);
assert.equal(r.data.maybe, 0);
assert.equal(stored(), 3);
assert.deepEqual(r.data.guests.map((g) => g.name), ["Britney S.", "Kylie"]); // and keeps their place in the queue

// odd input is tidied, never trusted
r = await call("/", { method: "POST", body: { id: { $ne: 1 }, name: "  Robert'); DROP TABLE guests;--\n\tJr ", status: "maybe", song: 42, note: ["x"] } });
assert.equal(r.status, 200);
assert.equal(r.data.guests.at(-1).name, "Robert'); J.");
assert.equal(stored(), 4);
const odd = list.all().at(-1);
assert.deepEqual([odd.name, odd.song, odd.note], ["Robert'); DROP TABLE guests;-- Jr", "42", "x"]);
assert.match(odd.id, /^[0-9a-f-]{36}$/); // an unusable id is replaced with a fresh one
list.remove(odd.id);

// several people signing up at once are all counted
await Promise.all([1, 2, 3, 4, 5].map((i) => call("/", { method: "POST", body: { id: "rush-000" + i, name: "Rush " + i, status: "yes" } })));
assert.equal((await call("/")).data.going, 22);
for (let i = 1; i <= 5; i++) list.remove("rush-000" + i);

// Joyce's list needs the key
assert.equal((await call("/admin")).status, 401);
assert.equal((await call("/admin", { key: "wrong-key-xxx" })).status, 401);
assert.equal((await call("/administrator", { key: env.ADMIN_KEY })).status, 404);
r = await call("/admin", { key: env.ADMIN_KEY });
assert.equal(r.status, 200);
assert.equal(r.data.base, 15);
assert.deepEqual(r.data.guests.map((g) => [g.name, g.status, g.song, g.note]), [
  ["Britney Jean Spears", "yes", "Toxic", "Happy birthday!"],
  ["Kylie", "yes", "Spinning Around", ""],
  ["Nelly", "no", "", "so sorry"],
]);

// she corrects the "told me directly" number
assert.equal((await call("/admin/base", { method: "POST", body: { base: 12 } })).status, 401);
assert.equal((await call("/admin/base", { method: "POST", body: { base: -3 }, key: env.ADMIN_KEY })).status, 400);
r = await call("/admin/base", { method: "POST", body: { base: 12 }, key: env.ADMIN_KEY });
assert.equal(r.data.base, 12);
assert.equal(r.data.guests.length, 3);
assert.equal((await call("/")).data.going, 14);
r = await call("/admin/base", { method: "POST", body: { base: 0 }, key: env.ADMIN_KEY });
assert.equal((await call("/")).data.going, 2); // zero is a real answer, not "use the default"
await call("/admin/base", { method: "POST", body: { base: 12 }, key: env.ADMIN_KEY });

// and removes a duplicate
assert.equal((await call("/admin/guest?id=guest-0002", { method: "DELETE" })).status, 401);
assert.equal((await call("/admin/guest", { method: "DELETE", key: env.ADMIN_KEY })).status, 400);
r = await call("/admin/guest?id=guest-0002", { method: "DELETE", key: env.ADMIN_KEY });
assert.deepEqual(r.data.guests.map((g) => g.name), ["Britney Jean Spears", "Nelly"]);
r = await call("/");
assert.equal(r.data.going, 13);
assert.deepEqual(r.data.guests.map((g) => g.name), ["Britney S."]);

// the list survives a restart (a new Guests over the same database)
assert.equal(new Guests(sql, "15").summary().going, 13);

// the list cannot be flooded
for (let i = 0; i < MAX_GUESTS + 20; i++) r = await call("/", { method: "POST", body: { id: "bulk-" + String(i).padStart(4, "0"), name: "G" + i, status: "yes" } });
assert.equal(r.status, 429);
assert.equal(stored(), MAX_GUESTS);
// ...but someone already on it can still change their answer
assert.equal((await call("/", { method: "POST", body: { id: "guest-0001", name: "Britney Jean Spears", status: "maybe" } })).status, 200);

assert.equal((await call("/nope")).status, 404);
assert.equal((await call("/", { on: null })).status, 503); // not connected
console.log("worker: all checks pass");
