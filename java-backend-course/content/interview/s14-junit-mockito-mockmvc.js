/* Interview pack — Session 14: JUnit 5, Mockito & MockMvc */
COURSE.prep(14, {
  deepDives: [
    {
      title: 'Deep dive: test doubles done right — stubs, mocks, fakes & the cost of over-mocking',
      lead: 'Big-tech codebases have millions of tests. What keeps them useful is choosing the right double and asserting on behaviour, not on implementation details.',
      table: { head: ['Double', 'What it does', 'Use it for', 'Example'], rows: [
        ['Dummy', 'Passed but never used', 'Filling a parameter list', 'A `null`-object logger'],
        ['Stub', 'Returns canned answers', 'Controlling indirect inputs', '`when(repo.findById(1)).thenReturn(Optional.of(user))`'],
        ['Spy', 'Wraps a real object and records calls', 'Checking a side effect while keeping real behaviour', '`@MockitoSpyBean` around a real service'],
        ['Mock', 'Pre-programmed expectations, verified afterwards', 'When the interaction *is* the behaviour', '`verify(mailer).send(eq(\"asha\"), any())`'],
        ['Fake', 'A working lightweight implementation', 'Complex dependencies used by many tests', 'In-memory repository, fixed `Clock`, embedded broker']
      ] },
      points: [
        "Mock **roles at boundaries you own** — ports such as `PaymentGateway` or `Mailer` — not value objects, not the class under test, and not third-party types you do not control (wrap them first).",
        "Over-mocking makes tests mirror the implementation: a harmless refactoring breaks dozens of tests while real bugs slip through. Prefer asserting on **state and results**; verify interactions only when they are the observable behaviour (an e-mail sent, a message published).",
        "**Fakes** pay off for complex collaborators: an in-memory repository behind the real interface makes many tests fast and realistic. Keep it honest with one contract test suite that runs against both the fake and the real implementation.",
        "Spring Boot 4 removed `@MockBean`; use `@MockitoBean`/`@MockitoSpyBean`. Each distinct combination of mocked beans creates a **separate application context**, so inconsistent mocking across test classes slows suites dramatically.",
        "Determinism rules: inject `Clock`, seed randomness, never `Thread.sleep` to wait for async work (use Awaitility or latches), and give every test its own data."
      ],
      code: { lang: 'java', file: 'FakesDemo.java', src: code`
        import java.time.*;
        import java.util.*;

        public class FakesDemo {
            record Subscription(String user, LocalDate renewsOn, boolean active) {}
            interface SubscriptionRepo { Optional<Subscription> find(String user); void save(Subscription s); }
            interface Mailer { void send(String to, String subject); }

            /** Under test: depends only on interfaces and a Clock, so tests control time and I/O. */
            static final class RenewalService {
                private final SubscriptionRepo repo;
                private final Mailer mailer;
                private final Clock clock;
                RenewalService(SubscriptionRepo repo, Mailer mailer, Clock clock) { this.repo = repo; this.mailer = mailer; this.clock = clock; }

                boolean renewIfDue(String user) {
                    Subscription s = repo.find(user).orElseThrow();
                    if (!s.active() || LocalDate.now(clock).isBefore(s.renewsOn())) return false;
                    LocalDate next = s.renewsOn().plusMonths(1);
                    repo.save(new Subscription(user, next, true));
                    mailer.send(user, "Renewed until " + next);
                    return true;
                }
            }

            /** Fake: a real, in-memory implementation of the port. */
            static final class InMemoryRepo implements SubscriptionRepo {
                private final Map<String, Subscription> rows = new HashMap<>();
                public Optional<Subscription> find(String u) { return Optional.ofNullable(rows.get(u)); }
                public void save(Subscription s) { rows.put(s.user(), s); }
            }

            static void check(String name, boolean ok) { System.out.println((ok ? "PASS " : "FAIL ") + name); }

            public static void main(String[] args) {
                Clock nov6 = Clock.fixed(Instant.parse("2026-11-06T10:00:00Z"), ZoneOffset.UTC);
                InMemoryRepo repo = new InMemoryRepo();
                List<String> sent = new ArrayList<>();                    // records what the mailer was asked to do
                RenewalService svc = new RenewalService(repo, (to, subject) -> sent.add(to + ": " + subject), nov6);

                repo.save(new Subscription("asha", LocalDate.parse("2026-11-06"), true));
                repo.save(new Subscription("bala", LocalDate.parse("2026-11-20"), true));
                check("due subscription renews", svc.renewIfDue("asha")
                        && repo.find("asha").orElseThrow().renewsOn().equals(LocalDate.parse("2026-12-06")));
                check("not yet due: nothing happens", !svc.renewIfDue("bala"));
                check("exactly one e-mail, with the new date", sent.equals(List.of("asha: Renewed until 2026-12-06")));
                check("renewing twice on the same day is a no-op", !svc.renewIfDue("asha") && sent.size() == 1);
            }
        }`, out: code`
        PASS due subscription renews
        PASS not yet due: nothing happens
        PASS exactly one e-mail, with the new date
        PASS renewing twice on the same day is a no-op` },
      notes: [
        "The demo is a framework-free version of a well-designed unit test: a fixed clock makes *today* deterministic, the fake repository behaves like a real one, and the mailer is a lambda that records calls. The same test in JUnit 5 would use `@Test` methods and AssertJ, but the design choices are what matter.",
        "Notice what is **not** verified: the exact sequence of repository calls. If the service later reads the subscription differently, these tests keep passing as long as the behaviour is the same — that is what makes a test suite an asset during refactoring.",
        "Context caching in Spring tests keys on the full configuration, including mocked beans and properties. Standardise a few base test configurations so dozens of test classes share the same cached context."
      ]
    },
    {
      title: 'Deep dive: measuring test quality — mutation, property-based & contract testing',
      lead: 'Coverage tells you which lines ran, not whether a test would notice a bug. These techniques measure and raise the real strength of a suite.',
      table: { head: ['Technique', 'What it finds', 'Cost'], rows: [
        ['Mutation testing (PIT)', 'Tests that run code without checking it: surviving mutants', 'Minutes to hours; run on changed code in CI'],
        ['Property-based testing (jqwik)', 'Edge cases nobody thought of, shrunk to a minimal counterexample', 'More thought per test; fast to run'],
        ['Differential testing', 'Divergence between a fast and a simple implementation', 'Needs a reference implementation'],
        ['Contract testing (Spring Cloud Contract, Pact)', 'Breaking API changes between services before deployment', 'Coordination between teams; cheap at run time'],
        ['End-to-end tests', 'Wiring and configuration problems across the whole system', 'Slow, flaky, expensive — keep very few']
      ] },
      points: [
        "**Mutation testing** changes your code — flips `<` to `<=`, deletes a call, returns `null` — and reruns the tests. A mutant that survives means no assertion depended on that behaviour. The mutation score is the honest metric that coverage pretends to be.",
        "**Property-based tests** state invariants — *shares always sum to the total*, *`decode(encode(x))` equals x*, *the answer is feasible and the answer minus one is not* — and check them against hundreds of generated inputs.",
        "**Differential testing** compares an optimised implementation with a slow, obviously correct one on random inputs — the technique used in nearly every coding round of this course.",
        "**Flaky tests** have a short list of causes: time, ordering and shared state, concurrency with sleeps, environment (time zone, locale, ports) and network. Quarantine with an owner and a deadline, then fix the root cause; track the flake rate as a team metric.",
        "**Contract tests** check that a provider still satisfies what each consumer expects, without a shared end-to-end environment — the main safety net for independent microservice deployments.",
        "Keep the pyramid economical: many fast unit tests, fewer slice and Testcontainers tests, a handful of end-to-end smoke tests, and pull-request feedback in under about ten minutes."
      ],
      notes: [
        "A useful habit when a bug reaches production: before fixing it, write the test that would have caught it, and ask which technique would have generated that test — often a property you never stated.",
        "PIT can be scoped to changed classes in pull requests (`-DtargetClasses`, or incremental analysis), which keeps it affordable in CI.",
        "This session's coding round shows property and differential checks side by side: the binary-search answer is compared with brute force and also checked for feasibility and minimality."
      ]
    }
  ],

  stretch: [
    "Add PIT mutation testing to the Splitwise module, inspect the surviving mutants in the split strategies, and add tests until the mutation score passes 85%.",
    "Replace a Mockito-heavy service test with an in-memory fake repository and a fixed `Clock`; then refactor the service's internals and compare how both test styles react.",
    "Write a consumer-driven contract (Spring Cloud Contract or Pact) for `GET /groups/{id}/balances`, then rename a field in the provider and watch the contract test fail in CI."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: ship packages within D days (binary search on the answer)',
      lead: 'The best-known *binary search on the answer* problem — and a chance to show how you test an algorithm, not just write it.',
      difficulty: 'Medium', minutes: 30, lc: 1011, pattern: ['binary-search', 'greedy'],
      problem: [
        "Packages on a conveyor belt must be shipped within `days` days. The i-th package weighs `weights[i]`. Each day the ship is loaded with packages **in the given order** until the next one would exceed its capacity.",
        "Return the **least ship capacity** that ships every package within `days` days. Then show how you would convince yourself — and a reviewer — that the answer is right."
      ],
      examples: [
        { in: 'weights = [1,2,3,4,5,6,7,8,9,10], days = 5', out: '15', why: "Days: [1..5], [6,7], [8], [9], [10] — a capacity of 14 needs a sixth day." },
        { in: 'weights = [3,2,2,4,1,4], days = 3', out: '6' },
        { in: 'weights = [1,2,3,1,1], days = 4', out: '3' }
      ],
      constraints: ["`1 ≤ days ≤ weights.length ≤ 5 × 10⁴`", "`1 ≤ weights[i] ≤ 500`"],
      hints: [
        "If capacity C works, does C + 1 also work? What does that monotonicity let you do?",
        "The answer lies between `max(weights)` (the heaviest package must fit) and `sum(weights)` (ship everything in one day).",
        "For a candidate capacity, count the days greedily in O(n); binary-search for the smallest capacity whose day count is at most `days`."
      ],
      approaches: [
        { name: 'Try every capacity', idea: 'Increase capacity from max(weights) until the greedy count fits', time: 'O(n · S)', space: 'O(1)' },
        { name: 'Binary search on the answer', idea: 'Monotonic predicate *ships within D days*; greedy check per candidate', time: 'O(n log S)', space: 'O(1)' }
      ],
      code: { lang: 'java', file: 'ShipWithinDays.java', src: code`
        import java.util.*;

        public class ShipWithinDays {
            static int shipWithinDays(int[] w, int days) {
                int lo = Arrays.stream(w).max().orElse(0), hi = Arrays.stream(w).sum();
                while (lo < hi) {                                    // invariant: the answer is in [lo, hi]
                    int mid = lo + (hi - lo) / 2;
                    if (daysNeeded(w, mid) <= days) hi = mid;        // mid works: maybe something smaller does
                    else lo = mid + 1;                               // mid is too small
                }
                return lo;
            }

            /** Greedy: load in order, start a new day when the next package would not fit. */
            static int daysNeeded(int[] w, int cap) {
                int days = 1, load = 0;
                for (int x : w) {
                    if (load + x > cap) { days++; load = 0; }
                    load += x;
                }
                return days;
            }

            static int bruteForce(int[] w, int days) {
                for (int cap = Arrays.stream(w).max().orElse(0); ; cap++) if (daysNeeded(w, cap) <= days) return cap;
            }

            public static void main(String[] args) {
                System.out.println(shipWithinDays(new int[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, 5));
                System.out.println(shipWithinDays(new int[] {3, 2, 2, 4, 1, 4}, 3));
                System.out.println(shipWithinDays(new int[] {1, 2, 3, 1, 1}, 4));

                Random rnd = new Random(1011);
                int checked = 0;
                for (int t = 0; t < 2_000; t++) {
                    int[] w = new int[1 + rnd.nextInt(15)];
                    for (int i = 0; i < w.length; i++) w[i] = 1 + rnd.nextInt(30);
                    int days = 1 + rnd.nextInt(w.length);
                    int fast = shipWithinDays(w, days);
                    boolean feasible = daysNeeded(w, fast) <= days;                     // property 1
                    boolean minimal = fast == Arrays.stream(w).max().getAsInt()
                            || daysNeeded(w, fast - 1) > days;                         // property 2
                    if (fast != bruteForce(w, days) || !feasible || !minimal)           // differential check
                        throw new AssertionError(Arrays.toString(w) + " days=" + days);
                    checked++;
                }
                System.out.println(checked + " random cases: binary search == brute force, answer feasible and minimal");
            }
        }`, out: code`
        15
        6
        3
        2000 random cases: binary search == brute force, answer feasible and minimal` },
      pitfalls: [
        "Starting the search at 0 or 1: a capacity below the heaviest package can never ship it, and the greedy count becomes meaningless.",
        "Mixing loop styles — `while (lo <= hi)` with `hi = mid` — loops forever; pick one invariant and stick to it.",
        "Computing `(lo + hi) / 2` can overflow for large ranges; use `lo + (hi - lo) / 2`.",
        "Sorting the packages changes the problem: the order is fixed."
      ],
      followUps: [
        { q: "Solve *split array largest sum* (LeetCode 410, Hard).",
          a: "Same pattern: split an array into k contiguous parts minimising the largest part's sum. The answer lies in [max, sum]; for a candidate limit, greedily count how many parts are needed; binary-search the smallest limit that needs at most k parts. Recognising that two problems share one predicate shape is exactly what interviewers look for." },
        { q: "How do you know the predicate is monotonic?",
          a: "If capacity C ships within D days, any C' > C can reuse exactly the same daily loads, so it ships within D days too. Being explicit about this argument is what makes binary search on the answer correct — without monotonicity it would silently return wrong answers." },
        { q: "How would you test this in a real codebase?",
          a: "`@ParameterizedTest` for the examples and boundaries (one package, days = n, days = 1); a property-based test (jqwik) asserting that the answer is feasible and the answer minus one is not; a differential test against brute force on small random inputs; and PIT mutation testing to confirm the tests notice when `<` and `<=` are swapped in either loop." }
      ],
      rubric: [
        "Identifies binary search on the answer and justifies the monotonic predicate.",
        "Chooses correct bounds and a loop invariant with no infinite loop or off-by-one.",
        "States O(n log S) and explains each factor.",
        "Tests the solution with the examples plus feasibility/minimality properties or a brute-force comparison."
      ],
      notes: [
        "The harness encodes the two properties that *define* the answer — it is feasible, and one less is not — plus a comparison with brute force. Writing those down is often more convincing in an interview than a long argument.",
        "Binary search on the answer appears in backend work too: finding the maximum batch size that meets a latency budget, or the minimum number of partitions for a throughput target, given a monotonic test.",
        "If you are unsure about the bounds, run the brute force mentally on the first example: capacity 14 needs six days, 15 needs five — so the search must be able to land exactly on 15."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: testing strategy & tools',
      lead: 'Testing questions reveal engineering maturity: what you test, how you keep tests trustworthy and how you keep them fast.',
      qa: [
        { level: 1, q: "Mock, stub, fake and spy — define each, with an example from a Spring project.",
          a: "A **stub** returns canned answers to control the code's inputs — `when(userRepository.findById(1L)).thenReturn(Optional.of(asha))`. A **mock** is a stub whose interactions you verify afterwards — `verify(emailSender).send(\"asha@x.com\", \"Welcome\")` — appropriate when the interaction is the behaviour being tested. A **fake** is a simplified but working implementation — an in-memory repository, a fixed `Clock`, an embedded Kafka. A **spy** wraps a real object, keeping its behaviour while recording (or selectively overriding) calls — `@MockitoSpyBean` on a real service. (A **dummy** is passed but never used.) Mockito creates stubs, mocks and spies; fakes you write yourself.",
          follow: ["Why can verifying too many interactions make tests brittle?"] },
        { level: 2, q: "When should you **not** use mocks?",
          a: "Do not mock **value objects** (records, `Money`, dates) — use real ones. Do not mock **the class under test** or your own simple, deterministic collaborators — use the real thing. Do not mock **types you do not own** (a vendor SDK, `RestClient` internals): wrap them behind your own interface and mock that, or use WireMock for HTTP. Do not mock the **database** when the behaviour depends on SQL, constraints or transactions — use Testcontainers. And avoid mocks when you would only be re-stating the implementation step by step: if a test needs ten `when(...)` lines, the design or the test level is probably wrong.",
          follow: ["What does a test with ten stubbed calls usually tell you about the code?"] },
        { level: 2, q: "How do you test code that depends on the current time or on randomness?",
          a: "Never call `Instant.now()`, `LocalDate.now()` or `new Random()` deep inside business code. Inject a `java.time.Clock` (a Spring bean in production, `Clock.fixed(...)` or a mutable test clock in tests) and pass it to `LocalDate.now(clock)`. For randomness, inject a `RandomGenerator` (or a `Random` with a fixed seed in tests), so failures are reproducible. For time-driven behaviour — expiry, scheduling, rate limits — advance the test clock explicitly instead of sleeping. Also run tests in a fixed time zone and locale (or test several explicitly) to catch date-boundary bugs.",
          follow: ["How would you test a rate limiter that refills tokens over time?"] },
        { level: 2, q: "`@WebMvcTest`, `@DataJpaTest` and `@SpringBootTest` — what does each load, and how do you keep the suite fast?",
          a: "`@WebMvcTest` loads only the MVC layer for the selected controllers (controllers, advice, converters, filters, security configuration) — services are replaced with `@MockitoBean`. `@DataJpaTest` loads JPA repositories, entities and a datasource (embedded or a Testcontainers database via `@ServiceConnection`), each test rolled back. `@SpringBootTest` starts the full application context, optionally with a real web server. Speed comes from: slicing (load only what the test needs), **context caching** (keep configurations identical across classes — every new combination of mocked beans or properties builds a new context), reusing one Testcontainers container per JVM, and running test classes in parallel.",
          follow: ["Why does adding a single `@MockitoBean` to one test class sometimes add a minute to the build?"] },
        { level: 2, q: "How do you test asynchronous or concurrent code?",
          a: "For asynchronous flows (an event handler, a Kafka consumer), never `Thread.sleep` and hope: wait for the observable outcome with a timeout — Awaitility's `await().atMost(5, SECONDS).until(...)` — or have the handler count down a `CountDownLatch` the test awaits. For unit tests of code that uses executors, inject a direct executor that runs tasks inline so the test is deterministic. For real concurrency bugs, run the operation from many threads with a start barrier and check invariants (no lost updates, no duplicates), repeat it many times, and for low-level primitives use a specialised harness such as jcstress.",
          follow: ["Why does a sleep-based test both slow the suite and stay flaky?"] },
        { level: 2, q: "What is mutation testing, and why is 90% line coverage not enough?",
          a: "Coverage only proves that lines **executed**; a test with no assertions can reach 100%. Mutation testing (PIT for Java) makes small changes to the code — replacing `<` with `<=`, negating a condition, removing a method call, returning a constant — and reruns the tests. If the tests still pass, the mutant *survived*: no test depends on that behaviour. The mutation score (killed ÷ total mutants) therefore measures how well the tests detect faults. In practice, run it on critical domain code or on changed classes in CI, and treat surviving mutants as prompts for missing assertions — not every survivor needs a test.",
          follow: ["Give an example of an *equivalent mutant* that can never be killed."] },
        { level: 2, q: "A test passes locally and fails randomly in CI. How do you find and fix the cause?",
          a: [
            "**Reproduce**: run the test in a loop, with the same random seed and test order as CI, on a loaded machine.",
            "**Classify** the usual suspects: time (date boundaries, time zones, `now()`), ordering (tests sharing a database row, static state, cache entries), asynchrony (sleeps, unawaited futures), environment (locale, file paths, fixed ports), network or external services, and resource leaks between tests.",
            "**Fix the root cause**: isolate data per test, inject clocks, replace sleeps with awaits, use random ports and Testcontainers.",
            "**Contain**: quarantine the test with an owner and a deadline so the main build stays trustworthy, and track the flake rate — a suite people ignore is worse than no suite."
          ],
          follow: ["Why is *just rerun the build* a dangerous team habit?"] },
        { level: 3, q: "Design the testing strategy for a microservice that uses MySQL, Redis, Kafka and calls two other services.",
          a: [
            "**Unit tests** for domain logic — pure Java, fakes for ports, property-based tests for invariants: the bulk of the suite, running in seconds.",
            "**Slice tests**: `@WebMvcTest` for controllers (validation, status codes, error bodies), `@DataJpaTest` with MySQL in Testcontainers for queries and constraints.",
            "**Integration tests** with Testcontainers for MySQL, Redis and Kafka (`@ServiceConnection`), and WireMock for the two HTTP dependencies, including failures (timeouts, 500s, slow responses) to test retries and circuit breakers.",
            "**Contract tests** with the consumers of our API and against the providers we call, so either side can deploy independently.",
            "**A few end-to-end smoke tests** in staging after deployment, plus performance tests on the critical paths.",
            "**CI layout**: fast unit and slice tests on every pull request, integration tests in a parallel stage, mutation testing on changed classes, and quarantine plus metrics for flaky tests."
          ],
          follow: ["Where would you test idempotency of the Kafka consumer?"] },
        { level: 3, q: "Contract testing versus end-to-end testing for microservices — what does each catch, and what does each cost?",
          a: "**End-to-end tests** deploy many services together and drive real user journeys: they catch wiring, configuration and integration problems, but they are slow, flaky (any service or dependency can fail), expensive to maintain, and they force teams to coordinate releases around a shared environment. **Contract tests** split the problem: consumers record the requests they make and the responses they rely on; providers verify those contracts in their own CI. They catch breaking changes to APIs and messages early and cheaply, and let each service deploy independently — but they do not test behaviour beyond the contract, network configuration or end-user flows. Most organisations use many contract tests plus a small number of end-to-end smoke tests for the most important journeys.",
          follow: ["Who should own a contract — the consumer or the provider?"] },
        { level: 2, q: "Mockito's strict stubs threw `UnnecessaryStubbingException`. What does it mean, and what is the right fix?",
          a: "A `when(...)` stub was set up but never used by the code under test. Strict stubs (the default with the Mockito JUnit 5 extension) fail the test because an unused stub usually means the test is misleading — it describes a scenario the code never exercises — or the code took a different path than intended (a bug). The right fix is to delete the unnecessary stub, or to fix the test or code so the intended path runs. Use `lenient()` only for a deliberate shared setup used by some tests and not others — never as a blanket switch to silence the error.",
          follow: ["Why do unused stubs make tests harder to maintain?"] }
      ],
      notes: [
        "Interviewers often ask for a testing strategy as a small design question. Structure the answer by layer, name the tools and say what each layer is *for* — then mention speed and flakiness.",
        "Mention determinism (clocks, seeds, awaits) unprompted; it signals that you have maintained a real test suite.",
        "If you have used property-based or mutation testing, give one concrete bug it found — that is far more convincing than describing the technique."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "`when(spyList.get(0)).thenReturn(\"x\")` on a Mockito spy of an empty `ArrayList` throws `IndexOutOfBoundsException`. Why?",
      options: ['`when(spy.get(0))` calls the real `get(0)` before stubbing; use `doReturn(\"x\").when(spy).get(0)` for spies', 'Spies cannot be stubbed at all', 'The list must be declared final', 'Mockito requires an index greater than 0'], answer: 0,
      why: "With `when(...)`, the method is invoked as an ordinary call first, which runs the real method on a spy. The `doReturn(...).when(spy)` form stubs without calling it." },
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            public static void main(String[] args) {
                int[] a = {1, 3, 3, 3, 5, 8};
                int lo = 0, hi = a.length;                     // first index with a[i] >= 3
                while (lo < hi) {
                    int mid = (lo + hi) >>> 1;
                    if (a[mid] >= 3) hi = mid; else lo = mid + 1;
                }
                int first = lo;
                lo = 0; hi = a.length;                         // first index with a[i] > 3
                while (lo < hi) {
                    int mid = (lo + hi) >>> 1;
                    if (a[mid] > 3) hi = mid; else lo = mid + 1;
                }
                System.out.println(first + " " + lo + " count=" + (lo - first));
            }
        }`, out: '1 4 count=3' },
      options: ['`1 3 count=2`', '`1 4 count=3`', '`2 4 count=2`', '`0 4 count=4`'], answer: 1,
      why: "These are lower-bound and upper-bound searches over the half-open range [lo, hi): the first 3 is at index 1, the first element greater than 3 is at index 4, so the value 3 occurs 4 − 1 = 3 times." },
    { level: 2, q: "Many unit tests need a repository with realistic behaviour (save, find, update) and must run in milliseconds. Which test double fits best?",
      options: ['A dummy', 'A stub per test', 'A fake (in-memory implementation of the interface)', 'A mock with verified interactions'], answer: 2,
      why: "A fake behaves like the real thing for many scenarios without per-test stubbing. Keep it honest with a contract test that runs against both the fake and the real repository." },
    { level: 3, q: "A Spring Boot test suite takes 25 minutes because about 40 different application contexts are started. What is the most likely cause?",
      options: ['Test classes use different combinations of `@MockitoBean`s and properties, which defeats context caching', 'JUnit 5 is slower than JUnit 4', 'Too many assertions per test', 'The tests run in parallel'], answer: 0,
      why: "Spring caches contexts by their full configuration. Every distinct set of mocked beans or properties forces a new context — standardise test configurations to share them." },
    { level: 2, q: "A test sleeps 500 ms before asserting that an asynchronous event was processed, and fails about 2% of the time in CI. What is the best fix?",
      options: ['Wait for the outcome with a timeout (Awaitility) or a latch the handler signals', 'Increase the sleep to 5 seconds', 'Mark the test as `@Disabled`', 'Retry the test automatically until it passes'], answer: 0,
      why: "Waiting on the actual condition is both faster (it returns as soon as the event is processed) and reliable under load. Longer sleeps only slow the suite and hide the problem." }
  ]
});
