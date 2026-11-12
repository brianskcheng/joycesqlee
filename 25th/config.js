/* Party details the scripts need. The words on the page live in index.html. */
window.PARTY = {
  title: "Joyce's 25th Birthday",
  // 7:00pm UK time on Saturday 5 December 2026 (the UK is on GMT in December)
  start: "2026-12-05T19:00:00Z",
  // 3 hours of karaoke (TBC)
  end: "2026-12-05T22:00:00Z",
  venue: "Central Karaoke",
  address: "64 Park Row, Bristol, BS1 5LE",
  calendarNote:
    "Dinner & karaoke from 7:00pm. 3 hours of karaoke (TBC). Dinner is ordered at the karaoke. Dress code: Y2K party theme.",

  rsvp: {
    // People who said yes to Joyce before this page existed. They are counted
    // in "going so far" but are not on the sign-up list. Joyce can change the
    // number from her list page (list/); this is only what shows until the
    // sign-up list answers.
    baseGoing: 15,
    // Where sign-ups are saved and counted: the worker in backend/.
    // Left empty, the form sends the RSVP as a WhatsApp message instead.
    endpoint: "https://joyce-25th-rsvp.brianskcheng.workers.dev",
    // Optional: a WhatsApp number in international format without "+" or
    // spaces (e.g. "447700900123") so RSVPs open straight in that chat.
    // Left empty, the guest picks the chat themselves.
    whatsapp: "",
  },
};
