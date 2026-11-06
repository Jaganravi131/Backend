/* Interview pack — Session 21: Airbnb high-level design & data model */
COURSE.prep(21, {
  deepDives: [
    {
      title: 'Deep dive: search & availability at scale — geo indexes, availability models, read paths',
      lead: 'Marketplace search is a read-heavy, approximate system sitting in front of a strict, transactional booking system. Interviewers want both halves and the seam between them.',
      points: [
        "**Geo search** turns two dimensions into a 1-D key so nearby points share prefixes: **geohash** (base-32 cells; 6 characters ≈ 1.2 km × 0.6 km), quadtrees, Google **S2** cells or Uber **H3** hexagons. Query the cell plus its neighbours — points near a boundary have different prefixes — then filter by exact distance.",
        "Search engines (Elasticsearch/OpenSearch) combine geo filters, full text, facets (price, amenities) and ranking. The index is a **read model** fed by events from the listing and booking services, never the source of truth.",
        "**Availability** is the hard filter: per-night rows are simple and indexable; compact **bitmaps** (≈ 540 bits per listing for 18 months) fit inside the search document. Every booking or calendar edit updates the read model within seconds.",
        "Search may be **stale by seconds**. The booking service re-checks availability transactionally (the source of truth) and the UI handles *no longer available* gracefully — measure how often that happens.",
        "**Sharding**: bookings by `listing_id`, so all nights of a listing live in one shard and the no-double-booking check is one local transaction; *my trips* by guest comes from a separate read model.",
        "**Caching**: popular searches (city + dates) for seconds, listing details for minutes, prices computed per request or cached briefly when dynamic pricing changes them."
      ],
      code: { lang: 'java', file: 'Geohash.java', src: code`
        public class Geohash {
            private static final String BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

            /** Interleave longitude and latitude bisection bits, 5 bits per base-32 character. */
            static String encode(double lat, double lon, int precision) {
                double[] latR = {-90, 90}, lonR = {-180, 180};
                StringBuilder sb = new StringBuilder();
                boolean lonBit = true;                                   // the first bit refines longitude
                int bits = 0, ch = 0;
                while (sb.length() < precision) {
                    double[] r = lonBit ? lonR : latR;
                    double v = lonBit ? lon : lat, mid = (r[0] + r[1]) / 2;
                    if (v >= mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch <<= 1; r[1] = mid; }
                    lonBit = !lonBit;
                    if (++bits == 5) { sb.append(BASE32.charAt(ch)); bits = 0; ch = 0; }
                }
                return sb.toString();
            }

            public static void main(String[] args) {
                System.out.println("Wikipedia test vector: " + encode(57.64911, 10.40744, 11).equals("u4pruydqqvj"));
                Object[][] places = {
                    {"Marina Beach", 13.0500, 80.2824}, {"Chennai Central", 13.0827, 80.2757},
                    {"T. Nagar", 13.0418, 80.2341}, {"Bengaluru MG Road", 12.9756, 77.6050}};
                for (Object[] p : places) System.out.printf("%-18s %s%n", p[0], encode((double) p[1], (double) p[2], 6));
            }
        }`, out: code`
        Wikipedia test vector: true
        Marina Beach       tf344z
        Chennai Central    tf346t
        T. Nagar           tf341y
        Bengaluru MG Road  tdr1vf` },
      callout: { kind: 'interview', text: "Say the seam out loud: *search is eventually consistent and optimised for recall and speed; booking is strongly consistent per listing. A guest may occasionally see a listing that was just booked, and the booking step catches it.* That one sentence shows you understand the whole system." },
      notes: [
        "The encoder reproduces the geohash test vector from Wikipedia's geohash article, and the Chennai locations share the prefix `tf34` while Bengaluru starts with `tdr1` — prefix similarity tracks proximity. The catch: two points a few metres apart on opposite sides of a cell edge share no long prefix, which is why searches always include neighbouring cells.",
        "Bitmaps make availability filtering a cheap AND with a date-range mask, but updating them requires reindexing the listing document; per-night rows in a separate availability store avoid that at the cost of a join-like lookup. Large marketplaces use both: coarse filtering in the index, exact checks in a dedicated service.",
        "Search ranking is its own discipline (learning-to-rank from conversions, reviews, price competitiveness, personalisation); in a backend interview it is enough to show where ranking sits and how it degrades when a ranking service is slow."
      ]
    }
  ],

  stretch: [
    "Implement per-night inventory in MySQL (`room_night` rows with a counter) and prove with 100 concurrent booking attempts for the same nights that exactly `capacity` succeed.",
    "Add a segment tree over the next 365 days to `BookingCalendar` for O(log D) checks, and compare it with the TreeMap sweep for 100,000 bookings.",
    "Index listings in OpenSearch with a `geo_point` and booked nights; implement *available in Goa for 12–15 December under ₹6,000 per night* and measure p99 latency on a million documents."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: room inventory with a sweep line (booking capacity)',
      lead: 'My Calendar II and III generalised: accept a stay only if no night exceeds the number of rooms, and report peak occupancy.',
      difficulty: 'Hard', minutes: 40, lc: 732, pattern: ['intervals'],
      problem: [
        "A listing type has `capacity` identical rooms (capacity 1 is a single apartment). Stays are half-open day ranges `[checkIn, checkOut)` — a guest leaving on day 5 frees the room for a guest arriving on day 5.",
        "Implement `book(start, end)`, which accepts a stay only if no night would exceed `capacity`, and `peak()`, which returns the maximum number of rooms occupied on any night so far."
      ],
      examples: [
        { in: 'capacity = ∞; stays (10,20) (50,60) (10,40) (5,15) (5,10) (25,55)\npeak() after each', out: '[1, 1, 2, 3, 3, 3]', why: "This is LeetCode 732 (My Calendar III)." },
        { in: 'capacity = 2; the same stays', out: '[true, true, true, false, true, true]', why: "(5,15) would put three guests on nights 10–14 — LeetCode 731 (My Calendar II)." },
        { in: 'capacity = 1; (1,3) then (3,5)', out: 'true, true', why: "Back-to-back stays do not overlap with half-open intervals." }
      ],
      constraints: ["`0 ≤ start < end ≤ 10⁹`", "Up to 10⁴ bookings per listing for the basic version", "Follow-up: 10⁵ bookings over a year of dates"],
      hints: [
        "Two half-open stays overlap iff `a.start < b.end && b.start < a.end`. For capacity checks you need, for each night, how many stays cover it.",
        "Record +1 at check-in and −1 at check-out in a sorted map; a running sum over the keys gives the occupancy after each date.",
        "To test a new stay: add it, sweep, and roll it back if any running sum exceeds the capacity. For O(log D) per booking, use a segment tree with range add and range max."
      ],
      approaches: [
        { name: 'Brute force per night', idea: 'For every night of the new stay, count existing stays covering it', time: 'O(nights · n) per booking', space: 'O(n)' },
        { name: 'Sweep line (TreeMap of deltas)', idea: '+1 at start, −1 at end; running sum; roll back if over capacity', time: 'O(n) per booking', space: 'O(n)' },
        { name: 'Segment tree (lazy propagation)', idea: 'Range max over [start, end) to check, then range add +1', time: 'O(log D) per booking', space: 'O(D) or dynamic' },
        { name: 'Per-night rows in the database', idea: 'Conditional counter update per night inside one transaction', time: 'O(nights) per booking', space: 'O(listings · nights)' }
      ],
      code: { lang: 'java', file: 'BookingCalendar.java', src: code`
        import java.util.*;

        public class BookingCalendar {
            private final int capacity;
            private final TreeMap<Integer, Integer> delta = new TreeMap<>();   // day -> change in occupied rooms

            BookingCalendar(int capacity) { this.capacity = capacity; }

            /** Half-open stay [start, end): accepted only if no night exceeds the capacity. */
            boolean book(int start, int end) {
                if (start >= end) throw new IllegalArgumentException("empty stay");
                delta.merge(start, 1, Integer::sum);
                delta.merge(end, -1, Integer::sum);
                int occupied = 0;
                for (int d : delta.values()) {
                    occupied += d;
                    if (occupied > capacity) {                                  // some night is over capacity
                        undo(start, end);
                        return false;
                    }
                }
                return true;
            }

            private void undo(int start, int end) {
                if (delta.merge(start, -1, Integer::sum) == 0) delta.remove(start);
                if (delta.merge(end, 1, Integer::sum) == 0) delta.remove(end);
            }

            /** Maximum rooms occupied on any night (LeetCode 732). */
            int peak() {
                int occupied = 0, best = 0;
                for (int d : delta.values()) best = Math.max(best, occupied += d);
                return best;
            }

            public static void main(String[] args) {
                int[][] stays = {{10, 20}, {50, 60}, {10, 40}, {5, 15}, {5, 10}, {25, 55}};
                BookingCalendar unlimited = new BookingCalendar(Integer.MAX_VALUE);
                List<Integer> peaks = new ArrayList<>();
                for (int[] s : stays) { unlimited.book(s[0], s[1]); peaks.add(unlimited.peak()); }
                System.out.println("peak after each booking: " + peaks);

                BookingCalendar twoRooms = new BookingCalendar(2);
                List<Boolean> accepted = new ArrayList<>();
                for (int[] s : stays) accepted.add(twoRooms.book(s[0], s[1]));
                System.out.println("2 rooms, accepted: " + accepted);

                BookingCalendar oneRoom = new BookingCalendar(1);
                System.out.println("back-to-back stays [1,3) and [3,5): " + oneRoom.book(1, 3) + " " + oneRoom.book(3, 5));

                Random rnd = new Random(732);
                for (int t = 0; t < 500; t++) {                                    // differential test per night
                    int cap = 1 + rnd.nextInt(3);
                    BookingCalendar cal = new BookingCalendar(cap);
                    List<int[]> kept = new ArrayList<>();
                    for (int i = 0; i < 15; i++) {
                        int s = rnd.nextInt(30), e = s + 1 + rnd.nextInt(8);
                        boolean fits = true;
                        for (int night = s; night < e && fits; night++) {
                            int used = 0;
                            for (int[] k : kept) if (k[0] <= night && night < k[1]) used++;
                            fits = used + 1 <= cap;
                        }
                        if (fits) kept.add(new int[] {s, e});
                        if (cal.book(s, e) != fits) throw new AssertionError("case " + t);
                    }
                }
                System.out.println("500 random sequences: sweep line == brute force per night");
            }
        }`, out: code`
        peak after each booking: [1, 1, 2, 3, 3, 3]
        2 rooms, accepted: [true, true, true, false, true, true]
        back-to-back stays [1,3) and [3,5): true true
        500 random sequences: sweep line == brute force per night` },
      pitfalls: [
        "Closed intervals: treating `[1,3]` and `[3,5]` as overlapping wrongly rejects back-to-back stays.",
        "Forgetting to roll back the deltas of a rejected booking, which silently corrupts all later checks.",
        "Using timestamps in UTC for nights: a check-in date belongs to the listing's local calendar — model nights as `LocalDate`.",
        "An O(n) sweep per booking is fine for one listing but too slow for analytics over millions — know the segment-tree alternative."
      ],
      followUps: [
        { q: "Make each booking O(log D) for a year of dates and 10⁵ bookings.",
          a: "Build a segment tree over the D days with **lazy propagation**: a range-max query over `[start, end)` tells whether any night is already at capacity, and a range-add of +1 records the booking — both O(log D). A dynamic (sparse) segment tree handles huge coordinate ranges such as epoch days without allocating every day." },
        { q: "Enforce the same rule in MySQL with concurrent requests.",
          a: "Keep per-night inventory rows `room_night(listing_id, night, booked, capacity)`. In one transaction run `UPDATE room_night SET booked = booked + 1 WHERE listing_id = ? AND night >= ? AND night < ? AND booked < capacity` and check that the affected-row count equals the number of nights — otherwise roll back. Row locks serialise conflicting bookings. For capacity 1, a unique constraint on `(listing_id, night)` in a booking-nights table is even simpler; PostgreSQL offers exclusion constraints over date ranges." },
        { q: "How would you answer *peak occupancy between two dates* for analytics?",
          a: "For a static history, prefix sums over days give occupancy per night and a sparse table or segment tree answers range-max queries quickly. For live data, the same segment tree used for bookings answers range max in O(log D)." }
      ],
      rubric: [
        "States the half-open overlap condition and why it matters for back-to-back stays.",
        "Implements the sweep correctly, including rollback on rejection.",
        "Analyses complexity and knows the segment-tree upgrade.",
        "Connects the algorithm to enforcing the rule transactionally in the database."
      ],
      notes: [
        "The differential test checks every decision against a brute-force count per night for 500 random sequences with capacities 1–3 — exactly where off-by-one errors in interval code appear.",
        "`TreeMap.merge` keeps a key whose value becomes 0, so the code removes zero entries explicitly when undoing; leftover zero deltas would be harmless for correctness but waste memory.",
        "In this course's Airbnb project the authoritative check lives in MySQL (Session 21's no-double-booking slide); the in-memory calendar is what a pricing or availability service would use to answer queries fast."
      ]
    },
    {
      type: 'design',
      title: 'Design round: Airbnb search (geo + dates + price)',
      lead: 'A senior-level design combining geo indexing, a denormalised read model, ranking and the consistency seam with booking.',
      kind: 'HLD', difficulty: 'Hard', minutes: 45,
      prompt: "Design search for an Airbnb-style marketplace: 10 million listings worldwide and 50 million searches a day (peaks about 3×). Queries look like *Goa, 12–15 December, 2 guests, under ₹6,000 a night, with a pool*. p99 latency under 300 ms, results ranked by relevance — and a listing must never be double-booked, even though search may be slightly stale.",
      stages: [
        { t: 'Requirements and estimates', ask: 'What load and freshness are we designing for?', table: { head: ['Quantity', 'Estimate'], rows: [
          ['Search QPS', '50 M / day ≈ 580 / s average, ~1,700 / s at peak'],
          ['Index size', '10 M listings × ~5 KB ≈ 50 GB per copy, plus replicas'],
          ['Availability updates', '~1 M bookings/day plus calendar edits → tens of updates per second'],
          ['Freshness target', 'Availability visible in search within a few seconds'],
          ['Latency budget', 'p99 300 ms: ~150 ms search engine, ~100 ms ranking, the rest network and rendering']
        ] } },
        { t: 'Indexing pipeline', ask: 'How does a new booking get into search?', diagram: { kind: 'flow', nodes: [
          { t: 'Listing & booking DBs', s: 'MySQL — source of truth', tone: 'purple' },
          { t: 'Outbox / CDC', s: 'events on every change', tone: 'gray' },
          { t: 'Kafka', s: 'listing-events, availability-events', tone: 'orange' },
          { t: 'Indexer', s: 'builds documents, idempotent upserts', tone: 'blue' },
          { t: 'Search cluster', s: 'geo, text, facets, availability', tone: 'green' }
        ] }, points: [
          "Documents are denormalised: location (`geo_point`), attributes, capacity, price calendar summary and availability (booked nights or monthly bitmaps).",
          "Upserts carry the source version, so out-of-order events never overwrite newer data; a periodic full rebuild repairs drift."
        ] },
        { t: 'Query path and ranking', ask: 'Walk through the query for Goa, 12–15 Dec, 2 guests, under ₹6,000, pool.', points: [
          "Filter: geo (city polygon, bounding box or `geo_distance`), guests ≤ capacity, amenity *pool*, price below the limit (on a precomputed nightly price summary), and availability (no booked night in 12–14 December).",
          "Retrieve a few hundred candidates, then **rank** them with a model using conversion history, reviews, price competitiveness, host quality and personalisation.",
          "Page with search-after cursors rather than deep offsets; cache popular query results for a few seconds.",
          "Compute exact totals (fees, taxes, length-of-stay discounts) for the top results only, in a pricing service."
        ] },
        { t: 'Availability correctness', ask: 'Search said available, but someone booked it a second ago. What happens?', points: [
          "The booking service is the **source of truth**: it checks and reserves the nights transactionally (per-night rows with conditional updates or a unique constraint) — never trusting search.",
          "During checkout, a short **hold** (expiring after, say, 10 minutes) reserves the nights while payment completes; expired holds are released.",
          "Booking events update the index within seconds; the UI explains *just booked* and suggests alternatives. Track that failure rate as a product metric."
        ] },
        { t: 'Scale, resilience and observability', ask: 'Peak traffic doubles, and the ranking service slows down. What then?', points: [
          "Shard the index (by geography with routing, or evenly by id) and add replicas for read throughput; keep regional copies close to users.",
          "Degrade gracefully: if ranking is slow, fall back to a simpler score within the latency budget rather than timing out.",
          "Monitor latency per stage, index freshness lag, zero-result rate and *booking failed: unavailable* rate; alert on freshness lag."
        ] }
      ],
      followUps: [
        { q: "How do you filter by availability for a date range across millions of listings efficiently?",
          a: "Store availability in the search document in a filter-friendly form — booked nights as a date array (so a range query with `must_not` excludes listings booked in the range), or per-month bitmaps where the check is `(bitmap & rangeMask) == 0`. Filters are cached by the engine and cheap compared with scoring. Keep the representation compact (only the next 12–18 months) and update it on every booking or calendar edit." },
        { q: "Prices vary by date, season and guest count. How do you filter by price?",
          a: "Precompute a nightly price calendar per listing and index summaries (minimum and typical nightly price, maybe per month) for coarse filtering; compute the exact total for the requested dates and guests only for the top results, in a pricing service. Show *from ₹…* in lists and the exact price on the detail and checkout pages." },
        { q: "Is it acceptable that search sometimes shows a listing that cannot be booked?",
          a: "Yes, within limits — strict consistency between a global search index and a transactional booking store would cost far more latency and availability than it is worth. Bound the staleness (stream updates within seconds), measure *booking failed due to availability*, and handle it gracefully. What is never acceptable is a double booking — that is guaranteed by the booking service alone." }
      ],
      rubric: [
        "Quantifies load, index size, freshness and the latency budget.",
        "Builds the index as an event-driven, versioned read model.",
        "Designs a query path with geo, availability, price filters and ranking.",
        "Keeps booking correctness in the transactional service, with holds and graceful UI handling.",
        "Covers scaling, graceful degradation and freshness monitoring."
      ],
      notes: [
        "This design reuses Session 21's foundations (the data model and no-double-booking rule) and adds the read side; together they form the classic CQRS split.",
        "A crisp latency budget per component is a strong signal in system-design interviews — it shows you can reason about p99 end to end.",
        "If asked about ranking in depth, describe features and feedback loops (clicks, bookings) at a high level; backend interviews rarely expect machine-learning details."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: marketplace data modelling & search',
      lead: 'Data-modelling questions about bookings, time and geography — where small mistakes become double bookings or wrong prices.',
      qa: [
        { level: 1, q: "How do you check whether two bookings overlap, and why use half-open intervals?",
          a: "With half-open intervals `[checkIn, checkOut)` two stays overlap exactly when `a.checkIn < b.checkOut && b.checkIn < a.checkOut`. Half-open ranges match how hotels work — a stay occupies the nights from check-in up to, but not including, the check-out day — so a guest leaving on the 5th and another arriving on the 5th do not conflict, and the number of nights is simply `checkOut − checkIn`. Closed intervals require awkward `±1` adjustments and invite off-by-one bugs that either reject valid back-to-back bookings or allow overlaps.",
          follow: ["How would you express the overlap check in SQL?"] },
        { level: 2, q: "How do you prevent double booking at the database level?",
          a: "Make the database enforce it, because application checks race. Options: (1) per-night rows — `booking_night(listing_id, night)` with a **unique constraint**: inserting all nights of a stay in one transaction fails if any night is taken; (2) inventory counters for multi-room listings with a conditional `UPDATE … SET booked = booked + 1 WHERE … AND booked < capacity`, checking the affected-row count; (3) `SELECT … FOR UPDATE` on the listing row to serialise bookings per listing, then check overlaps — simple, but it serialises everything for that listing; (4) on PostgreSQL, an exclusion constraint over a date range. Avoid distributed locks as the only guard: lock expiry under pauses can let two bookings through.",
          follow: ["Which option scales best for a hotel with 300 identical rooms?"] },
        { level: 2, q: "Should booking dates be stored as timestamps or as local dates? How do time zones affect check-in and check-out?",
          a: "Nights are calendar concepts **of the listing's location**, so store check-in and check-out as `LocalDate` (SQL `DATE`) together with the listing's time-zone id — not as UTC timestamps, which shift dates for users in other zones. Concrete check-in and check-out *times* (3 pm, 11 am) are local times interpreted in the listing's zone; convert to an `Instant` only for scheduling reminders or analytics. Daylight-saving changes do not affect dates, but they do affect *hours until check-in*, so compute those with `ZonedDateTime` in the listing's zone. Store creation and payment times as `Instant` in UTC.",
          follow: ["What breaks if you store check-in as midnight UTC?"] },
        { level: 2, q: "How does geohash work, and what are its edge cases?",
          a: "Geohash repeatedly halves the longitude and latitude ranges, interleaving the resulting bits (longitude first) and writing every 5 bits as one base-32 character; longer hashes mean smaller cells, and points in the same cell share a prefix. Edge cases: two nearby points on opposite sides of a cell boundary (or of the equator or prime meridian) can share no prefix at all, so proximity searches must include the 8 neighbouring cells; cells are not square and shrink in width towards the poles, so precision means different distances at different latitudes; and the antimeridian splits neighbouring places at ±180°. Always finish with an exact distance filter.",
          follow: ["Why do S2 or H3 cells behave better than geohash for some queries?"] },
        { level: 2, q: "Why use a separate search engine instead of querying MySQL?",
          a: "Marketplace search needs full-text relevance, geo queries, faceted counts, flexible filtering on many optional attributes and custom ranking — at high read rates with low latency. Relational databases can do some of this (MySQL has spatial indexes and full-text search), but combining all of it with good performance is what search engines are built for, and it lets you scale search reads independently from the transactional database. The trade-off is a second, eventually consistent copy of the data that must be fed and repaired — so treat the index as a **read model** and the database as the source of truth.",
          follow: ["When would MySQL alone be enough?"] },
        { level: 2, q: "How do you keep the search index consistent with the database?",
          a: "Never dual-write from the application (write the database, then the index): a failure between the two leaves them inconsistent forever. Publish changes through a **transactional outbox** or **change-data-capture** into Kafka, and let an indexer apply them as idempotent upserts that carry the source version (for example Elasticsearch's external versioning), so duplicates and out-of-order events cannot regress a document. Monitor freshness lag (event time versus index time), support re-indexing a single listing on demand, and run periodic full rebuilds into a new index swapped in behind an alias to repair drift.",
          follow: ["How do you rebuild a 50 GB index without downtime?"] },
        { level: 3, q: "How would you shard the booking database, and why that shard key?",
          a: "Shard by **`listing_id`**: every booking and night of a listing lives in one shard, so the no-double-booking rule remains a single-shard transaction, and listing-centric queries (a host's calendar) are local. Queries by guest (*my trips*) would have to fan out to all shards, so serve them from a separate read model keyed by `guest_id`, updated from booking events. Watch for hot listings during viral events (rare for single listings; more relevant for large hotels — split their inventory by room type). Use a directory or consistent hashing so shards can be split without rehashing everything, and keep cross-shard operations (reporting) on the analytics side.",
          follow: ["What breaks if you shard by `guest_id` instead?"] },
        { level: 3, q: "Estimate the storage needed for availability calendars, with per-night rows versus bitmaps.",
          a: "Assume 10 million listings and a booking horizon of about 540 nights (18 months). **Per-night rows**: 10 M × 540 = 5.4 billion rows; at roughly 50 bytes per row including index overhead that is about 270 GB — workable when sharded, and easy to update transactionally. **Bitmaps**: 540 bits ≈ 68 bytes per listing, so about 680 MB in total — small enough to embed in every search document and to keep fully in memory for filtering. Hence the common split: rows (or counters) for the authoritative booking store, bitmaps for search filtering, updated from events.",
          follow: ["How does the estimate change for hotels with 300 rooms of one type?"] },
        { level: 2, q: "A guest books, then immediately sees *no bookings* on their trips page. What happened, and how do you fix it?",
          a: "The write went to the primary database but the trips page read from a replica that has not caught up — missing **read-your-writes** consistency. Fixes: read from the primary for that user for a short window after a write (sticky reads), wait until the replica has applied the write before reading (MySQL can wait for a GTID set with `WAIT_FOR_EXECUTED_GTID_SET`), return the new booking in the booking response and render it optimistically, or route queries for recently written data to the primary. If *my trips* comes from an event-driven read model, show a *processing* state until the event arrives.",
          follow: ["Why not read everything from the primary?"] },
        { level: 3, q: "Design the hold that reserves nights while a guest is paying.",
          a: [
            "Create a **hold** record (listing, nights, guest, `expires_at` about 10 minutes ahead, an idempotency key) in the same transaction that reserves the nights — the per-night rows or counters treat holds like bookings.",
            "Payment success converts the hold into a confirmed booking in one transaction — guarded so an expired or released hold cannot be confirmed.",
            "Expiry: a scheduled job releases holds past `expires_at` (also checked lazily whenever the nights are queried), so abandoned checkouts free inventory automatically.",
            "Edge cases: payment success arriving after expiry (re-check availability, re-hold if possible, otherwise refund automatically); retries of the hold request (idempotency key); holds per guest limited to stop inventory hoarding.",
            "Tune the hold duration with data: too short fails real payments, too long blocks inventory."
          ],
          follow: ["What happens if the payment provider confirms after the hold expired?"] }
      ],
      notes: [
        "Date and time-zone questions look simple and catch many experienced engineers; be precise about `LocalDate` for nights and `Instant` for events.",
        "For sharding questions, always name the shard key, the queries it makes local, the queries it makes expensive, and how you serve the expensive ones.",
        "Back-of-the-envelope estimates should be quick and roughly right; state your assumptions so the interviewer can adjust them."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "Stays are half-open `[checkIn, checkOut)`. Which pair conflicts for a single apartment?",
      options: ['`[1,3)` and `[3,5)`', '`[1,4)` and `[3,5)`', '`[5,7)` and `[1,5)`', '`[2,3)` and `[3,4)`'], answer: 1,
      why: "`[1,4)` covers nights 1–3 and `[3,5)` covers nights 3–4, so night 3 is double-booked. The other pairs only touch at a boundary day." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                int[][] stays = {{1, 4}, {2, 6}, {4, 7}, {5, 8}, {7, 9}};
                TreeMap<Integer, Integer> delta = new TreeMap<>();
                for (int[] s : stays) { delta.merge(s[0], 1, Integer::sum); delta.merge(s[1], -1, Integer::sum); }
                int cur = 0, peak = 0, peakDay = -1;
                for (var e : delta.entrySet()) {
                    cur += e.getValue();
                    if (cur > peak) { peak = cur; peakDay = e.getKey(); }
                }
                System.out.println(peak + " rooms from day " + peakDay);
            }
        }`, out: '3 rooms from day 5' },
      options: ['`3 rooms from day 5`', '`3 rooms from day 4`', '`2 rooms from day 2`', '`4 rooms from day 5`'], answer: 0,
      why: "On day 4 one stay ends and another starts (net 0), so occupancy stays at 2; on day 5 a third stay begins while `[2,6)` and `[4,7)` are still running." },
    { level: 3, q: "Which shard key keeps the no-double-booking check inside a single database transaction?",
      options: ['`listing_id`', '`guest_id`', 'The booking date', 'The city'], answer: 0,
      why: "All bookings and nights of a listing then live in one shard, so overlapping stays meet in the same transaction. Guest-centric views come from a separate read model." },
    { level: 2, q: "A booking is written to the primary database, but the trips page reads from a replica and does not show it yet. Which guarantee is missing?",
      options: ['Read-your-writes consistency', 'Atomicity', 'Durability', 'Isolation between transactions'], answer: 0,
      why: "Replication lag lets a user's own write be invisible to their next read. Sticky primary reads, waiting for replication, or optimistic rendering fix it." },
    { level: 3, q: "Two places 50 metres apart can have geohashes with no common prefix. Why, and what does a proximity search do about it?",
      options: ['They lie on opposite sides of a cell boundary; search the cell and its 8 neighbours, then filter by exact distance', 'Geohash is random, so prefixes mean nothing', 'One of them must be encoded incorrectly', 'Geohash only works near the equator'], answer: 0,
      why: "Prefix sharing implies proximity, but proximity does not imply prefix sharing. Querying neighbouring cells closes the gap; the exact distance check removes false positives." }
  ]
});
