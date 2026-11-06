/* Interview pack — Session 16: Spring Security & database authentication */
COURSE.prep(16, {
  deepDives: [
    {
      title: 'Deep dive: the security filter chain & the authentication pipeline',
      lead: 'When a request is unexpectedly rejected — or unexpectedly allowed — the answer is always somewhere in this chain.',
      diagram: { kind: 'flow', dir: 'v', nodes: [
        { t: 'Servlet container', s: 'Tomcat receives the request', tone: 'gray' },
        { t: 'DelegatingFilterProxy → FilterChainProxy', s: 'picks the FIRST SecurityFilterChain whose matcher matches', tone: 'blue' },
        { t: 'CORS · CSRF · headers', s: 'browser-related protections', tone: 'yellow' },
        { t: 'Authentication filter', s: 'bearer token, form login, HTTP Basic, OAuth2 login…', tone: 'green' },
        { t: 'ExceptionTranslationFilter', s: 'AuthenticationException → 401, AccessDeniedException → 403', tone: 'orange' },
        { t: 'AuthorizationFilter', s: 'URL rules: requestMatchers(...).hasRole(...)', tone: 'red' },
        { t: 'DispatcherServlet → controller', s: '@PreAuthorize checked by an AOP proxy around the bean', tone: 'purple' }
      ] },
      points: [
        "`DelegatingFilterProxy` bridges the servlet container to the Spring bean `FilterChainProxy`, which runs the **first** `SecurityFilterChain` that matches — so declare specific chains (`/api/**`) before catch-all ones.",
        "Authentication: a filter extracts credentials → `AuthenticationManager` (`ProviderManager`) → an `AuthenticationProvider` such as `DaoAuthenticationProvider` (your `UserDetailsService` + `PasswordEncoder`) → on success, an `Authentication` is stored in the `SecurityContext`.",
        "`SecurityContextHolder` is **thread-bound** by default. Work handed to `@Async` methods, executors or `CompletableFuture`s sees an anonymous user unless the context is propagated (`DelegatingSecurityContextExecutor`, a `TaskDecorator`).",
        "`permitAll()` still runs the whole chain (with anonymous authentication and security headers); `web.ignoring()` skips security entirely — Spring Security recommends `permitAll` instead.",
        "Method security (`@PreAuthorize`) is AOP: self-invocation bypasses it, exactly like `@Transactional`.",
        "Debug with `logging.level.org.springframework.security=TRACE` — it logs which chain matched, every filter invoked and why access was denied."
      ],
      code: { lang: 'java', file: 'SecurityConfig.java', src: code`
        @Configuration
        @EnableMethodSecurity
        class SecurityConfig {

            @Bean
            @Order(1)                                                    // specific chain first
            SecurityFilterChain api(HttpSecurity http) throws Exception {
                http.securityMatcher("/api/**")
                    .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/auth/register").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                    .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .csrf(csrf -> csrf.disable())                        // bearer tokens only, no cookies
                    .oauth2ResourceServer(rs -> rs.jwt(Customizer.withDefaults()));
                return http.build();
            }

            @Bean
            @Order(2)                                                    // everything else: browser pages
            SecurityFilterChain web(HttpSecurity http) throws Exception {
                http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .formLogin(Customizer.withDefaults());                // session cookie + CSRF protection on
                return http.build();
            }
        }` },
      notes: [
        "Two chains are a common production setup: a stateless chain for the API (bearer tokens, no CSRF, no session) and a stateful chain for browser pages (session cookie, CSRF on). Getting the order wrong makes the catch-all chain swallow API requests.",
        "A 401 means *who are you?* (missing or invalid credentials — the entry point decides the response, e.g. `WWW-Authenticate: Bearer`); a 403 means *I know who you are, and the answer is no*. The `ExceptionTranslationFilter` makes that distinction.",
        "The TRACE log is the fastest way to answer *why is this endpoint returning 403?* — it names the authorization rule that denied the request."
      ]
    },
    {
      title: 'Deep dive: password storage & the attacks every backend must stop',
      lead: 'Security interviews are concrete: how passwords are stored, how secrets are compared, and which request patterns you block.',
      points: [
        "Store passwords with a **slow, salted, adaptive** hash: **Argon2id** (memory-hard, resists GPUs), **bcrypt** with a tuned cost factor, or **PBKDF2-HMAC-SHA256** with a high iteration count. A plain SHA-256 can be guessed billions of times per second on GPUs.",
        "`DelegatingPasswordEncoder` stores the algorithm as a prefix (`{bcrypt}$2a$10$…`), so you can migrate: verify with the old algorithm and re-hash with the new one on the next login (`upgradeEncoding`).",
        "**Timing attacks**: `String.equals` stops at the first differing character, leaking how much of a secret matched. Compare secrets, API keys and HMAC signatures with `MessageDigest.isEqual`.",
        "**CSRF** applies when the browser attaches credentials automatically (session cookies): keep protection on for cookie-based apps. APIs authenticated only by an `Authorization` header are not exposed, because browsers never add that header on their own.",
        "**Broken access control** — insecure direct object references such as `GET /expenses/42` without an ownership check — tops the OWASP Top 10. Authorise the *object*, not just the URL.",
        "**Credential stuffing and brute force**: rate-limit logins per account and per IP (today's coding round), add MFA, reject known-breached passwords, and return the same error for *unknown user* and *wrong password* so attackers cannot enumerate accounts."
      ],
      code: { lang: 'java', file: 'PasswordHashing.java', src: code`
        import java.security.MessageDigest;
        import java.security.SecureRandom;
        import java.util.Base64;
        import javax.crypto.SecretKeyFactory;
        import javax.crypto.spec.PBEKeySpec;

        public class PasswordHashing {
            static final int ITERATIONS = 600_000;                       // current OWASP guidance for PBKDF2-HMAC-SHA256

            static String hash(char[] password) throws Exception {
                byte[] salt = new byte[16];
                new SecureRandom().nextBytes(salt);                      // a unique random salt per password
                byte[] derived = derive(password, salt, ITERATIONS);
                Base64.Encoder b64 = Base64.getEncoder();
                return "pbkdf2$" + ITERATIONS + "$" + b64.encodeToString(salt) + "$" + b64.encodeToString(derived);
            }

            static boolean verify(char[] password, String stored) throws Exception {
                String[] p = stored.split("\\$");
                byte[] salt = Base64.getDecoder().decode(p[2]);
                byte[] expected = Base64.getDecoder().decode(p[3]);
                byte[] actual = derive(password, salt, Integer.parseInt(p[1]));
                return MessageDigest.isEqual(expected, actual);          // constant time: no timing leak
            }

            static byte[] derive(char[] password, byte[] salt, int iterations) throws Exception {
                PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, 256);
                try {
                    return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
                } finally {
                    spec.clearPassword();
                }
            }

            public static void main(String[] args) throws Exception {
                String a = hash("correct horse".toCharArray()), b = hash("correct horse".toCharArray());
                System.out.println("format: " + a.substring(0, a.indexOf('$', 7) + 1) + "<salt>$<hash>");
                System.out.println("same password, different salts -> different hashes: " + !a.equals(b));
                System.out.println("verify correct password: " + verify("correct horse".toCharArray(), a));
                System.out.println("verify wrong password:   " + verify("correct horse!".toCharArray(), a));
            }
        }`, out: code`
        format: pbkdf2$600000$<salt>$<hash>
        same password, different salts -> different hashes: true
        verify correct password: true
        verify wrong password:   false` },
      notes: [
        "In Spring you would simply use `PasswordEncoderFactories.createDelegatingPasswordEncoder()` (bcrypt by default) or `Argon2PasswordEncoder`; the pure-JDK program shows what such encoders do: a random salt per password, a deliberately slow derivation, the parameters stored next to the hash, and a constant-time comparison.",
        "Tune the cost so one hash takes on the order of tens to a few hundred milliseconds on your servers — slow for attackers making billions of guesses, acceptable for one login. Re-evaluate as hardware gets faster; the stored parameters make upgrades possible.",
        "Never log passwords, tokens or the `Authorization` header, and never put secrets in URLs (they end up in access logs and browser history)."
      ]
    }
  ],

  stretch: [
    "Add login throttling with today's token bucket keyed by username and by IP; return `429` with a `Retry-After` header and test that throttling one account does not affect another.",
    "Migrate stored password hashes from bcrypt to Argon2id transparently with `DelegatingPasswordEncoder` and `upgradeEncoding`, re-hashing on the next successful login, and prove it with a test.",
    "Write an IDOR test suite: for every `GET`/`PUT`/`DELETE` endpoint under `/groups/{id}`, assert that a user from another group receives `404` and the data is untouched."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: thread-safe token-bucket rate limiter',
      lead: 'A concurrency-flavoured design round that every API company asks in some form: limit each client\'s request rate without timers, locks across clients or flaky tests.',
      difficulty: 'Medium', minutes: 40, pattern: ['concurrency', 'design'],
      problem: [
        "Implement a rate limiter that allows each client (user id or API key) bursts of up to `capacity` requests and refills at `tokensPerSecond`. `tryAcquire(clientId)` consumes a token and returns `true` if one is available, otherwise returns `false`.",
        "Requirements: thread-safe; no background threads or timers; requests from different clients must not contend on one lock; the clock must be injectable so tests never sleep."
      ],
      examples: [
        { in: 'capacity = 5, refill = 2/s\n7 requests at t = 0 s, 3 more at t = 1 s', out: 'YYYYYnn, then YYn', why: "The burst uses the 5 tokens; one second later exactly 2 new tokens have been earned." },
        { in: 'after a 60-second pause, 7 requests', out: 'YYYYYnn', why: "Tokens accumulate up to the capacity, never beyond it." }
      ],
      constraints: ["Up to 10⁶ distinct clients", "`1 ≤ capacity ≤ 10⁴`, `1 ≤ tokensPerSecond ≤ 10⁴`", "Millions of `tryAcquire` calls per second across many threads"],
      hints: [
        "You do not need a timer: compute how many tokens the client earned since its last refill when a request arrives.",
        "Per client, store the number of tokens and the time of the last refill. Refill lazily, cap at the capacity, then try to take one token.",
        "Thread safety: lock per client (or CAS on an immutable state object) so clients never block each other. Do the arithmetic in integer nanoseconds to avoid floating-point drift."
      ],
      approaches: [
        { name: 'Fixed window counter', idea: 'Count requests per client per calendar window', time: 'O(1)', space: 'O(1) per client — but allows 2× bursts at window edges' },
        { name: 'Sliding window log', idea: 'Keep timestamps of recent requests; count those inside the window', time: 'O(log n) per request', space: 'O(limit) per client' },
        { name: 'Sliding window counter', idea: 'Weighted mix of the previous and current window counts', time: 'O(1)', space: 'O(1) per client, approximate' },
        { name: 'Token bucket (lazy refill)', idea: 'Tokens earned since the last request, capped at capacity; one token per request', time: 'O(1)', space: 'O(1) per active client' }
      ],
      code: { lang: 'java', file: 'TokenBucketLimiter.java', src: code`
        import java.util.concurrent.*;
        import java.util.concurrent.atomic.*;
        import java.util.function.LongSupplier;

        public class TokenBucketLimiter {
            private static final class Bucket {
                long tokens;
                long last;                                          // nanos up to which tokens have been credited
                Bucket(long tokens, long now) { this.tokens = tokens; this.last = now; }
            }

            private final long capacity, nanosPerToken;
            private final LongSupplier clock;                       // System::nanoTime in production, fake in tests
            private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

            TokenBucketLimiter(long capacity, long tokensPerSecond, LongSupplier clock) {
                this.capacity = capacity;
                this.nanosPerToken = 1_000_000_000L / tokensPerSecond;
                this.clock = clock;
            }

            boolean tryAcquire(String client) {
                long now = clock.getAsLong();
                Bucket b = buckets.computeIfAbsent(client, k -> new Bucket(capacity, now));
                synchronized (b) {                                  // contention only within one client
                    long earned = (now - b.last) / nanosPerToken;   // whole tokens since the last credit
                    if (earned > 0) {
                        b.tokens = Math.min(capacity, b.tokens + earned);
                        b.last = b.tokens == capacity ? now : b.last + earned * nanosPerToken;   // keep the remainder
                    }
                    if (b.tokens > 0) { b.tokens--; return true; }
                    return false;
                }
            }

            public static void main(String[] args) {
                AtomicLong fake = new AtomicLong();                                      // test clock in nanoseconds
                TokenBucketLimiter limiter = new TokenBucketLimiter(5, 2, fake::get);   // burst 5, 2 tokens per second
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < 7; i++) sb.append(limiter.tryAcquire("asha") ? 'Y' : 'n');
                System.out.println("burst of 7 at t=0s:     " + sb);
                fake.addAndGet(1_000_000_000L);
                sb.setLength(0);
                for (int i = 0; i < 3; i++) sb.append(limiter.tryAcquire("asha") ? 'Y' : 'n');
                System.out.println("3 more at t=1s:         " + sb);
                System.out.println("another client at t=1s: " + (limiter.tryAcquire("bala") ? 'Y' : 'n'));
                fake.addAndGet(60_000_000_000L);                                         // a long pause
                sb.setLength(0);
                for (int i = 0; i < 7; i++) sb.append(limiter.tryAcquire("asha") ? 'Y' : 'n');
                System.out.println("burst of 7 after 60s:   " + sb);

                TokenBucketLimiter shared = new TokenBucketLimiter(100, 1, () -> 0L);   // frozen clock: exactly 100 tokens
                AtomicInteger allowed = new AtomicInteger();
                try (ExecutorService pool = Executors.newFixedThreadPool(8)) {
                    for (int t = 0; t < 8; t++) {
                        pool.submit(() -> { for (int i = 0; i < 1_000; i++) if (shared.tryAcquire("hot")) allowed.incrementAndGet(); });
                    }
                }
                System.out.println("8 threads x 1000 requests, capacity 100 -> allowed: " + allowed.get());
            }
        }`, out: code`
        burst of 7 at t=0s:     YYYYYnn
        3 more at t=1s:         YYn
        another client at t=1s: Y
        burst of 7 after 60s:   YYYYYnn
        8 threads x 1000 requests, capacity 100 -> allowed: 100` },
      pitfalls: [
        "Floating-point refill arithmetic: `2.0 / 1e9 × 1e9` may come out as 1.9999…, silently denying a request. Integer nanoseconds per token avoid the drift.",
        "A timer thread per client (or one global refiller touching every bucket) does not scale to a million clients.",
        "One global lock for all clients turns the limiter into a bottleneck.",
        "Never evicting buckets — the map grows forever. A bucket idle long enough to be full is identical to a new one and can be dropped. Use a monotonic clock (`System.nanoTime()`), not wall-clock time that can jump."
      ],
      followUps: [
        { q: "Enforce the same limits across 20 service instances.",
          a: "Keep each client's bucket in Redis and update it with a small Lua script — read tokens and timestamp, refill, take a token, write back, set a TTL — which is atomic and costs one round trip. If that latency is too much, give each instance a share of the limit locally (capacity ÷ N), or lease batches of tokens from Redis and spend them locally, accepting some inaccuracy. Today's design round covers the trade-offs." },
        { q: "Return a `Retry-After` value when a request is rejected.",
          a: "When the bucket is empty, the next token arrives after `nanosPerToken − (now − last)` nanoseconds. Round that up to whole seconds for `Retry-After` and return `429 Too Many Requests`; optionally add `RateLimit` headers with the limit and remaining tokens so well-behaved clients can pace themselves." },
        { q: "How do you remove buckets of clients that went away?",
          a: "A bucket untouched for `capacity × nanosPerToken` is full again, so deleting it changes nothing. Sweep occasionally with `buckets.entrySet().removeIf(...)`, or store buckets in a Caffeine cache with `expireAfterAccess`. That bounds memory by the number of *active* clients." }
      ],
      rubric: [
        "Uses lazy refill with a capacity cap — no timers.",
        "Thread-safe with per-client locking or CAS; no global bottleneck.",
        "Injects the clock and tests burst, refill, independence between clients and concurrency.",
        "Discusses memory cleanup, monotonic time and the distributed variant."
      ],
      notes: [
        "The concurrency test freezes the clock so exactly 100 tokens exist; eight threads making 8,000 attempts must get exactly 100 approvals. Remove the `synchronized` block and the count drifts above 100 on most runs.",
        "Keeping the fractional remainder (`b.last + earned × nanosPerToken` instead of `now`) matters: otherwise a client sending a request every 0.9 token-intervals would never earn a token.",
        "In Spring you would wire this into a `HandlerInterceptor` or a filter keyed by the authenticated principal or API key, or use a library such as Bucket4j — but interviewers want to see the algorithm."
      ]
    },
    {
      type: 'design',
      title: 'Design round: distributed rate limiter for an API platform',
      lead: 'A high-level design that is asked constantly at API-heavy companies: accuracy versus latency, shared state, and what to do when the shared state fails.',
      kind: 'HLD', difficulty: 'Hard', minutes: 45,
      prompt: "Design rate limiting for a public API platform: limits per API key, per user and per IP (for example 100 requests per minute per key with bursts of 20), enforced across 200 gateway instances, adding less than 1 ms at p99, with rules configurable per endpoint.",
      stages: [
        { t: 'Requirements', ask: 'What exactly is limited, how precisely, and what happens on failure?', points: [
          "Rule dimensions: API key, user, IP, endpoint, tenant plan; different limits per plan.",
          "Accuracy: is ±5% acceptable? (Usually yes — precision costs latency.)",
          "Responses: `429` with `Retry-After` and `RateLimit` headers; never block the request path for long.",
          "Failure policy: if the limiter's store is down, fail **open** (availability) or **closed** (protection)? Often per rule."
        ] },
        { t: 'Algorithms compared', ask: 'Which algorithm, and why?', table: { head: ['Algorithm', 'Burst behaviour', 'Memory per key', 'Accuracy'], rows: [
          ['Fixed window counter', 'Up to 2× the limit at window edges', 'One counter', 'Low at edges'],
          ['Sliding window log', 'Exact', 'One timestamp per request', 'Exact, expensive'],
          ['Sliding window counter', 'Smooth', 'Two counters', 'Good approximation'],
          ['Token bucket', 'Bursts up to capacity, then steady rate', 'Tokens + timestamp', 'Exact for its model'],
          ['Leaky bucket (queue)', 'Smooths output, adds waiting', 'A queue', 'Shapes rather than rejects']
        ] }, points: [
          "Token bucket matches the requirement (*100/min with bursts of 20*) and needs two numbers per key; the sliding window counter is a good alternative when you want *no more than N per window*."
        ] },
        { t: 'Where to enforce', ask: 'Gateway, service or client?', diagram: { kind: 'tiers', tiers: [
          { label: 'Edge', nodes: [{ t: 'CDN / WAF', s: 'coarse per-IP limits, bot blocking', tone: 'gray' }] },
          { label: 'Gateway fleet (200)', via: 'every request', nodes: [{ t: 'Limiter client', s: 'rules cache, local deny cache, Lua call', tone: 'blue' }] },
          { label: 'Shared state', via: '1 round trip', nodes: [{ t: 'Redis Cluster', s: 'one bucket per key, sharded by hash slot', tone: 'red' }] },
          { label: 'Control plane', via: 'push / poll', nodes: [{ t: 'Rules service', s: 'versioned rules, shadow mode', tone: 'green' }, { t: 'Metrics', s: '429 rate per rule and key', tone: 'orange' }] }
        ] }, points: [
          "Layered enforcement: coarse IP limits at the edge, per-key limits at the gateway (before any service does work), and business quotas (per-tenant monthly usage) inside services.",
          "Rules are fetched from a rules service and cached in each gateway; new rules start in **shadow mode** (log would-be rejections) before enforcing."
        ] },
        { t: 'Shared state: Redis + Lua', ask: 'How do 200 gateways update one client\'s bucket atomically?', points: [
          "One key per (rule, client) in Redis Cluster; the script refills, consumes and writes back atomically in one round trip, and sets a TTL so idle keys disappear.",
          "Use Redis's own clock (`redis.call('TIME')`) or tolerate small skew between gateway clocks.",
          "Cache *denied until t* decisions locally for a few hundred milliseconds so abusive clients do not hammer Redis."
        ], code: { lang: 'lua', file: 'token_bucket.lua', src: code`
          -- KEYS[1] = bucket key; ARGV[1] = now in ms, ARGV[2] = capacity, ARGV[3] = tokens per ms
          local now, capacity, rate = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
          local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
          local tokens = tonumber(state[1]) or capacity
          local ts = tonumber(state[2]) or now
          tokens = math.min(capacity, tokens + math.max(0, now - ts) * rate)   -- lazy refill
          local allowed = 0
          if tokens >= 1 then
            tokens = tokens - 1
            allowed = 1
          end
          redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
          redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / rate) * 2)        -- idle buckets expire
          return allowed` } },
        { t: 'Latency, scale and failure modes', ask: 'Redis is slow or down, one tenant sends 50% of traffic, and you run in three regions. What now?', points: [
          "**Latency**: one pipelined Redis call per request is typically sub-millisecond in the same zone; to remove it, gateways can **lease** tokens in batches (e.g. 10% of the capacity) and spend them locally, accepting small overshoot.",
          "**Hot tenant**: split its bucket into several sub-buckets (`key#0…#7`, each with ⅛ of the rate) chosen randomly, spreading load across shards.",
          "**Redis unavailable**: fall back to local per-instance limits (capacity ÷ number of gateways) — approximate but protective — and fail closed only for expensive endpoints such as SMS or payments. Alert either way.",
          "**Multi-region**: enforce per-region limits (global limit ÷ regions, rebalanced by traffic share) rather than synchronous cross-region coordination."
        ] }
      ],
      followUps: [
        { q: "How do you avoid a Redis round trip on every request?",
          a: "Token leasing: each gateway takes a batch of tokens from the shared bucket (one Redis call per batch) and serves requests locally until the batch is spent or expires. Smaller batches mean better accuracy; larger ones mean fewer calls. Alternatively, run purely local limiters with periodic gossip of counts — eventually consistent and good enough for abuse protection." },
        { q: "A customer says they were limited at 80 requests per minute although their limit is 100. How do you investigate?",
          a: "Check which rule fired (the rejection should log rule id and key), whether several limits apply (per key *and* per IP behind a shared NAT), whether retries are being counted, and whether a fallback to local per-instance limits was active — with uneven load balancing a client can hit one instance's share early. Fixed-window edges and clock skew between gateways are other suspects. Precise `RateLimit` response headers make such tickets easy to answer." },
        { q: "Fail open or fail closed when the limiter cannot reach its store?",
          a: "It depends on what the limit protects. For general abuse protection on cheap endpoints, fail open (or to local limits) — availability matters more than precise limits for a few minutes. For costly or risky operations — sending SMS, creating payments, expensive AI calls — fail closed or to very conservative local limits. Make the choice explicit per rule and alert when the fallback activates." }
      ],
      rubric: [
        "Clarifies rule dimensions, accuracy, latency budget and failure policy first.",
        "Compares algorithms and justifies the choice (bursts, memory, accuracy).",
        "Designs atomic shared state (Redis + Lua) with sensible keys and TTLs.",
        "Addresses latency, hot tenants, store outages and multiple regions.",
        "Covers operations: response headers, shadow mode for rules, metrics and alerting."
      ],
      notes: [
        "The Lua script mirrors the Java token bucket from the coding round, using milliseconds and a per-millisecond rate; Redis runs scripts atomically, so concurrent gateways cannot interleave halfway through an update.",
        "Interviewers often push on *what happens when Redis is down?* — have a clear, per-rule answer rather than a single global one.",
        "If time allows, mention that rate limiting also protects your own services from each other (internal quotas) — not just the public API from abuse."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: Spring Security & web security',
      lead: 'Security questions check whether you can reason about trust boundaries, not just configure annotations.',
      qa: [
        { level: 1, q: "What is the difference between authentication and authorization, and between 401 and 403?",
          a: "**Authentication** establishes *who* the caller is (password, token, certificate); **authorization** decides *what* that caller may do (roles, permissions, ownership of the object). A **401 Unauthorized** means authentication is missing or failed — the client should authenticate (the response carries a `WWW-Authenticate` challenge); a **403 Forbidden** means the caller is authenticated but not allowed — retrying with the same credentials will not help. Some APIs return **404** instead of 403 for objects the caller may not even know exist, to avoid revealing them.",
          follow: ["When would you deliberately return 404 instead of 403?"] },
        { level: 2, q: "Walk through what happens when a request carrying a JWT reaches a Spring Boot resource server.",
          a: [
            "1. `FilterChainProxy` selects the matching `SecurityFilterChain`.",
            "2. `BearerTokenAuthenticationFilter` extracts the token from the `Authorization: Bearer …` header.",
            "3. The `JwtAuthenticationProvider` asks a `JwtDecoder` to verify the signature (keys fetched from the issuer's JWKS endpoint and cached) and to validate `exp`, `nbf`, `iss` and, if configured, `aud`.",
            "4. A `JwtAuthenticationConverter` maps claims (scopes, roles) to authorities; the resulting `Authentication` is stored in the `SecurityContext`.",
            "5. `AuthorizationFilter` applies URL rules; method rules (`@PreAuthorize`) run later through AOP.",
            "6. Failures: an invalid token → 401 with a `WWW-Authenticate: Bearer error=\"invalid_token\"` header; a valid token without permission → 403."
          ],
          follow: ["What happens when the issuer rotates its signing keys?"] },
        { level: 2, q: "How should passwords be stored, why not SHA-256, and how do you migrate to a better algorithm?",
          a: "Use a slow, salted, adaptive password-hashing function — Argon2id, bcrypt or PBKDF2 with a high iteration count — with a unique random salt per password stored alongside the hash. Fast hashes such as SHA-256 are designed for speed: GPUs compute billions per second, so leaked hashes of common passwords fall quickly; salts only stop precomputed tables. Migrate with `DelegatingPasswordEncoder`: hashes carry an `{id}` prefix, existing ones keep verifying with their old algorithm, and on the next successful login the password (available in plaintext only at that moment) is re-hashed with the new one (`upgradeEncoding`). For users who never log in, you can wrap the old hash in the new algorithm.",
          follow: ["Why should the cost factor be stored with each hash?"] },
        { level: 2, q: "When do you need CSRF protection, and why can a stateless JWT API disable it?",
          a: "CSRF exploits the browser automatically attaching **ambient credentials** — cookies — to requests that a malicious site triggers (a hidden form posting to your bank). Any cookie-based authentication (sessions, a JWT stored in a cookie) needs protection: CSRF tokens (Spring Security's default), `SameSite` cookies, and checking `Origin`. An API that authenticates **only** with an `Authorization: Bearer` header is not vulnerable, because browsers never add that header automatically and a cross-site page cannot read your token — so CSRF protection can be disabled for that chain. Moving the token into a cookie brings the risk back.",
          follow: ["Does `SameSite=Lax` make CSRF tokens unnecessary?"] },
        { level: 2, q: "What is CORS, what is a preflight request, and why can't you combine `Access-Control-Allow-Origin: *` with credentials?",
          a: "CORS is a **browser** mechanism that relaxes the same-origin policy: a page from `app.example.com` may read responses from `api.example.com` only if the API says so with `Access-Control-Allow-*` headers. For requests that are not *simple* (custom headers such as `Authorization`, JSON bodies, methods like PUT/DELETE), the browser first sends an `OPTIONS` **preflight** asking whether the real request is allowed. Because credentials (cookies, HTTP auth) let a site act as the user, the specification forbids the wildcard origin with `Access-Control-Allow-Credentials: true` — the server must echo a specific, allow-listed origin. Remember that CORS protects users' browsers, not your server: non-browser clients ignore it, so it is never a substitute for authentication.",
          follow: ["Why does a misconfigured CORS policy that reflects any origin with credentials amount to a security hole?"] },
        { level: 2, q: "How do you guarantee that a user can only access their own expenses (no IDOR)?",
          a: "Check authorization on the **object**, every time. Options: scope queries by the caller — `findByIdAndGroupMembersUserId(expenseId, currentUserId)` — so another user's id simply returns nothing (respond 404); or use method security with a domain permission check, `@PreAuthorize(\"@groupPermissions.canView(#groupId, authentication)\")`, backed by an efficient membership query. Never trust ids from the client to be *theirs*, avoid exposing sequential ids where enumeration matters, and cover it with tests: for each endpoint, a user from another group must get 404 and must not be able to modify anything.",
          follow: ["Why might a query-scoping approach be safer than an annotation?"] },
        { level: 2, q: "Server-side sessions or tokens — what are the trade-offs for a web app and for a mobile app?",
          a: "**Sessions** (an opaque id in an `HttpOnly` cookie, state on the server): instant revocation and simple logout, small cookies, but they need shared storage across instances (Spring Session with Redis) and CSRF protection. **Self-contained tokens** (JWTs): no server-side lookup and easy to verify in many services, but hard to revoke before expiry, larger, and dangerous if stored where scripts can read them. Typical choices: for a browser SPA, a **backend-for-frontend** that keeps tokens server-side and gives the browser a session cookie; for mobile apps, short-lived access tokens plus refresh tokens stored in the platform's secure storage; for service-to-service calls, tokens issued with the client-credentials grant.",
          follow: ["How would you implement *log out from all devices* with JWTs?"] },
        { level: 3, q: "How would you defend a login endpoint against credential stuffing at scale?",
          a: [
            "**Rate limits** per IP, per account and per device fingerprint, with exponential backoff on failures — throttling rather than hard lockouts, which attackers can abuse to lock real users out.",
            "**Friction on suspicion**: CAPTCHA or proof-of-work after repeated failures or from risky networks.",
            "**Credentials**: reject known-breached passwords at registration and login (for example via a k-anonymity range API), and encourage or require MFA, ideally phishing-resistant (passkeys).",
            "**No enumeration**: the same response and similar timing for unknown users and wrong passwords.",
            "**Detection**: monitor failure rates, impossible travel and new devices; alert on spikes; notify users of new sign-ins.",
            "**Architecture**: put these controls at the edge (WAF, gateway) so attacks do not reach the application's password hashing, which is deliberately expensive."
          ],
          follow: ["Why can aggressive account lockout become a denial-of-service vector?"] },
        { level: 3, q: "The `SecurityContext` is empty inside an `@Async` method or a `CompletableFuture`. Why, and how do you fix it properly?",
          a: "`SecurityContextHolder` uses a `ThreadLocal` by default, and the async work runs on a different thread from a pool, which has no context (or, worse, a stale one from a previous task if someone set it without clearing). Proper fixes propagate the context explicitly: wrap executors with `DelegatingSecurityContextExecutor`/`DelegatingSecurityContextAsyncTaskExecutor`, configure a `TaskDecorator` on Spring's `ThreadPoolTaskExecutor` that copies the context (and MDC) into each task and clears it afterwards, or pass the needed identity as a method parameter. The `MODE_INHERITABLETHREADLOCAL` strategy is not a fix for pools: threads are created once and reused, so they inherit whichever context existed when they were created.",
          follow: ["How do virtual threads change this picture?"] },
        { level: 2, q: "Why must secrets be compared in constant time? Show what the vulnerable code looks like.",
          a: "`providedSignature.equals(expectedSignature)` — or a hand-written loop that returns at the first mismatching character — finishes faster the earlier the strings differ. By measuring response times over many requests, an attacker can recover a secret (an HMAC signature, an API key, a reset token) byte by byte. Use `MessageDigest.isEqual(a, b)`, which compares all bytes regardless of where they differ, and compare fixed-length values (for example hashes of the secrets). The same applies to webhook signature verification and to checking password-reset tokens.",
          follow: ["Why does hashing both values before comparing also help?"] }
      ],
      notes: [
        "Security answers should name the threat first (*who is the attacker and what can they do?*) and then the control. Interviewers look for that structure more than for configuration details.",
        "Expect follow-ups that move between layers — a CSRF question becomes a cookie question, an IDOR question becomes a data-model question.",
        "When unsure, say what you would check (OWASP guidance, Spring Security reference, a threat model) rather than guessing — security is a domain where confident wrong answers are costly."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "A `SecurityFilterChain` marks `/api/public/**` as `permitAll()`. Which statement is true?",
      options: ['The security filter chain still runs (headers, CSRF rules, anonymous authentication); `web.ignoring()` would skip it entirely', '`permitAll()` removes the path from Spring Security completely', '`permitAll()` disables HTTPS for the path', 'Authenticated users are rejected on that path'], answer: 0,
      why: "`permitAll` is an authorization decision made inside the chain, so protections such as security headers still apply. Spring Security recommends `permitAll` over `web.ignoring()` for that reason." },
    { level: 2, q: "An authenticated user calls an endpoint that requires the `ADMIN` role, which they lack. What does Spring Security return by default?",
      options: ['403 Forbidden', '401 Unauthorized', '404 Not Found', '500 Internal Server Error'], answer: 0,
      why: "The user is known but not allowed: `AccessDeniedException` is translated into 403. A missing or invalid credential would produce 401 through the authentication entry point." },
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            public static void main(String[] args) {
                long capacity = 3, nanosPerToken = 500_000_000L, tokens = capacity, last = 0;
                StringBuilder sb = new StringBuilder();
                long[] times = {0, 0, 0, 0, 400_000_000L, 1_000_000_000L, 1_000_000_000L};
                for (long now : times) {
                    long earned = (now - last) / nanosPerToken;
                    if (earned > 0) { tokens = Math.min(capacity, tokens + earned); last += earned * nanosPerToken; }
                    if (tokens > 0) { tokens--; sb.append('Y'); } else sb.append('n');
                }
                System.out.println(sb);
            }
        }`, out: 'YYYnnYY' },
      options: ['`YYYnnYY`', '`YYYnYYY`', '`YYYnnYn`', '`YYYYnYY`'], answer: 0,
      why: "Three tokens cover the burst at t = 0; at 0.4 s no whole token has been earned yet (one takes 0.5 s); at 1.0 s two tokens have been earned, covering both requests." },
    { level: 3, q: "An API authenticates only with `Authorization: Bearer` headers and sets no cookies. Which statement about CSRF is correct?",
      options: ['Browsers never attach that header automatically, so classic CSRF does not apply and CSRF protection can be disabled for this API', 'CSRF is impossible for any API that uses HTTPS', 'Bearer tokens make CSRF easier, so tokens must be sent twice', 'CSRF protection must stay on because JWTs are signed'], answer: 0,
      why: "CSRF abuses credentials the browser sends on its own — cookies. Move the token into a cookie and the API becomes vulnerable again." },
    { level: 3, q: "Which password storage approach is acceptable today?",
      options: ['Argon2id, or bcrypt with a tuned cost, with a unique salt per password (or PBKDF2-HMAC-SHA256 with a very high iteration count)', 'SHA-256 with one global salt for all users', 'Passwords encrypted with AES so support staff can recover them', 'MD5 with a per-user salt'], answer: 0,
      why: "Password hashes must be slow and salted per password. Fast hashes are brute-forced on GPUs, and reversible encryption means one stolen key exposes every password." }
  ]
});
