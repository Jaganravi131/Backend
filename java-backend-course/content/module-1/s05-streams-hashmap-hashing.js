COURSE.session({
  no: 5,
  short: 'Streams, HashMap & hashing',
  title: 'Streams API, HashMap Internals & Hashing Algorithms',
  covers: [5],
  objectives: [
    "Build declarative data pipelines with the Streams API (filter, map, sorted, reduce, flatMap).",
    "Aggregate data with Collectors: groupingBy, partitioningBy, toMap, joining, statistics.",
    "Explain hashing — hash functions, collisions, chaining — and how `HashMap` stores, finds and resizes entries.",
    "Avoid HashMap bugs caused by mutable keys or a missing `hashCode`."
  ],
  prereq: "Session 3 (lambdas, functional interfaces) and Session 4 (collections, equals/hashCode).",
  slides: [
    {
      type: 'theory',
      title: 'Streams: declarative data pipelines',
      lead: 'A stream is a **pipeline of operations** over a data source. You describe *what* you want; the library decides *how* to iterate.',
      diagram: { kind: 'flow', nodes: [
        { t: 'Source', s: 'list.stream(), Stream.of, IntStream.range', tone: 'blue' },
        { t: 'filter', s: 'intermediate (lazy)', tone: 'gray' },
        { t: 'map', s: 'intermediate (lazy)', tone: 'gray' },
        { t: 'sorted', s: 'intermediate, stateful', tone: 'gray' },
        { t: 'collect / toList', s: 'terminal: triggers work', tone: 'green' }
      ] },
      points: [
        "**Intermediate** ops (`filter`, `map`, `sorted`, `distinct`, `limit`) return a new stream and are **lazy**.",
        "A **terminal** op (`toList`, `collect`, `forEach`, `count`, `reduce`, `findFirst`) runs the pipeline once.",
        "A stream is **not a data structure** and can be consumed **only once**.",
        "Elements flow through the pipeline one at a time; short-circuit ops (`findFirst`, `anyMatch`, `limit`) stop early."
      ],
      notes: [
        "Contrast with the imperative loop students know: a `for` loop with `if`, a temporary list and `Collections.sort`. The stream version reads top-to-bottom like the business requirement: 'delivered orders over ₹1,000, biggest first, give me the ids'.",
        "Streams came in Java 8 together with lambdas — the brochure's 'Functional Programming with Java 8' skill. In backend code they are everywhere: mapping entities to DTOs, building reports, validating inputs."
      ]
    },
    {
      type: 'practical',
      title: 'Stream operations on real data',
      lead: 'One small order dataset, many questions answered in one expression each.',
      code: { lang: 'java', file: 'StreamBasics.java', src: code`
        import java.util.*;
        import java.util.stream.*;

        public class StreamBasics {
            record Order(String id, String customer, String city, double amount, String status) {}

            static final List<Order> ORDERS = List.of(
                    new Order("O1", "asha", "Pune", 1200, "DELIVERED"),
                    new Order("O2", "ravi", "Delhi", 450, "CANCELLED"),
                    new Order("O3", "asha", "Pune", 3000, "DELIVERED"),
                    new Order("O4", "meera", "Chennai", 800, "SHIPPED"),
                    new Order("O5", "ravi", "Delhi", 2200, "DELIVERED"),
                    new Order("O6", "zoya", "Chennai", 150, "DELIVERED"));

            public static void main(String[] args) {
                List<String> bigDelivered = ORDERS.stream()
                        .filter(o -> o.status().equals("DELIVERED"))       // lazy
                        .filter(o -> o.amount() >= 1000)
                        .sorted(Comparator.comparingDouble(Order::amount).reversed())
                        .map(Order::id)
                        .toList();                                         // terminal (Java 16+)
                System.out.println("big delivered: " + bigDelivered);

                double revenue = ORDERS.stream().filter(o -> !o.status().equals("CANCELLED"))
                        .mapToDouble(Order::amount).sum();                 // primitive stream
                System.out.println("revenue = " + revenue);

                System.out.println("customers: " + ORDERS.stream().map(Order::customer).distinct().sorted().toList());
                System.out.println("any > 2500? " + ORDERS.stream().anyMatch(o -> o.amount() > 2500));
                Optional<Order> firstChennai = ORDERS.stream().filter(o -> o.city().equals("Chennai")).findFirst();
                System.out.println("first Chennai order: " + firstChennai.map(Order::id).orElse("none"));

                OptionalDouble avg = ORDERS.stream().mapToDouble(Order::amount).average();
                System.out.printf("average = %.2f%n", avg.orElse(0));
                System.out.println("reduce 1..5 = " + IntStream.rangeClosed(1, 5).reduce(0, Integer::sum));
                System.out.println(Stream.of("b", "a", "c").collect(Collectors.joining(", ", "[", "]")));
            }
        }`, out: code`
        big delivered: [O3, O5, O1]
        revenue = 7350.0
        customers: [asha, meera, ravi, zoya]
        any > 2500? true
        first Chennai order: O4
        average = 1300.00
        reduce 1..5 = 15
        [b, a, c]` },
      notes: [
        "`mapToDouble`/`mapToInt` switch to primitive streams that offer `sum`, `average`, `max` without boxing.",
        "`findFirst` returns an `Optional` because the stream may be empty — never call `.get()` blindly; use `orElse`, `orElseThrow`, `map`, `ifPresent`.",
        "`Stream.toList()` (Java 16) returns an **unmodifiable** list; `collect(Collectors.toList())` returns a mutable `ArrayList` in practice. Prefer `toList()` unless you must modify the result."
      ]
    },
    {
      type: 'practical',
      title: 'Collectors: grouping, partitioning & reporting',
      lead: '`Collectors` turn a stream into maps, summaries and strings — SQL\'s `GROUP BY` in Java.',
      code: { lang: 'java', file: 'CollectorsDemo.java', src: code`
        import java.util.*;
        import static java.util.stream.Collectors.*;

        public class CollectorsDemo {
            record Order(String id, String customer, String city, double amount, String status) {}

            static final List<Order> ORDERS = List.of(
                    new Order("O1", "asha", "Pune", 1200, "DELIVERED"),
                    new Order("O2", "ravi", "Delhi", 450, "CANCELLED"),
                    new Order("O3", "asha", "Pune", 3000, "DELIVERED"),
                    new Order("O4", "meera", "Chennai", 800, "SHIPPED"),
                    new Order("O5", "ravi", "Delhi", 2200, "DELIVERED"),
                    new Order("O6", "zoya", "Chennai", 150, "DELIVERED"));

            public static void main(String[] args) {
                Map<String, Long> perCity = ORDERS.stream()
                        .collect(groupingBy(Order::city, TreeMap::new, counting()));
                System.out.println("orders per city: " + perCity);

                Map<String, Double> spend = ORDERS.stream()
                        .filter(o -> !o.status().equals("CANCELLED"))
                        .collect(groupingBy(Order::customer, TreeMap::new, summingDouble(Order::amount)));
                System.out.println("spend per customer: " + spend);

                Map<String, List<String>> idsByStatus = ORDERS.stream()
                        .collect(groupingBy(Order::status, TreeMap::new, mapping(Order::id, toList())));
                System.out.println("ids by status: " + idsByStatus);

                Map<Boolean, Long> bigVsSmall = ORDERS.stream()
                        .collect(partitioningBy(o -> o.amount() >= 1000, counting()));
                System.out.println("big vs small: " + bigVsSmall);

                Map<String, Double> maxPerCity = ORDERS.stream()
                        .collect(toMap(Order::city, Order::amount, Math::max, TreeMap::new)); // merge duplicates
                System.out.println("max per city: " + maxPerCity);

                String top = spend.entrySet().stream()
                        .max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElseThrow();
                System.out.println("top customer: " + top);

                DoubleSummaryStatistics st = ORDERS.stream().collect(summarizingDouble(Order::amount));
                System.out.printf("min=%.0f max=%.0f avg=%.0f count=%d%n", st.getMin(), st.getMax(), st.getAverage(), st.getCount());
            }
        }`, out: code`
        orders per city: {Chennai=2, Delhi=2, Pune=2}
        spend per customer: {asha=4200.0, meera=800.0, ravi=2200.0, zoya=150.0}
        ids by status: {CANCELLED=[O2], DELIVERED=[O1, O3, O5, O6], SHIPPED=[O4]}
        big vs small: {false=3, true=3}
        max per city: {Chennai=800.0, Delhi=2200.0, Pune=3000.0}
        top customer: asha
        min=150 max=3000 avg=1300 count=6` },
      table: { head: ['SQL', 'Streams'], rows: [
        ['`WHERE status <> \'CANCELLED\'`', '`.filter(o -> !o.status().equals("CANCELLED"))`'],
        ['`GROUP BY customer` + `SUM(amount)`', '`groupingBy(Order::customer, summingDouble(Order::amount))`'],
        ['`COUNT(*) GROUP BY city`', '`groupingBy(Order::city, counting())`'],
        ['`ORDER BY amount DESC LIMIT 3`', '`.sorted(comparing(...).reversed()).limit(3)`']
      ] },
      notes: [
        "Passing `TreeMap::new` as the map factory makes the output sorted and deterministic — the default `groupingBy` uses a `HashMap`.",
        "`toMap` throws `IllegalStateException` on duplicate keys unless you provide a merge function (`Math::max` here). This is a very common production bug.",
        "Rule of thumb: aggregate in the **database** when the data is large (Session 10–11). Use collectors for data already in memory — e.g. building API responses or in-memory reports."
      ]
    },
    {
      type: 'theory',
      title: 'Laziness, short-circuiting & stream pitfalls',
      lead: 'Nothing runs until a terminal operation is called — and then each element travels through the whole pipeline before the next one starts.',
      code: { lang: 'java', file: 'LazyDemo.java', src: code`
        import java.util.List;
        import java.util.stream.Stream;

        public class LazyDemo {
            public static void main(String[] args) {
                List<String> names = List.of("asha", "bala", "chen", "dev", "esha");
                String result = names.stream()
                        .peek(n -> System.out.println("  saw " + n))
                        .filter(n -> n.length() == 4)
                        .peek(n -> System.out.println("  kept " + n))
                        .map(String::toUpperCase)
                        .filter(n -> n.startsWith("C"))
                        .findFirst()                        // short-circuits at the first match
                        .orElse("none");
                System.out.println("result = " + result);

                Stream<String> s = names.stream().filter(n -> n.contains("a"));
                System.out.println("count = " + s.count());
                try {
                    s.count();                              // a stream can be consumed only once
                } catch (IllegalStateException e) {
                    System.out.println("IllegalStateException: " + e.getMessage());
                }

                List<List<String>> teams = List.of(List.of("asha", "bala"), List.of("chen"), List.of());
                System.out.println(teams.stream().flatMap(List::stream).map(String::length).toList());

                Stream.iterate(1, x -> x * 2).limit(6).forEach(x -> System.out.print(x + " "));
                System.out.println();
            }
        }`, out: code`
          saw asha
          kept asha
          saw bala
          kept bala
          saw chen
          kept chen
        result = CHEN
        count = 3
        IllegalStateException: stream has already been operated upon or closed
        [4, 4, 4]
        1 2 4 8 16 32` },
      points: [
        "`dev` and `esha` are never even looked at — the pipeline stopped after finding `CHEN`.",
        "`flatMap` flattens nested structures (lists of lists, orders → line items).",
        "Avoid side effects in lambdas (don't mutate shared collections inside `map`/`filter`).",
        "`parallelStream()` only helps for large, CPU-bound work with no shared mutable state; it uses the common ForkJoinPool — measure before using it in a web server."
      ],
      notes: [
        "Predict-the-output exercise: many students expect all 'saw' lines first, then all 'kept' lines (horizontal processing). Streams process vertically, element by element — that is what makes short-circuiting and infinite streams (`Stream.iterate` + `limit`) possible.",
        "`peek` exists mainly for debugging; don't put business logic in it.",
        "Parallel streams in a request-handling server compete with every other request for the same common pool — usually a bad trade. We'll discuss proper concurrency tools in Session 6."
      ]
    },
    {
      type: 'theory',
      title: 'Hashing fundamentals',
      lead: 'A **hash function** maps a key to an integer; the integer picks a **bucket**. Good hashing makes lookups O(1) on average.',
      diagram: { kind: 'flow', nodes: [
        { t: '"goa"', s: 'key', tone: 'blue' },
        { t: 'hashCode()', s: '102521', tone: 'gray' },
        { t: 'spread', s: 'h ^ (h >>> 16) = 102520', tone: 'gray' },
        { t: 'index', s: '(16 − 1) & hash = 8', tone: 'yellow' },
        { t: 'bucket [8]', s: 'table slot', tone: 'green' }
      ] },
      points: [
        "Properties of a good hash: **deterministic**, **fast**, **uniform** spread across buckets.",
        "**Collisions** are unavoidable (infinitely many keys, finitely many buckets — the pigeonhole principle).",
        "Resolution strategies: **separate chaining** (a list per bucket — Java's `HashMap`) or **open addressing** (probe the next free slot — e.g. `IdentityHashMap`, Python dicts).",
        "`String.hashCode()` = s[0]·31ⁿ⁻¹ + s[1]·31ⁿ⁻² + … + s[n−1] (computed with int overflow)."
      ],
      table: { head: ['Kind', 'Examples', 'Used for'], rows: [
        ['Non-cryptographic', '`hashCode()`, MurmurHash, xxHash', 'hash tables, partitioning (Kafka keys!), caches'],
        ['Cryptographic', 'SHA-256, SHA-3', 'integrity checks, signatures, idempotency keys'],
        ['Password hashing', 'BCrypt, Argon2, PBKDF2', 'storing passwords — slow on purpose (Session 16)'],
        ['Consistent hashing', 'hash ring', 'distributing keys across servers (Redis Cluster, Session 15)']
      ] },
      notes: [
        "Why 31 in String.hashCode? It's an odd prime, so multiplication spreads bits well, and `31 * h` can be computed as `(h << 5) - h`.",
        "Why does HashMap 'spread' the hash with `h ^ (h >>> 16)`? The index uses only the *low* bits (`hash & (n - 1)`). Mixing the high 16 bits into the low bits means keys that differ only in high bits still land in different buckets.",
        "Hashing appears far beyond HashMap in this course: Kafka chooses a partition by hashing the message key (Session 20), Redis Cluster uses hash slots, and BCrypt hashes passwords. Same idea, different goals."
      ]
    },
    {
      type: 'theory',
      title: 'Inside HashMap: buckets, chains & trees',
      lead: 'A `HashMap` is an array of buckets. Each bucket holds a linked list of nodes — upgraded to a **red-black tree** when it gets long.',
      diagram: { kind: 'buckets', title: 'Real bucket layout for 8 city keys in a 16-bucket HashMap (Java 21)', buckets: [
        ['0', []], ['1', ['mumbai=1', 'jaipur=8']], ['2–6', []], ['7', ['kochi=7']],
        ['8', ['goa=3', 'agra=5', 'pune=4']], ['9–10', []], ['11', ['chennai=6']], ['12', ['delhi=2']], ['13–15', []]
      ] },
      points: [
        "Default capacity **16**, load factor **0.75** → resize when size exceeds **12**; capacity always a power of two.",
        "**Resize** doubles the table and re-distributes nodes: each node stays at index *i* or moves to *i + oldCapacity*.",
        "A bucket with ≥ **8** nodes is *treeified* (if capacity ≥ 64), so the worst case is O(log n) instead of O(n).",
        "`put`: hash → index → walk the bucket; same hash **and** `equals` → replace the value, otherwise append a node."
      ],
      callout: { kind: 'interview', text: "*How does HashMap.get() work?* Compute `hash(key)`, find the bucket with `(n − 1) & hash`, then compare each node: first the stored hash, then `==` or `equals`. That is why both `hashCode` and `equals` must be correct." },
      notes: [
        "The layout on the slide is real: `goa`, `agra` and `pune` all have spread hashes whose low 4 bits are `1000`, so they share bucket 8. That is also why the HashSet in Session 4 printed `[goa, agra, delhi]`.",
        "Why a power-of-two capacity? `(n - 1) & hash` is a cheap bitmask instead of a slow modulo, and on resize a node's new index depends on just one extra bit.",
        "Treeification protects against pathological inputs, including hash-flooding attacks where an attacker sends many keys with colliding hash codes. Tree bins convert back to lists when they shrink to 6 nodes.",
        "If you know the size up front, pre-size the map: `HashMap.newHashMap(1_000)` (Java 19+) avoids repeated resizes."
      ]
    },
    {
      type: 'practical',
      title: 'Hash codes, buckets & collisions in code',
      lead: 'Reproduce HashMap\'s index calculation and watch two different keys collide — yet both are retrieved correctly.',
      code: { lang: 'java', file: 'HashingDemo.java', src: code`
        import java.util.*;

        public class HashingDemo {
            static int spread(int h) { return h ^ (h >>> 16); }          // what HashMap.hash() does
            static int bucket(Object key, int capacity) { return (capacity - 1) & spread(key.hashCode()); }

            public static void main(String[] args) {
                for (String k : List.of("goa", "agra", "delhi", "Aa", "BB")) {
                    System.out.printf("%-6s hashCode=%-9d bucket(16)=%d%n", k, k.hashCode(), bucket(k, 16));
                }
                Map<String, Integer> map = new HashMap<>();
                map.put("Aa", 1);
                map.put("BB", 2);                     // identical hashCode -> same bucket...
                System.out.println(map.get("Aa") + " " + map.get("BB") + " size=" + map.size());
                System.out.println("\"Aa\".equals(\"BB\") = " + "Aa".equals("BB"));   // ...equals() separates them
            }
        }`, out: code`
        goa    hashCode=102521    bucket(16)=8
        agra   hashCode=2992341   bucket(16)=8
        delhi  hashCode=95468108  bucket(16)=12
        Aa     hashCode=2112      bucket(16)=0
        BB     hashCode=2112      bucket(16)=0
        1 2 size=2
        "Aa".equals("BB") = false` },
      notes: [
        "`\"Aa\"` and `\"BB\"` have the *same* hash code (65·31 + 97 = 66·31 + 66 = 2112). Collisions are legal; the map stays correct because it falls back to `equals`.",
        "Equal objects must have equal hash codes, but unequal objects *may* share a hash code. A `hashCode()` that returns a constant is legal but turns every lookup into a linear (or tree) search.",
        "Discussion: if attackers can choose keys (e.g. JSON field names or query params), many colliding keys could slow a server down. Treeified bins cap the damage at O(log n)."
      ]
    },
    {
      type: 'practical',
      title: 'Broken keys: the bugs hashing causes',
      lead: 'Mutating a key after insertion strands the entry; overriding `equals` without `hashCode` breaks de-duplication.',
      code: { lang: 'java', file: 'BrokenKeys.java', src: code`
        import java.util.*;
        import java.util.concurrent.ConcurrentHashMap;

        public class BrokenKeys {
            static class MutableKey {                         // equals/hashCode use a MUTABLE field
                String code;
                MutableKey(String code) { this.code = code; }
                @Override public boolean equals(Object o) { return o instanceof MutableKey k && k.code.equals(code); }
                @Override public int hashCode() { return code.hashCode(); }
            }

            static class NoHashCode {                         // equals WITHOUT hashCode
                final String id;
                NoHashCode(String id) { this.id = id; }
                @Override public boolean equals(Object o) { return o instanceof NoHashCode n && n.id.equals(id); }
            }

            public static void main(String[] args) {
                Map<MutableKey, String> prices = new HashMap<>();
                MutableKey key = new MutableKey("SKU-1");
                prices.put(key, "499");
                key.code = "SKU-9";                           // mutate the key after insertion!
                System.out.println("get(key) = " + prices.get(key));
                System.out.println("get(new SKU-1) = " + prices.get(new MutableKey("SKU-1")));
                System.out.println("size = " + prices.size() + " -> the entry is stranded");

                Set<NoHashCode> set = new HashSet<>();
                set.add(new NoHashCode("A"));
                set.add(new NoHashCode("A"));
                System.out.println("NoHashCode set size = " + set.size() + " (expected 1)");

                Map<String, String> m = new HashMap<>();
                m.put(null, "null key is allowed in HashMap");
                System.out.println(m.get(null));
                try {
                    new ConcurrentHashMap<String, String>().put(null, "x");
                } catch (NullPointerException e) {
                    System.out.println("ConcurrentHashMap rejects null keys");
                }
            }
        }`, out: code`
        get(key) = null
        get(new SKU-1) = null
        size = 1 -> the entry is stranded
        NoHashCode set size = 2 (expected 1)
        null key is allowed in HashMap
        ConcurrentHashMap rejects null keys` },
      callout: { kind: 'best', text: "Use **immutable** keys: `String`, `Integer`, enums, or **records** with immutable components. Never let fields used in `equals`/`hashCode` change while the object is inside a hash collection." },
      notes: [
        "After mutation the entry sits in the bucket for the *old* hash. Looking up with the mutated key goes to the *new* bucket (miss); looking up with an equal-to-old key finds the right bucket but `equals` now fails (miss). The value is unreachable but still uses memory — a memory leak.",
        "Without `hashCode`, two 'equal' objects get different identity hash codes, land in different buckets, and `equals` is never even called.",
        "`ConcurrentHashMap` forbids `null` keys and values because `get` returning `null` must unambiguously mean 'absent' in a concurrent setting."
      ]
    },
    {
      type: 'theory',
      title: 'Map implementations compared',
      lead: 'Same `Map` interface, different guarantees.',
      table: { head: ['', 'HashMap', 'LinkedHashMap', 'TreeMap', 'ConcurrentHashMap', 'Hashtable'], rows: [
        ['Ordering', 'none', 'insertion / access', 'sorted', 'none', 'none'],
        ['get/put', 'O(1) avg', 'O(1) avg', 'O(log n)', 'O(1) avg', 'O(1) avg'],
        ['null key/value', '1 key / ✅', '1 key / ✅', 'no null key / ✅', '❌ / ❌', '❌ / ❌'],
        ['Thread-safe', '❌', '❌', '❌', '✅ fine-grained', '✅ one lock (legacy)'],
        ['Use it for', 'default choice', 'LRU, stable order', 'ranges, sorted reports', 'shared caches, counters', 'nothing new — legacy']
      ] },
      points: [
        "Java 8 changed HashMap: tree bins for long chains and a faster resize that preserves node order.",
        "For counters shared between threads: `ConcurrentHashMap.merge(key, 1, Integer::sum)` or `LongAdder` values."
      ],
      notes: [
        "Hashtable and `Collections.synchronizedMap` lock the whole map for every call. `ConcurrentHashMap` uses CAS operations and per-bin locking, so many threads can read and write simultaneously — we look at it again in Session 6.",
        "Interview staple: *HashMap vs ConcurrentHashMap vs Hashtable*. Answer with ordering, nulls, thread-safety mechanism and performance."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: transaction analytics + build your own HashMap',
      lead: 'Use streams to analyse transactions, then implement a hash table with separate chaining and resizing.',
      steps: [
        "Create `record Txn(String id, String user, String merchant, double amount, LocalDate date)` and a list of ~15 sample transactions.",
        "With streams: total spend per user (`groupingBy` + `summingDouble`), printed in descending order of spend.",
        "Find the top 2 merchants by revenue, and partition transactions into ≥ ₹1,000 and < ₹1,000.",
        "Detect duplicate transactions (same user, merchant, amount, date) with a `record TxnKey(...)` in a `HashSet` — explain why records make safe keys.",
        "Implement `SimpleHashMap<K,V>` with a `Node[]` table, separate chaining, `put` (insert/update), `get` and `resize()` at load factor 0.75.",
        "Print the bucket layout before and after a resize and confirm `get` still finds every key.",
        "Insert `\"Aa\"` and `\"BB\"` and confirm both are stored and retrievable.",
        "Stretch: add `remove(K)`; time 1,000,000 puts into your map vs `HashMap` with `System.nanoTime()`."
      ],
      code: { lang: 'java', file: 'SimpleHashMap.java', label: 'Reference: SimpleHashMap', src: code`
        public class SimpleHashMap<K, V> {
            private static final class Node<K, V> {
                final int hash; final K key; V value; Node<K, V> next;
                Node(int hash, K key, V value, Node<K, V> next) {
                    this.hash = hash; this.key = key; this.value = value; this.next = next;
                }
            }

            private Node<K, V>[] table;
            private int size;
            private static final float LOAD_FACTOR = 0.75f;

            @SuppressWarnings("unchecked")
            public SimpleHashMap(int capacity) { table = (Node<K, V>[]) new Node[capacity]; }  // power of two

            private static int hash(Object key) { int h = key.hashCode(); return h ^ (h >>> 16); }
            private static int index(int hash, int length) { return hash & (length - 1); }

            public V put(K key, V value) {
                int h = hash(key), i = index(h, table.length);
                for (Node<K, V> n = table[i]; n != null; n = n.next) {
                    if (n.hash == h && n.key.equals(key)) { V old = n.value; n.value = value; return old; }
                }
                table[i] = new Node<>(h, key, value, table[i]);          // insert at head of chain
                if (++size > table.length * LOAD_FACTOR) resize();
                return null;
            }

            public V get(K key) {
                int h = hash(key);
                for (Node<K, V> n = table[index(h, table.length)]; n != null; n = n.next) {
                    if (n.hash == h && n.key.equals(key)) return n.value;
                }
                return null;
            }

            @SuppressWarnings("unchecked")
            private void resize() {
                Node<K, V>[] old = table;
                table = (Node<K, V>[]) new Node[old.length * 2];
                for (Node<K, V> head : old) {
                    for (Node<K, V> n = head; n != null; ) {
                        Node<K, V> next = n.next;
                        int i = index(n.hash, table.length);
                        n.next = table[i];
                        table[i] = n;
                        n = next;
                    }
                }
                System.out.println("resized to " + table.length + " buckets");
            }

            public int size() { return size; }

            public String layout() {
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < table.length; i++) {
                    if (table[i] == null) continue;
                    sb.append('[').append(i).append(']');
                    for (Node<K, V> n = table[i]; n != null; n = n.next) sb.append(" -> ").append(n.key);
                    sb.append("  ");
                }
                return sb.toString().trim();
            }

            public static void main(String[] args) {
                SimpleHashMap<String, Integer> m = new SimpleHashMap<>(4);
                m.put("goa", 3); m.put("agra", 1); m.put("delhi", 2);
                System.out.println(m.layout());
                m.put("pune", 5);                        // size 4 > 4 * 0.75 -> resize
                m.put("goa", 30);                        // update, not insert
                System.out.println(m.layout());
                System.out.println("goa=" + m.get("goa") + " pune=" + m.get("pune")
                        + " kochi=" + m.get("kochi") + " size=" + m.size());
            }
        }`, out: code`
        [0] -> delhi -> agra -> goa
        resized to 8 buckets
        [0] -> goa -> agra -> pune  [4] -> delhi
        goa=30 pune=5 kochi=null size=4` },
      notes: [
        "With only 4 buckets, `goa`, `agra` and `delhi` all land in bucket 0 — a long chain. After resizing to 8 buckets, `delhi` moves to bucket 4 (= 0 + old capacity), exactly the 'stay or move by oldCapacity' rule.",
        "Our resize reverses chain order because we insert at the head; Java 8's HashMap preserves order by splitting each chain into a 'lo' and a 'hi' list. Ask strong students to implement that improvement.",
        "This exercise is a frequent machine-coding interview task. The key insight to articulate: average O(1) depends on a good hash function *and* keeping the load factor bounded by resizing."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: streams & hashing',
      quiz: [
        { q: "Which of these is an *intermediate* (lazy) stream operation?", options: ['collect', 'map', 'forEach', 'count'], answer: 1,
          why: "`map` returns a new stream and does nothing until a terminal operation such as `collect`, `forEach` or `count` runs." },
        { q: "What happens if you call `count()` twice on the same Stream object?", options: ['Returns the same number twice', 'Returns 0 the second time', 'IllegalStateException', 'NullPointerException'], answer: 2,
          why: "A stream can be consumed only once: 'stream has already been operated upon or closed'." },
        { q: "Default initial capacity and load factor of HashMap?", options: ['10 and 0.5', '16 and 0.75', '32 and 1.0', '8 and 0.8'], answer: 1,
          why: "16 buckets, load factor 0.75 → the first resize happens when the 13th entry is added." },
        { q: "Since Java 8, what happens to a bucket that accumulates many colliding keys?", options: ['Keys are rejected', 'The map throws', 'It becomes a red-black tree (when ≥ 8 nodes and capacity ≥ 64)', 'The hash function changes'], answer: 2,
          why: "Treeification bounds lookups in a crowded bucket to O(log n)." },
        { q: "You put an object in a HashSet, then change a field used by its hashCode(). What happens?", options: ['The set rehashes automatically', 'contains() may return false and the element is effectively lost', 'A ConcurrentModificationException', 'Nothing'], answer: 1,
          why: "The element stays in the bucket of its old hash; lookups now search a different bucket. Keys must be immutable." },
        { q: "Which collector counts orders per city?", options: ['partitioningBy(Order::city)', 'groupingBy(Order::city, counting())', 'toMap(Order::city, 1)', 'mapping(Order::city, toList())'], answer: 1,
          why: "`groupingBy(classifier, downstream)` with `counting()` produces a `Map<String, Long>`." }
      ],
      notes: [
        "Q4 and Q5 are high-frequency interview questions; ask students to explain the answer aloud using the bucket diagram.",
        "For Q6, have students write the full pipeline on the board, then change it to *sum of amounts per city* (`summingDouble`) and *list of ids per city* (`mapping(Order::id, toList())`) — the same collector shape with a different downstream."
      ]
    },
    {
      type: 'summary',
      title: 'Session 5 recap',
      points: [
        "Streams = source → lazy intermediate ops → one terminal op; vertical, short-circuiting, single-use.",
        "Collectors: `groupingBy`, `partitioningBy`, `toMap` (with merge!), `joining`, `summarizing*`.",
        "Hashing maps keys to buckets; collisions are normal and resolved by chaining (and tree bins).",
        "HashMap: capacity 16, load factor 0.75, power-of-two table, `(n−1) & spread(hash)`, resize doubles.",
        "Correct keys = consistent `equals` + `hashCode` on immutable data (records are ideal)."
      ],
      cards: [
        ['Lazy evaluation', 'Intermediate operations run only when a terminal operation pulls elements.'],
        ['Short-circuiting', 'findFirst/anyMatch/limit stop processing as soon as the answer is known.'],
        ['groupingBy', 'Collector that groups elements into a Map by a classifier, with an optional downstream collector.'],
        ['Load factor', 'Fill ratio that triggers a resize; 0.75 by default.'],
        ['Separate chaining', 'Each bucket holds a linked list (or tree) of colliding entries.'],
        ['Treeify threshold', '8 nodes in one bucket (with capacity ≥ 64) → red-black tree.'],
        ['Hash spreading', 'h ^ (h >>> 16): mixes high bits into the low bits used for indexing.'],
        ['Hash flooding', 'Attack using many colliding keys to degrade hash-table performance.']
      ],
      notes: [
        "Next session: multithreading — threads, thread pools, synchronization and ExecutorService — plus Maven's POM and build lifecycle, the bridge to Spring Boot."
      ]
    }
  ]
});
