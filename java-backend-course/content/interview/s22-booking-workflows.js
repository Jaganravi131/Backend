/* Interview pack — Session 22: Booking workflows, sagas & the outbox */
COURSE.prep(22, {
  deepDives: [
    {
      title: 'Deep dive: distributed transactions — 2PC, sagas, outbox and the exactly-once illusion',
      lead: 'A booking touches inventory, payments and notifications in different services. How you keep them consistent is one of the most-asked senior topics.',
      diagram: { kind: 'seq', actors: ['Orchestrator', 'Inventory', 'Payments', 'Booking'], msgs: [
        [0, 1, 'hold nights (bookingId)'], [1, 0, 'held', 'r'],
        [0, 2, 'charge (idempotency key = bookingId)'], [2, 0, 'declined', 'r'],
        [0, 1, 'release nights — compensation'], [1, 0, 'released', 'r'],
        [0, 3, 'mark CANCELLED (reason: payment declined)']
      ] },
      table: { head: ['', 'Two-phase commit', 'Saga — orchestration', 'Saga — choreography'], rows: [
        ['Consistency', 'Atomic across participants', 'Eventual; compensations undo', 'Eventual; compensations undo'],
        ['Availability', 'Blocks if the coordinator fails after *prepare*', 'Each step independent', 'Each step independent'],
        ['Coupling', 'All participants must support XA', 'Services know the orchestrator\'s commands', 'Services know each other\'s events'],
        ['Visibility of the flow', 'Implicit in the coordinator', 'Explicit state machine — easy to trace and test', 'Implicit — spread across services'],
        ['Use when', 'Rarely between services; inside one database', 'More than ~3 steps, complex error paths', 'Few steps, simple reactions']
      ] },
      points: [
        "**Two-phase commit** asks every participant to *prepare* and then *commit*. It is blocking — if the coordinator dies after prepare, participants hold locks until it returns — and most brokers and HTTP services cannot take part anyway.",
        "A **saga** is a sequence of local transactions; when a step fails, the completed steps are undone by **compensating** transactions (release nights, refund), in reverse order.",
        "Saga steps must be **idempotent** and compensations **retryable**: messages are redelivered, and a compensation may even arrive before the step it undoes (store a tombstone so the late step is ignored).",
        "Isolation is weaker than ACID: other requests can see intermediate states. Countermeasures include **semantic locks** (a `PENDING` status others respect), commutative updates and re-reading values before acting.",
        "The **transactional outbox** makes *update the database and publish an event* atomic; an **inbox** (processed-message ids) makes consumption idempotent — together, effectively-once processing on top of at-least-once delivery.",
        "Timeouts create **unknown outcomes**. Never assume failure: query the participant by idempotency key, retry safely, and reconcile periodically."
      ],
      notes: [
        "The sequence diagram is the orchestrated version of this session's booking saga: the orchestrator persists its state after every step, so a crash in the middle resumes where it stopped instead of leaving nights held forever.",
        "Exactly-once *delivery* across a network is impossible; what systems achieve is exactly-once *effect*: deduplicate by an id at every boundary where a repeat would hurt.",
        "Compensations are business operations, not technical rollbacks: you cannot *un-send* an e-mail, but you can send a cancellation. Design them with product owners."
      ]
    }
  ],

  stretch: [
    "Replace the choreographed booking saga with an orchestrator — a persisted state machine — and add a timeout step that cancels bookings whose payment has not completed within 15 minutes.",
    "Inject faults with Testcontainers Kafka: duplicate, delay and reorder `PaymentSucceeded` events, and assert that every booking ends either confirmed and paid, or cancelled and refunded.",
    "Write a daily reconciliation job that compares a simulated payment-provider settlement CSV with the payments ledger and files mismatches into a review queue."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: maximise host revenue (weighted interval scheduling)',
      lead: 'LeetCode 1235 with a booking framing: choose non-overlapping stay requests for one listing to maximise revenue — and return the plan, not just the number.',
      difficulty: 'Hard', minutes: 40, lc: 1235, pattern: ['dp', 'binary-search', 'intervals'],
      problem: [
        "A listing receives booking requests `[start, end)` with a price each. A request may start on the day another ends.",
        "Return the **maximum total revenue** of a set of non-overlapping requests, and the chosen requests themselves."
      ],
      examples: [
        { in: 'start = [1,2,3,3], end = [3,4,5,6], profit = [50,10,40,70]', out: '120', why: "Take [1,3) and [3,6)." },
        { in: 'start = [1,2,3,4,6], end = [3,5,10,6,9], profit = [20,20,100,70,60]', out: '150' },
        { in: 'start = [1,1,1], end = [2,3,4], profit = [5,6,4]', out: '6' }
      ],
      constraints: ["`1 ≤ requests ≤ 5 × 10⁴`", "`1 ≤ start < end ≤ 10⁹`", "`1 ≤ price ≤ 10⁴`"],
      hints: [
        "Greedy by end time works when all prices are equal, but not with prices. Sort by end time and think about the last request: is it in the optimal set or not?",
        "`dp[i]` = best revenue using the first i requests (sorted by end). Either skip request i, or take it and add the best for requests ending at or before its start.",
        "Find *the requests ending at or before this start* with binary search over the sorted end times — O(n log n) overall. Store the choice to reconstruct the plan."
      ],
      approaches: [
        { name: 'Brute force', idea: 'Try every subset, keep the best compatible one', time: 'O(2ⁿ · n)', space: 'O(n)' },
        { name: 'Recursion + memo', idea: 'Sort by start; take (jump to next compatible) or skip', time: 'O(n log n)', space: 'O(n)' },
        { name: 'DP over end-sorted requests + binary search', idea: 'dp[i+1] = max(dp[i], dp[prev(i)] + price(i))', time: 'O(n log n)', space: 'O(n)' }
      ],
      code: { lang: 'java', file: 'MaxRevenue.java', src: code`
        import java.util.*;

        public class MaxRevenue {
            record Request(int start, int end, int price) {
                @Override public String toString() { return start + "-" + end + " " + price; }
            }

            /** Best set of non-overlapping half-open requests, maximising total price. */
            static List<Request> best(List<Request> reqs) {
                List<Request> r = new ArrayList<>(reqs);
                r.sort(Comparator.comparingInt(Request::end));
                int n = r.size();
                long[] dp = new long[n + 1];                 // dp[i] = best revenue using the first i requests
                int[] prev = new int[n];                     // how many requests end at or before r[i].start
                for (int i = 0; i < n; i++) {
                    int lo = 0, hi = i;
                    while (lo < hi) {                        // first index whose end is after r[i].start
                        int mid = (lo + hi) >>> 1;
                        if (r.get(mid).end() <= r.get(i).start()) lo = mid + 1; else hi = mid;
                    }
                    prev[i] = lo;
                    dp[i + 1] = Math.max(dp[i], dp[lo] + r.get(i).price());   // skip it, or take it
                }
                List<Request> chosen = new ArrayList<>();
                for (int i = n; i > 0; ) {                   // walk back through the decisions
                    if (dp[i] == dp[i - 1]) i--;
                    else { chosen.add(r.get(i - 1)); i = prev[i - 1]; }
                }
                Collections.reverse(chosen);
                return chosen;
            }

            static long total(List<Request> l) { return l.stream().mapToLong(Request::price).sum(); }

            static List<Request> of(int[] s, int[] e, int[] p) {
                List<Request> l = new ArrayList<>();
                for (int i = 0; i < s.length; i++) l.add(new Request(s[i], e[i], p[i]));
                return l;
            }

            public static void main(String[] args) {
                System.out.println("LeetCode examples: "
                        + total(best(of(new int[] {1, 2, 3, 3}, new int[] {3, 4, 5, 6}, new int[] {50, 10, 40, 70}))) + " "
                        + total(best(of(new int[] {1, 2, 3, 4, 6}, new int[] {3, 5, 10, 6, 9}, new int[] {20, 20, 100, 70, 60}))) + " "
                        + total(best(of(new int[] {1, 1, 1}, new int[] {2, 3, 4}, new int[] {5, 6, 4}))));
                List<Request> villa = List.of(new Request(1, 4, 24_000), new Request(3, 6, 30_000), new Request(5, 8, 21_000),
                        new Request(6, 10, 40_000), new Request(9, 12, 18_000));
                List<Request> plan = best(villa);
                System.out.println("villa: " + plan + " total " + total(plan));

                Random rnd = new Random(1235);
                for (int t = 0; t < 1_000; t++) {
                    List<Request> reqs = new ArrayList<>();
                    for (int i = rnd.nextInt(10); i > 0; i--) {
                        int s = rnd.nextInt(20);
                        reqs.add(new Request(s, s + 1 + rnd.nextInt(6), 1 + rnd.nextInt(50)));
                    }
                    long bruteBest = 0;                                          // brute force over subsets
                    for (int mask = 0; mask < (1 << reqs.size()); mask++) {
                        List<Request> pick = new ArrayList<>();
                        for (int i = 0; i < reqs.size(); i++) if ((mask & (1 << i)) != 0) pick.add(reqs.get(i));
                        boolean ok = true;
                        for (Request a : pick) for (Request b : pick)
                            if (a != b && a.start() < b.end() && b.start() < a.end()) ok = false;
                        if (ok) bruteBest = Math.max(bruteBest, total(pick));
                    }
                    List<Request> got = best(reqs);
                    for (int i = 1; i < got.size(); i++)
                        if (got.get(i - 1).end() > got.get(i).start()) throw new AssertionError("overlap in plan");
                    if (total(got) != bruteBest) throw new AssertionError("case " + t);
                }
                System.out.println("1000 random cases: DP == brute force, plan is non-overlapping");
            }
        }`, out: code`
        LeetCode examples: 120 150 6
        villa: [3-6 30000, 6-10 40000] total 70000
        1000 random cases: DP == brute force, plan is non-overlapping` },
      pitfalls: [
        "Greedy by earliest end or highest price — optimal only for the unweighted version.",
        "Using `<` instead of `<=` when finding compatible requests rejects back-to-back stays that the problem allows.",
        "Integer overflow when summing many large prices — accumulate in `long`.",
        "Forgetting the reconstruction: the business needs *which* bookings to accept, not only the revenue."
      ],
      followUps: [
        { q: "A hotel has k identical rooms instead of one listing.",
          a: "With k rooms the problem becomes much harder in the weighted case: it can be solved as a min-cost flow on a timeline graph (each request is an edge with negative cost, capacity k along the timeline), or with DP over room assignments for small k. Unweighted k-room scheduling stays greedy (earliest end, assign to any free room). In practice, revenue management uses heuristics and forecasts rather than exact optimisation." },
        { q: "Requests arrive online and must be accepted or rejected immediately.",
          a: "Offline optimality is impossible — a later, more valuable request may conflict. Online policies use price thresholds (accept if the price beats the expected value of keeping the nights open, based on demand forecasts) — the essence of revenue management and dynamic pricing. Competitive-analysis results bound how far any online rule can be from the offline optimum." },
        { q: "Two plans have the same revenue. Which do you return?",
          a: "Decide a tie-breaking rule with the business — for example prefer fewer bookings (less turnover cost) or earlier dates — and encode it in the DP comparison (compare a tuple of revenue and secondary score). Without a rule, the result is still optimal but may change between runs, which confuses users and tests." }
      ],
      rubric: [
        "Explains why greedy fails with prices and sets up the take-or-skip recurrence.",
        "Sorts by end time and finds the previous compatible request with binary search — O(n log n).",
        "Reconstructs the chosen requests and handles back-to-back stays and overflow.",
        "Validates against brute force; discusses k rooms and online decisions."
      ],
      notes: [
        "Trace the villa example: taking 3–6 (30,000) and 6–10 (40,000) beats 1–4 plus 5–8 (45,000) and every other combination; the back-to-back pair is allowed because stays are half-open.",
        "The reconstruction walks backwards: if `dp[i]` equals `dp[i − 1]`, request i − 1 was skipped; otherwise it was taken, and we jump to the requests compatible with it.",
        "This is the same structure as many scheduling problems in backend work: choosing maintenance windows, batch jobs or ad slots with values and conflicts."
      ]
    },
    {
      type: 'design',
      title: 'Design round: payment system for a booking platform',
      lead: 'Payments are where correctness beats everything. Interviewers look for idempotency, state machines, ledgers and reconciliation — and calm handling of unknown outcomes.',
      kind: 'HLD', difficulty: 'Hard', minutes: 50,
      prompt: "Design payments for the Airbnb-style platform: guests pay at booking time (cards, UPI and wallets through a payment service provider), hosts are paid out after check-in, and refunds follow cancellation policies. Never charge twice, never lose a payment, reconcile daily with the provider, and stay correct when the provider times out or sends webhooks late or twice.",
      stages: [
        { t: 'Requirements and properties', ask: 'What matters most, and what is out of scope?', points: [
          "Correctness and auditability over raw availability: a payment may be delayed, but never duplicated or lost.",
          "Idempotent APIs end to end; every state change traceable to a request or a provider event.",
          "Minimise PCI scope: card data goes directly from the client to the provider (hosted fields or SDK); we store only tokens and references.",
          "Volume: about a million payments a day (~12/s on average) — throughput is easy; correctness under failure is the hard part."
        ] },
        { t: 'Core model: state machine and ledger', ask: 'Which states can a payment be in, and how is money recorded?', diagram: { kind: 'graph', cw: 190, ch: 100, bw: 150, nodes: [
          { id: 'c', t: 'CREATED', s: 'intent recorded first', x: 0, y: 1, tone: 'gray' },
          { id: 'a', t: 'AUTHORIZED', s: 'funds reserved', x: 1, y: 0, tone: 'yellow' },
          { id: 'p', t: 'CAPTURED', s: 'money moved', x: 2, y: 0, tone: 'green' },
          { id: 'r', t: 'REFUNDED', s: 'partial or full', x: 3, y: 0, tone: 'purple' },
          { id: 'f', t: 'FAILED', s: 'declined', x: 1, y: 2, tone: 'red' },
          { id: 'v', t: 'VOIDED / EXPIRED', s: 'authorisation released', x: 2, y: 2, tone: 'orange' }
        ], edges: [['c', 'a'], ['c', 'f'], ['a', 'p', 'capture'], ['a', 'v', 'void'], ['p', 'r', 'refund']] }, points: [
          "Transitions only move forward along the graph; a stale event that would move backwards is ignored and logged.",
          "Every money movement creates balanced **double-entry ledger** entries (guest payable, platform clearing, host payable, fees, refunds) — balances are sums of immutable entries."
        ] },
        { t: 'The payment flow with a provider', ask: 'Walk through a card payment from *Book* to *Confirmed*.', diagram: { kind: 'seq', actors: ['Client', 'Payment service', 'Provider', 'Booking service'], msgs: [
          [0, 1, 'POST /payments (Idempotency-Key)'], [1, 1, 'record CREATED + merchant reference'],
          [1, 2, 'create payment intent (same key)'], [2, 1, 'client secret', 'r'], [1, 0, 'client secret', 'r'],
          [0, 2, 'confirm (3-D Secure / UPI approval)'], [2, 1, 'webhook: succeeded (signed)'],
          [1, 1, 'verify, dedupe, AUTHORIZED/CAPTURED, ledger + outbox'], [1, 3, 'PaymentSucceeded event']
        ] }, points: [
          "Record the payment **before** calling the provider, with a merchant reference that is also the provider's idempotency key — so a crash after the provider call can always be traced and reconciled.",
          "Webhook handling: verify the signature in constant time, deduplicate by provider event id, respond quickly, process asynchronously, and apply only forward transitions."
        ] },
        { t: 'Failures and unknown outcomes', ask: 'The provider call times out. The booking fails after capture. A webhook never arrives.', points: [
          "**Timeout = unknown**: do not create a new charge; query the provider by idempotency key or merchant reference, or wait for the webhook; a sweeper checks payments stuck in CREATED for more than a few minutes.",
          "**Authorise, then capture**: reserve funds at booking, capture when the booking is confirmed (or at check-in); if the booking fails, void the authorisation instead of refunding.",
          "**Compensation**: if the booking fails after capture, issue a refund automatically through the saga, idempotently.",
          "**Retries** with backoff for provider errors; a circuit breaker per provider; optionally a secondary provider for new payments only."
        ] },
        { t: 'Reconciliation, payouts and operations', ask: 'How do you prove every rupee is accounted for?', points: [
          "**Daily reconciliation**: import the provider's settlement report and match it line by line with the ledger; mismatches go to a review queue with alerts.",
          "**Payouts** to hosts in batches after check-in, each with an idempotency key per booking, so a re-run of the batch never pays twice.",
          "**Observability**: success rate by method and issuer, latency, webhook lag, stuck states, refund rates; alerts on anomalies.",
          "**Security**: secrets in a vault, signed webhooks, least-privilege access to payment data, a full audit trail."
        ] }
      ],
      followUps: [
        { q: "The provider charged the customer, but our service crashed before recording the success. How do we find out?",
          a: "Because the payment was recorded as CREATED with a merchant reference before calling the provider, we know it exists. The provider's webhook will arrive (with retries) and move it forward; if it does not, a sweeper queries the provider for payments stuck in CREATED beyond a few minutes; and the daily reconciliation catches anything left. The customer is never charged twice because retries reuse the same idempotency key." },
        { q: "Why authorise first and capture later instead of charging immediately?",
          a: "An authorisation reserves funds without moving them, so if availability fails or the host declines, the platform voids it — no refund fees and nothing appears as a completed charge for the guest. Capture happens once the booking is confirmed. The catch: authorisations typically expire after several days depending on the network and payment method, so long lead-time bookings need a different strategy (capture now and refund on cancellation, or re-authorise)." },
        { q: "How do you guarantee hosts are never paid twice?",
          a: "Payouts are derived from the ledger's host-payable balance, created as payout records with a unique key per booking (or per payout period) and executed with an idempotency key at the bank or provider. A batch can be re-run safely because already-paid items are skipped by the unique constraint, and bank statements are reconciled against payout records." }
      ],
      rubric: [
        "Prioritises correctness: idempotency keys, records before external calls, forward-only state machine.",
        "Uses a double-entry ledger for every money movement.",
        "Integrates the provider safely: hosted card collection, signed and deduplicated webhooks.",
        "Handles unknown outcomes, compensation and authorisation versus capture.",
        "Reconciles daily, pays out idempotently and monitors the system."
      ],
      notes: [
        "The single most important sentence in a payment design interview: *a timeout is not a failure — it is an unknown outcome, and we resolve it by asking, not by retrying blindly.*",
        "This design connects directly to the booking saga in this session: `PaymentSucceeded` and `PaymentFailed` events drive the booking state machine, and refunds are its compensations.",
        "Regulatory details (strong customer authentication, mandates for recurring payments, data residency) vary by country; mention that they exist and are handled with the provider rather than guessing specifics."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: sagas, outbox, idempotency & state machines',
      lead: 'Workflow questions where every answer must survive crashes, duplicates and reordering.',
      qa: [
        { level: 1, q: "What is the saga pattern, and why not just use a distributed transaction?",
          a: "A saga splits a business transaction that spans services into a sequence of **local** transactions, one per service, each publishing an event or replying to an orchestrator. If a step fails, the steps already completed are undone by **compensating** transactions — release the held nights, refund the payment. Distributed transactions (two-phase commit) would require every participant to support a common protocol, hold locks across the network while waiting for the coordinator, and block if the coordinator fails — coupling the availability of all services. Sagas trade atomic isolation for availability and loose coupling, accepting temporary inconsistency that the workflow makes explicit (for example a `PENDING` booking).",
          follow: ["What does *eventually consistent* mean for the guest during a booking saga?"] },
        { level: 2, q: "Orchestration or choreography for the booking saga — what are the trade-offs?",
          a: "**Choreography**: each service reacts to events (`BookingRequested` → inventory holds → `NightsHeld` → payments charges → …). No central component, but the flow is implicit, spread across services, hard to change and hard to see when something is stuck; cyclic dependencies between services can creep in. **Orchestration**: a saga orchestrator (a persisted state machine) sends commands and handles replies and timeouts. The flow is explicit, testable and observable in one place, and compensations are easy to reason about, at the cost of a component that must be highly available and that services depend on. Choreography fits two or three simple steps; orchestration wins as soon as there are several steps, timeouts or complex error paths.",
          follow: ["How do you avoid the orchestrator becoming a single point of failure?"] },
        { level: 2, q: "Design the compensations for the booking saga. What if a compensation itself fails?",
          a: "Each forward step gets a compensating step that semantically undoes it: *hold nights* ↔ *release nights*; *authorise/capture payment* ↔ *void/refund*; *send confirmation* ↔ *send cancellation*. Compensations run in reverse order of the completed steps, carry the same identifiers, and are **idempotent** so they can be retried safely. A compensation must not give up: retry with backoff (a refund that fails because the provider is down is retried later), alert when retries exceed a threshold, and route permanently failing cases to a manual operations queue with full context. Design compensations with the business — some actions cannot be undone, only mitigated.",
          follow: ["Why must compensations be idempotent?"] },
        { level: 2, q: "Explain the dual-write problem and the transactional outbox. How does a polling relay differ from change-data-capture?",
          a: "Writing to the database and publishing to a broker are two separate systems: commit then crash, and the event is lost; publish then roll back, and the event lies. The **outbox** inserts the event into an `outbox` table in the same database transaction as the state change, so both or neither happen. A relay then publishes the rows. **Polling relays** query unsent rows (`SELECT … FOR UPDATE SKIP LOCKED LIMIT 100` so several relay instances can share the work), publish them and mark them sent — simple, but they add database load and latency. **Change-data-capture** (e.g. Debezium) tails the database's transaction log and publishes outbox inserts with low latency and no polling queries, at the cost of more infrastructure. Either way delivery is at-least-once, so consumers deduplicate.",
          follow: ["How do you preserve per-booking event order with several relay instances?"] },
        { level: 2, q: "How do you make a Kafka consumer idempotent?",
          a: "Give every event a unique id (and keep the producer's idempotency key in it). In the consumer, process the event and record its id in a `processed_messages` table **in the same database transaction** — a unique constraint on the id makes a redelivered event fail fast, so it is skipped and acknowledged. Alternatively, make the operation naturally idempotent: an upsert with a version check, a conditional state transition (`UPDATE booking SET status = 'CONFIRMED' WHERE id = ? AND status = 'PENDING'`), or setting a value rather than incrementing it. Expire old processed ids after the maximum redelivery window. This *inbox* pattern plus an outbox gives effectively-once processing.",
          follow: ["Why is *check whether processed, then process* without a transaction not enough?"] },
        { level: 3, q: "A call to the payment provider timed out. What do you do?",
          a: [
            "**Do not assume failure** — the charge may have succeeded. Do not create a new charge with a new key.",
            "Retry the **same** request with the **same idempotency key**: the provider returns the original result if it processed it, or processes it now if it did not.",
            "If retries also time out, mark the payment `UNKNOWN`/`PENDING`, tell the guest it is being confirmed, and resolve asynchronously: wait for the provider's webhook, and have a sweeper query the provider's status API by merchant reference.",
            "Only when the provider confirms failure (or after an expiry rule) continue the saga's failure path — release nights, notify the guest.",
            "Daily reconciliation catches anything the online paths missed."
          ],
          follow: ["What would you do if the provider did not support idempotency keys?"] },
        { level: 2, q: "Model the booking state machine and prevent illegal transitions under concurrent events.",
          a: "Define states (`PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, …) and an explicit map of allowed transitions, in one place. Apply every transition as a **conditional update** — `UPDATE booking SET status = 'CONFIRMED', version = version + 1 WHERE id = ? AND status = 'PENDING_PAYMENT'` — and treat *zero rows updated* as *the event is stale or a duplicate*, which is logged and acknowledged rather than retried. Optimistic locking (`@Version`) gives the same protection with JPA. This makes concurrent events (a payment success racing a guest's cancellation) resolve deterministically: whichever transition commits first wins, and the other sees a state from which it is not allowed and triggers the appropriate follow-up (e.g. a refund).",
          follow: ["Payment succeeds after the guest cancelled. What should happen?"] },
        { level: 3, q: "Sagas lack isolation. What can other requests observe, and how do you mitigate it?",
          a: "Because each step commits locally, other transactions can see intermediate states — a booking that is held but not yet paid, nights reserved by a saga that will be compensated — and two sagas can interleave in ways ACID isolation would have prevented (lost updates, dirty reads of soon-to-be-undone data). Countermeasures: **semantic locks** — an explicit `PENDING` status that other flows respect (do not show the nights as free, do not allow a second booking); **commutative updates** that give the same result in any order (adding and subtracting amounts); **re-reading values** before acting on them; ordering steps so that hard-to-compensate actions (sending e-mails, payouts) come last; and versioning records so stale writes fail.",
          follow: ["Which step of the booking saga would you put last, and why?"] },
        { level: 2, q: "Why are webhooks hard to process correctly, and what must a webhook endpoint do?",
          a: "Providers deliver webhooks **at least once**, possibly **late**, **out of order** and **in bursts**, from the public internet. The endpoint must: verify the signature (an HMAC over the raw body with a shared secret, compared in constant time) and reject stale timestamps to prevent replay; deduplicate by the provider's event id; respond with 2xx quickly and process asynchronously (store the event, then handle it), because slow responses trigger retries; apply only valid forward state transitions; and log raw payloads for audit. Monitor failure rates and the lag between event time and processing, and reconcile against the provider's API when webhooks go missing.",
          follow: ["Why should the signature be computed over the raw request body?"] },
        { level: 3, q: "How would you test a saga end to end?",
          a: [
            "**Unit-test the state machine**: every state × event combination, including duplicates and stale events, with expected transitions and emitted commands.",
            "**Component tests** with Testcontainers (Kafka, MySQL): run the real services or the orchestrator, publish events and assert end states.",
            "**Fault injection**: duplicate, delay and reorder messages; crash a service between its database commit and its outbox relay; make the provider time out — and assert the invariants.",
            "**Invariants** checked after every test: every booking ends *confirmed and paid* or *cancelled and refunded*; no payment is captured twice; held nights are released for cancelled bookings.",
            "**Contracts** for events between services, and a few end-to-end smoke tests in staging with the provider's sandbox."
          ],
          follow: ["How do you make such tests deterministic?"] }
      ],
      notes: [
        "Use the vocabulary precisely — compensation, outbox, inbox, idempotency key, semantic lock — and always say what happens on a crash between two steps.",
        "The payment-timeout question is a classic Senior signal: the answer is *unknown outcome, same idempotency key, query, reconcile*.",
        "State machines with conditional updates are the simplest robust tool in this whole area; mention them early."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "In a booking saga, *charge the card* succeeded but *confirm the booking* failed permanently. What should happen?",
      options: ['Compensate in reverse order: refund (or void) the payment and release the held nights', 'Retry the confirmation forever', 'Keep the money and notify support', 'Roll back the payment provider\'s database'], answer: 0,
      why: "Completed steps are undone by compensating transactions, newest first. There is no shared transaction to roll back across services." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                int[][] jobs = {{1, 3, 50}, {2, 4, 10}, {3, 5, 40}, {3, 6, 70}};   // {start, end, profit}, sorted by end
                int n = jobs.length;
                int[] dp = new int[n + 1];
                for (int i = 0; i < n; i++) {
                    int j = 0;
                    while (j < i && jobs[j][1] <= jobs[i][0]) j++;                  // jobs that end by this start
                    dp[i + 1] = Math.max(dp[i], dp[j] + jobs[i][2]);
                }
                System.out.println(Arrays.toString(dp));
            }
        }`, out: '[0, 50, 50, 90, 120]' },
      options: ['`[0, 50, 50, 90, 120]`', '`[0, 50, 60, 90, 120]`', '`[0, 50, 50, 90, 160]`', '`[0, 50, 50, 100, 120]`'], answer: 0,
      why: "Job 2 (profit 10) overlaps job 1, so dp stays 50; job 3 (40) can follow job 1 → 90; job 4 (70) can also follow job 1 → 120, the LeetCode 1235 answer." },
    { level: 3, q: "A service commits a booking row and then crashes before publishing `BookingCreated` to Kafka. Which pattern prevents the event from being lost?",
      options: ['A transactional outbox: write the event in the same database transaction and publish it from a relay', 'Publishing to Kafka before the database commit', 'A longer Kafka producer timeout', 'Sending the event twice'], answer: 0,
      why: "The outbox row commits atomically with the booking, so the relay will publish it after the crash. Publishing first would announce bookings that may roll back." },
    { level: 2, q: "Why is two-phase commit rarely used between microservices?",
      options: ['It blocks when the coordinator fails after *prepare*, holds locks across services, couples their availability, and most brokers and HTTP services cannot participate', 'It is slower than a single SQL query', 'It requires all services to share one database', 'It only works with NoSQL databases'], answer: 0,
      why: "2PC trades availability for atomicity, which is a poor fit for independently deployed services; sagas with compensations are the usual alternative." },
    { level: 3, q: "A provider webhook says `payment_failed` after an earlier `payment_succeeded` for the same payment (a delayed retry). What should the handler do?",
      options: ['Apply only valid forward transitions — ignore the stale failure, log it, and reconcile with the provider if in doubt', 'Mark the payment failed and cancel the booking', 'Refund the customer immediately', 'Reject the webhook with an error so the provider retries'], answer: 0,
      why: "Webhooks can arrive out of order. A forward-only state machine prevents a late event from undoing a confirmed payment; reconciliation resolves genuine doubt." }
  ]
});
