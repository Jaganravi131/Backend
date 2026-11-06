/* Interview pack — Session 3: Singleton, exception propagation & lambdas */
COURSE.prep(3, {
  deepDives: [
    {
      title: 'Deep dive: lambdas under the hood & the memory model behind safe singletons',
      lead: 'What `invokedynamic` does with your lambda, what *capturing* really costs, and the happens-before rules that make (or break) lazy singletons.',
      points: [
        "A lambda compiles to a private synthetic method plus an **`invokedynamic`** call site. The first time it runs, `LambdaMetafactory` spins a **hidden class** implementing the functional interface; afterwards the linked call site is reused.",
        "A **non-capturing** lambda (`x -> x * 2`) evaluates to the same instance every time in current HotSpot; a **capturing** lambda allocates an object holding the captured values on each evaluation — often removed again by escape analysis.",
        "Captured locals must be **effectively final** because the lambda receives a *copy*. Fields are not copied: a lambda that touches a field captures `this`, which keeps the whole enclosing object alive as long as the lambda lives.",
        "**Double-checked locking** needs `volatile`: without it, another thread may see the reference assigned by `instance = new Config()` before the constructor's writes are visible — a non-null, half-initialised object.",
        "The **holder idiom** is lazy and thread-safe for free: the JVM initialises a class exactly once, under a lock, and every thread that later uses the class sees the completed initialisation (a happens-before edge).",
        "**Enum singletons** survive serialization (deserialising returns the existing constant) and reflection (`Constructor.newInstance` refuses to create enums) — the form *Effective Java* recommends when you truly need one instance per JVM."
      ],
      code: { lang: 'java', file: 'LambdaIdentity.java', src: code`
        import java.util.function.Supplier;

        public class LambdaIdentity {
            static Supplier<String> nonCapturing() { return () -> "hi"; }
            static Supplier<String> capturing(String name) { return () -> "hi " + name; }

            public static void main(String[] args) {
                System.out.println("non-capturing, same instance: " + (nonCapturing() == nonCapturing()));
                System.out.println("capturing, same instance:     " + (capturing("a") == capturing("a")));
                Runnable r = () -> { };
                System.out.println("lambda class is hidden:       " + r.getClass().isHidden());
            }
        }`, out: code`
        non-capturing, same instance: true
        capturing, same instance:     false
        lambda class is hidden:       true` },
      table: { head: ['Singleton form', 'Lazy?', 'Thread-safe?', 'Survives serialization / reflection?'], rows: [
        ['Eager `static final` field', 'No — created at class initialisation', 'Yes (class-init guarantee)', 'No / No (needs `readResolve` and a constructor guard)'],
        ['`synchronized getInstance()`', 'Yes', 'Yes, but every call takes a lock', 'No / No'],
        ['Double-checked locking + `volatile`', 'Yes', 'Yes — only with `volatile`', 'No / No'],
        ['Holder class idiom', 'Yes — on first `getInstance()`', 'Yes (class-init guarantee)', 'No / No'],
        ['`enum` with one constant', 'No (initialised with the enum class)', 'Yes', 'Yes / Yes']
      ] },
      notes: [
        "The identity results describe current HotSpot behaviour, not a language guarantee: the spec deliberately leaves lambda identity unspecified, so never use `==` on lambdas in real code. The point for interviews is the cost model — non-capturing lambdas are effectively free, capturing ones allocate.",
        "Why is DCL broken without `volatile`? The writes inside the constructor and the write of the reference are independent as far as the memory model is concerned, so the compiler or CPU may make the reference visible first. `volatile` adds a happens-before edge between the writer's write and the reader's read, which forbids that reordering. Objects whose fields are all `final` get a separate guarantee — final fields are visible after the constructor completes — but relying on that is subtle.",
        "In Spring applications you rarely write any of these: a Spring bean is a singleton *per application context*, created and published safely by the container. The GoF Singleton matters for library code and for understanding interview questions about safe publication."
      ]
    }
  ],

  stretch: [
    "Make the config singleton survive serialization (`readResolve`) and a reflection attack (throw from the constructor if an instance already exists), prove both with tests, then compare the code with an enum singleton.",
    "Extend today's calculator with unary minus and variables. Parse once into a sealed `Expr` AST (records `Num`, `Var`, `Neg`, `Bin`) and evaluate it one million times with different variable maps; measure parse-once against parse-every-time.",
    "Back the pricing pipeline with the `CompletableFuture` memoizer from today's Q&A and write a test proving that 50 concurrent callers trigger exactly one computation per key."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: expression calculator with precedence & parentheses',
      lead: 'A parsing problem that tests stacks, precedence and associativity — and, in this course, a lambda-driven operator table and precise error propagation.',
      difficulty: 'Hard', minutes: 45, lc: 772, pattern: ['stack', 'strings'],
      problem: [
        "Implement `int eval(String s)` for expressions containing non-negative integers, the operators `+ - * /`, parentheses and spaces. Multiplication and division bind tighter than addition and subtraction, operators of equal precedence are **left-associative**, and integer division truncates toward zero.",
        "Malformed input (unbalanced parentheses, a missing operand, an unknown character) must raise an exception that reports **the position** of the problem. Do not use `eval`-style library calls."
      ],
      examples: [
        { in: '"3+2*2"', out: '7' },
        { in: '"2*(5+5*2)/3+(6/2+8)"', out: '21' },
        { in: '"8-3-2"', out: '3', why: "Left associativity: (8 − 3) − 2, not 8 − (3 − 2)." },
        { in: '"1 + * 2"', out: 'error: missing operand before \'*\' at position 4' }
      ],
      constraints: ["`1 ≤ s.length ≤ 10⁴`", "Every intermediate result fits in a 32-bit `int` for valid input", "Unary minus is **not** required (it is a follow-up)"],
      hints: [
        "Without parentheses you can apply `*` and `/` as soon as you have their right operand. What do you keep for `+` and `−`?",
        "Use two stacks — numbers and operators. Before pushing an operator, **reduce** while the operator on top has greater **or equal** precedence; *equal* is what gives left associativity.",
        "Treat `(` as a barrier on the operator stack and reduce back to it on `)`. A boolean *expecting an operand* catches most malformed input with a precise position."
      ],
      approaches: [
        { name: 'Recursive descent', idea: 'One method per precedence level: expr → term (± term)*, term → factor (×÷ factor)*, factor → number | ( expr )', time: 'O(n)', space: 'O(depth) call stack' },
        { name: 'Single stack (no parentheses)', idea: 'Apply × and ÷ to the stack top immediately; push ± numbers as signed values; sum at the end', time: 'O(n)', space: 'O(n)' },
        { name: 'Two stacks (shunting-yard)', idea: 'Operand and operator stacks; reduce while the top has ≥ precedence; parentheses act as barriers', time: 'O(n)', space: 'O(n)' }
      ],
      code: { lang: 'java', file: 'Calculator.java', src: code`
        import java.util.*;
        import java.util.function.IntBinaryOperator;

        public class Calculator {
            /** Carries the position of the offending character so callers can point at it. */
            static final class ParseException extends RuntimeException {
                final int pos;
                ParseException(String msg, int pos) { super(msg + " at position " + pos); this.pos = pos; }
            }

            record Op(int precedence, IntBinaryOperator apply) {}

            // operator table: adding '%' is one more entry; the *Exact methods turn overflow into exceptions
            private static final Map<Character, Op> OPS = Map.of(
                    '+', new Op(1, Math::addExact),
                    '-', new Op(1, Math::subtractExact),
                    '*', new Op(2, Math::multiplyExact),
                    '/', new Op(2, Math::divideExact));                 // truncates toward zero (Java 18+)

            static int eval(String s) {
                Deque<Integer> nums = new ArrayDeque<>();
                Deque<Character> ops = new ArrayDeque<>();              // operators and '('
                boolean expectOperand = true;
                for (int i = 0; i < s.length(); i++) {
                    char c = s.charAt(i);
                    if (c == ' ') continue;
                    if (Character.isDigit(c)) {
                        if (!expectOperand) throw new ParseException("unexpected number", i);
                        int v = 0;
                        while (i < s.length() && Character.isDigit(s.charAt(i))) {
                            v = Math.addExact(Math.multiplyExact(v, 10), s.charAt(i++) - '0');
                        }
                        i--;
                        nums.push(v);
                        expectOperand = false;
                    } else if (c == '(') {
                        if (!expectOperand) throw new ParseException("unexpected '('", i);
                        ops.push(c);
                    } else if (c == ')') {
                        if (expectOperand) throw new ParseException("unexpected ')'", i);
                        while (!ops.isEmpty() && ops.peek() != '(') reduce(nums, ops);
                        if (ops.isEmpty()) throw new ParseException("unbalanced ')'", i);
                        ops.pop();                                      // drop the '('
                    } else if (OPS.containsKey(c)) {
                        if (expectOperand) throw new ParseException("missing operand before '" + c + "'", i);
                        while (!ops.isEmpty() && ops.peek() != '('
                                && OPS.get(ops.peek()).precedence() >= OPS.get(c).precedence()) {
                            reduce(nums, ops);                          // >= gives left associativity
                        }
                        ops.push(c);
                        expectOperand = true;
                    } else {
                        throw new ParseException("unexpected '" + c + "'", i);
                    }
                }
                if (expectOperand) throw new ParseException("expression ends early", s.length());
                while (!ops.isEmpty()) {
                    if (ops.peek() == '(') throw new ParseException("unclosed '('", s.length());
                    reduce(nums, ops);
                }
                return nums.pop();
            }

            private static void reduce(Deque<Integer> nums, Deque<Character> ops) {
                int b = nums.pop(), a = nums.pop();
                nums.push(OPS.get(ops.pop()).apply().applyAsInt(a, b));
            }

            public static void main(String[] args) {
                for (String e : List.of("3+2*2", " 3/2 ", " 3+5 / 2 ", "8-3-2", "2*(5+5*2)/3+(6/2+8)",
                        "(2+6* 3+5- (3*14/7+2)*5)+3")) {
                    System.out.println(e.strip() + " = " + eval(e));
                }
                for (String bad : List.of("2*(3+4", "1 + * 2", "12 34", "7 / (3 - 3)", "2 ^ 3")) {
                    try {
                        eval(bad);
                    } catch (ParseException | ArithmeticException ex) {
                        System.out.println(bad + " -> " + ex.getClass().getSimpleName() + ": " + ex.getMessage());
                    }
                }
            }
        }`, out: code`
        3+2*2 = 7
        3/2 = 1
        3+5 / 2 = 5
        8-3-2 = 3
        2*(5+5*2)/3+(6/2+8) = 21
        (2+6* 3+5- (3*14/7+2)*5)+3 = -12
        2*(3+4 -> ParseException: unclosed '(' at position 6
        1 + * 2 -> ParseException: missing operand before '*' at position 4
        12 34 -> ParseException: unexpected number at position 3
        7 / (3 - 3) -> ArithmeticException: / by zero
        2 ^ 3 -> ParseException: unexpected '^' at position 2` },
      pitfalls: [
        "Reducing only on **strictly** greater precedence breaks left associativity: `8-3-2` evaluates as 8 − (3 − 2) = 7.",
        "Integer division must truncate toward zero. Java's `/` does; Python's `//` floors — a classic bug when translating solutions.",
        "Silent overflow: plain `+` and `*` wrap around. The `*Exact` methods (and parsing digits with them) turn overflow into an `ArithmeticException`.",
        "Malformed input surfacing as `EmptyStackException` or `NoSuchElementException` from deep inside the algorithm — validate as you go and report a position."
      ],
      followUps: [
        { q: "Add unary minus: `-(2+3)*4` and `3*-2`.",
          a: "Use the *expecting an operand* flag: a `-` that arrives when an operand is expected is unary. Push a special negation operator with the highest precedence that pops **one** operand (and is right-associative, so `--2` works). Test the tricky case `2--3`: binary minus followed by unary minus, which equals 5." },
        { q: "Support variables and functions such as `max(a, b*2)`.",
          a: "Tokenise identifiers, look variables up in a `Map<String, Integer>`, and treat functions as operators with an arity — recursive descent handles this more naturally than shunting-yard. At this point build an AST (a sealed `Expr` with records `Num`, `Var`, `Bin`, `Call`) and evaluate it; the same tree can also be simplified, type-checked or printed." },
        { q: "The same rule is evaluated millions of times with different variables (a pricing rule engine). How do you make it fast?",
          a: "Parse once, evaluate many times. Compile the AST into a tree of lambdas — every node becomes a `ToIntFunction<Map<String, Integer>>` composed from its children — so evaluation never touches the string again. The JIT then inlines the small lambdas. Cache compiled rules by their source text, invalidating when the rule changes." }
      ],
      rubric: [
        "Clarifies the syntax (parentheses, unary minus, spaces), division semantics and error behaviour first.",
        "Implements precedence **and** associativity correctly, with parentheses as barriers.",
        "Reports malformed input with a meaningful exception and position instead of crashing inside a stack.",
        "Tests precedence (`3+2*2`), associativity (`8-3-2`), nesting and error cases.",
        "Keeps the operator table data-driven (a map of lambdas or method references), so new operators are one line."
      ],
      notes: [
        "LeetCode 227 is the same problem without parentheses (Medium); 772 adds them (Hard). Interviewers often start with 227 and add parentheses as a follow-up — the two-stack algorithm handles both, so it is worth learning instead of the single-stack trick.",
        "The custom `ParseException` ties back to this session's propagation slides: it is unchecked, carries context (the position), and propagates through the stacks untouched until a caller that can handle it — a UI highlighting the bad character, or a `@RestControllerAdvice` returning 400 with the position.",
        "`Math.divideExact` (Java 18+) throws on division by zero and on the single overflowing case, `Integer.MIN_VALUE / -1`, which the plain `/` silently returns as `Integer.MIN_VALUE`."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: singletons, propagation & lambdas',
      lead: 'Concurrency-flavoured questions hide inside this topic: safe publication, shared state in Spring beans and thread-safe memoisation.',
      qa: [
        { level: 1, q: "Why is the double-checked locking singleton broken without `volatile`?",
          a: "DCL checks `instance == null` once without a lock and again inside `synchronized`. The writer is fine, but the **reader** of the first check takes no lock, so there is no happens-before relationship between the writer's constructor writes and the reader's view. The JIT or CPU may publish the reference before the fields are written, so a reader can see a non-null instance with default field values. Declaring the field `volatile` makes the write of the reference a release and the read an acquire, which forbids that reordering. Simpler alternatives — the holder idiom or an enum — avoid the question entirely.",
          follow: ["Why is the second null check inside `synchronized` needed?", "What does `volatile` cost on modern hardware?"],
          flags: ["*`synchronized` on the write is enough*", "Not being able to say what goes wrong without `volatile`"] },
        { level: 1, q: "Compare eager initialisation, a synchronized getter, the holder idiom and an enum singleton. Which do you choose?",
          a: "Eager `static final` is simplest and thread-safe through class initialisation, but creates the instance even if never used. A `synchronized` getter is lazy and safe but locks on every call. The **holder idiom** — a private static nested class holding the instance — is lazy *and* lock-free after initialisation because the JVM initialises the holder class once, on first use. An **enum** with one constant is the most robust: thread-safe, and it survives serialization and reflection. I default to the holder idiom for lazy library singletons, an enum when serialization or reflection safety matters — and in application code I let the DI container manage singletons instead.",
          follow: ["Why can't an enum singleton be lazily initialised separately from the enum class?"] },
        { level: 2, q: "How can a singleton be broken, and how do you defend against each attack?",
          a: [
            "**Reflection**: `setAccessible(true)` on the private constructor creates a second instance. Defend by throwing from the constructor if an instance already exists, or use an enum, which the JVM refuses to instantiate reflectively.",
            "**Serialization**: deserialising creates a new object. Add `readResolve()` returning the existing instance, or use an enum.",
            "**Cloning**: do not implement `Cloneable`, or throw from `clone()`.",
            "**Multiple class loaders**: each loader that loads the class gets its own copy — common in application servers and plugin systems. A singleton is unique per class loader, not per JVM.",
            "**Multiple Spring contexts**: a Spring singleton is unique per `ApplicationContext`; parent and child contexts can each create one."
          ],
          follow: ["Which of these attacks does an enum singleton not prevent?"] },
        { level: 2, q: "Spring beans are singletons by default. Is that the GoF Singleton, and what does it mean for thread safety?",
          a: "No — a Spring singleton is *one instance per container* (per bean definition), created and published safely by the framework; the class itself can still be instantiated elsewhere, for example in a unit test. Because one instance serves **every concurrent request**, any mutable instance field is shared state: storing the current user or a request-scoped counter in a field of a `@Service` is a race condition. Keep beans stateless — pass data through method parameters and locals — and when you need shared mutable state, use thread-safe types (`ConcurrentHashMap`, `AtomicLong`), request-scoped beans, or an external store.",
          follow: ["How would a prototype-scoped bean injected into a singleton behave?", "Where do request-scoped values usually live instead?"],
          flags: ["Storing request data in a field of a `@Service` or `@Controller`"] },
        { level: 2, q: "What happens when code inside `stream().map(...)` throws a checked exception, and how do you handle it?",
          a: "It does not compile: `Function.apply` declares no checked exceptions. The options, from most to least recommended: (1) handle it inside the lambda and translate it into a domain result or an unchecked exception that carries the cause (`UncheckedIOException` exists for I/O); (2) write a small adapter such as `unchecked(ThrowingFunction<T, R>)` that wraps and rethrows, keeping the pipeline readable; (3) return a result type (success or failure per element) when failures are expected and should not abort the whole stream; (4) use a plain loop when the error handling is the interesting part. The *sneaky throw* generics trick compiles but hides checked exceptions from callers and should be avoided in application code.",
          follow: ["What happens to the remaining elements when one element throws?"] },
        { level: 2, q: "What does `this` mean inside a lambda compared with an anonymous class, and how can that cause a memory leak?",
          a: "A lambda has no identity of its own: `this` refers to the **enclosing instance**, and a lambda that uses instance members captures that instance. An anonymous class is a real object, so `this` refers to the anonymous instance, and it holds a reference to its enclosing instance as well. The leak: registering such a callback with something long-lived — an event bus, a static listener list, a cache — keeps the entire enclosing object graph reachable after the component should be gone. Unregister callbacks when the owner is closed, capture only the values you need (copy them into locals first), or use weak references for listener registries.",
          follow: ["Does a lambda that only uses its parameters capture `this`?"] },
        { level: 2, q: "Explain `andThen` versus `compose`, and how you would build a pricing pipeline from small functions.",
          a: "`f.andThen(g)` means *first f, then g* — `g(f(x))`; `f.compose(g)` means *first g, then f* — `f(g(x))`. A pipeline is a list of small, individually testable steps such as `UnaryOperator<BigDecimal>` for discount, tax and rounding, folded into one function: `steps.stream().reduce(Function.identity(), Function::andThen)`. Benefits: each rule is a pure function that is easy to test, rules can be reordered or configured per market, and new rules do not touch existing ones. Watch the order — applying tax before or after a discount changes the price — and make that order explicit in configuration and tests.",
          follow: ["Why is a pure function easier to test and cache?"] },
        { level: 3, q: "Design a thread-safe memoizer for an expensive computation. What are the pitfalls of `ConcurrentHashMap.computeIfAbsent`?",
          a: "`computeIfAbsent` is atomic per key, but it runs the mapping function **while holding the bin lock**: other keys in the same bin wait behind a slow computation, a function that modifies the same map can throw `IllegalStateException: Recursive update`, and an exception leaves nothing cached, so every caller retries. The classic fix (from *Java Concurrency in Practice*) caches a **future** instead of the value: `putIfAbsent(key, future)` is cheap and atomic, the winning thread computes outside any lock and completes the future, and every other caller simply waits for it. Remove the future if the computation fails so the next caller can retry, and add bounds and expiry — at which point Caffeine's `AsyncLoadingCache` does all of this for you.",
          code: { lang: 'java', file: 'Memoizer.java', src: code`
            import java.util.*;
            import java.util.concurrent.*;
            import java.util.concurrent.atomic.AtomicInteger;
            import java.util.function.Function;

            public class Memoizer<K, V> {
                private final ConcurrentHashMap<K, CompletableFuture<V>> cache = new ConcurrentHashMap<>();
                private final Function<K, V> compute;

                Memoizer(Function<K, V> compute) { this.compute = compute; }

                V get(K key) {
                    CompletableFuture<V> f = cache.get(key);
                    if (f == null) {
                        CompletableFuture<V> mine = new CompletableFuture<>();
                        f = cache.putIfAbsent(key, mine);       // cheap and atomic: no user code under a lock
                        if (f == null) {                         // we won: compute outside any lock
                            f = mine;
                            try {
                                mine.complete(compute.apply(key));
                            } catch (RuntimeException e) {
                                cache.remove(key, mine);         // let the next caller retry
                                mine.completeExceptionally(e);
                            }
                        }
                    }
                    return f.join();                             // everyone else waits for the winner
                }

                public static void main(String[] args) {
                    AtomicInteger calls = new AtomicInteger();
                    Memoizer<Integer, Integer> m = new Memoizer<>(k -> {
                        calls.incrementAndGet();
                        try { Thread.sleep(50); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                        return k * 2;
                    });
                    List<Integer> results = Collections.synchronizedList(new ArrayList<>());
                    try (ExecutorService pool = Executors.newFixedThreadPool(10)) {
                        for (int i = 0; i < 10; i++) pool.submit(() -> results.add(m.get(21)));
                    }
                    System.out.println("computations: " + calls.get() + ", results: " + results);
                }
            }`, out: 'computations: 1, results: [42, 42, 42, 42, 42, 42, 42, 42, 42, 42]' },
          follow: ["How would you add expiry?", "What happens if the computation hangs forever?"] },
        { level: 3, q: "A request fails deep in a call chain: controller → service → repository → JDBC. Trace how the exception propagates, where it is translated, where the transaction rolls back, and where it is logged.",
          a: [
            "1. The JDBC driver throws a checked `SQLException` (say, a unique-constraint violation).",
            "2. Spring's repository infrastructure **translates** it into the unchecked `DataAccessException` hierarchy — here `DuplicateKeyException` — using the SQL state and vendor error code, so higher layers are database-independent.",
            "3. The exception propagates out of the `@Transactional` service method; the transaction proxy sees a `RuntimeException` and **rolls back** (by default rollback happens for unchecked exceptions and `Error`s, not for checked exceptions unless you set `rollbackFor`).",
            "4. The service may translate it again into a domain exception (`EmailAlreadyRegisteredException`) with business context.",
            "5. A `@RestControllerAdvice` maps it to `409 Conflict` with a problem-details body and logs it **once**, with the correlation id.",
            "Trap: catching the exception inside the transactional method and returning normally commits the transaction — or, if an inner transactional call already marked it rollback-only, fails with `UnexpectedRollbackException` at commit."
          ],
          follow: ["Why don't checked exceptions trigger a rollback by default?", "What changes if the service method calls another `@Transactional` method on `this`?"] },
        { level: 2, q: "Why must captured local variables be effectively final, and why is the usual workaround — an array or `AtomicInteger` counter — often wrong?",
          a: "The lambda receives a **copy** of each captured local, taken when the lambda is created; allowing later mutation would make that copy silently stale, and locals live on a stack that may be gone by the time the lambda runs on another thread. The workaround of capturing a one-element array or an `AtomicInteger` and mutating it compiles, but it smuggles side effects into what should be a pure pipeline: with a sequential stream it hides intent, and with a parallel stream the array version is a data race. Express the result with the stream itself — `count()`, `sum()`, `reduce`, `collect(groupingBy(...))` — or use a plain loop when mutation is the point.",
          follow: ["Is capturing an effectively-final *reference* to a mutable object allowed?"] }
      ],
      notes: [
        "Interviewers rarely ask about singletons for their own sake — they use them as an entry point to safe publication and the Java memory model. Make sure you can draw the reordering problem of DCL on a whiteboard.",
        "The memoizer program is verified by the course test suite: ten threads ask for the same key concurrently and the computation runs exactly once. Try changing it to a plain `HashMap` and observe duplicate computations and lost results.",
        "For the propagation question, mention both translation points (SQL to data-access exceptions, then to domain exceptions) and the rollback rule for checked exceptions — that combination shows real Spring experience."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.function.Supplier;

        public class Main {
            String name = "outer";

            String test() {
                Supplier<String> lambda = () -> this.name;
                Supplier<String> anon = new Supplier<>() {
                    String name = "anon";
                    public String get() { return this.name; }
                };
                return lambda.get() + " / " + anon.get();
            }

            public static void main(String[] args) { System.out.println(new Main().test()); }
        }`, out: 'outer / anon' },
      options: ['`outer / outer`', '`outer / anon`', '`anon / anon`', 'Compile error: `this` is not allowed in a lambda'], answer: 1,
      why: "Inside a lambda `this` is the enclosing instance, so it reads `Main.name`. Inside an anonymous class `this` is the anonymous object itself, which declares its own `name`." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.function.Function;

        public class Main {
            public static void main(String[] args) {
                Function<Integer, Integer> plus2 = x -> x + 2;
                Function<Integer, Integer> times3 = x -> x * 3;
                System.out.println(plus2.andThen(times3).apply(1) + " " + plus2.compose(times3).apply(1));
            }
        }`, out: '9 5' },
      options: ['`9 5`', '`5 9`', '`9 9`', '`5 5`'], answer: 0,
      why: "`andThen` applies `plus2` first: (1 + 2) × 3 = 9. `compose` applies `times3` first: 1 × 3 + 2 = 5." },
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            static String log = "";

            static void c() { log += "c "; throw new IllegalStateException("boom"); }
            static void b() { try { c(); } finally { log += "b-finally "; } }
            static void a() {
                try { b(); }
                catch (IllegalStateException e) { log += "a-caught "; throw new RuntimeException("wrapped", e); }
            }

            public static void main(String[] args) {
                try { a(); } catch (RuntimeException e) { log += e.getMessage() + "<-" + e.getCause().getMessage(); }
                System.out.println(log);
            }
        }`, out: 'c b-finally a-caught wrapped<-boom' },
      options: ['`c a-caught b-finally wrapped<-boom`', '`c b-finally a-caught wrapped<-boom`', '`c b-finally wrapped<-boom`', '`c b-finally a-caught boom`'], answer: 1,
      why: "The exception unwinds `c → b → a`: `b`'s `finally` runs as it leaves `b`, `a` catches and wraps it with the original as the cause, and `main` reads both messages." },
    { level: 3, q: "In double-checked locking **without** `volatile`, what can another thread observe?",
      options: ['A non-null reference to an object whose fields still hold their default values', 'A `NullPointerException` thrown inside the synchronized block', 'Two different instances returned to the same thread', 'Nothing — the `synchronized` block on the write side is enough'], answer: 0,
      why: "The unsynchronised first read has no happens-before edge with the constructor's writes, so the reference may become visible before the fields do. `volatile` (or the holder idiom) fixes it." },
    { level: 2, q: "Which statement about `ConcurrentHashMap.computeIfAbsent` is true?",
      options: ['The mapping function may run several times for the same key under contention', 'If the mapping function returns `null`, no mapping is recorded', 'The mapping function runs outside any lock', 'An exception thrown by the function is cached for that key'], answer: 1,
      why: "`ConcurrentHashMap` runs the function at most once per key, atomically, under the bin lock. A `null` result records nothing, and an exception propagates to the caller without caching anything — so the next call tries again." }
  ]
});
