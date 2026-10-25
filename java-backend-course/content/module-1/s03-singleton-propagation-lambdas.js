COURSE.session({
  no: 3,
  short: 'Singleton, propagation & lambdas',
  title: 'Singleton Pattern, Exception Propagation, Lambdas & Functional Interfaces',
  covers: [2, 3],
  objectives: [
    "Implement a thread-safe Singleton (holder idiom, double-checked locking, enum) and know how singletons break.",
    "Trace how an exception propagates up the call stack, and decide where to catch, wrap or rethrow it.",
    "Write lambda expressions and method references against functional interfaces.",
    "Use and compose `Predicate`, `Function`, `Consumer`, `Supplier` and custom functional interfaces."
  ],
  prereq: "Session 2: interfaces (incl. default methods) and the exception hierarchy.",
  slides: [
    {
      type: 'theory',
      title: 'Design patterns & the Singleton',
      lead: 'A design pattern is a proven, named solution to a recurring design problem. **Singleton** ensures a class has **exactly one instance** with a global access point.',
      points: [
        "Typical uses: configuration, a registry/cache, a connection-pool manager, a metrics registry.",
        "Recipe: a `private` constructor, a `static` field holding the instance, a `static` accessor.",
        "Hard parts: **lazy** creation, **thread safety**, and resisting reflection/serialization.",
        "In Spring apps you rarely hand-write singletons — beans are *singleton-scoped* by default (Session 8)."
      ],
      diagram: { kind: 'grid', cols: 3, items: [
        { icon: '🏭', t: 'Creational', s: 'Singleton, Factory, Builder', tone: 'green' },
        { icon: '🧱', t: 'Structural', s: 'Adapter, Decorator, Proxy', tone: 'blue' },
        { icon: '🔁', t: 'Behavioural', s: 'Strategy, Observer, Template Method', tone: 'purple' }
      ], caption: 'The three GoF pattern families — we use many of them in this course' },
      notes: [
        "Patterns are vocabulary: saying 'use a Strategy here' communicates a whole design in two words. We already met Template Method in Session 2; we will use Strategy for Splitwise split types (Session 13) and Proxy is how Spring implements AOP and `@Transactional` (Session 9).",
        "Singleton is the most famous and the most misused pattern. A global mutable singleton is effectively a global variable — it hides dependencies and makes testing hard. Teach it well, then explain why dependency injection usually replaces it."
      ]
    },
    {
      type: 'practical',
      title: 'Four ways to implement a Singleton',
      lead: 'All four return the same instance every time; they differ in laziness, thread-safety and robustness.',
      code: { lang: 'java', file: 'SingletonDemo.java', src: code`
        import java.util.Map;
        import java.util.concurrent.ConcurrentHashMap;

        // 1) Eager: created when the class is initialised. Simple and thread-safe.
        class EagerConfig {
            private static final EagerConfig INSTANCE = new EagerConfig();
            private EagerConfig() {}
            static EagerConfig getInstance() { return INSTANCE; }
        }

        // 2) Double-checked locking: lazy + thread-safe. 'volatile' is essential.
        class DclConfig {
            private static volatile DclConfig instance;
            private DclConfig() {}
            static DclConfig getInstance() {
                DclConfig local = instance;
                if (local == null) {                         // 1st check, no lock
                    synchronized (DclConfig.class) {
                        local = instance;
                        if (local == null) {                 // 2nd check, with lock
                            instance = local = new DclConfig();
                        }
                    }
                }
                return local;
            }
        }

        // 3) Initialization-on-demand holder (Bill Pugh): lazy, thread-safe, lock-free.
        class HolderConfig {
            private HolderConfig() { System.out.println("HolderConfig created"); }
            private static class Holder { static final HolderConfig INSTANCE = new HolderConfig(); }
            static HolderConfig getInstance() { return Holder.INSTANCE; }
        }

        // 4) Enum: simplest; safe against reflection and serialization.
        enum AppRegistry {
            INSTANCE;
            private final Map<String, String> settings = new ConcurrentHashMap<>();
            void put(String k, String v) { settings.put(k, v); }
            String get(String k) { return settings.get(k); }
        }

        public class SingletonDemo {
            public static void main(String[] args) {
                System.out.println("before first use");
                HolderConfig a = HolderConfig.getInstance();   // Holder initialised only now
                HolderConfig b = HolderConfig.getInstance();
                System.out.println("same holder instance? " + (a == b));
                System.out.println("same eager instance?  " + (EagerConfig.getInstance() == EagerConfig.getInstance()));
                System.out.println("same DCL instance?    " + (DclConfig.getInstance() == DclConfig.getInstance()));
                AppRegistry.INSTANCE.put("currency", "INR");
                System.out.println("registry currency = " + AppRegistry.INSTANCE.get("currency"));
            }
        }`, out: code`
        before first use
        HolderConfig created
        same holder instance? true
        same eager instance?  true
        same DCL instance?    true
        registry currency = INR` },
      notes: [
        "The holder idiom relies on the JVM's class-initialisation guarantees (Session 1): the nested `Holder` class is initialised only when `getInstance()` first touches it, and class initialisation is thread-safe by specification. Lazy *and* lock-free.",
        "Why `volatile` in DCL? Without it, the JIT/CPU may reorder 'allocate memory → assign reference → run constructor', so another thread could see a non-null reference to a half-constructed object. `volatile` forbids that reordering (a happens-before edge — Session 6).",
        "Joshua Bloch (*Effective Java*): a single-element enum is often the best way to implement a singleton."
      ]
    },
    {
      type: 'practical',
      title: 'Thread safety & how singletons break',
      lead: 'The naive lazy singleton uses *check-then-act*, which is **not atomic** — under concurrency several threads create their own instance.',
      code: { lang: 'java', file: 'RaceDemo.java', verify: 'run', src: code`
        import java.util.concurrent.*;
        import java.util.concurrent.atomic.AtomicInteger;

        class NaiveLazy {
            static final AtomicInteger CREATED = new AtomicInteger();
            private static NaiveLazy instance;

            private NaiveLazy() {
                CREATED.incrementAndGet();
                try { Thread.sleep(5); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }

            static NaiveLazy getInstance() {
                if (instance == null) {          // two threads can both see null here...
                    instance = new NaiveLazy();  // ...and both create an instance
                }
                return instance;
            }
        }

        public class RaceDemo {
            public static void main(String[] args) {
                CountDownLatch start = new CountDownLatch(1);
                try (ExecutorService pool = Executors.newFixedThreadPool(32)) {
                    for (int i = 0; i < 32; i++) {
                        pool.submit(() -> { start.await(); return NaiveLazy.getInstance(); });
                    }
                    start.countDown();                 // release all threads at once
                }                                      // close() waits for every task
                System.out.println("instances created: " + NaiveLazy.CREATED.get() + " (expected 1)");
            }
        }`, out: code`
        instances created: 11 (expected 1)      <- varies on every run` },
      table: { head: ['Approach', 'Lazy?', 'Thread-safe?', 'Reflection / serialization safe?'], rows: [
        ['Naive lazy', '✅', '❌', '❌'],
        ['Eager static final', '❌', '✅', '❌ (needs guards)'],
        ['`synchronized getInstance()`', '✅', '✅ (but locks on every call)', '❌'],
        ['Double-checked + `volatile`', '✅', '✅', '❌'],
        ['Holder idiom', '✅', '✅', '❌'],
        ['Enum', '❌ (on first enum use)', '✅', '✅']
      ] },
      callout: { kind: 'warn', text: "Other ways to get a second instance: **reflection** (`setAccessible(true)` on the constructor), **deserialization** (add `readResolve()`), **cloning**, and **multiple class loaders**. Enums are immune to the first two." },
      notes: [
        "Run it several times — the count changes every run. That non-determinism is the signature of a race condition and a preview of Session 6.",
        "Spring note: a Spring *singleton bean* means one instance **per application context**, created and injected by the container — not a class with a static `getInstance()`. Prefer DI: the dependency becomes visible in the constructor and is trivial to replace with a mock in tests.",
        "Interview follow-up: 'Is a singleton's *state* thread-safe?' Not automatically! One instance shared by many threads must use immutable or thread-safe fields — that is why `AppRegistry` uses a `ConcurrentHashMap`."
      ]
    },
    {
      type: 'theory',
      title: 'Exception propagation: unwinding the call stack',
      lead: 'When no `catch` matches in the current method, the frame is popped and the exception travels to the **caller** — until something handles it or the thread dies.',
      diagram: { kind: 'seq', actors: ['main()', 'OrderService', 'PaymentService', 'BankGateway'], msgs: [
        [0, 1, 'placeOrder(5000)'],
        [1, 2, 'charge(5000)'],
        [2, 3, 'debit(5000)'],
        [3, 3, 'throws GatewayTimeoutException'],
        [3, 2, 'no catch: frame popped', 'r'],
        [2, 2, 'finally block runs'],
        [2, 1, 'still propagating', 'r'],
        [1, 1, 'catch: wrap in OrderFailedException'],
        [1, 0, 'throws OrderFailedException', 'r'],
        [0, 0, 'catch: log + show friendly message']
      ] },
      points: [
        "**Checked** exceptions must be caught or declared (`throws`) at every level they pass through.",
        "**Unchecked** exceptions propagate automatically — no declaration needed.",
        "`finally` blocks run while the stack unwinds. If nobody catches, the thread's uncaught-exception handler prints the stack trace."
      ],
      notes: [
        "Walk the diagram top to bottom. The key idea: each layer chooses to **handle**, **wrap & rethrow** (translate to its own abstraction), or **let it propagate**.",
        "In a Spring web app the 'top of the stack' is the framework's `DispatcherServlet`. If your controller lets an exception escape, Spring turns it into an error response — and in Session 9 we customise that with `@RestControllerAdvice`.",
        "Reading a stack trace: the first `at` line is where it was thrown; *Caused by:* sections show the wrapped original — always read down to the **last** *Caused by*, that is usually the real root cause."
      ]
    },
    {
      type: 'practical',
      title: 'Propagation in code: declare, wrap, rethrow',
      lead: 'Low-level code declares the checked exception; the service layer translates it into a domain exception and keeps the **cause**.',
      code: { lang: 'java', file: 'PropagationDemo.java', src: code`
        import java.util.Arrays;
        import java.util.stream.Collectors;

        class GatewayTimeoutException extends Exception {           // checked
            GatewayTimeoutException(String msg) { super(msg); }
        }

        class OrderFailedException extends RuntimeException {      // unchecked wrapper
            OrderFailedException(String msg, Throwable cause) { super(msg, cause); }
        }

        public class PropagationDemo {

            static void debit(int amount) throws GatewayTimeoutException {     // declares
                if (amount > 1000) throw new GatewayTimeoutException("bank did not respond in 3s");
                System.out.println("debited " + amount);
            }

            static void charge(int amount) throws GatewayTimeoutException {    // propagates
                try {
                    debit(amount);
                } finally {
                    System.out.println("charge(): finally block ran");
                }
            }

            static void placeOrder(int amount) {                               // translates
                try {
                    charge(amount);
                } catch (GatewayTimeoutException e) {
                    throw new OrderFailedException("order failed for amount " + amount, e);
                }
            }

            public static void main(String[] args) {
                placeOrder(500);
                try {
                    placeOrder(5000);
                } catch (OrderFailedException e) {
                    System.out.println("main caught: " + e.getMessage());
                    Throwable root = e.getCause();
                    System.out.println("root cause: " + root.getClass().getSimpleName() + " - " + root.getMessage());
                    System.out.println("thrown at: " + Arrays.stream(root.getStackTrace())
                            .map(StackTraceElement::getMethodName).collect(Collectors.joining(" <- ")));
                }
            }
        }`, out: code`
        debited 500
        charge(): finally block ran
        charge(): finally block ran
        main caught: order failed for amount 5000
        root cause: GatewayTimeoutException - bank did not respond in 3s
        thrown at: debit <- charge <- placeOrder <- main` },
      callout: { kind: 'best', text: "Handle an exception where you can **do something useful** (retry, fallback, translate, report). Log it **once**, at the boundary — logging at every level produces the same stack trace five times." },
      notes: [
        "Point out that `charge()` has a `try/finally` with **no catch**: it cleans up but lets the exception continue — a very common pattern.",
        "The stack trace is captured when the exception object is *created*, which is why the cause's trace starts at `debit`. Wrapping without passing `e` as the cause would lose this information forever.",
        "Anti-patterns to call out: `catch (Exception e) {}` (swallowing), `e.printStackTrace()` in production code (use a logger, Session 9), and using exceptions for normal control flow (they are expensive because they capture the stack)."
      ]
    },
    {
      type: 'theory',
      title: 'Lambda expressions: behaviour as a value',
      lead: 'A lambda is an anonymous function you can pass around. It replaces verbose anonymous classes wherever a **functional interface** is expected.',
      points: [
        "Syntax: `(params) -> expression` or `(params) -> { statements; }`; parameter types are usually inferred.",
        "A lambda has no type of its own — its *target type* is the functional interface it is assigned to.",
        "Lambdas can capture local variables only if they are **effectively final**.",
        "**Method references** are shorthand for lambdas that just call a method: `Employee::dept`."
      ],
      code: { lang: 'java', file: 'LambdaIntro.java', src: code`
        import java.util.*;

        public class LambdaIntro {
            record Employee(String name, String dept, int salary) {}

            public static void main(String[] args) {
                List<Employee> staff = new ArrayList<>(List.of(
                        new Employee("Meera", "Eng", 120), new Employee("Arjun", "Ops", 90),
                        new Employee("Zoya", "Eng", 150)));

                // Before Java 8: anonymous inner class
                staff.sort(new Comparator<Employee>() {
                    @Override public int compare(Employee a, Employee b) {
                        return Integer.compare(a.salary(), b.salary());
                    }
                });
                // Java 8+: the same comparator as a lambda
                staff.sort((a, b) -> Integer.compare(a.salary(), b.salary()));
                // Best: comparator factories + method references
                staff.sort(Comparator.comparing(Employee::dept)
                        .thenComparing(Employee::salary, Comparator.reverseOrder()));
                staff.forEach(e -> System.out.println(e.dept() + " " + e.name() + " " + e.salary()));

                int bonus = 10;                        // effectively final -> can be captured
                Runnable r = () -> System.out.println("bonus = " + bonus);
                r.run();
                // bonus++;  // compile error: local variables referenced from a lambda must be effectively final
            }
        }`, out: code`
        Eng Zoya 150
        Eng Meera 120
        Ops Arjun 90
        bonus = 10` },
      notes: [
        "Show the evolution in three steps on the same `sort` call: anonymous class (6 lines) → lambda (1 line) → `Comparator.comparing` (reads like English). This is the 'Functional Programming with Java 8' skill listed in the brochure.",
        "Why effectively final? A lambda may run later or on another thread; copying a value that can no longer change avoids a whole class of concurrency bugs.",
        "Unlike anonymous classes, a lambda does not introduce a new scope: `this` inside a lambda refers to the enclosing instance."
      ]
    },
    {
      type: 'theory',
      title: 'Functional interfaces in java.util.function',
      lead: 'A functional interface has **exactly one abstract method** (SAM). Learn the core five; the rest are variations.',
      table: { head: ['Interface', 'Method', 'Shape', 'Example'], rows: [
        ['`Predicate<T>`', '`boolean test(T)`', 'T → boolean', '`s -> s.isBlank()`'],
        ['`Function<T,R>`', '`R apply(T)`', 'T → R', '`String::length`'],
        ['`Consumer<T>`', '`void accept(T)`', 'T → ()', '`System.out::println`'],
        ['`Supplier<T>`', '`T get()`', '() → T', '`ArrayList::new`'],
        ['`UnaryOperator<T>`', '`T apply(T)`', 'T → T', '`s -> s.trim()`'],
        ['`BinaryOperator<T>`', '`T apply(T,T)`', '(T,T) → T', '`Integer::sum`'],
        ['`BiFunction<T,U,R>`', '`R apply(T,U)`', '(T,U) → R', '`(price, qty) -> price * qty`'],
        ['`Runnable` / `Callable<V>`', '`run()` / `V call()`', '() → () / () → V', 'tasks for threads (Session 6)']
      ] },
      points: [
        "Primitive specialisations avoid boxing: `IntPredicate`, `ToIntFunction<T>`, `IntBinaryOperator` …",
        "Annotate your own with `@FunctionalInterface` so the compiler rejects a second abstract method.",
        "Default methods enable composition: `and`, `or`, `negate`, `andThen`, `compose`."
      ],
      notes: [
        "A memory trick: *Predicate tests, Function transforms, Consumer eats, Supplier gives*.",
        "Older JDK interfaces are functional too — `Runnable`, `Callable`, `Comparator` — which is why lambdas worked with existing APIs from day one.",
        "Default and static methods do not count towards the single abstract method; neither do methods inherited from `Object` such as `equals` (that is why `Comparator` declaring `equals` is still functional)."
      ]
    },
    {
      type: 'practical',
      title: 'Composing functions & the 4 kinds of method reference',
      lead: 'Small functions combine into pipelines — the style Streams (Session 5) and Spring configuration use everywhere.',
      code: { lang: 'java', file: 'FunctionalDemo.java', src: code`
        import java.util.ArrayList;
        import java.util.List;
        import java.util.function.*;

        public class FunctionalDemo {

            @FunctionalInterface
            interface DiscountRule {                                  // custom functional interface
                double apply(double amount);
                default DiscountRule then(DiscountRule next) { return a -> next.apply(apply(a)); }
            }

            public static void main(String[] args) {
                Predicate<String> notBlank = s -> !s.isBlank();
                Predicate<String> validEmail = notBlank.and(s -> s.contains("@")).and(s -> s.endsWith(".com"));
                System.out.println(validEmail.test("dev@shop.com") + " " + validEmail.test("dev.shop.com"));

                Function<String, String> trim = String::trim;                 // unbound instance method
                Function<String, String> normalise = trim.andThen(String::toLowerCase);
                System.out.println(normalise.apply("  Ravi@Example.COM "));

                Supplier<List<String>> listFactory = ArrayList::new;          // constructor reference
                List<String> audit = listFactory.get();
                Consumer<String> log = audit::add;                            // bound instance method
                log.andThen(s -> System.out.println("logged: " + s)).accept("LOGIN ravi");

                BinaryOperator<Integer> max = Math::max;                      // static method
                UnaryOperator<Integer> gst = p -> p + p * 18 / 100;
                System.out.println("max=" + max.apply(700, 450) + " withGst=" + gst.apply(1000));

                DiscountRule festive = a -> a * 0.90;                         // 10% off
                DiscountRule coupon = a -> Math.max(0, a - 150);              // flat 150 off
                System.out.println("final price = " + festive.then(coupon).apply(2000));
                System.out.println(audit);
            }
        }`, out: code`
        true false
        ravi@example.com
        logged: LOGIN ravi
        max=700 withGst=1180
        final price = 1650.0
        [LOGIN ravi]` },
      table: { head: ['Method reference', 'Equivalent lambda'], rows: [
        ['Static: `Math::max`', '`(a, b) -> Math.max(a, b)`'],
        ['Bound instance: `audit::add`', '`s -> audit.add(s)`'],
        ['Unbound instance: `String::trim`', '`s -> s.trim()`'],
        ['Constructor: `ArrayList::new`', '`() -> new ArrayList<>()`']
      ] },
      notes: [
        "`festive.then(coupon)` returns a *new* function; nothing is computed until `apply(2000)` — functions are values you build and pass around.",
        "Order matters with composition: `f.andThen(g)` means g(f(x)); `f.compose(g)` means f(g(x)). Ask students what happens if the coupon is applied before the festive discount (answer: 1665.0).",
        "Custom functional interfaces are worth it when a domain name (`DiscountRule`) explains more than `UnaryOperator<Double>`."
      ]
    },
    {
      type: 'practical',
      title: 'Lambdas meet exceptions',
      lead: 'Standard functional interfaces don\'t declare checked exceptions, so a lambda calling a method that throws one won\'t compile — wrap it and keep the **cause**.',
      code: { lang: 'java', file: 'LambdaExceptions.java', src: code`
        import java.util.List;
        import java.util.function.Function;

        public class LambdaExceptions {

            @FunctionalInterface
            interface ThrowingFunction<T, R> { R apply(T t) throws Exception; }

            static <T, R> Function<T, R> unchecked(ThrowingFunction<T, R> f) {   // adapter
                return t -> {
                    try {
                        return f.apply(t);
                    } catch (RuntimeException e) {
                        throw e;
                    } catch (Exception e) {
                        throw new IllegalStateException("failed for input " + t, e);
                    }
                };
            }

            static int fetchPrice(String sku) throws Exception {                 // checked exception
                if (sku.startsWith("X")) throw new Exception("SKU " + sku + " discontinued");
                return sku.length() * 100;
            }

            public static void main(String[] args) {
                List<String> skus = List.of("A1", "B22", "X9");
                // skus.stream().map(LambdaExceptions::fetchPrice)   // compile error: unhandled Exception
                try {
                    skus.stream().map(unchecked(LambdaExceptions::fetchPrice)).forEach(System.out::println);
                } catch (IllegalStateException e) {
                    System.out.println(e.getMessage() + " <- caused by: " + e.getCause().getMessage());
                }
            }
        }`, out: code`
        200
        300
        failed for input X9 <- caused by: SKU X9 discontinued` },
      notes: [
        "This slide ties the two halves of the session together: exception propagation still works through lambdas — the exception thrown inside `map` propagates out of `forEach` to our catch block.",
        "Streams are lazy and process one element at a time, which is why 200 and 300 are printed before the failure on `X9`.",
        "In real projects prefer specific exception types over `Exception`, and consider whether the stream should *skip* bad elements (return `Optional`) instead of failing the whole pipeline."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: config singleton + functional pricing pipeline',
      lead: 'Build a lazily-loaded configuration singleton, propagate a checked config error, and price orders with composed functions.',
      steps: [
        "Create a checked `ConfigException` and a `final class AppConfig` singleton using the **holder idiom**.",
        "Store settings in an immutable `Map` (`discount.percent`, `gst.percent`, `currency`) and add `int requireInt(String key) throws ConfigException`.",
        "Write `Function<Double, Double> pricing()` that reads both percentages and returns `applyDiscount.andThen(addGst)`.",
        "Model `record Order(String id, String customer, double amount)` and sort orders by customer, then amount descending, with `Comparator.comparing(...).thenComparing(...)`.",
        "Print each order's final price with `printf`; then request a missing key and let the `ConfigException` **propagate** to `main`, where you catch it.",
        "Filter 'big' orders (> 700) with a `Predicate<Order>` and print their ids.",
        "Stretch: run 20 threads calling `AppConfig.get()` and prove (with a counter in the constructor) that only one instance is created."
      ],
      code: { lang: 'java', file: 'LambdaLab.java', label: 'Reference solution', src: code`
        import java.util.*;
        import java.util.function.*;

        class ConfigException extends Exception {
            ConfigException(String msg) { super(msg); }
        }

        final class AppConfig {
            private final Map<String, String> props =
                    Map.of("discount.percent", "10", "gst.percent", "18", "currency", "INR");
            private AppConfig() {}
            private static class Holder { static final AppConfig INSTANCE = new AppConfig(); }
            static AppConfig get() { return Holder.INSTANCE; }

            int requireInt(String key) throws ConfigException {
                String v = props.get(key);
                if (v == null) throw new ConfigException("missing config key: " + key);
                return Integer.parseInt(v);
            }
        }

        public class LambdaLab {
            record Order(String id, String customer, double amount) {}

            static Function<Double, Double> pricing() throws ConfigException {
                AppConfig cfg = AppConfig.get();
                int discount = cfg.requireInt("discount.percent");
                int gst = cfg.requireInt("gst.percent");
                Function<Double, Double> applyDiscount = a -> a * (100 - discount) / 100;
                Function<Double, Double> addGst = a -> a * (100 + gst) / 100;
                return applyDiscount.andThen(addGst);
            }

            public static void main(String[] args) {
                List<Order> orders = new ArrayList<>(List.of(new Order("O3", "zara", 500),
                        new Order("O1", "amit", 1500), new Order("O2", "amit", 800)));
                orders.sort(Comparator.comparing(Order::customer)
                        .thenComparing(Order::amount, Comparator.reverseOrder()));
                try {
                    Function<Double, Double> price = pricing();
                    orders.forEach(o -> System.out.printf("%s %-5s %8.2f%n", o.id(), o.customer(), price.apply(o.amount())));
                    AppConfig.get().requireInt("shipping.fee");          // propagates ConfigException
                } catch (ConfigException e) {
                    System.out.println("Config error: " + e.getMessage());
                }
                Predicate<Order> big = o -> o.amount() > 700;
                System.out.println("big orders: " + orders.stream().filter(big).map(Order::id).toList());
            }
        }`, out: code`
        O1 amit   1593.00
        O2 amit    849.60
        O3 zara    531.00
        Config error: missing config key: shipping.fee
        big orders: [O1, O2]` },
      notes: [
        "Students often try to declare `discount` as a field they mutate later; the compiler then rejects the lambda capture — a good teachable moment about effectively-final variables.",
        "For the stretch goal, reuse the `CountDownLatch` trick from the RaceDemo slide. With the holder idiom the counter must always be 1."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: Singleton, propagation & lambdas',
      quiz: [
        { q: "Why is the instance field `volatile` in double-checked locking?", options: ['To make it lazy', 'To prevent other threads from seeing a partially constructed object', 'To allow serialization', 'To speed up the first check'], answer: 1,
          why: "`volatile` prevents reordering of the constructor's writes and the reference assignment, establishing a happens-before relationship between threads." },
        { q: "Which singleton implementation is safe against reflection and serialization by default?", options: ['Eager static field', 'Holder idiom', 'Enum singleton', 'synchronized getInstance()'], answer: 2,
          why: "The JVM guarantees enum constants are instantiated exactly once; reflection cannot create enum instances and deserialization returns the existing constant." },
        { q: "Method `load()` calls `Files.readString(path)` (throws `IOException`) without try/catch. What must `load()` do?", options: ['Nothing', 'Declare `throws IOException`', 'Return null', 'Mark the method final'], answer: 1,
          why: "Checked exceptions must be caught or declared at every level they pass through — that is the 'catch or specify' rule." },
        { q: "Which functional interface matches `s -> s.length() > 3` for a String?", options: ['Function<String, Integer>', 'Supplier<Boolean>', 'Predicate<String>', 'Consumer<String>'], answer: 2,
          why: "It takes a String and returns a boolean: `Predicate<String>.test`." },
        { q: "`Function<String,String> f = String::toUpperCase;` is which kind of method reference?", options: ['Static method', 'Bound instance method', 'Unbound instance method (arbitrary object of a type)', 'Constructor'], answer: 2,
          why: "The receiver is the function's argument: `s -> s.toUpperCase()`. A bound reference fixes the receiver up front, e.g. `myList::add`." }
      ],
      notes: [
        "Ask a student to rewrite each method reference in Q5's options as an equivalent lambda — a quick way to check real understanding."
      ]
    },
    {
      type: 'summary',
      title: 'Session 3 recap',
      points: [
        "Singleton = private constructor + static access. Prefer the **holder idiom** or an **enum**; DCL needs `volatile`.",
        "In Spring, let the container manage single instances (singleton scope) instead of static `getInstance()`.",
        "Unhandled exceptions unwind the stack frame by frame; `finally` runs on the way; checked ones must be declared.",
        "Translate low-level exceptions into domain exceptions **with the cause**, and log once at the boundary.",
        "Lambdas implement functional interfaces; master `Predicate`, `Function`, `Consumer`, `Supplier`, and method references."
      ],
      cards: [
        ['Holder idiom', 'Lazy, thread-safe singleton via a nested static class initialised on first access.'],
        ['volatile', 'Guarantees visibility and prevents reordering across threads for a field.'],
        ['Stack unwinding', 'Popping frames while an exception searches for a matching catch.'],
        ['Exception translation', 'Catch a low-level exception and throw a higher-level one with it as the cause.'],
        ['Functional interface', 'Interface with a single abstract method — the target type of a lambda.'],
        ['Effectively final', 'A local never reassigned after initialisation; required for lambda capture.'],
        ['andThen vs compose', 'f.andThen(g) = g(f(x)); f.compose(g) = f(g(x)).'],
        ['Method reference', 'Shorthand lambda: Class::staticMethod, obj::method, Class::method, Class::new.']
      ],
      notes: [
        "Next session: the Collections Framework — List, Set, Map, Queue/Deque — and Generics, which make all of those collections type-safe. Lambdas will immediately pay off with `removeIf`, `forEach` and `Comparator`."
      ]
    }
  ]
});
