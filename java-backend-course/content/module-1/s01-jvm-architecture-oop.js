COURSE.session({
  no: 1,
  short: 'Java architecture, JVM & OOP',
  title: 'Java Architecture, JVM Internals & Core OOP Principles',
  covers: [0],
  objectives: [
    "Explain how a `.java` file becomes running machine code (javac \u2192 bytecode \u2192 JVM \u2192 JIT).",
    "Distinguish JDK, JRE and JVM and name the JVM's runtime memory areas.",
    "Describe class loading (delegation model) and the basics of garbage collection.",
    "Apply the four OOP pillars \u2014 encapsulation, inheritance, polymorphism, abstraction \u2014 in Java code."
  ],
  prereq: "No prior Java needed. Install **JDK 21+** (e.g. Eclipse Temurin) and an IDE (IntelliJ IDEA Community or VS Code + Java extension). Check with `java -version`.",
  slides: [
    {
      type: 'theory',
      title: 'Why Java for backend development?',
      lead: 'Java has powered server-side systems for decades because it combines portability, performance and a huge, mature ecosystem.',
      points: [
        "**Write once, run anywhere** \u2014 source compiles to platform-neutral *bytecode* that any JVM can execute.",
        "**Fast** \u2014 the JIT compiler turns hot code paths into optimised native machine code at runtime.",
        "**Safe & robust** \u2014 static typing, automatic memory management (GC), exceptions instead of crashes.",
        "**Ecosystem** \u2014 Spring Boot, Hibernate, Kafka clients, Maven Central with millions of libraries.",
        "**Predictable releases** \u2014 a feature release every 6 months, a Long-Term-Support (LTS) release every 2 years."
      ],
      diagram: { kind: 'flow', nodes: [
        { t: 'Java 8', s: '2014 \u00B7 lambdas, streams', tone: 'gray' },
        { t: 'Java 11', s: '2018 \u00B7 HttpClient', tone: 'gray' },
        { t: 'Java 17', s: '2021 \u00B7 records, sealed', tone: 'blue' },
        { t: 'Java 21', s: '2023 \u00B7 virtual threads', tone: 'green' },
        { t: 'Java 25', s: '2025 \u00B7 newest LTS', tone: 'purple' }
      ], caption: 'LTS releases \u2014 this course targets Java 21' },
      callout: { kind: 'version', text: "Examples target **Java 21 LTS** and also run on **Java 25 LTS**. Spring Boot 4 (used from Session 7) needs Java 17 or newer." },
      notes: [
        "Open the course by connecting Java to what students will build: REST APIs, payment systems, booking platforms. Companies such as Amazon, Netflix, LinkedIn, Flipkart and most banks run large Java backends.",
        "Stress the *LTS* idea: production teams upgrade from LTS to LTS (8 \u2192 11 \u2192 17 \u2192 21 \u2192 25). Features from non-LTS releases arrive in the next LTS. Everything we write in this course compiles on Java 21.",
        "- **Portability** comes from the JVM abstraction, not from Java syntax.",
        "- **Performance** comes from the JIT: Java starts interpreted, then compiles hot methods to native code.",
        "- **Productivity** comes from the ecosystem \u2014 we will rarely write infrastructure code ourselves."
      ]
    },
    {
      type: 'theory',
      title: 'From source code to running program',
      lead: 'Java is compiled *and* interpreted: `javac` produces bytecode once, and the JVM on each platform executes it.',
      points: [
        "`javac` checks types and compiles `Hello.java` into **bytecode** (`Hello.class`) \u2014 not machine code.",
        "The **class loader** loads the `.class` file; the **bytecode verifier** checks it is safe.",
        "The **interpreter** starts executing immediately; the **JIT compiler** compiles *hot* methods to native code.",
        "The same `.class` file runs on Windows, Linux and macOS \u2014 only the JVM differs."
      ],
      diagram: { kind: 'flow', nodes: [
        { t: 'Hello.java', s: 'source code', tone: 'blue' },
        { t: 'javac', s: 'compiler', tone: 'gray' },
        { t: 'Hello.class', s: 'bytecode', tone: 'yellow' },
        { t: 'JVM', s: 'load \u00B7 verify \u00B7 run', tone: 'green' },
        { t: 'CPU', s: 'native code via JIT', tone: 'purple' }
      ] },
      code: [
        { lang: 'java', file: 'Hello.java', src: code`
          public class Hello {
              public static void main(String[] args) {
                  System.out.println("Hello, JVM!");
              }
          }`, out: code`Hello, JVM!` },
        { lang: 'bash', label: 'Terminal', src: code`
          $ javac Hello.java          # produces Hello.class (bytecode)
          $ java Hello                # JVM loads and runs the class
          Hello, JVM!
          $ java Hello.java           # single-file launcher: compile + run in memory
          $ javap -c Hello            # disassemble the bytecode
            public static void main(java.lang.String[]);
              Code:
                 0: getstatic     #7   // Field java/lang/System.out:Ljava/io/PrintStream;
                 3: ldc           #13  // String Hello, JVM!
                 5: invokevirtual #15  // Method java/io/PrintStream.println:(Ljava/lang/String;)V
                 8: return` }
      ],
      notes: [
        "Walk through the pipeline live: write `Hello.java`, run `javac`, show the generated `Hello.class`, then run `java Hello`. Then show `javap -c` so students *see* that bytecode is a set of stack-based instructions (`getstatic`, `ldc`, `invokevirtual`).",
        "Key interview line: **Java is platform independent; the JVM is platform dependent.** You ship the same JAR everywhere, but you install a different JVM per OS/CPU.",
        "The JIT (HotSpot uses tiered compilation: C1 for fast warm-up, C2 for peak performance) is why long-running Java servers get *faster* after warm-up. Constant-pool numbers such as `#7` vary between compilers \u2014 don't memorise them."
      ]
    },
    {
      type: 'theory',
      title: 'JDK vs JRE vs JVM',
      lead: 'Three nested layers: you **develop** with the JDK, you **run** with a runtime, and the JVM **executes** bytecode.',
      diagram: { kind: 'layers', items: [
        { t: 'JDK \u2014 Java Development Kit', s: 'everything to build Java apps', tone: 'green', parts: ['javac', 'java', 'jar', 'jshell', 'javadoc', 'jdb', 'jcmd', 'jlink'] },
        { t: 'JRE \u2014 Java Runtime Environment', s: 'what is needed to run', tone: 'blue', parts: ['java.base', 'java.sql', 'java.net.http', 'java.logging', '+ the JVM'] },
        { t: 'JVM \u2014 Java Virtual Machine', s: 'executes bytecode', tone: 'purple', parts: ['Class loader', 'Runtime data areas', 'Execution engine (interpreter, JIT, GC)'] }
      ] },
      table: { head: ['', 'Contains', 'Who uses it'], rows: [
        ['**JDK**', 'Compiler + tools + runtime', 'Developers, CI build servers'],
        ['**JRE / runtime**', 'Class libraries + JVM', 'Production servers, Docker images (`eclipse-temurin:21-jre`)'],
        ['**JVM**', 'The engine that runs bytecode', 'Everyone \u2014 it is inside both']
      ] },
      callout: { kind: 'info', text: "Since Java 11 there is no separate JRE download from OpenJDK; use `jlink` to build a trimmed runtime, or a vendor JRE image. *HotSpot* is the JVM implementation inside OpenJDK builds such as Temurin, Corretto and Oracle JDK." },
      notes: [
        "A classic first interview question. Draw three nested boxes on the board: JDK \u2283 JRE \u2283 JVM.",
        "The JVM is a *specification* (the JVM Spec) with several implementations; HotSpot is by far the most common. OpenJDK is the open-source reference implementation, and vendors ship builds of it (Eclipse Temurin, Amazon Corretto, Microsoft Build of OpenJDK, Oracle JDK).",
        "In this course you install a JDK on your laptop. In Session 23 our Docker images will use a slimmer *JRE* base image for production, because a server does not need the compiler."
      ]
    },
    {
      type: 'theory',
      title: 'Inside the JVM: architecture',
      lead: 'The JVM has three subsystems: it **loads** classes, keeps them in **runtime data areas**, and **executes** them.',
      diagram: { kind: 'layers', items: [
        { t: '1. Class Loader Subsystem', tone: 'blue', parts: ['Loading', 'Linking: verify \u2192 prepare \u2192 resolve', 'Initialization (static blocks)'] },
        { t: '2. Runtime Data Areas', tone: 'green', parts: ['Method area / Metaspace (shared)', 'Heap (shared)', 'JVM stack (per thread)', 'PC register (per thread)', 'Native method stack (per thread)'] },
        { t: '3. Execution Engine', tone: 'purple', parts: ['Interpreter', 'JIT compiler (C1 / C2)', 'Garbage collector'] },
        { t: 'Native interface (JNI) \u2194 native libraries', tone: 'gray' }
      ] },
      points: [
        "**Shared by all threads:** heap (objects) and method area/Metaspace (class metadata, method bytecode).",
        "**Private to each thread:** its stack of frames, its program counter and its native stack.",
        "The execution engine interprets bytecode, JIT-compiles hot spots and reclaims unreachable objects."
      ],
      notes: [
        "This is the mental model we reuse all course long. When we discuss multithreading in Session 6, remember: **heap = shared = needs synchronization; stack = private = thread-safe by default.**",
        "Linking has three steps: *verify* (bytecode is well-formed and type-safe), *prepare* (allocate static fields with default values) and *resolve* (turn symbolic references into direct ones, often lazily). *Initialization* then runs static initialisers and assigns static field values \u2014 exactly once per class.",
        "Since Java 8, class metadata lives in **Metaspace** (native memory) instead of the old fixed-size PermGen, so `OutOfMemoryError: PermGen space` is a thing of the past (you can still hit `Metaspace` OOM with class-loader leaks)."
      ]
    },
    {
      type: 'practical',
      title: 'Stack vs heap: where does each variable live?',
      lead: 'Primitives and references in methods live on the thread\u2019s **stack**; every object created with `new` lives on the **heap**.',
      points: [
        "Each method call pushes a **frame** (local variables + operand stack) and pops it on return.",
        "`order` (a reference) is on the stack; the `Order` object it points to is on the heap.",
        "Passing `order` to `price()` copies the **reference** \u2014 Java is always *pass-by-value*.",
        "Deep recursion fills the stack \u2192 `StackOverflowError`; too many live objects fill the heap \u2192 `OutOfMemoryError`."
      ],
      code: { lang: 'java', file: 'MemoryDemo.java', src: code`
        public class MemoryDemo {

            record Order(String id, int qty) {}            // objects of this type go on the heap

            public static void main(String[] args) {      // frame for main() pushed on the stack
                int qty = 3;                               // primitive local -> stack
                Order order = new Order("ORD-1", qty);     // reference on stack, object on heap
                double total = price(order);               // new frame for price()
                System.out.println(order.id() + " total = " + total);
            }

            static double price(Order o) {                 // o is a COPY of the reference
                return o.qty() * 499.0;
            }
        }`, out: code`ORD-1 total = 1497.0` },
      table: { head: ['Area', 'Stores', 'Shared?', 'Error when exhausted'], rows: [
        ['Stack', 'Frames: locals, partial results, return addresses', 'No \u2014 one per thread', '`StackOverflowError`'],
        ['Heap', 'All objects and arrays (incl. the String pool)', 'Yes \u2014 all threads', '`OutOfMemoryError: Java heap space`'],
        ['Metaspace', 'Class metadata, method bytecode', 'Yes', '`OutOfMemoryError: Metaspace`']
      ] },
      callout: { kind: 'interview', text: "*Is Java pass-by-value or pass-by-reference?* \u2014 **Always pass-by-value.** For objects, the value copied is the reference, so a method can mutate the object but cannot make the caller's variable point elsewhere." },
      notes: [
        "Trace the program line by line, drawing the stack frames and the heap. When `price()` returns, its frame is popped; the `Order` object survives because `main` still references it. When `main` ends, the object becomes unreachable and is eligible for GC.",
        "Static fields: since Java 8 they are stored with the class's `java.lang.Class` object **on the heap**; the class *metadata* is in Metaspace. Interned strings have lived on the heap since Java 7.",
        "Common bug to demonstrate: reassigning a parameter (`o = new Order(...)`) inside a method has no effect on the caller \u2014 proof of pass-by-value."
      ]
    },
    {
      type: 'theory',
      title: 'Class loading & the delegation model',
      lead: 'Classes are loaded lazily, on first use, by a hierarchy of class loaders that always ask their **parent first**.',
      diagram: { kind: 'flow', dir: 'v', nodes: [
        { t: 'Bootstrap class loader', s: 'core runtime: java.lang, java.util (java.base)', tone: 'purple' },
        { t: 'Platform class loader', s: 'other Java SE modules: java.sql, java.net.http \u2026', tone: 'blue' },
        { t: 'Application (system) class loader', s: 'your classes + libraries on the class path', tone: 'green' }
      ], edges: ['parent of', 'parent of'] },
      points: [
        "**Parent-first delegation:** a loader delegates to its parent before trying itself, so nobody can replace `java.lang.String`.",
        "`ClassNotFoundException` \u2014 a class requested by name (e.g. `Class.forName`) is not found.",
        "`NoClassDefFoundError` \u2014 a class present at compile time is missing (or failed to initialise) at runtime."
      ],
      code: { lang: 'java', file: 'Loaders.java', verify: 'run', src: code`
        public class Loaders {
            public static void main(String[] args) {
                System.out.println(String.class.getClassLoader());              // bootstrap
                System.out.println(java.sql.Connection.class.getClassLoader()); // platform
                System.out.println(Loaders.class.getClassLoader());             // application
            }
        }`, out: code`
        null
        jdk.internal.loader.ClassLoaders$PlatformClassLoader@5ca881b5
        jdk.internal.loader.ClassLoaders$AppClassLoader@76ed5528` },
      notes: [
        "The bootstrap loader is implemented natively, which is why `getClassLoader()` returns `null` for core classes. The hash codes after `@` will differ on your machine.",
        "Frameworks rely on class loaders: Spring Boot's executable JAR uses a custom loader to read nested JARs, and application servers isolate web apps with separate loaders.",
        "Debugging tip: `java -verbose:class -cp . Hello` prints every class as it is loaded \u2014 a great way to show students that loading is lazy."
      ]
    },
    {
      type: 'theory',
      title: 'Garbage collection basics',
      lead: 'The JVM frees memory automatically: any object no longer **reachable** from a GC root can be collected.',
      points: [
        "**GC roots:** local variables on thread stacks, static fields, active threads, JNI references.",
        "**Generational hypothesis:** most objects die young \u2192 collect the young generation often and cheaply.",
        "New objects go to **Eden**; survivors are copied between **Survivor** spaces, then *promoted* to the **Old** generation.",
        "**G1** is the default collector; **ZGC** offers sub-millisecond pauses for large heaps.",
        "GC does not prevent leaks: objects kept in a growing `static` map or cache stay reachable forever."
      ],
      diagram: { kind: 'flow', nodes: [
        { t: 'Eden', s: 'new objects', tone: 'green' },
        { t: 'Survivor S0 / S1', s: 'survived a minor GC', tone: 'yellow' },
        { t: 'Old generation', s: 'long-lived objects', tone: 'orange' }
      ], edges: ['minor GC', 'promoted after N GCs'] },
      code: { lang: 'bash', label: 'Terminal', src: code`
        $ java -Xms256m -Xmx512m -Xlog:gc -jar app.jar
        [0.008s][info][gc] Using G1
        [1.912s][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 24M->3M(256M) 2.104ms

        $ java -XX:+UseZGC -Xmx4g -jar app.jar      # low-latency collector` },
      callout: { kind: 'version', text: "Generational ZGC arrived in Java 21 and became ZGC's only mode in Java 24. You rarely tune GC early on \u2014 first set sensible `-Xms/-Xmx` (or container memory limits) and measure." },
      notes: [
        "Explain *reachability* with a picture: roots on the left, arrows to objects; anything not connected is garbage. The programmer never calls `free()`; `System.gc()` is only a hint and should not be used in application code.",
        "Minor GCs (young generation) are frequent and short. Major/mixed collections that include the old generation are rarer. G1 splits the heap into regions and aims for a pause-time goal (default 200 ms).",
        "Real-world leak story: a `static HashMap` used as a cache without eviction grows until `OutOfMemoryError`. In Session 15 we will use Redis with TTLs to avoid exactly this."
      ]
    },
    {
      type: 'theory',
      title: 'Object-oriented programming: the 4 pillars',
      lead: 'A **class** is a blueprint; an **object** is an instance with *state* (fields), *behaviour* (methods) and *identity*.',
      diagram: { kind: 'grid', cols: 2, items: [
        { icon: '\u{1F512}', t: 'Encapsulation', s: 'Hide state behind methods; keep objects valid (private fields, public behaviour).', tone: 'green' },
        { icon: '\u{1F9EC}', t: 'Inheritance', s: 'Reuse and specialise: `class Car extends Vehicle` models an *is-a* relationship.', tone: 'blue' },
        { icon: '\u{1F3AD}', t: 'Polymorphism', s: 'One interface, many forms: the overriding method is chosen at runtime.', tone: 'purple' },
        { icon: '\u{1F9E9}', t: 'Abstraction', s: 'Expose *what* an object does, hide *how* (abstract classes & interfaces \u2014 Session 2).', tone: 'orange' }
      ] },
      points: [
        "Prefer **composition** (*has-a*) over deep inheritance trees.",
        "Access modifiers: `private` < package-private (default) < `protected` < `public`."
      ],
      notes: [
        "Use a domain students know \u2014 a food-delivery app: `Order`, `Restaurant`, `DeliveryPartner`. Encapsulation keeps an `Order` from having a negative total; inheritance lets `ExpressDelivery` specialise `Delivery`; polymorphism lets the dispatcher call `estimateTime()` on any delivery type.",
        "Mention the SOLID principles briefly as the 'grammar' of good OOP; we will meet them repeatedly (e.g. dependency inversion is the heart of Spring in Session 8).",
        "Composition over inheritance: a `Car` *has an* `Engine` rather than *being* one. Inheritance couples subclasses tightly to parent implementation details."
      ]
    },
    {
      type: 'practical',
      title: 'Encapsulation: an account that protects its invariants',
      lead: 'Make fields `private`, validate in constructors and methods, and expose only the operations that keep the object valid.',
      points: [
        "`balance` can only change through `deposit()`/`withdraw()`, which enforce the rules.",
        "`final` field `accountNo` is assigned once and never changes.",
        "Invalid operations fail fast with an exception instead of corrupting state."
      ],
      code: [
        { lang: 'java', file: 'BankAccount.java', src: code`
          public class BankAccount {
              private final String accountNo;
              private double balance;                       // hidden state

              public BankAccount(String accountNo, double openingBalance) {
                  if (openingBalance < 0) {
                      throw new IllegalArgumentException("Opening balance cannot be negative");
                  }
                  this.accountNo = accountNo;
                  this.balance = openingBalance;
              }

              public void deposit(double amount) {
                  if (amount <= 0) throw new IllegalArgumentException("Deposit must be positive");
                  balance += amount;
              }

              public void withdraw(double amount) {
                  if (amount > balance) throw new IllegalStateException("Insufficient funds");
                  balance -= amount;
              }

              public double getBalance()   { return balance; }    // read-only view
              public String getAccountNo() { return accountNo; }
          }` },
        { lang: 'java', file: 'Main.java', src: code`
          public class Main {
              public static void main(String[] args) {
                  BankAccount acc = new BankAccount("SB-1001", 1000);
                  acc.deposit(500);
                  acc.withdraw(200);
                  System.out.println(acc.getAccountNo() + " balance = " + acc.getBalance());
                  try {
                      acc.withdraw(5000);
                  } catch (IllegalStateException e) {
                      System.out.println("Rejected: " + e.getMessage());
                  }
                  // acc.balance = 1_000_000;  // compile error: balance has private access
              }
          }`, out: code`
          SB-1001 balance = 1300.0
          Rejected: Insufficient funds` }
      ],
      callout: { kind: 'warn', text: "`double` is used here only to keep the first example simple. Real money code uses `BigDecimal` (or integer paise) \u2014 we do exactly that in the Splitwise project (Session 12)." },
      notes: [
        "Show what goes wrong without encapsulation: with a `public double balance`, any code can set a negative balance and the class can no longer guarantee correctness.",
        "Note that `private` is *class-level* access: code inside `BankAccount` could touch `balance` directly. That is why `main` lives in a separate `Main` class \u2014 uncomment the last line there to show the compile error.",
        "Getters are fine; *setters for everything* are not encapsulation. Expose intention-revealing methods (`deposit`, `withdraw`) instead of `setBalance`."
      ]
    },
    {
      type: 'practical',
      title: 'Inheritance & polymorphism in action',
      lead: 'Subclasses override behaviour; the JVM picks the right method at runtime based on the *actual* object type (dynamic dispatch).',
      code: { lang: 'java', file: 'NotifyDemo.java', src: code`
        import java.util.List;

        class Notification {
            protected final String to;
            Notification(String to) { this.to = to; }

            String send(String msg) { return "Notice to " + to + ": " + msg; }
            String send(String msg, int priority) {                 // OVERLOAD: compile-time
                return send("[P" + priority + "] " + msg);
            }
        }

        class EmailNotification extends Notification {
            EmailNotification(String email) { super(email); }       // call parent constructor
            @Override
            String send(String msg) { return "EMAIL to " + to + ": " + msg; }   // OVERRIDE
        }

        class SmsNotification extends Notification {
            SmsNotification(String phone) { super(phone); }
            @Override
            String send(String msg) { return "SMS to " + to + ": " + msg; }
        }

        public class NotifyDemo {
            public static void main(String[] args) {
                List<Notification> channels = List.of(
                        new EmailNotification("asha@example.com"),
                        new SmsNotification("+91-9800000001"),
                        new Notification("ops-team"));
                for (Notification n : channels) {
                    System.out.println(n.send("Booking BK-42 confirmed"));  // dynamic dispatch
                }
                System.out.println(channels.get(0).send("Payment failed", 1));
            }
        }`, out: code`
        EMAIL to asha@example.com: Booking BK-42 confirmed
        SMS to +91-9800000001: Booking BK-42 confirmed
        Notice to ops-team: Booking BK-42 confirmed
        EMAIL to asha@example.com: [P1] Payment failed` },
      table: { head: ['', 'Overloading', 'Overriding'], rows: [
        ['Where', 'Same class (or subclass)', 'Subclass redefines a parent method'],
        ['Signature', 'Same name, **different parameters**', 'Same name **and** parameters'],
        ['Resolved', 'Compile time (static binding)', 'Runtime (dynamic dispatch)'],
        ['Annotation', '\u2014', '`@Override` (always use it)']
      ] },
      notes: [
        "The loop variable has static type `Notification`, but each call runs the subclass version: that is runtime polymorphism. Point to the last line: the inherited overload `send(msg, priority)` calls `send(...)`, which is dispatched to `EmailNotification`'s override \u2014 a lovely demonstration of dynamic dispatch inside the parent class.",
        "`@Override` makes the compiler verify that you really override something; a typo such as `sendd` would otherwise silently create a new method.",
        "Rules worth memorising: an override cannot reduce visibility, cannot throw broader checked exceptions, and may return a subtype (covariant return). `static` and `private` methods are not overridden."
      ]
    },
    {
      type: 'practical',
      title: 'Constructors, static, equals/hashCode & records',
      lead: 'Constructors build valid objects, `static` members belong to the class, and `equals`/`hashCode` define *logical* identity.',
      points: [
        "`this(...)` chains constructors; `super(...)` calls the parent constructor (must be the first statement).",
        "`==` compares references; `equals()` compares meaning \u2014 override it together with `hashCode()`.",
        "**Records** (Java 16+) generate constructor, accessors, `equals`, `hashCode`, `toString` for immutable data."
      ],
      code: { lang: 'java', file: 'ObjectsDemo.java', src: code`
        import java.util.Objects;

        public class ObjectsDemo {

            static class Product {
                private static int created = 0;              // one copy per class
                private final String sku;
                private final String name;

                Product(String sku, String name) {
                    this.sku = sku;
                    this.name = name;
                    created++;
                }
                Product(String sku) { this(sku, "Unnamed"); } // constructor chaining

                @Override public boolean equals(Object o) {
                    return o instanceof Product p && sku.equals(p.sku);   // pattern matching
                }
                @Override public int hashCode() { return Objects.hash(sku); }
                @Override public String toString() { return "Product[" + sku + ", " + name + "]"; }
            }

            record Money(long paise, String currency) {      // immutable data carrier
                Money {                                       // compact constructor
                    if (paise < 0) throw new IllegalArgumentException("negative amount");
                }
            }

            public static void main(String[] args) {
                Product a = new Product("SKU-1", "Keyboard");
                Product b = new Product("SKU-1");
                System.out.println(a == b);
                System.out.println(a.equals(b));
                System.out.println(b);
                System.out.println("created = " + Product.created);
                Money m = new Money(49_900, "INR");
                System.out.println(m + " equal? " + m.equals(new Money(49_900, "INR")));
            }
        }`, out: code`
        false
        true
        Product[SKU-1, Unnamed]
        created = 2
        Money[paise=49900, currency=INR] equal? true` },
      notes: [
        "The `equals`/`hashCode` contract: equal objects **must** have equal hash codes. Break it and `HashMap`/`HashSet` misbehave (we will see why in Session 5 when we open up HashMap's buckets).",
        "`o instanceof Product p` is *pattern matching for instanceof* (Java 16): it tests and casts in one step.",
        "Records are perfect for DTOs and value objects \u2014 we will use them for REST request/response bodies from Session 8 onwards. They are shallowly immutable: fields are `final`, but a record holding a `List` should copy it defensively (`List.copyOf`)."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: model a library and inspect it on the JVM',
      lead: 'Practise the four pillars, then look under the hood with the JDK tools.',
      steps: [
        "Install JDK 21 (Temurin) and confirm `java -version` and `javac -version` both print 21 or newer.",
        "Create `LibraryApp.java` with a base class `LibraryItem` (private `title`, method `double lateFee(int days)` returning `days * 1.0`).",
        "Add subclasses `Book` (\u20B92/day) and `Dvd` (\u20B910/day, max \u20B9100) that **override** `lateFee` and call `super(title)`.",
        "Validate input in constructors (blank title \u2192 `IllegalArgumentException`) and add a `toString()`.",
        "In `main`, put items in a `List<LibraryItem>` and print the fee for a 12-day delay for each item.",
        "Compile and run: `javac LibraryApp.java` then `java LibraryApp`. Also try `java LibraryApp.java` (single-file launch).",
        "Run `javap -c Book` and find the bytecode of `lateFee`; run `java -Xlog:gc -Xmx64m LibraryApp` and read the GC line.",
        "Stretch: open `jshell`, declare `record Point(int x, int y) {}` and compare two points with `==` and `equals`."
      ],
      code: { lang: 'java', file: 'LibraryApp.java', label: 'Reference solution', src: code`
        import java.util.List;

        class LibraryItem {
            private final String title;
            LibraryItem(String title) {
                if (title == null || title.isBlank()) throw new IllegalArgumentException("title required");
                this.title = title;
            }
            String title() { return title; }
            double lateFee(int days) { return days * 1.0; }
            @Override public String toString() { return getClass().getSimpleName() + "(" + title + ")"; }
        }

        class Book extends LibraryItem {
            Book(String title) { super(title); }
            @Override double lateFee(int days) { return days * 2.0; }
        }

        class Dvd extends LibraryItem {
            Dvd(String title) { super(title); }
            @Override double lateFee(int days) { return Math.min(days * 10.0, 100.0); }
        }

        public class LibraryApp {
            public static void main(String[] args) {
                List<LibraryItem> items = List.of(new Book("Effective Java"), new Dvd("Inception"),
                        new LibraryItem("Magazine"));
                for (LibraryItem item : items) {
                    System.out.println(item + " -> Rs." + item.lateFee(12));
                }
            }
        }`, out: code`
        Book(Effective Java) -> Rs.24.0
        Dvd(Inception) -> Rs.100.0
        LibraryItem(Magazine) -> Rs.12.0` },
      notes: [
        "Give students 25\u201330 minutes. Encourage them to type the code instead of copying \u2014 compiler errors are part of the learning.",
        "Discussion after the lab: *why is `LibraryItem` instantiable at all?* A generic \"item\" should not exist on its own \u2014 that is exactly the motivation for **abstract classes** in Session 2.",
        "If `javap` is not on the PATH, it lives in the JDK's `bin` folder. Point out `invokevirtual` in callers: that instruction is what makes dynamic dispatch possible."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: JVM & OOP fundamentals',
      quiz: [
        { q: "Which component turns frequently executed bytecode into native machine code?", options: ['Class loader', 'JIT compiler', 'javac', 'Garbage collector'], answer: 1,
          why: "The JIT (just-in-time) compiler in the execution engine compiles *hot* methods at runtime. `javac` only produces bytecode." },
        { q: "Where is the object created by `new Order(\"ORD-1\", 3)` stored?", options: ['Thread stack', 'Heap', 'Metaspace', 'PC register'], answer: 1,
          why: "All objects live on the heap. The *reference* variable holding it lives in the current stack frame." },
        { q: "Why can't you replace `java.lang.String` by putting your own `String.class` on the class path?", options: ['Strings are final', 'Parent-first delegation loads the bootstrap version first', 'The JIT ignores it', 'javac forbids the package name'], answer: 1,
          why: "Class loaders delegate to their parent first; the bootstrap loader finds the real `java.lang.String` before the application loader is consulted." },
        { q: "Method *overriding* is resolved\u2026", options: ['At compile time', 'At runtime, based on the actual object type', 'By the class loader', 'Only for static methods'], answer: 1,
          why: "Overriding uses dynamic dispatch (`invokevirtual`): the JVM chooses the implementation of the object's runtime class. Overloading is resolved at compile time." },
        { q: "A class exposes `public double balance;`. Which pillar does this violate?", options: ['Inheritance', 'Polymorphism', 'Encapsulation', 'Abstraction'], answer: 2,
          why: "Public mutable fields let any code break the object's invariants; encapsulation hides state behind validated methods." }
      ],
      notes: [
        "Run the quiz live: let students answer individually first, then discuss. Questions 3 and 4 are frequent interview questions.",
        "If many students miss Q2, redraw the stack/heap picture from the MemoryDemo slide with one more example that has two references to the same object."
      ]
    },
    {
      type: 'summary',
      title: 'Session 1 recap',
      points: [
        "`javac` compiles to **bytecode**; the **JVM** loads, verifies, interprets and JIT-compiles it \u2192 write once, run anywhere.",
        "JDK (tools) \u2283 runtime (libraries) \u2283 JVM (engine).",
        "Heap & Metaspace are shared; each thread has its own stack \u2192 the root of thread-safety questions.",
        "Class loaders delegate parent-first; GC frees unreachable objects using generations.",
        "OOP pillars: encapsulation, inheritance, polymorphism, abstraction. Use `@Override`, override `equals` + `hashCode` together, prefer records for data."
      ],
      cards: [
        ['Bytecode', 'Platform-neutral instructions in `.class` files, executed by the JVM.'],
        ['JIT', 'Just-in-time compiler: turns hot bytecode into optimised native code at runtime.'],
        ['Metaspace', 'Native memory area for class metadata (replaced PermGen in Java 8).'],
        ['GC root', 'A starting point for reachability: stack locals, static fields, live threads.'],
        ['Pass-by-value', 'Java copies arguments; for objects the copied value is the reference.'],
        ['Dynamic dispatch', 'Choosing the overriding method at runtime from the object\u2019s actual class.'],
        ['Record', 'Concise immutable data class with generated equals/hashCode/toString.'],
        ['Delegation model', 'A class loader asks its parent before loading a class itself.']
      ],
      notes: [
        "Recap in two minutes, then preview Session 2: abstract classes and interfaces (the *abstraction* pillar in depth) plus how Java models errors with its exception hierarchy.",
        "Homework: finish the lab stretch goal and write three sentences explaining the difference between `==` and `equals` in your own words."
      ]
    }
  ]
});
