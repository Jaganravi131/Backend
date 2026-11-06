/* Interview pack — Session 9: RESTful API design, AOP, Lombok & logging */
COURSE.prep(9, {
  deepDives: [
    {
      title: 'Deep dive: Spring AOP internals — proxies, advice order & self-invocation',
      lead: 'Every `@Transactional`, `@Cacheable` and `@Async` in your code works through the mechanism on this slide — and fails silently when you bypass it.',
      points: [
        "Spring AOP is **proxy-based**: an auto-proxy creator (a `BeanPostProcessor`) wraps every bean that matches a pointcut. Other beans are injected with the proxy, which runs the advice chain and then calls your object.",
        "**JDK dynamic proxies** implement the bean's interfaces (`java.lang.reflect.Proxy`); **class-based proxies** (CGLIB) subclass the bean. Spring Boot defaults to class-based proxies (`spring.aop.proxy-target-class=true`), so injecting by concrete class works.",
        "Subclassing has limits: `final` classes and methods and `private` methods cannot be advised — the annotation is simply ignored.",
        "**Self-invocation** — `this.charge()` inside the bean — is a plain Java call that never passes through the proxy: no transaction, cache, retry or timing. Move the method to another bean (best), inject the bean's own proxy lazily, or use AspectJ weaving.",
        "**Order** of advices on one method follows `@Order` (lower value = outermost). It matters: a retry *outside* the transaction gives each attempt a fresh transaction; a retry *inside* keeps retrying in a transaction that is already doomed.",
        "**AspectJ weaving** (compile-time or load-time) rewrites the bytecode itself — no proxies, so self-invocation, private methods and objects created with `new` are covered — at the cost of build or agent complexity."
      ],
      code: { lang: 'java', file: 'ProxyDemo.java', src: code`
        import java.lang.reflect.*;
        import java.util.*;

        public class ProxyDemo {
            interface PaymentService {
                void pay(String order);
                void payAll(List<String> orders);
            }

            static class PaymentServiceImpl implements PaymentService {
                public void pay(String order) { System.out.println("  paying " + order); }
                public void payAll(List<String> orders) { orders.forEach(this::pay); }   // self-invocation
            }

            @SuppressWarnings("unchecked")
            static <T> T withAdvice(T target, Class<T> iface) {
                InvocationHandler h = (proxy, method, args) -> {
                    System.out.println("[advice] before " + method.getName());
                    try {
                        return method.invoke(target, args);
                    } catch (InvocationTargetException e) {
                        throw e.getCause();
                    }
                };
                return (T) Proxy.newProxyInstance(iface.getClassLoader(), new Class<?>[] { iface }, h);
            }

            public static void main(String[] args) {
                PaymentService svc = withAdvice(new PaymentServiceImpl(), PaymentService.class);
                svc.pay("A-1");
                svc.payAll(List.of("B-1", "B-2"));                // inner pay() calls skip the advice
                System.out.println("proxy class is a " + (Proxy.isProxyClass(svc.getClass()) ? "JDK dynamic proxy" : "plain object"));
            }
        }`, out: code`
        [advice] before pay
          paying A-1
        [advice] before payAll
          paying B-1
          paying B-2
        proxy class is a JDK dynamic proxy` },
      callout: { kind: 'pitfall', text: "If `payAll` were `@Transactional(propagation = REQUIRES_NEW)` per item via `this.pay(...)`, every item would silently run in the *outer* transaction — one failure rolls back all payments. This bug passes code review constantly; the output above shows why." },
      notes: [
        "The demo uses a JDK proxy so it runs without Spring, but class-based proxies behave the same way for self-invocation: the proxy only sees calls that come in from outside through the reference other beans hold.",
        "Common fixes in order of preference: (1) move the inner method to a separate bean — it usually deserves its own responsibility anyway; (2) inject `ObjectProvider<Self>` or a `@Lazy` self-reference and call through it; (3) use `TransactionTemplate` for programmatic transactions in the rare cases where the boundary must be inside one method.",
        "Spring Framework 7's built-in resilience annotations (`@Retryable`, `@ConcurrencyLimit`, enabled with `@EnableResilientMethods`) are also proxy-based — same rules, same self-invocation limitation."
      ]
    },
    {
      title: 'Deep dive: API design at scale — pagination, idempotency, versioning & errors',
      lead: 'The API decisions that are cheap on day one and very expensive to change once a hundred clients depend on them.',
      points: [
        "**Offset pagination** (`?page=5000&size=20`) makes the database read and discard 100,000 rows, and items shift between pages when rows are inserted. **Keyset pagination** (`WHERE (created_at, id) < (:c, :id) ORDER BY created_at DESC, id DESC LIMIT 20`) seeks through the index and stays stable — return the last row's key as an opaque cursor.",
        "**Idempotency keys** make POST safe to retry: the client sends `Idempotency-Key: <uuid>`; the server stores (key, request hash, response) **in the same transaction** as the side effect; a retry returns the stored response; the same key with a different body is rejected; keys expire (24 hours is common).",
        "**Versioning**: a URI prefix (`/v1/`) is explicit and cache-friendly; header or media-type versioning keeps URIs stable. Spring Framework 7 supports versions natively: `@GetMapping(path = \"/expenses\", version = \"2\")` plus `spring.mvc.apiversion.*` properties.",
        "**Evolve without breaking**: add optional fields, never rename or remove without a deprecation window (`Deprecation`/`Sunset` headers), ignore unknown input fields, and verify with consumer-driven contract tests (Session 14).",
        "**Errors**: RFC 9457 problem details (`application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, plus extensions such as `errors[]` and `traceId`) — Spring's `ProblemDetail` produces them.",
        "**Partial updates**: `PATCH` with JSON Merge Patch (RFC 7396 — send the fields to change, `null` removes) or JSON Patch (RFC 6902 — a list of operations). Guard with `ETag` + `If-Match` and answer `412 Precondition Failed` on a stale version."
      ],
      code: [
        { lang: 'sql', file: 'schema.sql', label: 'schema + data', setup: true, src: code`
          CREATE TABLE expense (
            id         INTEGER PRIMARY KEY,
            group_id   INTEGER NOT NULL,
            created_at TEXT    NOT NULL,
            amount     INTEGER NOT NULL
          );
          CREATE INDEX idx_expense_page ON expense (group_id, created_at DESC, id DESC);
          INSERT INTO expense VALUES
            (1, 7, '2026-11-01 09:00', 450), (2, 7, '2026-11-01 09:00', 120), (3, 7, '2026-11-02 18:30', 900),
            (4, 7, '2026-11-03 12:15', 300), (5, 9, '2026-11-03 13:00',  75), (6, 7, '2026-11-04 08:45', 640),
            (7, 7, '2026-11-04 08:45', 210), (8, 7, '2026-11-05 20:00', 1500);` },
        { lang: 'sql', file: 'page2.sql', label: 'keyset page 2', src: code`
          -- page 1 returned ids 8, 7, 6; the client sends back the cursor of the last row: ('2026-11-04 08:45', 6)
          SELECT id, created_at, amount
          FROM expense
          WHERE group_id = 7
            AND (created_at < '2026-11-04 08:45'
                 OR (created_at = '2026-11-04 08:45' AND id < 6))   -- tie-break on id: no skipped or repeated rows
          ORDER BY created_at DESC, id DESC
          LIMIT 3;`, out: code`
          id | created_at       | amount
          4  | 2026-11-03 12:15 | 300
          3  | 2026-11-02 18:30 | 900
          2  | 2026-11-01 09:00 | 120` }
      ],
      notes: [
        "The keyset query is verified by the course test suite on SQLite and runs unchanged on MySQL 8. Note the tie-break: ids 6 and 7 share a timestamp, and ordering by `created_at` alone would let rows be skipped or repeated across pages. The composite index matches the `ORDER BY`, so the database seeks straight to the cursor.",
        "Keyset pagination cannot jump to *page 5,000* — and almost no user needs that. Offer *next/previous* plus filters, and compute totals separately (or approximately) if the UI needs them.",
        "Idempotency storage must be written in the same transaction as the business change. Writing it before (a crash leaves a key without the effect) or after (a crash leaves the effect without a key) breaks the guarantee exactly when you need it."
      ]
    }
  ],

  stretch: [
    "Add idempotency keys to `POST /expenses`: an `idempotency_keys` table (key, request hash, response, status, created_at) written in the same transaction as the expense, with tests for a retry, two concurrent duplicates and a reused key with a different body.",
    "Replace offset pagination on `GET /groups/{id}/expenses` with keyset pagination and an opaque Base64 cursor; compare `EXPLAIN ANALYZE` for page 1 and page 5,000 on a million rows.",
    "Switch the service to structured JSON logs (`logging.structured.format.console=ecs`), make sure every line carries a `traceId`, and add a test that fails if any log line contains an e-mail address."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: a mini AOP framework — @Retry with backoff and @Timed',
      lead: 'Rebuild what `@Retryable` and `@Timed` do, with only the JDK: dynamic proxies, annotations, exponential backoff with jitter — and code that can be tested without sleeping.',
      difficulty: 'Medium', minutes: 45, pattern: ['design'],
      problem: [
        "Implement `wrap(target, iface, sleeper, random, log)` returning a proxy for interface `iface` that applies two annotations found on the **implementation's** methods:",
        "- `@Retry(maxAttempts, baseDelayMs, on)` — when the call throws one of the `on` exception types, wait and try again, up to `maxAttempts` calls in total. The wait before retry *n* is uniformly random in `[0, baseDelayMs × 2ⁿ⁻¹)` (exponential backoff with full jitter).",
        "- `@Timed` — record a timing for every call, successful or not.",
        "Other exceptions propagate immediately. When attempts run out, throw the last exception with the earlier failures attached as suppressed exceptions. Waiting must go through the injected `Sleeper`, so tests do not really sleep."
      ],
      examples: [
        { in: 'reserve() fails twice with IOException, then succeeds\n@Retry(maxAttempts = 4, baseDelayMs = 100)', out: 'returns the value after 3 calls; 2 backoffs recorded (< 100 ms, then < 200 ms)' },
        { in: 'validate() throws IllegalArgumentException\n@Retry (retries IOException only)', out: 'thrown immediately after 1 call' },
        { in: 'ping() always fails, @Retry(maxAttempts = 3)', out: 'throws the 3rd IOException; the 2nd is suppressed in it, the 1st in the 2nd' }
      ],
      constraints: ["Only the JDK — no Spring, no bytecode libraries", "`1 ≤ maxAttempts ≤ 10`", "Annotations may be on the implementation class's methods, not only on the interface"],
      hints: [
        "A JDK proxy needs an interface and an `InvocationHandler`, which receives the *interface's* `Method`. How do you find the implementation's method to read its annotations?",
        "`Method.invoke` wraps whatever the target throws in an `InvocationTargetException`. Unwrap it before deciding whether to retry — and before rethrowing, or callers see the wrong type.",
        "Inject the sleeping (`Sleeper`) and the randomness (`Random` with a fixed seed) so the behaviour is fast and deterministic in tests."
      ],
      approaches: [
        { name: 'Hand-written decorator', idea: 'A class per interface that wraps each method in retry/timing code', time: 'O(attempts) per call', space: 'O(1)' },
        { name: 'JDK dynamic proxy + annotations', idea: 'One generic InvocationHandler reads annotations and applies the policies', time: 'O(attempts) per call, small reflective overhead', space: 'O(1)' },
        { name: 'Bytecode subclassing (CGLIB/ByteBuddy)', idea: 'Generated subclass overrides methods; works without interfaces', time: 'O(attempts) per call', space: 'O(1)' },
        { name: 'AspectJ weaving', idea: 'Advice woven into the bytecode itself — also covers self-invocation', time: 'O(attempts) per call', space: 'O(1)' }
      ],
      code: { lang: 'java', file: 'MiniAop.java', src: code`
        import java.io.IOException;
        import java.lang.annotation.*;
        import java.lang.reflect.*;
        import java.util.*;

        public class MiniAop {
            @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD)
            @interface Retry {
                int maxAttempts() default 3;
                long baseDelayMs() default 100;
                Class<? extends Throwable>[] on() default { IOException.class };
            }

            @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD)
            @interface Timed {}

            interface Sleeper { void sleep(long ms) throws InterruptedException; }

            /** A JDK proxy applying @Timed (outer) and @Retry (inner), read from the IMPLEMENTATION's methods. */
            @SuppressWarnings("unchecked")
            static <T> T wrap(T target, Class<T> iface, Sleeper sleeper, Random random, List<String> log) {
                InvocationHandler handler = (proxy, m, args) -> {
                    Method impl = target.getClass().getMethod(m.getName(), m.getParameterTypes());
                    Retry retry = impl.getAnnotation(Retry.class);
                    long start = System.nanoTime();
                    try {
                        int max = retry == null ? 1 : Math.max(1, retry.maxAttempts());
                        Throwable previous = null;
                        for (int attempt = 1; ; attempt++) {
                            try {
                                return m.invoke(target, args);
                            } catch (InvocationTargetException e) {
                                Throwable cause = e.getCause();                       // unwrap the real exception
                                if (previous != null) cause.addSuppressed(previous);  // keep the failure history
                                previous = cause;
                                boolean retryable = retry != null && Arrays.stream(retry.on()).anyMatch(c -> c.isInstance(cause));
                                if (!retryable || attempt == max) throw cause;
                                long cap = retry.baseDelayMs() << (attempt - 1);      // exponential: base, 2x, 4x ...
                                long delay = (long) (random.nextDouble() * cap);       // full jitter: uniform in [0, cap)
                                log.add(m.getName() + " attempt " + attempt + " failed (" + cause.getMessage() + "), backing off " + delay + " ms");
                                sleeper.sleep(delay);
                            }
                        }
                    } finally {
                        if (impl.isAnnotationPresent(Timed.class)) {
                            // real code: meterRegistry.timer("client.calls", "method", m.getName()).record(System.nanoTime() - start, NANOSECONDS)
                            log.add("timer recorded for " + m.getName());
                        }
                    }
                };
                return (T) Proxy.newProxyInstance(iface.getClassLoader(), new Class<?>[] { iface }, handler);
            }

            interface InventoryClient {
                int reserve(String sku, int qty) throws IOException;
                void validate(String sku);
                String ping() throws IOException;
            }

            static final class FlakyInventory implements InventoryClient {
                int calls = 0;

                @Override @Timed @Retry(maxAttempts = 4, baseDelayMs = 100)
                public int reserve(String sku, int qty) throws IOException {
                    if (++calls < 3) throw new IOException("connection reset #" + calls);
                    return qty;
                }

                @Override @Retry
                public void validate(String sku) {
                    calls++;
                    throw new IllegalArgumentException("unknown sku " + sku);       // not an IOException: no retry
                }

                @Override @Retry(maxAttempts = 3, baseDelayMs = 50)
                public String ping() throws IOException {
                    calls++;
                    throw new IOException("down #" + calls);
                }
            }

            public static void main(String[] args) throws Exception {
                List<String> log = new ArrayList<>();
                List<Long> slept = new ArrayList<>();
                FlakyInventory real = new FlakyInventory();
                InventoryClient client = wrap(real, InventoryClient.class, slept::add, new Random(42), log);

                System.out.println("reserved " + client.reserve("SKU-1", 5) + " after " + real.calls + " calls");
                try {
                    client.validate("SKU-X");
                } catch (IllegalArgumentException e) {
                    System.out.println("validate failed fast: " + e.getMessage() + " (total calls: " + real.calls + ")");
                }
                try {
                    client.ping();
                } catch (IOException e) {
                    System.out.println("ping gave up: " + e.getMessage() + ", suppressed: " + e.getSuppressed().length
                            + " -> " + e.getSuppressed()[0].getSuppressed().length);
                }
                log.forEach(System.out::println);
                System.out.println("backoffs recorded (not slept): " + slept);
            }
        }`, out: code`
        reserved 5 after 3 calls
        validate failed fast: unknown sku SKU-X (total calls: 4)
        ping gave up: down #7, suppressed: 1 -> 1
        reserve attempt 1 failed (connection reset #1), backing off 72 ms
        reserve attempt 2 failed (connection reset #2), backing off 136 ms
        timer recorded for reserve
        ping attempt 1 failed (down #5), backing off 15 ms
        ping attempt 2 failed (down #6), backing off 27 ms
        backoffs recorded (not slept): [72, 136, 15, 27]` },
      pitfalls: [
        "Retrying non-idempotent operations — a POST that charges a card — without an idempotency key turns one payment into several.",
        "Not unwrapping `InvocationTargetException` (callers see the wrapper) or throwing a checked exception the interface does not declare (callers get an `UndeclaredThrowableException`).",
        "Backoff without jitter: every client retries at the same instants and hammers the recovering dependency in waves.",
        "Retrying *inside* a transaction that is already marked rollback-only; the retry boundary belongs outside the transaction."
      ],
      followUps: [
        { q: "Why exponential backoff, and why add jitter?",
          a: "Exponential spacing gives a struggling dependency progressively more time to recover instead of hitting it at a constant rate. Jitter spreads the retries of many clients in time; without it, clients that failed together retry together. A well-known AWS Architecture Blog analysis (*Exponential Backoff and Jitter*) found that *full jitter* — a uniformly random wait between zero and the exponential cap — keeps total work and completion time low for contended resources." },
        { q: "Add a circuit breaker. Where does it go relative to the retry?",
          a: "A breaker is a state machine: CLOSED (calls flow, failures counted in a sliding window), OPEN after the failure rate crosses a threshold (calls fail fast), HALF-OPEN after a wait (a few probe calls decide). Resilience4j's default aspect order puts Retry outermost — each attempt consults the breaker — so configure the retry **not** to retry the breaker's own *call not permitted* exception, otherwise an open breaker just burns retries." },
        { q: "How does Spring implement `@Retryable`, and what limitation does it inherit?",
          a: "A proxy with a method interceptor, exactly like this handler: Spring Framework 7's core `@Retryable` (enabled with `@EnableResilientMethods`) or the Spring Retry project. Because it is proxy-based, self-invocation bypasses it. Note the counting: Spring Framework 7's `maxRetries = 3` means up to four calls, whereas Resilience4j's `max-attempts: 3` means three calls in total." }
      ],
      rubric: [
        "Gets the proxy mechanics right: annotations read from the implementation, `InvocationTargetException` unwrapped.",
        "Correct retry semantics: only listed exceptions, bounded attempts, failure history preserved, and idempotency raised unprompted.",
        "Backoff is exponential, capped and jittered; sleeping and randomness are injected for tests.",
        "Explains self-invocation and how retry should be ordered relative to transactions and circuit breakers."
      ],
      notes: [
        "The output is deterministic because the jitter uses `new Random(42)` and the sleeper only records delays. In production code you would inject a real sleeper (or use a scheduler) and an unseeded random.",
        "Notice the ordering in the handler: timing wraps the whole retry loop, so the recorded time includes the backoffs — usually what you want for an end-to-end *client call* metric. Recording each attempt separately is a different, also useful, metric.",
        "This round is also a chance to show judgement: a good candidate asks whether the operation is idempotent before agreeing to retry it at all."
      ]
    },
    {
      type: 'coding',
      title: 'Coding round: shortest incident window in a log (minimum window substring)',
      lead: 'LeetCode 76 over log events instead of characters: the canonical hard sliding-window problem, with a practical framing.',
      difficulty: 'Hard', minutes: 40, lc: 76, pattern: ['sliding-window', 'hashing'],
      problem: [
        "An incident log is a sequence of event codes. Given the log and a list of **required** codes — possibly with repeats, e.g. two `DB_TIMEOUT`s — find the **shortest contiguous window** of the log that contains every required code at least as many times as it is required.",
        "Return the window as `[start, end)` indices, or `null` if no window exists. If several windows are equally short, return the leftmost."
      ],
      examples: [
        { in: 'log = INFO DB_TIMEOUT INFO WARN CACHE_MISS INFO DB_TIMEOUT RETRY CACHE_MISS ERROR_5XX INFO\nrequired = [DB_TIMEOUT, CACHE_MISS, ERROR_5XX]', out: '[6, 10] → DB_TIMEOUT RETRY CACHE_MISS ERROR_5XX' },
        { in: 'log = A B A, required = [A, A]', out: '[0, 3]', why: "Multiplicity counts: one A is not enough." },
        { in: 'log = A B, required = [A, C]', out: 'null' }
      ],
      constraints: ["`1 ≤ log.length ≤ 10⁵`", "`1 ≤ required.length ≤ 10⁵`", "Codes are short strings"],
      hints: [
        "Brute force tries every start and extends to the right — O(n²). Once a window is valid, what is the only way to make it shorter?",
        "Expand `right` until the window is valid, then shrink `left` while it stays valid, recording the best window. Each index enters and leaves the window once.",
        "Keep a counter `missing` of required occurrences not yet covered, so checking validity is O(1) instead of comparing two maps."
      ],
      approaches: [
        { name: 'Brute force', idea: 'For every start, extend until all codes are covered; keep the shortest', time: 'O(n²)', space: 'O(k)' },
        { name: 'Sliding window + missing counter', idea: 'Expand right; while valid, record and shrink left; update counts and `missing`', time: 'O(n + k)', space: 'O(k)' },
        { name: 'Filtered sliding window', idea: 'Same, but iterate only over positions holding required codes — faster when most events are irrelevant', time: 'O(n + k)', space: 'O(n)' }
      ],
      code: { lang: 'java', file: 'ShortestLogWindow.java', src: code`
        import java.util.*;

        public class ShortestLogWindow {
            /** Shortest [start, end) window containing every required code with multiplicity, or null. */
            static int[] shortestWindow(String[] events, List<String> required) {
                Map<String, Integer> need = new HashMap<>();
                for (String r : required) need.merge(r, 1, Integer::sum);
                Map<String, Integer> have = new HashMap<>();
                int missing = required.size();                       // required occurrences not yet covered
                int bestStart = -1, bestLen = Integer.MAX_VALUE;
                for (int left = 0, right = 0; right < events.length; right++) {
                    Integer n = need.get(events[right]);
                    if (n == null) continue;                         // irrelevant event
                    if (have.merge(events[right], 1, Integer::sum) <= n) missing--;
                    while (missing == 0) {                           // valid: record, then shrink from the left
                        if (right - left + 1 < bestLen) { bestLen = right - left + 1; bestStart = left; }
                        String out = events[left++];
                        Integer nOut = need.get(out);
                        if (nOut != null && have.merge(out, -1, Integer::sum) < nOut) missing++;
                    }
                }
                return bestStart < 0 ? null : new int[] { bestStart, bestStart + bestLen };
            }

            static int[] bruteForce(String[] ev, List<String> req) {
                int[] best = null;
                for (int s = 0; s < ev.length; s++) {
                    Map<String, Integer> need = new HashMap<>();
                    for (String r : req) need.merge(r, 1, Integer::sum);
                    int missing = req.size();
                    for (int e = s; e < ev.length; e++) {
                        Integer n = need.get(ev[e]);
                        if (n != null && n > 0) { need.put(ev[e], n - 1); missing--; }
                        if (missing == 0) {
                            if (best == null || e + 1 - s < best[1] - best[0]) best = new int[] { s, e + 1 };
                            break;
                        }
                    }
                }
                return best;
            }

            public static void main(String[] args) {
                String[] log = "INFO DB_TIMEOUT INFO WARN CACHE_MISS INFO DB_TIMEOUT RETRY CACHE_MISS ERROR_5XX INFO".split(" ");
                int[] w = shortestWindow(log, List.of("DB_TIMEOUT", "CACHE_MISS", "ERROR_5XX"));
                System.out.println(Arrays.toString(w) + " " + String.join(" ", Arrays.copyOfRange(log, w[0], w[1])));
                System.out.println(Arrays.toString(shortestWindow("A B A".split(" "), List.of("A", "A"))));
                System.out.println(Arrays.toString(shortestWindow("A B".split(" "), List.of("A", "C"))));

                Random rnd = new Random(76);
                String[] alphabet = {"A", "B", "C", "D", "E"};
                for (int t = 0; t < 3_000; t++) {                          // differential test
                    String[] ev = new String[rnd.nextInt(30)];
                    for (int i = 0; i < ev.length; i++) ev[i] = alphabet[rnd.nextInt(alphabet.length)];
                    List<String> req = new ArrayList<>();
                    for (int i = 1 + rnd.nextInt(4); i > 0; i--) req.add(alphabet[rnd.nextInt(3)]);
                    int[] a = shortestWindow(ev, req), b = bruteForce(ev, req);
                    boolean same = a == null ? b == null : b != null && a[0] == b[0] && a[1] == b[1];
                    if (!same) throw new AssertionError(Arrays.toString(ev) + " " + req);
                }
                System.out.println("3000 random logs: sliding window matches brute force");
            }
        }`, out: code`
        [6, 10] DB_TIMEOUT RETRY CACHE_MISS ERROR_5XX
        [0, 3]
        null
        3000 random logs: sliding window matches brute force` },
      pitfalls: [
        "Ignoring multiplicity: decrement `missing` only while the count of a code is still at or below what is required.",
        "Re-checking validity by comparing two maps on every step turns O(n) into O(n · k).",
        "Off-by-one errors in the window length (`right - left + 1`) and in the returned end index.",
        "Forgetting the impossible case and returning a garbage window instead of `null`."
      ],
      followUps: [
        { q: "The log is a live stream. Alert when all required codes appear within any 5-minute span.",
          a: "Switch from positions to timestamps: keep the events of the last 5 minutes in a deque with per-code counts, evict from the front as time advances, and fire when `missing` reaches 0. At scale this becomes a windowed aggregation in a stream processor, keyed by service — the basis of correlation rules in observability and security tools." },
        { q: "Find the shortest window containing at least K **distinct** codes.",
          a: "Same template with a *distinct count* instead of `missing`: grow until `distinct ≥ K`, then shrink while it stays true, decrementing `distinct` when a code's count drops to zero. Still O(n)." },
        { q: "What if the required codes must appear in **order** — DB_TIMEOUT, then CACHE_MISS, then ERROR_5XX?",
          a: "That is *minimum window subsequence* (LeetCode 727, Hard). Scan forward to find the earliest end where the sequence completes, then scan backward from that end to find the latest start that still contains it, record, and continue from start + 1 — O(n · k) overall; dynamic programming over (position, matched prefix) also works." }
      ],
      rubric: [
        "Explains why recording-then-shrinking whenever the window is valid finds the optimum.",
        "Achieves O(n + k) with a missing counter and handles multiplicity.",
        "Tests impossible input, repeats, irrelevant events and ties.",
        "Generalises sensibly to streams and time-based windows."
      ],
      notes: [
        "The sliding-window argument in one sentence: for each right end, the best window ending there starts at the largest left that keeps it valid, and that left never moves backwards as right grows — so both pointers move at most n times.",
        "The differential test compares exact positions, not just lengths, which also checks the *leftmost on ties* requirement.",
        "This exact pattern appears in production code: *find the smallest time range in which these log events co-occur* is how many incident-correlation features work."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: REST, AOP, Lombok & logging',
      lead: 'API design is where backend interviews test judgement — every answer should mention what clients experience and what breaks over time.',
      qa: [
        { level: 1, q: "What makes an API RESTful? Explain the Richardson maturity model and where most real APIs stop.",
          a: "REST models the domain as **resources** identified by URIs, manipulated through a **uniform interface** (standard HTTP methods with their semantics), using **representations** (JSON), with **stateless** requests and cacheable responses. Richardson's model: level 0 — one endpoint, everything POSTed (RPC over HTTP); level 1 — separate resources; level 2 — HTTP verbs and status codes used correctly; level 3 — hypermedia (HATEOAS) links that tell clients what they can do next. Most production APIs, including the major public ones, are **level 2**; hypermedia is used selectively (pagination links, actions) because clients are usually written against documentation, not discovered dynamically.",
          follow: ["How do you model an action like *cancel order* RESTfully?"] },
        { level: 2, q: "PUT versus PATCH, and JSON Merge Patch versus JSON Patch. How do you prevent lost updates?",
          a: "**PUT** replaces the whole resource with the representation sent — idempotent, but the client must send every field. **PATCH** applies a partial change. **JSON Merge Patch** (RFC 7396) sends an object with only the fields to change, and `null` removes a field — simple, but it cannot express array edits or *set to null*. **JSON Patch** (RFC 6902) sends a list of operations (`add`, `remove`, `replace`, `test`) — precise but more complex. Either way, two clients editing the same resource can overwrite each other: return an `ETag` (a version) with every read, require `If-Match` on writes, and answer **412 Precondition Failed** when the version no longer matches; the client re-reads and retries. On the server this maps naturally onto JPA's `@Version`.",
          follow: ["Why is PATCH not idempotent in general?"] },
        { level: 2, q: "Design idempotency for `POST /payments`.",
          a: [
            "**Contract**: clients send an `Idempotency-Key` header (a UUID per logical operation) and reuse it on retries.",
            "**Storage**: a table `idempotency_keys(key PK, request_hash, status, response_code, response_body, created_at)` — written in the **same transaction** as the payment, so a key exists if and only if the effect happened.",
            "**Flow**: insert the key with status `IN_PROGRESS` (the primary key blocks concurrent duplicates); on success store the response; on a retry with the same key and the same request hash, return the stored response; with a **different** hash, reject with 422 or 409.",
            "**Concurrency**: a duplicate arriving while the first is still in progress gets 409 (*retry later*) or waits briefly.",
            "**Lifecycle**: expire keys after a period such as 24 hours; never reuse a key for a different operation.",
            "**Downstream**: pass an idempotency key on to the payment provider too, so the whole chain is safe to retry."
          ],
          follow: ["What happens if the service crashes after calling the provider but before committing?"] },
        { level: 2, q: "Offset versus keyset pagination — when does offset break, and how do you implement cursors?",
          a: "`LIMIT 20 OFFSET 100000` forces the database to produce and discard 100,000 rows, so deep pages get slower linearly; and when rows are inserted or deleted between requests, items shift — users see duplicates or miss rows. **Keyset pagination** remembers the sort key of the last row returned and asks for rows *after* it: `WHERE (created_at, id) < (:lastCreatedAt, :lastId) ORDER BY created_at DESC, id DESC LIMIT 20`, backed by an index on `(group_id, created_at, id)`. The pair `(created_at, id)` is encoded into an opaque cursor (Base64 JSON) so clients cannot depend on its format. The trade-off: no random access to page N and no cheap total count — usually acceptable for feeds, lists and exports.",
          follow: ["Why must the cursor include a unique tie-breaker such as `id`?"] },
        { level: 2, q: "How do you version a public API and evolve it without breaking clients?",
          a: "Most changes should not need a new version: **additive** changes (new optional fields, new endpoints, new enum values that clients are told to tolerate) are backward compatible if clients ignore unknown fields. Breaking changes — removing or renaming fields, changing types or semantics — require a new version: a URI prefix (`/v2/`, explicit and cache-friendly) or a header/media type (stable URIs, harder to test in a browser). Spring Framework 7 supports all of these natively through the `version` attribute on mappings. Run old and new versions side by side, announce deprecation with `Deprecation` and `Sunset` headers, measure who still calls the old version, and protect consumers with contract tests in CI.",
          follow: ["Is adding a new enum value a breaking change?"] },
        { level: 2, q: "Why doesn't `@Transactional` (or `@Cacheable`) work when the method is called from another method of the same class? Give three fixes.",
          a: "These annotations are implemented by a **proxy** around the bean. Calls from other beans go through the proxy; a call like `this.save()` from inside the bean goes straight to the target object and never reaches the proxy, so no transaction is started and no cache is consulted. The same applies to `private` methods and `final` methods of class-based proxies. Fixes: (1) move the annotated method into a separate bean and call it through that bean — usually the cleanest design; (2) inject the bean's own proxy (`@Lazy` self-reference or `ObjectProvider`) and call through it; (3) use programmatic control (`TransactionTemplate`) or AspectJ weaving, which modifies bytecode and therefore also covers self-invocation.",
          follow: ["How would you write a test that proves a method really runs in a transaction?"] },
        { level: 2, q: "JDK dynamic proxy or class-based (CGLIB) proxy — what changes for your code?",
          a: "A **JDK proxy** implements the bean's interfaces only: the proxy is not an instance of your class, so injecting the bean by its concrete class fails with a type error, and only interface methods can be advised. A **class-based proxy** subclasses your class: injection by class works, but `final` classes and methods cannot be proxied, and private methods are never intercepted. Spring Boot defaults to class-based proxies, which avoids the injection surprise. In both cases self-invocation bypasses the proxy, and `getClass()` returns the proxy class — which matters for code that compares classes or reads annotations reflectively.",
          follow: ["Why must a class-based proxy's target usually not have a `final` method you want advised?"] },
        { level: 2, q: "Lombok on JPA entities: which annotations are dangerous and why?",
          a: "`@Data` (and `@EqualsAndHashCode`/`@ToString` with defaults) generates `equals`, `hashCode` and `toString` over **all fields**. On entities that means: `hashCode` changes when the database assigns the id, so entities vanish from `HashSet`s; collections are included, so comparing or printing an entity can trigger lazy loading (or `LazyInitializationException` outside a transaction); and with bidirectional relations, `toString` and `hashCode` call each other forever — `StackOverflowError`. Safer: `@Getter`/`@Setter` plus hand-written `equals`/`hashCode` based on the id (with a constant `hashCode`) or a natural key, `@ToString` that excludes relations, and a protected no-arg constructor for JPA. Lombok remains great for DTOs — but records are often even better there.",
          follow: ["Why do JPA entities need a no-arg constructor at all?"] },
        { level: 3, q: "Design structured logging and request correlation for 50 microservices.",
          a: [
            "**Format**: JSON logs in a standard schema — Spring Boot supports structured logging out of the box (`logging.structured.format.console=ecs`, `logstash` or `gelf`).",
            "**Correlation**: every line carries `traceId` and `spanId` from Micrometer Tracing/OpenTelemetry, propagated through HTTP headers (W3C `traceparent`) and Kafka record headers, and restored in async code via context propagation.",
            "**Content rules**: log events, not chatter; levels with meaning (ERROR = someone must act); never log secrets or personal data (redact at the logging layer and test for it); parameterised messages to avoid needless string building.",
            "**Pipeline and cost**: ship to a central store with retention per level; sample high-volume DEBUG/INFO; alert on metrics rather than on log patterns where possible.",
            "**Navigation**: link logs, metrics and traces — exemplars on latency histograms let you jump from a slow percentile to a trace and then to its logs."
          ],
          follow: ["How do you keep the trace id when work moves to another thread?"] },
        { level: 3, q: "Twelve services return errors in twelve different shapes. Design a company-wide error contract.",
          a: "Adopt **RFC 9457 problem details** as the standard: `type` (a stable URI or code that clients branch on), `title`, `status`, `detail` (human-readable, may change), `instance`, plus agreed extensions — `errors[]` for field-level validation, `traceId` for support, and retry hints (`Retry-After` header for 429/503). Define a catalogue of error types with owners and documentation, map the common exceptions (validation, not found, conflict, forbidden, upstream failure) in a shared library or starter so every service behaves the same, and never leak stack traces or internal messages. Enforce it with contract tests and OpenAPI schemas checked in CI, and roll it out behind API versions so existing clients are not broken.",
          follow: ["Why should clients branch on `type` rather than on `detail` text?"] }
      ],
      notes: [
        "Idempotency and pagination come up in almost every API-design interview at product companies; have the table schema and the keyset query ready to write.",
        "The AOP questions look like Spring trivia, but they test the proxy mental model — the same model explains transactions, caching, retries and security annotations.",
        "For the Senior questions, interviewers look for standards (RFC 9457, W3C trace context) plus rollout and enforcement — a good design that nobody adopts scores low."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.lang.reflect.*;

        public class Main {
            interface Svc { String outer(); String inner(); }

            static class Impl implements Svc {
                public String outer() { return "outer>" + inner(); }
                public String inner() { return "inner"; }
            }

            public static void main(String[] args) {
                Svc target = new Impl();
                Svc proxy = (Svc) Proxy.newProxyInstance(Svc.class.getClassLoader(), new Class<?>[] { Svc.class },
                        (p, m, a) -> "[" + m.invoke(target, a) + "]");
                System.out.println(proxy.outer() + " " + proxy.inner());
            }
        }`, out: '[outer>inner] [inner]' },
      options: ['`[outer>[inner]] [inner]`', '`[outer>inner] [inner]`', '`outer>inner inner`', '`[outer>inner] inner`'], answer: 1,
      why: "The proxy wraps each call made through it. Inside `outer()`, the call to `inner()` goes to `this` — the target — so it is not wrapped. That is self-invocation, the reason `@Transactional` on an internally called method has no effect." },
    { level: 2, q: "Which query stays fast when a user pages deep into a large expense list?",
      options: ['`ORDER BY created_at DESC LIMIT 20 OFFSET 199980`', '`WHERE (created_at, id) < (:c, :id) ORDER BY created_at DESC, id DESC LIMIT 20` with a matching index', 'Load all rows and paginate in Java', '`ORDER BY RAND() LIMIT 20`'], answer: 1,
      why: "Keyset pagination seeks directly to the cursor through the index, so every page costs about the same. Offset pagination reads and discards all the skipped rows." },
    { level: 2, q: "A client retries `POST /payments` with the same `Idempotency-Key` but a **different** amount. What should the server do?",
      options: ['Reject it with a 4xx error (for example 422 or 409) because the key was already used for a different request', 'Process it as a new payment', 'Silently return the original response', 'Return 200 and update the original payment to the new amount'], answer: 0,
      why: "A key identifies one logical operation. Reusing it with a different payload is a client bug; returning the old response would hide it, and processing it would defeat the purpose of the key." },
    { level: 3, q: "A service method has both `@Transactional` and a retry annotation, and you want to retry the whole unit of work after a deadlock. Which ordering is correct?",
      options: ['Retry outermost, so each attempt starts a fresh transaction', 'Transaction outermost, so all attempts share one transaction', 'The order does not matter', 'Transactions cannot be retried'], answer: 0,
      why: "A deadlock aborts the transaction. Retrying inside it keeps working in a transaction that can only roll back; the retry must wrap the transactional boundary." },
    { level: 2, q: "Lombok `@Data` is put on two JPA entities with a bidirectional `@OneToMany`/`@ManyToOne` relation. What is the most likely failure?",
      options: ['`toString` or `hashCode` recursing between parent and children (`StackOverflowError`), or triggering lazy loading outside a session', 'Compilation fails because Lombok does not support JPA', 'Hibernate refuses to start', 'Nothing — `@Data` is designed for entities'], answer: 0,
      why: "The generated methods include every field, so parent and child call each other endlessly and touch lazy collections. Write `equals`/`hashCode`/`toString` deliberately on entities." }
  ]
});
