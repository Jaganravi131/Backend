COURSE.session({
  no: 6,
  short: 'Threads, executors & Maven',
  title: 'Multithreading, Thread Pools, Synchronization, ExecutorService & Maven Lifecycle',
  covers: [6, 7],
  objectives: [
    "Create and coordinate threads; explain thread states, race conditions and the Java Memory Model basics.",
    "Protect shared state with `synchronized`, locks, atomics and concurrent collections; recognise deadlocks.",
    "Run work on thread pools with `ExecutorService`, `Callable`/`Future`, `CompletableFuture` and virtual threads.",
    "Read and write a `pom.xml` and drive builds through Maven's lifecycle phases."
  ],
  prereq: "Sessions 3–5: lambdas, collections, and the stack/heap model from Session 1.",
  slides: [
    {
      type: 'theory',
      title: 'Processes, threads & why backends need concurrency',
      lead: 'A **process** has its own memory; its **threads** share the heap but each has its own stack. A web server handles many requests at once by running them on different threads.',
      diagram: { kind: 'graph', cw: 215, ch: 100, bw: 140, nodes: [
        { id: 'new', t: 'NEW', s: 'new Thread(task)', x: 0, y: 1, tone: 'gray' },
        { id: 'run', t: 'RUNNABLE', s: 'running or ready', x: 1, y: 1, tone: 'green' },
        { id: 'blk', t: 'BLOCKED', s: 'waiting for a lock', x: 2, y: 0, tone: 'red' },
        { id: 'wait', t: 'WAITING', s: 'join(), wait(), park', x: 2, y: 1, tone: 'yellow' },
        { id: 'tw', t: 'TIMED_WAITING', s: 'sleep(ms), wait(ms)', x: 2, y: 2, tone: 'orange' },
        { id: 'end', t: 'TERMINATED', s: 'run() returned', x: 1, y: 2, tone: 'purple' }
      ], edges: [['new', 'run', 'start()'], ['run', 'blk'], ['blk', 'run'], ['run', 'wait'], ['wait', 'run'], ['run', 'tw'], ['tw', 'run'], ['run', 'end', 'finishes']] },
      points: [
        "**Concurrency** = dealing with many things at once; **parallelism** = doing many things at the same instant on multiple cores.",
        "Backend uses: one request per thread (Tomcat), parallel calls to other services, background jobs, async messaging.",
        "Threads are cheap compared to processes, but a platform thread still costs ~1 MB of stack and an OS thread — hence **pools** and, since Java 21, **virtual threads**."
      ],
      notes: [
        "Connect to Session 1: each thread gets its own stack (locals are private), but all threads share the heap — any object reachable from two threads is shared state that needs protection.",
        "`Thread.getState()` returns exactly the states on the diagram. In a thread dump (`jcmd <pid> Thread.print`), threads stuck in BLOCKED usually point to lock contention; many threads in WAITING on a pool's queue means the pool is idle.",
        "Spring Boot's embedded Tomcat uses a pool of 200 worker threads by default; from Session 24 we will also enable virtual threads with one property."
      ]
    },
    {
      type: 'practical',
      title: 'Creating, starting & joining threads',
      lead: 'Give a `Thread` a `Runnable` (usually a lambda), call `start()`, and use `join()` to wait for it.',
      code: { lang: 'java', file: 'ThreadBasics.java', src: code`
        public class ThreadBasics {
            static long sumRange(long from, long to) {
                long s = 0;
                for (long i = from; i <= to; i++) s += i;
                return s;
            }

            public static void main(String[] args) throws InterruptedException {
                long[] partial = new long[2];
                Thread t1 = new Thread(() -> partial[0] = sumRange(1, 50_000_000), "worker-1");
                Thread t2 = new Thread(() -> partial[1] = sumRange(50_000_001, 100_000_000), "worker-2");
                System.out.println(t1.getName() + " state before start: " + t1.getState());
                t1.start();                          // start() creates a new thread of execution
                t2.start();
                t1.join();                           // wait for both halves
                t2.join();
                System.out.println(t1.getName() + " state after join: " + t1.getState());
                System.out.println("total = " + (partial[0] + partial[1]));

                Runnable whoAmI = () -> System.out.println("running on: " + Thread.currentThread().getName());
                whoAmI.run();                        // plain method call: runs on main!
                Thread t3 = new Thread(whoAmI, "worker-3");
                t3.start();
                t3.join();

                Thread v = Thread.ofVirtual().name("virtual-1").start(whoAmI);   // Java 21
                v.join();
                System.out.println("virtual? " + v.isVirtual());
            }
        }`, out: code`
        worker-1 state before start: NEW
        worker-1 state after join: TERMINATED
        total = 5000000050000000
        running on: main
        running on: worker-3
        running on: virtual-1
        virtual? true` },
      callout: { kind: 'interview', text: "*start() vs run()?* `start()` asks the JVM to create a new thread that then calls `run()`. Calling `run()` directly is an ordinary method call on the current thread — no concurrency at all." },
      notes: [
        "Prefer passing a `Runnable` (or lambda) over extending `Thread`: it separates the task from the mechanism, and the same task can later be submitted to an executor.",
        "Why is reading `partial[0]` after `join()` safe? `join()` creates a *happens-before* edge: everything the thread wrote is visible to the thread that joined it.",
        "Virtual threads (Java 21) are scheduled by the JVM onto a few carrier threads. Creating a million of them is fine; they shine for blocking I/O such as HTTP and JDBC calls."
      ]
    },
    {
      type: 'theory',
      title: 'Race conditions & the Java Memory Model',
      lead: 'When threads share **mutable** state without coordination, results depend on timing. Two separate problems: **atomicity** and **visibility**.',
      points: [
        "`count++` is three steps — read, add, write. Two threads can interleave and *lose* an update.",
        "Each core may cache values; without a happens-before relationship one thread may **never see** another's write.",
        "**Happens-before** edges: unlocking → later locking the same monitor, writing → reading a `volatile`, `start()`, `join()`, concurrent collections, `Future.get()`.",
        "Safest strategies: **don't share** (confine to one thread), **don't mutate** (immutable objects/records), or **synchronize correctly**."
      ],
      diagram: { kind: 'seq', actors: ['Thread A', 'count (heap)', 'Thread B'], msgs: [
        [0, 1, 'read count = 5'],
        [2, 1, 'read count = 5'],
        [0, 0, 'compute 5 + 1'],
        [2, 2, 'compute 5 + 1'],
        [0, 1, 'write 6'],
        [2, 1, 'write 6   (one increment lost!)']
      ] },
      table: { head: ['Tool', 'Atomicity', 'Visibility', 'Typical use'], rows: [
        ['`volatile`', '❌ (single reads/writes only)', '✅', 'flags such as `running = false`'],
        ['`synchronized` / `Lock`', '✅', '✅', 'protect invariants over several fields'],
        ['`AtomicInteger`, `LongAdder`', '✅ (CAS)', '✅', 'counters, sequence numbers'],
        ['`ConcurrentHashMap`, `BlockingQueue`', '✅ per operation', '✅', 'shared caches, work queues']
      ] },
      notes: [
        "Draw the interleaving on the board exactly like the sequence diagram. The bug is invisible in code review and rare in testing — and then appears in production under load.",
        "Immutability is the cheapest form of thread safety: records with immutable fields can be shared freely. That's one reason Spring beans are usually stateless singletons.",
        "Compare-and-set (CAS): atomics read a value, compute the new one, and write it only if nobody changed it meanwhile — retrying otherwise. No locks, no blocking."
      ]
    },
    {
      type: 'practical',
      title: 'Lost updates — and four ways to fix a counter',
      lead: 'Four threads each increment four counters 100,000 times. Only the unsynchronized one is wrong.',
      code: { lang: 'java', file: 'CounterDemo.java', verify: 'run', src: code`
        import java.util.concurrent.*;
        import java.util.concurrent.atomic.*;

        public class CounterDemo {
            static int unsafeCount = 0;
            static int syncCount = 0;
            static final Object LOCK = new Object();
            static final AtomicInteger atomicCount = new AtomicInteger();
            static final LongAdder adder = new LongAdder();

            public static void main(String[] args) {
                int threads = 4, perThread = 100_000;
                try (ExecutorService pool = Executors.newFixedThreadPool(threads)) {
                    for (int t = 0; t < threads; t++) {
                        pool.submit(() -> {
                            for (int i = 0; i < perThread; i++) {
                                unsafeCount++;                          // read-modify-write: NOT atomic
                                synchronized (LOCK) { syncCount++; }    // mutual exclusion + visibility
                                atomicCount.incrementAndGet();          // lock-free CAS
                                adder.increment();                      // scales best under contention
                            }
                        });
                    }
                }                                                       // close() waits for all tasks
                System.out.println("expected = " + threads * perThread);
                System.out.println("unsafe   = " + unsafeCount + "   <- lost updates, varies per run");
                System.out.println("sync     = " + syncCount);
                System.out.println("atomic   = " + atomicCount.get());
                System.out.println("adder    = " + adder.sum());
            }
        }`, out: code`
        expected = 400000
        unsafe   = 271843   <- lost updates, varies per run
        sync     = 400000
        atomic   = 400000
        adder    = 400000` },
      notes: [
        "Run it a few times: the unsafe number changes every run (and is occasionally correct, which is what makes these bugs so treacherous).",
        "`synchronized (LOCK)` uses an intrinsic monitor: only one thread at a time can run the block, and leaving it publishes the writes to the next thread that enters.",
        "`LongAdder` keeps several internal cells and sums them on read, so threads rarely contend — ideal for metrics counters. Use `AtomicInteger` when you need the exact current value atomically (e.g. ID generation)."
      ]
    },
    {
      type: 'theory',
      title: 'Synchronization toolkit & deadlocks',
      lead: 'Pick the simplest tool that preserves your invariants, and always acquire multiple locks in a consistent order.',
      table: { head: ['Tool', 'What it gives you'], rows: [
        ['`synchronized` method/block', 'Re-entrant intrinsic lock; simplest; released automatically, even on exceptions'],
        ['`ReentrantLock`', '`tryLock(timeout)`, interruptible waits, fairness option — release in `finally`'],
        ['`ReadWriteLock` / `StampedLock`', 'Many concurrent readers, exclusive writers'],
        ['`Semaphore`', 'Limit concurrent access to N permits (e.g. max 10 calls to a slow API)'],
        ['`CountDownLatch` / `CyclicBarrier`', 'Wait for N events / let N threads meet at a point'],
        ['`BlockingQueue`', 'Hand work from producers to consumers safely (with back-pressure)']
      ] },
      points: [
        "**Deadlock** needs four conditions together: mutual exclusion, hold-and-wait, no preemption, circular wait.",
        "Break the cycle: global **lock ordering**, `tryLock` with a timeout, or fewer/coarser locks.",
        "Other liveness problems: **starvation** (a thread never gets the lock) and **livelock** (threads keep reacting to each other without progress)."
      ],
      code: { lang: 'java', label: 'Deadlock & the lock-ordering fix', verify: false, src: code`
        // Thread A runs transfer(acc1, acc2) while thread B runs transfer(acc2, acc1):
        // A holds acc1 and waits for acc2; B holds acc2 and waits for acc1 -> stuck forever.
        void transfer(Account from, Account to, long amount) {
            synchronized (from) {
                synchronized (to) {
                    from.debit(amount);
                    to.credit(amount);
                }
            }
        }

        // Fix: every thread locks accounts in the same global order (by id)
        void safeTransfer(Account from, Account to, long amount) {
            Account first = from.id() < to.id() ? from : to;
            Account second = first == from ? to : from;
            synchronized (first) {
                synchronized (second) {
                    from.debit(amount);
                    to.credit(amount);
                }
            }
        }` },
      notes: [
        "The bank-transfer deadlock is the canonical example and a common interview question. In a thread dump the JVM even reports it: *Found one Java-level deadlock*.",
        "In real backends we mostly avoid in-memory locks across requests: the database provides transactions and row locks (Session 11), and distributed systems use optimistic locking with version columns (Session 22)."
      ]
    },
    {
      type: 'practical',
      title: 'Producer–consumer with a BlockingQueue',
      lead: 'A bounded queue decouples a fast producer from a slower consumer and applies **back-pressure** automatically.',
      code: { lang: 'java', file: 'ProducerConsumer.java', src: code`
        import java.util.*;
        import java.util.concurrent.*;

        public class ProducerConsumer {
            record Order(int id) {}
            static final Order POISON = new Order(-1);               // "no more work" marker

            public static void main(String[] args) throws InterruptedException {
                BlockingQueue<Order> queue = new ArrayBlockingQueue<>(5);      // bounded
                List<String> processed = Collections.synchronizedList(new ArrayList<>());

                Thread producer = new Thread(() -> {
                    try {
                        for (int i = 1; i <= 10; i++) queue.put(new Order(i));   // blocks when full
                        queue.put(POISON);
                    } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                }, "producer");

                Thread consumer = new Thread(() -> {
                    try {
                        while (true) {
                            Order o = queue.take();                               // blocks when empty
                            if (o == POISON) break;
                            processed.add("O" + o.id());
                        }
                    } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                }, "consumer");

                producer.start(); consumer.start();
                producer.join(); consumer.join();
                System.out.println("processed " + processed.size() + " orders: " + processed);
                System.out.println("queue empty? " + queue.isEmpty());
            }
        }`, out: code`
        processed 10 orders: [O1, O2, O3, O4, O5, O6, O7, O8, O9, O10]
        queue empty? true` },
      notes: [
        "`put` blocks when the queue is full and `take` blocks when it is empty — no busy-waiting, no manual `wait/notify`. This is exactly how a thread pool's work queue operates.",
        "Restoring the interrupt flag (`Thread.currentThread().interrupt()`) in a catch block is the polite way to let the owner of the thread know a shutdown was requested.",
        "Keep this picture in mind for Session 20: Kafka is a distributed, persistent producer–consumer queue."
      ]
    },
    {
      type: 'theory',
      title: 'Thread pools & ExecutorService',
      lead: 'Creating a thread per task is expensive and unbounded. A **pool** reuses a fixed set of worker threads that pull tasks from a queue.',
      diagram: { kind: 'flow', dir: 'v', nodes: [
        { t: 'submit(task)', s: 'Runnable or Callable', tone: 'blue' },
        { t: 'Core threads', s: 'run it immediately if a core thread is free', tone: 'green' },
        { t: 'Work queue', s: 'otherwise wait in the queue (bounded!)', tone: 'yellow' },
        { t: 'Extra threads up to max', s: 'only when the queue is full', tone: 'orange' },
        { t: 'RejectedExecutionHandler', s: 'queue full + max reached: abort / caller-runs / discard', tone: 'red' }
      ] },
      table: { head: ['Factory', 'Behaviour', 'Watch out'], rows: [
        ['`newFixedThreadPool(n)`', 'n threads, shared queue', 'queue is **unbounded** → memory risk'],
        ['`newCachedThreadPool()`', 'grows on demand, idle threads die', 'can create thousands of threads'],
        ['`newScheduledThreadPool(n)`', 'delayed / periodic tasks', 'long tasks delay others'],
        ['`newVirtualThreadPerTaskExecutor()`', 'one cheap virtual thread per task (Java 21)', 'great for blocking I/O, not CPU-bound work'],
        ['`new ThreadPoolExecutor(...)`', 'full control: core, max, queue, rejection policy', 'production-grade choice']
      ] },
      notes: [
        "Sizing rule of thumb: CPU-bound work ≈ number of cores; I/O-bound work can use more threads because they spend time waiting — or simply use virtual threads.",
        "Always shut executors down. Since Java 19 `ExecutorService` is `AutoCloseable`: try-with-resources calls `close()`, which waits for submitted tasks to finish.",
        "Spring offers the same concepts declaratively: `@Async`, `TaskExecutor`, `@Scheduled` — all backed by executors."
      ]
    },
    {
      type: 'practical',
      title: 'ExecutorService with Callable & Future',
      lead: 'Query three vendors in parallel: total time ≈ the **slowest** call, not the sum.',
      code: { lang: 'java', file: 'ExecutorDemo.java', src: code`
        import java.util.*;
        import java.util.concurrent.*;

        public class ExecutorDemo {
            record Quote(String vendor, int price) {}

            static Quote fetchQuote(String vendor, int price, long latencyMs) throws InterruptedException {
                Thread.sleep(latencyMs);                           // simulate a remote API call
                return new Quote(vendor, price);
            }

            public static void main(String[] args) throws Exception {
                List<Callable<Quote>> calls = List.of(
                        () -> fetchQuote("AirIndia", 5400, 300),
                        () -> fetchQuote("IndiGo", 4900, 200),
                        () -> fetchQuote("Vistara", 6100, 250));

                long start = System.nanoTime();
                try (ExecutorService pool = Executors.newFixedThreadPool(3)) {
                    List<Future<Quote>> futures = pool.invokeAll(calls);  // run all, wait for all
                    Quote best = null;
                    for (Future<Quote> f : futures) {
                        Quote q = f.get();                                // may throw ExecutionException
                        System.out.println(q.vendor() + " -> " + q.price());
                        if (best == null || q.price() < best.price()) best = q;
                    }
                    System.out.println("cheapest: " + best.vendor());

                    Future<Integer> slow = pool.submit(() -> { Thread.sleep(2_000); return 42; });
                    try {
                        slow.get(100, TimeUnit.MILLISECONDS);             // never wait forever
                    } catch (TimeoutException e) {
                        System.out.println("timed out -> cancelled: " + slow.cancel(true));
                    }
                }
                long ms = (System.nanoTime() - start) / 1_000_000;
                System.out.println("faster than sequential (750 ms)? " + (ms < 700));
            }
        }`, out: code`
        AirIndia -> 5400
        IndiGo -> 4900
        Vistara -> 6100
        cheapest: IndiGo
        timed out -> cancelled: true
        faster than sequential (750 ms)? true` },
      notes: [
        "`Callable<V>` is like `Runnable` but returns a value and may throw checked exceptions. `Future.get()` blocks until the result is ready and wraps task failures in `ExecutionException` (use `getCause()`).",
        "Timeouts are not optional in backend code: every remote call needs one, otherwise a slow dependency exhausts your threads. We'll see the same idea as Feign/HTTP timeouts and circuit breakers in Module 4.",
        "`cancel(true)` interrupts the worker, which wakes up `Thread.sleep` with an `InterruptedException`."
      ]
    },
    {
      type: 'practical',
      title: 'CompletableFuture & virtual threads',
      lead: 'Compose asynchronous steps without blocking, handle failures with fallbacks, and run thousands of blocking tasks on virtual threads.',
      code: { lang: 'java', file: 'AsyncDemo.java', src: code`
        import java.util.*;
        import java.util.concurrent.*;

        public class AsyncDemo {
            static void sleep(long ms) {
                try { Thread.sleep(ms); } catch (InterruptedException e) { throw new RuntimeException(e); }
            }
            static int price(String sku) { sleep(200); return sku.equals("SKU-1") ? 1000 : 500; }
            static double discount(String tier) { sleep(150); return tier.equals("gold") ? 0.2 : 0.05; }
            static int stock() { throw new IllegalStateException("inventory service down"); }

            public static void main(String[] args) throws Exception {
                try (ExecutorService io = Executors.newVirtualThreadPerTaskExecutor()) {
                    CompletableFuture<Integer> priceF = CompletableFuture.supplyAsync(() -> price("SKU-1"), io);
                    CompletableFuture<Double> discountF = CompletableFuture.supplyAsync(() -> discount("gold"), io);
                    String quote = priceF
                            .thenCombine(discountF, (p, d) -> p * (1 - d))   // both ran concurrently
                            .thenApply(total -> "final price = " + total)
                            .join();
                    System.out.println(quote);

                    int stock = CompletableFuture.supplyAsync(AsyncDemo::stock, io)
                            .exceptionally(ex -> {
                                System.out.println("fallback because: " + ex.getCause().getMessage());
                                return 0;
                            })
                            .join();
                    System.out.println("stock = " + stock);

                    List<Future<Integer>> futures = new ArrayList<>();
                    for (int i = 0; i < 10_000; i++) {
                        int n = i;
                        futures.add(io.submit(() -> { sleep(10); return n; }));   // 10k blocking tasks
                    }
                    long checksum = 0;
                    for (Future<Integer> f : futures) checksum += f.get();
                    System.out.println("completed " + futures.size() + " tasks, checksum " + checksum);
                }
            }
        }`, out: code`
        final price = 800.0
        fallback because: inventory service down
        stock = 0
        completed 10000 tasks, checksum 49995000` },
      notes: [
        "`thenCombine` waits for two independent futures; `thenApply` transforms a result; `thenCompose` chains a call that itself returns a future; `exceptionally`/`handle` provide fallbacks; `allOf` waits for many.",
        "Exceptions from `supplyAsync` arrive wrapped in a `CompletionException`, hence `ex.getCause()`.",
        "10,000 tasks that each block for 10 ms finish in a fraction of a second on virtual threads. With a fixed pool of 10 platform threads the same work would take ~10 seconds. Virtual threads make the simple blocking style scale — Spring Boot can run every request on one (Session 24)."
      ]
    },
    {
      type: 'theory',
      title: 'Maven: build tool & dependency manager',
      lead: 'Maven turns source code into a tested, packaged artifact using **conventions**, a declarative **POM**, and a central **repository** of libraries.',
      diagram: { kind: 'tree', root: { t: 'order-processor/', tone: 'gray', c: [
        { t: 'pom.xml', s: 'project object model', tone: 'yellow' },
        { t: 'mvnw, .mvn/', s: 'Maven Wrapper: pinned Maven version', tone: 'gray' },
        { t: 'src/main/java/', s: 'application code', tone: 'blue', c: [{ t: 'com/example/orders/App.java', tone: 'blue' }] },
        { t: 'src/main/resources/', s: 'config, SQL, templates', tone: 'blue' },
        { t: 'src/test/java/', s: 'unit tests', tone: 'green' },
        { t: 'target/', s: 'build output (never commit)', tone: 'red' }
      ] } },
      points: [
        "**Coordinates (GAV):** `groupId:artifactId:version` uniquely identify every artifact, e.g. `org.junit.jupiter:junit-jupiter:6.1.3`.",
        "Dependencies are downloaded from **Maven Central** into your local repository `~/.m2/repository`.",
        "**Transitive** dependencies come along automatically; conflicts resolve to the *nearest* definition.",
        "**Scopes:** `compile` (default), `provided`, `runtime`, `test` — control which classpath a jar is on."
      ],
      notes: [
        "Before Maven, teams copied JARs into `lib/` folders and wrote long Ant scripts. Maven's *convention over configuration* means any Java developer can open any Maven project and know where everything is — exactly what Spring Initializr generates in Session 7.",
        "SNAPSHOT versions (`1.0.0-SNAPSHOT`) are work in progress and may be re-downloaded; release versions are immutable.",
        "Gradle is the other major build tool (Kotlin/Groovy DSL, incremental builds). The concepts — coordinates, repositories, scopes, lifecycle-like tasks — transfer directly. This course uses Maven, as the brochure specifies."
      ]
    },
    {
      type: 'practical',
      title: 'Anatomy of a pom.xml',
      lead: 'Coordinates, properties, managed versions, dependencies and plugins — the five parts you edit most.',
      code: { lang: 'xml', file: 'pom.xml', src: code`
        <?xml version="1.0" encoding="UTF-8"?>
        <project xmlns="http://maven.apache.org/POM/4.0.0"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
          <modelVersion>4.0.0</modelVersion>

          <!-- 1. Coordinates (GAV) -->
          <groupId>com.example.orders</groupId>
          <artifactId>order-processor</artifactId>
          <version>1.0.0-SNAPSHOT</version>
          <packaging>jar</packaging>

          <!-- 2. Properties -->
          <properties>
            <maven.compiler.release>21</maven.compiler.release>
            <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
          </properties>

          <!-- 3. Dependency management: a BOM pins versions for a family of artifacts -->
          <dependencyManagement>
            <dependencies>
              <dependency>
                <groupId>org.junit</groupId>
                <artifactId>junit-bom</artifactId>
                <version>6.1.3</version>
                <type>pom</type>
                <scope>import</scope>
              </dependency>
            </dependencies>
          </dependencyManagement>

          <!-- 4. Dependencies (version comes from the BOM) -->
          <dependencies>
            <dependency>
              <groupId>org.junit.jupiter</groupId>
              <artifactId>junit-jupiter</artifactId>
              <scope>test</scope>
            </dependency>
          </dependencies>

          <!-- 5. Build plugins, bound to lifecycle phases -->
          <build>
            <plugins>
              <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.6.0</version>
              </plugin>
              <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-jar-plugin</artifactId>
                <version>3.5.1</version>
                <configuration>
                  <archive>
                    <manifest>
                      <mainClass>com.example.orders.App</mainClass>
                    </manifest>
                  </archive>
                </configuration>
              </plugin>
            </plugins>
          </build>
        </project>` },
      table: { head: ['Scope', 'Compile', 'Test', 'Runtime / packaged', 'Example'], rows: [
        ['`compile`', '✅', '✅', '✅', 'Jackson, Guava'],
        ['`provided`', '✅', '✅', '❌ (container supplies it)', 'Servlet API on an app server, Lombok'],
        ['`runtime`', '❌', '✅', '✅', 'JDBC driver (`mysql-connector-j`)'],
        ['`test`', '❌', '✅', '❌', 'JUnit, Mockito, Testcontainers']
      ] },
      notes: [
        "`maven.compiler.release=21` compiles against the Java 21 API even if you build with a newer JDK — safer than separate `source`/`target` settings.",
        "A **BOM** (bill of materials) is a POM that only manages versions. Spring Boot's parent POM is essentially a huge BOM — that's why Spring Boot dependencies never need a `<version>` (Session 7).",
        "Pin plugin versions: without them Maven falls back to defaults baked into your Maven version, and builds stop being reproducible across machines."
      ]
    },
    {
      type: 'theory',
      title: 'The Maven build lifecycle',
      lead: 'A lifecycle is an ordered list of **phases**. Running a phase runs **every phase before it**; plugin **goals** bound to each phase do the actual work.',
      diagram: { kind: 'flow', nodes: [
        { t: 'validate', s: 'POM is correct', tone: 'gray' },
        { t: 'compile', s: 'compiler:compile', tone: 'blue' },
        { t: 'test', s: 'surefire:test', tone: 'green' },
        { t: 'package', s: 'jar:jar', tone: 'yellow' },
        { t: 'verify', s: 'integration checks', tone: 'orange' },
        { t: 'install', s: 'copy to ~/.m2', tone: 'purple' },
        { t: 'deploy', s: 'push to remote repo', tone: 'red' }
      ] },
      points: [
        "Three built-in lifecycles: **clean** (delete `target/`), **default** (build), **site** (docs).",
        "`mvn package` = validate → compile → test → package. `mvn clean install` = clean, then everything up to install.",
        "A goal can also run directly: `mvn dependency:tree`, `mvn spring-boot:run`, `mvn versions:display-dependency-updates`.",
        "Use the **Maven Wrapper** (`./mvnw`) so every developer and CI server uses the same Maven version (3.9/3.10 today)."
      ],
      notes: [
        "Phases are abstract steps; plugins make them concrete. `compile` is bound to `maven-compiler-plugin:compile` because our packaging is `jar`. A `war` packaging binds `package` to `war:war` instead.",
        "Common flags: `-DskipTests` (compile tests but don't run them), `-Dmaven.test.skip=true` (don't even compile them — avoid), `-U` (force SNAPSHOT updates), `-o` (offline), `-pl module -am` (build one module of a multi-module project).",
        "CI pipelines (Session 23) usually run `./mvnw -B verify`: batch mode, full test suite, no deployment."
      ]
    },
    {
      type: 'practical',
      title: 'Maven on the command line',
      lead: 'The commands you will run every day, with the output you should expect.',
      code: { lang: 'bash', label: 'Terminal', src: code`
        $ mvn -v
        Apache Maven 3.9.16
        Java version: 21.0.8, vendor: Eclipse Adoptium

        $ ./mvnw clean package
        [INFO] --- compiler:3.16.0:compile (default-compile) @ order-processor ---
        [INFO] Compiling 3 source files with javac [debug release 21] to target/classes
        [INFO] --- surefire:3.6.0:test (default-test) @ order-processor ---
        [INFO] Tests run: 4, Failures: 0, Errors: 0, Skipped: 0
        [INFO] --- jar:3.5.1:jar (default-jar) @ order-processor ---
        [INFO] Building jar: target/order-processor-1.0.0-SNAPSHOT.jar
        [INFO] BUILD SUCCESS

        $ java -jar target/order-processor-1.0.0-SNAPSHOT.jar     # Main-Class from the manifest

        $ ./mvnw dependency:tree
        [INFO] com.example.orders:order-processor:jar:1.0.0-SNAPSHOT
        [INFO] \- org.junit.jupiter:junit-jupiter:jar:6.1.3:test
        [INFO]    +- org.junit.jupiter:junit-jupiter-api:jar:6.1.3:test
        [INFO]    |  +- org.opentest4j:opentest4j:jar:1.3.0:test
        [INFO]    |  \- org.junit.platform:junit-platform-commons:jar:6.1.3:test
        [INFO]    +- org.junit.jupiter:junit-jupiter-params:jar:6.1.3:test
        [INFO]    \- org.junit.jupiter:junit-jupiter-engine:jar:6.1.3:test

        $ ./mvnw -q test -Dtest=OrderProcessorTest     # run a single test class
        $ ./mvnw help:effective-pom                    # the fully merged POM` },
      notes: [
        "Read Maven output top-down: each `---` line names *plugin:version:goal (execution id)*. When a build fails, the plugin named just above the error tells you which phase broke.",
        "`dependency:tree` is the first tool to reach for when you see `NoSuchMethodError` or `ClassNotFoundException` at runtime — usually two versions of the same library are fighting. (The tree above is abbreviated; exact transitive versions may differ.)",
        "In IntelliJ the Maven tool window runs the same lifecycle phases with a double-click; the terminal skills still matter for CI and Docker builds."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: a parallel order processor, built with Maven',
      lead: 'Process 1,000 orders on a thread pool, prove the result is identical to a single-threaded run, and package it with Maven.',
      steps: [
        "Generate a project: `mvn archetype:generate -DgroupId=com.example.orders -DartifactId=order-processor -DarchetypeArtifactId=maven-archetype-quickstart -DinteractiveMode=false` (archetypes are covered in depth next session).",
        "Replace the generated `pom.xml` with the one from the 'Anatomy of a pom.xml' slide; run `./mvnw -v` or `mvn -v` to check your setup.",
        "Implement `OrderProcessor.process(orders, threads)` that submits one `Callable` per order to a fixed pool via `invokeAll`.",
        "Count orders per status with `ConcurrentHashMap.merge` and add revenue (+18% GST) to a `LongAdder`.",
        "Print the result for 1 thread and 8 threads and confirm they are equal.",
        "Write a JUnit test asserting that `process(orders, 1)` equals `process(orders, 8)`; run `mvn test`.",
        "Run `mvn clean package` and start the app with `java -jar target/order-processor-1.0.0-SNAPSHOT.jar`.",
        "Stretch: add a 5 ms simulated I/O delay per order and compare a fixed pool of 8 with `Executors.newVirtualThreadPerTaskExecutor()`."
      ],
      code: { lang: 'java', file: 'OrderProcessor.java', label: 'Reference solution', src: code`
        import java.util.*;
        import java.util.concurrent.*;
        import java.util.concurrent.atomic.LongAdder;

        public class OrderProcessor {
            record Order(int id, long amountPaise, String status) {}

            static List<Order> sampleOrders(int n) {
                String[] statuses = {"PAID", "PAID", "PENDING", "FAILED"};
                List<Order> orders = new ArrayList<>();
                for (int i = 1; i <= n; i++) orders.add(new Order(i, 10_000L + (i % 7) * 2_500L, statuses[i % 4]));
                return orders;
            }

            static Map<String, Long> process(List<Order> orders, int threads) throws InterruptedException {
                LongAdder revenue = new LongAdder();
                ConcurrentHashMap<String, Long> byStatus = new ConcurrentHashMap<>();
                try (ExecutorService pool = Executors.newFixedThreadPool(threads)) {
                    List<Callable<Void>> tasks = orders.stream().<Callable<Void>>map(o -> () -> {
                        byStatus.merge(o.status(), 1L, Long::sum);                     // atomic per key
                        if (o.status().equals("PAID")) revenue.add(o.amountPaise() * 118 / 100);
                        return null;
                    }).toList();
                    pool.invokeAll(tasks);
                }
                Map<String, Long> result = new TreeMap<>(byStatus);
                result.put("REVENUE_PAISE", revenue.sum());
                return result;
            }

            public static void main(String[] args) throws Exception {
                List<Order> orders = sampleOrders(1_000);
                Map<String, Long> single = process(orders, 1);
                Map<String, Long> parallel = process(orders, 8);
                System.out.println("1 thread : " + single);
                System.out.println("8 threads: " + parallel);
                System.out.println("same result? " + single.equals(parallel));
            }
        }`, out: code`
        1 thread : {FAILED=250, PAID=500, PENDING=250, REVENUE_PAISE=10339750}
        8 threads: {FAILED=250, PAID=500, PENDING=250, REVENUE_PAISE=10339750}
        same result? true` },
      notes: [
        "Have students deliberately break it: replace `LongAdder` with a plain `long[] total = {0}` and `total[0] += ...`. With 8 threads the revenue becomes wrong and the JUnit test catches it — a perfect demonstration of why concurrency code needs tests.",
        "If `java -jar` reports *no main manifest attribute*, the `maven-jar-plugin` `mainClass` is missing or wrong — a classic first Maven error."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: concurrency & Maven',
      quiz: [
        { q: "What happens if you call `thread.run()` instead of `thread.start()`?", options: ['Same as start()', 'The task runs on the current thread — no new thread', 'IllegalThreadStateException', 'The thread starts twice'], answer: 1,
          why: "`run()` is just a method call. Only `start()` creates a new thread of execution." },
        { q: "Why does `count++` from several threads lose updates?", options: ['int overflows', 'It is a non-atomic read-modify-write', 'The JIT removes it', 'Threads have separate heaps'], answer: 1,
          why: "Two threads can read the same old value and both write old+1. Use `synchronized`, `AtomicInteger` or `LongAdder`." },
        { q: "Which keyword guarantees visibility but NOT atomicity of compound actions?", options: ['synchronized', 'volatile', 'final', 'transient'], answer: 1,
          why: "A `volatile` write is visible to subsequent reads, but `x++` on a volatile is still three separate steps." },
        { q: "Main risk of `Executors.newFixedThreadPool(10)` under a flood of tasks?", options: ['It creates unlimited threads', 'Its unbounded queue can grow until OutOfMemoryError', 'It rejects tasks immediately', 'It cannot return results'], answer: 1,
          why: "The fixed pool uses an unbounded `LinkedBlockingQueue`. Production code should bound the queue and choose a rejection policy." },
        { q: "Which phases run for `mvn package`?", options: ['Only package', 'compile and package', 'validate, compile, test, package', 'clean, compile, package, install'], answer: 2,
          why: "Invoking a phase runs all earlier phases of the default lifecycle. `clean` belongs to a different lifecycle." },
        { q: "A library used only by your unit tests should have scope…", options: ['compile', 'provided', 'runtime', 'test'], answer: 3,
          why: "`test` scope keeps it off the main classpath and out of the packaged artifact." }
      ],
      notes: [
        "Q4 is a real production incident pattern: a fixed pool with an unbounded queue hides overload until memory runs out. Ask students how they would size the queue and which rejection policy they would choose for an API server (often caller-runs or fail fast with HTTP 503)."
      ]
    },
    {
      type: 'summary',
      title: 'Session 6 recap — and Module 1 complete',
      points: [
        "Threads share the heap → shared mutable state needs atomicity **and** visibility (happens-before).",
        "Fix races with confinement, immutability, `synchronized`/locks, atomics or concurrent collections; avoid deadlocks with lock ordering.",
        "Use `ExecutorService` (bounded!) with `Callable`/`Future`, compose with `CompletableFuture`, use virtual threads for blocking I/O.",
        "Maven = conventions + POM (GAV, properties, BOMs, dependencies, plugins) + lifecycle phases.",
        "Module 1 gave you the Java foundation: JVM, OOP, exceptions, functional style, collections, streams, hashing, concurrency and builds."
      ],
      cards: [
        ['Race condition', 'Result depends on thread timing because shared state is accessed without coordination.'],
        ['Happens-before', 'JMM guarantee that one action\u2019s effects are visible to another (locks, volatile, join, start).'],
        ['CAS', 'Compare-and-set: atomic update without locks, retried on conflict.'],
        ['Deadlock', 'Threads wait on each other\u2019s locks forever (circular wait).'],
        ['Future', 'Handle to a pending result; get() blocks and wraps failures in ExecutionException.'],
        ['Virtual thread', 'Lightweight JVM-scheduled thread (Java 21) — cheap to block, ideal for I/O.'],
        ['BOM', 'A POM that only manages dependency versions (imported with scope import).'],
        ['Lifecycle phase', 'An ordered build step; running one runs all earlier phases.']
      ],
      notes: [
        "Congratulate the class on finishing Module 1. Next session opens Module 2: Maven plugins and archetypes, then project setup with Spring Initializr — the first step towards our Spring Boot REST APIs and the Splitwise project."
      ]
    }
  ]
});
