/* Interview pack — Session 23: API gateway, Docker, scaling & deployment */
COURSE.prep(23, {
  deepDives: [
    {
      title: 'Deep dive: zero-downtime deployments — probes, graceful shutdown & rollout strategies',
      lead: 'Deploying ten times a day without failing a single request is an engineering discipline. These are the mechanisms interviewers expect you to know.',
      points: [
        "**Readiness** — may this instance receive traffic now? Failing it removes the instance from load balancing. **Liveness** — is the process stuck beyond repair? Failing it restarts the container. **Startup** probes give slow starters time before liveness kicks in. Never make liveness depend on downstream services, or one database outage restarts your whole fleet.",
        "Spring Boot exposes `/actuator/health/liveness` and `/actuator/health/readiness`, and readiness switches to *refusing traffic* while the application shuts down.",
        "**Graceful shutdown** on SIGTERM: stop accepting new requests, finish in-flight ones within `spring.lifecycle.timeout-per-shutdown-phase`, then close pools. In Kubernetes, removing a pod from the endpoints is asynchronous, so a short `preStop` sleep lets load balancers stop routing to the pod before it stops listening.",
        "**Rollouts**: rolling (replace a few pods at a time — `maxSurge`/`maxUnavailable`), blue-green (switch all traffic between two full environments — instant rollback, double capacity), canary (1% → 10% → 50% with automated metric analysis), plus **feature flags** to decouple deploying code from releasing features.",
        "**Database changes** follow expand → migrate → contract: add the new column (nullable), deploy code that writes both and reads new-with-fallback, backfill, switch reads, stop writing the old column, then drop it — every step works with old and new versions running side by side.",
        "Rollback must be boring: keep the previous image, keep the schema backward compatible, and let canary analysis (error rate, latency, SLO burn) trigger it automatically."
      ],
      code: { lang: 'yaml', file: 'deployment.yaml (excerpt)', src: code`
        spec:
          strategy:
            rollingUpdate: { maxSurge: 25%, maxUnavailable: 0 }       # never drop below full capacity
          template:
            spec:
              terminationGracePeriodSeconds: 45                       # > preStop + shutdown timeout
              containers:
                - name: booking-service
                  image: registry.example.com/booking-service:1.42.0
                  env:
                    - name: JAVA_TOOL_OPTIONS
                      value: "-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
                    - name: SERVER_SHUTDOWN
                      value: graceful
                  startupProbe:
                    httpGet: { path: /actuator/health/liveness, port: 8080 }
                    failureThreshold: 30
                    periodSeconds: 2                                    # up to 60 s to start
                  readinessProbe:
                    httpGet: { path: /actuator/health/readiness, port: 8080 }
                    periodSeconds: 5
                  livenessProbe:
                    httpGet: { path: /actuator/health/liveness, port: 8080 }   # no downstream checks here
                    periodSeconds: 10
                  lifecycle:
                    preStop:
                      exec: { command: ["sh", "-c", "sleep 10"] }       # let endpoints update first` },
      notes: [
        "The ordering matters during a pod shutdown: Kubernetes sends SIGTERM and removes the pod from service endpoints at roughly the same time, but proxies and load balancers learn about the removal with a delay. The `preStop` sleep keeps the app serving during that window; graceful shutdown then drains in-flight requests; `terminationGracePeriodSeconds` must cover both, or the pod is killed mid-request.",
        "`maxUnavailable: 0` with a surge means capacity never drops during a rollout — at the cost of temporarily running extra pods, so leave headroom in the cluster and in database connection limits.",
        "Expand/contract is the database version of backward compatibility. Tools such as Flyway run the expand migrations automatically; the contract step is a separate, later migration once no running version uses the old column."
      ]
    },
    {
      title: 'Deep dive: containers & the JVM — memory limits, CPU quotas and image hygiene',
      lead: 'Most *mysterious* production problems with containerised Java services are configuration mismatches between the JVM and the container.',
      table: { head: ['Symptom', 'Likely cause', 'Fix'], rows: [
        ['Pod killed with exit code 137, no `OutOfMemoryError` logged', 'Kernel OOM kill: heap + non-heap memory exceeded the container limit', 'Heap at ~60–75% of the limit; check native memory (NMT); raise the limit'],
        ['`OutOfMemoryError: Java heap space`', 'Heap too small for the load, or a leak', 'Heap dump on OOM, dominator tree; size the heap'],
        ['p99 spikes in a regular pattern, CPU not saturated on average', 'CPU throttling by the container\'s CPU quota', 'Raise or remove the CPU limit (keep requests), fewer GC/JIT threads'],
        ['Slow startup, failing liveness during deploys', 'Class loading and JIT warm-up with little CPU', 'Startup probe, CDS/AOT cache, more CPU during startup'],
        ['Large images, slow pulls, many CVEs', 'Full JDK and OS packages in the image', 'Multi-stage builds, minimal JRE (`jlink`) or distroless base, pinned digests, scanning']
      ] },
      points: [
        "The JVM reads container limits: by default the maximum heap is **25%** of the memory limit (`MaxRAMPercentage`). Raise it to about 60–75%, leaving room for metaspace, thread stacks, the code cache, direct buffers and the OS.",
        "CPU limits are enforced per scheduling period (100 ms by default): a JVM running many GC and JIT threads can use its quota early in the period and then stall — latency spikes without high average CPU. `availableProcessors()` follows the limit and sizes GC threads and the common pool.",
        "Faster startup: layered JARs for cache-friendly image layers, class-data sharing and the AOT cache (JDK 24+), or GraalVM native images when scale-to-zero matters.",
        "Image hygiene: small bases, run as a non-root user, never bake secrets into layers, pin base images by digest, scan for vulnerabilities in CI and publish an SBOM.",
        "One process per container, logs to stdout, configuration from the environment, secrets mounted at run time from a secret manager."
      ],
      notes: [
        "Exit code 137 means the process received SIGKILL (128 + 9) — typically from the kernel's OOM killer when the container exceeds its memory limit. The JVM never gets a chance to throw `OutOfMemoryError` or write a heap dump, which is why native-memory tracking (`-XX:NativeMemoryTracking=summary`) and container metrics are the tools here.",
        "`-XX:+ExitOnOutOfMemoryError` makes a JVM that does hit a heap OOM exit immediately, so the orchestrator restarts it instead of leaving a half-broken process serving errors.",
        "Many teams set CPU requests but no CPU limits for latency-sensitive Java services, relying on requests for scheduling fairness — measure throttling (`container_cpu_cfs_throttled_seconds_total`) before and after deciding."
      ]
    }
  ],

  stretch: [
    "Add readiness and liveness probes plus a 10-second `preStop` sleep to the booking service, run a rolling deploy under load (k6 or wrk) and prove that zero requests fail.",
    "Configure a 5% weight-based canary route in Spring Cloud Gateway and an automated rollback rule based on the canary's 5xx rate.",
    "Build the booking service image with a `jlink`-trimmed JRE on a distroless base, run it as non-root, and compare image size and startup time with the default image."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: smooth weighted round-robin (and power of two choices)',
      lead: 'Load balancers interleave servers by weight without bursts — the algorithm Nginx uses — and adaptive balancers sample loads. Implement one, reason about the other.',
      difficulty: 'Medium', minutes: 35, pattern: ['greedy', 'design'],
      problem: [
        "Implement `next()` for a pool of servers with integer weights so that in every window of `sum(weights)` picks each server is chosen exactly `weight` times — and the picks are **spread out**: for weights a = 5, b = 1, c = 1, the sequence `a a a a a b c` is wrong because it sends five requests in a row to one server.",
        "Then explain why static weights are not enough when servers slow down, and how *least connections* and *power of two choices* adapt."
      ],
      examples: [
        { in: 'weights a = 5, b = 1, c = 1; 7 picks', out: 'a a b a c a a' },
        { in: '700 further picks', out: 'a = 500, b = 100, c = 100' }
      ],
      constraints: ["Up to 1,000 servers, weights 1–100", "`next()` is called concurrently from many threads", "Weights may change at run time (follow-up)"],
      hints: [
        "Expanding each server `weight` times into a list and cycling through it is exact but bursty. How could you interleave instead?",
        "Keep a *current* score per server. On every pick add each server's weight to its score, choose the highest score, then subtract the total weight from the winner.",
        "The scores always sum to zero after each pick, and after `total` picks they return to their starting values — so every server wins exactly `weight` times per cycle."
      ],
      approaches: [
        { name: 'Expanded list', idea: 'Repeat each server weight times and cycle through the list', time: 'O(1) per pick', space: 'O(total weight) — bursty' },
        { name: 'Random weighted', idea: 'Prefix sums of weights + binary search on a random number', time: 'O(log n) per pick', space: 'O(n) — smooth on average, but random variance' },
        { name: 'Smooth WRR (Nginx)', idea: 'Add weights to current scores, pick the max, subtract the total from the winner', time: 'O(n) per pick', space: 'O(n) — exact and interleaved' },
        { name: 'Power of two choices', idea: 'Sample two servers, send to the one with fewer in-flight requests', time: 'O(1) per pick', space: 'O(n) — adapts to real load' }
      ],
      code: { lang: 'java', file: 'LoadBalancers.java', src: code`
        import java.util.*;

        public class LoadBalancers {
            /** Nginx's smooth weighted round-robin: interleaves picks instead of bursting the heaviest server. */
            static final class SmoothWeightedRoundRobin {
                private final String[] names;
                private final int[] weight, current;
                private final int total;

                SmoothWeightedRoundRobin(LinkedHashMap<String, Integer> weights) {
                    names = weights.keySet().toArray(String[]::new);
                    weight = weights.values().stream().mapToInt(Integer::intValue).toArray();
                    current = new int[names.length];
                    total = Arrays.stream(weight).sum();
                }

                synchronized String next() {
                    int best = 0;
                    for (int i = 0; i < names.length; i++) {
                        current[i] += weight[i];                       // every server gains its weight
                        if (current[i] > current[best]) best = i;
                    }
                    current[best] -= total;                            // the winner pays the total back
                    return names[best];
                }
            }

            public static void main(String[] args) {
                LinkedHashMap<String, Integer> w = new LinkedHashMap<>();
                w.put("a", 5); w.put("b", 1); w.put("c", 1);
                SmoothWeightedRoundRobin lb = new SmoothWeightedRoundRobin(w);
                StringBuilder seq = new StringBuilder();
                for (int i = 0; i < 7; i++) seq.append(lb.next()).append(' ');
                System.out.println("weights a=5 b=1 c=1 -> " + seq.toString().trim());
                Map<String, Integer> counts = new TreeMap<>();
                for (int i = 0; i < 700; i++) counts.merge(lb.next(), 1, Integer::sum);
                System.out.println("700 more picks: " + counts);

                Random rnd = new Random(23);                           // balls into bins: 100,000 requests, 100 servers
                int servers = 100, requests = 100_000;
                int[] random = new int[servers], twoChoices = new int[servers];
                for (int i = 0; i < requests; i++) {
                    random[rnd.nextInt(servers)]++;
                    int x = rnd.nextInt(servers), y = rnd.nextInt(servers);
                    twoChoices[twoChoices[x] <= twoChoices[y] ? x : y]++;
                }
                System.out.println("max requests on one server (ideal 1000): random = " + Arrays.stream(random).max().getAsInt()
                        + ", power of two choices = " + Arrays.stream(twoChoices).max().getAsInt());
            }
        }`, out: code`
        weights a=5 b=1 c=1 -> a a b a c a a
        700 more picks: {a=500, b=100, c=100}
        max requests on one server (ideal 1000): random = 1072, power of two choices = 1002` },
      pitfalls: [
        "The bursty expanded-list version passes a *proportions* test but overloads the heavy server's queue in practice.",
        "Unsynchronised updates of the current scores from concurrent requests corrupt the rotation — lock, or keep a balancer per thread or event loop.",
        "Changing weights mid-cycle without resetting the current scores can starve or flood a server for a while.",
        "Static weights ignore real load: a server that slows down (GC, noisy neighbour) still gets its full share and builds a queue."
      ],
      followUps: [
        { q: "Servers fail health checks and later recover. What changes?",
          a: "Remove failing servers from the rotation — active health checks plus passive outlier detection after consecutive errors. On recovery, ramp the server's weight up gradually (*slow start*), because a freshly started JVM is cold (no JIT-compiled code, empty caches) and would be flooded by its full share immediately." },
        { q: "The application needs sticky sessions.",
          a: "Route by consistent hashing on a session or user id, so changes to the server set move only a small share of sessions (Session 15's ring). Better still, make the service stateless — keep sessions in Redis — so any instance can serve any request and deploys do not log users out." },
        { q: "Why does *power of two choices* improve the maximum load so much?",
          a: "With purely random assignment the most loaded server exceeds the average by an amount that grows like log n / log log n; picking the less loaded of **two** random servers shrinks that excess to about log log n — a huge improvement with no global state, only two load samples. The verified run above shows it: 1,072 versus 1,002 requests on the busiest of 100 servers. Envoy's least-request balancer uses this idea by default." }
      ],
      rubric: [
        "Recognises the burst problem and arrives at smooth WRR (or an equivalent interleaving).",
        "Implements it correctly and thread-safely, and explains why the proportions are exact.",
        "Discusses health checks, slow start and weight changes.",
        "Explains when adaptive strategies (least connections, power of two choices) beat static weights."
      ],
      notes: [
        "Trace the first picks by hand: scores start at 0, a wins with 5 and drops to −2, wins again with 3 and drops to −4, then b and c get their turns as their scores catch up — producing `a a b a c a a`.",
        "The balls-into-bins experiment is deterministic (seeded) and compiled and run by the course test suite.",
        "Weighted round-robin fits when servers differ in fixed capacity (bigger machines). When load varies with request cost, prefer least outstanding requests or latency-aware balancing (exponentially weighted moving averages)."
      ]
    },
    {
      type: 'design',
      title: 'Design round: API gateway for the platform',
      lead: 'The front door of every request: authentication, rate limits, routing, canaries and observability — at a latency cost the business barely notices.',
      kind: 'HLD', difficulty: 'Hard', minutes: 45,
      prompt: "Design the API gateway for the Airbnb-style platform: a single entry point for web and mobile clients in front of about 15 services. It must authenticate requests, enforce rate limits, route by path and version, support canary releases and aggregate a few calls for mobile — adding less than 5 ms at p99 while serving 20,000 requests per second.",
      stages: [
        { t: 'Responsibilities — and what stays out', ask: 'What belongs in the gateway, and what must not?', points: [
          "In: TLS termination, routing (path, host, header, version), authentication (JWT validation with cached JWKS), coarse authorization, rate limiting, CORS, request ids and trace start, access logs and metrics, traffic splitting for canaries, response compression, caching of selected GETs.",
          "Out: business logic and data access — a gateway that knows about bookings becomes a bottleneck owned by one team.",
          "Aggregation for mobile belongs in a backend-for-frontend owned by the mobile team, or in the gateway only for thin composition."
        ] },
        { t: 'Architecture', ask: 'Where does the gateway sit, and what does it depend on?', diagram: { kind: 'tiers', tiers: [
          { label: 'Edge', nodes: [{ t: 'DNS + CDN / WAF', s: 'static assets, bot filtering', tone: 'gray' }, { t: 'L4 load balancer', s: 'TCP/TLS pass-through', tone: 'gray' }] },
          { label: 'Gateway fleet', via: 'HTTPS', nodes: [{ t: 'Gateway instances', s: 'stateless, non-blocking, autoscaled per zone', tone: 'blue' }] },
          { label: 'Dependencies', via: 'cached / async', nodes: [{ t: 'Route config', s: 'versioned, hot-reloaded', tone: 'yellow' }, { t: 'Redis', s: 'rate-limit buckets', tone: 'red' }, { t: 'JWKS', s: 'signing keys, cached', tone: 'green' }] },
          { label: 'Services', via: 'pooled HTTP/2 + discovery', nodes: [{ t: '15 services', s: 'booking, search, payments…', tone: 'purple' }] }
        ] }, points: [
          "Gateway instances are stateless: everything they need is configuration (pushed or polled) and caches, so any instance can serve any request and scaling is horizontal.",
          "Upstream connections are pooled (HTTP/2 where possible) and targets come from service discovery."
        ] },
        { t: 'The request pipeline', ask: 'In which order do the filters run, and what does each cost?', points: [
          "Request id / trace context → authentication (local JWT verification, no network call) → rate limiting (one Redis call, or a local cache of *denied until*) → route match → per-route timeout and circuit breaker → retry only idempotent methods within a budget → proxy (streaming, no full buffering) → response headers, compression → access log and metrics.",
          "Cheap checks first: reject unauthenticated or rate-limited requests before any upstream work."
        ], code: { lang: 'yaml', file: 'application.yml (Spring Cloud Gateway)', src: code`
          spring:
            cloud:
              gateway:
                server:
                  webflux:
                    routes:
                      - id: bookings-stable
                        uri: lb://booking-service
                        predicates:
                          - Path=/api/bookings/**
                          - Weight=bookings, 95                 # 95% of booking traffic
                        filters:
                          - name: CircuitBreaker
                            args:
                              name: bookings
                              fallbackUri: forward:/fallback/bookings
                      - id: bookings-canary
                        uri: lb://booking-service-canary
                        predicates:
                          - Path=/api/bookings/**
                          - Weight=bookings, 5                  # 5% canary` } },
        { t: 'Performance and scaling', ask: 'How do you keep the overhead under 5 ms at 20,000 requests per second?', points: [
          "Non-blocking I/O (Netty event loops, as in Spring Cloud Gateway on WebFlux) or virtual threads (Gateway Server MVC); never block an event-loop thread with synchronous calls.",
          "Per-request work stays O(1): JWT verification with cached keys, a single rate-limit round trip (or none for clearly allowed traffic), no body buffering.",
          "Capacity: if one instance handles ~5,000 requests per second within budget, run at least 4 per zone plus N+2 headroom, autoscaled on request rate and latency.",
          "Measure the gateway's own latency separately from upstream latency, per filter, with tracing."
        ] },
        { t: 'Resilience and safe changes', ask: 'An upstream is slow, a route change is wrong, a zone fails. What protects you?', points: [
          "Per-route timeouts and circuit breakers isolate a slow service; fallbacks return a clear error quickly instead of tying up connections.",
          "Configuration is code: version-controlled, validated, rolled out to a canary subset of gateway instances first, automatically rolled back on error spikes — a bad route can take everything down.",
          "Multi-zone deployment behind the L4 balancer; the gateway degrades gracefully if Redis is unavailable (fall back to local limits) or if the identity provider is down (cached keys keep validating)."
        ] }
      ],
      followUps: [
        { q: "One gateway for everyone, or a backend-for-frontend per client type?",
          a: "Keep one edge gateway for cross-cutting concerns (TLS, auth, rate limits, routing) and let client teams own BFFs that aggregate and shape data for their screens. A single gateway that does aggregation for every client turns into a shared bottleneck owned by one team; per-client BFFs let web and mobile evolve independently." },
        { q: "How do you roll out a route configuration change safely?",
          a: "Treat it like code: a pull request with review, automated validation (schema, conflicting routes, unreachable upstreams), deployment to a small set of gateway instances or a canary route first, monitoring of error rates and latency, and automatic rollback to the previous version. Keep the previous configuration readily available, because a routing mistake affects all traffic at once." },
        { q: "The gateway adds 30 ms instead of 5 ms. Where do you look?",
          a: "Trace a request through the filters. Usual culprits: a blocking call on an event-loop thread (token introspection or a synchronous Redis client), buffering whole request or response bodies, DNS lookups or new TLS handshakes to upstreams (missing connection pooling), oversized headers, logging on the hot path, or GC pauses. Fix the specific filter, then load-test against the latency budget." }
      ],
      rubric: [
        "Separates gateway responsibilities from business logic and BFF aggregation.",
        "Designs a stateless, horizontally scaled fleet with cached dependencies.",
        "Orders the filter pipeline sensibly and keeps per-request work O(1).",
        "Covers canaries, per-route resilience and safe configuration rollout.",
        "Quantifies capacity and treats the latency budget as a measured property."
      ],
      notes: [
        "The route configuration uses Spring Cloud Gateway 5's property prefix (`spring.cloud.gateway.server.webflux.routes`) and its `Weight` predicate, which splits traffic within a route group — the mechanism behind simple canary releases.",
        "Interviewers frequently ask *what happens when the gateway itself fails?* — answer with multiple zones, statelessness and fast instance replacement, and keep its dependencies off the synchronous path where possible.",
        "The same gateway applies the rate-limiting design from Session 16 and the token validation from Session 18; reusing earlier building blocks is a strength in a design interview."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: gateways, containers, scaling & deployment',
      lead: 'Operational questions are where interviewers find out whether you have run services in production — be concrete about mechanisms and failure modes.',
      qa: [
        { level: 1, q: "What does an API gateway do, and what should it not do?",
          a: "It is the single entry point that handles cross-cutting concerns for every request: TLS termination, routing to the right service and version, authentication and coarse authorization, rate limiting, CORS, request ids and tracing, access logging and metrics, traffic splitting for canary releases, and sometimes response caching or light request transformation. It should **not** contain business logic or access databases — that couples every team's releases to the gateway and turns it into a bottleneck. Aggregation for specific clients belongs in backend-for-frontend services owned by those client teams.",
          follow: ["Why can a single misconfigured route be a global outage?"] },
        { level: 2, q: "Liveness, readiness and startup probes — what is each for, and what is a classic misconfiguration?",
          a: "**Readiness** decides whether the instance receives traffic: it fails while the app is starting, warming up, overloaded or shutting down, and the instance is simply taken out of rotation. **Liveness** decides whether the container must be restarted: it should fail only when the process is irrecoverably stuck (deadlocked, wedged event loop). **Startup** probes give slow-starting apps time before liveness checks begin. The classic misconfiguration is putting dependency checks (database, downstream services) into **liveness**: a short database outage then makes every pod fail liveness and restart in a loop, turning a partial outage into a full one and slowing recovery. Dependencies belong (carefully) in readiness or nowhere.",
          follow: ["Should readiness fail when the database is down? Discuss."] },
        { level: 2, q: "Walk through a graceful shutdown of a Spring Boot pod in Kubernetes.",
          a: [
            "1. Kubernetes marks the pod terminating: it starts removing it from service endpoints and runs the `preStop` hook (for example `sleep 10`) — giving proxies time to stop sending new requests.",
            "2. After `preStop`, the container receives **SIGTERM**. With `server.shutdown=graceful`, Spring Boot stops accepting new connections, sets readiness to *refusing traffic* and lets in-flight requests complete within `spring.lifecycle.timeout-per-shutdown-phase`.",
            "3. Application context shutdown closes resources in order: message listeners stop consuming, executors drain, connection pools close.",
            "4. If the process is still running when `terminationGracePeriodSeconds` (30 s by default) expires, Kubernetes sends **SIGKILL**.",
            "Size the grace period to cover the `preStop` sleep plus the longest acceptable request, and make long-running work resumable (Kafka offsets, idempotent jobs)."
          ],
          follow: ["What happens to a Kafka consumer's partitions during this shutdown?"] },
        { level: 2, q: "Blue-green, canary or rolling deployment — when would you use each?",
          a: "**Rolling**: replace instances a few at a time — the default, cheap, but old and new versions serve traffic together for a while, and rollback is another rolling deploy. **Blue-green**: run the new version as a full parallel environment and switch traffic at once — instant rollback by switching back, clean cut-over, but double capacity and a big-bang exposure of all users. **Canary**: send a small share of traffic (1%, then 10%, 50%) to the new version, compare its error rate and latency with the baseline automatically, and promote or roll back — the safest for high-traffic services, at the cost of tooling and good metrics. Feature flags complement all three by decoupling deployment from release.",
          follow: ["What metrics would you use to decide whether a canary is healthy?"] },
        { level: 2, q: "How do you rename or change a database column without downtime?",
          a: "Use **expand and contract**, because during a rolling deploy old and new application versions run at the same time and both must work. (1) **Expand**: add the new column (nullable, or with a default), with no change to existing reads. (2) Deploy code that writes **both** columns and reads the new one, falling back to the old. (3) **Backfill** existing rows in batches. (4) Deploy code that reads and writes only the new column. (5) **Contract**: once no running version uses the old column, drop it in a later migration. Each step is backward compatible and reversible; large backfills run in small batches to avoid long locks and replication lag.",
          follow: ["How would you add a NOT NULL constraint to a column in a table with 200 million rows?"] },
        { level: 2, q: "A pod keeps being killed with exit code 137, but there is no `OutOfMemoryError` in the logs. Why?",
          a: "Exit code 137 is 128 + 9: the process was killed with **SIGKILL**, almost always by the kernel's OOM killer because the container exceeded its memory limit. The JVM gets no chance to throw `OutOfMemoryError` or write a heap dump. Typical cause: the heap is sized close to the container limit (`-Xmx` equal to the limit, or a high `MaxRAMPercentage`) while the JVM also needs native memory — metaspace, thread stacks, the code cache, direct buffers, GC structures. Fix by sizing the heap at about 60–75% of the limit, measuring native memory with Native Memory Tracking, checking for thread or direct-buffer growth, and raising the limit if the workload genuinely needs it.",
          follow: ["How would you confirm the OOM kill from Kubernetes?"] },
        { level: 2, q: "Horizontal or vertical scaling — and where do you keep session state?",
          a: "**Vertical** scaling (bigger machines) is simple and avoids distribution, but has hard limits, costs more at the top end, and a bigger single instance is a bigger failure. **Horizontal** scaling (more instances) gives elasticity and resilience, but requires services to be **stateless** — any instance must be able to serve any request. So keep session state outside the instances: signed tokens (stateless), or a shared store such as Redis via Spring Session, or a database. Sticky sessions are a workaround that hurts load balancing and deployments. Stateful components (databases, Kafka) scale horizontally through partitioning and replication instead.",
          follow: ["What breaks when you scale a service that keeps an in-memory cache of user data?"] },
        { level: 3, q: "Which metric would you autoscale on, and why not CPU alone?",
          a: "CPU is a good signal for CPU-bound services, but many backend services are **I/O-bound**: they wait on databases and other services, so latency and queueing rise while CPU stays low and the autoscaler does nothing. Better signals: requests per second per instance or concurrent requests (closer to Little's law), latency against the SLO, and for consumers the **queue backlog** — Kafka consumer lag, often via KEDA — capped by the partition count. Scale up quickly and down slowly to avoid flapping, keep a sensible minimum for warm capacity, account for JVM warm-up, and remember downstream limits: doubling instances also doubles database connections.",
          follow: ["Why can autoscaling on latency make an outage worse?"] },
        { level: 3, q: "Design a CI/CD pipeline that deploys 15 services safely several times a day.",
          a: [
            "**Build once**: compile, test and build an immutable, versioned image per commit; promote the same image through environments rather than rebuilding.",
            "**Gates**: unit, slice and integration tests (Testcontainers), contract tests, static analysis, dependency and image vulnerability scanning, SBOM generation.",
            "**Progressive delivery**: deploy to staging automatically, then production through canary analysis (error rate, latency, SLO burn) with automatic rollback — tools such as Argo Rollouts or Flagger implement this on Kubernetes.",
            "**Decouple release from deploy** with feature flags; keep database migrations backward compatible (expand/contract).",
            "**Configuration and infrastructure as code**, reviewed like application code.",
            "**Measure** DORA metrics — deployment frequency, lead time, change-failure rate and time to restore — and treat a red main branch as a stop-the-line event."
          ],
          follow: ["How do you handle a deployment that requires two services to change together?"] },
        { level: 2, q: "Round robin, least connections or consistent hashing — which load-balancing algorithm when?",
          a: "**Round robin** (optionally weighted) suits homogeneous servers and uniform, short requests: simple and fair. **Least connections** or least outstanding requests adapts when request cost varies or some instances are slower (garbage collection, noisy neighbours) — the *power of two choices* variant samples two servers and picks the less busy one, nearly as good as a global view at far lower cost. **Consistent hashing** routes the same key (user, session, cache key) to the same instance, which benefits caching and stateful affinity, with minimal reshuffling when instances change — but it can create hot spots for popular keys. Health checks and slow start apply to all of them.",
          follow: ["Why does least connections behave poorly with long-lived connections such as WebSockets?"] }
      ],
      notes: [
        "Operational questions reward specificity: name the probe, the signal, the timeout and the failure mode you are preventing.",
        "Exit code 137 and liveness-probe crash loops are two of the most common real incidents — interviewers like candidates who have seen them.",
        "For deployment strategies, connect the choice to risk and to the metrics that decide promotion or rollback."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            public static void main(String[] args) {
                String[] names = {"a", "b", "c"};
                int[] weight = {5, 1, 1}, current = new int[3];
                StringBuilder sb = new StringBuilder();
                for (int pick = 0; pick < 7; pick++) {
                    int best = 0;
                    for (int i = 0; i < 3; i++) { current[i] += weight[i]; if (current[i] > current[best]) best = i; }
                    current[best] -= 7;
                    sb.append(names[best]);
                }
                System.out.println(sb);
            }
        }`, out: 'aabacaa' },
      options: ['`aaaaabc`', '`aabacaa`', '`abacaaa`', '`aabaaca`'], answer: 1,
      why: "Smooth weighted round-robin adds each weight to the current scores, picks the maximum and subtracts the total from the winner — interleaving b and c among the a picks while keeping the 5:1:1 ratio." },
    { level: 2, q: "A liveness probe checks that the database is reachable. The database has a two-minute outage. What happens?",
      options: ['Every pod fails liveness and is restarted repeatedly, slowing recovery — dependency checks do not belong in liveness', 'Pods are removed from load balancing until the database returns, then resume', 'Nothing — liveness ignores dependencies', 'Only one pod restarts'], answer: 0,
      why: "Liveness failures trigger restarts. A shared dependency outage makes the whole fleet crash-loop; at most, readiness should reflect such problems." },
    { level: 2, q: "A container has a 1 GiB memory limit and the JVM runs with `-Xmx1g`. What is the likely outcome under load?",
      options: ['The kernel OOM-kills the container (exit code 137) because heap plus native memory exceeds the limit', 'The JVM throws `OutOfMemoryError` and recovers', 'The heap is automatically capped at 25% of the limit', 'Nothing — the heap is the only memory the JVM uses'], answer: 0,
      why: "The JVM also needs metaspace, thread stacks, the code cache and direct buffers. Leave headroom by sizing the heap at about 60–75% of the limit." },
    { level: 3, q: "You must rename `amount` to `total_amount` while old and new application versions run side by side during a rolling deploy. Which sequence is safe?",
      options: ['Add the new column → write both and read new-with-fallback → backfill → read and write only the new one → drop the old column later', 'Rename the column in one migration before deploying', 'Deploy the new code first, then rename the column', 'Drop the old column and recreate it with the new name'], answer: 0,
      why: "Expand/contract keeps every intermediate state compatible with both versions, so the deploy can proceed — and roll back — without errors." },
    { level: 3, q: "Why does *power of two choices* load balancing beat purely random assignment so much?",
      options: ['Picking the less loaded of two random servers shrinks the worst overload from about log n / log log n to about log log n, with no global coordination', 'It always chooses the globally least loaded server', 'It uses consistent hashing internally', 'It doubles the number of servers'], answer: 0,
      why: "Two samples are enough to avoid most bad choices. The verified simulation in this session: 1,072 requests on the busiest of 100 servers with random choice versus 1,002 with two choices (ideal 1,000)." }
  ]
});
