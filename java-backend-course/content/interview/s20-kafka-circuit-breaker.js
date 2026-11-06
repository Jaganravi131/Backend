/* Interview pack — Session 20: Kafka, Spring Cloud & circuit breakers */
COURSE.prep(20, {
  deepDives: [
    {
      title: 'Deep dive: Kafka internals — partitions, replication, delivery semantics & consumer groups',
      lead: 'Kafka questions at senior level are about guarantees: ordering, durability, duplicates — and exactly which configuration buys each one.',
      diagram: { kind: 'tiers', tiers: [
        { label: 'Producers', nodes: [{ t: 'booking-service', s: 'key = bookingId, acks=all, idempotent', tone: 'blue' }] },
        { label: 'Topic: booking-events (3 partitions, RF 3)', via: 'hash(key) → partition', nodes: [
          { t: 'P0', s: 'leader broker 1, ISR {1,2,3}', tone: 'green' }, { t: 'P1', s: 'leader broker 2, ISR {2,3,1}', tone: 'green' }, { t: 'P2', s: 'leader broker 3, ISR {3,1}', tone: 'yellow' }] },
        { label: 'Consumer group: payments', via: 'one partition → one consumer', nodes: [{ t: 'consumer A', s: 'P0, P1', tone: 'purple' }, { t: 'consumer B', s: 'P2', tone: 'purple' }] }
      ] },
      table: { head: ['Semantics', 'How with Kafka', 'Risk'], rows: [
        ['At-most-once', 'Commit the offset **before** processing', 'A crash loses the record'],
        ['At-least-once', 'Commit **after** processing (Spring Kafka\'s default behaviour)', 'A crash reprocesses — consumers must be idempotent'],
        ['Exactly-once (within Kafka)', 'Idempotent producer + transactions; consumers use `read_committed`', 'Side effects outside Kafka (DB, e-mail, payments) are not covered']
      ] },
      points: [
        "A topic is split into **partitions** — append-only logs stored as segment files with offset and time indexes. Ordering holds **per partition** only; the record key selects the partition (a murmur2 hash by default), so all events of one booking stay in order.",
        "Each partition has a leader and followers; the **in-sync replicas (ISR)** are the caught-up ones. With `acks=all` the leader acknowledges a write once every ISR member has it; with replication factor 3 and `min.insync.replicas=2`, writes survive one broker failure and are **refused** rather than under-replicated when two are down.",
        "Since Kafka 3.0 producers default to `enable.idempotence=true` and `acks=all`: the broker drops duplicate retried batches per partition using a producer id and sequence numbers. **Transactions** commit output records together with consumed offsets — exactly-once *within* Kafka.",
        "A **consumer group** divides partitions among its members, so consumers beyond the partition count sit idle. Processing slower than `max.poll.interval.ms` gets a consumer evicted and triggers a rebalance.",
        "Kafka 4.0 made the new consumer rebalance protocol (KIP-848, `group.protocol=consumer`) generally available: the broker computes assignments incrementally, avoiding stop-the-world rebalances. Kafka 4 runs without ZooKeeper — KRaft controllers keep metadata in a Raft log.",
        "**Retention** deletes old segments by time or size; **log compaction** keeps the latest record per key — ideal for changelog topics holding current state per entity."
      ],
      notes: [
        "P2 in the diagram has only two replicas in sync. With `min.insync.replicas=2` it still accepts writes; if broker 1 also falls behind, producers using `acks=all` receive `NotEnoughReplicas` errors — a deliberate choice of durability over availability.",
        "Changing the number of partitions changes which partition a key maps to, which breaks per-key ordering across the change. Choose the partition count with growth in mind (partitions are cheap compared with re-keying).",
        "*Exactly-once* is a scoped claim: Kafka transactions cover Kafka-to-Kafka processing. As soon as a consumer writes to a database or calls a payment provider, you need idempotency on that side — the subject of today's Senior question."
      ]
    }
  ],

  stretch: [
    "Make the expense-events consumer idempotent with a `processed_events` table (event id as primary key) written in the same transaction as the balance update; replay the topic from offset 0 and prove balances do not change.",
    "Add non-blocking retries with `@RetryableTopic` (exponential backoff, four attempts) and a dead-letter topic; inject a poison message and show that the main partition keeps flowing.",
    "Measure consumer lag with `kafka-consumer-groups.sh --describe` while throttling the consumer, then scale consumers up to the partition count and watch the lag drain."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: sliding-window maximum (rolling peak latency)',
      lead: 'LeetCode 239 — the canonical monotonic-deque problem — plus the streaming version a monitoring pipeline needs.',
      difficulty: 'Hard', minutes: 35, lc: 239, pattern: ['monotonic', 'sliding-window'],
      problem: [
        "Given an array `nums` and a window size `k`, return the maximum of every contiguous window of size `k` as the window slides from left to right.",
        "Then write a streaming version: `offer(latency)` returns the maximum of the last `k` latencies seen so far — the rolling peak a dashboard shows for the most recent requests."
      ],
      examples: [
        { in: 'nums = [1,3,-1,-3,5,3,6,7], k = 3', out: '[3,3,5,5,6,7]' },
        { in: 'nums = [1], k = 1', out: '[1]' },
        { in: 'stream: 120, 80, 95, 300, 110, 90, 85, 400 with k = 3', out: '120, 120, 120, 300, 300, 300, 110, 400' }
      ],
      constraints: ["`1 ≤ nums.length ≤ 10⁵`", "`-10⁴ ≤ nums[i] ≤ 10⁴`", "`1 ≤ k ≤ nums.length`"],
      hints: [
        "Recomputing each window costs O(n · k). A heap gives O(n log n) — but what about elements that are smaller than a newer element? Can they ever be a window's maximum again?",
        "Keep a deque of **indices** whose values are decreasing from front to back. Before adding index i, pop from the back every index with a value ≤ `nums[i]`.",
        "Pop from the front when that index has left the window (`front ≤ i − k`). The front is then always the current maximum; each index enters and leaves once — O(n)."
      ],
      approaches: [
        { name: 'Brute force', idea: 'Scan each window', time: 'O(n · k)', space: 'O(1)' },
        { name: 'Max-heap with lazy deletion', idea: 'Heap of (value, index); discard tops that left the window', time: 'O(n log n)', space: 'O(n)' },
        { name: 'Monotonic deque', idea: 'Indices with decreasing values; evict expired front, dominated back', time: 'O(n)', space: 'O(k)' },
        { name: 'Block prefix/suffix maxima', idea: 'Split into blocks of k; window max = max(suffix of one block, prefix of the next)', time: 'O(n)', space: 'O(n)' }
      ],
      code: { lang: 'java', file: 'SlidingWindowMax.java', src: code`
        import java.util.*;

        public class SlidingWindowMax {
            /** Monotonic deque of indices; values decrease from front to back. */
            static int[] maxSlidingWindow(int[] a, int k) {
                int[] out = new int[a.length - k + 1];
                Deque<Integer> dq = new ArrayDeque<>();
                for (int i = 0; i < a.length; i++) {
                    if (!dq.isEmpty() && dq.peekFirst() <= i - k) dq.pollFirst();     // front left the window
                    while (!dq.isEmpty() && a[dq.peekLast()] <= a[i]) dq.pollLast();   // dominated: can never be max
                    dq.addLast(i);
                    if (i >= k - 1) out[i - k + 1] = a[dq.peekFirst()];
                }
                return out;
            }

            /** Streaming: offer one value at a time, get the max of the last k values. */
            static final class RollingMax {
                private final int k;
                private final Deque<long[]> dq = new ArrayDeque<>();               // {sequence number, value}
                private long seq = 0;
                RollingMax(int k) { this.k = k; }

                long offer(long value) {
                    seq++;
                    while (!dq.isEmpty() && dq.peekFirst()[0] <= seq - k) dq.pollFirst();
                    while (!dq.isEmpty() && dq.peekLast()[1] <= value) dq.pollLast();
                    dq.addLast(new long[] {seq, value});
                    return dq.peekFirst()[1];
                }
            }

            public static void main(String[] args) {
                System.out.println(Arrays.toString(maxSlidingWindow(new int[] {1, 3, -1, -3, 5, 3, 6, 7}, 3)));
                System.out.println(Arrays.toString(maxSlidingWindow(new int[] {1}, 1)));
                RollingMax peak = new RollingMax(3);
                List<Long> peaks = new ArrayList<>();
                for (long latency : new long[] {120, 80, 95, 300, 110, 90, 85, 400}) peaks.add(peak.offer(latency));
                System.out.println("rolling max of the last 3 latencies: " + peaks);

                Random rnd = new Random(239);
                for (int t = 0; t < 2_000; t++) {                                   // differential test
                    int n = 1 + rnd.nextInt(30), k = 1 + rnd.nextInt(n);
                    int[] a = new int[n];
                    for (int i = 0; i < n; i++) a[i] = rnd.nextInt(21) - 10;
                    int[] fast = maxSlidingWindow(a, k), slow = new int[n - k + 1];
                    for (int s = 0; s + k <= n; s++) slow[s] = Arrays.stream(a, s, s + k).max().getAsInt();
                    if (!Arrays.equals(fast, slow)) throw new AssertionError(Arrays.toString(a) + " k=" + k);
                }
                System.out.println("2000 random arrays: deque == brute force");
            }
        }`, out: code`
        [3, 3, 5, 5, 6, 7]
        [1]
        rolling max of the last 3 latencies: [120, 120, 120, 300, 300, 300, 110, 400]
        2000 random arrays: deque == brute force` },
      pitfalls: [
        "Storing values instead of indices — then you cannot tell when the front has left the window.",
        "Using `<` instead of `<=` when popping the back keeps duplicates; correct either way here, but understand the choice.",
        "Off-by-one in the eviction test (`peekFirst() <= i - k`) or in when to start emitting (`i >= k - 1`).",
        "A heap without lazy deletion makes removing expired elements O(k)."
      ],
      followUps: [
        { q: "The window is time-based — the maximum latency over the last 60 seconds, with events arriving irregularly.",
          a: "Same deque, keyed by timestamp: evict from the front while `front.timestamp ≤ now − 60 s`, and keep the decreasing-values invariant at the back. It stays amortised O(1) per event. In stream processors this is a sliding time window, and late events need a policy (watermarks and allowed lateness)." },
        { q: "Now the product wants the rolling **median** (or p99) instead of the maximum.",
          a: "A median over a sliding window needs two heaps with lazy deletion (LeetCode 480, Hard) or an order-statistics tree — O(log k) per event. For p99 at scale you rarely keep every value: use a histogram or sketch (HDR histogram, t-digest) per time bucket and merge buckets — Session 24's coding round builds this." },
        { q: "How would you compute this inside Kafka?",
          a: "With Kafka Streams: group the latency events by service (the record key), apply a hopping or sliding time window, and aggregate with a reducer that keeps the maximum; results go to an output topic that feeds dashboards and alerts. Windowed state lives in local state stores backed by changelog topics, so it survives restarts." }
      ],
      rubric: [
        "Identifies why dominated elements can be discarded and arrives at the monotonic deque.",
        "Implements eviction of expired indices and dominated values correctly.",
        "Proves O(n) with the *each index enters and leaves once* argument.",
        "Extends to streaming and time-based windows; knows when a sketch is needed instead."
      ],
      notes: [
        "Trace the stream example: after 300 arrives, 120 and 95 can never be the maximum again (300 is larger and newer), so they are popped immediately; the deque never holds more than k entries.",
        "The block prefix/suffix approach is a nice alternative to mention: it is O(n) too, and its independent blocks parallelise well.",
        "The randomized test compares 2,000 arrays against a brute-force scan, including negative numbers, duplicates and k = 1 or k = n."
      ]
    },
    {
      type: 'design',
      title: 'Design round: notification system (e-mail, SMS, push)',
      lead: 'Asked at almost every product company: fan-out, priorities, third-party providers, idempotency and user preferences — all in one design.',
      kind: 'HLD', difficulty: 'Hard', minutes: 45,
      prompt: "Design the notification platform for an Airbnb-style product: booking confirmations, payment receipts, host messages and marketing campaigns, delivered by e-mail, SMS and push. About 50 million notifications a day with campaign spikes; respect user preferences and quiet hours; never duplicate transactional messages; deliver urgent ones within seconds.",
      stages: [
        { t: 'Requirements and estimates', ask: 'What volumes and priorities are we designing for?', table: { head: ['Quantity', 'Estimate'], rows: [
          ['Average rate', '50 M / day ≈ 580 / s'],
          ['Campaign peaks', '10× or more → ~6,000 / s for hours'],
          ['Priorities', 'Critical (OTP, security) seconds; transactional (booking, receipt) under a minute; marketing best effort'],
          ['Providers', 'Each with rate limits and outages — e-mail, SMS and push gateways'],
          ['Storage', 'Delivery log ~50 M rows/day; keep 90 days hot, archive the rest']
        ] }, points: [
          "Functional: send via channel(s), templates with localisation, user preferences and opt-outs, scheduling and quiet hours, delivery tracking.",
          "Non-functional: no duplicate transactional messages, no loss, priority isolation, provider failover."
        ] },
        { t: 'API and data model', ask: 'How do services ask for a notification, and what do you store?', points: [
          "Internal API `POST /notifications` with `{userId, template, data, priority, idempotencyKey}` — or, more commonly, services publish domain events (`BookingConfirmed`) that the platform maps to templates.",
          "Templates are versioned and localised; rendering happens in the platform, not in every service.",
          "User preferences: opt-in per category and channel, quiet hours with the user's time zone, verified contact points.",
          "Delivery log: notification id, user, channel, provider message id, status history (queued → sent → delivered / bounced / failed)."
        ] },
        { t: 'Architecture', ask: 'Draw the path from an event to a phone.', diagram: { kind: 'tiers', tiers: [
          { label: 'Sources', nodes: [{ t: 'Domain events', s: 'BookingConfirmed, PaymentReceived', tone: 'gray' }, { t: 'Campaign service', s: 'audience segments', tone: 'gray' }] },
          { label: 'Notification service', via: 'Kafka / API', nodes: [{ t: 'Intake', s: 'dedupe, preferences, quiet hours, rendering', tone: 'blue' }, { t: 'Scheduler', s: 'delayed and quiet-hour sends', tone: 'yellow' }] },
          { label: 'Queues by priority & channel', via: 'Kafka topics', bus: true, nodes: [{ t: 'critical', tone: 'red' }, { t: 'transactional', tone: 'orange' }, { t: 'marketing', tone: 'green' }] },
          { label: 'Channel workers', via: 'rate-limited', nodes: [{ t: 'E-mail workers', tone: 'purple' }, { t: 'SMS workers', tone: 'purple' }, { t: 'Push workers', tone: 'purple' }] },
          { label: 'Providers', via: 'circuit breakers + failover', nodes: [{ t: 'E-mail providers', tone: 'gray' }, { t: 'SMS gateways', tone: 'gray' }, { t: 'APNs / FCM', tone: 'gray' }] }
        ] }, points: [
          "Separate topics (and consumer groups) per priority, so a marketing campaign can never delay an OTP; within a topic, partition by user id to keep per-user order.",
          "Provider callbacks (delivered, bounced, complained) update the delivery log and feed suppression lists."
        ] },
        { t: 'Reliability: idempotency, retries, failover', ask: 'A service retries an event, a provider times out, a message is malformed. What happens?', points: [
          "**Deduplication**: the intake stores the idempotency key (or event id + template) with a unique constraint and a TTL, so a retried event never produces a second message.",
          "**At-least-once workers** with idempotent sends: record the attempt before calling the provider and use provider-side idempotency keys where available.",
          "**Retries** with exponential backoff through retry topics; poison messages go to a **dead-letter topic** with alerting — never block the partition.",
          "**Provider failover** behind a circuit breaker per provider; per-provider token-bucket limits match their contracts."
        ] },
        { t: 'Campaigns, scale and observability', ask: 'Marketing sends to 10 million users at 9 am. Then a user asks why they got nothing.', points: [
          "Campaigns are expanded by a batch job that pages through the audience segment and enqueues at a controlled rate, after preference and frequency-cap checks.",
          "Quiet hours become scheduled sends in the user's time zone — the scheduler releases them later instead of dropping them.",
          "Metrics: end-to-end latency per priority (event → provider accepted), provider error and bounce rates, queue lag, opt-out rate; alert on SLO burn.",
          "A per-user delivery timeline (*why didn't I get it?*: preference, quiet hours, bounce, provider failure) saves the support team hours."
        ] }
      ],
      followUps: [
        { q: "How do you guarantee an OTP is never delayed by a ten-million-user campaign?",
          a: "Physical isolation: a separate critical topic with its own consumer group and worker pool, reserved provider capacity (separate sender identities or quotas), and stricter SLO alerts. Campaigns are throttled at intake. Priority in a single shared queue is not enough — head-of-line blocking and shared rate limits would still let the campaign starve OTPs." },
        { q: "Provider webhooks arrive late, twice, or out of order.",
          a: "Treat them as events keyed by the provider's message id; apply them idempotently, and model delivery status as a state machine that only moves forward (`delivered` must not be overwritten by a late `sent`). Store raw callbacks for auditing and reconcile with provider reports when callbacks go missing." },
        { q: "The booking service retries its `BookingConfirmed` event three times after timeouts. How do you avoid three e-mails?",
          a: "Use the event id (or `bookingId + template`) as the idempotency key: the first arrival inserts it into the dedupe store inside the same transaction that enqueues the notification; later arrivals hit the unique constraint and are dropped. Keep the key for longer than the retry horizon (a day is typical)." }
      ],
      rubric: [
        "Quantifies load, peaks and per-priority latency targets.",
        "Separates intake, preference logic, queues per priority and channel workers.",
        "Guarantees no duplicates (idempotency keys) and no loss (at-least-once, retries, dead letters).",
        "Handles provider limits, failover and callbacks.",
        "Covers campaigns, quiet hours, observability and user-facing debuggability."
      ],
      notes: [
        "This design reuses ideas from the whole course: outbox events from the booking service, Kafka topics and consumer groups, idempotency keys, token-bucket limits (Session 16), circuit breakers and dead-letter topics (this session).",
        "Interviewers often probe one deep dive: deduplication, priority isolation or provider failover. Pick one and go deep with numbers and failure scenarios.",
        "Mention compliance briefly: unsubscribe links, consent records and regional rules for marketing messages are product requirements, not afterthoughts."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: Kafka, messaging & resilience',
      lead: 'Messaging questions test whether you understand guarantees precisely — ordering, duplicates, durability — and how failures propagate.',
      qa: [
        { level: 1, q: "Why use a message broker instead of direct HTTP calls between services?",
          a: "A broker decouples services in **time** and **availability**: producers keep working when consumers are slow or down, bursts are buffered instead of overloading consumers, and new consumers can subscribe to existing events without changing the producer. Kafka additionally keeps a durable, replayable log, so consumers can rebuild state or reprocess history. The costs: eventual consistency, an extra critical system to operate, harder debugging of asynchronous flows, and the need to handle duplicates and ordering explicitly. Use it for events and background work, not for requests where a user is waiting for an answer.",
          follow: ["When is a direct call still the better choice?"] },
        { level: 2, q: "How does Kafka guarantee ordering, and how do you choose the partition key?",
          a: "Order is guaranteed only **within a partition**: records from one producer to one partition are appended and read in order (with idempotence enabled, even across retries). So choose the key as the entity whose events must stay ordered — `bookingId` for booking events, `userId` for a user's notifications — and every event of that entity lands in the same partition. Trade-offs: a key that is too coarse (one huge tenant) creates a **hot partition**; one that is too fine (random) loses useful ordering. Increasing the partition count later remaps keys to different partitions, so ordering across the change is lost — plan the count up front.",
          follow: ["How would you handle one tenant producing half of all events?"] },
        { level: 2, q: "At-most-once, at-least-once and exactly-once — how do you get each with Kafka, and what does exactly-once really mean?",
          a: "**At-most-once**: commit offsets before processing — a crash loses the in-flight records. **At-least-once**: commit after processing (the usual choice) — a crash causes reprocessing, so consumers must be idempotent. **Exactly-once** in Kafka means an idempotent producer plus **transactions** that commit the produced records and the consumed offsets atomically, with consumers reading `read_committed` — so a consume-transform-produce pipeline within Kafka has no duplicates or losses. It does **not** extend to side effects outside Kafka (writing to MySQL, sending an e-mail, charging a card); those need idempotent handling keyed by event id, which gives *effectively-once* results on top of at-least-once delivery.",
          follow: ["How would you make a database write effectively once?"] },
        { level: 2, q: "How do `acks`, the replication factor and `min.insync.replicas` interact for durability?",
          a: "The **replication factor** (typically 3) is how many brokers hold each partition. `acks` is the producer's durability requirement: `0` (fire and forget), `1` (the leader wrote it — lost if the leader dies before followers copy it), or `all` (every in-sync replica has it). `min.insync.replicas` (typically 2) is the minimum ISR size for a write with `acks=all` to succeed. With RF 3, `min.insync.replicas` 2 and `acks=all`: one broker can fail without losing writes or availability; with two down, writes are **rejected** rather than accepted with a single copy. Unclean leader election (off by default) would trade data loss for availability.",
          follow: ["Why is `acks=all` with `min.insync.replicas=1` a trap?"] },
        { level: 2, q: "Consumer lag keeps growing. How do you diagnose and fix it?",
          a: [
            "**Measure where**: lag per partition (`kafka-consumer-groups.sh --describe`, or exported metrics). One partition lagging suggests a hot key or a poison message; all lagging suggests too little capacity.",
            "**Find the bottleneck**: slow processing (a slow database or downstream call), repeated rebalancing (processing longer than `max.poll.interval.ms`, unstable members), retries blocking a partition, GC pauses.",
            "**Fix**: speed up processing (batching, fewer round trips, caching), scale consumers up to the partition count, increase partitions if consumers are maxed out (keys remap — plan it), move retries to retry topics, and tune poll sizes and intervals.",
            "**Protect**: alert on lag growth and on time-based lag (age of the oldest unprocessed record), not just on absolute numbers."
          ],
          follow: ["Why doesn't adding a tenth consumer help a topic with eight partitions?"] },
        { level: 2, q: "What is a poison message, and how do you handle it in Spring Kafka?",
          a: "A record that fails processing every time — bad data, a bug, or a deserialization error. With naive retry-forever handling it blocks its partition, and everything behind it stops. In Spring Kafka, configure a `DefaultErrorHandler` with a bounded backoff and a `DeadLetterPublishingRecoverer` that sends the record (with exception headers) to a dead-letter topic after the retries, or use `@RetryableTopic` for **non-blocking** retries through dedicated retry topics so the main partition keeps flowing. Wrap deserializers in `ErrorHandlingDeserializer` so unreadable bytes also reach the error handler. Alert on dead-letter traffic and provide a way to inspect and replay those records after the fix.",
          follow: ["Why do non-blocking retries weaken ordering guarantees?"] },
        { level: 2, q: "Explain the transactional outbox. Why can't you simply send to Kafka inside the database transaction?",
          a: "Writing to the database and publishing to Kafka are two different systems with no shared transaction — the *dual-write* problem: commit the database and crash before publishing, and the event is lost; publish first and the transaction rolls back, and you announced something that never happened. The **outbox** writes the event into an `outbox` table **in the same database transaction** as the business change, and a separate relay publishes outbox rows to Kafka (polling with `SKIP LOCKED`, or reading the database log with change-data-capture such as Debezium), marking them sent. Delivery becomes at-least-once with ordering per aggregate, so consumers deduplicate by event id.",
          follow: ["How do you clean up the outbox table?"] },
        { level: 2, q: "Explain circuit-breaker states and the key Resilience4j settings. How does it interact with retries and timeouts?",
          a: "**Closed**: calls flow and outcomes are recorded in a sliding window (count- or time-based). When the failure rate (`failureRateThreshold`) or slow-call rate (`slowCallRateThreshold` with `slowCallDurationThreshold`) exceeds its threshold after `minimumNumberOfCalls`, it turns **open**: calls fail immediately (`CallNotPermittedException`) for `waitDurationInOpenState`. Then **half-open**: `permittedNumberOfCallsInHalfOpenState` trial calls decide whether to close or reopen. A **time limiter** turns slowness into failures the breaker can count. Resilience4j's default aspect order is Retry ( CircuitBreaker ( RateLimiter ( TimeLimiter ( Bulkhead ( call ) ) ) ) ), so each retry consults the breaker — configure the retry to ignore `CallNotPermittedException`, or an open breaker just burns retry attempts. Provide a fallback that degrades gracefully (cached data, *try again later*) rather than hiding errors.",
          follow: ["Why should business exceptions such as *not found* usually not count as failures?"] },
        { level: 3, q: "Kafka, RabbitMQ or SQS — when would you choose each?",
          a: "**Kafka**: a durable, partitioned, replayable log — high throughput, per-partition ordering, many independent consumer groups, event sourcing and stream processing (Kafka Streams); you pay with operational complexity (or a managed service) and coarser per-message semantics. **RabbitMQ**: a broker built around queues and flexible routing (exchanges, topics, headers), per-message acknowledgement and redelivery, priorities and low latency — great for task queues and request/response patterns; messages are usually gone once consumed. **SQS**: fully managed queues with visibility timeouts and dead-letter queues, near-zero operations, scaling without partitions; FIFO queues add ordering per message group with throughput limits. Choose by replay needs, ordering, fan-out, throughput and how much infrastructure you want to run.",
          follow: ["Which would you use for a job queue of image thumbnails, and why?"] },
        { level: 3, q: "A consumer charges customers' cards when it receives `PaymentRequested` events. Design it so each payment is charged exactly once in effect.",
          a: [
            "Accept that delivery is **at-least-once**: the same event may arrive twice (redelivery after a crash, a producer retry, a replay).",
            "Use the **event id** (or payment id) as an idempotency key end to end: in one database transaction, insert `processed_events(event_id)` (unique) and the payment record in state `PENDING`; a duplicate fails the insert and is skipped.",
            "Call the payment provider with the same key as its **idempotency key**, so a retry after a timeout returns the original charge instead of creating a new one.",
            "Record the provider's result; publish `PaymentSucceeded`/`PaymentFailed` through an **outbox** in the same transaction.",
            "Handle unknown outcomes (timeouts) by querying the provider's status endpoint, and run a daily reconciliation against provider settlement reports."
          ],
          follow: ["What happens if the provider does not support idempotency keys?"] }
      ],
      notes: [
        "Answer messaging questions in terms of guarantees and their scope: *ordered per partition*, *at-least-once, so the consumer is idempotent*, *exactly-once only within Kafka*.",
        "The outbox and idempotent-consumer patterns appear in almost every senior design round involving events — be ready to sketch the tables.",
        "For resilience questions, connect the pieces: timeouts make failures visible, circuit breakers stop hammering, bulkheads contain the damage, retries recover transient errors — and each needs correct ordering."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "A topic has 6 partitions and a consumer group has 8 consumers. What happens?",
      options: ['Six consumers each get a partition and two sit idle', 'Each partition is split between consumers', 'Kafka creates two extra partitions automatically', 'All 8 consumers receive every record'], answer: 0,
      why: "Within a group, each partition is consumed by exactly one member. Parallelism is capped by the partition count — size it for the consumer scale you expect." },
    { level: 2, q: "A partition has replication factor 3 and `min.insync.replicas=2`; producers use `acks=all`. Two of its brokers go down. What happens to writes?",
      options: ['They are rejected with a not-enough-replicas error until another replica is in sync', 'They succeed with a single copy', 'They are queued in the producer forever', 'Kafka promotes a new leader with data from another partition'], answer: 0,
      why: "With only one in-sync replica, `acks=all` writes cannot meet `min.insync.replicas`, so Kafka refuses them — choosing durability over availability, as configured." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                int[] a = {4, 2, 12, 3, 8, 1};
                int k = 2;
                Deque<Integer> dq = new ArrayDeque<>();
                List<Integer> out = new ArrayList<>();
                for (int i = 0; i < a.length; i++) {
                    if (!dq.isEmpty() && dq.peekFirst() <= i - k) dq.pollFirst();
                    while (!dq.isEmpty() && a[dq.peekLast()] <= a[i]) dq.pollLast();
                    dq.addLast(i);
                    if (i >= k - 1) out.add(a[dq.peekFirst()]);
                }
                System.out.println(out);
            }
        }`, out: '[4, 12, 12, 8, 8]' },
      options: ['`[4, 12, 12, 8, 8]`', '`[4, 2, 12, 3, 8]`', '`[12, 12, 12, 8, 8]`', '`[4, 12, 3, 8, 1]`'], answer: 0,
      why: "Windows of size 2: [4,2] → 4, [2,12] → 12, [12,3] → 12, [3,8] → 8, [8,1] → 8. The deque's front is always the current window's maximum." },
    { level: 3, q: "A listener commits offsets after processing. The service crashes after processing a record but before committing its offset. What happens on restart?",
      options: ['The record is delivered and processed again — so processing must be idempotent', 'The record is lost', 'Kafka detects the crash and skips the record', 'The consumer group is deleted'], answer: 0,
      why: "The committed offset still points at the record, so the new owner of the partition reads it again. That is at-least-once delivery; deduplicate by event id." },
    { level: 3, q: "Resilience4j's default aspect order is Retry ( CircuitBreaker ( … call ) ). The breaker is OPEN. What should the retry configuration do?",
      options: ['Not retry `CallNotPermittedException` — otherwise each attempt is rejected instantly and the retries are wasted', 'Retry faster to close the breaker sooner', 'Disable the circuit breaker', 'Retry forever until the breaker closes'], answer: 0,
      why: "An open breaker rejects calls immediately by design. Retrying those rejections adds load and latency without any chance of success; let the fallback handle them." }
  ]
});
