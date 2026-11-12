/**
 * Sign-up list for Joyce's 25th: a Cloudflare Worker in front of one Durable
 * Object that holds the guests in SQLite. The routes and rules are in list.js.
 *
 * Why a Durable Object: it is a single place that handles one request at a
 * time and reads back exactly what it just wrote, so the number going is
 * always right, even when several people sign up in the same few seconds.
 * (Workers KV was tried first: its listings run about half a minute behind.)
 */
import { DurableObject } from "cloudflare:workers";
import { Guests, handle } from "./list.js";

export class GuestList extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.guests = new Guests(ctx.storage.sql, env.BASE_GOING);
  }
  summary() { return this.guests.summary(); }
  save(rsvp, by) { return this.guests.save(rsvp, by); }
  full() { return this.guests.full(); }
  setBase(n) { return this.guests.setBase(n); }
  remove(id) { return this.guests.remove(id); }
}

export default {
  fetch(request, env) {
    // one list for the whole party, kept in Western Europe, near the guests
    const list = env.LIST ? env.LIST.getByName("guests", { locationHint: "weur" }) : null;
    return handle(request, env, list);
  },
};
