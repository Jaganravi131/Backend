/* Interview pack — Session 15: Redis caching, cookies & HTTP caches */
COURSE.prep(15, {
  deepDives: [
    {
      title: 'Deep dive: Redis internals — why it is fast, how it persists, how it scales',
      lead: 'Interviewers ask *why is Redis fast?* to see whether you understand its execution model — and its limits as a system of record.',
      table: { head: ['Data structure', 'Backend use', 'Key commands'], rows: [
        ['String', 'Cached values, counters, simple locks', '`GET`/`SET … EX`, `INCR`, `SET … NX PX`'],
        ['Hash', 'Objects with fields, sessions', '`HSET`, `HGETALL`, `HINCRBY`'],
        ['Sorted set', 'Leaderboards, sliding-window rate limits, delayed jobs', '`ZADD`, `ZRANGEBYSCORE`, `ZREMRANGEBYSCORE`'],
        ['Set', 'Unique members, tags', '`SADD`, `SISMEMBER`, `SINTER`'],
        ['HyperLogLog', 'Approximate unique counts in ~12 KB', '`PFADD`, `PFCOUNT`'],
        ['Stream', 'Lightweight event log with consumer groups', '`XADD`, `XREADGROUP`, `XACK`']
      ] },
      points: [
        "Commands run on **one thread** in an event loop (I/O threads can parallelise socket work since Redis 6): no locks, every command is atomic — but one slow command (`KEYS *`, a huge `SMEMBERS`, a long Lua script) blocks every client. Use `SCAN` and keep values small.",
        "Purpose-built encodings keep it fast and compact: dynamic strings, listpacks for small collections, and a skiplist plus hash table for large sorted sets (O(log n) ranks and ranges).",
        "**Persistence**: RDB snapshots (fork and copy-on-write; compact, fast restarts, may lose minutes) and the AOF (append every write; `appendfsync everysec` loses at most about a second). Many deployments use both.",
        "**Replication is asynchronous**: a failover (Sentinel or Cluster) can lose acknowledged writes. `WAIT` narrows the window but does not close it — do not keep money or other sources of truth only in Redis.",
        "**Redis Cluster** splits the keyspace into **16,384 hash slots** (CRC16 of the key modulo 16,384). Multi-key commands need all keys in one slot: use hash tags, `{cart:42}:items` and `{cart:42}:total`.",
        "**Eviction** (`maxmemory-policy`): `allkeys-lru`/`allkeys-lfu` (approximated by sampling a few keys), `volatile-*` among keys with a TTL, or `noeviction` (writes fail when memory is full). Expired keys are removed lazily on access and by a periodic sampling cycle."
      ],
      notes: [
        "Atomic single commands are why Redis works so well for counters and rate limiters: `INCR` and `EXPIRE` or a small Lua script cannot interleave with another client. Read-modify-write sequences from Java are not atomic unless you use `MULTI`/`EXEC` with `WATCH` or a script.",
        "Approximate LRU/LFU sampling means Redis does not keep a global ordered list of keys; it samples `maxmemory-samples` keys and evicts the best candidate. That is cheap and good enough — and it is why the exact LFU you implement in today's coding round is a different engineering trade-off.",
        "If a cache must survive restarts to avoid a thundering herd on the database, enable persistence (or warm the cache gradually after a restart) — an empty cache in front of a database sized for a 95% hit ratio can take the database down."
      ]
    },
    {
      title: 'Deep dive: caching failure modes — stampedes, penetration, avalanches & stale data',
      lead: 'Caches fail in a handful of well-known ways. Naming them and their fixes is a standard SDE-2 and Senior interview expectation.',
      table: { head: ['Failure mode', 'What happens', 'Mitigation'], rows: [
        ['Stampede (dogpile)', 'A hot key expires and thousands of requests hit the database at once', 'Single-flight loading per key, early probabilistic refresh, serve stale while revalidating'],
        ['Penetration', 'Requests for keys that do not exist bypass the cache every time', 'Cache negative results briefly; a Bloom filter of existing ids'],
        ['Avalanche', 'Many keys expire together (all written at deploy) or the cache restarts', 'Random TTL jitter, gradual warm-up, persistence, a circuit breaker before the database'],
        ['Hot key', 'One key receives a large share of all traffic', 'Local in-process cache with a short TTL, replicated copies (`key#1…#n`), splitting the value'],
        ['Stale data after a write', 'A slow reader writes an old value back after the writer deleted the cache entry', 'Delete after commit plus a short TTL, versioned values, or change-data-capture invalidation']
      ] },
      points: [
        "**Cache-aside writes**: update the database, *then delete* the cache entry. Updating the cache instead races with other writers and can leave a value that was never in the database.",
        "**Single-flight**: when many requests miss the same key, one loads it and the rest wait for that result — inside one instance with a map of futures (below), across instances with a short `SET key NX PX` lock.",
        "**Distributed locks** with Redis (`SET lock token NX PX 30000`, release with a compare-and-delete script) are fine for *efficiency* — avoiding duplicate work. For *correctness* a paused client can outlive its lock, so the protected resource must check a **fencing token**, or use a consensus system such as etcd or ZooKeeper.",
        "Measure everything: hit ratio, latency per layer, evictions, memory and key counts; alert on hit-ratio drops, which precede database overload."
      ],
      code: { lang: 'java', file: 'SingleFlight.java', src: code`
        import java.util.*;
        import java.util.concurrent.*;
        import java.util.concurrent.atomic.AtomicInteger;
        import java.util.function.Function;

        public class SingleFlight {
            private final Map<String, String> cache = new ConcurrentHashMap<>();
            private final Map<String, CompletableFuture<String>> inFlight = new ConcurrentHashMap<>();
            private final Function<String, String> loader;

            SingleFlight(Function<String, String> loader) { this.loader = loader; }

            String get(String key) {
                String v = cache.get(key);
                if (v != null) return v;                                  // hit
                CompletableFuture<String> mine = new CompletableFuture<>();
                CompletableFuture<String> f = inFlight.putIfAbsent(key, mine);
                if (f == null) {                                          // we load; everyone else waits for us
                    try {
                        String loaded = cache.get(key);                   // re-check: a load may have just finished
                        if (loaded == null) {
                            loaded = loader.apply(key);
                            cache.put(key, loaded);                       // publish before leaving in-flight
                        }
                        mine.complete(loaded);
                    } catch (RuntimeException e) {
                        mine.completeExceptionally(e);
                    } finally {
                        inFlight.remove(key, mine);
                    }
                    f = mine;
                }
                return f.join();
            }

            public static void main(String[] args) throws Exception {
                AtomicInteger dbLoads = new AtomicInteger();
                CountDownLatch start = new CountDownLatch(1);
                SingleFlight cache = new SingleFlight(key -> {
                    dbLoads.incrementAndGet();
                    try { Thread.sleep(100); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                    return "profile-of-" + key;
                });
                List<Future<String>> results = new ArrayList<>();
                try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
                    for (int i = 0; i < 100; i++) results.add(pool.submit(() -> { start.await(); return cache.get("user:42"); }));
                    start.countDown();                                    // release all 100 requests at once
                }
                Set<String> distinct = new HashSet<>();
                for (Future<String> r : results) distinct.add(r.get());
                System.out.println("100 concurrent misses -> db loads: " + dbLoads.get() + ", distinct results: " + distinct);
            }
        }`, out: code`
        100 concurrent misses -> db loads: 1, distinct results: [profile-of-user:42]` },
      notes: [
        "The re-check after winning `putIfAbsent` closes a subtle race: a request that missed the cache just before another request finished loading would otherwise trigger a second load. Publishing to the cache *before* removing the in-flight entry is what makes the re-check sufficient.",
        "Spring's `@Cacheable(sync = true)` gives the same per-key protection within one instance. Across a fleet of 50 instances you can still get 50 loads per expiry; for very hot keys add a distributed lock with a short TTL or refresh the key before it expires.",
        "Negative caching needs care: cache *not found* for seconds, not hours, and evict it when the entity is created — otherwise a newly registered user stays invisible."
      ]
    }
  ],

  stretch: [
    "Add single-flight protection to the group-balances cache and prove with a test that 1,000 concurrent misses for one group cause exactly one database query.",
    "Add TTL jitter and a short negative cache for unknown group ids; load-test with 10% of requests for non-existent ids and compare database queries per second before and after.",
    "Run a three-master Redis Cluster in Docker, store a cart and its total with a shared hash tag, and show that `MULTI`/`EXEC` over both works while the same keys without a tag fail with `CROSSSLOT`."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: LFU cache in O(1)',
      lead: 'The harder sibling of the LRU round (Session 5): evict the least *frequently* used key, breaking ties by recency — with every operation in constant time.',
      difficulty: 'Hard', minutes: 45, lc: 460, pattern: ['design', 'hashing', 'linked-list'],
      problem: [
        "Design a **least-frequently-used (LFU)** cache with a fixed `capacity`:",
        "- `int get(int key)` returns the value if present (else `-1`) and counts as a use of the key;",
        "- `void put(int key, int value)` inserts or updates the key — an update also counts as a use. When inserting into a full cache, first evict the key with the **lowest use count**; among keys with equal counts, evict the **least recently used**.",
        "Both operations must run in **O(1)** average time."
      ],
      examples: [
        { in: 'capacity = 2\nput(1,1) put(2,2) get(1) put(3,3) get(2) get(3)\nput(4,4) get(1) get(3) get(4)', out: 'get results: 1, -1, 3, -1, 3, 4',
          why: "put(3,3) evicts key 2 (count 1, while key 1 has count 2). put(4,4) must evict among keys 1 and 3, both count 2: key 1 was used less recently." }
      ],
      constraints: ["`1 ≤ capacity ≤ 10⁴`", "`0 ≤ key ≤ 10⁵`, `0 ≤ value ≤ 10⁹`", "At most `2 × 10⁵` calls to `get` and `put`"],
      hints: [
        "You need O(1) lookup by key, O(1) *increment* of a key's count, and O(1) access to the least-frequent, least-recent key. Which structure gives each?",
        "Keep `key → (value, count)` and `count → keys in recency order` — a `LinkedHashSet` per count — plus the current minimum count.",
        "When a key leaves the minimum-count bucket and the bucket becomes empty, the minimum increases by exactly one. A newly inserted key resets the minimum to 1."
      ],
      approaches: [
        { name: 'Scan on eviction', idea: 'Store counts and timestamps; scan all keys to find the victim', time: 'O(1) get, O(n) evicting put', space: 'O(n)' },
        { name: 'Heap of (count, time, key)', idea: 'Min-heap ordered by count then recency, with lazy invalidation of stale entries', time: 'O(log n)', space: 'O(n)' },
        { name: 'Count buckets + minFreq', idea: 'Map key → (value, count); map count → LinkedHashSet of keys; track the minimum count', time: 'O(1)', space: 'O(n)' }
      ],
      code: { lang: 'java', file: 'LFUCache.java', src: code`
        import java.util.*;

        public class LFUCache {
            private final int capacity;
            private final Map<Integer, int[]> entries = new HashMap<>();                  // key -> {value, count}
            private final Map<Integer, LinkedHashSet<Integer>> byCount = new HashMap<>();  // count -> keys, oldest first
            private int minCount = 0;

            public LFUCache(int capacity) { this.capacity = capacity; }

            public int get(int key) {
                int[] e = entries.get(key);
                if (e == null) return -1;
                touch(key, e);
                return e[0];
            }

            public void put(int key, int value) {
                if (capacity <= 0) return;
                int[] e = entries.get(key);
                if (e != null) { e[0] = value; touch(key, e); return; }
                if (entries.size() == capacity) {                       // least frequent, then least recent
                    LinkedHashSet<Integer> keys = byCount.get(minCount);
                    int victim = keys.iterator().next();
                    keys.remove(victim);
                    if (keys.isEmpty()) byCount.remove(minCount);
                    entries.remove(victim);
                }
                entries.put(key, new int[] {value, 1});
                byCount.computeIfAbsent(1, c -> new LinkedHashSet<>()).add(key);
                minCount = 1;                                           // a new key always has the minimum count
            }

            private void touch(int key, int[] e) {
                int c = e[1];
                LinkedHashSet<Integer> keys = byCount.get(c);
                keys.remove(key);
                if (keys.isEmpty()) {
                    byCount.remove(c);
                    if (minCount == c) minCount = c + 1;
                }
                e[1] = c + 1;
                byCount.computeIfAbsent(c + 1, x -> new LinkedHashSet<>()).add(key);   // most recent at the end
            }

            /** Slow reference model: scan for (lowest count, oldest use). */
            static final class Model {
                private final int cap;
                private final Map<Integer, long[]> m = new HashMap<>();                    // key -> {value, count, lastUse}
                private long tick = 0;
                Model(int cap) { this.cap = cap; }
                int get(int k) {
                    long[] e = m.get(k);
                    if (e == null) return -1;
                    e[1]++; e[2] = ++tick;
                    return (int) e[0];
                }
                void put(int k, int v) {
                    long[] e = m.get(k);
                    if (e != null) { e[0] = v; e[1]++; e[2] = ++tick; return; }
                    if (m.size() == cap) {
                        int victim = Collections.min(m.entrySet(), Comparator
                                .comparingLong((Map.Entry<Integer, long[]> x) -> x.getValue()[1])
                                .thenComparingLong(x -> x.getValue()[2])).getKey();
                        m.remove(victim);
                    }
                    m.put(k, new long[] {v, 1, ++tick});
                }
            }

            public static void main(String[] args) {
                LFUCache c = new LFUCache(2);
                List<Integer> got = new ArrayList<>();
                c.put(1, 1); c.put(2, 2); got.add(c.get(1)); c.put(3, 3); got.add(c.get(2)); got.add(c.get(3));
                c.put(4, 4); got.add(c.get(1)); got.add(c.get(3)); got.add(c.get(4));
                System.out.println("example: " + got);

                Random rnd = new Random(460);
                int ops = 0;
                for (int cap : new int[] {1, 2, 3, 10}) {
                    LFUCache mine = new LFUCache(cap);
                    Model model = new Model(cap);
                    for (int i = 0; i < 20_000; i++, ops++) {
                        int k = rnd.nextInt(cap * 3);
                        if (rnd.nextBoolean()) { int v = rnd.nextInt(1000); mine.put(k, v); model.put(k, v); }
                        else if (mine.get(k) != model.get(k)) throw new AssertionError("mismatch at op " + ops);
                    }
                }
                System.out.println("random tests: " + ops + " ops matched the brute-force model");
            }
        }`, out: code`
        example: [1, -1, 3, -1, 3, 4]
        random tests: 80000 ops matched the brute-force model` },
      pitfalls: [
        "Forgetting the recency tie-break among keys with the same count.",
        "Not raising `minCount` when the minimum bucket empties during `touch` — the next eviction then looks in an empty bucket.",
        "Treating an update of an existing key as *not* a use; in the standard definition it increments the count.",
        "Leaving empty buckets in the map (a slow memory leak) and ignoring capacity 0."
      ],
      followUps: [
        { q: "LFU never forgets: a key that was popular last month stays cached forever. How do you fix that?",
          a: "Age the counts. Periodically halve every count (TinyLFU's *reset*), or use counts over a sliding time window, or exponentially decayed counters. Caffeine's W-TinyLFU combines a small LRU *window* for new keys with a frequency sketch that decides whether a newcomer is popular enough to replace the eviction victim — good recency behaviour and good frequency behaviour at once." },
        { q: "Exact counts for millions of keys cost too much memory. What then?",
          a: "Use an approximate frequency sketch such as a **Count-Min Sketch**: a few counters per key hashed into small arrays, giving an over-estimate with bounded error in a few bytes per key, and keep exact metadata only for keys actually in the cache. TinyLFU does exactly this." },
        { q: "How does Redis implement LFU?",
          a: "With `maxmemory-policy allkeys-lfu` (or `volatile-lfu`), each key stores a small probabilistic logarithmic counter that grows more slowly as it gets larger and decays over time (`lfu-log-factor`, `lfu-decay-time`). Eviction samples a few keys and removes the one with the lowest counter, instead of maintaining an exact ordering — cheaper, and accurate enough for caching." }
      ],
      rubric: [
        "States the three O(1) requirements and arrives at the two maps plus `minCount`.",
        "Evicts correctly — lowest count, then least recent — and maintains `minCount` on every path.",
        "Handles updates of existing keys and capacity edge cases.",
        "Tests with the example and a randomized comparison against a simple model.",
        "Discusses aging, approximate counting and how production caches (Redis, Caffeine) differ."
      ],
      notes: [
        "`LinkedHashSet` keeps insertion order, so each count bucket is automatically ordered from least to most recently used: remove-and-re-add moves a key to the end, and `iterator().next()` is the eviction victim.",
        "The randomized test compares 80,000 operations with a model that scans for the victim — slow, but obviously correct. It is the fastest way to find bugs in the `minCount` bookkeeping.",
        "In a real system you would rarely hand-roll LFU: Caffeine's W-TinyLFU typically beats both LRU and LFU on hit ratio. The round tests whether you can design the structure — and whether you know why the libraries are better."
      ]
    },
    {
      type: 'design',
      title: 'Design round: distributed cache (Memcached / Redis Cluster)',
      lead: 'A favourite system-design prompt for backend roles: partitioning, replication, failure handling and the subtle problems of keeping a cache useful at scale.',
      kind: 'HLD', difficulty: 'Hard', minutes: 45,
      prompt: "Design a distributed in-memory cache for a large service: about 10 TB of cached data, millions of requests per second, single-digit-millisecond p99 latency. It must survive node failures and let the team add capacity without a cold cache.",
      stages: [
        { t: 'Requirements and estimates', ask: 'How many machines, and what limits each one?', table: { head: ['Quantity', 'Estimate'], rows: [
          ['Data', '10 TB; ~50 GB usable per node → ~200 shards, ×2 with one replica each'],
          ['Traffic', '~2 M ops/s → ~10 k ops/s per shard — a single Redis process handles on the order of 100 k simple ops/s'],
          ['Value size', '~1 KB average → ~2 GB/s aggregate network traffic'],
          ['Latency', 'p99 < 5 ms: one network hop, no disk on the request path']
        ] }, points: [
          "Non-functional priorities: availability and latency over strict consistency — a cache may lose data, but it must not serve wrong data for long.",
          "Operations: rolling upgrades and capacity changes without a mass cache miss."
        ] },
        { t: 'Partitioning with consistent hashing', ask: 'With hash(key) mod N, what happens when you add one node?', points: [
          "`hash(key) mod N` remaps about **N/(N+1)** of all keys when a node is added — a near-total cache miss and a database stampede.",
          "**Consistent hashing** places nodes on a ring and maps each key to the next node clockwise; adding a node moves only about **1/(N+1)** of the keys.",
          "**Virtual nodes** (hundreds of ring positions per physical node) even out the load and let bigger machines take proportionally more positions.",
          "Redis Cluster uses a fixed variant: 16,384 hash slots assigned to nodes, moved slot by slot when resharding."
        ], code: { lang: 'java', file: 'ConsistentHashing.java', src: code`
          import java.nio.charset.StandardCharsets;
          import java.security.MessageDigest;
          import java.security.NoSuchAlgorithmException;
          import java.util.*;

          public class ConsistentHashing {
              private final TreeMap<Long, String> ring = new TreeMap<>();     // position on the ring -> node
              private final int vnodes;

              ConsistentHashing(int vnodes) { this.vnodes = vnodes; }

              void addNode(String node) { for (int i = 0; i < vnodes; i++) ring.put(hash(node + "#" + i), node); }

              void removeNode(String node) { for (int i = 0; i < vnodes; i++) ring.remove(hash(node + "#" + i)); }

              /** The first virtual node clockwise from the key's position, wrapping around. */
              String nodeFor(String key) {
                  Map.Entry<Long, String> e = ring.ceilingEntry(hash(key));
                  return (e != null ? e : ring.firstEntry()).getValue();
              }

              static long hash(String s) {                                    // 64 bits of MD5: well spread, same on every JVM
                  try {
                      byte[] d = MessageDigest.getInstance("MD5").digest(s.getBytes(StandardCharsets.UTF_8));
                      long h = 0;
                      for (int i = 0; i < 8; i++) h = (h << 8) | (d[i] & 0xff);
                      return h;
                  } catch (NoSuchAlgorithmException e) {
                      throw new IllegalStateException(e);
                  }
              }

              public static void main(String[] args) {
                  int keys = 100_000;
                  ConsistentHashing ring = new ConsistentHashing(200);
                  for (String n : List.of("cache-a", "cache-b", "cache-c", "cache-d")) ring.addNode(n);
                  Map<String, String> before = new HashMap<>();
                  Map<String, Integer> load = new TreeMap<>();
                  for (int i = 0; i < keys; i++) {
                      String k = "user:" + i, n = ring.nodeFor(k);
                      before.put(k, n);
                      load.merge(n, 1, Integer::sum);
                  }
                  System.out.println("keys per node (4 nodes, 200 vnodes each): " + load);
                  ring.addNode("cache-e");
                  int moved = 0;
                  for (int i = 0; i < keys; i++) if (!ring.nodeFor("user:" + i).equals(before.get("user:" + i))) moved++;
                  System.out.printf("consistent hashing: %.1f%% of keys moved when a 5th node joined%n", 100.0 * moved / keys);
                  int movedMod = 0;
                  for (int i = 0; i < keys; i++) {
                      int h = ("user:" + i).hashCode();
                      if (Math.floorMod(h, 4) != Math.floorMod(h, 5)) movedMod++;
                  }
                  System.out.printf("hash mod N:         %.1f%% of keys moved going from 4 to 5 nodes%n", 100.0 * movedMod / keys);
              }
          }`, out: code`
          keys per node (4 nodes, 200 vnodes each): {cache-a=25118, cache-b=24609, cache-c=23660, cache-d=26613}
          consistent hashing: 19.3% of keys moved when a 5th node joined
          hash mod N:         80.1% of keys moved going from 4 to 5 nodes` } },
        { t: 'Architecture, replication and failures', ask: 'A shard\'s machine dies. What happens to reads and writes?', diagram: { kind: 'tiers', tiers: [
          { label: 'Application', nodes: [{ t: 'Service instances', s: 'smart client: ring + connection pools', tone: 'blue' }, { t: 'L1 cache', s: 'in-process, short TTL for hot keys', tone: 'gray' }] },
          { label: 'Cache tier', via: 'TCP, pipelined', nodes: [{ t: 'Shard 1', s: 'primary + replica', tone: 'green' }, { t: 'Shard 2', s: 'primary + replica', tone: 'green' }, { t: 'Shard … N', s: 'primary + replica', tone: 'green' }] },
          { label: 'Control plane', via: 'health + config', nodes: [{ t: 'Coordinator', s: 'membership, slot map, failover', tone: 'orange' }] },
          { label: 'Source of truth', via: 'on miss', nodes: [{ t: 'Database', s: 'protected by rate limits and circuit breakers', tone: 'purple' }] }
        ] }, points: [
          "Each shard has a primary and one or more replicas in different availability zones; replication is asynchronous (fine for a cache).",
          "A coordinator (or gossip, as in Redis Cluster) detects failures, promotes a replica and publishes the new map; clients refresh on redirect errors.",
          "During a failover, clients retry briefly against the new primary; reads may go to replicas if slightly stale data is acceptable."
        ] },
        { t: 'Client routing, hot keys and eviction', ask: 'One key gets 20% of all traffic. What breaks, and how do you fix it?', points: [
          "**Smart clients** hash keys locally and talk straight to the right shard (Redis Cluster clients follow `MOVED`/`ASK` redirects); a **proxy** layer (e.g. Envoy, Twemproxy) simplifies clients at the cost of an extra hop.",
          "**Hot keys** overload one shard: add a short-TTL in-process cache in the application, replicate the value under several keys (`key#1…#8`, chosen randomly on read), or split large values.",
          "Each shard evicts independently with approximated LRU/LFU; watch memory fragmentation and evictions per second.",
          "Pipeline requests and keep connections pooled — at millions of operations per second, connection set-up and round trips dominate."
        ] },
        { t: 'Consistency, warming and operations', ask: 'How do you keep the cache from serving stale data, and add capacity without a cold start?', points: [
          "Cache-aside with TTLs; writers update the database and then **delete** the key; for stricter freshness, invalidate from change-data-capture events in commit order.",
          "Versioned values (`v` stored with the data) let writers refuse to overwrite a newer value with an older one.",
          "Adding capacity: new nodes take over a small share of the ring; warm them by copying their key ranges (or slots) before switching traffic, so the database never sees a burst.",
          "Monitor hit ratio, p99 latency per shard, evictions, memory, replication lag and failovers; load-test failure scenarios regularly."
        ] }
      ],
      followUps: [
        { q: "Why not just use bigger machines instead of sharding?",
          a: "Vertical scaling hits limits in memory per machine, network bandwidth and single-threaded CPU (one Redis process uses one core for commands), and a single machine is a single point of failure whose loss empties the whole cache. Sharding spreads load and failure impact; a few large shards are still simpler than hundreds of tiny ones, so choose a size that balances operational overhead against blast radius." },
        { q: "How does the system handle a network partition between two halves of the cache cluster?",
          a: "For a cache, prefer availability: each side keeps serving what it has, possibly stale. Prevent split-brain failover by requiring a majority of coordinators (or masters, in Redis Cluster) to agree on promotions; the minority side stops accepting writes. When the partition heals, conflicting writes are resolved by discarding the old primary's data — acceptable because the database remains the source of truth." },
        { q: "The database team asks you to guarantee that the cache never serves data older than five seconds.",
          a: "TTL alone gives an upper bound only if every value is written with a TTL of at most five seconds — which may destroy the hit ratio. Better: event-driven invalidation from the database's change stream (CDC) with a short TTL as the safety net, plus monitoring of invalidation lag. Be explicit that this is a probabilistic guarantee unless reads go to the database." }
      ],
      rubric: [
        "Sizes the cluster from the numbers (memory, ops/s, bandwidth).",
        "Explains consistent hashing with virtual nodes and quantifies why mod-N fails.",
        "Covers replication, failure detection and failover, and the consistency they imply.",
        "Handles hot keys, stampedes and capacity changes without database overload.",
        "Defines the freshness strategy and the operational metrics."
      ],
      notes: [
        "The ring code is compiled and run by the course test suite: with 200 virtual nodes per server the load stays within a few per cent of 25% per node, adding a fifth node moves about 19% of keys (ideal: 20%), and `hash mod N` would move about 80%.",
        "Interviewers often accept Redis Cluster as the answer if you can explain what it does underneath — hash slots, gossip-based failure detection, replica promotion and client redirects.",
        "Keep coming back to the database: the whole point of the cache is to protect it, so every failure scenario should end with *and the database stays within its capacity*."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: caching, Redis, HTTP caches & cookies',
      lead: 'Caching questions test whether you can trade freshness for speed deliberately — and keep the trade safe under failure.',
      qa: [
        { level: 1, q: "Describe cache-aside reads and writes. Why delete the cache entry on a write instead of updating it?",
          a: "**Read**: look in the cache; on a miss, read the database, store the value with a TTL, return it. **Write**: update the database, then delete the cache entry so the next read reloads it. Updating the cache on writes looks attractive but races: two concurrent writers can update the database in one order and the cache in the other, leaving the cache permanently wrong; and you may cache a value from a transaction that later rolls back. Deleting after commit is idempotent and lets the next reader fetch the committed truth. A remaining race — a slow reader writing an old value back after the delete — is bounded by the TTL, or eliminated with versioned values or change-data-capture invalidation.",
          follow: ["What happens if the delete fails after the database commit?"] },
        { level: 2, q: "What is a cache stampede, and how do you prevent it?",
          a: "When a hot key expires (or the cache restarts), many concurrent requests miss at the same moment and all hit the database for the same value — potentially overloading it exactly when it is needed. Defences: **single-flight** loading, so one request per key reloads while the others wait for its result (a map of futures in-process, `@Cacheable(sync = true)`, or a short distributed lock across instances); **refreshing early** — before expiry, probabilistically or by a background job — so the key never actually expires under load; **serving stale data while revalidating**; and **TTL jitter**, so many keys do not expire together.",
          follow: ["Why is a per-instance lock not enough with 50 instances?"] },
        { level: 2, q: "Redis is single-threaded. Why is it so fast, and what can make it slow?",
          a: "It keeps all data in memory, uses compact purpose-built data structures, and processes commands on a single thread with an event loop — so there is no locking or context switching, and each command takes microseconds. Network round trips dominate, which pipelining and batching reduce; since Redis 6, I/O threads can parallelise socket reading and writing. It becomes slow when one command does a lot of work (`KEYS *`, `HGETALL` on a huge hash, `SMEMBERS` on a big set, a long Lua script) and blocks every other client, when large values are moved, when memory is swapped to disk, when an RDB fork copies many pages on a busy machine, or when the network saturates.",
          follow: ["How would you find the slow commands in production?"] },
        { level: 2, q: "RDB or AOF persistence — which would you choose for a cache and which for a session store?",
          a: "**RDB** writes point-in-time snapshots by forking: compact files and fast restarts, but anything since the last snapshot is lost. **AOF** logs every write; with `appendfsync everysec` at most about a second is lost, at the cost of larger files and periodic rewriting. For a pure **cache**, persistence is optional — RDB snapshots help avoid a cold start after a restart, which protects the database. For a **session store**, losing a minute of sessions logs users out, so use AOF (often together with RDB) plus a replica — and remember that asynchronous replication can still lose the last writes on failover.",
          follow: ["Why can an RDB fork cause latency spikes?"] },
        { level: 2, q: "What do `Cache-Control: no-cache`, `no-store`, `max-age` and `private` mean? How do ETags work?",
          a: "`max-age=60`: the response may be reused for 60 seconds without asking the server. `no-cache`: it may be stored but must be **revalidated** before every use (often confused with *do not cache*). `no-store`: do not store it anywhere — for sensitive data. `private`: only the user's browser may cache it, not shared caches or CDNs; `public` and `s-maxage` address shared caches. An **ETag** is a version identifier of the representation: the client sends it back in `If-None-Match`, and the server answers `304 Not Modified` with no body if it still matches — saving bandwidth while staying fresh. `Last-Modified`/`If-Modified-Since` is the time-based equivalent.",
          follow: ["Which headers would you send for a user's account page?"] },
        { level: 2, q: "What do the cookie attributes `HttpOnly`, `Secure` and `SameSite` protect against?",
          a: "`HttpOnly` hides the cookie from JavaScript, so an XSS bug cannot steal the session cookie with `document.cookie`. `Secure` sends the cookie only over HTTPS, preventing interception on the network. `SameSite` controls whether the cookie is sent on cross-site requests: `Strict` never, `Lax` only for top-level navigations with safe methods (the default in modern browsers), `None` always — which requires `Secure`. `SameSite` is a strong defence against CSRF, which is why CSRF tokens matter less (but are not irrelevant) for cookie-based APIs. Also scope cookies tightly with `Path` and `Domain`, and keep session lifetimes short.",
          follow: ["Why does a third-party payment redirect sometimes need `SameSite=None`?"] },
        { level: 2, q: "What are the pitfalls of Spring's `@Cacheable`?",
          a: "It is proxy-based, so calls from the same class (self-invocation) bypass the cache. The default key is built from all method parameters — make it explicit (`key = \"#groupId\"`) when parameters such as a `Pageable` or a user object should not be part of it. Decide how to treat `null` and `Optional` results (`unless = \"#result == null\"`). With Redis, the default value serializer is JDK serialization — fragile across class changes — so configure a JSON serializer (in Spring Data Redis 4, `GenericJacksonJsonRedisSerializer`). Set a TTL per cache, evict on writes with `@CacheEvict`, use `sync = true` against stampedes within one instance, and remember that cached objects must be immutable or copied, or callers will mutate the cached instance.",
          follow: ["How do you test that a method is really cached?"] },
        { level: 3, q: "How do you implement a distributed lock with Redis, and when is it unsafe?",
          a: "Acquire with `SET lock:<resource> <random-token> NX PX 30000` (set only if absent, with an expiry) and release with a Lua script that deletes the key **only if** it still holds your token, so you never delete someone else's lock. The problem is time: if the holder pauses longer than the expiry — a GC pause, a network delay, a slow downstream call — the lock expires, another client acquires it, and two clients act at once. Asynchronous replication adds another failure mode on failover. For *efficiency* locks (avoid doing the same work twice) this is acceptable. For *correctness* (no two writers ever), the protected resource must reject stale holders using a **fencing token** — a monotonically increasing number issued with each lock — or you should use a consensus-based system such as etcd or ZooKeeper. The Redlock algorithm is debated precisely because it relies on timing assumptions.",
          follow: ["Where does a fencing token get checked?"] },
        { level: 3, q: "Design caching for a product page with 50,000 requests per second, whose prices change a few times a day.",
          a: [
            "**Separate the parts**: static content (images, descriptions) from a CDN with long TTLs and versioned URLs; dynamic price and stock fetched separately.",
            "**Server-side cache**: Redis cache-aside for product data with a TTL as a safety net, plus **event-driven invalidation** when a price changes (the pricing service publishes an event; consumers delete the keys).",
            "**Hot products**: an in-process cache with a short TTL (a few seconds) in front of Redis absorbs the hottest keys; single-flight loading prevents stampedes on misses.",
            "**Correctness where it matters**: the page may show a price a few seconds old, but checkout must re-read the price from the source of truth and lock it into the order.",
            "**Observe**: hit ratio per layer, invalidation lag, and database load during deploys and price updates."
          ],
          follow: ["What if the marketing team needs a price change to appear everywhere within one second?"] },
        { level: 2, q: "How does Redis Cluster distribute keys, why do some multi-key commands fail, and how do hash tags help?",
          a: "Each key maps to one of 16,384 hash slots — CRC16 of the key modulo 16,384 — and each master owns a range of slots. A command touching several keys (`MGET`, `MULTI`/`EXEC`, Lua scripts, `SUNION`) only works if all keys live in the same slot; otherwise the cluster answers `CROSSSLOT`. A **hash tag** — the part of the key inside `{…}` — is the only part hashed, so `{cart:42}:items` and `{cart:42}:total` always share a slot and can be updated atomically together. Use tags for small, related groups of keys; do not put a huge share of the keyspace under one tag, or one slot (and one node) becomes hot.",
          follow: ["What happens during resharding to a client that sends a key to the old node?"] }
      ],
      notes: [
        "For every caching answer, say what happens when the cache is wrong, empty or down — interviewers look for that reflex.",
        "The distributed-lock question is a classic Senior probe; the key words are *token-based release*, *expiry versus pauses* and *fencing tokens*.",
        "HTTP caching and cookies are often overlooked by backend candidates; precise header semantics are an easy way to stand out."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does `Cache-Control: no-cache` mean?",
      options: ['The response may be stored, but must be revalidated with the origin before each use', 'The response must never be stored', 'The response may be cached for one hour', 'Only CDNs may cache the response'], answer: 0,
      why: "`no-cache` forces revalidation (often via ETags), not *no storage* — that is `no-store`. Confusing the two is common and can leak sensitive pages into shared caches." },
    { level: 2, q: "In Redis Cluster, `MULTI … EXEC` updating `cart:42:items` and `cart:42:total` fails with `CROSSSLOT`. What is the fix?",
      options: ['Give the related keys a common hash tag, e.g. `{cart:42}:items` and `{cart:42}:total`, so they share a slot', 'Increase `maxmemory`', 'Switch the eviction policy to `noeviction`', 'Run the commands without a transaction on every node'], answer: 0,
      why: "Only the part inside braces is hashed, so tagged keys land in the same slot and multi-key operations work. Use tags for small groups of related keys only." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                Map<String, Integer> lru = new LinkedHashMap<>(16, 0.75f, true) {
                    protected boolean removeEldestEntry(Map.Entry<String, Integer> e) { return size() > 3; }
                };
                lru.put("a", 1); lru.put("b", 2); lru.put("c", 3);
                lru.get("a");
                lru.put("d", 4);
                System.out.println(lru.keySet());
            }
        }`, out: '[c, a, d]' },
      options: ['`[a, b, c]`', '`[b, c, d]`', '`[c, a, d]`', '`[a, c, d]`'], answer: 2,
      why: "With access order, `get(\"a\")` moves `a` to the end (order b, c, a). Inserting `d` exceeds the limit, so the eldest entry — `b` — is removed." },
    { level: 3, q: "Thousands of keys were all cached during a deploy with a TTL of exactly one hour. One hour later, database CPU spikes. What is this, and what is the fix?",
      options: ['A cache avalanche — add random jitter to TTLs and warm caches gradually', 'Cache penetration — add a Bloom filter', 'A hot key — replicate it', 'Replication lag — read from the primary'], answer: 0,
      why: "Keys written together expire together, sending a wave of misses to the database. Jittered TTLs (e.g. ±10%) spread the expirations out." },
    { level: 3, q: "A cache uses consistent hashing with many virtual nodes across 4 servers. A 5th server is added. Roughly what fraction of keys move?",
      options: ['About 1/5', 'About 4/5', 'About 1/2', 'All of them'], answer: 0,
      why: "Only the keys that fall into the new node's ring segments move — about 1/(N+1). With `hash mod N`, about N/(N+1) ≈ 80% would move. The verified ring demo in this session measured 19.3%." }
  ]
});
