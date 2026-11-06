/* Interview pack — Session 19: Monolith vs microservices, service discovery & Feign */
COURSE.prep(19, {
  deepDives: [
    {
      title: 'Deep dive: distributed-systems fundamentals every backend interview assumes',
      lead: 'Once a call crosses the network, everything can be slow, lost, duplicated or reordered. These ideas are the vocabulary of every senior design discussion.',
      table: { head: ['Consistency model', 'Guarantee', 'Typical use'], rows: [
        ['Linearizable', 'Behaves like a single copy; every read sees the latest write', 'Account balances, locks, leader election'],
        ['Sequential / causal', 'Everyone sees operations in one order / cause before effect', 'Comment threads, collaborative editing'],
        ['Read-your-writes, monotonic reads', 'A user sees their own updates and never goes back in time', 'Profile edits, settings'],
        ['Eventual', 'Replicas converge if updates stop', 'Feeds, counters, search indexes, caches']
      ] },
      points: [
        "The **fallacies of distributed computing** — the network is reliable, latency is zero, bandwidth is infinite, the network is secure, topology does not change, there is one administrator, transport cost is zero, the network is homogeneous — each becomes an incident when ignored.",
        "**CAP**: during a network partition a replicated system must either refuse or delay some requests (consistency) or answer them, possibly with stale data (availability). **PACELC** adds the everyday case: *else*, without a partition, you still trade **latency** against **consistency**.",
        "Choose consistency **per use case**: money movements need strong guarantees; a timeline or search index tolerates seconds of staleness. One system usually contains both.",
        "**Timeouts everywhere**: a call without a timeout can hold a thread and a connection forever. Derive timeouts from the dependency's p99 and keep them below the caller's own deadline; propagate the remaining **deadline** down the call chain.",
        "**Retries amplify load**: three layers that each try three times turn one user request into up to 3³ = 27 calls on the bottom service during an outage. Retry at one layer only, with exponential backoff, jitter, a retry budget and only for idempotent operations.",
        "Exactly-once *delivery* over a network is impossible; real systems get *effectively once* behaviour from at-least-once delivery plus idempotent processing and deduplication."
      ],
      callout: { kind: 'interview', text: "When you say *eventually consistent* in an interview, immediately say how stale it can get, how users experience it, and how conflicts are resolved. Without those three, the phrase sounds like a hand-wave." },
      notes: [
        "A common CAP mistake is calling a single-node database *CP* or *AP* — CAP is about replicated systems under partition. Also, *P* is not optional: networks partition, so the real choice is between C and A when they do.",
        "Retry amplification is how small outages become big ones: the struggling service receives several times its normal load exactly when it can least handle it. Circuit breakers (Session 20) and retry budgets break that loop.",
        "Deadline propagation exists natively in gRPC; over HTTP you pass the remaining budget in a header and convert it into per-call timeouts in each service."
      ]
    }
  ],

  stretch: [
    "Add deadline propagation to the Feign calls: send the remaining time budget in a request header, derive each call's timeout from it, and fail fast once the budget is used up.",
    "Extract notifications from the Splitwise monolith with the strangler-fig pattern: publish `ExpenseAdded` through an outbox table, consume it in a new service, and shadow-compare its output with the monolith's for a day of test traffic.",
    "Load-test the Feign path with the downstream service slowed to 2 seconds, then show how timeouts and a bulkhead keep unrelated endpoints fast."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: how long until every service gets the update? (Dijkstra)',
      lead: 'LeetCode 743 with a platform framing: a configuration change spreads through a network of services with different propagation delays.',
      difficulty: 'Medium', minutes: 35, lc: 743, pattern: ['shortest-path', 'heap', 'graph'],
      problem: [
        "Services `1…n` form a directed network. `times[i] = [u, v, w]` means a configuration change reaches service `v` from service `u` after `w` milliseconds.",
        "Service `k` publishes a change. Return how long it takes until **every** service has it, or `-1` if some service never receives it."
      ],
      examples: [
        { in: 'times = [[2,1,1],[2,3,1],[3,4,1]], n = 4, k = 2', out: '2' },
        { in: 'times = [[1,2,1]], n = 2, k = 1', out: '1' },
        { in: 'times = [[1,2,1]], n = 2, k = 2', out: '-1', why: "Nothing leads from service 2 to service 1." }
      ],
      constraints: ["`1 ≤ k ≤ n ≤ 100`", "`1 ≤ times.length ≤ 6000`", "`0 ≤ w ≤ 100`"],
      hints: [
        "The moment a service receives the change is its shortest-path distance from k; the answer is the largest such distance.",
        "All weights are non-negative, so Dijkstra's algorithm with a min-heap of (distance, node) works.",
        "Instead of a decrease-key operation, push improved distances and skip stale heap entries when they are polled (lazy deletion)."
      ],
      approaches: [
        { name: 'BFS', idea: 'Level by level — only correct when every edge has the same weight', time: 'O(V + E)', space: 'O(V)' },
        { name: 'Bellman-Ford', idea: 'Relax every edge V − 1 times; also handles negative weights', time: 'O(V · E)', space: 'O(V)' },
        { name: 'Dijkstra + binary heap', idea: 'Always expand the closest unsettled node; lazy deletion of stale entries', time: 'O((V + E) log V)', space: 'O(V + E)' },
        { name: 'Floyd–Warshall', idea: 'All pairs at once — useful when many sources are queried', time: 'O(V³)', space: 'O(V²)' }
      ],
      code: { lang: 'java', file: 'NetworkDelay.java', src: code`
        import java.util.*;

        public class NetworkDelay {
            /** times[i] = {u, v, w}. Nodes 1..n. Returns -1 if some node is unreachable from k. */
            static int networkDelay(int[][] times, int n, int k) {
                List<List<int[]>> g = new ArrayList<>();
                for (int i = 0; i <= n; i++) g.add(new ArrayList<>());
                for (int[] t : times) g.get(t[0]).add(new int[] {t[1], t[2]});
                long[] dist = new long[n + 1];
                Arrays.fill(dist, Long.MAX_VALUE);
                dist[k] = 0;
                PriorityQueue<long[]> pq = new PriorityQueue<>(Comparator.comparingLong(x -> x[1]));
                pq.add(new long[] {k, 0});
                while (!pq.isEmpty()) {
                    long[] top = pq.poll();
                    int u = (int) top[0];
                    if (top[1] > dist[u]) continue;                         // stale entry: already improved
                    for (int[] e : g.get(u)) {
                        long nd = dist[u] + e[1];
                        if (nd < dist[e[0]]) { dist[e[0]] = nd; pq.add(new long[] {e[0], nd}); }
                    }
                }
                long worst = 0;
                for (int i = 1; i <= n; i++) worst = Math.max(worst, dist[i]);
                return worst == Long.MAX_VALUE ? -1 : (int) worst;
            }

            static int bellmanFord(int[][] times, int n, int k) {                // reference implementation
                long inf = Long.MAX_VALUE / 4;
                long[] d = new long[n + 1];
                Arrays.fill(d, inf);
                d[k] = 0;
                for (int round = 1; round < n; round++)
                    for (int[] t : times) if (d[t[0]] + t[2] < d[t[1]]) d[t[1]] = d[t[0]] + t[2];
                long worst = 0;
                for (int i = 1; i <= n; i++) worst = Math.max(worst, d[i]);
                return worst >= inf ? -1 : (int) worst;
            }

            public static void main(String[] args) {
                System.out.println(networkDelay(new int[][] {{2, 1, 1}, {2, 3, 1}, {3, 4, 1}}, 4, 2));
                System.out.println(networkDelay(new int[][] {{1, 2, 1}}, 2, 1));
                System.out.println(networkDelay(new int[][] {{1, 2, 1}}, 2, 2));
                // 1 config, 2 gateway, 3 auth, 4 booking, 5 payments, 6 search
                int[][] mesh = {{1, 2, 4}, {1, 3, 1}, {3, 2, 2}, {2, 4, 5}, {3, 5, 8}, {4, 5, 1}, {4, 6, 3}, {5, 6, 1}};
                System.out.println("config reaches every service after " + networkDelay(mesh, 6, 1) + " ms");

                Random rnd = new Random(743);
                for (int t = 0; t < 500; t++) {
                    int n = 1 + rnd.nextInt(8), m = rnd.nextInt(20);
                    int[][] times = new int[m][];
                    for (int i = 0; i < m; i++) times[i] = new int[] {1 + rnd.nextInt(n), 1 + rnd.nextInt(n), rnd.nextInt(21)};
                    int k = 1 + rnd.nextInt(n);
                    if (networkDelay(times, n, k) != bellmanFord(times, n, k)) throw new AssertionError(Arrays.deepToString(times));
                }
                System.out.println("500 random graphs: Dijkstra == Bellman-Ford");
            }
        }`, out: code`
        2
        1
        -1
        config reaches every service after 10 ms
        500 random graphs: Dijkstra == Bellman-Ford` },
      pitfalls: [
        "Using plain BFS on a weighted graph — it finds the fewest hops, not the shortest time.",
        "Overflow from adding a weight to an `Integer.MAX_VALUE` sentinel; use `long` or check before adding.",
        "Negative weights silently break Dijkstra; switch to Bellman-Ford if they can occur.",
        "Forgetting the unreachable case and returning a huge number instead of `-1`."
      ],
      followUps: [
        { q: "Allow at most K hops (LeetCode 787, cheapest flights within K stops).",
          a: "Run Bellman-Ford for exactly K + 1 rounds, relaxing from a **copy** of the previous round's distances so that a path never uses more edges than rounds. Alternatively run Dijkstra over (node, hops used) states, or BFS by layers with pruning. Plain Dijkstra fails because the cheapest path may use too many hops." },
        { q: "The latencies are measured live and change every few seconds.",
          a: "With 100 nodes, recomputing Dijkstra on every change is cheap. At larger scale use periodic recomputation or incremental shortest-path algorithms; in practice, service meshes and gossip protocols propagate configuration with bounded fan-out and retries rather than computing global shortest paths." },
        { q: "How does this relate to latency in microservices?",
          a: "A request's call graph is a set of paths, and end-to-end latency is driven by the slowest chain of dependent calls — the critical path. Distributed tracing (Session 24) shows that path; reducing a call that is not on it barely helps." }
      ],
      rubric: [
        "Maps the problem to single-source shortest paths and the answer to the maximum distance.",
        "Implements Dijkstra with a heap and handles stale entries correctly.",
        "Handles unreachable nodes and overflow, and states when Dijkstra does not apply.",
        "Verifies against a simpler algorithm or hand-computed cases."
      ],
      notes: [
        "Trace the platform example by hand once: auth gets the change at 1 ms, the gateway at 3 ms through auth (not 4 ms directly), booking at 8 ms, payments at 9 ms and search at 10 ms — the maximum is 10 ms.",
        "The random test compares Dijkstra with Bellman-Ford on 500 graphs that include zero-weight edges, self-loops and parallel edges — exactly the cases where hand-written solutions tend to break.",
        "Lazy deletion keeps the code short and is the standard interview implementation; an indexed heap with decrease-key is faster in theory but rarely needed."
      ]
    },
    {
      type: 'design',
      title: 'Design round: break the Splitwise monolith into microservices',
      lead: 'A classic senior-level discussion: not *how to build microservices*, but whether, where and how to migrate — without stopping the business.',
      kind: 'HLD', difficulty: 'Hard', minutes: 45,
      prompt: "Splitwise began as one Spring Boot application with one MySQL database: users, groups, expenses, balances, notifications and payments. Traffic has grown fifty-fold, five teams now share the codebase, and deployments take hours. Plan the move to microservices: what to extract first, how to split the data, and how to migrate without downtime. Also say when you would not do this.",
      stages: [
        { t: 'Is it worth it?', ask: 'What problems are you solving, and what cheaper options exist?', points: [
          "Real pain: teams block each other's deployments, the hot paths (balances, notifications) need different scaling from the rest, and one bug takes everything down.",
          "Cheaper first steps: a **modular monolith** with enforced module boundaries (ArchUnit rules or Spring Modulith), read replicas, caching, and a faster CI pipeline.",
          "Microservices pay off when independent deployment and scaling matter more than their cost: distributed failure modes, eventual consistency, platform and on-call overhead."
        ] },
        { t: 'Find the bounded contexts', ask: 'Where are the natural seams, and who owns which data?', diagram: { kind: 'graph', cw: 200, ch: 100, bw: 160, nodes: [
          { id: 'id', t: 'Identity', s: 'users, auth', x: 0, y: 0, tone: 'blue' },
          { id: 'grp', t: 'Groups', s: 'groups, membership', x: 1, y: 0, tone: 'green' },
          { id: 'exp', t: 'Expenses', s: 'expenses, splits', x: 2, y: 0, tone: 'orange' },
          { id: 'led', t: 'Ledger', s: 'balances, settlements', x: 2, y: 1, tone: 'purple' },
          { id: 'pay', t: 'Payments', s: 'settle-up via PSP', x: 1, y: 1, tone: 'red' },
          { id: 'ntf', t: 'Notifications', s: 'e-mail, push', x: 0, y: 1, tone: 'gray' }
        ], edges: [['grp', 'id', 'who'], ['exp', 'grp', 'members?'], ['exp', 'led', 'ExpenseAdded'], ['pay', 'led', 'SettlementPaid'], ['led', 'ntf', 'BalanceChanged']] },
        table: { head: ['Context', 'Owns', 'Publishes'], rows: [
          ['Identity', 'users, credentials', '`UserRegistered`, `UserRenamed`'],
          ['Groups', 'groups, members, roles', '`MemberJoined`, `MemberLeft`'],
          ['Expenses', 'expenses, splits', '`ExpenseAdded`, `ExpenseReversed`'],
          ['Ledger', 'balances, settlements', '`BalanceChanged`'],
          ['Payments', 'payment intents, provider references', '`SettlementPaid`, `SettlementFailed`'],
          ['Notifications', 'templates, delivery log', '—']
        ] } },
        { t: 'Data ownership and communication', ask: 'How do services share data without sharing tables?', points: [
          "**Database per service**: no service reads another's tables; that coupling is what makes a *distributed monolith*.",
          "**Synchronous** REST/Feign only where a user request needs an answer now (e.g. *is this user a member of the group?*), always with timeouts and circuit breakers.",
          "**Asynchronous events** over Kafka for propagation (`ExpenseAdded` → Ledger updates balances → Notifications), published reliably with a **transactional outbox**.",
          "Cross-service views (the group page) come from API composition in a BFF, or from a read model built from events (CQRS)."
        ] },
        { t: 'Migration: the strangler fig', ask: 'In which order do you extract, and how do you make each step reversible?', diagram: { kind: 'flow', dir: 'v', nodes: [
          { t: '1. Modularise inside the monolith', s: 'clear module APIs, no cross-module table access', tone: 'gray' },
          { t: '2. Put a gateway in front', s: 'all routes still go to the monolith', tone: 'blue' },
          { t: '3. Extract Notifications', s: 'low risk, asynchronous; monolith publishes events via outbox', tone: 'green' },
          { t: '4. Extract the Ledger', s: 'shadow-compute balances from events, compare, then switch reads, then writes', tone: 'orange' },
          { t: '5. Move the data', s: 'CDC (e.g. Debezium) backfills and syncs; then the new service owns its tables', tone: 'purple' },
          { t: '6. Repeat, then retire the old code', s: 'each step behind a feature flag or route switch', tone: 'red' }
        ] }, points: [
          "Extract the context with the clearest boundary and lowest risk first, to build the platform (CI/CD, observability, contracts) before the risky moves.",
          "Use an **anti-corruption layer** to translate between the monolith's model and the new service's model.",
          "Make every step reversible: route switches in the gateway, dual-running with comparison, and data synchronisation in both directions during the cut-over."
        ] },
        { t: 'Operations, risks and success criteria', ask: 'How do you know the migration is working — and what can go wrong?', points: [
          "Observability first: distributed tracing across the monolith and new services, correlated logs, per-service SLOs.",
          "Contract tests between services and for events; a schema registry with compatibility rules if events use Avro or Protobuf.",
          "Consistency is now eventual: the UI shows *updating balances…*, and reconciliation jobs compare the ledger with expense history.",
          "Team ownership mirrors the architecture (Conway's law): each team owns a service end to end, including on-call.",
          "Measure the outcome with DORA metrics — deployment frequency, lead time, change-failure rate and time to restore — not with the number of services."
        ] }
      ],
      followUps: [
        { q: "The expense page needs user names, which belong to Identity. How do you get them?",
          a: "Either compose at read time — the BFF calls Identity in batch (`GET /users?ids=…`) with caching — or let Expenses keep a small local copy of the fields it needs (`user_id → display_name`), updated from `UserRenamed` events and accepted as eventually consistent. Never join against Identity's tables." },
        { q: "Expense events can arrive twice or out of order. How do balances stay correct?",
          a: "Make consumers idempotent — record processed event ids (a unique constraint) in the same transaction as the balance update. Preserve per-group ordering by using the group id as the Kafka partition key, and add a version per aggregate so stale events are ignored. Run a reconciliation job that recomputes balances from expense history and alerts on any difference." },
        { q: "When would you stop and keep a modular monolith?",
          a: "When there are only a few teams, no part needs independent scaling, the organisation lacks the platform (automated deployment, observability, on-call) to operate many services, or the domain needs strong transactions across contexts. Microservices are an organisational scaling tool with a large operational tax; a well-modularised monolith keeps the option to extract later." }
      ],
      rubric: [
        "Questions whether microservices are needed and considers a modular monolith.",
        "Identifies sensible bounded contexts with clear data ownership.",
        "Chooses sync versus async deliberately and publishes events reliably (outbox or CDC).",
        "Plans an incremental, reversible migration (strangler fig, shadow comparison, route switches).",
        "Covers operational readiness: tracing, contracts, ownership and outcome metrics."
      ],
      notes: [
        "The strongest answers start with *why*, and end with *how we will know it worked*. Interviewers are wary of candidates who propose 20 services for a problem a modular monolith would solve.",
        "Extracting the hot path (the ledger) last-but-not-first is deliberate: by then the team has built the platform and the event infrastructure on lower-risk services.",
        "Shadow comparison — running old and new implementations on the same input and comparing results before switching — is the single most effective technique for safe migrations."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: microservices, distribution & service calls',
      lead: 'Architecture questions where interviewers expect trade-offs, failure modes and numbers — not buzzwords.',
      qa: [
        { level: 1, q: "What problems do microservices solve, and what do they cost?",
          a: "They let teams **deploy independently**, **scale** hot components separately, choose fitting technology per service, and contain failures — mainly organisational benefits for many teams working on one product. The costs are substantial: every call becomes a network call that can be slow or fail, transactions across services need sagas and eventual consistency, debugging needs distributed tracing, data is duplicated across services, and you need a platform for deployment, configuration, discovery, observability and on-call per service. A well-structured modular monolith is usually the better starting point; extract services when a concrete pain (deployment coupling, scaling, team autonomy) justifies the tax.",
          follow: ["What is a distributed monolith?"] },
        { level: 2, q: "What is a bounded context, and how do you find service boundaries?",
          a: "A bounded context (from domain-driven design) is a part of the domain with its own consistent model and language — *Expense* means something precise in the expense context, while *Booking* in a hotel system means something different in payments versus inventory. Service boundaries should follow these contexts: high cohesion inside, few and explicit interactions across. Techniques: event storming with domain experts, looking for where the language changes, which data changes together (it belongs together), which parts change at different rates or are owned by different teams, and which transactions must be atomic (keep them inside one service). Boundaries drawn around technical layers or individual tables lead to chatty, tightly coupled services.",
          follow: ["Why are boundaries around database tables a bad idea?"] },
        { level: 2, q: "Synchronous REST or asynchronous messaging between services — what are the trade-offs?",
          a: "**Synchronous** calls are simple to reason about and give an immediate answer, but they couple availability and latency: if the downstream is slow or down, the caller is too, and long chains multiply latency and failure probability. **Asynchronous** messaging decouples services in time — producers keep working when consumers are down, load is buffered, and many consumers can react to one event — at the cost of eventual consistency, harder debugging and the need for idempotent consumers and ordering guarantees. Use sync for queries a user is waiting on and commands that need an immediate yes/no; use events for propagating facts (*expense added*), notifications, and work that can happen later.",
          follow: ["How would you get a response back from an asynchronous request?"] },
        { level: 2, q: "Explain CAP correctly. Where do MySQL replication and Eureka sit?",
          a: "CAP says that when a network **partition** separates replicas, a system must choose between **consistency** (every read sees the latest write — so some requests are refused or delayed) and **availability** (every request gets an answer — possibly stale). It only applies to replicated systems during partitions; a single database node is not a CAP example. MySQL with asynchronous replication can serve stale reads from replicas and may lose recent writes on failover — it trades consistency for availability and latency unless you read from the primary and use semi-synchronous replication. **Eureka** is designed to favour availability: clients cache the registry, and *self-preservation* keeps registrations when many heartbeats stop at once, preferring possibly stale entries over an empty registry. ZooKeeper and etcd choose consistency (a majority quorum is required).",
          follow: ["What does PACELC add?"] },
        { level: 2, q: "How do you configure timeouts and retries for a Feign or HTTP client call?",
          a: "Set a short **connect timeout** (hundreds of milliseconds) and a **read timeout** derived from the dependency's p99 latency with some headroom, always below the caller's own deadline. Retry only **idempotent** operations (or ones protected by an idempotency key), at **one** layer of the stack, with exponential backoff and jitter, a small maximum number of attempts and ideally a retry budget (for example at most 10% extra traffic). Combine with a circuit breaker so retries stop when the dependency is clearly down, and record metrics for timeouts and retries per dependency. In Spring Cloud OpenFeign, timeouts are configured per client (`spring.cloud.openfeign.client.config.<name>.connect-timeout` and `read-timeout`).",
          follow: ["Why is retrying at every layer dangerous?"] },
        { level: 2, q: "A downstream service becomes slow — not down. Explain how that cascades, and how bulkheads help.",
          a: "Slow is worse than down: requests to the slow dependency hold threads and connections while they wait, so the caller's thread pool fills up, and then *all* of its endpoints — including ones that never touch the slow dependency — start queueing and timing out. Its own callers then suffer the same fate, and the failure spreads up the call graph. **Timeouts** bound how long each request waits; **bulkheads** give each dependency its own limited pool of threads or concurrent calls (a semaphore), so a slow dependency can exhaust only its own compartment; **circuit breakers** fail fast once the failure or slow-call rate crosses a threshold, giving the dependency room to recover; **load shedding** rejects excess work early.",
          follow: ["How do virtual threads change the bulkhead picture?"] },
        { level: 3, q: "Design deadline propagation across a five-service call chain.",
          a: [
            "The edge sets a **deadline** for the whole request (say 800 ms) and passes it downstream as an absolute timestamp or a remaining budget in a header (gRPC does this natively).",
            "Each service computes the time left, subtracts a small margin for its own work, and uses that as the timeout for each outbound call — never a fixed timeout larger than the remaining budget.",
            "If the budget is already used up (or too small to be useful), **fail fast** instead of starting work whose result nobody will wait for.",
            "Propagate **cancellation**: when the caller gives up, downstream work should stop too (cancel futures, close streams).",
            "Record budget exhaustion in metrics and traces, so you can see which hop consumes the time."
          ],
          follow: ["Why is an absolute deadline sensitive to clock skew, and how do you handle that?"] },
        { level: 3, q: "Client-side or server-side service discovery and load balancing — what are the trade-offs?",
          a: "**Client-side**: services register in a registry (Eureka, Consul); callers fetch the instance list and choose an instance themselves (Spring Cloud LoadBalancer) — no extra network hop and rich, application-aware strategies, but every language needs a client library, and caches can route to dead instances until they refresh. **Server-side**: callers use one stable address — a load balancer, a Kubernetes Service, or a service-mesh sidecar — that discovers and balances for them: language-agnostic and centrally managed, at the cost of an extra hop (mitigated by sidecars) and less application context. On Kubernetes, platform discovery plus a mesh is the common choice; Eureka-style discovery remains common on VMs and in Spring Cloud estates.",
          follow: ["Why can DNS-based discovery route traffic to dead instances?"] },
        { level: 2, q: "The booking service saved a booking, but its call to the payment service timed out. What now?",
          a: "A timeout means the outcome is **unknown** — the payment may or may not have happened. Do not blindly retry a non-idempotent charge. The call should carry an **idempotency key** (for example the booking id), so a retry is safe: the payment service returns the original result if it already processed it. Mark the booking `PAYMENT_PENDING`, retry with backoff or query the payment status endpoint, and if the payment ultimately fails, run a **compensating action** (release the dates, cancel the booking) — the saga pattern from Session 22. Better still, make the interaction asynchronous: publish a `BookingCreated` event through an outbox and react to `PaymentSucceeded`/`PaymentFailed` events.",
          follow: ["What would a reconciliation job check?"] },
        { level: 3, q: "How do independently deployed services evolve their APIs and events without breaking each other?",
          a: "Prefer **backward-compatible** changes: add optional fields, never remove or rename without a deprecation window, and make consumers tolerant of unknown fields and new enum values. For breaking changes, use **expand and contract**: add the new field or endpoint, migrate consumers, then remove the old one. Protect it with **consumer-driven contract tests** in each provider's CI, versioned endpoints where necessary, and for events a **schema registry** with compatibility rules (backward, forward or full) for Avro or Protobuf schemas. Publish a deprecation policy, measure who still uses old versions, and never deploy a change that requires all services to be deployed at the same moment.",
          follow: ["What is the difference between backward and forward compatibility for event schemas?"] }
      ],
      notes: [
        "In architecture interviews, every claim should come with a trade-off and a failure mode. *We use Kafka* is a statement; *we use Kafka so the booking flow keeps working when notifications are down, at the cost of eventual consistency* is an answer.",
        "The retry-amplification and slow-dependency questions are favourites because they separate people who have operated distributed systems from people who have only read about them.",
        "For CAP, the precise statement (partitions, replicated systems, choose C or A during them) matters more than labelling products."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "Three service layers each try a failing call up to 3 times (1 attempt + 2 retries). During an outage of the bottom service, how many calls can a single user request cause there?",
      options: ['3', '9', '27', '6'], answer: 2,
      why: "Each of the 3 attempts at the top makes 3 attempts in the middle, each of which makes 3 at the bottom: 3 × 3 × 3 = 27. Retry at one layer only and use retry budgets." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                // edges: A->B 10, A->C 1, C->B 2
                Map<String, Map<String, Integer>> g = Map.of("A", Map.of("B", 10, "C", 1), "C", Map.of("B", 2), "B", Map.of());
                Map<String, Integer> dist = new TreeMap<>(Map.of("A", 0));
                PriorityQueue<Map.Entry<String, Integer>> pq = new PriorityQueue<>(Map.Entry.comparingByValue());
                pq.add(Map.entry("A", 0));
                while (!pq.isEmpty()) {
                    var e = pq.poll();
                    if (e.getValue() > dist.get(e.getKey())) continue;
                    g.get(e.getKey()).forEach((v, w) -> {
                        int nd = e.getValue() + w;
                        if (nd < dist.getOrDefault(v, Integer.MAX_VALUE)) { dist.put(v, nd); pq.add(Map.entry(v, nd)); }
                    });
                }
                System.out.println(dist);
            }
        }`, out: '{A=0, B=3, C=1}' },
      options: ['`{A=0, B=3, C=1}`', '`{A=0, B=10, C=1}`', '`{A=0, B=12, C=1}`', '`{A=0, C=1}`'], answer: 0,
      why: "Dijkstra settles C at distance 1 first and then improves B from 10 to 1 + 2 = 3; the stale entry (B, 10) is skipped when polled." },
    { level: 3, q: "Eureka's self-preservation mode keeps instance registrations when many heartbeats stop arriving at once. Which preference does that reflect?",
      options: ['Availability over consistency — possibly stale entries rather than an empty registry', 'Consistency over availability', 'Lower latency at the cost of durability', 'Exactly-once delivery'], answer: 0,
      why: "A sudden mass loss of heartbeats is more likely a network problem than mass failure, so Eureka keeps serving its (possibly stale) view; clients must cope with occasional dead instances via retries and timeouts." },
    { level: 2, q: "Which interaction style best fits *send a welcome e-mail after a user signs up*?",
      options: ['An asynchronous `UserRegistered` event consumed by the notification service', 'A synchronous call from the sign-up endpoint that waits for the e-mail to be sent', 'A nightly batch job', 'A shared database table both services poll'], answer: 0,
      why: "The user does not need to wait for the e-mail, and sign-up should not fail because the e-mail provider is slow. An event (published reliably with an outbox) decouples the two." },
    { level: 3, q: "A team splits a monolith into services that still share one MySQL schema and read each other's tables. What is the main problem?",
      options: ['The services remain coupled through the schema, so they cannot change or deploy independently — a distributed monolith', 'MySQL cannot handle connections from several services', 'Foreign keys stop working', 'Transactions become faster than before'], answer: 0,
      why: "Shared tables make every schema change a coordinated release across services, while adding network failure modes. Each service should own its data and expose it through APIs or events." }
  ]
});
