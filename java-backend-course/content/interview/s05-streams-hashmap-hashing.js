/* Interview pack — Session 5: Streams, HashMap internals & hashing */
COURSE.prep(5, {
  deepDives: [
    {
      title: 'Deep dive: resize splits, treeification & hash flooding',
      lead: 'What really happens to existing entries when a `HashMap` grows — and why equal hash codes are a security problem, not just a performance one.',
      points: [
        "Resize doubles the table when `size > capacity × 0.75`. Each node's new index needs **one more bit** of its cached hash: `(hash & oldCap) == 0` → stays at `i` (*lo* list), otherwise moves to `i + oldCap` (*hi* list). Java 8 splits every chain in one pass, keeps the relative order and never calls `hashCode()` again.",
        "Treeify rule, precisely: an insert into a bucket that **already holds 8 nodes** converts it to a red-black tree — but only if the table has **≥ 64 buckets**; a smaller table is resized instead. A tree shrinks back to a list at **6** nodes.",
        "Tree bins order nodes by hash, then by `compareTo` when the keys are `Comparable` (e.g. `String`). Non-comparable keys with identical hashes still work, but lookups may have to search both subtrees.",
        "**Resize cannot separate keys with equal hash codes** — they share every bit, so they stay together at every capacity. Attackers exploit this (*hash flooding*): `\"Aa\"` and `\"BB\"` both hash to 2112, and any concatenation of those blocks collides too.",
        "Memory reality: each entry is a `Node` (~32 bytes with compressed oops) plus a table slot, plus boxed keys and values (16 bytes per small `Integer`). A `HashMap<Integer, Integer>` uses roughly 10× the memory of two `int[]` arrays — matters at 10⁷ entries."
      ],
      code: { lang: 'java', file: 'ResizeSplit.java', src: code`
        import java.util.List;

        public class ResizeSplit {
            static int spread(Object k) { int h = k.hashCode(); return h ^ (h >>> 16); }

            public static void main(String[] args) {
                System.out.println("key       spread  @16  @32  on resize 16 -> 32");
                for (Object k : List.<Object>of(1, 17, 33, 49, "goa", "Aa", "BB", "AaBB", "BBAa")) {
                    int h = spread(k);
                    System.out.printf("%-8s %7d %4d %4d  %s%n", k, h, h & 15, h & 31,
                            (h & 16) == 0 ? "stays (lo)" : "moves +16 (hi)");
                }
            }
        }`, out: code`
        key       spread  @16  @32  on resize 16 -> 32
        1              1    1    1  stays (lo)
        17            17    1   17  moves +16 (hi)
        33            33    1    1  stays (lo)
        49            49    1   17  moves +16 (hi)
        goa       102520    8   24  moves +16 (hi)
        Aa          2112    0    0  stays (lo)
        BB          2112    0    0  stays (lo)
        AaBB     2031775   15   31  moves +16 (hi)
        BBAa     2031775   15   31  moves +16 (hi)` },
      table: { head: ['Constant in `java.util.HashMap`', 'Value', 'Why this number'], rows: [
        ['`DEFAULT_INITIAL_CAPACITY`', '16', 'Power of two: index = `(n − 1) & hash`, a mask instead of a division'],
        ['`DEFAULT_LOAD_FACTOR`', '0.75', 'Balances memory against chain length; the first resize happens on the 13th insert'],
        ['`TREEIFY_THRESHOLD` / `UNTREEIFY_THRESHOLD`', '8 / 6', 'Gap of 2 prevents flapping between list and tree'],
        ['`MIN_TREEIFY_CAPACITY`', '64', 'Below this a long chain means the table is too small, so resize instead'],
        ['`MAXIMUM_CAPACITY`', '2³⁰', 'Largest power of two that fits in a positive `int`']
      ] },
      callout: { kind: 'interview', text: "Interviewers love *why* questions about these numbers. The JDK source explains the thresholds: with random hashes and load factor 0.75, bin sizes follow a Poisson distribution with λ ≈ 0.5, so an 8-node bin is about a one-in-ten-million event. Trees exist for bad `hashCode()`s and attacks, not for normal operation." },
      notes: [
        "Run the program and read the columns: `1, 17, 33, 49` all live in bucket 1 of a 16-bucket table. After the resize, the ones whose hash has bit 16 set (17 and 49) move to bucket 17, the others stay. That one-bit test is the entire Java 8 resize algorithm — no rehashing, no `hashCode()` calls.",
        "`Aa`, `BB`, `AaBB` and `BBAa` show the opposite: equal hash codes are inseparable. A request with 50,000 parameters whose names collide turns every insert into a walk of a long list — O(n²) CPU for parsing one request. Java 8's treeification limits the damage to O(n log n) for `Comparable` keys like `String`; servers also cap parameter counts and body sizes.",
        "Java 7 inserted at the head of a chain, and two threads resizing concurrently could reverse links into a cycle, making `get()` spin forever at 100% CPU. Java 8 appends at the tail and keeps order, which removed that particular failure, but `HashMap` is still not thread-safe: concurrent puts lose entries.",
        "Memory numbers are estimates for a 64-bit JVM with compressed oops (the default below 32 GB heaps). If you need tens of millions of primitive entries, primitive-specialised maps (fastutil, Eclipse Collections) or sorted primitive arrays are the standard answer."
      ]
    },
    {
      title: 'Deep dive: ConcurrentHashMap internals & parallel streams',
      lead: 'How a map can be safe for many writers without one big lock — and where the shared ForkJoinPool behind parallel streams bites.',
      points: [
        "No segments since Java 8: an **empty bin** is filled with a lock-free **CAS**; a non-empty bin is updated under `synchronized` on its **first node**, so writers only contend when they hit the same bin.",
        "`get()` takes no lock: node values and `next` pointers are `volatile`, so a reader sees fully published writes (a happens-before edge through volatile).",
        "Resizing is **cooperative**: threads that touch the map during a resize help move bins; moved bins are marked with a `ForwardingNode` so readers follow it to the new table.",
        "`size()` sums a base counter plus striped counter cells (the `LongAdder` idea) — a moment-in-time estimate under concurrent writes; prefer `mappingCount()` for very large maps.",
        "`computeIfAbsent`, `compute` and `merge` are atomic per key because the function runs **while holding the bin lock** — keep it short and never modify the same map inside it.",
        "Parallel streams split the source with a `Spliterator` and run on the **common ForkJoinPool** (cores − 1 threads), shared by the whole JVM. Blocking I/O inside them starves every other parallel stream and default-async `CompletableFuture`."
      ],
      table: { head: ['', '`HashMap`', '`Collections.synchronizedMap`', '`ConcurrentHashMap`'], rows: [
        ['Thread-safe', 'No — lost updates and entries', 'Yes — one lock for every call', 'Yes — CAS plus per-bin locks'],
        ['Reads', '—', 'Block each other and writers', 'Lock-free'],
        ['Null keys / values', 'One null key, null values', 'As the wrapped map', 'Neither allowed'],
        ['Iterators', 'Fail-fast (`ConcurrentModificationException`)', 'Fail-fast; you must lock while iterating', 'Weakly consistent; never throw CME'],
        ['Check-then-act', '—', 'Needs an external lock', 'Atomic `putIfAbsent`, `compute*`, `merge`']
      ] },
      code: { lang: 'java', file: 'ConcurrentCounters.java', src: code`
        import java.util.Map;
        import java.util.TreeMap;
        import java.util.concurrent.ConcurrentHashMap;
        import java.util.concurrent.ExecutorService;
        import java.util.concurrent.Executors;
        import java.util.concurrent.atomic.LongAdder;

        public class ConcurrentCounters {
            public static void main(String[] args) {
                Map<String, Integer> merged = new ConcurrentHashMap<>();
                Map<String, LongAdder> adders = new ConcurrentHashMap<>();
                try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
                    for (int t = 0; t < 4; t++) {
                        pool.submit(() -> {
                            for (int i = 0; i < 100_000; i++) {
                                String key = i % 2 == 0 ? "even" : "odd";
                                merged.merge(key, 1, Integer::sum);                          // atomic read-modify-write
                                adders.computeIfAbsent(key, k -> new LongAdder()).increment(); // low contention
                            }
                        });
                    }
                }   // ExecutorService.close() waits for the tasks (Java 19+)
                System.out.println("merge:     " + new TreeMap<>(merged));
                System.out.println("LongAdder: even=" + adders.get("even").sum() + ", odd=" + adders.get("odd").sum());
            }
        }`, out: code`
        merge:     {even=200000, odd=200000}
        LongAdder: even=200000, odd=200000` },
      notes: [
        "The program is deterministic because both counters use atomic operations. Replace `ConcurrentHashMap` with `HashMap` and `merge` with `put(key, get(key) + 1)` and the totals come out lower on almost every run — the classic lost-update race. It is not shown on the slide because its output differs every run.",
        "Why `LongAdder`? With 4 threads hammering 2 keys, `merge` makes every thread fight for the same 2 bin locks. A `LongAdder` keeps several internal cells and threads increment different cells, so contention mostly disappears; `sum()` adds the cells up. Use it for hot counters (metrics, rate limiting) where you read rarely.",
        "Why no nulls in `ConcurrentHashMap`? In a single-threaded map you can disambiguate `get(k) == null` with `containsKey(k)`. In a concurrent map another thread can change the mapping between those two calls, so null must unambiguously mean *absent*.",
        "Parallel streams pay off only for large, CPU-bound work on sources that split well (arrays, `ArrayList`, `IntStream.range`). In a busy web server the cores are already serving requests, so a parallel stream often adds overhead without improving throughput. Measure with JMH before using one."
      ]
    }
  ],

  stretch: [
    "Make your hand-written `HashMap` from this lab resize itself: double the table and split each chain into *lo* and *hi* lists with `hash & oldCapacity`. Prove with a test that no entry is lost across one million random puts.",
    "Put the LRU cache from today's coding round on top of your map and compare it with `LinkedHashMap(16, 0.75f, true)` using JMH (or a careful `System.nanoTime` loop). Explain the difference you measure.",
    "Generate 2¹⁶ colliding `String` keys from `\"Aa\"`/`\"BB\"` blocks and time inserting them into a `HashMap`. Repeat with a non-`Comparable` wrapper key that has the same hash codes, and explain the difference using treeification."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: LRU cache in O(1)',
      lead: 'The classic *design a data structure* round. It is common in phone screens, and onsite rounds add follow-ups on concurrency and eviction policies.',
      difficulty: 'Medium', minutes: 40, lc: 146, pattern: ['design', 'hashing', 'linked-list'],
      problem: [
        "Design a **least-recently-used (LRU) cache** with a fixed `capacity`:",
        "- `int get(int key)` returns the value for `key` if present and marks the key as most recently used; otherwise it returns `-1`.",
        "- `void put(int key, int value)` inserts or updates `key` and marks it as most recently used. If an insert makes the size exceed `capacity`, evict the **least recently used** key first.",
        "Both operations must run in **O(1)** average time."
      ],
      examples: [
        { in: 'capacity = 2\nput(1,1) put(2,2) get(1) put(3,3) get(2)\nput(4,4) get(1) get(3) get(4)', out: 'get results: 1, -1, -1, 3, 4',
          why: "`put(3,3)` evicts key 2, because `get(1)` made key 1 more recent. `put(4,4)` then evicts key 1." },
        { in: 'capacity = 1\nput(2,1) get(2) put(3,2) get(2) get(3)', out: 'get results: 1, -1, 2' }
      ],
      constraints: ["`1 ≤ capacity ≤ 3000`", "`0 ≤ key ≤ 10⁴`, `0 ≤ value ≤ 10⁵`", "At most `2 × 10⁵` calls to `get` and `put`"],
      hints: [
        "Which structure gives O(1) lookup by key? Which gives O(1) **reordering** — moving an element to the front and removing one from the back?",
        "Combine a hash map `key → node` with a **doubly** linked list ordered by recency. Why doubly linked? Removing a node in O(1) requires access to its predecessor.",
        "Use sentinel `head` and `tail` nodes so inserts and removals never deal with null neighbours, and store the key inside each node — you need it to delete the evicted entry from the map."
      ],
      approaches: [
        { name: 'List in recency order', idea: 'Linear search on `get`, move the hit to the front, evict the last element', time: 'O(n) per op', space: 'O(n)' },
        { name: 'Timestamps + TreeMap', idea: 'Map key → (value, lastUsed) plus a TreeMap lastUsed → key; evict `firstKey()`', time: 'O(log n) per op', space: 'O(n)' },
        { name: 'HashMap + doubly linked list', idea: 'Map key → node; list ordered by recency with sentinels; `get` moves to front, `put` inserts at front and evicts `tail.prev`', time: 'O(1) per op', space: 'O(capacity)' },
        { name: 'LinkedHashMap(accessOrder = true)', idea: 'Override `removeEldestEntry`; the JDK keeps the same map + list internally — mention it, then build your own if asked', time: 'O(1) per op', space: 'O(capacity)' }
      ],
      code: { lang: 'java', file: 'LRUCache.java', src: code`
        import java.util.*;

        public class LRUCache {
            private static final class Node {
                final int key;
                int val;
                Node prev, next;
                Node(int key, int val) { this.key = key; this.val = val; }
            }

            private final int capacity;
            private final Map<Integer, Node> index = new HashMap<>();
            private final Node head = new Node(-1, -1), tail = new Node(-1, -1);   // sentinels

            public LRUCache(int capacity) {
                if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
                this.capacity = capacity;
                head.next = tail;
                tail.prev = head;
            }

            public int get(int key) {
                Node n = index.get(key);
                if (n == null) return -1;
                unlink(n);
                addFirst(n);                        // now the most recently used
                return n.val;
            }

            public void put(int key, int value) {
                Node n = index.get(key);
                if (n != null) {                    // update + touch, never evict
                    n.val = value;
                    unlink(n);
                    addFirst(n);
                    return;
                }
                if (index.size() == capacity) {     // evict the least recently used
                    Node lru = tail.prev;
                    unlink(lru);
                    index.remove(lru.key);
                }
                n = new Node(key, value);
                index.put(key, n);
                addFirst(n);
            }

            private void unlink(Node n) { n.prev.next = n.next; n.next.prev = n.prev; }

            private void addFirst(Node n) {
                n.next = head.next;
                n.prev = head;
                head.next.prev = n;
                head.next = n;
            }

            // tests: the example above + 80,000 random operations against a LinkedHashMap model
            public static void main(String[] args) {
                LRUCache c = new LRUCache(2);
                List<Integer> got = new ArrayList<>();
                c.put(1, 1); c.put(2, 2); got.add(c.get(1)); c.put(3, 3); got.add(c.get(2));
                c.put(4, 4); got.add(c.get(1)); got.add(c.get(3)); got.add(c.get(4));
                System.out.println("example: " + got);

                Random rnd = new Random(42);
                int ops = 0;
                for (int cap : new int[] {1, 2, 5, 50}) {
                    LRUCache mine = new LRUCache(cap);
                    Map<Integer, Integer> model = new LinkedHashMap<>(16, 0.75f, true) {
                        @Override protected boolean removeEldestEntry(Map.Entry<Integer, Integer> e) {
                            return size() > cap;
                        }
                    };
                    for (int i = 0; i < 20_000; i++, ops++) {
                        int k = rnd.nextInt(cap * 3);
                        if (rnd.nextBoolean()) {
                            int v = rnd.nextInt(1000);
                            mine.put(k, v);
                            model.put(k, v);
                        } else if (mine.get(k) != model.getOrDefault(k, -1)) {
                            throw new AssertionError("mismatch at op " + ops);
                        }
                    }
                }
                System.out.println("random tests: " + ops + " ops matched LinkedHashMap(accessOrder=true)");
            }
        }`, out: code`
        example: [1, -1, -1, 3, 4]
        random tests: 80000 ops matched LinkedHashMap(accessOrder=true)` },
      pitfalls: [
        "Forgetting to remove the evicted key from the **map** — `get` then returns a node that is no longer in the list, and memory leaks. That is why each node stores its key.",
        "`put` on an existing key must update the value **and** move it to the front, without evicting anything.",
        "A singly linked list makes removal O(n); no sentinels means null checks everywhere and bugs at both ends.",
        "Capacity 0 or negative: clarify the expected behaviour — reject it in the constructor, as here, or make every `put` a no-op."
      ],
      followUps: [
        { q: "Make it thread-safe. What is wrong with simply marking both methods `synchronized`?",
          a: "It is correct but serialises everything, and a read-write lock does not help because even `get` mutates the list. Options: one `ReentrantLock` (fine at low contention); **lock striping** — N independent LRU segments chosen by `hash(key) % N`, exact LRU per segment and approximate globally; or what Caffeine does: record reads in lock-free ring buffers and replay them in batches under a lock, so reads almost never block. Strict global LRU order is inherently a contention point." },
        { q: "Add a time-to-live per entry.",
          a: "Store `expiresAt` in the node and treat an expired node as a miss on `get`, removing it (lazy expiry). Lazy expiry alone leaks memory for keys that are never read again, so add active cleanup: a min-heap or `DelayQueue` of (expiresAt, key), or a periodic sweep from the LRU tail — Redis samples random keys for the same reason. Inject a `Clock` so tests can control time." },
        { q: "Evict by memory size instead of entry count.",
          a: "Give each entry a weight (for example, the size of the value in bytes), maintain `totalWeight`, and evict from the tail **while** `totalWeight > maxWeight`. Decide what to do with a single entry heavier than the whole budget — usually reject it. Caffeine exposes this as `maximumWeight` plus a `weigher`." },
        { q: "A nightly job scans millions of keys once and wipes out the hot set. What policy would you use?",
          a: "That is cache pollution — LRU admits every scanned key. Use a frequency-aware policy: LFU (Session 15), **SLRU/2Q** (new keys enter a probation segment and are promoted on a second hit), or **W-TinyLFU** (Caffeine): a small LRU window plus a frequency sketch that admits a newcomer only if it is estimated to be more popular than the victim." }
      ],
      rubric: [
        "Explains that the O(1) requirement forces a map for lookup **plus** a list for recency before writing code.",
        "Pointer manipulation is correct, uses sentinels, removes the evicted key from the map, and handles the update path.",
        "Tests the example plus edge cases: capacity 1, repeated puts of the same key, `get` of a missing key.",
        "Knows `LinkedHashMap(accessOrder = true)` with `removeEldestEntry`, and when using it is acceptable.",
        "Discusses thread-safety options and their trade-offs without being prompted twice."
      ],
      notes: [
        "Run the round properly: 3 minutes to clarify (capacity bounds, what *use* means — does `put` count? yes), 2 minutes to state the map + list idea and its complexity, 20 minutes to code, 5 to test, the rest for follow-ups. Interviewers want to hear *why* a doubly linked list.",
        "The reference solution is verified against `LinkedHashMap` with access order on 80,000 random operations — a technique worth copying: a slow but obviously correct model plus random inputs finds pointer bugs that hand-written tests miss.",
        "In Spring Boot you would rarely write this by hand: Caffeine backs `@Cacheable` with size and time bounds (Session 15). But the round tests whether you understand what such libraries do internally."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: hashing, HashMap & streams',
      lead: 'Ten questions in the order interviewers escalate them — from *how does put work* to hash flooding and cache design. Answer out loud first, then compare with the model answer.',
      qa: [
        { level: 1, q: "Walk me through exactly what happens when you call `map.put(key, value)` on a `HashMap`.",
          a: [
            "1. Compute `hash(key)`: call `key.hashCode()` and spread it with `h ^ (h >>> 16)`; a `null` key gets hash 0 and lives in bucket 0.",
            "2. Allocate the table lazily on the first put (16 buckets by default).",
            "3. Pick the bucket: `index = (n - 1) & hash`.",
            "4. Empty bucket → store a new node. Otherwise walk it: a node with the same stored hash **and** an equal key (`==` or `equals`) gets its value replaced, and the old value is returned. If none matches, append a node at the tail — or insert into the red-black tree if the bucket is treeified.",
            "5. If the bucket already held 8 nodes, treeify it — or resize instead while the table has fewer than 64 buckets.",
            "6. Increment `modCount` (for fail-fast iterators) and resize when `++size > threshold`."
          ],
          follow: ["Why compare the stored hash before calling `equals`?", "What does `put` return, and why is that useful?"],
          flags: ["Saying the index is `hashCode() % capacity` with no mention of spreading or the bitmask", "Claiming entries are kept in a tree by default"] },
        { level: 1, q: "Why must you override `hashCode` whenever you override `equals`? Describe the exact failure.",
          a: "The contract says equal objects must have equal hash codes. `HashMap` first uses the hash to choose a bucket and only then calls `equals` inside that bucket. If two equal keys have different hash codes (for example the default identity hash), they land in different buckets: `map.put(new Point(1, 2), \"a\")` followed by `map.get(new Point(1, 2))` returns `null`, and a `HashSet` happily stores *duplicates*. The reverse is allowed: unequal objects may share a hash code — that is a collision, which only costs performance. Records generate both methods consistently from their components.",
          follow: ["Is it legal for `hashCode()` to return a constant? What happens to performance?"],
          flags: ["Only knowing the rule, not the bucket-then-equals mechanism behind it"] },
        { level: 2, q: "Why is `HashMap`'s capacity always a power of two, and what happens to existing entries on resize?",
          a: "A power-of-two capacity lets the index be a bitmask, `(n - 1) & hash`, instead of a modulo (an integer division, far slower). It also makes resizing cheap: when the table doubles from `n` to `2n`, a node's new index depends on exactly one extra bit — if `(hash & n) == 0` it stays at `i`, otherwise it moves to `i + n`. Java 8 splits each chain into a *lo* and a *hi* list in one pass, keeps their relative order, and reuses the hash cached in each node, so `hashCode()` is never called again. The downside of a mask is that only the low bits matter, hence the `h ^ (h >>> 16)` spreading. A resize is still O(n), so pre-size with `HashMap.newHashMap(expected)` when you know the size.",
          follow: ["When does the first resize of a default `HashMap` happen?", "Why do some languages use prime-sized tables instead?"],
          flags: ["*Every key is rehashed on resize* — Java 8 reuses the cached hash"] },
        { level: 2, q: "When does a `HashMap` bucket become a tree, and why are the thresholds 8 and 6?",
          a: "When an insert lands in a bucket that already holds **8** nodes (`TREEIFY_THRESHOLD`) **and** the table has at least **64** buckets (`MIN_TREEIFY_CAPACITY`). With a smaller table the map resizes instead, because a long chain in a small table usually just means the table is too small. Tree bins are red-black trees ordered by hash and then by `compareTo` for `Comparable` keys, so lookups become O(log n). They revert to lists at **6** nodes; the gap prevents flapping when a bucket's size hovers around the boundary. With a reasonable hash function this almost never happens — the JDK source notes that bin sizes follow a Poisson distribution with λ ≈ 0.5 at load factor 0.75, making an 8-node bin roughly a one-in-ten-million event. Treeification exists for poor `hashCode()` implementations and for deliberate hash-flooding attacks.",
          follow: ["What if the colliding keys are not `Comparable`?", "How could an attacker produce thousands of colliding `String` keys?"] },
        { level: 2, q: "Compare `HashMap`, `Collections.synchronizedMap` and `ConcurrentHashMap`. Why does `ConcurrentHashMap` forbid `null`?",
          a: "`HashMap` is not thread-safe: concurrent puts can lose updates or whole entries, and in Java 7 a concurrent resize could create a cycle that hangs `get`. `synchronizedMap` wraps every call in one lock — safe but fully serialised; iteration still needs manual locking, and compound actions such as check-then-put need an external lock. `ConcurrentHashMap` (Java 8+) fills empty bins with CAS, locks only the first node of a bin for updates, reads without locks via volatile fields, resizes cooperatively, and offers atomic compound operations (`putIfAbsent`, `compute`, `merge`). Its iterators are weakly consistent and never throw `ConcurrentModificationException`. Nulls are banned because in a concurrent map `get(k) == null` must mean *absent*; with nulls you would need a separate `containsKey` call, and another thread could change the mapping in between.",
          follow: ["How does `ConcurrentHashMap` compute `size()`?", "Is `if (!map.containsKey(k)) map.put(k, v)` safe on a `ConcurrentHashMap`?"],
          flags: ["*ConcurrentHashMap locks segments* — that was Java 7; Java 8 removed segments", "Suggesting `Hashtable` for new code"] },
        { level: 2, q: "What goes wrong if a key's fields change after it was inserted into a `HashMap` or `HashSet`?",
          a: "The entry stays in the bucket chosen from its *old* hash — the node even caches that hash. After the mutation, `get` and `contains` compute the new hash, look in a different bucket and return `null`/`false`; `remove` fails too, so the entry is effectively leaked. Iteration still shows it, and you can even insert a second *equal* copy. Fixes: immutable keys (records, `String`, value objects with final fields), never base `equals`/`hashCode` on mutable fields, or remove-mutate-reinsert. JPA entities are the classic trap: an id-based `hashCode` changes when the database assigns the id on persist — use a constant `hashCode` or a natural business key.",
          follow: ["How would you make a key class safe?", "Does the same problem exist for `TreeMap` keys used in `compareTo`?"] },
        { level: 2, q: "When are parallel streams a good idea, and when do they hurt?",
          a: "A parallel stream splits its source with a `Spliterator`, processes chunks on the **common ForkJoinPool** (parallelism = cores − 1 by default) and combines the partial results. It helps when the data is large and CPU-bound (a rough rule: elements × cost per element above ~10⁵ simple operations), the source splits evenly (arrays, `ArrayList`, `IntStream.range` — not `LinkedList` or `Stream.iterate`), the operations are stateless and the reduction is associative. It hurts when tasks block on I/O (they starve the pool shared by every parallel stream and default-async `CompletableFuture` in the JVM), when ordering constraints apply (`forEachOrdered`, `limit` on ordered streams), when boxing dominates, or when lambdas mutate shared state. In a busy server the cores are already serving requests, so measure with JMH before using one.",
          follow: ["How can you run a parallel stream on a custom pool, and is that a good idea?", "Why is `reduce` with a non-associative operation wrong in parallel?"],
          flags: ["Using a parallel stream to make HTTP or database calls", "Adding to a shared `ArrayList` from `forEach` in a parallel stream"] },
        { level: 2, q: "`Collectors.toMap` threw an `IllegalStateException` in production. Why, and how do you fix it?",
          a: "The two-argument `toMap(keyMapper, valueMapper)` throws `IllegalStateException: Duplicate key …` as soon as two elements map to the same key — typical when data you assumed unique (e-mail, SKU) is not. Decide the semantics explicitly with the three-argument form, e.g. keep the newest: `toMap(User::email, u -> u, (a, b) -> a.updatedAt().isAfter(b.updatedAt()) ? a : b)`; or group instead with `groupingBy`; or fail with a domain error that names the duplicate. Two more traps: `toMap` builds a `HashMap`, so pass `LinkedHashMap::new` or `TreeMap::new` as the fourth argument when order matters, and values may not be `null` (the internal `merge` throws `NullPointerException`).",
          follow: ["How would you find which records are duplicated before collecting?"] },
        { level: 3, q: "An attacker sends requests with thousands of parameters whose names all share one hash code. What happens, and how do you defend?",
          a: "That is **hash flooding**, an algorithmic-complexity attack. If every key collides, the bucket degrades to a list and each insert walks it, so parsing n parameters costs O(n²) CPU — a few megabytes of request can pin a core for seconds. Equal hashes are easy to manufacture for `String`: `\"Aa\"` and `\"BB\"` both hash to 2112 and every concatenation of those blocks collides too, giving 2ᵏ colliding keys of length 2k (see the program). Resizing does not help because the keys share every hash bit. Defend in depth: Java 8+ treeifies long bins, so `String` keys degrade only to O(log n) per insert; cap request size, parameter count and header size at the server or gateway (Tomcat's `maxParameterCount`, body size limits); rate-limit; and for untrusted keys in your own code prefer bounded structures. Python and Rust switched to keyed hash functions (SipHash) for exactly this reason.",
          code: { lang: 'java', file: 'Collide.java', src: code`
            import java.util.*;

            public class Collide {
                public static void main(String[] args) {
                    List<String> keys = List.of("");
                    for (int round = 0; round < 3; round++) {          // 2^3 = 8 keys of length 6
                        List<String> next = new ArrayList<>();
                        for (String k : keys) { next.add(k + "Aa"); next.add(k + "BB"); }
                        keys = next;
                    }
                    Set<Integer> hashes = new TreeSet<>();
                    keys.forEach(k -> hashes.add(k.hashCode()));
                    System.out.println(keys);
                    System.out.println(keys.size() + " keys, distinct hash codes: " + hashes);
                }
            }`, out: code`
            [AaAaAa, AaAaBB, AaBBAa, AaBBBB, BBAaAa, BBAaBB, BBBBAa, BBBBBB]
            8 keys, distinct hash codes: [1952508096]` },
          follow: ["Why doesn't resizing help against this attack?", "Where else does a backend hash untrusted input?"],
          flags: ["*HashMap is always O(1)* with no mention of the worst case"] },
        { level: 3, q: "You need an in-process cache on a hot read path. When do you use `ConcurrentHashMap`, `LinkedHashMap`, or a library such as Caffeine?",
          a: "Start from the requirements: bounded size? eviction policy? TTL? target hit ratio? concurrency? A plain `ConcurrentHashMap` suits **unbounded, rarely changing** data such as configuration or reference data; `computeIfAbsent` gives atomic per-key loading, but long loaders block their bin and the map never shrinks. `LinkedHashMap(accessOrder = true)` with `removeEldestEntry` is a 20-line LRU, but every access — reads included — must take one lock because reads reorder the list, so it collapses under contention. For production hot paths use **Caffeine** (Spring Boot's preferred local cache provider): size or weight bounds, expiry and refresh, W-TinyLFU admission for a better hit ratio than LRU on skewed workloads, async loading, and reads that rarely block. Also cover stampede protection (one load per key), negative caching, metrics (hit ratio, evictions), and the fact that a per-instance cache is duplicated across N instances and can serve stale data — when that matters, use Redis (Session 15).",
          follow: ["How would you prove the cache is worth having?", "What is a cache stampede, and how does `computeIfAbsent` help?"] }
      ],
      notes: [
        "Use these as a mock: one person asks, the other answers for about three minutes per question, then compare with the model answer and rate honestly. The levels show when an answer of this depth is *expected* — a strong SDE-1 candidate who can answer the SDE-2 questions stands out.",
        "The two Senior questions are open-ended on purpose: there is no single right answer, and interviewers grade the structure — requirements first, options with trade-offs, failure modes, and how you would measure the outcome.",
        "Both programs on this slide are compiled and run by the course test suite, so the numbers quoted (hash codes, outputs) are real."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                Map<Integer, String> m = new HashMap<>();
                m.put(33, "c"); m.put(17, "b"); m.put(1, "a"); m.put(2, "d");
                System.out.println(m.keySet());
            }
        }`, out: '[33, 17, 1, 2]' },
      options: ['`[1, 2, 17, 33]`', '`[33, 17, 1, 2]`', '`[1, 17, 33, 2]`', 'A different order on every run'], answer: 1,
      why: "`Integer.hashCode()` is the value itself, so with 16 buckets 33, 17 and 1 all land in bucket 1 and are chained in insertion order; 2 is in bucket 2. Iteration walks the buckets in index order. The result is deterministic for a given JDK, but the order is unspecified by contract — never depend on it." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;
        import java.util.stream.*;

        public class Main {
            record User(String email, String name) {}

            public static void main(String[] args) {
                try {
                    Map<String, String> m = Stream.of(new User("a@x.com", "Asha"),
                                    new User("b@x.com", "Bala"), new User("a@x.com", "Arun"))
                            .collect(Collectors.toMap(User::email, User::name));
                    System.out.println(m.size());
                } catch (IllegalStateException e) {
                    System.out.println(e.getMessage());
                }
            }
        }`, out: 'Duplicate key a@x.com (attempted merging values Asha and Arun)' },
      options: ['`2`', '`3`', '`Duplicate key a@x.com (attempted merging values Asha and Arun)`', '`{a@x.com=Arun, b@x.com=Bala}`'], answer: 2,
      why: "The two-argument `toMap` has no merge function, so a duplicate key throws `IllegalStateException`. Pass a merge function as the third argument to choose which value wins." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.stream.*;

        public class Main {
            public static void main(String[] args) {
                StringBuilder log = new StringBuilder();
                int first = IntStream.rangeClosed(1, 10)
                        .peek(i -> log.append('p').append(i).append(' '))
                        .filter(i -> i % 3 == 0)
                        .map(i -> i * 10)
                        .findFirst()
                        .orElse(-1);
                System.out.println(log + "-> " + first);
            }
        }`, out: 'p1 p2 p3 -> 30' },
      options: ['`p1 p2 p3 p4 p5 p6 p7 p8 p9 p10 -> 30`', '`p1 p2 p3 -> 30`', '`-> 30` (peek never runs)', '`p3 -> 30`'], answer: 1,
      why: "Streams are lazy and process one element at a time through the whole pipeline. `findFirst` short-circuits as soon as 3 passes the filter, so elements 4–10 are never pulled from the source." },
    { level: 3, q: "A `HashMap` has 16 buckets and one bucket already holds 8 keys with identical hash codes. What happens when a 9th key with that hash is inserted?",
      options: ['The bucket becomes a red-black tree', 'The table is resized to 32 buckets instead of treeifying', 'An `IllegalStateException` is thrown', 'The key is rejected'], answer: 1,
      why: "Treeification requires at least 64 buckets (`MIN_TREEIFY_CAPACITY`); below that, `treeifyBin` resizes instead, assuming the table is just too small. Identical hashes do not spread on resize, so after a couple more colliding inserts (32, then 64 buckets) the bin is finally treeified." },
    { level: 3, q: "Under load, threads calling `cache.computeIfAbsent(key, k -> slowRemoteCall(k))` on a `ConcurrentHashMap` see high latency even for *different* keys. What is the most likely cause?",
      options: ['`computeIfAbsent` locks the entire map', 'The mapping function runs while holding the lock of the key\'s bin, so other keys in that bin wait for the slow call', 'ConcurrentHashMap copies the table on every write', 'The common ForkJoinPool is exhausted'], answer: 1,
      why: "The function runs under the bin lock — that is how `ConcurrentHashMap` guarantees it runs at most once per key. Other keys hashing to the same bin block behind your remote call. Keep mapping functions short: cache a `CompletableFuture` instead of the value, or use a cache with asynchronous loading such as Caffeine." },
    { level: 2, q: "A request handler calls `orders.parallelStream().map(o -> httpClient.send(...))`. What is the main risk?",
      options: ['Parallel streams cannot call blocking methods', 'It blocks threads of the JVM-wide common ForkJoinPool, starving every other parallel stream and default-async `CompletableFuture`', 'The results come back in random order', 'Each element creates a new platform thread'], answer: 1,
      why: "Parallel streams run on the shared common pool sized for CPU work (cores − 1 threads). Blocking I/O there stalls unrelated work across the whole JVM. For concurrent I/O use virtual threads or a dedicated executor with `CompletableFuture`." }
  ]
});
