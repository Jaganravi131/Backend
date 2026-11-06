/* Interview pack — Session 8: Spring Boot, Spring MVC & HTTP */
COURSE.prep(8, {
  deepDives: [
    {
      title: 'Deep dive: inside the Spring container — bean lifecycle, post-processors & proxies',
      lead: 'What happens between `SpringApplication.run` and your first request — and why the object other beans receive is often not your object at all.',
      diagram: { kind: 'flow', dir: 'v', nodes: [
        { t: 'Bean definitions', s: 'component scan, @Bean methods, auto-configuration (filtered by @Conditional…)', tone: 'gray' },
        { t: 'Instantiate', s: 'constructor injection resolves dependencies first', tone: 'blue' },
        { t: 'Populate + Aware callbacks', s: 'setter/field injection, BeanNameAware, ApplicationContextAware', tone: 'blue' },
        { t: 'BeanPostProcessor — before init', s: '', tone: 'yellow' },
        { t: '@PostConstruct / afterPropertiesSet', s: 'your initialisation code', tone: 'green' },
        { t: 'BeanPostProcessor — after init', s: 'proxies for @Transactional, @Async, @Cacheable are created HERE', tone: 'orange' },
        { t: 'Ready → @PreDestroy on shutdown', s: 'singletons are cached and shared', tone: 'purple' }
      ] },
      points: [
        "Startup has two halves: **bean definitions** are collected first (scanning, `@Bean` methods, auto-configuration classes filtered by conditions), then singletons are created in dependency order.",
        "`BeanPostProcessor`s see every bean. The after-initialisation hook is where `@Transactional`, `@Async`, `@Cacheable` and `@Validated` beans are wrapped in **proxies** — other beans are injected with the proxy, not your instance.",
        "Constructor injection fails fast on missing dependencies and makes cycles impossible to hide. Spring Boot rejects circular references by default; a cycle is a design smell to break, not a setting to flip.",
        "`@Configuration` classes are CGLIB-proxied (`proxyBeanMethods = true`) so that calling one `@Bean` method from another returns the singleton. Boot's own auto-configurations use `proxyBeanMethods = false` to start faster.",
        "Scopes: **singleton** (one per container), **prototype** (new per lookup — inject an `ObjectProvider<T>` to get fresh instances), **request**/**session** (web scopes via scoped proxies).",
        "Auto-configuration classes are listed in `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` and guarded by `@ConditionalOnClass`, `@ConditionalOnProperty`, `@ConditionalOnMissingBean` — so **your bean always wins**. Run with `--debug` to print the conditions report."
      ],
      code: { lang: 'java', file: 'MoviesClientAutoConfiguration.java', src: code`
        @AutoConfiguration
        @ConditionalOnClass(RestClient.class)
        @EnableConfigurationProperties(MoviesClientProperties.class)
        public class MoviesClientAutoConfiguration {

            @Bean
            @ConditionalOnMissingBean                       // the application's own bean wins
            @ConditionalOnProperty(prefix = "movies.client", name = "enabled", havingValue = "true", matchIfMissing = true)
            MoviesClient moviesClient(RestClient.Builder builder, MoviesClientProperties props) {
                return new MoviesClient(builder.baseUrl(props.baseUrl()).build());
            }
        }
        // registered in META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` },
      callout: { kind: 'interview', text: "*Why doesn't my `@Transactional` work?* is really a question about this slide: the annotation is implemented by a proxy created in a post-processor, so calls that bypass the proxy — `this.method()`, private methods, objects you created with `new` — get no transaction." },
      notes: [
        "Spring Boot's conditions report (`--debug` or the `conditions` actuator endpoint) lists every auto-configuration with *positive matches* and *negative matches* and the reason. It is the fastest way to answer *why was this bean (not) created?*.",
        "Prototype beans injected into a singleton are resolved once, at the singleton's creation. The fix is to depend on `ObjectProvider<T>` and call `getObject()` when you need a new instance, or to use a method-injection `@Lookup` method.",
        "Bean creation order matters for startup failures: if a bean's constructor calls a remote service, the whole application fails to start when that service is down. Prefer lazy connections and health checks over remote calls in constructors."
      ]
    },
    {
      title: 'Deep dive: the request path — Tomcat threads, DispatcherServlet & HTTP versions',
      lead: 'From a TCP connection to your controller method and back, plus the capacity maths that explains most latency incidents.',
      diagram: { kind: 'seq', actors: ['Client', 'Tomcat thread', 'Filters', 'DispatcherServlet', 'Controller', 'Service / DB'], msgs: [
        [0, 1, 'HTTP request'], [1, 2, 'doFilter (security, CORS, logging)'], [2, 3, 'service()'],
        [3, 3, 'HandlerMapping finds the method'], [3, 4, 'invoke — arguments via converters'], [4, 5, 'business call'],
        [5, 4, 'result', 'r'], [4, 3, 'ResponseEntity', 'r'], [3, 2, 'JSON written by Jackson', 'r'], [2, 0, 'HTTP response', 'r']
      ] },
      points: [
        "Tomcat's connector accepts connections with NIO and hands each request to a worker thread (`server.tomcat.threads.max`, default **200**). That thread stays busy until the response is written — including all the time spent waiting for the database.",
        "Inside: filter chain → `DispatcherServlet` → `HandlerMapping` → interceptors' `preHandle` → `HandlerAdapter` (argument resolvers and `HttpMessageConverter`s) → controller → return-value handling → `HandlerExceptionResolver`s for exceptions.",
        "**Little's law** sizes it: 200 threads ÷ 0.1 s average latency ≈ 2,000 requests/s. If a slow database pushes latency to 1 s, capacity drops to 200 requests/s and requests queue. Virtual threads remove the thread limit, not the database limit.",
        "HTTP/1.1 keep-alive reuses connections but serves one request at a time per connection; **HTTP/2** multiplexes many streams over one TCP connection with header compression; **HTTP/3** runs over QUIC (UDP) to avoid TCP-level head-of-line blocking.",
        "TLS 1.3 needs one round trip for a full handshake. TLS usually terminates at the load balancer or gateway, with re-encryption inside the network where zero-trust policies require it.",
        "Graceful shutdown (on by default in recent Spring Boot versions) stops accepting new requests and lets in-flight ones finish within `spring.lifecycle.timeout-per-shutdown-phase` (30 s by default)."
      ],
      notes: [
        "The seq diagram is the mental model for debugging: a 401 comes from the filter chain before any controller runs; a 400 with *Failed to read request* comes from a message converter; a 404 for an existing URL usually means `HandlerMapping` found no matching method (wrong HTTP method or path).",
        "Capacity incidents rarely show high CPU: threads are blocked waiting on I/O. Watch `tomcat.threads.busy`, HikariCP's pending-connection count and downstream latency together — when all three rise, the bottleneck is downstream.",
        "With `spring.threads.virtual.enabled=true`, Tomcat runs each request on a virtual thread, so thousands can wait concurrently. The database connection pool (10 connections by default in HikariCP) then becomes the visible limit — size it deliberately."
      ]
    }
  ],

  stretch: [
    "Add HTTP methods to today's router: return `405 Method Not Allowed` with an `Allow` header when the path matches but the method does not, then compare its decisions with Spring MVC's using a small `@WebMvcTest`.",
    "Write an auto-configuration for a `MoviesClient` with `@ConditionalOnProperty` and `@ConditionalOnMissingBean`, register it in `AutoConfiguration.imports`, and test both branches with `ApplicationContextRunner`.",
    "Load-test an endpoint that sleeps 200 ms with 1,000 concurrent users, first with the default 200 platform threads and then with `spring.threads.virtual.enabled=true`; compare throughput and p99 latency and explain the numbers with Little's law."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: HTTP route matcher with path variables (trie)',
      lead: 'What `DispatcherServlet` asks of its handler mappings on every request: match a path against thousands of patterns, pick the most specific one and extract the variables.',
      difficulty: 'Medium', minutes: 45, pattern: ['trie', 'design', 'strings'],
      problem: [
        "Implement a `Router` with `add(String pattern, String handler)` and `Optional<Match> match(String path)`.",
        "Patterns are `/`-separated segments. A segment is a **literal** (`users`), a **variable** (`{id}`), or a trailing **`**`** that matches the rest of the path — zero or more segments. `match` returns the handler and the captured variables.",
        "When several patterns match, choose the **most specific**: at each segment a literal beats a variable, and a variable beats `**`. If the most specific branch dead-ends later in the path, fall back to the next candidate. Registering the same route twice is an error."
      ],
      examples: [
        { in: 'routes: /users/me, /users/{id}, /users/{id}/orders/{orderId}, /files/**, /**\nmatch("/users/42/orders/7")', out: 'handler for /users/{id}/orders/{orderId}, vars {id=42, orderId=7}' },
        { in: 'match("/users/me")', out: 'handler for /users/me (the literal beats {id})' },
        { in: 'match("/users/42/orders")', out: 'handler for /** (no deeper pattern ends there, so fall back)' }
      ],
      constraints: ["Up to 10⁴ routes and paths of up to 50 segments", "Variable names are unique within a pattern", "`**` may only appear as the last segment"],
      hints: [
        "Comparing the path with every pattern costs O(routes × segments) per request. How can patterns that share a prefix share the work?",
        "Build a trie keyed by segment: each node has literal children, one *variable* child and possibly a `**` handler. Store the variable **names** at the terminal node, since different patterns may name the same position differently.",
        "Match depth-first in priority order — literal, then variable, then `**` — and backtrack when a branch dead-ends."
      ],
      approaches: [
        { name: 'Regex per route, linear scan', idea: 'Compile each pattern to a regex and try them all, keeping the most specific match', time: 'O(R · L) per request', space: 'O(R · L)' },
        { name: 'Sort by specificity, first match', idea: 'Pre-sort patterns by a specificity score and return the first that matches', time: 'O(R · L) per request', space: 'O(R · L)' },
        { name: 'Segment trie + backtracking', idea: 'Walk the trie segment by segment: literal → variable → **; backtrack on dead ends', time: 'O(L) typical per request', space: 'O(total segments)' }
      ],
      code: { lang: 'java', file: 'Router.java', src: code`
        import java.util.*;

        public class Router {
            public record Match(String handler, Map<String, String> vars) {}

            private static final class Node {
                final Map<String, Node> literal = new HashMap<>();
                Node param;                                       // one child for any {variable}
                String handler, wildcard;                         // pattern ends here / trailing "**"
                List<String> vars = List.of(), wildcardVars = List.of();
            }

            private final Node root = new Node();

            public void add(String pattern, String handler) {
                Node n = root;
                List<String> vars = new ArrayList<>();
                String[] segs = split(pattern);
                for (int i = 0; i < segs.length; i++) {
                    String s = segs[i];
                    if (s.equals("**")) {
                        if (i != segs.length - 1) throw new IllegalArgumentException("** must be last: " + pattern);
                        n.wildcard = handler;
                        n.wildcardVars = List.copyOf(vars);
                        return;
                    }
                    if (s.startsWith("{") && s.endsWith("}")) {
                        vars.add(s.substring(1, s.length() - 1));
                        n = n.param == null ? (n.param = new Node()) : n.param;
                    } else {
                        n = n.literal.computeIfAbsent(s, k -> new Node());
                    }
                }
                if (n.handler != null) throw new IllegalArgumentException("duplicate route: " + pattern);
                n.handler = handler;
                n.vars = List.copyOf(vars);
            }

            public Optional<Match> match(String path) {
                return Optional.ofNullable(match(root, split(path), 0, new ArrayDeque<>()));
            }

            /** Most specific first: literal, then {variable}, then "**"; backtracks on dead ends. */
            private Match match(Node n, String[] segs, int i, Deque<String> captured) {
                if (i == segs.length) {
                    if (n.handler != null) return new Match(n.handler, zip(n.vars, captured));
                    return n.wildcard != null ? new Match(n.wildcard, zip(n.wildcardVars, captured)) : null;   // ** = zero segments
                }
                Node lit = n.literal.get(segs[i]);
                if (lit != null) {
                    Match m = match(lit, segs, i + 1, captured);
                    if (m != null) return m;
                }
                if (n.param != null) {
                    captured.addLast(segs[i]);
                    Match m = match(n.param, segs, i + 1, captured);
                    captured.removeLast();
                    if (m != null) return m;
                }
                return n.wildcard != null ? new Match(n.wildcard, zip(n.wildcardVars, captured)) : null;
            }

            private static Map<String, String> zip(List<String> names, Deque<String> values) {
                Map<String, String> m = new LinkedHashMap<>();
                Iterator<String> it = values.iterator();
                for (String name : names) m.put(name, it.next());
                return m;
            }

            private static String[] split(String path) {
                return Arrays.stream(path.split("/")).filter(s -> !s.isEmpty()).toArray(String[]::new);
            }

            public static void main(String[] args) {
                Router r = new Router();
                r.add("/users/me", "currentUser");
                r.add("/users/{id}", "getUser");
                r.add("/users/{id}/orders/{orderId}", "getOrder");
                r.add("/users/{userId}/settings", "settings");
                r.add("/files/**", "staticFiles");
                r.add("/**", "fallback");
                for (String p : List.of("/users/me", "/users/42", "/users/42/orders/7", "/users/9/settings",
                        "/files/css/app.css", "/files", "/health", "/users/42/orders")) {
                    System.out.println(p + " -> " + r.match(p).map(m -> m.handler() + " " + m.vars()).orElse("404"));
                }
                try {
                    r.add("/users/{x}", "dup");
                } catch (IllegalArgumentException e) {
                    System.out.println(e.getMessage());
                }
            }
        }`, out: code`
        /users/me -> currentUser {}
        /users/42 -> getUser {id=42}
        /users/42/orders/7 -> getOrder {id=42, orderId=7}
        /users/9/settings -> settings {userId=9}
        /files/css/app.css -> staticFiles {}
        /files -> staticFiles {}
        /health -> fallback {}
        /users/42/orders -> fallback {}
        duplicate route: /users/{x}` },
      pitfalls: [
        "Treating `/users/me` and `/users/{id}` as ambiguous — the literal must win.",
        "Forgetting that `**` also matches **zero** segments (`/files` matches `/files/**`).",
        "No backtracking: a literal branch that dead-ends deeper in the path must fall back to the variable or wildcard branch.",
        "Normalisation: trailing slashes, empty segments and URL-encoded slashes (`%2F`). Decide the rules explicitly and normalise before matching."
      ],
      followUps: [
        { q: "Add HTTP methods: `GET /users/{id}` and `DELETE /users/{id}`, with a proper error when only the method is wrong.",
          a: "Store a `Map<HttpMethod, Handler>` at each terminal node. If the path matches but the method has no handler, return `405 Method Not Allowed` with an `Allow` header listing the methods present — which is what Spring MVC does — rather than 404." },
        { q: "Support constraints such as `{id:\\d+}`.",
          a: "Give a node a list of constrained variable children, ordered by specificity or declaration, and test each candidate's regex while matching. Constraints reintroduce ambiguity (`{id:\\d+}` versus `{slug}`), so detect conflicting routes when they are registered rather than at request time." },
        { q: "What does Spring itself use?",
          a: "Spring MVC parses patterns once with `PathPatternParser` (the default since Spring Boot 2.6) into chains of path elements, and ranks matching patterns with a specificity comparator that prefers fewer captures and wildcards. `**` is only allowed at the end of a pattern. The older `AntPathMatcher` matched raw strings and was slower." }
      ],
      rubric: [
        "Chooses a trie (or justifies sorting) and analyses the per-request complexity.",
        "Implements specificity — literal over variable over wildcard — with correct backtracking.",
        "Handles `**` matching zero segments, duplicate routes and path normalisation.",
        "Extends the design cleanly to HTTP methods (405) and constrained variables.",
        "Relates the design to how Spring MVC's `PathPatternParser` works."
      ],
      notes: [
        "The last example is the interesting one: `/users/42/orders` walks literal `users`, variable `42` and literal `orders`, finds no handler ending there, and backtracks all the way to the root's `/**`. Many candidates return 404 instead.",
        "Variable names live on the terminal node because `/users/{id}` and `/users/{userId}/settings` share the same trie node for the second segment but name it differently.",
        "In an interview, start by listing the precedence rules with the interviewer — that conversation is part of the score — and only then pick the data structure."
      ]
    },
    {
      type: 'design',
      title: 'Design round: URL shortener (bit.ly)',
      lead: 'The classic first system-design question: small enough to finish in 45 minutes, with real depth in code generation, caching, redirects and analytics.',
      kind: 'HLD', difficulty: 'Medium', minutes: 45,
      prompt: "Design a URL-shortening service like bit.ly. Users create short links for long URLs; anyone opening a short link is redirected. Expect 100 million new links per month and 100 redirects for every link created. Links may have a custom alias and an expiry date, and the business wants click analytics.",
      stages: [
        { t: 'Requirements and non-functionals', ask: 'What is in scope, and which quality matters most?', points: [
          "Functional: create a link (optional alias and expiry), redirect, delete, and see click statistics.",
          "Non-functional: redirects must be **fast** and **highly available** — they are the product; a code must never point to the wrong URL; creation can be a little slower.",
          "Out of scope — say it: user accounts UI, link previews, spam detection beyond basic checks."
        ] },
        { t: 'Back-of-the-envelope estimates', ask: 'How many requests per second, how much storage, how long must a code be?', table: { head: ['Quantity', 'Estimate'], rows: [
          ['Writes', '100 M / month ≈ 40 / s on average, ~400 / s at a 10× peak'],
          ['Reads (100:1)', '≈ 4,000 / s on average, ~40,000 / s at peak'],
          ['Links stored over 5 years', '100 M × 12 × 5 = 6 billion'],
          ['Storage', '6 B × ~500 bytes ≈ 3 TB, plus replicas'],
          ['Code length (base62)', '62⁶ ≈ 5.7 × 10¹⁰ would suffice; 62⁷ ≈ 3.5 × 10¹² gives ample headroom → 7 characters']
        ] }, points: [
          "Reads dominate, so the design optimises the redirect path: caching and replication matter more than write throughput."
        ] },
        { t: 'API and data model', ask: 'What are the endpoints — and should the redirect be a 301 or a 302?', points: [
          "`POST /api/v1/links` with `{longUrl, alias?, expiresAt?}` → `201` with `{code, shortUrl}`; accept an `Idempotency-Key` header so client retries do not create duplicates.",
          "`GET /{code}` → redirect with a `Location` header; `DELETE /api/v1/links/{code}`; `GET /api/v1/links/{code}/stats`.",
          "**301** (permanent) lets browsers cache the redirect — less load, but you lose analytics and cannot change or expire the link. **302/307** means every click reaches you. With analytics and expiry required, choose **302**.",
          "Data: `links(code PK, long_url, owner_id, created_at, expires_at)` — pure key-value access by code, so a key-value store (DynamoDB, Cassandra) or MySQL sharded by code both work. Clicks go to an event log, never into the links table."
        ] },
        { t: 'Generating short codes', ask: 'How do many servers create unique 7-character codes at 400 per second without coordinating on every request?', points: [
          "**Hash the URL** and truncate: collisions require check-and-retry, and the same URL always maps to the same code (bad when two users want different expiries).",
          "**Global counter + base62**: unique, but a single counter is a bottleneck and sequential codes are guessable. Fix both with **range leasing** — each server leases a block of 10,000 ids with one database update — and **scramble** the id with a bijection before encoding.",
          "**Random codes** with an insert-if-absent unique constraint: simple and unguessable; collisions are rare (6 B of 3.5 T codes used) and resolved by retrying.",
          "The scrambling below is obfuscation, not security — use random codes or keyed format-preserving encryption if guessing a neighbour's link must be infeasible."
        ], code: { lang: 'java', file: 'ShortCodes.java', src: code`
          import java.math.BigInteger;
          import java.util.*;
          import java.util.concurrent.atomic.AtomicLong;

          public class ShortCodes {
              static final String ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
              static final int LEN = 7;
              static final BigInteger N = BigInteger.valueOf(62).pow(LEN);          // 62^7 = 3,521,614,606,208 codes
              static final BigInteger K = BigInteger.valueOf(2_176_477_521_573L);   // ~N/phi, coprime with 62^7: a bijection
              static final BigInteger K_INV = K.modInverse(N);

              /** id -> scrambled -> fixed-length base62: consecutive ids do not look consecutive. */
              static String encode(long id) {
                  long x = BigInteger.valueOf(id).multiply(K).mod(N).longValueExact();
                  char[] out = new char[LEN];
                  for (int i = LEN - 1; i >= 0; i--) { out[i] = ALPHABET.charAt((int) (x % 62)); x /= 62; }
                  return new String(out);
              }

              static long decode(String code) {
                  long x = 0;
                  for (char c : code.toCharArray()) x = x * 62 + ALPHABET.indexOf(c);
                  return BigInteger.valueOf(x).multiply(K_INV).mod(N).longValueExact();
              }

              /** The coordinator hands out blocks of ids: one database update per 10,000 links. */
              static final class IdBlocks {
                  private final AtomicLong next = new AtomicLong(1);   // stands in for UPDATE id_blocks SET next = next + :size
                  long[] lease(int size) { long start = next.getAndAdd(size); return new long[] { start, start + size - 1 }; }
              }

              public static void main(String[] args) {
                  IdBlocks coordinator = new IdBlocks();
                  long[] a = coordinator.lease(10_000), b = coordinator.lease(10_000);
                  System.out.println("server A ids " + a[0] + "-" + a[1] + ", server B ids " + b[0] + "-" + b[1]);
                  for (long id : new long[] { 1, 2, 3, 10_001 }) System.out.println(id + " -> " + encode(id) + " -> " + decode(encode(id)));
                  Set<String> seen = new HashSet<>();
                  for (long id = 1; id <= 1_000_000; id++) seen.add(encode(id));
                  System.out.println("1000000 ids -> " + seen.size() + " distinct codes");
              }
          }`, out: code`
          server A ids 1-10000, server B ids 10001-20000
          1 -> cJinsIP -> 1
          2 -> EdRbkao -> 2
          3 -> qxAPctD -> 3
          10001 -> xOFHQYf -> 10001
          1000000 ids -> 1000000 distinct codes` } },
        { t: 'High-level architecture', ask: 'Draw the read path and the write path separately.', diagram: { kind: 'tiers', tiers: [
          { label: 'Edge', nodes: [{ t: 'Clients', s: 'browsers, apps', tone: 'gray' }, { t: 'Load balancer', s: 'TLS termination', tone: 'gray' }] },
          { label: 'Services', via: 'HTTP', nodes: [{ t: 'Redirect service', s: 'stateless, many instances — read path', tone: 'green' }, { t: 'Links API', s: 'create / delete — write path', tone: 'blue' }] },
          { label: 'Data', via: 'cache-aside', nodes: [{ t: 'Redis', s: 'hot codes, negative cache', tone: 'orange' }, { t: 'Links store', s: 'key-value by code, replicated', tone: 'purple' }, { t: 'ID block allocator', s: 'leases ranges', tone: 'yellow' }] },
          { label: 'Analytics', via: 'async click events', bus: true, nodes: [{ t: 'Kafka', s: 'clicks by code', tone: 'red' }, { t: 'Stream aggregation', s: 'per-minute counters', tone: 'blue' }, { t: 'OLAP store', s: 'stats queries', tone: 'gray' }] }
        ] }, points: [
          "**Read path**: load balancer → redirect service → Redis (cache-aside; a small share of links gets most clicks) → links store on a miss. Cache unknown codes briefly too (negative caching) so random probing does not hammer the database.",
          "**Write path**: validate the URL (allowed schemes, block known-malicious domains), take the next id from the leased block, insert, return.",
          "**Analytics**: the redirect service emits a click event asynchronously and never waits for it; a stream job aggregates counts for the stats API."
        ] },
        { t: 'Deep dives and trade-offs', ask: 'A link goes viral. The database is down. Two users claim the same alias. What happens?', points: [
          "**Hot links**: Redis plus a small in-process cache with a short TTL absorbs spikes; a CDN can cache redirects for links without analytics.",
          "**Availability**: redirects keep working from cache during a database outage (serving slightly stale data is acceptable); replicate across regions, and give each region its own id blocks so codes never collide.",
          "**Custom aliases**: a separate namespace with a unique constraint and reserved words; the second claimant gets `409 Conflict`. Never check-then-insert without the constraint.",
          "**Abuse**: rate-limit creation per user and IP (Session 16), scan destinations for malware, support takedowns.",
          "**Expiry**: store `expires_at`, check it on every read, and purge expired rows in batches."
        ] }
      ],
      followUps: [
        { q: "Why not use the long URL's hash as the primary key and skip code generation?",
          a: "A hash long enough to be collision-free is far longer than 7 characters, and truncating it reintroduces collisions you must detect. It also forces one code per URL, which conflicts with per-user expiry, per-user analytics and deletion. Hashing is useful for *deduplication* (look up whether this user already shortened this URL), not as the code itself." },
        { q: "The analytics team wants unique visitors per link per day.",
          a: "Exact counting would need a set of visitors per link per day. Use **HyperLogLog** — Redis `PFADD`/`PFCOUNT` — which estimates cardinality within about 1% using about 12 KB per counter, or compute uniques in the stream job with a sketch. Filter obvious bots first, or the numbers mean little." },
        { q: "The id-block coordinator becomes unavailable.",
          a: "Servers keep issuing codes from the blocks they already hold — lease the next block early (when the current one is, say, 80% used) so there is always a reserve. Run the coordinator on a replicated database. As a last resort, switch to random codes with unique-constraint retries until it recovers." }
      ],
      rubric: [
        "Quantifies the load and storage and derives the code length from the numbers.",
        "Defines a clear API and explains the 301 vs 302 trade-off in terms of the requirements.",
        "Picks a code-generation strategy that is unique, scalable and appropriately unguessable — and explains its weaknesses.",
        "Optimises the read path (cache, replication, availability) separately from the write path.",
        "Decouples analytics from redirects and covers hot keys, abuse, aliases and expiry."
      ],
      notes: [
        "The code in stage 4 runs in the course test suite: two servers lease disjoint id blocks, ids are scrambled by multiplying with a constant coprime to 62⁷ (so the mapping is a bijection and decodes back), and a million consecutive ids produce a million distinct codes.",
        "Interviewers usually let you pick the database. Justify it from the access pattern — single-key lookups at high read rates — rather than from brand preference. Both a key-value store and sharded MySQL are defensible.",
        "A strong candidate keeps time: about 5 minutes for requirements and estimates, 10 for API and data model, 10 for code generation, 10 for architecture and 10 for deep dives."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: Spring core, MVC & HTTP',
      lead: 'Framework questions at FAANG-level interviews are about mechanisms: how the container works, what HTTP guarantees, and where requests spend their time.',
      qa: [
        { level: 1, q: "Constructor injection or field injection — why do most teams require constructor injection?",
          a: "Constructor injection makes dependencies **explicit and mandatory**: the object cannot exist without them, fields can be `final` (immutable and safely published), and a missing bean fails at startup instead of with a `NullPointerException` later. It makes unit tests trivial — call the constructor with fakes, no Spring needed — and it exposes design problems: a constructor with eight parameters is a class doing too much, and circular dependencies fail immediately instead of being papered over. Field injection hides all of this and requires reflection or a container even in tests. With a single constructor, Spring injects it automatically, without `@Autowired`.",
          follow: ["When is setter injection still reasonable?"] },
        { level: 2, q: "A prototype-scoped bean is injected into a singleton. What happens, and how do you get a fresh instance each time?",
          a: "Injection happens once, when the singleton is created, so the singleton holds **one** prototype instance for its entire life — the prototype scope has no visible effect. To obtain a new instance per use, inject `ObjectProvider<T>` (or `Provider<T>`) and call `getObject()` each time; use a `@Lookup` method that Spring overrides; or, for web scopes, inject a **scoped proxy**, which delegates each call to the instance of the current request or session. Before reaching for prototypes, ask whether the state belongs in a method's local variables instead.",
          follow: ["How does a request-scoped bean work inside a singleton controller?"] },
        { level: 2, q: "How does Spring Boot auto-configuration work, and how do you find out why a bean was or was not created?",
          a: "Starters bring libraries onto the classpath. Spring Boot then loads the auto-configuration classes listed in `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` of every JAR; each is an ordinary `@Configuration` class guarded by conditions — `@ConditionalOnClass` (is the library present?), `@ConditionalOnProperty` (is it enabled?), `@ConditionalOnMissingBean` (has the application defined its own?). Auto-configuration is processed after your own configuration, so your beans take precedence. To debug, start with `--debug` (or `debug=true`) to print the **conditions report** with positive and negative matches and their reasons, or use the `conditions` actuator endpoint; `spring.autoconfigure.exclude` switches one off.",
          follow: ["Why must your own `@Configuration` classes not be scanned as auto-configurations?"] },
        { level: 2, q: "Filter, `HandlerInterceptor` or AOP — where would you put authentication, request logging and transaction handling?",
          a: "**Servlet filters** run around the whole request, before Spring MVC knows which controller will handle it — the right place for authentication and authorisation (Spring Security is a filter chain), CORS, request ids and access logging. **Interceptors** run inside `DispatcherServlet` once the handler is known, so they can use handler metadata — per-endpoint metrics, locale or tenant resolution, simple checks tied to annotations on the controller method. **AOP** works on any Spring bean method, not only web requests — transactions, caching, retries, auditing of service calls. So: authentication in a filter, request logging in a filter (or an interceptor when it needs the handler), transactions with AOP on the service layer.",
          follow: ["Why should transactions not start in the controller?"] },
        { level: 1, q: "Which HTTP methods are safe and which are idempotent? Why does it matter in practice?",
          a: "**Safe** methods must not change server state: GET, HEAD, OPTIONS (and TRACE). **Idempotent** methods have the same effect whether sent once or many times: all safe methods plus PUT and DELETE. POST is neither; PATCH is not idempotent in general (an *increment* patch, for example). It matters because networks retry: browsers, proxies, HTTP clients and service meshes may automatically retry idempotent requests after a timeout, and caches may store responses to safe requests. A GET that changes state (`GET /orders/42/cancel`) can be triggered by link prefetching or crawlers, and retrying a non-idempotent POST can charge a customer twice unless the endpoint supports idempotency keys.",
          follow: ["Is `DELETE` of an already-deleted resource idempotent if it returns 404 the second time?"] },
        { level: 2, q: "Choose the status code: a resource is created; work is accepted for later; validation fails; the user is not logged in; the user lacks permission; an update conflicts; a rate limit is hit.",
          a: "Created: **201** with a `Location` header (and usually the representation). Accepted for asynchronous processing: **202**, with a link to poll the status. Successful with nothing to return: **204**. Malformed request (bad JSON, wrong types): **400**; syntactically valid but semantically invalid (business validation): **400** or **422** — be consistent across the API. Not authenticated: **401** with a `WWW-Authenticate` header; authenticated but not allowed: **403** (or 404 to hide existence). Version conflict with optimistic locking or a duplicate: **409**; a failed `If-Match` precondition: **412**. Rate limited: **429** with `Retry-After`. Upstream failures: **502** (bad response), **503** (unavailable, often with `Retry-After`), **504** (timeout).",
          follow: ["Why is it a problem to return 200 with an error message in the body?"] },
        { level: 2, q: "What happens, end to end, when you type a URL into a browser and press Enter — until your controller method runs?",
          a: [
            "1. **DNS**: the browser, OS and resolver caches are checked, then recursive resolution finds the IP of the load balancer (often anycast or geo-routed).",
            "2. **TCP** three-way handshake, then **TLS 1.3** (one round trip): certificate validation and key agreement; HTTP/2 is negotiated through ALPN.",
            "3. The **HTTP request** reaches a load balancer or ingress, which may terminate TLS, route by host and path, and forward to a healthy instance.",
            "4. **Tomcat** accepts the connection and assigns a worker thread; the **filter chain** runs (security, CORS, logging).",
            "5. **`DispatcherServlet`** finds the handler, converters deserialize the body, validation runs, and the **controller** calls the service layer.",
            "6. The response travels back the same way; the connection stays open (keep-alive) for further requests, and static assets may come from a CDN instead."
          ],
          follow: ["Where would you add caching along this path?"] },
        { level: 3, q: "At peak, p99 latency jumps from 80 ms to 2 s while CPU sits at 30%. Tomcat has 200 threads. What is happening, and what do you do?",
          a: "Low CPU with high latency means threads are **waiting**, not working. The classic cause is a slow dependency or an exhausted database connection pool: each request holds a Tomcat thread while waiting, all 200 become busy, and new requests queue in the accept backlog — so latency explodes although the machine is idle. Confirm it with metrics: busy Tomcat threads at the maximum, HikariCP *pending* connections greater than zero, and rising downstream latency (traces show where time goes). Fix the cause rather than only adding threads: put **timeouts** on every outbound call, add bulkheads so one slow dependency cannot take all threads, cache hot reads, optimise slow queries, and size the connection pool to what the database can actually serve. Virtual threads remove the thread cap but will simply move the queue to the connection pool if the database is the bottleneck.",
          follow: ["How would you use Little's law to predict the breaking point?"],
          flags: ["*Increase the thread pool to 2,000* without finding the bottleneck"] },
        { level: 3, q: "HTTP/1.1, HTTP/2 and HTTP/3 — what changes for a backend team?",
          a: "**HTTP/1.1** sends one request at a time per connection (pipelining is effectively unused), so clients open several connections, and headers are repeated as plain text. **HTTP/2** multiplexes many concurrent streams over one TCP connection with binary framing and HPACK header compression — fewer connections, better use of each, and it is required by gRPC; but packet loss stalls every stream on that connection (TCP head-of-line blocking). **HTTP/3** runs over **QUIC** on UDP, with per-stream loss recovery, faster connection setup and connection migration across networks — valuable for mobile clients. For backend teams: terminate HTTP/2 or HTTP/3 at the edge; use HTTP/2 between services to cut connection counts; check that load balancers balance per *request* rather than per connection with HTTP/2 (long-lived connections can pin traffic to one instance); and expect most of the gain on high-latency client networks.",
          follow: ["Why can HTTP/2 make load balancing uneven?"] },
        { level: 2, q: "Why does calling one `@Bean` method from another inside a `@Configuration` class return the same instance — and when does it not?",
          a: "`@Configuration` classes are subclassed with CGLIB at startup (`proxyBeanMethods = true` by default). The proxy intercepts calls to `@Bean` methods and returns the existing singleton from the container instead of executing the method again, so `dataSource()` called from two places yields one `DataSource`. With `@Configuration(proxyBeanMethods = false)` — the *lite* mode used by Spring Boot's auto-configurations for faster startup — or with `@Bean` methods in a plain `@Component`, an inner call is an ordinary Java call and creates a **new** object each time. In lite mode, declare the dependency as a method parameter instead, so the container injects the singleton.",
          follow: ["Why can't a `@Configuration` class be `final`?"] }
      ],
      notes: [
        "In FAANG-style interviews framework questions are a vehicle: the latency question is about queueing and bottleneck analysis, the auto-configuration question is about conditional composition, and the HTTP questions are about retries and caching.",
        "For the URL question, an excellent answer adapts to the interviewer's interest — some want DNS and TLS depth, others the server internals. Give the full path in a minute, then offer to go deep on any step.",
        "Status codes are a small topic with a big signal: consistent, precise codes are what clients, monitoring and retries depend on."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "Which HTTP method is idempotent but **not** safe?",
      options: ['GET', 'PUT', 'POST', 'PATCH'], answer: 1,
      why: "PUT replaces the resource with the given state, so repeating it has the same effect (idempotent), but it does change state (not safe). GET is both; POST is neither; PATCH is not idempotent in general." },
    { level: 2, q: "A server answers a `POST` with `301 Moved Permanently`. What may browsers do when following it?",
      options: ['Re-send the request as a GET — use 307 or 308 when the method and body must be preserved', 'Always re-send the POST with the same body', 'Fail the request', 'Ignore the redirect'], answer: 0,
      why: "For historical reasons clients may change POST to GET when following 301 and 302. 307 (temporary) and 308 (permanent) require the method and body to be kept." },
    { level: 3, q: "A singleton bean receives a prototype-scoped bean through its constructor. How many prototype instances does the singleton use over its lifetime?",
      options: ['One — injection happens once; inject `ObjectProvider<T>` to get fresh instances', 'One per HTTP request', 'One per method call', 'One per thread'], answer: 0,
      why: "The prototype is resolved when the singleton is created. Prototype scope only means *a new instance per lookup* — and constructor injection looks it up once." },
    { level: 2, q: "Tomcat has its default 200 worker threads and requests take 250 ms on average, mostly waiting for the database. Roughly what throughput can it sustain before requests start to queue?",
      options: ['About 800 requests per second', 'About 200 requests per second', 'About 50 requests per second', 'About 8,000 requests per second'], answer: 0,
      why: "Little's law: concurrency = throughput × latency, so throughput = 200 ÷ 0.25 s = 800 requests per second. If latency doubles, capacity halves — even with idle CPUs." },
    { level: 3, q: "Spring Boot auto-configures a `DataSource` under `@ConditionalOnMissingBean`, and your application defines its own `DataSource` bean. What happens?",
      options: ['Your bean is used and the auto-configured one backs off', 'Both are created and Spring picks one at random', 'Startup fails with `NoUniqueBeanDefinitionException`', 'The auto-configured bean overrides yours'], answer: 0,
      why: "Auto-configurations are evaluated after user configuration, and `@ConditionalOnMissingBean` skips the auto-configured bean when one of that type already exists — the core *your bean wins* rule." }
  ]
});
