/* Interview pack — Session 4: Collections, queues & generics */
COURSE.prep(4, {
  deepDives: [
    {
      title: 'Deep dive: generics after compilation — erasure, heap pollution & PECS',
      lead: 'Generics exist only at compile time. Knowing what survives into the bytecode explains every *why can\'t I…?* question about them.',
      points: [
        "**Type erasure**: `List<String>` and `List<Integer>` are the same class at run time; `javac` checks the types and inserts casts. So there is no `new T[]`, no `instanceof List<String>`, no overloading `f(List<String>)` with `f(List<Integer>)` (same erasure), and one static field shared by every parameterisation.",
        "**Bridge methods**: implementing `Comparable<Money>` with `compareTo(Money)` makes `javac` generate a synthetic `compareTo(Object)` that casts and delegates — the extra frame you sometimes see in stack traces.",
        "**Heap pollution**: a raw type or unchecked cast lets an `Integer` into a `List<String>`. Nothing fails at the write; the `ClassCastException` appears later at an invisible compiler-inserted cast, far from the bug. Generic varargs create such arrays too — hence `@SafeVarargs`.",
        "**PECS** — *Producer `extends`, Consumer `super`*: read from `List<? extends T>`, write into `List<? super T>`. `Collections.copy(List<? super T> dest, List<? extends T> src)` and `sort(List<T>, Comparator<? super T>)` are the canonical examples.",
        "Arrays are **covariant** and checked at run time (`ArrayStoreException`); generics are **invariant** and checked at compile time — which is why generic arrays are awkward.",
        "**Type tokens** recover erased information: pass `Class<T>` (`findAll(Book.class)`), or use a *super-type token* such as Jackson's `TypeReference<List<Book>>` — an anonymous subclass whose generic superclass is recorded in the class file."
      ],
      code: { lang: 'java', file: 'Erasure.java', src: code`
        import java.util.*;

        public class Erasure {
            @SuppressWarnings({"unchecked", "rawtypes"})
            public static void main(String[] args) {
                List<String> strings = new ArrayList<>();
                List<Integer> ints = new ArrayList<>();
                System.out.println("same class at run time: " + (strings.getClass() == ints.getClass()));

                List raw = strings;                 // raw type: the compiler can no longer help
                raw.add(42);                        // heap pollution - no error here
                System.out.println("size: " + strings.size());
                try {
                    String s = strings.get(0);      // the compiler-inserted cast fails HERE
                } catch (ClassCastException e) {
                    System.out.println("ClassCastException at the read, not at the write");
                }

                Object[] objs = new String[1];      // arrays are covariant and checked at run time
                try {
                    objs[0] = 1;
                } catch (ArrayStoreException e) {
                    System.out.println("ArrayStoreException: " + e.getMessage());
                }
            }
        }`, out: code`
        same class at run time: true
        size: 1
        ClassCastException at the read, not at the write
        ArrayStoreException: java.lang.Integer` },
      callout: { kind: 'interview', text: "A crisp way to remember PECS: *if you only take things out, it's a producer — `? extends T`; if you only put things in, it's a consumer — `? super T`; if you do both, use exactly `T`.* Then name a JDK signature that shows it." },
      notes: [
        "The demo shows why raw types are dangerous: the bad write succeeds silently and the failure surfaces at a read, possibly in a different class, thread or request. Treat `unchecked` warnings as bugs unless you can prove the cast safe — and then suppress them on the smallest possible scope.",
        "Why can't you write `new T[n]`? The array needs a run-time component type, and `T` has been erased. Workarounds: pass an `IntFunction<T[]>` (`list.toArray(String[]::new)`), pass a `Class<T>` and use `Array.newInstance`, or store an `Object[]` internally and cast on the way out, as `ArrayList` does.",
        "Spring uses type tokens widely: `ParameterizedTypeReference<List<Book>>` for `RestClient` responses works exactly like Jackson's `TypeReference`. Today's interview questions include a minimal implementation."
      ]
    },
    {
      title: 'Deep dive: collection internals interviewers ask about',
      lead: 'Growth strategies, memory layout and iterator semantics — the details behind *which collection would you use and why?*',
      table: { head: ['Operation', '`ArrayList`', '`LinkedList`', '`ArrayDeque`', '`PriorityQueue`', '`TreeMap`'], rows: [
        ['Add at end / offer', 'O(1) amortised', 'O(1)', 'O(1) amortised', 'O(log n)', 'O(log n) put'],
        ['Remove at front', 'O(n) shift', 'O(1)', 'O(1)', 'O(log n) poll', 'O(log n) pollFirst'],
        ['Get by index / min', 'O(1)', 'O(n) walk', '— / O(1) peek', 'O(1) peek', 'O(log n) firstKey'],
        ['Contains / remove(Object)', 'O(n)', 'O(n)', 'O(n)', 'O(n)', 'O(log n)'],
        ['Memory per element', '~4 B reference', '~24 B node + reference', '~4 B reference', '~4 B reference', '~40 B entry']
      ] },
      points: [
        "`ArrayList` grows by about **1.5×** (`old + (old >> 1)`) and copies its array, so appends are amortised O(1). Inserting at index 0 is an O(n) shift, but `System.arraycopy` is fast.",
        "`LinkedList` is rarely faster: every node is a separate object scattered across the heap, so iteration chases pointers and misses caches, and even a *middle insert* must first walk to the position.",
        "`ArrayDeque` is a circular array with head and tail indices: O(1) at both ends with no per-element allocation — the right choice for stacks and queues.",
        "`PriorityQueue` is a binary heap stored in an array: `offer`/`poll` sift up or down in O(log n), but iteration and `toString` show **heap order**, not sorted order.",
        "Fail-fast iterators compare `modCount` with the value they captured and throw `ConcurrentModificationException` after a structural change — a best-effort bug detector, not a thread-safety mechanism.",
        "Concurrent alternatives: `CopyOnWriteArrayList` (snapshot iterators, O(n) writes — listeners and rarely-changing configuration), `ConcurrentLinkedQueue` (lock-free), `ArrayBlockingQueue`/`LinkedBlockingQueue` (producer–consumer with backpressure)."
      ],
      code: { lang: 'java', file: 'PqAndCme.java', src: code`
        import java.util.*;

        public class PqAndCme {
            public static void main(String[] args) {
                PriorityQueue<Integer> pq = new PriorityQueue<>(List.of(5, 1, 4, 2, 3));
                System.out.println("toString (heap array order): " + pq);
                List<Integer> polled = new ArrayList<>();
                while (!pq.isEmpty()) polled.add(pq.poll());
                System.out.println("poll order (sorted):         " + polled);

                List<Integer> nums = new ArrayList<>(List.of(1, 2, 3, 4));
                try {
                    for (Integer n : nums) if (n % 2 == 0) nums.remove(n);   // structural change while iterating
                } catch (ConcurrentModificationException e) {
                    System.out.println("for-each + remove -> ConcurrentModificationException");
                }
                nums.removeIf(n -> n % 2 == 0);                              // the right way
                System.out.println("removeIf -> " + nums);
            }
        }`, out: code`
        toString (heap array order): [1, 2, 4, 5, 3]
        poll order (sorted):         [1, 2, 3, 4, 5]
        for-each + remove -> ConcurrentModificationException
        removeIf -> [1, 3]` },
      notes: [
        "Read the heap array `[1, 2, 4, 5, 3]` as a tree: index 0 is the root, the children of index i are at 2i + 1 and 2i + 2. Each parent is smaller than its children — that is the only guarantee — so only repeated `poll()` produces sorted output.",
        "In the CME example the first removal succeeds; the exception is thrown by the iterator's *next* call, which notices that `modCount` changed. Note that removing the second-to-last element would not throw at all (the loop simply ends early) — one reason the behaviour is called best-effort.",
        "Memory numbers assume a 64-bit JVM with compressed references. They explain why `ArrayList` plus occasional `sort` usually beats `TreeMap` or `LinkedList` for read-heavy workloads: contiguous arrays are what CPUs are fastest at."
      ]
    }
  ],

  stretch: [
    "Add a *cheapest available copy* query to the generic repository using an indexed min-heap that supports `decreaseKey` in O(log n); verify it against a brute-force scan with randomized tests.",
    "Implement the external merge sort from today's follow-up: sort a 1 GB file of integers with `-Xmx64m` by writing sorted runs and k-way merging them with a heap.",
    "Write a `TopK<T>` collector (`Collector<T, ?, List<T>>`) backed by a size-k min-heap and compare it with `sorted().limit(k)` on 10⁷ elements."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: merge k sorted lists (and make it generic)',
      lead: 'A heap problem that every big-tech interviewer knows — the bar is the O(N log k) solution plus a clean generalisation to lazy, generic iterators.',
      difficulty: 'Hard', minutes: 40, lc: 23, pattern: ['heap', 'linked-list'],
      problem: [
        "You are given an array of `k` linked lists, each sorted in ascending order. Merge them into one sorted linked list and return its head.",
        "Then generalise: write `merge(List<Iterator<T>>, Comparator<? super T>)` that lazily merges any number of sorted iterators of any element type, without materialising the inputs."
      ],
      examples: [
        { in: 'lists = [[1,4,5],[1,3,4],[2,6]]', out: '[1,1,2,3,4,4,5,6]' },
        { in: 'lists = []', out: '[]' },
        { in: 'lists = [[]]', out: '[]' }
      ],
      constraints: ["`0 ≤ k ≤ 10⁴`, `0 ≤ lists[i].length ≤ 500`", "`-10⁴ ≤ lists[i][j] ≤ 10⁴`, each list sorted ascending", "The total number of nodes is at most `10⁴`"],
      hints: [
        "Merging two sorted lists is easy. Why does merging them one after another (k − 1 merges) cost O(k · N)?",
        "At every step you need the smallest current head among k lists. Which structure gives the minimum of k items in O(log k) per step?",
        "Keep a min-heap of the current head of each non-empty list. Poll the smallest, append it, and push the next node **from the same list**."
      ],
      approaches: [
        { name: 'Concatenate + sort', idea: 'Collect every value, sort, rebuild the list', time: 'O(N log N)', space: 'O(N)' },
        { name: 'Merge one by one', idea: 'Fold the lists into an accumulator with the two-list merge', time: 'O(k · N)', space: 'O(1)' },
        { name: 'Divide and conquer', idea: 'Merge pairs, then pairs of pairs — log k rounds of linear merges', time: 'O(N log k)', space: 'O(1) iterative' },
        { name: 'Min-heap of heads', idea: 'Heap holds one current node per list; poll, append, refill from that list', time: 'O(N log k)', space: 'O(k)' }
      ],
      code: { lang: 'java', file: 'MergeK.java', src: code`
        import java.util.*;

        public class MergeK {
            static final class ListNode {
                int val;
                ListNode next;
                ListNode(int val, ListNode next) { this.val = val; this.next = next; }
            }

            // LeetCode 23: reuse the nodes, O(N log k) time, O(k) heap
            static ListNode mergeKLists(ListNode[] lists) {
                PriorityQueue<ListNode> heap = new PriorityQueue<>(Comparator.comparingInt(n -> n.val));
                for (ListNode n : lists) if (n != null) heap.offer(n);        // skip empty lists
                ListNode dummy = new ListNode(0, null), tail = dummy;
                while (!heap.isEmpty()) {
                    ListNode n = heap.poll();
                    tail = tail.next = n;
                    if (n.next != null) heap.offer(n.next);                   // refill from the same list
                }
                return dummy.next;
            }

            /** Lazy, generic, stable: ties are broken by source index. */
            static <T> Iterator<T> merge(List<? extends Iterator<? extends T>> sources, Comparator<? super T> cmp) {
                record Head<E>(E value, int src) {}
                PriorityQueue<Head<T>> heap = new PriorityQueue<>((a, b) -> {
                    int c = cmp.compare(a.value(), b.value());
                    return c != 0 ? c : Integer.compare(a.src(), b.src());
                });
                for (int i = 0; i < sources.size(); i++) {
                    Iterator<? extends T> it = sources.get(i);
                    if (it.hasNext()) heap.offer(new Head<>(it.next(), i));
                }
                return new Iterator<T>() {
                    public boolean hasNext() { return !heap.isEmpty(); }
                    public T next() {
                        Head<T> h = heap.poll();
                        if (h == null) throw new NoSuchElementException();
                        Iterator<? extends T> it = sources.get(h.src());
                        if (it.hasNext()) heap.offer(new Head<>(it.next(), h.src()));
                        return h.value();
                    }
                };
            }

            static ListNode build(int... xs) {
                ListNode head = null;
                for (int i = xs.length - 1; i >= 0; i--) head = new ListNode(xs[i], head);
                return head;
            }

            static List<Integer> toList(ListNode n) {
                List<Integer> out = new ArrayList<>();
                for (; n != null; n = n.next) out.add(n.val);
                return out;
            }

            public static void main(String[] args) {
                System.out.println(toList(mergeKLists(new ListNode[] { build(1, 4, 5), build(1, 3, 4), build(2, 6) })));
                System.out.println(toList(mergeKLists(new ListNode[0])) + " " + toList(mergeKLists(new ListNode[] { null })));

                List<String> words = new ArrayList<>();
                merge(List.of(List.of("apple", "kiwi").iterator(), List.of("banana", "cherry", "plum").iterator(),
                        List.<String>of().iterator()), Comparator.<String>naturalOrder()).forEachRemaining(words::add);
                System.out.println(words);

                Random rnd = new Random(23);
                for (int t = 0; t < 1_000; t++) {                            // differential test
                    List<List<Integer>> src = new ArrayList<>();
                    List<Integer> expected = new ArrayList<>();
                    for (int i = rnd.nextInt(8); i > 0; i--) {
                        List<Integer> l = new ArrayList<>();
                        for (int j = rnd.nextInt(10); j > 0; j--) l.add(rnd.nextInt(50));
                        Collections.sort(l);
                        src.add(l);
                        expected.addAll(l);
                    }
                    Collections.sort(expected);
                    List<Integer> got = new ArrayList<>();
                    merge(src.stream().map(List::iterator).toList(), Comparator.<Integer>naturalOrder()).forEachRemaining(got::add);
                    if (!got.equals(expected)) throw new AssertionError(src);
                }
                System.out.println("1000 random merges match concatenate-and-sort");
            }
        }`, out: code`
        [1, 1, 2, 3, 4, 4, 5, 6]
        [] []
        [apple, banana, cherry, kiwi, plum]
        1000 random merges match concatenate-and-sort` },
      pitfalls: [
        "A comparator written as `(a, b) -> a.val - b.val` overflows for extreme values; use `Comparator.comparingInt` or `Integer.compare`.",
        "Offering `null` heads (empty lists) into the heap — the comparator throws `NullPointerException`.",
        "Refilling from the wrong list, or forgetting to refill at all.",
        "Instability: equal values from different lists may come out in any order. Break ties by list index when order matters, e.g. merging log files by timestamp."
      ],
      followUps: [
        { q: "The k inputs are sorted files far larger than memory.",
          a: "This is the merge phase of an **external merge sort**: a heap of (current record, file index) over buffered readers. Read in large blocks so the disk access stays sequential, and buffer the output. If k is too large for one buffer per file, merge in several passes. Databases sorting big result sets and log-structured storage engines compacting files use the same algorithm." },
        { q: "Merge k sorted event streams arriving live from k services.",
          a: "You may only emit an element once every stream has produced something at least as large — otherwise a slow stream could still deliver a smaller value. Each stream therefore needs a **watermark** (a heartbeat saying *nothing older than t will come*). Emit from the heap only below the minimum watermark. This is the heart of event-time processing in stream processors such as Kafka Streams or Flink." },
        { q: "When does divide and conquer beat the heap in practice?",
          a: "Both are O(N log k). Pairwise merging has better cache behaviour, no per-element heap operations and parallelises naturally (merge pairs on different threads). The heap wins when inputs are lazy or streaming, because it never needs a whole list in memory." }
      ],
      rubric: [
        "States the O(N log k) target and explains why the naive approaches are slower.",
        "Uses the heap correctly: safe comparator, null handling, refill from the polled list.",
        "Raises stability and tie-breaking unprompted.",
        "Generalises with PECS-correct signatures (`Comparator<? super T>`) and lazy iteration.",
        "Connects the problem to external sorting or streaming in the follow-ups."
      ],
      notes: [
        "The generic version compiles because of PECS: the sources produce `T` (`Iterator<? extends T>`) and the comparator consumes `T` (`Comparator<? super T>`), so a `Comparator<Object>` or `Comparator<Number>` would work for `Integer` inputs too.",
        "The local record `Head<E>` declares its own type parameter because local records are implicitly static and cannot use the enclosing method's `T` directly.",
        "Practise saying the complexity argument out loud: N elements each go through one `offer` and one `poll` on a heap that never holds more than k items, hence O(N log k)."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: collections & generics',
      lead: 'Questions that test whether you know the trade-offs behind the APIs you use every day.',
      qa: [
        { level: 1, q: "`ArrayList` or `LinkedList` — which is faster for inserting into the middle of a large list?",
          a: "Usually `ArrayList`, which surprises people. Both must first **find** the position: `LinkedList` walks node by node (O(n) pointer chasing with cache misses), while `ArrayList` jumps to the index in O(1) and then shifts the tail with `System.arraycopy`, a fast bulk memory move. `LinkedList` only wins when you already hold a `ListIterator` positioned at the insertion point and insert many elements there. Add the memory cost — roughly 24 bytes per node versus 4 bytes per reference — and `ArrayList` (or `ArrayDeque` for queue-like use) is the default; measure before choosing otherwise.",
          follow: ["When would `LinkedList` genuinely be the better choice?"],
          flags: ["*LinkedList inserts are O(1), so it's faster* — without mentioning the walk to the position"] },
        { level: 1, q: "What causes a `ConcurrentModificationException`, and how do you avoid it?",
          a: "Collections like `ArrayList` and `HashMap` count structural modifications in `modCount`. An iterator records the count when it is created and checks it on every `next()`; if the collection was structurally modified by anything other than the iterator itself, it throws `ConcurrentModificationException`. Despite the name it usually happens in **one** thread — removing elements inside a for-each loop. Fixes: `Iterator.remove()`, `removeIf(predicate)`, collecting the elements to remove and removing them afterwards, or building a new filtered collection with streams. For genuinely concurrent access use concurrent collections, whose iterators are weakly consistent. The check is best-effort and must never be relied on for thread safety.",
          follow: ["Why is it called *best-effort*?"] },
        { level: 2, q: "Explain PECS using a real JDK method signature.",
          a: "*Producer `extends`, consumer `super`*. `Collections.copy(List<? super T> dest, List<? extends T> src)`: `src` **produces** values you read, so it is `? extends T` — a `List<Integer>` can serve as the source for `T = Number`; `dest` **consumes** values you write, so it is `? super T` — a `List<Object>` can receive them. Likewise `Collections.max(Collection<? extends T> coll, Comparator<? super T> comp)` lets you find the maximum `Integer` with a `Comparator<Number>`. Without wildcards, generic APIs would only accept exactly matching types, which makes them painfully rigid. A structure you both read and write needs the exact type `T`.",
          follow: ["Why can't you add an `Integer` to a `List<? extends Number>`?"] },
        { level: 2, q: "What is type erasure? Name three things it prevents you from doing.",
          a: "Generic type arguments exist only at compile time; `javac` checks them, inserts casts and erases them to their bounds (usually `Object`) in the bytecode. Consequences: (1) no `new T()` or `new T[n]`, because the run-time type is unknown; (2) no `instanceof List<String>` and no reliable `List<String>.class`; (3) no overloads that differ only in type arguments, such as `process(List<String>)` and `process(List<Integer>)` — they erase to the same signature. Also: static fields are shared across all parameterisations, and primitives cannot be type arguments (hence boxing). Erasure was chosen in Java 5 for backward compatibility with pre-generic code.",
          follow: ["How do frameworks still find out the element type of a field like `List<Book> books`?"] },
        { level: 2, q: "A `TreeSet` built with a comparator on price silently drops some products. Why, and how do you fix it?",
          a: "Sorted collections use the comparator (or `compareTo`) — **not** `equals` — to decide whether two elements are the same. Two different products with the same price compare as 0, so the second is treated as a duplicate and discarded. The comparator must be *consistent with equals*, or at least break ties down to a unique key: `comparingInt(Product::price).thenComparing(Product::sku)`. The same applies to `TreeMap` keys, and a famous JDK example is `BigDecimal`, whose `compareTo` treats `2.0` and `2.00` as equal while `equals` does not — so a `HashSet` and a `TreeSet` of the same values can have different sizes.",
          code: { lang: 'java', file: 'TreeSetTrap.java', src: code`
            import java.util.*;

            public class TreeSetTrap {
                record Product(String sku, int price) {}

                public static void main(String[] args) {
                    List<Product> items = List.of(new Product("A", 100), new Product("B", 100), new Product("C", 50));
                    Set<Product> byPrice = new TreeSet<>(Comparator.comparingInt(Product::price));
                    byPrice.addAll(items);
                    System.out.println(byPrice.size() + " " + byPrice);
                    Set<Product> fixed = new TreeSet<>(Comparator.comparingInt(Product::price).thenComparing(Product::sku));
                    fixed.addAll(items);
                    System.out.println(fixed.size() + " " + fixed);
                }
            }`, out: code`
            2 [Product[sku=C, price=50], Product[sku=A, price=100]]
            3 [Product[sku=C, price=50], Product[sku=A, price=100], Product[sku=B, price=100]]` },
          follow: ["What happens with `new TreeSet<>(List.of(new BigDecimal(\"2.0\"), new BigDecimal(\"2.00\")))`?"] },
        { level: 2, q: "Which `BlockingQueue` would you give a thread pool, and why does `Executors.newFixedThreadPool` worry reviewers?",
          a: "`ArrayBlockingQueue` is bounded and array-backed with one lock; `LinkedBlockingQueue` is optionally bounded with separate put and take locks (more throughput under contention); `SynchronousQueue` has no capacity and hands each task directly to a thread (used by the cached pool); `PriorityBlockingQueue` and `DelayQueue` order tasks by priority or delay. `newFixedThreadPool` uses an **unbounded** `LinkedBlockingQueue`: when tasks arrive faster than they complete, the queue grows until the heap is exhausted, and latency grows silently long before that. In production, build a `ThreadPoolExecutor` with a **bounded** queue and an explicit rejection policy — `CallerRunsPolicy` slows the producer down (backpressure), `AbortPolicy` fails fast so you can shed load.",
          follow: ["In which order does a `ThreadPoolExecutor` use core threads, the queue and extra threads?"],
          flags: ["Using `Executors.newCachedThreadPool()` for unbounded incoming work"] },
        { level: 2, q: "What is the difference between `Arrays.asList`, `List.of` and `Collections.unmodifiableList`?",
          a: "`Arrays.asList(array)` is a **fixed-size view** of the array: `set` writes through to the array, `add`/`remove` throw `UnsupportedOperationException`, and `null` elements are allowed. `List.of(...)` is a truly **immutable** list: no mutators at all, no `null`s (even `contains(null)` throws `NullPointerException`), and no connection to any array. `Collections.unmodifiableList(list)` is a **read-only view** of a list that may still change underneath — callers cannot modify it, but they will see changes made through the original reference. When you need an immutable snapshot, use `List.copyOf(list)`, which also returns its argument unchanged if it is already immutable.",
          follow: ["Which of these is safe to return from a getter of an entity's collection?"] },
        { level: 3, q: "How does `PriorityQueue` work internally, and how would you support `decreaseKey` efficiently, for example in Dijkstra's algorithm?",
          a: "It is a binary min-heap stored in an array: the children of index i are at 2i + 1 and 2i + 2, `offer` appends and sifts up, `poll` moves the last element to the root and sifts down — both O(log n), `peek` O(1). `remove(Object)` is O(n) because it must search the array, so changing a priority in place is expensive. Three approaches: (1) **lazy deletion** — push a new entry with the better priority and skip stale entries when they are polled (simple; the standard Dijkstra implementation); (2) an **indexed priority queue** that keeps a map from key to heap position so it can sift a changed entry in O(log n); (3) a `TreeSet` of (priority, id) pairs, where an update is remove plus add, both O(log n). Lazy deletion costs extra memory for stale entries but is usually fastest in practice.",
          follow: ["Why must you never mutate an element's priority field while it is inside a `PriorityQueue`?"] },
        { level: 3, q: "A generic repository method is `List<T> findAll(Class<T> type)`. Why the `Class<T>` parameter, and how does Jackson deserialise `List<Book>` despite erasure?",
          a: "Inside a generic method `T` is erased, so the method cannot know which entity table to query or which class to instantiate; a `Class<T>` *type token* carries that information at run time and lets the compiler check the result type. `Class` objects cannot express parameterised types (`List<Book>.class` does not exist), so libraries use **super-type tokens**: you create an anonymous subclass such as `new TypeReference<List<Book>>() {}`, and because a class's *generic superclass* is recorded in the class file, `getClass().getGenericSuperclass()` returns the full `List<Book>` type. Spring's `ParameterizedTypeReference` and Guice's `TypeLiteral` use the same trick.",
          code: { lang: 'java', file: 'TypeTokens.java', src: code`
            import java.lang.reflect.ParameterizedType;
            import java.lang.reflect.Type;
            import java.util.*;

            public class TypeTokens {
                abstract static class TypeRef<T> {
                    final Type type;
                    protected TypeRef() {
                        type = ((ParameterizedType) getClass().getGenericSuperclass()).getActualTypeArguments()[0];
                    }
                }

                record Book(String title) {}

                public static void main(String[] args) {
                    System.out.println(new ArrayList<Book>().getClass().getTypeParameters()[0]);   // only "E"
                    TypeRef<List<Book>> ref = new TypeRef<List<Book>>() {};                     // anonymous subclass
                    System.out.println(ref.type.getTypeName());
                }
            }`, out: code`
            E
            java.util.List<TypeTokens$Book>` },
          follow: ["Why does the token need to be an *anonymous subclass* rather than a plain instance?"] },
        { level: 2, q: "How do you choose between `HashMap`, `LinkedHashMap` and `TreeMap` — and what does `TreeMap` offer beyond sorted iteration?",
          a: "`HashMap` is the default: O(1) average operations, no order. `LinkedHashMap` adds a linked list through the entries, giving **insertion order** (predictable iteration, e.g. for JSON output) or **access order** (the basis of an LRU cache via `removeEldestEntry`). `TreeMap` is a red-black tree with O(log n) operations and, more importantly, **navigation**: `floorKey`, `ceilingEntry`, `headMap`, `tailMap` and `subMap` range views. That makes it the natural choice for *find the rate band for this amount*, *the latest price at or before time t*, or *bookings overlapping a date range* (Session 21). Choose by the queries you need, not by habit.",
          follow: ["How would you implement *latest config value as of a timestamp* with a `TreeMap`?"] }
      ],
      notes: [
        "The two programs on this slide are verified by the course test suite. The `TreeSet` trap is a favourite because it combines comparators, `equals` and records in one short question.",
        "For the Senior questions, interviewers look for the *mechanism* (heap array layout, class-file generic signatures) rather than API recall — the follow-ups probe whether you could build the structure yourself.",
        "Connect answers to production impact when you can: an unbounded executor queue is an outage waiting to happen, and choosing the right map changes both latency and memory."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                PriorityQueue<Integer> pq = new PriorityQueue<>();
                pq.offer(3); pq.offer(1); pq.offer(2);
                System.out.println(pq + " " + pq.peek());
            }
        }`, out: '[1, 3, 2] 1' },
      options: ['`[1, 2, 3] 1`', '`[1, 3, 2] 1`', '`[3, 1, 2] 3`', '`[1, 2, 3] 3`'], answer: 1,
      why: "`toString` prints the heap's internal array. After offering 3, then 1 (sifts up to the root), then 2 (stays under the root), the array is `[1, 3, 2]`; only `peek`/`poll` respect priority order." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                String[] arr = {"a", "b", "c"};
                List<String> view = Arrays.asList(arr);
                view.set(0, "z");
                String result = arr[0];
                try { view.add("d"); result += " added"; }
                catch (UnsupportedOperationException e) { result += " UOE"; }
                System.out.println(result);
            }
        }`, out: 'z UOE' },
      options: ['`a UOE`', '`z UOE`', '`z added`', '`a added`'], answer: 1,
      why: "`Arrays.asList` is a fixed-size view backed by the array: `set` writes through to `arr`, while `add` would change the size and throws `UnsupportedOperationException`." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                List<String> a = new ArrayList<>(List.of("x"));
                List<String> b = List.of("x");
                String r = a.contains(null) + " ";
                try { r += b.contains(null); } catch (NullPointerException e) { r += "NPE"; }
                System.out.println(r);
            }
        }`, out: 'false NPE' },
      options: ['`false false`', '`false NPE`', '`NPE NPE`', '`true NPE`'], answer: 1,
      why: "`ArrayList` tolerates `null` queries. The immutable lists from `List.of` disallow nulls entirely — even `contains(null)` throws `NullPointerException`." },
    { level: 3, q: "Which signature lets `max` accept both a `List<Integer>` and a `Comparator<Number>`?",
      options: ['`<T> T max(List<T> list, Comparator<T> cmp)`', '`<T> T max(List<? extends T> list, Comparator<? super T> cmp)`', '`<T> T max(List<? super T> list, Comparator<? extends T> cmp)`', '`<T> T max(List<T> list, Comparator<?> cmp)`'], answer: 1,
      why: "PECS: the list produces values (`? extends T`) and the comparator consumes them (`? super T`). With `T = Integer`, a `Comparator<Number>` satisfies `? super Integer`." },
    { level: 2, q: "Why does `ArrayDeque` reject `null` elements?",
      options: ['Because `poll()` and `peek()` return `null` to signal that the deque is empty', 'Because of type erasure', 'Because a circular buffer cannot store references', 'It does not — only `PriorityQueue` rejects `null`'], answer: 0,
      why: "If `null` were a legal element, a `null` from `poll()` would be ambiguous. Most queue implementations forbid it for that reason (`LinkedList` is the legacy exception)." }
  ]
});
