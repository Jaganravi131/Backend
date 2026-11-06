/* Interview pack — Session 2: Abstract classes, interfaces & exceptions */
COURSE.prep(2, {
  deepDives: [
    {
      title: 'Deep dive: how exceptions really work — cost, bytecode & try-with-resources',
      lead: 'Why a `try` block is free but a thrown exception is not, what try-with-resources generates for you, and why a `return` in `finally` is a bug.',
      points: [
        "A `try` compiles to an **exception table** (start, end, handler, type) attached to the method — the happy path executes no extra instructions. The cost appears only when an exception is created and thrown.",
        "The expensive part of `new Exception()` is `fillInStackTrace()`, which walks the stack — proportional to its depth, and Spring call stacks are often 100+ frames. Exceptions used for normal control flow on hot paths show up clearly in profiles.",
        "For **expected** outcomes (validation failures, *not found*), return a value: `Optional`, a sealed result type, or a status. Keep exceptions for conditions the caller cannot reasonably expect. Stack-less exceptions (`super(msg, null, false, false)`) exist for hot paths, at the price of debuggability.",
        "**try-with-resources** generates nested try/finally blocks: resources close in **reverse** order of declaration. If both the body and `close()` throw, the body's exception propagates and the close failure is attached with `addSuppressed` — nothing is lost, unlike a hand-written `finally`.",
        "A `return` (or `throw`) inside `finally` **replaces** whatever the `try` block was returning or throwing — it silently swallows exceptions. Never return from `finally`.",
        "In very hot code HotSpot may throw preallocated implicit exceptions (NPE, `ArrayIndexOutOfBoundsException`) **without a stack trace**. That is why production logs sometimes show a bare `NullPointerException`; `-XX:-OmitStackTraceInFastThrow` turns the optimisation off."
      ],
      code: { lang: 'java', file: 'TwrDemo.java', src: code`
        public class TwrDemo {
            record Res(String name, boolean failOnClose) implements AutoCloseable {
                Res { System.out.println("open " + name); }

                @Override public void close() {
                    System.out.println("close " + name);
                    if (failOnClose) throw new IllegalStateException("close failed: " + name);
                }
            }

            public static void main(String[] args) {
                try (Res a = new Res("db", true); Res b = new Res("file", false)) {
                    System.out.println("work");
                    throw new RuntimeException("body failed");
                } catch (RuntimeException e) {
                    System.out.println("caught: " + e.getMessage());
                    for (Throwable s : e.getSuppressed()) System.out.println("suppressed: " + s.getMessage());
                }
            }
        }`, out: code`
        open db
        open file
        work
        close file
        close db
        caught: body failed
        suppressed: close failed: db` },
      callout: { kind: 'interview', text: "*Are exceptions slow?* Say: entering a `try` is free; creating an exception is costly mainly because of the stack trace; throwing and catching within one compiled method can even be optimised away. The design question matters more than speed: exceptions for exceptional conditions, return values for expected outcomes." },
      notes: [
        "Read the output closely: resources open in declaration order and close in reverse, both close calls happen even though the body threw, and the close failure of `db` is not lost — it rides along as a suppressed exception. A hand-written `finally { a.close(); }` that throws would have replaced *body failed* entirely.",
        "The exception table can be seen with `javap -c -p TwrDemo.class`: look for the `Exception table:` section listing from/to/target/type. It is a nice thing to have seen once before an interview that asks how exceptions work at the bytecode level.",
        "Stack-trace cost is real but often overstated. A few thousand exceptions per second are fine; hundreds of thousands per second in a parser or validator are not. Measure with JMH before optimising, and never optimise by removing stack traces from errors you need to debug.",
        "Error-handling style also affects observability: log an exception once, at the boundary where it is handled, with context (ids, inputs). Logging and rethrowing at every layer produces the same stack trace five times and hides the real signal."
      ]
    },
    {
      title: 'Deep dive: interface evolution, default methods & sealed hierarchies',
      lead: 'The rules the compiler applies when defaults collide, why defaults exist at all, and how sealed types plus pattern matching turn forgotten cases into compile errors.',
      points: [
        "Default-method resolution: (1) **the class wins** — a method in the class or any superclass beats every interface default; (2) the **most specific interface wins** — a sub-interface's default overrides its parent's; (3) otherwise the call is ambiguous and the class must override it, optionally delegating with `A.super.m()`.",
        "Defaults exist for **interface evolution**: Java 8 added `forEach`, `stream` and `removeIf` to `Collection` without breaking millions of implementations. A new default can still clash with an existing method of the same signature in some implementor.",
        "Abstract class vs interface today: interfaces may have default, static and private methods but **no instance state** and no constructors; abstract classes carry state, constructors and protected members, and use up the single superclass slot.",
        "**Sealed** types (Java 17) close a hierarchy: `sealed interface Payment permits Card, Upi, Wallet`. With records and pattern-matching `switch` (Java 21), the compiler checks **exhaustiveness** — add a subtype and every switch that does not handle it stops compiling.",
        "Guards (`case Card c when c.amount() > limit`) keep business rules readable without `instanceof` chains or the Visitor pattern.",
        "**Liskov substitution** check: a subtype may not demand more (stronger preconditions) or promise less (weaker postconditions) than its supertype. `java.sql.Timestamp extends Date` is the JDK's own cautionary tale — its Javadoc warns that `equals` is not symmetric with `Date.equals`."
      ],
      code: { lang: 'java', file: 'Payments.java', src: code`
        import java.util.List;

        public class Payments {
            sealed interface Payment permits Card, Upi, Wallet {}
            record Card(String last4, long rupees) implements Payment {}
            record Upi(String vpa, long rupees) implements Payment {}
            record Wallet(String provider, long rupees, boolean kycDone) implements Payment {}

            static String route(Payment p) {
                return switch (p) {                       // exhaustive over the sealed type: no default
                    case Card c when c.rupees() > 200_000 -> "card " + c.last4() + " -> step-up auth required";
                    case Card c -> "card " + c.last4() + " -> authorise";
                    case Upi u -> "upi " + u.vpa() + " -> collect request";
                    case Wallet w when !w.kycDone() -> "wallet " + w.provider() + " -> rejected (KYC)";
                    case Wallet w -> "wallet " + w.provider() + " -> debit";
                };
            }

            public static void main(String[] args) {
                List<Payment> ps = List.of(new Card("4242", 50_000), new Card("1881", 300_000),
                        new Upi("asha@okbank", 1_200), new Wallet("paytm", 99, false));
                ps.forEach(p -> System.out.println(route(p)));
            }
        }`, out: code`
        card 4242 -> authorise
        card 1881 -> step-up auth required
        upi asha@okbank -> collect request
        wallet paytm -> rejected (KYC)` },
      notes: [
        "Try it: delete the `case Upi u` line and compile. The error says the switch expression does not cover all possible input values — the compiler found the forgotten case for you. With an `if/else instanceof` chain the same mistake becomes a runtime bug.",
        "Guard order matters: the guarded `case Card c when …` must come before the unguarded `case Card c`, otherwise the compiler reports the guarded case as dominated (unreachable).",
        "This is the *expression problem* in miniature. Polymorphism makes adding new **types** easy (one new class) but adding new **operations** expensive (touch every class). Sealed types with switches make adding operations easy (one new method) and adding types safe, because the compiler lists every place to update.",
        "If code compiled against the old hierarchy meets a newly added subtype at run time, the switch throws `MatchException` rather than silently doing nothing — another reason sealed hierarchies are safer than open ones for closed sets such as payment types, events or commands."
      ]
    }
  ],

  stretch: [
    "Replace the banking core's checked `InsufficientFundsException` with a sealed `TransferResult` (`Success`, `InsufficientFunds`, `AccountFrozen`) and an exhaustive `switch` at the call site. Compare the two versions for readability and for what the compiler checks.",
    "Build the parking-lot design from today's design round end to end, with a pricing test driven by a fixed `Clock` and a concurrency test (8 threads, 50 spots, 800 cars) proving no spot is ever allocated twice.",
    "Benchmark creating and throwing one million exceptions with and without stack traces (`super(msg, null, false, false)`) using JMH. Explain the difference and when (if ever) the stack-less version is justified."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: flatten a nested list lazily (iterator design)',
      lead: 'An iterator-design problem that tests contracts (`hasNext` / `next`), laziness and recursion limits — and lets you show off sealed types.',
      difficulty: 'Medium', minutes: 35, lc: 341, pattern: ['design', 'stack'],
      problem: [
        "You are given a nested list of integers: each element is either an integer or a list whose elements may themselves be integers or lists, to any depth. Implement an iterator that returns the integers in order:",
        "- `NestedIterator(List<Nested> nestedList)` initialises the iterator.",
        "- `boolean hasNext()` returns `true` if any integers remain.",
        "- `Integer next()` returns the next integer.",
        "Callers use it as `while (it.hasNext()) out.add(it.next());`, but may also call `hasNext()` several times in a row. Do **not** flatten everything up front — the structure can be large and deeply nested."
      ],
      examples: [
        { in: '[[1,1],2,[1,1]]', out: '[1, 1, 2, 1, 1]' },
        { in: '[1,[4,[6]]]', out: '[1, 4, 6]' },
        { in: '[[],[[]],3]', out: '[3]', why: "Empty lists at any depth must be skipped." }
      ],
      constraints: ["`1 ≤ nestedList.length ≤ 500` at the top level", "Integer values are in `[-10⁶, 10⁶]`", "Follow-up: the nesting depth can reach `10⁶`"],
      hints: [
        "Flattening eagerly into a list in the constructor works but costs O(total) memory before the first `next()`. What does a recursive DFS keep on its call stack — and can you keep that yourself?",
        "Keep an explicit **stack of iterators**, one per open list. Let `hasNext()` do the work: if the top iterator is exhausted pop it; if its next element is a list push that list's iterator; if it is an integer, stash it and return `true`.",
        "Make `hasNext()` idempotent by caching the next integer in a field. `next()` calls `hasNext()` and throws `NoSuchElementException` when nothing is left."
      ],
      approaches: [
        { name: 'Eager flatten', idea: 'Recursive DFS into a list in the constructor, then iterate it', time: 'O(N) up front, O(1) per call', space: 'O(N + depth)' },
        { name: 'Stack of reversed elements', idea: 'Push elements in reverse; pop and expand lists until an integer is on top', time: 'O(1) amortised', space: 'O(N) worst case (copies)' },
        { name: 'Stack of iterators (lazy)', idea: 'One iterator per open list; `hasNext()` advances to the next integer and caches it', time: 'O(1) amortised per element', space: 'O(depth)' }
      ],
      code: { lang: 'java', file: 'NestedIterator.java', src: code`
        import java.util.*;

        public class NestedIterator implements Iterator<Integer> {
            sealed interface Nested permits Num, Lst {}
            record Num(int value) implements Nested {}
            record Lst(List<Nested> items) implements Nested {}

            private final Deque<Iterator<Nested>> stack = new ArrayDeque<>();
            private Integer nextVal;                  // cached by hasNext(): calling it twice is safe

            public NestedIterator(List<Nested> nestedList) { stack.push(nestedList.iterator()); }

            @Override public boolean hasNext() {
                while (nextVal == null && !stack.isEmpty()) {
                    Iterator<Nested> top = stack.peek();
                    if (!top.hasNext()) { stack.pop(); continue; }
                    switch (top.next()) {
                        case Num n -> nextVal = n.value();
                        case Lst l -> stack.push(l.items().iterator());   // descend lazily
                    }
                }
                return nextVal != null;
            }

            @Override public Integer next() {
                if (!hasNext()) throw new NoSuchElementException();
                Integer v = nextVal;
                nextVal = null;
                return v;
            }

            // ---- tests --------------------------------------------------------
            static void flattenRecursively(Nested n, List<Integer> out) {
                switch (n) {
                    case Num x -> out.add(x.value());
                    case Lst l -> { for (Nested c : l.items()) flattenRecursively(c, out); }
                }
            }

            private static int pos;
            static Nested parse(String s) { pos = 0; return parseAt(s); }
            private static Nested parseAt(String s) {
                if (s.charAt(pos) == '[') {
                    pos++;
                    List<Nested> items = new ArrayList<>();
                    while (s.charAt(pos) != ']') {
                        items.add(parseAt(s));
                        if (s.charAt(pos) == ',') pos++;
                    }
                    pos++;
                    return new Lst(items);
                }
                int start = pos;
                while (pos < s.length() && (s.charAt(pos) == '-' || Character.isDigit(s.charAt(pos)))) pos++;
                return new Num(Integer.parseInt(s.substring(start, pos)));
            }

            static List<Integer> drain(Iterator<Integer> it) {
                List<Integer> out = new ArrayList<>();
                while (it.hasNext()) { it.hasNext(); out.add(it.next()); }   // extra hasNext(): must be harmless
                return out;
            }

            public static void main(String[] args) {
                for (String in : List.of("[[1,1],2,[1,1]]", "[1,[4,[6]]]", "[[],[[]],3]")) {
                    System.out.println(in + " -> " + drain(new NestedIterator(((Lst) parse(in)).items())));
                }
                Nested deep = new Num(42);
                for (int i = 0; i < 1_000_000; i++) deep = new Lst(List.of(deep));
                System.out.println("depth 1000000 -> " + drain(new NestedIterator(List.of(deep))));
                try {
                    flattenRecursively(deep, new ArrayList<>());
                    System.out.println("recursive flatten: ok");
                } catch (StackOverflowError e) {
                    System.out.println("recursive flatten: StackOverflowError");
                }
            }
        }`, out: code`
        [[1,1],2,[1,1]] -> [1, 1, 2, 1, 1]
        [1,[4,[6]]] -> [1, 4, 6]
        [[],[[]],3] -> [3]
        depth 1000000 -> [42]
        recursive flatten: StackOverflowError` },
      pitfalls: [
        "Doing the work in `next()` and assuming `hasNext()` was called exactly once before it — callers may call `hasNext()` repeatedly or `next()` directly.",
        "Returning `true` from `hasNext()` just because the stack is not empty: `[[],[[]]]` has open lists but no integers.",
        "Recursion: a recursive flatten overflows the call stack on deeply nested input, as the million-level test shows.",
        "`next()` on an exhausted iterator must throw `NoSuchElementException`, not return `null` — that is the `Iterator` contract."
      ],
      followUps: [
        { q: "Support `remove()`.",
          a: "Remember the iterator that produced the last returned value and delegate `remove()` to it, allowed only directly after `next()`. Because `hasNext()` may already have advanced past that element (or popped its iterator), clear the remembered iterator whenever `hasNext()` moves on and throw `IllegalStateException` — the same contract as `Iterator.remove`. The underlying lists must be mutable; `List.of` lists throw `UnsupportedOperationException`." },
        { q: "Expose the flattened values as a `Stream<Integer>`.",
          a: "Either recurse with `flatMap` — `switch (n) { case Num x -> Stream.of(x.value()); case Lst l -> l.items().stream().flatMap(Flatten::flat); }` — which is lazy but nests one stream per level (deep input is still a problem), or wrap the iterator: `StreamSupport.stream(Spliterators.spliteratorUnknownSize(it, Spliterator.ORDERED), false)`, which keeps the O(depth) explicit stack." },
        { q: "The lists can be modified while someone is iterating. What happens and what would you do?",
          a: "`ArrayList` iterators are fail-fast and throw `ConcurrentModificationException` on the next call after a structural change. Decide the semantics with the interviewer: document *not thread-safe*, iterate a snapshot (copy-on-write lists), or accept weakly consistent views. Note that a lazy iterator sees changes in lists it has not reached yet — eager flattening would not." },
        { q: "Walk a file-system tree lazily the same way.",
          a: "Same design: a stack of directory listings, descending when an entry is a directory. `Files.walk` does exactly this depth-first and lazily — and because it holds open directory handles, it must be closed with try-with-resources." }
      ],
      rubric: [
        "Clarifies laziness, empty sub-lists and the `hasNext`/`next` calling contract before coding.",
        "Uses an explicit stack (no recursion) and makes `hasNext()` idempotent with a cached value.",
        "Honours the `Iterator` contract: `NoSuchElementException` when exhausted.",
        "States the complexity — O(1) amortised per element, O(depth) memory — and why.",
        "Models the input cleanly (sealed interface + records, or a `NestedInteger`-style interface)."
      ],
      notes: [
        "The test harness calls `hasNext()` twice per element on purpose — a common hidden test in real interviews. Implementations that advance inside `hasNext()` without caching fail it by skipping every other element.",
        "The million-level test shows why the explicit stack matters: the iterator handles it with an `ArrayDeque`, while the recursive flatten overflows the default thread stack. Interviewers increasingly ask *what happens with very deep input?* for any recursive solution.",
        "Sealed types make the switch inside `hasNext()` exhaustive — the deep dive on sealed hierarchies explains why that matters. In the original LeetCode version the input is a `NestedInteger` interface with `isInteger()`, `getInteger()` and `getList()`; the algorithm is identical."
      ]
    },
    {
      type: 'design',
      title: 'Design round: parking lot (low-level design / machine coding)',
      lead: 'The best-known LLD prompt. Interviewers grade abstractions, extensibility and concurrency — and whether the core flow actually runs.',
      kind: 'LLD', difficulty: 'Medium', minutes: 60,
      prompt: "Design the core of a multi-level parking lot. Vehicles of different sizes (motorbike, car, truck) park in compatible spots. Issue a ticket on entry and compute the fee on exit with pluggable pricing. Several entry gates work concurrently. Write the main classes and the park/unpark flow.",
      stages: [
        { t: 'Clarify requirements and scope', ask: 'What would you ask before drawing a single class?', points: [
          "Vehicle and spot sizes: may a motorbike use a car spot? (Yes — smaller vehicles may take bigger spots, never the reverse.)",
          "Multiple levels and multiple entry/exit gates working **concurrently**.",
          "A ticket on entry; a fee on exit based on duration and vehicle size; pricing rules change (weekend rates, first hour free).",
          "Out of scope — say it explicitly: payment integration, reservations, sensors and hardware, persistence. Keep the core in memory but behind interfaces."
        ] },
        { t: 'Core entities and responsibilities', ask: 'Which nouns become classes, and which of them carry behaviour?', diagram: { kind: 'erd', entities: [
          { n: 'ParkingLot', f: ['free spots by size', 'active tickets', 'pricing: PricingPolicy', 'clock: Clock'], tone: 'blue' },
          { n: 'Spot', f: ['level', 'id', 'size: Size'], tone: 'green' },
          { n: 'Vehicle', f: ['plate', 'size: Size'], tone: 'yellow' },
          { n: 'Ticket', f: ['id', 'vehicle', 'spot', 'entry: Instant'], tone: 'orange' }
        ], rels: ['ParkingLot 1 — * Spot', 'ParkingLot 1 — * Ticket (active)', 'Ticket * — 1 Spot', 'Ticket * — 1 Vehicle'] }, points: [
          "`enum Size { SMALL, MEDIUM, LARGE }` — vehicles and spots share one ordered scale, so *fits* is a comparison.",
          "`Vehicle`, `Spot` and `Ticket` are **records**: immutable data. Do not create `Car`/`Bike`/`Truck` subclasses unless they *behave* differently.",
          "`ParkingLot` is the façade the gates call (`park`, `unpark`); it owns the free-spot pools and active tickets."
        ] },
        { t: 'Variation points and patterns', ask: 'Where will requirements change? Hide each change behind an interface.', points: [
          "**Strategy** — `PricingPolicy { long fee(Ticket t, Instant exit); }`: hourly, flat or weekend rates; a decorator adds *first hour free* without editing them.",
          "**Strategy** — spot allocation: smallest compatible spot first, nearest to the gate, or spread across levels.",
          "**Observer** — a `SpotListener` keeps display boards up to date when occupancy changes.",
          "Inject `java.time.Clock` so fees are testable; never call `Instant.now()` inside business logic."
        ] },
        { t: 'The park/unpark flow and concurrency', ask: 'Two gates try to hand out the last car spot at the same moment. What happens in your design?', points: [
          "Free spots per size live in a `ConcurrentLinkedQueue<Spot>`; `poll()` is atomic, so two gates can never receive the same spot.",
          "Alternatives: a lock per level, or a CAS on `AtomicReference<Vehicle> occupiedBy` inside each spot (`compareAndSet(null, v)`) with retry.",
          "Active tickets live in a `ConcurrentHashMap`; exit = `remove(ticketId)` (atomic) → compute the fee → return the spot to its pool.",
          "Idempotency: a second exit with the same ticket finds nothing to remove, so the spot is never released twice."
        ], code: { lang: 'java', file: 'ParkingLotDemo.java', src: code`
          import java.time.*;
          import java.util.*;
          import java.util.concurrent.*;
          import java.util.concurrent.atomic.AtomicInteger;

          public class ParkingLotDemo {
              enum Size { SMALL, MEDIUM, LARGE }
              record Vehicle(String plate, Size size) {}
              record Spot(int level, int id, Size size) {}
              record Ticket(String id, Vehicle vehicle, Spot spot, Instant entry) {}

              interface PricingPolicy { long fee(Ticket t, Instant exit); }          // rupees

              static final class ParkingLot {
                  private final Map<Size, Queue<Spot>> free = new EnumMap<>(Size.class);
                  private final Map<String, Ticket> active = new ConcurrentHashMap<>();
                  private final AtomicInteger seq = new AtomicInteger();
                  private final PricingPolicy pricing;
                  private final Clock clock;

                  ParkingLot(List<Spot> spots, PricingPolicy pricing, Clock clock) {
                      for (Size s : Size.values()) free.put(s, new ConcurrentLinkedQueue<>());
                      spots.forEach(s -> free.get(s.size()).add(s));
                      this.pricing = pricing;
                      this.clock = clock;
                  }

                  /** Smallest compatible spot first; poll() is atomic, so gates never share a spot. */
                  Optional<Ticket> park(Vehicle v) {
                      for (Size s : Size.values()) {
                          if (s.compareTo(v.size()) < 0) continue;                    // spot too small
                          Spot spot = free.get(s).poll();
                          if (spot != null) {
                              Ticket t = new Ticket("T" + seq.incrementAndGet(), v, spot, clock.instant());
                              active.put(t.id(), t);
                              return Optional.of(t);
                          }
                      }
                      return Optional.empty();
                  }

                  /** Idempotent: a second exit with the same ticket releases nothing. */
                  OptionalLong unpark(String ticketId) {
                      Ticket t = active.remove(ticketId);
                      if (t == null) return OptionalLong.empty();
                      free.get(t.spot().size()).add(t.spot());
                      return OptionalLong.of(pricing.fee(t, clock.instant()));
                  }
              }

              public static void main(String[] args) {
                  PricingPolicy hourly = (t, exit) -> {                                // per started hour
                      long hours = Math.max(1, (Duration.between(t.entry(), exit).toMinutes() + 59) / 60);
                      return hours * (t.vehicle().size() == Size.SMALL ? 20 : 40);
                  };
                  MutableClock clock = new MutableClock(Instant.parse("2026-11-06T09:00:00Z"));
                  ParkingLot lot = new ParkingLot(List.of(new Spot(0, 1, Size.SMALL), new Spot(0, 2, Size.MEDIUM)), hourly, clock);
                  Ticket bike = lot.park(new Vehicle("TN01AB1234", Size.SMALL)).orElseThrow();
                  Ticket car = lot.park(new Vehicle("TN09CD5678", Size.MEDIUM)).orElseThrow();
                  System.out.println("bike -> " + bike.spot() + ", car -> " + car.spot());
                  System.out.println("truck parked? " + lot.park(new Vehicle("KA05EF0001", Size.LARGE)).isPresent());
                  clock.advance(Duration.ofMinutes(130));
                  System.out.println("car fee: Rs " + lot.unpark(car.id()).getAsLong());
                  System.out.println("second exit with the same ticket: " + lot.unpark(car.id()));

                  List<Spot> spots = new ArrayList<>();                                // 8 gates, 800 cars, 50 spots
                  for (int i = 0; i < 50; i++) spots.add(new Spot(i / 10, i, Size.MEDIUM));
                  ParkingLot big = new ParkingLot(spots, hourly, clock);
                  Set<Spot> taken = ConcurrentHashMap.newKeySet();
                  AtomicInteger parked = new AtomicInteger(), duplicates = new AtomicInteger();
                  try (ExecutorService gates = Executors.newFixedThreadPool(8)) {
                      for (int g = 0; g < 8; g++) {
                          int gate = g;
                          gates.submit(() -> {
                              for (int i = 0; i < 100; i++) {
                                  big.park(new Vehicle("G" + gate + "-" + i, Size.MEDIUM)).ifPresent(t -> {
                                      parked.incrementAndGet();
                                      if (!taken.add(t.spot())) duplicates.incrementAndGet();
                                  });
                              }
                          });
                      }
                  }
                  System.out.println("parked " + parked + " of 800, double allocations: " + duplicates);
              }

              /** Test clock: business code only ever sees java.time.Clock. */
              static final class MutableClock extends Clock {
                  private Instant now;
                  MutableClock(Instant start) { now = start; }
                  void advance(Duration d) { now = now.plus(d); }
                  @Override public Instant instant() { return now; }
                  @Override public ZoneId getZone() { return ZoneOffset.UTC; }
                  @Override public Clock withZone(ZoneId zone) { return this; }
              }
          }`, out: code`
          bike -> Spot[level=0, id=1, size=SMALL], car -> Spot[level=0, id=2, size=MEDIUM]
          truck parked? false
          car fee: Rs 120
          second exit with the same ticket: OptionalLong.empty
          parked 50 of 800, double allocations: 0` } },
        { t: 'Extensibility and testing', ask: 'The business adds EV-charging spots and monthly passes. What changes in your code?', points: [
          "EV spots: give `Spot` an `EnumSet<Feature>` and let the allocator filter by required features — tickets and pricing are untouched (open/closed principle).",
          "Monthly passes: a `PricingPolicy` decorator that charges pass holders nothing — a new class, no edits to existing ones.",
          "Tests: pricing with a fixed `Clock`; an invariant test (free + occupied spots is constant); a concurrency test with many threads racing for few spots, as in the demo.",
          "Persistence later: a `TicketRepository` interface with in-memory and JPA implementations (Session 11)."
        ] }
      ],
      followUps: [
        { q: "How would you support reservations made in advance?",
          a: "Add a `Reservation` with a time window and make the allocator skip spots reserved for an overlapping window — an interval-overlap check (Session 21's sweep line). Hold the spot a few minutes before the start, release no-shows after a grace period, and charge a no-show fee through a pricing decorator." },
        { q: "The lot becomes a chain of 500 lots with a mobile app that shows live availability.",
          a: "Each lot stays authoritative for its own spots (it must keep working offline) and publishes occupancy events to a central service — for example over Kafka — which maintains a read model in Redis for the app. App counts are eventually consistent; reservations go through the lot's own API so they remain authoritative." },
        { q: "How do you stop a car leaving without paying if the exit-gate service crashes mid-transaction?",
          a: "Model exit as a persisted state machine — `ACTIVE → PAYING → PAID → EXITED` — and open the barrier only in `PAID`. Use an idempotency key for the payment so a retry never charges twice, and on restart reconcile every ticket stuck in `PAYING` with the payment provider before deciding." }
      ],
      rubric: [
        "Clarifies scope and explicitly states what is left out.",
        "Entities have clear responsibilities; plain data is modelled with records and enums, not needless subclasses.",
        "Variation points (pricing, allocation) sit behind interfaces, and time is injected through `Clock`.",
        "Concurrency is handled with an atomic structure or CAS — and the candidate can explain why it is safe.",
        "The main flow actually runs, with tests or at least concrete test cases."
      ],
      notes: [
        "Machine-coding rounds usually give 60–90 minutes and expect running code. Get the smallest end-to-end flow working first (park → unpark → fee), then extend. A beautiful class diagram with nothing runnable scores lower than a working core with clear extension points.",
        "The demo in stage 4 is compiled and run by the course test suite: 8 threads race 800 cars for 50 spots, and exactly 50 park with zero double allocations — because `ConcurrentLinkedQueue.poll()` is atomic. Replace it with a plain `ArrayDeque` and the result becomes unpredictable.",
        "Common deductions: modelling each vehicle type as a subclass with no behaviour, calling `Instant.now()` inside pricing (untestable), a single `synchronized` method around everything without mentioning the throughput cost, and ignoring idempotent exit."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: abstraction, interfaces & exceptions',
      lead: 'Design-flavoured questions: interviewers use them to see whether you can turn language rules into good API decisions.',
      qa: [
        { level: 1, q: "Abstract class or interface — how do you choose in modern Java?",
          a: "Use an **interface** to define a capability or contract that unrelated classes can implement (`Comparable`, `PaymentGateway`), especially when an implementation may also need to extend something else — a class can implement many interfaces. Default methods let interfaces offer behaviour and evolve without breaking implementors, but they cannot hold instance state. Use an **abstract class** when implementations share **state** and constructor logic, or when you want a template method with protected hooks — at the cost of the single superclass slot. A common combination is an interface for the contract plus an abstract base class that implements the boring parts (`List` and `AbstractList`).",
          follow: ["Why can't interfaces have instance fields?", "When would you use both together?"] },
        { level: 2, q: "Two interfaces provide the same default method and a class implements both. What happens, and how do you resolve it?",
          a: "If neither interface is more specific than the other, the class fails to compile (*inherits unrelated defaults*). Resolve it by overriding the method in the class, optionally delegating to one side with `InterfaceA.super.method()`. Two further rules apply first: a method declared in the class or any superclass always wins over interface defaults (*class wins*), and if one interface extends the other, the sub-interface's default wins (*most specific wins*). These rules keep Java free of the diamond problem for state, because interfaces have no instance fields to duplicate.",
          follow: ["What does `A.super.m()` mean syntactically?", "Can an abstract class re-abstract a default method?"] },
        { level: 1, q: "Checked vs unchecked exceptions — when should an API throw each?",
          a: "Checked exceptions are for **recoverable conditions the caller is expected to handle** — the classic case is I/O. Unchecked exceptions are for **programming errors and broken preconditions** (null arguments, illegal state) that callers should not catch routinely. In practice, frameworks lean towards unchecked: Spring translates checked `SQLException` into the unchecked `DataAccessException` hierarchy, and checked exceptions fit badly with lambdas and streams. Whatever you choose, keep exceptions meaningful to the caller's level of abstraction — a service should throw `PaymentDeclinedException`, not leak `SQLException` or an HTTP-client exception.",
          follow: ["Why don't lambdas work well with checked exceptions?", "Is `InterruptedException` a good checked exception?"] },
        { level: 2, q: "What is wrong with `catch (Exception e) { throw new RuntimeException(e.getMessage()); }` — and with logging and rethrowing at every layer?",
          a: "Passing only the message **drops the cause and its stack trace**, so the original failure becomes undiagnosable; always chain: `throw new OrderFailedException(\"order \" + id + \" failed\", e)`. Catching `Exception` also catches things you cannot handle, including checked exceptions you never anticipated. Logging and rethrowing at every layer prints the same stack trace many times and buries the signal. The rule: catch only what you can handle or translate, add context (ids, inputs) when translating, and log once — at the boundary where the error is finally handled, such as a `@RestControllerAdvice` or a message-listener error handler.",
          follow: ["When is catching `Throwable` acceptable?", "How do you keep the correlation id in the log entry?"],
          flags: ["`catch (Exception e) { e.printStackTrace(); }` in service code", "Empty catch blocks"] },
        { level: 2, q: "Explain try-with-resources: close order, suppressed exceptions, and what happens if the second resource fails to open.",
          a: "Resources are initialised left to right and closed in **reverse** order, after the body and before any `catch` or `finally` of the same statement runs. If the body throws and a `close()` also throws, the body's exception propagates and the close exception is added to it via `addSuppressed`, retrievable with `getSuppressed()`. If the second resource's initialiser throws, the first resource — already open — is closed, and the second is never closed because it was never assigned. Resource variables are implicitly final, and since Java 9 an existing effectively-final variable can be used directly in the header: `try (conn) { … }`.",
          follow: ["Why is the body's exception the primary one rather than the close exception?", "What must a class implement to be usable here?"] },
        { level: 2, q: "What does `finally` do to a `return` inside `try`? Predict the output.",
          a: "When `try` executes `return x`, the return value is evaluated and saved **before** `finally` runs. Reassigning the local `x` in `finally` therefore does not change the result (`f()` returns 1), but mutating the *object* a returned reference points to does (`h()` returns `ab`). A `return` inside `finally` replaces the pending return or exception completely, so `g()` swallows the `IllegalStateException` and returns 3 — compilers warn that the finally block does not complete normally, and you should never write it.",
          code: { lang: 'java', file: 'FinallyDemo.java', src: code`
            public class FinallyDemo {
                static int f() {
                    int x = 1;
                    try { return x; } finally { x = 2; }          // the value 1 is already saved
                }

                @SuppressWarnings("finally")
                static int g() {
                    try { throw new IllegalStateException("lost"); } finally { return 3; }   // swallows it
                }

                static StringBuilder h() {
                    StringBuilder sb = new StringBuilder("a");
                    try { return sb; } finally { sb.append("b"); }   // same object, mutated afterwards
                }

                public static void main(String[] args) {
                    System.out.println(f() + " " + g() + " " + h());
                }
            }`, out: '1 3 ab' },
          follow: ["Does `finally` run if `System.exit()` is called in `try`?", "What about when the thread is killed?"] },
        { level: 2, q: "How would you design the exception hierarchy and error responses of a REST API?",
          a: "Define a small hierarchy of **domain** exceptions that describe what went wrong in business terms — `NotFoundException`, `ConflictException`, `ValidationException`, `ForbiddenException` — rather than one exception class per endpoint. Map them centrally in a `@RestControllerAdvice` to HTTP statuses (404, 409, 400/422, 403) and to RFC 9457 `ProblemDetail` bodies with a stable machine-readable `type`/error code, a human-readable `detail` and a correlation id. Never leak stack traces or SQL messages to clients. Everything unexpected becomes a 500 with a generic body and is logged with full detail. Keep the 4xx/5xx split honest: it drives alerting, because 5xx means *we* are broken.",
          follow: ["Why should error codes be stable across releases?", "Where do validation errors from `@Valid` fit in?"] },
        { level: 3, q: "Sealed interfaces with pattern matching, the Visitor pattern, or plain polymorphism — when do you use which?",
          a: "This is the expression problem. **Polymorphism** (an abstract method in each subtype) makes adding new **types** cheap — write one class — but adding a new **operation** means editing every type; it suits open hierarchies such as plugins and strategies. **Sealed types with an exhaustive `switch`** make adding new operations cheap — one new method with a switch — while adding a type stays safe, because the compiler lists every switch that must handle it; it suits closed, data-centric sets such as events, commands, payment methods and AST nodes. **Visitor** was the pre-Java-21 way to get double dispatch over a closed hierarchy; sealed types plus pattern matching replace it with far less ceremony. A useful heuristic: if the operations change more often than the types, go sealed; if the types change more often, go polymorphic.",
          follow: ["How do record patterns (deconstruction) change this?", "What happens at run time if a new subtype appears that old code does not know about?"] },
        { level: 2, q: "Give an example of a Liskov substitution violation you would catch in code review.",
          a: "A subtype breaks substitutability when it **demands more** (stronger preconditions) or **promises less** (weaker postconditions or surprise exceptions) than its parent. Classics: `Square extends Rectangle`, where `setWidth` silently changes the height and breaks callers' assumptions; a read-only collection whose `add` throws `UnsupportedOperationException` where callers expect a mutable `List`; a subclass that rejects `null` where the parent accepted it. The JDK has its own: `java.sql.Timestamp extends java.util.Date`, and the `Timestamp` Javadoc warns that its `equals` is not symmetric with `Date.equals`. The fix is usually composition or a narrower interface rather than inheritance.",
          follow: ["How do Java's *optional operations* in the collections API relate to LSP?"] },
        { level: 3, q: "Your service calls a flaky downstream API. Which failures should be exceptions and which return values, and how do you keep that handling from leaking into every layer?",
          a: [
            "**Classify** failures first: *transient* (timeouts, 503, connection resets) — retry with backoff and jitter inside the client adapter; *permanent* (400, 404, business rejections) — no retry, translate into domain outcomes; *unknown* (a timeout on a non-idempotent POST) — you do not know whether it happened, so you need an idempotency key and a reconciliation path.",
            "**Translate at the boundary** (anti-corruption layer): the adapter turns `HttpClientErrorException` and friends into `PaymentDeclined`, `PaymentPending` or `ProviderUnavailable`, so the domain never sees HTTP types.",
            "Use **return values** (a sealed result type) for expected business outcomes such as *declined*, and **exceptions** for *the dependency is down*.",
            "Protect the system with timeouts, a circuit breaker and bulkheads (Session 20), and emit metrics per failure class so dashboards show *which* kind of failure is rising."
          ],
          follow: ["Why must retries be limited to idempotent operations?", "How would you test the adapter's translation logic?"] }
      ],
      notes: [
        "Several of these questions come up in design-heavy interviews disguised as language trivia. When asked *checked or unchecked?*, interviewers are really asking how you would design an API that other teams will call.",
        "The `finally` program's output is verified by the course test suite. If you predicted `2` for `f()`, revisit the deep dive: the return value is saved before `finally` runs.",
        "For the Senior question, a crisp classification (transient / permanent / unknown) plus *translate at the boundary* is what separates a strong answer from a list of annotations."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            static String run() {
                StringBuilder sb = new StringBuilder();
                try {
                    try {
                        throw new IllegalArgumentException("x");
                    } finally {
                        sb.append("F1 ");
                    }
                } catch (RuntimeException e) {
                    sb.append("C:").append(e.getClass().getSimpleName()).append(' ');
                } finally {
                    sb.append("F2");
                }
                return sb.toString();
            }

            public static void main(String[] args) { System.out.println(run()); }
        }`, out: 'F1 C:IllegalArgumentException F2' },
      options: ['`C:IllegalArgumentException F1 F2`', '`F1 C:IllegalArgumentException F2`', '`F1 F2`', '`C:RuntimeException F1 F2`'], answer: 1,
      why: "The inner `finally` runs as the exception leaves the inner `try`, before the outer `catch` sees it. The catch reports the runtime class, not the declared catch type; the outer `finally` runs last." },
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            interface Greeter { default String hello() { return "interface"; } }
            static class Base { public String hello() { return "class"; } }
            static class Impl extends Base implements Greeter {}

            public static void main(String[] args) {
                System.out.println(new Impl().hello());
            }
        }`, out: 'class' },
      options: ['`interface`', '`class`', 'Compile error: ambiguous method', '`AbstractMethodError` at run time'], answer: 1,
      why: "*Class wins*: a concrete method inherited from a superclass takes precedence over any interface default. Ambiguity errors only arise between two interface defaults." },
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            static class R implements AutoCloseable {
                final String n;
                R(String n) { this.n = n; }
                public void close() { throw new IllegalStateException(n); }
            }

            public static void main(String[] args) {
                try (R a = new R("a"); R b = new R("b")) {
                    throw new RuntimeException("body");
                } catch (Exception e) {
                    StringBuilder sb = new StringBuilder(e.getMessage());
                    for (Throwable s : e.getSuppressed()) sb.append(' ').append(s.getMessage());
                    System.out.println(sb);
                }
            }
        }`, out: 'body b a' },
      options: ['`body`', '`a`', '`body b a`', '`body a b`'], answer: 2,
      why: "The body's exception is primary. Resources close in reverse order — `b`, then `a` — and each close failure is added as a suppressed exception in that order." },
    { level: 3, q: "Code switches exhaustively (no `default`) over `sealed interface Event permits Created, Paid`. Later, `Refunded` is added to the `permits` clause. What happens?",
      options: ['Every such switch fails to compile until it handles `Refunded`; already-compiled classes that meet a `Refunded` at run time throw `MatchException`', 'The switch silently skips `Refunded`', 'The compiler inserts a default branch that returns `null`', 'Permitted subtypes cannot be added after the first compilation'], answer: 0,
      why: "Exhaustiveness is checked at compile time, so recompiling surfaces every switch to update. Code compiled against the old hierarchy throws `MatchException` when it meets the new subtype instead of misbehaving silently." },
    { level: 2, q: "Which of these catch sequences is a compile error?",
      options: ['`catch (FileNotFoundException e) {} catch (IOException e) {}`', '`catch (IOException e) {} catch (FileNotFoundException e) {}`', '`catch (IllegalArgumentException | IllegalStateException e) {}`', '`catch (RuntimeException e) {} catch (Exception e) {}`'], answer: 1,
      why: "`FileNotFoundException` is a subclass of `IOException`, so after `catch (IOException e)` the second handler is unreachable — a compile error. Catch more specific types first." }
  ]
});
