COURSE.session({
  no: 4,
  short: 'Collections, Queues & Generics',
  title: 'Collections Framework, Queues & Generics',
  covers: [4],
  objectives: [
    "Navigate the Collections Framework hierarchy and pick the right List, Set, Map, Queue or Deque.",
    "Use FIFO queues, stacks (`ArrayDeque`) and priority queues (heaps) for real problems.",
    "Write type-safe generic classes and methods, with bounded types and wildcards (PECS).",
    "Order objects with `Comparable`/`Comparator` and avoid classic pitfalls (CME, raw types, missing equals/hashCode)."
  ],
  prereq: "Sessions 1–3, especially `equals`/`hashCode`, interfaces and lambdas.",
  slides: [
    {
      type: 'theory',
      title: 'The Collections Framework at a glance',
      lead: 'A unified set of **interfaces** (what) and **implementations** (how) for storing and processing groups of objects.',
      diagram: { kind: 'tree', root: { t: 'Iterable<E>', tone: 'gray', c: [
        { t: 'Collection<E>', tone: 'purple', c: [
          { t: 'List<E>', s: 'ordered, indexed, duplicates OK', tone: 'blue', c: [{ t: 'ArrayList', tone: 'blue' }, { t: 'LinkedList', tone: 'blue' }] },
          { t: 'Set<E>', s: 'no duplicates', tone: 'green', c: [{ t: 'HashSet', tone: 'green' }, { t: 'LinkedHashSet', tone: 'green' }, { t: 'TreeSet', s: 'sorted', tone: 'green' }] },
          { t: 'Queue<E>', s: 'processing order', tone: 'orange', c: [{ t: 'PriorityQueue', s: 'heap', tone: 'orange' }, { t: 'Deque<E>', s: 'both ends', tone: 'orange', c: [{ t: 'ArrayDeque', tone: 'orange' }, { t: 'LinkedList', tone: 'orange' }] }] }
        ] },
        { t: 'Map<K,V>', s: 'separate hierarchy: key → value', tone: 'red', c: [{ t: 'HashMap', tone: 'red' }, { t: 'LinkedHashMap', tone: 'red' }, { t: 'TreeMap', s: 'sorted', tone: 'red' }, { t: 'ConcurrentHashMap', s: 'thread-safe', tone: 'red' }] }
      ] } },
      points: [
        "Declare variables by **interface**: `List<Order> orders = new ArrayList<>();` — swap implementations freely.",
        "`Map` is *not* a `Collection`, but it offers collection views: `keySet()`, `values()`, `entrySet()`.",
        "Immutable factories: `List.of`, `Set.of`, `Map.of` (Java 9) — no nulls, no modification.",
        "Utility classes: `Collections` (sort, unmodifiable views, `synchronizedList`) and `Arrays`."
      ],
      notes: [
        "Backend code is mostly collection manipulation: a REST endpoint loads a `List` of entities, groups them into a `Map`, de-duplicates with a `Set`, and a background worker drains a `Queue`. Choosing well affects both correctness and performance.",
        "Mention that `ConcurrentHashMap` and the blocking queues live in `java.util.concurrent` — we use them in Session 6.",
        "Ask: why is `Map` separate from `Collection`? Because its elements are *pairs*; `add(E)` makes no sense for a map."
      ]
    },
    {
      type: 'theory',
      title: 'List: ArrayList vs LinkedList',
      lead: '`ArrayList` is a resizable array; `LinkedList` is a doubly-linked list. In practice **ArrayList wins almost always**.',
      table: { head: ['Operation', 'ArrayList', 'LinkedList'], rows: [
        ['`get(i)` / `set(i)`', '**O(1)** — direct index', 'O(n) — walk the nodes'],
        ['`add(e)` at end', 'amortised **O(1)** (grows ~1.5×)', 'O(1)'],
        ['insert/remove in the middle', 'O(n) — shift elements', 'O(n) to find + O(1) to relink'],
        ['Memory per element', 'compact array slot', 'node + 2 pointers (much more)'],
        ['CPU cache friendliness', '✅ contiguous memory', '❌ scattered nodes']
      ] },
      diagram: { kind: 'compare', cols: [
        { t: 'ArrayList', tone: 'green', points: ['Backed by `Object[]`, default capacity 10', 'Grows by ~50% and copies when full', 'Use `new ArrayList<>(expectedSize)` if size is known'] },
        { t: 'LinkedList', tone: 'gray', points: ['Implements both `List` and `Deque`', 'Fast at the ends only if you already hold the node', 'For queues prefer `ArrayDeque`'] }
      ] },
      notes: [
        "Big-O is not the whole story: modern CPUs love contiguous memory, so even 'O(n) shifting' in an ArrayList is often faster than chasing LinkedList pointers. Joshua Bloch, who wrote LinkedList, has joked that he never uses it.",
        "Amortised O(1): most appends are a simple array write; occasionally the array is full and is copied into a 1.5× larger one. Averaged over many appends the cost per append is constant."
      ]
    },
    {
      type: 'practical',
      title: 'Working with Lists (and two classic traps)',
      lead: 'Core List operations, safe removal while iterating, and immutable lists.',
      code: { lang: 'java', file: 'ListDemo.java', src: code`
        import java.util.*;

        public class ListDemo {
            public static void main(String[] args) {
                List<String> cart = new ArrayList<>();
                cart.add("milk"); cart.add("bread"); cart.add("eggs"); cart.add("bread");
                cart.add(1, "butter");                              // insert at index 1
                System.out.println(cart + " size=" + cart.size());
                System.out.println("get(2)=" + cart.get(2) + " indexOf(bread)=" + cart.indexOf("bread")
                        + " contains(jam)=" + cart.contains("jam"));

                cart.set(0, "oat milk");                            // replace
                cart.remove("bread");                               // removes FIRST occurrence
                cart.removeIf(item -> item.startsWith("e"));        // lambda (Session 3)
                System.out.println(cart);

                Collections.sort(cart);
                System.out.println("sorted: " + cart);

                // Trap 1: removing inside for-each -> use Iterator.remove() (or removeIf)
                for (Iterator<String> it = cart.iterator(); it.hasNext(); ) {
                    if (it.next().contains("milk")) it.remove();
                }
                System.out.println("after iterator remove: " + cart);
                try {
                    for (String s : cart) cart.add("jam");          // structural change while iterating
                } catch (ConcurrentModificationException e) {
                    System.out.println("ConcurrentModificationException!");
                }

                // Trap 2: List.of(...) is immutable
                List<String> fixed = List.of("a", "b");
                try { fixed.add("c"); } catch (UnsupportedOperationException e) {
                    System.out.println("List.of is immutable");
                }
            }
        }`, out: code`
        [milk, butter, bread, eggs, bread] size=5
        get(2)=bread indexOf(bread)=2 contains(jam)=false
        [oat milk, butter, bread]
        sorted: [bread, butter, oat milk]
        after iterator remove: [bread, butter]
        ConcurrentModificationException!
        List.of is immutable` },
      notes: [
        "ConcurrentModificationException has nothing to do with threads here: the iterator keeps a `modCount` snapshot and fails fast when the list changes underneath it. That 'fail-fast' behaviour protects you from silently skipping elements.",
        "`remove(Object)` vs `remove(int index)` is a famous trap with `List<Integer>`: `list.remove(1)` removes the element at index 1, `list.remove(Integer.valueOf(1))` removes the value 1.",
        "Returning `List.of(...)` or `List.copyOf(...)` from methods protects internal state — callers cannot modify your object's list."
      ]
    },
    {
      type: 'practical',
      title: 'Sets & Maps in practice',
      lead: 'Sets remove duplicates; Maps associate keys with values. The implementation decides **ordering** and **performance**.',
      code: [
        { lang: 'java', file: 'SetMapDemo.java', src: code`
          import java.util.*;

          public class SetMapDemo {
              public static void main(String[] args) {
                  List<String> visits = List.of("goa", "delhi", "goa", "agra", "delhi", "goa");

                  System.out.println(new HashSet<>(visits));        // unique, order not guaranteed
                  System.out.println(new LinkedHashSet<>(visits));  // unique, insertion order
                  System.out.println(new TreeSet<>(visits));        // unique, sorted

                  Map<String, Integer> freq = new TreeMap<>();
                  for (String city : visits) freq.merge(city, 1, Integer::sum);   // count
                  System.out.println(freq);

                  Map<String, List<String>> byLetter = new TreeMap<>();
                  for (String city : visits) {
                      byLetter.computeIfAbsent(city.substring(0, 1), k -> new ArrayList<>()).add(city);
                  }
                  System.out.println(byLetter);

                  System.out.println(freq.getOrDefault("pune", 0) + " " + freq.containsKey("agra"));
                  for (Map.Entry<String, Integer> e : freq.entrySet()) {
                      if (e.getValue() > 1) System.out.print(e.getKey() + "=" + e.getValue() + " ");
                  }
                  System.out.println();

                  TreeMap<Integer, String> slabs = new TreeMap<>(Map.of(0, "5%", 500_000, "20%", 1_000_000, "30%"));
                  System.out.println("tax slab for 750000: " + slabs.floorEntry(750_000).getValue());
              }
          }`, out: code`
          [goa, agra, delhi]
          [goa, delhi, agra]
          [agra, delhi, goa]
          {agra=1, delhi=2, goa=3}
          {a=[agra], d=[delhi, delhi], g=[goa, goa, goa]}
          0 true
          delhi=2 goa=3
          tax slab for 750000: 20%` },
        { lang: 'java', file: 'LruCache.java', label: 'LRU cache (LinkedHashMap)', src: code`
          import java.util.LinkedHashMap;
          import java.util.Map;

          public class LruCache<K, V> extends LinkedHashMap<K, V> {
              private final int capacity;

              public LruCache(int capacity) {
                  super(16, 0.75f, true);           // accessOrder=true: iteration = least -> most recent
                  this.capacity = capacity;
              }

              @Override
              protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
                  return size() > capacity;          // evict the least-recently-used entry
              }

              public static void main(String[] args) {
                  LruCache<String, String> cache = new LruCache<>(3);
                  cache.put("u1", "Asha"); cache.put("u2", "Bala"); cache.put("u3", "Chen");
                  cache.get("u1");                   // u1 becomes most recently used
                  cache.put("u4", "Dev");            // evicts u2
                  System.out.println(cache.keySet());
              }
          }`, out: code`[u3, u1, u4]` }
      ],
      table: { head: ['', 'Hash*', 'LinkedHash*', 'Tree*'], rows: [
        ['Ordering', 'none', 'insertion (or access)', 'sorted (natural / Comparator)'],
        ['get / put / contains', 'O(1) average', 'O(1) average', 'O(log n)'],
        ['Extra powers', 'fastest', 'LRU caches', '`floor`, `ceiling`, `headMap`, ranges']
      ] },
      notes: [
        "The HashSet printed `[goa, agra, delhi]` — neither insertion nor sorted order. That order comes from hash buckets, and `goa` and `agra` actually land in the *same* bucket. We open up exactly this in Session 5 (HashMap & hashing).",
        "`merge` and `computeIfAbsent` (Java 8) replace the old 'get, check null, put' dance and are the idiomatic way to count and group. Streams' `groupingBy` (Session 5) does the same declaratively.",
        "The LRU cache is a classic interview question; with `LinkedHashMap` it is ten lines. In Session 15 we will see Redis applying the same eviction idea (`allkeys-lru`) at server scale."
      ]
    },
    {
      type: 'theory',
      title: 'Queues, Deques & Priority Queues',
      lead: 'A **Queue** holds elements for processing — usually FIFO. A **Deque** works at both ends (queue *and* stack). A **PriorityQueue** always serves the smallest (or highest-priority) element next.',
      diagram: { kind: 'flow', nodes: [
        { t: 'offer(T4)', s: 'add at tail', tone: 'green' },
        { t: '[T1 | T2 | T3]', s: 'FIFO queue', tone: 'blue' },
        { t: 'poll() → T1', s: 'remove from head', tone: 'orange' }
      ] },
      table: { head: ['', 'Throws exception', 'Returns special value'], rows: [
        ['Insert', '`add(e)`', '`offer(e)` → false'],
        ['Remove head', '`remove()`', '`poll()` → null'],
        ['Examine head', '`element()`', '`peek()` → null']
      ] },
      points: [
        "`ArrayDeque` is the go-to **queue and stack** (faster than `LinkedList`; replaces legacy `Stack`).",
        "`PriorityQueue` is a binary **heap**: `offer`/`poll` O(log n), `peek` O(1); iteration order is *not* sorted.",
        "`BlockingQueue` (`LinkedBlockingQueue`, `ArrayBlockingQueue`) blocks producers/consumers — the basis of thread pools (Session 6) and a mental model for Kafka (Session 20)."
      ],
      notes: [
        "Real-life mapping: a support ticket system is a FIFO queue; browser back/undo is a stack (LIFO); a hospital triage or a job scheduler is a priority queue.",
        "`java.util.Stack` extends `Vector`, whose methods are all `synchronized` — slow and a design mistake kept for compatibility. Use `Deque<T> stack = new ArrayDeque<>()` with `push/pop/peek`.",
        "Neither `ArrayDeque` nor `PriorityQueue` allows `null` elements, because `null` is the special 'empty' return value of `poll()`/`peek()`."
      ]
    },
    {
      type: 'practical',
      title: 'Queues in action: tickets, undo & job scheduling',
      lead: 'FIFO with `ArrayDeque`, LIFO with `push/pop`, and a `PriorityQueue` with a multi-key `Comparator`.',
      code: { lang: 'java', file: 'QueueDemo.java', src: code`
        import java.util.*;

        public class QueueDemo {
            record Task(String name, int priority, int seq) {}

            public static void main(String[] args) {
                Queue<String> tickets = new ArrayDeque<>();                 // FIFO queue
                tickets.offer("T1"); tickets.offer("T2"); tickets.offer("T3");
                System.out.println("serving " + tickets.poll() + ", next " + tickets.peek() + ", waiting " + tickets);

                Deque<String> undo = new ArrayDeque<>();                    // LIFO stack
                undo.push("type 'Hello'"); undo.push("bold"); undo.push("delete line");
                System.out.println("undo -> " + undo.pop() + " | then " + undo.peek());

                Comparator<Task> byPriority = Comparator.comparingInt(Task::priority).reversed()
                        .thenComparingInt(Task::seq);                       // high priority first, then FIFO
                PriorityQueue<Task> jobs = new PriorityQueue<>(byPriority);
                jobs.add(new Task("send-email", 1, 1));
                jobs.add(new Task("charge-card", 5, 2));
                jobs.add(new Task("gen-invoice", 3, 3));
                jobs.add(new Task("refund", 5, 4));
                StringBuilder order = new StringBuilder();
                while (!jobs.isEmpty()) order.append(jobs.poll().name()).append(' ');
                System.out.println("processing order: " + order.toString().trim());

                // Top-3 largest using a min-heap of size 3 -> O(n log k)
                int[] amounts = {420, 99, 1500, 730, 250, 980};
                PriorityQueue<Integer> top = new PriorityQueue<>();
                for (int a : amounts) { top.offer(a); if (top.size() > 3) top.poll(); }
                List<Integer> top3 = new ArrayList<>(top);
                top3.sort(Comparator.reverseOrder());
                System.out.println("top 3: " + top3);

                System.out.println(tickets.poll() + " " + tickets.poll() + " " + tickets.poll()); // null when empty
            }
        }`, out: code`
        serving T1, next T2, waiting [T2, T3]
        undo -> delete line | then bold
        processing order: charge-card refund gen-invoice send-email
        top 3: [1500, 980, 730]
        T2 T3 null` },
      notes: [
        "The `seq` tie-breaker matters: without it, two tasks with priority 5 could come out in any order, because heaps are not *stable*. Production schedulers always add a sequence number or timestamp.",
        "The top-K trick (keep a min-heap of size K, drop the smallest) is a standard interview pattern: 'top 10 trending hashtags', 'K most expensive orders'. It uses O(K) memory instead of sorting everything.",
        "In Session 13 we will use **two priority queues** to simplify debts in the Splitwise project — the largest creditor settles with the largest debtor first."
      ]
    },
    {
      type: 'theory',
      title: 'Generics: type safety without casts',
      lead: 'Generics let classes and methods work with **any type** while the compiler still checks types — errors move from runtime to compile time.',
      points: [
        "Generic class: `class Box<T> { T value; }` · generic method: `static <T> T first(List<T> xs)`.",
        "**Bounded** type: `<T extends Comparable<T>>` — T must support `compareTo`.",
        "**Wildcards:** `List<? extends Number>` (read-only producer), `List<? super Integer>` (writable consumer).",
        "**PECS:** *Producer Extends, Consumer Super* — e.g. `Collections.copy(List<? super T> dest, List<? extends T> src)`.",
        "**Type erasure:** generic types exist at compile time only; at runtime `List<String>` is just `List`.",
        "Generics are **invariant**: a `List<String>` is *not* a `List<Object>`."
      ],
      code: { lang: 'java', label: 'Before vs after generics', verify: false, src: code`
        // Java 1.4: raw collections, casts everywhere, errors at runtime
        List names = new ArrayList();
        names.add("asha");
        names.add(42);                          // compiles!
        String n = (String) names.get(1);       // ClassCastException at runtime

        // Java 5+: the compiler enforces the element type
        List<String> safe = new ArrayList<>();  // <> = diamond operator (Java 7)
        safe.add("asha");
        // safe.add(42);                        // compile error
        String m = safe.get(0);                 // no cast needed` },
      notes: [
        "Type erasure explains several restrictions: you cannot write `new T()`, `T[]` creation, `instanceof List<String>`, or overload `m(List<String>)` with `m(List<Integer>)` — both erase to `m(List)`.",
        "Primitives are not allowed as type arguments (`List<int>` is illegal), so Java autoboxes `int` to `Integer`. Beware of `==` on boxed integers outside the cached range −128..127.",
        "Spring Data's `JpaRepository<User, Long>` (Session 11) is a generic interface — understanding `<T, ID>` today makes that code obvious later."
      ]
    },
    {
      type: 'practical',
      title: 'Generic classes, bounded methods & wildcards',
      lead: 'A reusable `Page<T>`, a bounded `maxOf`, PECS in practice — and why raw types are dangerous.',
      code: { lang: 'java', file: 'GenericsDemo.java', src: code`
        import java.util.*;
        import java.util.function.Function;

        public class GenericsDemo {

            // Generic record: one page of results (we return this from REST APIs later)
            record Page<T>(List<T> items, int page, int totalPages) {
                <R> Page<R> map(Function<? super T, ? extends R> fn) {
                    return new Page<>(items.stream().<R>map(fn).toList(), page, totalPages);
                }
            }

            // Bounded type parameter
            static <T extends Comparable<? super T>> T maxOf(List<? extends T> list) {
                T best = list.get(0);
                for (T t : list) if (t.compareTo(best) > 0) best = t;
                return best;
            }

            // Producer: we only READ Numbers -> ? extends
            static double sum(Collection<? extends Number> nums) {
                double s = 0;
                for (Number n : nums) s += n.doubleValue();
                return s;
            }

            // Consumer: we only WRITE Integers -> ? super
            static void addDefaults(List<? super Integer> target) {
                target.add(0);
                target.add(100);
            }

            @SuppressWarnings({"rawtypes", "unchecked"})
            public static void main(String[] args) {
                Page<String> names = new Page<>(List.of("asha", "bala"), 1, 5);
                Page<Integer> lengths = names.map(String::length);
                System.out.println(names + " -> " + lengths);

                System.out.println(maxOf(List.of(3, 17, 8)) + " " + maxOf(List.of("kiwi", "apple", "mango")));
                System.out.println(sum(List.of(1, 2.5, 3L)));

                List<Number> numbers = new ArrayList<>();
                addDefaults(numbers);                      // a List<Number> accepts Integers
                System.out.println(numbers);

                List raw = new ArrayList();                // raw type: compiles...
                raw.add("oops");
                try {
                    List<Integer> ints = raw;              // unchecked assignment
                    int first = ints.get(0);               // ...fails at runtime
                    System.out.println(first);
                } catch (ClassCastException e) {
                    System.out.println("ClassCastException: never use raw types");
                }
            }
        }`, out: code`
        Page[items=[asha, bala], page=1, totalPages=5] -> Page[items=[4, 4], page=1, totalPages=5]
        17 mango
        6.5
        [0, 100]
        ClassCastException: never use raw types` },
      notes: [
        "`Page<T>.map` shows a generic method inside a generic type: it converts a `Page<String>` into a `Page<Integer>` without casts. Spring Data's `Page<T>` has exactly this method, used to turn entities into DTOs.",
        "Why `Comparable<? super T>` in `maxOf`? So that a subclass whose comparison is inherited from its parent still qualifies — the same signature the JDK uses for `Collections.max`.",
        "Try changing `addDefaults(List<? super Integer>)` to `List<? extends Number>`: the `add` calls stop compiling, because the compiler cannot know which subtype of Number the list really holds."
      ]
    },
    {
      type: 'practical',
      title: 'Ordering & identity: Comparable, Comparator, equals/hashCode',
      lead: '**Comparable** defines a type\'s natural order; **Comparator** defines any other order. Hash-based collections need `equals` **and** `hashCode`.',
      code: { lang: 'java', file: 'CompareDemo.java', src: code`
        import java.util.*;

        public class CompareDemo {

            static class PlainUser {                       // no equals/hashCode!
                final String email;
                PlainUser(String email) { this.email = email; }
            }

            record User(String email, String name, int age) implements Comparable<User> {
                public int compareTo(User o) { return email.compareTo(o.email); }   // natural order
            }

            public static void main(String[] args) {
                Set<PlainUser> plain = new HashSet<>();
                plain.add(new PlainUser("a@x.com"));
                plain.add(new PlainUser("a@x.com"));
                System.out.println("PlainUser set size: " + plain.size());

                Set<User> users = new HashSet<>();
                users.add(new User("a@x.com", "Asha", 31));
                users.add(new User("a@x.com", "Asha", 31));
                System.out.println("User record set size: " + users.size());

                List<User> list = new ArrayList<>(List.of(new User("c@x.com", "Chen", 25),
                        new User("a@x.com", "Asha", 31), new User("b@x.com", "Bala", 25)));
                Collections.sort(list);                                        // natural: by email
                System.out.println(list.stream().map(User::name).toList());

                list.sort(Comparator.comparingInt(User::age).thenComparing(User::name));
                System.out.println(list.stream().map(u -> u.name() + "(" + u.age() + ")").toList());

                TreeSet<User> byName = new TreeSet<>(Comparator.comparing(User::name));
                byName.addAll(list);
                System.out.println("first by name: " + byName.first().name() + ", last: " + byName.last().name());
            }
        }`, out: code`
        PlainUser set size: 2
        User record set size: 1
        [Asha, Bala, Chen]
        [Bala(25), Chen(25), Asha(31)]
        first by name: Asha, last: Chen` },
      callout: { kind: 'pitfall', text: "A `TreeSet`/`TreeMap` uses `compareTo`/`compare` — **not** `equals` — to detect duplicates. A comparator that returns 0 for two different users (e.g. comparing only age) silently drops one of them." },
      notes: [
        "Without `equals`/`hashCode`, `PlainUser` inherits identity semantics from `Object`, so two users with the same email are 'different'. Records generate both methods from all components.",
        "Keep `compareTo` consistent with `equals` when you can; when you cannot (as with `byName` here), remember that sorted collections use the comparator for equality.",
        "Use `Comparator.comparing(...).thenComparing(...).reversed()` instead of hand-written subtraction (`a.age - b.age`), which can overflow for large values."
      ]
    },
    {
      type: 'theory',
      title: 'Choosing the right collection',
      lead: 'Start from the question your code asks most often.',
      table: { head: ['If you need…', 'Use', 'Why'], rows: [
        ['an ordered list, index access', '`ArrayList`', 'fast random access, compact'],
        ['uniqueness, fast lookup', '`HashSet`', 'O(1) contains'],
        ['uniqueness + sorted / ranges', '`TreeSet`', 'O(log n), `ceiling`, `subSet`'],
        ['key → value lookup', '`HashMap`', 'O(1) get/put'],
        ['predictable iteration order', '`LinkedHashMap` / `LinkedHashSet`', 'insertion (or access) order'],
        ['sorted keys, range queries', '`TreeMap`', 'red-black tree'],
        ['FIFO queue or stack', '`ArrayDeque`', 'fast at both ends'],
        ['always the min/max next', '`PriorityQueue`', 'binary heap'],
        ['shared between threads', '`ConcurrentHashMap`, `BlockingQueue`', 'thread-safe (Session 6)']
      ] },
      callout: { kind: 'interview', text: "*How would you remove duplicates from a list but keep the original order?* → `new ArrayList<>(new LinkedHashSet<>(list))` — or `list.stream().distinct().toList()` (Session 5)." },
      notes: [
        "Encourage students to justify every collection choice in code reviews with one of these reasons. 'I always use ArrayList and HashMap' is fine as a default, but they should know when to switch.",
        "Also mention capacity hints: `new HashMap<>(expected)` doesn't size the map for `expected` entries without resizing because of the load factor; Java 19 added `HashMap.newHashMap(expected)` for exactly that."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: a generic repository for a library system',
      lead: 'Build a mini version of Spring Data\'s `CrudRepository<T, ID>` and use every collection type from today.',
      steps: [
        "Create `interface Identifiable<ID> { ID id(); }` and a generic `InMemoryRepository<T extends Identifiable<ID>, ID>` backed by a `LinkedHashMap`.",
        "Implement `save`, `findById` (returning `Optional<T>`), `findAll(Predicate<? super T>)`, `deleteById` and `count`.",
        "Model `record Book(String id, String title, String genre) implements Identifiable<String>` and store a few books — no casts anywhere.",
        "Keep a waitlist per book with `Map<String, Deque<String>>`, using `computeIfAbsent` + `offer`/`poll` (FIFO).",
        "Record actions in an `ArrayDeque` used as an undo **stack** (`push`/`pop`).",
        "Count books per genre with `TreeMap.merge` and print it sorted.",
        "Track loans in a `PriorityQueue<Loan>` ordered by due date and print the two most overdue loans.",
        "Stretch: add `findAll(Predicate, Comparator)` that returns sorted results; make the store thread-safe with `ConcurrentHashMap`."
      ],
      code: { lang: 'java', file: 'LibraryLab.java', label: 'Reference solution (core)', src: code`
        import java.util.*;
        import java.util.function.Predicate;

        interface Identifiable<ID> { ID id(); }

        class InMemoryRepository<T extends Identifiable<ID>, ID> {   // like Spring Data's CrudRepository<T, ID>
            private final Map<ID, T> store = new LinkedHashMap<>();
            T save(T entity) { store.put(entity.id(), entity); return entity; }
            Optional<T> findById(ID id) { return Optional.ofNullable(store.get(id)); }
            List<T> findAll(Predicate<? super T> filter) { return store.values().stream().filter(filter).toList(); }
            boolean deleteById(ID id) { return store.remove(id) != null; }
            int count() { return store.size(); }
        }

        record Book(String id, String title, String genre) implements Identifiable<String> {}

        public class LibraryLab {
            public static void main(String[] args) {
                InMemoryRepository<Book, String> books = new InMemoryRepository<>();
                books.save(new Book("B1", "Clean Code", "tech"));
                books.save(new Book("B2", "Sapiens", "history"));
                books.save(new Book("B3", "Effective Java", "tech"));

                Map<String, Deque<String>> waitlist = new HashMap<>();
                waitlist.computeIfAbsent("B1", k -> new ArrayDeque<>()).offer("asha");
                waitlist.computeIfAbsent("B1", k -> new ArrayDeque<>()).offer("bala");

                Deque<String> history = new ArrayDeque<>();
                history.push("issue B1 -> ravi");
                history.push("issue B3 -> meera");

                Map<String, Integer> genreCount = new TreeMap<>();
                books.findAll(b -> true).forEach(b -> genreCount.merge(b.genre(), 1, Integer::sum));

                System.out.println("tech books: " + books.findAll(b -> b.genre().equals("tech"))
                        .stream().map(Book::title).toList());
                System.out.println("genres: " + genreCount);
                System.out.println("next for B1: " + waitlist.get("B1").poll() + ", then " + waitlist.get("B1").peek());
                System.out.println("undo: " + history.pop());
                System.out.println("find B9: " + books.findById("B9").map(Book::title).orElse("not found"));
                System.out.println("deleted B2? " + books.deleteById("B2") + ", count=" + books.count());
            }
        }`, out: code`
        tech books: [Clean Code, Effective Java]
        genres: {history=1, tech=2}
        next for B1: asha, then bala
        undo: issue B3 -> meera
        find B9: not found
        deleted B2? true, count=2` },
      notes: [
        "The repository signature `InMemoryRepository<T extends Identifiable<ID>, ID>` is the hardest part for beginners; draw how `Book` binds `T` and `String` binds `ID`.",
        "`Optional` makes 'not found' explicit instead of returning `null` — Spring Data's `findById` returns `Optional<T>` for the same reason. We will use `.orElseThrow(() -> new NotFoundException(...))` in REST services."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: collections & generics',
      quiz: [
        { q: "Which List implementation is the best default for index access and appends?", options: ['LinkedList', 'ArrayList', 'Vector', 'Stack'], answer: 1,
          why: "`ArrayList` gives O(1) index access and amortised O(1) appends with compact, cache-friendly memory." },
        { q: "You need a map whose keys are always sorted and that supports range queries. Choose:", options: ['HashMap', 'LinkedHashMap', 'TreeMap', 'ConcurrentHashMap'], answer: 2,
          why: "`TreeMap` is a red-black tree: sorted keys plus `floorKey`, `ceilingEntry`, `headMap`, `subMap`…" },
        { q: "What should you use for a stack in modern Java?", options: ['java.util.Stack', 'ArrayDeque with push/pop', 'PriorityQueue', 'TreeSet'], answer: 1,
          why: "`Stack` extends the synchronized legacy `Vector`. `ArrayDeque` is faster and implements the `Deque` stack operations." },
        { q: "Does `List<Object> objs = new ArrayList<String>();` compile?", options: ['Yes', 'No — generics are invariant', 'Only with a cast', 'Only in Java 21'], answer: 1,
          why: "A `List<String>` is not a `List<Object>` — otherwise you could add an Integer to a list of Strings. Use `List<? extends Object>` to read." },
        { q: "A method only *reads* numbers from a list. The most flexible parameter type is:", options: ['List<Number>', 'List<? super Number>', 'List<? extends Number>', 'List<Object>'], answer: 2,
          why: "PECS — Producer Extends: `List<? extends Number>` accepts `List<Integer>`, `List<Double>`, … for reading." }
      ],
      notes: [
        "If time permits, ask students to explain the `[goa, agra, delhi]` HashSet order — it's the perfect teaser for the next session on hashing."
      ]
    },
    {
      type: 'summary',
      title: 'Session 4 recap',
      points: [
        "Program to interfaces (`List`, `Set`, `Map`, `Queue`, `Deque`); choose implementations by access pattern.",
        "`ArrayList` > `LinkedList` in practice; `ArrayDeque` for queues and stacks; `PriorityQueue` = heap.",
        "Hash* = fast & unordered, LinkedHash* = insertion order, Tree* = sorted with ranges.",
        "Generics give compile-time type safety; remember bounds, wildcards (PECS), erasure and invariance.",
        "Comparable = natural order, Comparator = custom order; hash collections need `equals` + `hashCode`."
      ],
      cards: [
        ['Fail-fast iterator', 'Throws ConcurrentModificationException if the collection changes structurally during iteration.'],
        ['ArrayDeque', 'Resizable array deque — the preferred queue and stack implementation.'],
        ['PriorityQueue', 'Binary heap: O(log n) offer/poll, always yields the smallest element first.'],
        ['PECS', 'Producer Extends, Consumer Super — choosing wildcard bounds.'],
        ['Type erasure', 'Generic type info is removed after compilation; List<String> becomes List at runtime.'],
        ['Invariance', 'List<String> is not a subtype of List<Object>.'],
        ['LinkedHashMap accessOrder', 'Iteration follows access recency — the basis of an LRU cache.'],
        ['computeIfAbsent', 'Gets a value or creates and stores it — idiomatic grouping.']
      ],
      notes: [
        "Next session: Streams API for declarative data processing, and a deep dive into HashMap internals and hashing algorithms."
      ]
    }
  ]
});
