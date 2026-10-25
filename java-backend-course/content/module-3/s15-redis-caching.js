COURSE.session({
  no: 15,
  short: 'Redis: caching, cookies & HTTP caches',
  title: 'Redis — Cache vs Cookie, Server vs Browser Cache',
  covers: [3],
  objectives: [
    "Explain where caches live and contrast caches with cookies.",
    "Use HTTP caching headers (Cache-Control, ETag, 304) for browser/CDN caching.",
    "Use Redis data types from the CLI and from Spring (StringRedisTemplate).",
    "Apply cache-aside with Spring's `@Cacheable`/`@CacheEvict` on Redis, with TTLs and correct invalidation."
  ],
  prereq: "Session 13 (the balances query to optimise) and Session 9 (AOP proxies).",
  slides: [
    {
      type: 'theory',
      title: 'Why cache? Latency, load and where caches live',
      lead: 'A cache stores the result of expensive work close to where it is needed, trading **freshness** for **speed**.',
      table: { head: ['Operation', 'Typical latency'], rows: [
        ['Read from RAM', '~100 ns'],
        ['Redis GET on the same network', '~0.2–1 ms'],
        ['Indexed MySQL query', '~1–10 ms'],
        ['Aggregate query over many rows (our balances)', '10–200 ms'],
        ['Call to a service in another region', '100+ ms']
      ] },
      diagram: { kind: 'tiers', tiers: [
        { label: 'Client', nodes: [{ t: 'Browser cache', s: 'Cache-Control, ETag', tone: 'blue' }] },
        { label: 'Edge', nodes: [{ t: 'CDN / gateway cache', s: 'public, shared', tone: 'teal' }] },
        { label: 'App', nodes: [{ t: 'In-process cache', s: 'Caffeine, per instance', tone: 'green' }, { t: 'Distributed cache', s: 'Redis, shared by all instances', tone: 'red' }] },
        { label: 'Data', nodes: [{ t: 'MySQL buffer pool', s: 'database\'s own cache', tone: 'orange' }] }
      ] },
      points: [
        "**Hit ratio** decides the value of a cache; **TTL** and **invalidation** decide how stale it may get.",
        "Cache what is **read often, changes rarely, and is expensive** to compute."
      ],
      notes: [
        "The Splitwise balances endpoint runs a multi-join aggregate on every call, yet balances change only when someone adds an expense or settles. That read/write ratio (maybe 50:1) is the textbook case for caching.",
        "Phil Karlton's joke applies: *there are only two hard things in computer science: cache invalidation and naming things.* Most of today is about invalidation."
      ]
    },
    {
      type: 'theory',
      title: 'Cache vs cookie',
      lead: 'Both "remember things", but for different parties and purposes.',
      diagram: { kind: 'compare', cols: [
        { t: 'Cookie', icon: '🍪', tone: 'orange', points: [
          'small key-value data (~4 KB) **stored in the browser**, sent with every request to its domain',
          'set by the server via `Set-Cookie`',
          'identifies state: session id, preferences, CSRF token',
          'security flags: `HttpOnly`, `Secure`, `SameSite`, expiry'] },
        { t: 'Cache', icon: '⚡', tone: 'green', points: [
          'copy of data kept to **avoid recomputation or refetching**',
          'lives in browser, CDN, app memory or Redis',
          'can be large (MBs to GBs in Redis)',
          'correctness depends on TTL and invalidation'] }
      ] },
      table: { head: ['Question', 'Cookie', 'Server cache (Redis)'], rows: [
        ['Who stores it?', 'the user\'s browser', 'your infrastructure'],
        ['Who can read it?', 'the browser (unless `HttpOnly`) and your server', 'only your servers'],
        ['Per-user or shared?', 'per browser', 'usually shared (or keyed per user)'],
        ['Can the user tamper with it?', 'yes — never trust it unsigned', 'no'],
        ['Typical content', 'session id, JWT (sometimes), locale', 'query results, sessions, rate counters']
      ] },
      notes: [
        "A common confusion: 'storing the session in a cookie'. Usually the cookie stores only a session *id*; the session data lives on the server — often in Redis (Spring Session), so any instance can serve the user.",
        "Never put secrets or authorization data in a readable cookie. If you must store tokens in cookies, use `HttpOnly; Secure; SameSite=Lax/Strict` (Session 18 discusses this for OAuth)."
      ]
    },
    {
      type: 'theory',
      title: 'Browser cache vs server cache: HTTP caching',
      lead: 'The browser (and CDNs) obey HTTP headers. Revalidation with **ETag** saves bandwidth even when data must be checked.',
      diagram: { kind: 'seq', actors: ['Browser', 'API'], msgs: [
        [0, 1, 'GET /groups/7/expenses/41'],
        [1, 0, '200 + ETag: "v4" + Cache-Control: private, max-age=60', 'r'],
        [0, 0, 'within 60 s: served from browser cache'],
        [0, 1, 'after 60 s: GET + If-None-Match: "v4"'],
        [1, 0, '304 Not Modified (no body)', 'r'],
        [0, 1, 'after an edit: If-None-Match: "v4"'],
        [1, 0, '200 + new body + ETag: "v5"', 'r']
      ] },
      table: { head: ['Header', 'Meaning'], rows: [
        ['`Cache-Control: max-age=60`', 'fresh for 60 s, no request needed'],
        ['`private` / `public`', 'only the user\'s browser / also shared caches (CDN)'],
        ['`no-cache`', 'may store, but must revalidate before every use'],
        ['`no-store`', 'never store (sensitive data)'],
        ['`ETag` + `If-None-Match`', 'version tag → `304 Not Modified` if unchanged'],
        ['`Vary: Authorization`', 'cache separately per value of that header']
      ] },
      notes: [
        "Browser caching is free performance: zero server work for fresh hits. But it is outside your control once sent — you cannot evict a browser's cache, so keep `max-age` short for data that changes.",
        "Server caching (Redis) is under your control: you can evict instantly when data changes. The two complement each other.",
        "Personal financial data should be `private` (never cached by shared proxies) — or `no-store` for highly sensitive responses."
      ]
    },
    {
      type: 'practical',
      title: 'HTTP caching in Spring MVC',
      lead: 'Return `Cache-Control` and `ETag` from a controller; Spring answers `304` automatically when the client\'s tag matches.',
      code: [
        { lang: 'java', file: 'ExpenseController.java (excerpt)', src: code`
          @GetMapping("/{expenseId}")
          public ResponseEntity<ExpenseResponse> get(@PathVariable Long groupId, @PathVariable Long expenseId) {
              ExpenseResponse e = service.get(groupId, expenseId);
              return ResponseEntity.ok()
                      .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePrivate())
                      .eTag(String.valueOf(e.version()))     // entity @Version makes a perfect ETag
                      .body(e);                              // matching If-None-Match -> 304, empty body
          }` },
        { lang: 'bash', label: 'curl', src: code`
          $ curl -i localhost:8080/api/v1/groups/7/expenses/41
          HTTP/1.1 200
          ETag: "4"
          Cache-Control: max-age=60, private
          {"id":41,"description":"Dinner", ...}

          $ curl -i -H 'If-None-Match: "4"' localhost:8080/api/v1/groups/7/expenses/41
          HTTP/1.1 304` }
      ],
      notes: [
        "`ResponseEntity.eTag(...)` plus Spring's built-in conditional request handling compares `If-None-Match` and replaces the response with 304. `ShallowEtagHeaderFilter` can generate ETags from the response body hash for any endpoint, at the cost of still computing the body.",
        "Here `ExpenseResponse` is assumed to expose the entity version. Version-based ETags also enable `If-Match` for safe updates (Session 13)."
      ]
    },
    {
      type: 'theory',
      title: 'Redis: an in-memory data structure server',
      lead: 'Redis keeps data in RAM, executes commands in microseconds, and offers rich data types — not just strings.',
      table: { head: ['Type', 'Commands', 'Backend use'], rows: [
        ['String', '`SET k v EX 60`, `GET`, `INCR`', 'cache entries, counters, rate limits, idempotency keys'],
        ['Hash', '`HSET`, `HGETALL`', 'object-like records (user profile)'],
        ['List', '`LPUSH`, `LRANGE`, `BRPOP`', 'recent activity, simple queues'],
        ['Set', '`SADD`, `SISMEMBER`', 'unique visitors, tags, online users'],
        ['Sorted set', '`ZADD`, `ZREVRANGE`', 'leaderboards, time-ordered feeds'],
        ['Stream', '`XADD`, `XREADGROUP`', 'event logs with consumer groups']
      ] },
      points: [
        "Every key can have a **TTL**; when memory is full an **eviction policy** applies (`allkeys-lru`, `allkeys-lfu`, `volatile-ttl`, `noeviction`).",
        "Commands run one at a time (single-threaded execution) → each command is atomic.",
        "Optional persistence (RDB snapshots / AOF log) and replication; Redis Cluster shards keys across nodes using hash slots."
      ],
      callout: { kind: 'info', text: "Valkey (a Linux Foundation fork) and managed services such as AWS ElastiCache are wire-compatible with Redis — the code in this session works with all of them." },
      notes: [
        "Remember Session 4's LRU cache built on `LinkedHashMap`? Redis applies the same idea server-wide with `maxmemory-policy allkeys-lru` — but approximated by sampling for efficiency.",
        "Redis is a cache *and* a primary store for some data (rate limits, sessions, leaderboards). Decide per use case whether losing the data on a restart is acceptable."
      ]
    },
    {
      type: 'practical',
      title: 'Hands-on with redis-cli',
      lead: 'Start Redis next to MySQL and try the core commands.',
      code: [
        { lang: 'yaml', file: 'compose.yaml (add)', src: code`
          services:
            redis:
              image: redis:7-alpine
              command: ["redis-server", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]
              ports:
                - "6379:6379"` },
        { lang: 'bash', label: 'redis-cli', src: code`
          $ docker compose exec redis redis-cli
          127.0.0.1:6379> SET balances:7 '[{"user":"Asha","balance":800}]' EX 600
          OK
          127.0.0.1:6379> TTL balances:7
          (integer) 597
          127.0.0.1:6379> INCR rl:user:3:29312500        # rate-limit counter
          (integer) 1
          127.0.0.1:6379> HSET user:1 name Asha city Pune
          (integer) 2
          127.0.0.1:6379> HGETALL user:1
          1) "name"
          2) "Asha"
          3) "city"
          4) "Pune"
          127.0.0.1:6379> ZADD top-spenders 4200 asha 2200 ravi 800 meera
          (integer) 3
          127.0.0.1:6379> ZREVRANGE top-spenders 0 1 WITHSCORES
          1) "asha"
          2) "4200"
          3) "ravi"
          4) "2200"
          127.0.0.1:6379> SET idem:9f2c "done" NX EX 86400   # only if absent (idempotency key)
          OK
          127.0.0.1:6379> SCAN 0 MATCH balances:* COUNT 100  # never KEYS * in production` }
      ],
      notes: [
        "`KEYS *` blocks the single command thread while it walks every key — on a large production instance it can stall all clients. `SCAN` iterates incrementally.",
        "`SET ... NX EX` is atomic 'set if absent with expiry' — the building block for idempotency keys and simple distributed locks (used again in Session 22)."
      ]
    },
    {
      type: 'theory',
      title: 'Caching patterns & pitfalls',
      lead: '**Cache-aside** is the default for application caches: read the cache, fall back to the database, then populate the cache.',
      diagram: { kind: 'flow', nodes: [
        { t: 'GET balances', tone: 'blue' },
        { t: 'Redis hit?', s: 'yes → return (≈1 ms)', tone: 'green' },
        { t: 'Miss → query MySQL', s: '≈50 ms', tone: 'orange' },
        { t: 'Store with TTL', s: 'SET … EX 600', tone: 'red' },
        { t: 'Return', tone: 'gray' }
      ] },
      table: { head: ['Problem', 'What happens', 'Mitigation'], rows: [
        ['Stale data', 'cache still holds old balances after an expense', 'evict on every write + a TTL as safety net'],
        ['Stampede', 'a hot key expires; 1,000 requests hit MySQL at once', '`@Cacheable(sync = true)`, locks, early refresh'],
        ['Avalanche', 'many keys expire simultaneously', 'random TTL jitter'],
        ['Penetration', 'requests for ids that don\'t exist always miss', 'cache “not found” briefly, validate ids'],
        ['Big keys', 'one huge value slows Redis', 'cache smaller, focused objects']
      ] },
      points: [
        "Other patterns: **read-through** (cache loads itself), **write-through** (write cache + DB together), **write-behind** (write cache, flush to DB later — risky for money).",
        "For money, the database stays the source of truth; the cache is a disposable copy."
      ],
      notes: [
        "Evict, don't update: after a write, deleting the cache entry is simpler and safer than computing the new cached value (two concurrent writers could otherwise cache an outdated result).",
        "A TTL guarantees eventual freshness even if an eviction is missed (e.g. a write made directly in the database by a script)."
      ]
    },
    {
      type: 'practical',
      title: 'Spring Cache + Redis: @Cacheable & @CacheEvict',
      lead: 'Annotate methods; a proxy implements cache-aside for you, with Redis as the shared store.',
      code: [
        { lang: 'xml', file: 'pom.xml', src: code`
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>
          </dependency>
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-cache</artifactId>
          </dependency>` },
        { lang: 'yaml', file: 'application.yml', src: code`
          spring:
            data:
              redis:
                host: localhost
                port: 6379
            cache:
              type: redis` },
        { lang: 'java', file: 'CacheConfig.java', src: code`
          package com.example.splitwise.config;

          import java.time.Duration;
          import org.springframework.cache.annotation.EnableCaching;
          import org.springframework.context.annotation.Bean;
          import org.springframework.context.annotation.Configuration;
          import org.springframework.data.redis.cache.RedisCacheConfiguration;

          @Configuration
          @EnableCaching
          public class CacheConfig {

              @Bean     // picked up by Boot's RedisCacheManager as the default configuration
              RedisCacheConfiguration cacheConfiguration() {
                  return RedisCacheConfiguration.defaultCacheConfig()
                          .entryTtl(Duration.ofMinutes(10))         // safety net
                          .disableCachingNullValues()
                          .prefixCacheNameWith("splitwise::");
              }
          }` },
        { lang: 'java', file: 'BalanceService.java + writers', src: code`
          // Cached values use JDK serialization by default -> make them Serializable
          public record MemberBalance(Long userId, String displayName, BigDecimal balance) implements Serializable {}

          @Service
          public class BalanceService {
              @Cacheable(cacheNames = "balances", key = "#groupId", sync = true)   // sync: one loader per key
              @Transactional(readOnly = true)
              public List<MemberBalance> balances(long groupId) { /* the SQL from Session 13 */ }
          }

          @Service
          public class ExpenseService {
              @CacheEvict(cacheNames = "balances", key = "#groupId")             // after commit-worthy change
              @Transactional
              public ExpenseResponse addExpense(Long groupId, Long currentUserId, CreateExpenseRequest req) { ... }
          }

          @Service
          public class SettlementService {
              @CacheEvict(cacheNames = "balances", key = "#groupId")
              @Transactional
              public SettlementResponse settle(Long groupId, CreateSettlementRequest req) { ... }
          }` }
      ],
      callout: { kind: 'pitfall', text: "Caching is a proxy (Session 9): a `this.balances(id)` call from inside `BalanceService` bypasses the cache. Also keep the cache key consistent — `#groupId` must refer to the same id in `@Cacheable` and `@CacheEvict`." },
      notes: [
        "The key becomes `splitwise::balances::7` in Redis. Run `MONITOR` in redis-cli while calling the API: the first call shows a `GET` miss and a `SET`; the next calls show only `GET`s.",
        "Values are stored with JDK serialization by default (binary). For human-readable JSON configure `serializeValuesWith(...)` with a JSON serializer — with Jackson 3 you must include type information (or use a typed serializer per cache) so values deserialize back into your records.",
        "`sync = true` makes concurrent misses for the same key wait for one loader in this instance — a cheap stampede guard."
      ]
    },
    {
      type: 'practical',
      title: 'Beyond caching: rate limiting & idempotency with StringRedisTemplate',
      lead: 'Atomic Redis commands solve cross-instance problems that in-memory maps cannot.',
      code: { lang: 'java', file: 'RedisGuards.java', src: code`
        package com.example.splitwise.common;

        import java.time.Duration;
        import java.time.Instant;
        import org.springframework.data.redis.core.StringRedisTemplate;
        import org.springframework.stereotype.Component;

        @Component
        public class RedisGuards {
            private final StringRedisTemplate redis;

            public RedisGuards(StringRedisTemplate redis) { this.redis = redis; }

            /** Fixed-window rate limit: at most 'limit' calls per user per minute, across ALL app instances. */
            public boolean allow(long userId, int limit) {
                String key = "rl:" + userId + ":" + (Instant.now().getEpochSecond() / 60);
                Long count = redis.opsForValue().increment(key);            // atomic INCR
                if (count != null && count == 1) {
                    redis.expire(key, Duration.ofSeconds(70));              // first hit sets the window TTL
                }
                return count != null && count <= limit;
            }

            /** Returns true only for the first request carrying this idempotency key (24 h). */
            public boolean firstTime(String idempotencyKey) {
                return Boolean.TRUE.equals(redis.opsForValue()
                        .setIfAbsent("idem:" + idempotencyKey, "1", Duration.ofHours(24)));   // SET NX EX
            }
        }` },
      notes: [
        "Use it in the expense controller: `if (!guards.allow(userId, 30)) return 429 Too Many Requests;` and `if (!guards.firstTime(header)) return the original result / 409` for an `Idempotency-Key` header.",
        "Why Redis and not a `ConcurrentHashMap`? With three API instances behind a load balancer, each would keep its own counters — the limit would effectively triple. Redis is the shared, atomic source.",
        "Fixed windows allow bursts at window edges; sliding-window or token-bucket algorithms (often a small Lua script or Redis 7 functions) smooth that out. API gateways (Session 23) offer rate limiting too."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: make Splitwise fast with Redis',
      lead: 'Measure, cache, invalidate, verify — and add two Redis-powered safeguards.',
      steps: [
        "Add Redis to `compose.yaml` and the data-redis + cache starters to the project; configure `spring.data.redis.*` and `spring.cache.type=redis`.",
        "Measure the balances endpoint first: `curl -s -o /dev/null -w '%{time_total}\\n' localhost:8080/api/v1/groups/7/balances` (run 10×).",
        "Add `CacheConfig` and `@Cacheable(\"balances\")`; make `MemberBalance` `Serializable`; measure again and compare.",
        "Add `@CacheEvict` to add/edit/delete expense and settle-up; prove freshness: balances change immediately after a new expense.",
        "Watch it happen: `redis-cli MONITOR` and `TTL splitwise::balances::7`.",
        "Return `Cache-Control: private, max-age=30` and an ETag on `GET /expenses/{id}`; verify `304` with `If-None-Match`.",
        "Add `RedisGuards`: limit expense creation to 30/min per user (429) and honour an `Idempotency-Key` header on POST /settlements.",
        "Stretch: write an integration test with a Testcontainers Redis (`@ServiceConnection` on a `GenericContainer` with `redis:7-alpine`, `@ServiceConnection(name = \"redis\")`) proving eviction works."
      ],
      notes: [
        "Ask students to report numbers: typical results are 30–80 ms uncached versus 1–3 ms cached on a laptop. Then ask what the risk is if they forget one `@CacheEvict` (stale balances for up to 10 minutes — the TTL).",
        "If deserialization errors appear after changing a record, flush the cache (`FLUSHDB` in dev) — cached old shapes are a classic deployment gotcha; versioned cache names (`balances-v2`) avoid it in production."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: caching & Redis',
      quiz: [
        { q: "Where is a cookie stored?", options: ['In Redis', 'In the user\'s browser, sent with requests to its domain', 'In the database', 'In the CDN only'], answer: 1,
          why: "Cookies live in the browser and travel with every matching request; server caches live in your infrastructure." },
        { q: "A response has `Cache-Control: no-store`. The browser…", options: ['caches it for a day', 'must revalidate before use', 'must not store it at all', 'stores it in a cookie'], answer: 2,
          why: "`no-store` forbids storing; `no-cache` allows storing but requires revalidation." },
        { q: "The client sends `If-None-Match: \"4\"` and the resource version is still 4. Best response?", options: ['200 with full body', '304 Not Modified', '204 No Content', '412 Precondition Failed'], answer: 1,
          why: "The ETag matches, so the cached copy is still valid; 304 avoids resending the body." },
        { q: "After adding an expense, how should the cached balances be handled?", options: ['Leave them until the TTL expires', 'Evict the group\'s balances entry', 'Flush all of Redis', 'Store the expense in a cookie'], answer: 1,
          why: "Evict the specific key on write (`@CacheEvict(key = \"#groupId\")`); the TTL is only a safety net." },
        { q: "Why use Redis INCR for rate limiting instead of a HashMap in the app?", options: ['HashMap is slower', 'Counters must be shared and atomic across all app instances', 'Redis has no TTLs', 'HashMaps cannot store numbers'], answer: 1,
          why: "Each instance has its own memory; Redis gives one atomic counter for the whole fleet." }
      ],
      notes: [
        "Close with Q4 by asking: what if the eviction happens but the transaction later rolls back? (Harmless — the next read just recomputes. Evicting is always safe; *populating* with uncommitted data would not be.)"
      ]
    },
    {
      type: 'summary',
      title: 'Session 15 recap',
      points: [
        "Caches trade freshness for speed; they live in the browser, CDN, app memory and Redis.",
        "Cookies are small browser-side state sent with requests (use HttpOnly/Secure/SameSite); caches are copies of data to avoid work.",
        "HTTP caching: Cache-Control, ETag/If-None-Match → 304; `private` for personal data.",
        "Redis: in-memory data types with TTLs, atomic commands, eviction policies; use SCAN not KEYS.",
        "Spring Cache on Redis: `@Cacheable` (+ `sync`) / `@CacheEvict` on writes, TTL safety net, Serializable values; Redis also powers rate limits and idempotency keys."
      ],
      cards: [
        ['Cache-aside', 'Read cache → on miss load from DB → store in cache.'],
        ['TTL', 'Time-to-live after which a cache entry expires automatically.'],
        ['ETag', 'Version identifier of a response used for conditional requests.'],
        ['304 Not Modified', 'Cached copy is still valid — no body sent.'],
        ['HttpOnly cookie', 'Cookie that JavaScript cannot read — mitigates XSS token theft.'],
        ['Cache stampede', 'Many concurrent misses on one hot key overload the database.'],
        ['allkeys-lru', 'Redis eviction policy removing least-recently-used keys when memory is full.'],
        ['SET NX EX', 'Atomic set-if-absent with expiry — idempotency keys, simple locks.']
      ],
      notes: [
        "Next session: Spring Security — authentication vs authorization, the security filter chain, and storing users with BCrypt-hashed passwords in the database."
      ]
    }
  ]
});
