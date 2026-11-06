/* Interview pack — Session 1: Java architecture, JVM & OOP */
COURSE.prep(1, {
  deepDives: [
    {
      title: 'Deep dive: JIT compilation, escape analysis & object layout',
      lead: 'Why Java gets faster after warm-up, why some allocations disappear entirely, and what an object really costs in memory.',
      diagram: { kind: 'flow', nodes: [
        { t: 'Bytecode', s: '.class files', tone: 'gray' },
        { t: 'Interpreter', s: 'runs immediately, counts calls & loops', tone: 'blue' },
        { t: 'C1 (tier 3)', s: 'quick compile + profiling', tone: 'yellow' },
        { t: 'C2 (tier 4)', s: 'aggressive, profile-guided', tone: 'green' },
        { t: 'Deoptimise', s: 'an assumption broke → back to tier 0', tone: 'red' }
      ] },
      points: [
        "**Tiered compilation**: hot methods move from the interpreter to **C1** (fast compile, collects a profile) and then to **C2** (inlining, loop optimisations, speculative devirtualisation). This is why you benchmark only after warm-up — or with JMH.",
        "**Inlining** is the enabling optimisation: small hot methods (getters, lambdas, `equals`) are copied into the caller, which unlocks constant folding, dead-code elimination and escape analysis.",
        "**Escape analysis**: when an object never escapes a compiled method (not stored in a field, not returned, not passed to non-inlined code), C2 can **scalar-replace** it — its fields live in registers and the allocation disappears.",
        "**Deoptimisation**: speculative optimisations rest on assumptions (only one implementation of an interface is loaded; this branch is never taken). Loading a new class or hitting the cold branch sends the method back to the interpreter to be recompiled.",
        "**Object layout** (64-bit JVM, compressed oops — the default below a 32 GB heap): a 12-byte header (8-byte mark word for hash, lock and GC age + 4-byte class pointer), then the fields, padded to a multiple of 8 bytes.",
        "**Compact object headers** (JEP 519, a product feature in JDK 25, enabled with `-XX:+UseCompactObjectHeaders`) shrink the header to 8 bytes — less memory per object and more objects per cache line."
      ],
      table: { head: ['Value', 'Approximate size (compressed oops)', 'Interview takeaway'], rows: [
        ['`int`', '4 bytes', 'Primitives live inline — in a field, an array slot or a register'],
        ['`Integer` (outside the −128…127 cache)', '16 bytes + a 4-byte reference', '5× the memory of the `int` it wraps'],
        ['`new Object()`', '16 bytes', '12-byte header, padded to 8'],
        ['`\"hello\"` (compact strings, Java 9+)', '≈ 48 bytes: 24 for the `String` + 24 for its `byte[5]`', 'Latin-1 text uses 1 byte per char, otherwise UTF-16'],
        ['`int[1_000_000]`', '≈ 4 MB', 'One object, contiguous, cache-friendly'],
        ['`ArrayList<Integer>` with 10⁶ distinct values', '≈ 20 MB', 'References + boxed objects scattered across the heap']
      ] },
      callout: { kind: 'interview', text: "Asked *Is Java slow?* answer with mechanisms, not opinions: the JIT compiles hot code with profile-guided optimisations that static compilers cannot make. The real costs are warm-up, GC pauses and per-object memory overhead. The fixes: an AOT/CDS cache for startup (JDK 24+), GraalVM native images when startup dominates, and primitive arrays or value-based designs when memory dominates." },
      notes: [
        "The JIT decides what to compile from counters: every method invocation and every loop back-edge increments a counter, and crossing a threshold queues the method for compilation on a background compiler thread. Meanwhile the interpreter keeps running it, so there is no pause.",
        "Escape analysis explains a common surprise: a microbenchmark that allocates a small temporary object in a loop may show zero allocation rate in a profiler. The object was scalar-replaced. Change the code so the object escapes (store it in a field) and the allocations reappear.",
        "The numbers in the table assume a 64-bit HotSpot JVM with compressed references (heaps under 32 GB). Measure real layouts with JOL (`org.openjdk.jol:jol-core`) — it prints every header byte, field offset and padding gap. That is one of the stretch goals of today's lab.",
        "Memory matters in interviews because follow-ups often ask *what if there are 10⁸ items?* — a `HashSet<Integer>` of 10⁸ elements needs several gigabytes, while a sorted `int[]` needs 400 MB. Today's coding round uses exactly this trade-off."
      ]
    },
    {
      title: 'Deep dive: garbage collectors & diagnosing pauses',
      lead: 'How the collectors you will meet in production work, and how to prove (or rule out) GC as the cause of a latency problem.',
      diagram: { kind: 'layers', items: [
        { t: 'Young generation', s: 'Eden + 2 survivor spaces — most objects die here; copying collection, cost ∝ live objects', tone: 'green', parts: ['Eden', 'Survivor 0', 'Survivor 1'] },
        { t: 'Old generation', s: 'objects that survived several young collections; collected concurrently (G1, ZGC) or in big pauses', tone: 'orange' },
        { t: 'Metaspace (native memory)', s: 'class metadata — grows with loaded classes; leaks on repeated redeploys', tone: 'purple' }
      ] },
      points: [
        "**Generational hypothesis**: most objects die young. A young collection copies only the survivors out of Eden, so its cost depends on live objects, not on garbage — allocating short-lived objects is cheap.",
        "**G1** (the default on server-class machines since JDK 9) splits the heap into equal regions and collects the regions with the most garbage first to meet a pause goal (`-XX:MaxGCPauseMillis`, default 200 ms). An object of at least half a region is **humongous** and goes straight into old regions.",
        "**ZGC** (generational by default since JDK 23) marks and relocates concurrently using coloured pointers and load barriers; pauses are typically well under a millisecond regardless of heap size. **Parallel GC** maximises throughput for batch jobs at the cost of longer stop-the-world pauses.",
        "Stop-the-world work happens at **safepoints**; a thread that takes long to reach one (time-to-safepoint) adds latency even with a concurrent collector.",
        "Diagnose with data: `-Xlog:gc*:file=gc.log`, **JFR** (`jcmd <pid> JFR.start`), `jstat -gcutil <pid> 1s`, and heap dumps (`jcmd <pid> GC.heap_dump`) analysed with a dominator tree (Eclipse MAT).",
        "In containers the JVM sizes its heap from the memory limit, by default **25%** of it (`-XX:MaxRAMPercentage`). Raise it to about 70–75% and leave headroom for metaspace, thread stacks and direct buffers: crossing the container limit gets the process **OOM-killed** by the kernel, which is not a Java `OutOfMemoryError`."
      ],
      table: { head: ['Collector', 'Optimises for', 'Typical pauses', 'Reach for it when'], rows: [
        ['Serial', 'Small footprint', 'Stop-the-world, single thread', 'Tiny heaps, one CPU, CLI tools'],
        ['Parallel', 'Throughput', 'Stop-the-world, multi-threaded', 'Batch jobs where total time matters, not latency'],
        ['G1 (default)', 'Balance of throughput and latency', 'Tens to hundreds of ms, pause goal 200 ms', 'Most services with heaps up to tens of GB'],
        ['ZGC (generational)', 'Low latency', 'Sub-millisecond, independent of heap size', 'Latency-sensitive services, very large heaps'],
        ['Shenandoah', 'Low latency', 'Concurrent compaction, short pauses', 'Similar to ZGC; shipped in most OpenJDK builds, not Oracle JDK']
      ] },
      notes: [
        "Read a G1 log line like `Pause Young (Normal) (G1 Evacuation Pause) 412M->96M(1024M) 8.512ms`: heap usage before and after, total heap size, pause duration. If pauses line up with your latency spikes, GC is your suspect; if not, look elsewhere (locks, pools, downstream calls).",
        "Humongous allocations are a frequent real-world problem: large JSON buffers or byte arrays of several MB each. They fragment the old generation and can trigger full GCs. Fix by streaming instead of buffering, chunking, or increasing the region size with `-XX:G1HeapRegionSize`.",
        "ZGC's generational mode became the default in JDK 23 and the non-generational mode was removed in JDK 24, so on Java 25 `-XX:+UseZGC` gives you generational ZGC.",
        "The container note causes many incidents: with a 2 GiB limit and the default 25%, the heap is only 512 MiB and the service runs out of heap under load; with `-Xmx2g` it gets OOM-killed because the JVM needs native memory beyond the heap. About 75% for the heap is a reasonable starting point; verify with Native Memory Tracking (`-XX:NativeMemoryTracking=summary`)."
      ]
    }
  ],

  stretch: [
    "Add JOL (`org.openjdk.jol:jol-core`) to the lab and print `ClassLayout.parseInstance(...).toPrintable()` for a `Book` and an `Integer`. Explain every header and padding byte, then rerun on JDK 25 with `-XX:+UseCompactObjectHeaders` and compare.",
    "Record a 60-second Java Flight Recording of the library app under a synthetic load (`jcmd <pid> JFR.start duration=60s filename=lib.jfr`), open it in JDK Mission Control and find the method that allocates the most.",
    "Run an allocation-heavy loop with a 256 MB heap and `-Xlog:gc*`, first with G1 and then with `-XX:+UseZGC`. Compare the longest pause and the total run time, and explain the trade-off you observe."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: longest consecutive sequence in O(n)',
      lead: 'A hashing problem with a twist: the obvious nested loop looks O(n²), and the interviewer wants you to prove why the right version is O(n) — then talk about memory.',
      difficulty: 'Medium', minutes: 35, lc: 128, pattern: ['hashing'],
      problem: [
        "Given an unsorted array of integers `nums`, return the length of the longest run of **consecutive integers** (each value exactly one more than the previous) that can be formed from its elements. The elements do not need to be adjacent in the array, and duplicates count once.",
        "Your algorithm must run in **O(n)** time."
      ],
      examples: [
        { in: 'nums = [100, 4, 200, 1, 3, 2]', out: '4', why: "The run is 1, 2, 3, 4." },
        { in: 'nums = [0, 3, 7, 2, 5, 8, 4, 6, 0, 1]', out: '9', why: "0 through 8; the duplicate 0 counts once." },
        { in: 'nums = []', out: '0' }
      ],
      constraints: ["`0 ≤ nums.length ≤ 10⁵`", "`-10⁹ ≤ nums[i] ≤ 10⁹`"],
      hints: [
        "Sorting solves it in O(n log n). What would let you ask *is x + 1 present?* in O(1)?",
        "Put every value in a `HashSet`. Only start counting at a value `x` whose predecessor `x − 1` is **not** in the set — that is the start of a run.",
        "Why is that O(n) despite the nested `while`? Each value is touched at most twice: once by the outer loop, and once while extending the single run that contains it."
      ],
      approaches: [
        { name: 'Brute force', idea: 'For every value, keep checking whether the next value exists by scanning the array', time: 'O(n³)', space: 'O(1)' },
        { name: 'Sort + scan', idea: 'Sort, then count runs while skipping duplicates', time: 'O(n log n)', space: 'O(1) extra for a primitive array' },
        { name: 'HashSet + run starts', idea: 'Count only from values whose predecessor is absent; extend with `contains(x + len)`', time: 'O(n)', space: 'O(n)' },
        { name: 'Union-find / boundary map', idea: 'Merge x with x ± 1 as values arrive — the online version', time: 'O(n α(n))', space: 'O(n)' }
      ],
      code: { lang: 'java', file: 'LongestConsecutive.java', src: code`
        import java.util.*;

        public class LongestConsecutive {
            // O(n): start counting only at the first value of each run
            static int longest(int[] nums) {
                Set<Integer> set = new HashSet<>(2 * nums.length);
                for (int x : nums) set.add(x);
                int best = 0;
                for (int x : set) {                         // iterate the SET: duplicates are gone
                    if (set.contains(x - 1)) continue;      // not the start of a run
                    int len = 1;
                    while (set.contains(x + len)) len++;
                    best = Math.max(best, len);
                }
                return best;
            }

            // O(n log n) reference: sort a copy, count runs, skip duplicates
            static int bySorting(int[] nums) {
                int[] a = nums.clone();
                Arrays.sort(a);
                int best = 0, run = 0;
                for (int i = 0; i < a.length; i++) {
                    if (i > 0 && a[i] == a[i - 1]) continue;
                    run = (i > 0 && a[i] == a[i - 1] + 1) ? run + 1 : 1;
                    best = Math.max(best, run);
                }
                return best;
            }

            public static void main(String[] args) {
                System.out.println(longest(new int[] {100, 4, 200, 1, 3, 2}));
                System.out.println(longest(new int[] {0, 3, 7, 2, 5, 8, 4, 6, 0, 1}));
                System.out.println(longest(new int[] {}));
                Random rnd = new Random(7);
                for (int t = 0; t < 2_000; t++) {               // differential test against sorting
                    int[] a = new int[rnd.nextInt(60)];
                    for (int i = 0; i < a.length; i++) a[i] = rnd.nextInt(80) - 40;
                    if (longest(a) != bySorting(a)) throw new AssertionError(Arrays.toString(a));
                }
                System.out.println("2000 random arrays: HashSet and sorting agree");
            }
        }`, out: code`
        4
        9
        0
        2000 random arrays: HashSet and sorting agree` },
      pitfalls: [
        "Counting from **every** value instead of only run starts makes input like `1..n` cost O(n²).",
        "Iterating the **array** instead of the set: many duplicates of a run start repeat the inner loop each time, quietly bringing back O(n²).",
        "Memory: 10⁵ boxed `Integer`s are fine, but 10⁸ values need gigabytes in a `HashSet` — then sort a primitive `int[]` in place instead.",
        "Values near `Integer.MAX_VALUE` make `x + 1` overflow; the constraints rule it out here, but say so out loud."
      ],
      followUps: [
        { q: "The numbers arrive one at a time and you must report the current longest run after each insert.",
          a: "Keep a map from run **boundaries** to run lengths. On inserting a new value x: `left = len(x − 1)` if x − 1 ends a run, `right = len(x + 1)` if x + 1 starts one; the merged run has length `left + right + 1`; update the map at its two ends `x − left` and `x + right`, and track the maximum. O(1) per insert. Union-find with size counts works too, at O(α(n)) per insert." },
        { q: "There are 10⁹ values on disk and you have 2 GB of RAM.",
          a: "A hash set is impossible (each boxed entry costs tens of bytes). Use an **external sort**: sort chunks that fit in memory, write them as sorted runs, then k-way merge them with a heap (Session 4's pattern) while counting consecutive values in the merged stream — O(1) extra memory beyond buffers. Alternatively, partition by value range into files that each fit in memory, solve each, and stitch runs that cross partition boundaries." },
        { q: "Return the sequence itself, not just its length.",
          a: "Remember the start value of the best run while scanning; the sequence is `start, start + 1, …, start + best − 1`, so no extra storage is needed." }
      ],
      rubric: [
        "Recognises that the O(n) requirement rules out sorting and uses a set for O(1) membership.",
        "Justifies the O(n) bound with the *each value is visited at most twice* argument instead of just asserting it.",
        "Handles duplicates and the empty array, and iterates the set rather than the array.",
        "Raises the memory/boxing trade-off and the sorting alternative for huge inputs — connecting the problem to JVM internals."
      ],
      notes: [
        "Interviewers often probe the complexity argument: a candidate who says *nested loop, so O(n²)* or *it's O(n) because hashing* without the amortised reasoning loses points. Practise saying: *the inner loop only runs from run starts, and runs are disjoint, so all inner iterations together touch each value once.*",
        "The reference solution includes a differential test against the sorting version on 2,000 random arrays. Interviewers will not expect that in 35 minutes, but in real work it is the cheapest way to gain confidence in a clever algorithm.",
        "This round connects back to the deep dive: boxing every value costs about 16 bytes plus the hash set's node overhead, which is why the follow-up about 10⁹ values pushes you towards primitive arrays and external sorting."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: JVM internals & OOP',
      lead: 'From *what happens when you run java App* to diagnosing GC pauses in production. Predict the output of the programs before you reveal the answers — the outputs are verified.',
      qa: [
        { level: 1, q: "What happens between typing `java App` and the first line of `main` running?",
          a: [
            "1. The launcher starts the JVM, which creates the heap, starts system threads (GC, JIT compiler threads) and maps the class-data-sharing archive of core classes to speed up startup.",
            "2. **Loading**: the application class loader loads `App` by delegating to its parents first (platform → bootstrap); the bootstrap loader supplies `java.base` classes such as `String`.",
            "3. **Linking**: *verification* checks the bytecode is type-safe, *preparation* allocates static fields with default values, and *resolution* turns symbolic references into direct ones (lazily, on first use).",
            "4. **Initialisation**: static initialisers and static field assignments run (superclasses first).",
            "5. The JVM calls `main` on the main thread. Code starts in the interpreter; hot methods are later JIT-compiled."
          ],
          follow: ["Why does the JVM verify bytecode if `javac` already checked the code?", "What problem does parent-first delegation prevent?"],
          flags: ["Saying the JVM compiles the whole program to machine code before starting"] },
        { level: 2, q: "When exactly is a class initialised? Predict what this program prints.",
          a: "A class is initialised on its first **active use**: creating an instance, calling a static method, or reading/writing a static field that is **not a compile-time constant**. Its superclass is initialised first. Reading `Child.CONST` does not initialise `Child`, because `static final int CONST = 42` is a constant that `javac` inlines into the caller. Reading `Child.counter` initialises `Parent` and then `Child` — notice the static blocks print *before* `counter=0`, because the field is read while the string is being built. For every `new Child()`, instance initialisers and constructors run parent first. Static blocks run once per class loader.",
          code: { lang: 'java', file: 'InitOrder.java', src: code`
            public class InitOrder {
                static class Parent {
                    static { System.out.println("Parent static"); }
                    { System.out.println("Parent instance"); }
                    Parent() { System.out.println("Parent()"); }
                }

                static class Child extends Parent {
                    static final int CONST = 42;      // compile-time constant: inlined by javac
                    static int counter = 0;
                    static { System.out.println("Child static"); }
                    { System.out.println("Child instance"); }
                    Child() { System.out.println("Child()"); }
                }

                public static void main(String[] args) {
                    System.out.println("CONST=" + Child.CONST);      // does NOT initialise Child
                    System.out.println("counter=" + Child.counter);  // Parent, then Child, are initialised
                    new Child();
                    new Child();
                }
            }`, out: code`
            CONST=42
            Parent static
            Child static
            counter=0
            Parent instance
            Parent()
            Child instance
            Child()
            Parent instance
            Parent()
            Child instance
            Child()` },
          follow: ["What happens if a static initialiser throws an exception?", "How can two class loaders end up with two copies of the same *singleton*?"] },
        { level: 2, q: "Stack vs heap: where do primitives, references and objects live? What is escape analysis?",
          a: "Each thread has its own **stack** of frames holding local variables and parameters — primitives and *references*. Objects and arrays live on the shared **heap** (the string pool has been on the heap since Java 7). Static fields are stored with the class's `java.lang.Class` object on the heap, while class metadata lives in **Metaspace** in native memory. **Escape analysis** lets the JIT avoid heap allocation entirely for objects that never leave a compiled method, by replacing them with their fields (scalar replacement). The failure modes differ: deep recursion gives `StackOverflowError`; the heap gives `OutOfMemoryError: Java heap space`; and there are also `Metaspace`, `unable to create native thread` and `Direct buffer memory` variants, each pointing to a different cause.",
          follow: ["Why are local variables thread-safe but objects they point to are not?", "Which `OutOfMemoryError` would a class-loader leak produce?"],
          flags: ["*Primitives always live on the stack* — a primitive field lives inside its object on the heap"] },
        { level: 2, q: "How does G1 work at a high level, and when would you choose ZGC or Parallel GC instead?",
          a: "G1 divides the heap into equal-sized regions, each acting as Eden, survivor or old. Young collections evacuate live objects from Eden and survivor regions in stop-the-world pauses. Concurrent marking finds which old regions are mostly garbage, and *mixed* collections then evacuate young regions plus the most profitable old ones — *garbage first* — sized to meet the pause goal (`MaxGCPauseMillis`, 200 ms by default). Remembered sets track cross-region references so regions can be collected independently. Choose **ZGC** when latency matters most or heaps are very large: it relocates objects concurrently, keeping pauses sub-millisecond, at the cost of some throughput and memory overhead. Choose **Parallel** for batch jobs, where total throughput matters and pauses do not.",
          follow: ["What is a humongous object, and why can it hurt?", "What would you look at in a GC log first?"] },
        { level: 3, q: "A service's p99 latency spikes every few minutes while the average looks fine. The heap is 8 GB. How do you investigate?",
          a: [
            "1. **Correlate first**: line the spikes up with GC logs (`-Xlog:gc*`) or JFR GC events. If pause times match the spikes, it is GC; if they do not, stop blaming GC.",
            "2. **If GC**: check the allocation rate and what is allocated (JFR allocation profiling), humongous allocations (large buffers at least half a region), old-generation growth leading to mixed or full collections, and *to-space exhausted* events. Also check time-to-safepoint.",
            "3. **If not GC**: look at lock contention (JFR monitor events), connection-pool waits, slow downstream calls, periodic jobs (cache refreshes, cron), CPU throttling from container limits, or noisy neighbours.",
            "4. **Fix the cause**: reduce allocation (stream instead of buffering, reuse buffers), raise `G1HeapRegionSize` so big objects are not humongous, right-size the heap, or switch to generational ZGC for low latency.",
            "5. **Verify** with before/after percentiles under the same load — not with averages."
          ],
          follow: ["How would container CPU throttling show up in latency graphs?", "Why are averages misleading here?"],
          flags: ["Jumping straight to *add more heap* without evidence", "Only looking at average latency"] },
        { level: 1, q: "Overloading vs overriding: which is decided at compile time? Predict the output.",
          a: "**Overloading** is resolved at compile time from the **static** (declared) types of the arguments; **overriding** is resolved at run time from the **actual** class of the receiver (dynamic dispatch through the vtable). So `describe(a)` picks `describe(Animal)` because `a` is declared as `Animal`, and inside it `a.sound()` dispatches to `Dog.sound()`. Static methods are not overridden but **hidden**: `a.kind()` is compiled as `Animal.kind()` based on the declared type — calling static methods through an instance is legal but misleading, and compilers warn about it.",
          code: { lang: 'java', file: 'Dispatch.java', src: code`
            public class Dispatch {
                static class Animal {
                    String sound() { return "..."; }
                    static String kind() { return "animal"; }
                }

                static class Dog extends Animal {
                    @Override String sound() { return "woof"; }
                    static String kind() { return "dog"; }
                }

                static String describe(Animal a) { return "animal:" + a.sound(); }
                static String describe(Dog d) { return "dog:" + d.sound(); }

                public static void main(String[] args) {
                    Animal a = new Dog();
                    System.out.println(describe(a));   // overload by static type, override by runtime type
                    System.out.println(a.kind());      // static methods are hidden, not overridden
                }
            }`, out: code`
            animal:woof
            animal` },
          follow: ["Can you override a private method? A final one?", "What are covariant return types?"] },
        { level: 2, q: "Why prefer composition over inheritance? Show a concrete bug that inheritance causes.",
          a: "Inheritance couples a subclass to its superclass's **implementation details**, not just its contract — the *fragile base class* problem. In the classic example from *Effective Java*, a set that counts added elements overrides both `add` and `addAll`. But `HashSet.addAll` (inherited from `AbstractCollection`) calls `add` for every element, so each element is counted twice and the program prints 6, not 3. The subclass broke because of a self-use pattern it could not see, and could break again whenever the superclass changes. **Composition** — a `CountingSet` that *wraps* a `Set` and forwards calls — depends only on the public interface. Use inheritance for true *is-a* relationships designed for extension (abstract classes, template methods); otherwise compose.",
          code: { lang: 'java', file: 'Fragile.java', src: code`
            import java.util.*;

            public class Fragile {
                static class CountingSet<E> extends HashSet<E> {
                    int added = 0;
                    @Override public boolean add(E e) { added++; return super.add(e); }
                    @Override public boolean addAll(Collection<? extends E> c) {
                        added += c.size();
                        return super.addAll(c);         // ...which calls add() for each element
                    }
                }

                public static void main(String[] args) {
                    CountingSet<String> s = new CountingSet<>();
                    s.addAll(List.of("a", "b", "c"));
                    System.out.println(s.added);
                }
            }`, out: '6' },
          follow: ["How would you fix it with composition?", "When is inheritance the right tool?"] },
        { level: 2, q: "How should `equals` behave across a class hierarchy, and why do records and `final` classes make it easier?",
          a: "`equals` must be reflexive, symmetric, transitive and consistent, and must agree with `hashCode`. Hierarchies break symmetry: if `Point.equals` accepts any `Point` but `ColorPoint.equals` also compares colour, then `point.equals(colorPoint)` is true while `colorPoint.equals(point)` is false. Using `getClass() != o.getClass()` restores symmetry but means a subclass instance is never equal to its parent, which surprises callers who rely on substitutability. There is no way to add a value component in a subclass and keep the full contract — so favour composition (`ColorPoint` *has a* `Point`). Records are implicitly `final` and generate `equals`/`hashCode` from all components, which eliminates the whole problem for value types.",
          follow: ["What breaks in a `HashSet` if `equals` is not symmetric?", "Why must JPA entities be careful here?"] },
        { level: 3, q: "Strings: why are they immutable, what is the string pool, and how do compact strings and deduplication save memory?",
          a: "Immutability lets `String` cache its hash code (perfect `HashMap` keys), be shared freely between threads without locking, and be trusted by security-sensitive code (class names, file paths, URLs cannot change after a check). Literals and compile-time constants are **interned** in the string pool, a hash table on the heap, so equal literals share one object; `intern()` adds a runtime string but costs a lookup and should not be used blindly. **Compact strings** (Java 9) store Latin-1 text as one byte per character in a `byte[]` with a `coder` flag, halving memory for most backend text. **String deduplication** (`-XX:+UseStringDeduplication`, originally a G1 feature) lets the GC make identical strings share one backing array — useful when many equal strings come from parsing JSON or database rows.",
          follow: ["Why is `==` on strings unreliable even though literals are pooled?", "What does `String.hashCode()` compute, and why can it be 0?"] },
        { level: 2, q: "Java has a garbage collector, so how can it leak memory? Give production examples and how you would find them.",
          a: "The GC frees only *unreachable* objects; a leak is an object that is still reachable but no longer useful. Typical sources: static maps or caches with no eviction; listeners and callbacks that are registered but never removed; `ThreadLocal` values in pooled threads that outlive the request (and pin class loaders in application servers); unbounded queues when consumers fall behind; inner classes and lambdas holding a reference to a large outer object; class-loader leaks on redeploy that fill Metaspace; and off-heap memory (direct buffers, native libraries). To find them, compare heap histograms over time (`jcmd <pid> GC.class_histogram`) and take a heap dump to read the **dominator tree** and the path to GC roots of the biggest retainers.",
          follow: ["Why do `ThreadLocal`s leak in thread pools but not with one thread per request?", "What does a steadily rising old generation after each full GC tell you?"],
          flags: ["*Memory leaks are impossible in Java*"] }
      ],
      notes: [
        "Predict the output of the three programs before revealing the answers — class initialisation order, overload resolution and the fragile base class are favourite *what does this print?* questions in phone screens, and all three outputs are verified by the course test suite.",
        "For the Senior question on latency spikes, interviewers grade the investigation structure (correlate, isolate, fix, verify) more than any specific flag. Say what evidence would change your mind.",
        "If you are early in your career, you will not have debugged GC in production — say so, then describe how you would do it using the tools from the deep dive. That is a strong answer at SDE-1 and SDE-2."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            public static void main(String[] args) {
                Integer a = 127, b = 127, c = 128, d = 128;
                System.out.println((a == b) + " " + (c == d) + " " + c.equals(d));
            }
        }`, out: 'true false true' },
      options: ['`true true true`', '`true false true`', '`false false true`', '`true false false`'], answer: 1,
      why: "Autoboxing calls `Integer.valueOf`, which caches −128…127. `a` and `b` are the same cached object; 128 creates two distinct objects, so `==` (reference comparison) is false while `equals` compares values." },
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            public static void main(String[] args) {
                String s1 = "java";
                String s2 = "ja" + "va";        // compile-time constant
                String part = "ja";
                String s3 = part + "va";        // computed at run time
                final String fin = "ja";
                String s4 = fin + "va";         // constant again: final + literal
                System.out.println((s1 == s2) + " " + (s1 == s3) + " " + (s1 == s4) + " " + (s1 == s3.intern()));
            }
        }`, out: 'true false true true' },
      options: ['`true true true true`', '`true false true true`', '`true false false true`', '`false false false true`'], answer: 1,
      why: "Constant expressions (literals, and `final` variables initialised with constants) are folded by `javac` and interned, so `s2` and `s4` are the pooled `\"java\"`. `s3` is built at run time, giving a new object; `intern()` returns the pooled instance." },
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            static String f(Object o) { return "Object"; }
            static String f(String s) { return "String"; }

            public static void main(String[] args) {
                System.out.println(f(null));
            }
        }`, out: 'String' },
      options: ['`Object`', '`String`', 'Compile error: ambiguous call', '`NullPointerException`'], answer: 1,
      why: "`null` is assignable to both parameter types, and overload resolution picks the **most specific** method: `String` is a subtype of `Object`. Adding a third overload such as `f(Integer)` would make the call ambiguous and fail to compile." },
    { level: 2, q: "A JVM runs in a container with a 2 GiB memory limit and no heap flags. Which statement is true?",
      options: ['The maximum heap defaults to 25% of the limit, about 512 MiB', 'The JVM ignores container limits and sizes the heap from the host\'s RAM', 'Setting `-XX:MaxRAMPercentage=100` is safe because the GC keeps memory within the limit', '`MaxRAMPercentage` controls the size of Metaspace'], answer: 0,
      why: "Modern JVMs are container-aware and default `MaxRAMPercentage` to 25. The heap is not the only memory the JVM uses — metaspace, thread stacks, the code cache and direct buffers live outside it — so a heap close to 100% of the limit gets the process OOM-killed." },
    { level: 3, q: "A G1 service allocates many 12 MB byte arrays, and the heap region size is 4 MB. What is the most likely problem?",
      options: ['Each array is a humongous object placed directly in contiguous old regions, wasting space and risking fragmentation and full GCs', 'Arrays larger than a region are rejected with an `OutOfMemoryError`', 'Such arrays are allocated off-heap', 'Nothing — young collections reclaim them cheaply'], answer: 0,
      why: "Objects of at least half a region are humongous: they skip the young generation and need contiguous free regions. Many of them fragment the heap and can trigger to-space exhaustion or full GCs. Stream or chunk the data, or raise `-XX:G1HeapRegionSize`." }
  ]
});
