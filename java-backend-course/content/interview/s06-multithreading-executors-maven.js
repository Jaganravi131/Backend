/* Interview pack — Session 6: Multithreading, executors & Maven */
COURSE.prep(6, {
  deepDives: [
    {
      title: 'Deep dive: the Java Memory Model, CAS & false sharing',
      lead: 'Concurrency bugs come from three different problems. Interviewers check whether you can name which one a tool solves.',
      points: [
        "Three separate problems: **atomicity** (`count++` is read–modify–write), **visibility** (a write may sit in a core's cache or a register) and **ordering** (compilers and CPUs reorder independent operations). `volatile` fixes visibility and ordering — not atomicity.",
        "**Happens-before** edges: program order within a thread; unlocking a monitor → later locking of the same monitor; a `volatile` write → later reads of that variable; `Thread.start()` → everything the new thread does; everything a thread does → `join()` returning. Conflicting accesses without such an edge are a **data race**.",
        "**CAS** (compare-and-set) is one CPU instruction (`lock cmpxchg` on x86). `AtomicInteger.incrementAndGet` loops *read → compute → CAS* until nobody interfered: lock-free, but under heavy contention threads burn CPU retrying.",
        "**`LongAdder`** spreads updates over several cells and sums them on read — much faster than `AtomicLong` for hot counters written by many threads, at the price of reads that are not atomic snapshots.",
        "**ABA**: a CAS succeeds if the value went A → B → A in between. It matters for lock-free structures that reuse nodes; `AtomicStampedReference` adds a version number.",
        "**False sharing**: two hot variables on the same 64-byte cache line make cores invalidate each other's caches although they never touch the same variable. The JDK pads such fields with the internal `@Contended` annotation (for example in `LongAdder`'s cells)."
      ],
      code: { lang: 'java', file: 'CasCounters.java', src: code`
        import java.util.*;
        import java.util.concurrent.*;
        import java.util.concurrent.atomic.*;

        public class CasCounters {
            public static void main(String[] args) {
                AtomicLong max = new AtomicLong(Long.MIN_VALUE);
                LongAdder sum = new LongAdder();
                int threads = 4, perThread = 100_000;
                try (ExecutorService pool = Executors.newFixedThreadPool(threads)) {
                    for (int t = 0; t < threads; t++) {
                        long seed = t;
                        pool.submit(() -> {
                            Random rnd = new Random(seed);
                            for (int i = 0; i < perThread; i++) {
                                long latency = rnd.nextInt(1_000_000);
                                max.accumulateAndGet(latency, Math::max);   // CAS loop under the hood
                                sum.add(latency);                           // striped cells, no contention
                            }
                        });
                    }
                }
                long expectedMax = Long.MIN_VALUE, expectedSum = 0;          // same numbers, one thread
                for (int t = 0; t < threads; t++) {
                    Random rnd = new Random(t);
                    for (int i = 0; i < perThread; i++) {
                        long v = rnd.nextInt(1_000_000);
                        expectedMax = Math.max(expectedMax, v);
                        expectedSum += v;
                    }
                }
                System.out.println("max matches: " + (max.get() == expectedMax));
                System.out.println("sum matches: " + (sum.sum() == expectedSum));
            }
        }`, out: code`
        max matches: true
        sum matches: true` },
      callout: { kind: 'interview', text: "When asked *is `volatile` enough here?*, answer with the three problems: if the operation is a single write or read (a stop flag, a published reference), yes; if it is read-modify-write (`++`, check-then-act), no — you need a lock or an atomic." },
      notes: [
        "The program is deterministic even though four threads race: every update goes through an atomic operation (`accumulateAndGet` is a CAS loop, `LongAdder.add` updates a striped cell atomically), and the reads happen after `close()` has waited for all tasks — that wait is itself a happens-before edge.",
        "Replace `AtomicLong` with a plain `long` and `if (v > max) max = v` and the result is wrong on most runs: two threads can both read an old max and the larger write may lose. That race is the classic *check-then-act* bug.",
        "False sharing is a performance problem, never a correctness problem. You find it with profilers that report cache misses; it explains why `LongAdder` outperforms `AtomicLong` by a large factor on many-core machines."
      ]
    },
    {
      title: 'Deep dive: virtual threads — mounting, pinning & when not to use them',
      lead: 'Java 21\'s virtual threads make thread-per-request code scale like reactive code. Interviewers want to know how — and where the limits are.',
      points: [
        "A **virtual thread** is a `Thread` scheduled by the JVM rather than the OS. It runs *mounted* on a carrier — a platform thread from a `ForkJoinPool`, by default one per core. When it blocks on I/O, a lock or `sleep`, the JVM **unmounts** it, saving its stack on the heap, and the carrier runs another virtual thread.",
        "They are cheap — a small object plus a heap-allocated stack that grows as needed — so millions are fine. Blocking code (`InputStream.read`, JDBC, `HttpClient.send`) scales without rewriting it as callbacks.",
        "**Pinning**: a virtual thread that cannot unmount blocks its carrier. On JDK 21–23, blocking inside `synchronized` pinned (prefer `ReentrantLock` there); JDK 24 (JEP 491) removed that limitation. Calls through native code still pin.",
        "Do **not** pool virtual threads — create one per task with `Executors.newVirtualThreadPerTaskExecutor()`, and limit access to scarce resources with a `Semaphore` sized to the resource (for example, the database connection pool).",
        "They do not make CPU-bound work faster — cores remain the limit. `ThreadLocal`s become costly at millions of threads; **scoped values** (JEP 506, final in JDK 25) are the replacement for immutable request context.",
        "In Spring Boot, `spring.threads.virtual.enabled=true` runs request handling and `@Async` tasks on virtual threads. The bottleneck then moves to connection pools and downstream services, so size and monitor those."
      ],
      code: { lang: 'java', file: 'VirtualThreads.java', src: code`
        import java.util.concurrent.*;
        import java.util.concurrent.atomic.*;

        public class VirtualThreads {
            public static void main(String[] args) throws Exception {
                Semaphore dbConnections = new Semaphore(20);     // the scarce resource, not the threads
                AtomicInteger inUse = new AtomicInteger(), maxInUse = new AtomicInteger(), done = new AtomicInteger();
                AtomicBoolean allVirtual = new AtomicBoolean(true);
                try (ExecutorService exec = Executors.newVirtualThreadPerTaskExecutor()) {
                    for (int i = 0; i < 1_000; i++) {
                        exec.submit(() -> {
                            if (!Thread.currentThread().isVirtual()) allVirtual.set(false);
                            dbConnections.acquire();
                            try {
                                maxInUse.accumulateAndGet(inUse.incrementAndGet(), Math::max);
                                Thread.sleep(10);                 // blocking: the virtual thread unmounts
                                inUse.decrementAndGet();
                            } finally {
                                dbConnections.release();
                            }
                            done.incrementAndGet();
                            return null;
                        });
                    }
                }
                System.out.println("completed: " + done.get());
                System.out.println("max concurrent DB calls <= 20: " + (maxInUse.get() <= 20));
                System.out.println("ran on virtual threads: " + allVirtual.get());
            }
        }`, out: code`
        completed: 1000
        max concurrent DB calls <= 20: true
        ran on virtual threads: true` },
      notes: [
        "A thousand tasks each block for 10 ms, yet the program finishes in about half a second: twenty at a time hold a *connection*, and the waiting ones are parked virtual threads that cost almost nothing. With a pool of 20 platform threads you would get the same throughput, but every waiting request would occupy a thread.",
        "This is the key mental shift: with virtual threads you stop sizing thread pools and start sizing **resources** — connection pools, semaphores and rate limiters — because threads are no longer scarce.",
        "Pinning diagnostics on JDK 21–23: run with `-Djdk.tracePinnedThreads=full`, or record JFR's `jdk.VirtualThreadPinned` events. Older JDBC drivers and libraries that hold a `synchronized` lock around I/O were the usual culprits."
      ]
    }
  ],

  stretch: [
    "Run the order processor on `Executors.newVirtualThreadPerTaskExecutor()` with a `Semaphore(10)` guarding the simulated database, and compare throughput for 10,000 orders against a fixed pool of 20 platform threads.",
    "Create a deadlock (two accounts, opposite lock order), capture it with `jcmd <pid> Thread.print`, read the *Found one Java-level deadlock* section, then fix it with a global lock order and prove it with a one-million-iteration test.",
    "Add `maven-enforcer-plugin` with the `dependencyConvergence` rule to the lab's `pom.xml`, introduce a conflicting transitive version, and resolve it with `dependencyManagement`."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: bounded blocking queue',
      lead: 'The canonical concurrency round: build producer–consumer synchronisation from a lock and conditions, then defend every line.',
      difficulty: 'Medium', minutes: 40, lc: 1188, pattern: ['concurrency', 'design'],
      problem: [
        "Implement a thread-safe **bounded blocking queue** with a fixed capacity:",
        "- `enqueue(e)` adds `e` at the back, **blocking** while the queue is full;",
        "- `dequeue()` removes and returns the front element, **blocking** while the queue is empty;",
        "- `size()` returns the number of elements.",
        "Several producer and consumer threads use it concurrently. Build it from a lock and conditions (or `synchronized` with `wait`/`notify`), not from `java.util.concurrent` queues. Follow-up: add `offer(e, timeout)`."
      ],
      examples: [
        { in: 'capacity = 2\nT1: enqueue(1), enqueue(2), enqueue(3)\nT2: dequeue()', out: 'T2 gets 1; T1 was blocked on enqueue(3) until then; queue is now [2, 3]' },
        { in: 'capacity = 1\nconsumer calls dequeue() first', out: 'the consumer blocks until a producer enqueues' }
      ],
      constraints: ["`1 ≤ capacity ≤ 30`", "1–8 producer threads and 1–8 consumer threads", "No element is lost or duplicated; FIFO order is preserved"],
      hints: [
        "Which state is shared, and which steps must be atomic together? *Is it full?* and *insert* must happen under the same lock.",
        "Use one `ReentrantLock` with two `Condition`s — `notFull` for producers and `notEmpty` for consumers — so you wake only threads that can make progress.",
        "After `await()` returns, re-check the condition in a `while` loop: wake-ups can be spurious, and another thread may have taken the slot first."
      ],
      approaches: [
        { name: 'synchronized + wait/notifyAll', idea: 'One monitor; wait while full or empty; notifyAll after every change, because notify could wake the wrong kind of thread', time: 'O(1) per op (plus wake-up storms)', space: 'O(capacity)' },
        { name: 'Lock + two Conditions', idea: 'Signal only producers or only consumers; signal() suffices because each change frees exactly one slot or item', time: 'O(1) per op', space: 'O(capacity)' },
        { name: 'Two semaphores + mutex', idea: '`slots` starts at capacity, `items` at 0; acquire/release around a locked insert/remove', time: 'O(1) per op', space: 'O(capacity)' },
        { name: 'Two locks (LinkedBlockingQueue)', idea: 'Separate put and take locks with an atomic count, so producers and consumers do not contend', time: 'O(1) per op', space: 'O(capacity)' }
      ],
      code: { lang: 'java', file: 'BoundedBlockingQueue.java', src: code`
        import java.util.*;
        import java.util.concurrent.*;
        import java.util.concurrent.atomic.*;
        import java.util.concurrent.locks.*;

        public class BoundedBlockingQueue<E> {
            private final Object[] items;
            private int head, tail, count;                     // circular buffer, guarded by lock
            private final ReentrantLock lock = new ReentrantLock();
            private final Condition notFull = lock.newCondition();
            private final Condition notEmpty = lock.newCondition();

            public BoundedBlockingQueue(int capacity) {
                if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
                items = new Object[capacity];
            }

            public void enqueue(E e) throws InterruptedException {
                Objects.requireNonNull(e);
                lock.lockInterruptibly();
                try {
                    while (count == items.length) notFull.await();   // while, not if
                    insert(e);
                } finally {
                    lock.unlock();
                }
            }

            public boolean offer(E e, long timeout, TimeUnit unit) throws InterruptedException {
                Objects.requireNonNull(e);
                long nanos = unit.toNanos(timeout);
                lock.lockInterruptibly();
                try {
                    while (count == items.length) {
                        if (nanos <= 0) return false;
                        nanos = notFull.awaitNanos(nanos);
                    }
                    insert(e);
                    return true;
                } finally {
                    lock.unlock();
                }
            }

            @SuppressWarnings("unchecked")
            public E dequeue() throws InterruptedException {
                lock.lockInterruptibly();
                try {
                    while (count == 0) notEmpty.await();
                    E e = (E) items[head];
                    items[head] = null;                              // let the GC reclaim it
                    head = (head + 1) % items.length;
                    count--;
                    notFull.signal();                                // one slot freed: wake one producer
                    return e;
                } finally {
                    lock.unlock();
                }
            }

            public int size() {
                lock.lock();
                try { return count; } finally { lock.unlock(); }
            }

            private void insert(E e) {
                items[tail] = e;
                tail = (tail + 1) % items.length;
                count++;
                notEmpty.signal();                                   // one item added: wake one consumer
            }

            public static void main(String[] args) throws Exception {
                BoundedBlockingQueue<long[]> q = new BoundedBlockingQueue<>(8);   // items are {producer, seq}
                int producers = 4, consumers = 4, perProducer = 25_000;
                AtomicLong sum = new AtomicLong();
                AtomicInteger consumed = new AtomicInteger(), maxSize = new AtomicInteger();
                AtomicBoolean fifo = new AtomicBoolean(true);
                try (ExecutorService pool = Executors.newFixedThreadPool(producers + consumers)) {
                    for (int p = 0; p < producers; p++) {
                        int id = p;
                        pool.submit(() -> {
                            for (int i = 0; i < perProducer; i++) {
                                q.enqueue(new long[] { id, i });
                                maxSize.accumulateAndGet(q.size(), Math::max);
                            }
                            return null;
                        });
                    }
                    for (int c = 0; c < consumers; c++) {
                        pool.submit(() -> {
                            long[] last = new long[producers];
                            Arrays.fill(last, -1);
                            for (int i = 0; i < producers * perProducer / consumers; i++) {
                                long[] item = q.dequeue();
                                if (item[1] <= last[(int) item[0]]) fifo.set(false);   // per-producer order
                                last[(int) item[0]] = item[1];
                                sum.addAndGet(item[1]);
                                consumed.incrementAndGet();
                            }
                            return null;
                        });
                    }
                }
                long expected = (long) producers * perProducer * (perProducer - 1) / 2;
                System.out.println("items consumed: " + consumed + ", sum correct: " + (sum.get() == expected));
                System.out.println("size never exceeded capacity: " + (maxSize.get() <= 8));
                System.out.println("per-producer FIFO preserved: " + fifo.get());

                BoundedBlockingQueue<String> full = new BoundedBlockingQueue<>(1);
                full.enqueue("x");
                System.out.println("offer on a full queue (50 ms timeout): " + full.offer("y", 50, TimeUnit.MILLISECONDS));
            }
        }`, out: code`
        items consumed: 100000, sum correct: true
        size never exceeded capacity: true
        per-producer FIFO preserved: true
        offer on a full queue (50 ms timeout): false` },
      pitfalls: [
        "`if` instead of `while` around `await()`: a woken thread may find the queue full again because another producer got there first, or it may have been woken spuriously.",
        "With a single monitor, `notify()` can wake another producer when only a consumer could make progress — a stall. Use `notifyAll()` or separate conditions.",
        "Signalling without holding the lock (`IllegalMonitorStateException`), or forgetting `unlock()` in `finally`.",
        "Swallowing `InterruptedException`: propagate it, or restore the flag with `Thread.currentThread().interrupt()`, so that shutdown can stop blocked threads."
      ],
      followUps: [
        { q: "Why does `ArrayBlockingQueue` use one lock while `LinkedBlockingQueue` uses two?",
          a: "In an array the head, tail and count share one structure, and a single lock keeps it simple. A linked queue lets producers append at the tail and consumers remove at the head independently — two locks plus an `AtomicInteger` count — which raises throughput when both sides are busy, at the cost of allocating a node per element." },
        { q: "Make it fair: serve waiting threads in arrival order.",
          a: "Construct the lock with `new ReentrantLock(true)`: lock acquisition becomes FIFO and condition waiters are woken in order. Fairness prevents starvation but typically costs a large part of the throughput, so use it only when the requirement is real." },
        { q: "Could you make it lock-free?",
          a: "Yes, with a ring buffer whose head and tail are sequence numbers advanced by CAS — the design of the LMAX Disruptor and the JCTools queues. *Blocking* then becomes a choice of waiting strategy (spin, yield, park). It is much harder to get right, so justify it with measurements first." },
        { q: "Does it work with virtual threads?",
          a: "Yes. `ReentrantLock` and `Condition.await()` unmount a waiting virtual thread instead of blocking its carrier. A `synchronized`/`wait()` version pinned the carrier on JDK 21–23; JDK 24 and later no longer pin in that case." }
      ],
      rubric: [
        "Identifies the shared state and makes check-and-act atomic under one lock.",
        "Uses `while` loops, correct signalling (two conditions or `notifyAll`) and `unlock()` in `finally`.",
        "Handles interruption deliberately.",
        "Tests with several producers and consumers and checks invariants: capacity, FIFO, no lost items.",
        "Compares alternatives — semaphores, the two-lock queue — and their trade-offs."
      ],
      notes: [
        "The stress test runs 4 producers and 4 consumers through a queue of capacity 8 with 100,000 items, and checks three invariants: nothing lost (the sum), capacity never exceeded, and each producer's items arrive in order. A version that uses `if` instead of `while`, or a single `notify()`, eventually fails or hangs under this kind of test.",
        "Explain why `signal()` (not `signalAll()`) is enough here: every enqueue adds exactly one item, so waking exactly one consumer is sufficient — and the woken thread re-checks the condition anyway.",
        "This round connects directly to `ThreadPoolExecutor`, whose work queue is a `BlockingQueue` — the topic of today's design round."
      ]
    },
    {
      type: 'design',
      title: 'Design round: build a thread pool executor',
      lead: 'A low-level design round that doubles as a concurrency deep dive: task flow, worker lifecycle, rejection, sizing and shutdown.',
      kind: 'LLD', difficulty: 'Hard', minutes: 60,
      prompt: "Design and implement a simplified `ThreadPoolExecutor`: core worker threads, a bounded work queue, optional extra threads up to a maximum under load, configurable rejection policies and graceful shutdown. Explain exactly how a submitted task flows through the pool.",
      stages: [
        { t: 'Requirements and API', ask: 'What should `submit` return, and what must happen when the pool is overloaded?', points: [
          "`execute(Runnable)`, plus `submit(Callable<T>)` returning a `Future<T>`.",
          "`corePoolSize`, `maximumPoolSize`, a keep-alive time for extra threads, and a **bounded** queue.",
          "Rejection policies: abort (throw), caller-runs (backpressure), discard, discard-oldest.",
          "`shutdown()` finishes queued tasks; `shutdownNow()` interrupts workers and returns the queued tasks; `awaitTermination(timeout)`.",
          "Metrics: active threads, queue depth, completed and rejected counts."
        ] },
        { t: 'The task flow — what most candidates get wrong', ask: 'With 2 core threads, a maximum of 4 and a queue of 2, where do tasks 1 to 7 go?', diagram: { kind: 'flow', dir: 'v', nodes: [
          { t: 'submit(task)', tone: 'blue' },
          { t: 'Fewer than core threads?', s: 'yes → start a core worker with this task', tone: 'green' },
          { t: 'Queue has space?', s: 'yes → enqueue the task', tone: 'yellow' },
          { t: 'Fewer than max threads?', s: 'yes → start an extra worker with this task', tone: 'orange' },
          { t: 'Reject', s: 'apply the rejection policy', tone: 'red' }
        ] }, table: { head: ['Task', 'Goes to', 'Why'], rows: [
          ['1, 2', 'New core threads', 'Fewer than 2 core threads exist'],
          ['3, 4', 'The queue', 'Core is full and the queue has 2 free slots'],
          ['5, 6', 'New extra threads', 'Queue full, fewer than 4 threads in total'],
          ['7', 'Rejected', 'Queue full and 4 threads already running']
        ] }, points: [
          "Core threads first, then the **queue**, and only when the queue is full extra threads up to the maximum — so with an unbounded queue the maximum is never used.",
          "Extra threads die after being idle for the keep-alive time; `allowCoreThreadTimeOut(true)` lets core threads die too."
        ] },
        { t: 'Worker loop and shutdown', ask: 'How does a worker know when to stop, without losing queued tasks?', points: [
          "A worker runs its first task, then loops taking tasks from the queue.",
          "After `shutdown()`, new submissions are rejected and workers exit once the queue is drained; `awaitTermination` joins them with a deadline.",
          "A task that throws must not kill the pool: catch, record, keep the worker alive (or replace it, as the JDK does)."
        ], code: { lang: 'java', file: 'MiniPool.java', src: code`
          import java.util.*;
          import java.util.concurrent.*;
          import java.util.concurrent.atomic.AtomicInteger;

          public class MiniPool {
              private final BlockingQueue<Runnable> queue;
              private final List<Thread> workers = new ArrayList<>();
              private final int core;
              private volatile boolean shutdown;
              private final AtomicInteger completed = new AtomicInteger();

              MiniPool(int core, int queueCapacity) {
                  this.core = core;
                  this.queue = new ArrayBlockingQueue<>(queueCapacity);
              }

              /** Core threads first, then the queue, then reject (abort policy). */
              public synchronized void execute(Runnable task) {
                  if (shutdown) throw new RejectedExecutionException("pool is shut down");
                  if (workers.size() < core) { startWorker(task); return; }
                  if (!queue.offer(task)) throw new RejectedExecutionException("queue full");
              }

              private void startWorker(Runnable first) {
                  Thread t = new Thread(() -> {
                      Runnable task = first;
                      try {
                          while (task != null || (task = next()) != null) {
                              try { task.run(); completed.incrementAndGet(); }
                              catch (RuntimeException e) { System.err.println("task failed: " + e); }   // worker survives
                              task = null;
                          }
                      } catch (InterruptedException e) {
                          Thread.currentThread().interrupt();
                      }
                  }, "mini-pool-" + workers.size());
                  workers.add(t);
                  t.start();
              }

              /** Blocks for work; returns null once shut down and drained. */
              private Runnable next() throws InterruptedException {
                  while (true) {
                      Runnable r = queue.poll(50, TimeUnit.MILLISECONDS);
                      if (r != null) return r;
                      if (shutdown && queue.isEmpty()) return null;
                  }
              }

              public synchronized void shutdown() { shutdown = true; }

              public boolean awaitTermination(long timeout, TimeUnit unit) throws InterruptedException {
                  long deadline = System.nanoTime() + unit.toNanos(timeout);
                  List<Thread> snapshot;
                  synchronized (this) { snapshot = new ArrayList<>(workers); }
                  for (Thread t : snapshot) {
                      long left = deadline - System.nanoTime();
                      if (left <= 0) return false;
                      t.join(Math.max(1, TimeUnit.NANOSECONDS.toMillis(left)));
                      if (t.isAlive()) return false;
                  }
                  return true;
              }

              public static void main(String[] args) throws Exception {
                  MiniPool pool = new MiniPool(2, 2);
                  CountDownLatch gate = new CountDownLatch(1);               // keep the workers busy
                  int accepted = 0, rejected = 0;
                  for (int i = 1; i <= 6; i++) {
                      try {
                          pool.execute(() -> {
                              try { gate.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                          });
                          accepted++;
                      } catch (RejectedExecutionException e) {
                          rejected++;
                      }
                  }
                  System.out.println("accepted: " + accepted + ", rejected: " + rejected);
                  gate.countDown();
                  pool.shutdown();
                  System.out.println("terminated: " + pool.awaitTermination(5, TimeUnit.SECONDS) + ", completed: " + pool.completed.get());
                  try {
                      pool.execute(() -> { });
                  } catch (RejectedExecutionException e) {
                      System.out.println("submit after shutdown -> " + e.getMessage());
                  }
              }
          }`, out: code`
          accepted: 4, rejected: 2
          terminated: true, completed: 4
          submit after shutdown -> pool is shut down` } },
        { t: 'Sizing the pool', ask: 'How many threads for CPU-bound work? For I/O-bound work?', points: [
          "CPU-bound: about the number of cores (`Runtime.getRuntime().availableProcessors()`); more threads only add context switches.",
          "I/O-bound: threads ≈ cores × (1 + wait time ÷ compute time), or by **Little's law**: concurrency = throughput × latency — 200 requests/s × 0.25 s = 50 tasks in flight.",
          "Queues add latency: 1,000 queued tasks of 50 ms each means the last one waits 50 s on a single worker. Bound the queue so overload becomes visible as rejections, not as silent latency.",
          "With virtual threads, stop pooling threads and limit concurrency with a semaphore sized to the scarce resource."
        ] },
        { t: 'Failure handling and observability', ask: 'A task throws an exception. What happens to the worker — and to the caller?', points: [
          "With `execute`, the exception escapes `run()`: the JDK's worker dies (and is replaced) and the thread's `UncaughtExceptionHandler` reports it.",
          "With `submit`, the exception is captured in the `Future` — and **silently lost** unless someone calls `get()`. A classic production surprise.",
          "Name threads via a `ThreadFactory` for readable thread dumps, and export queue depth, active count and rejections as metrics (Micrometer's `ExecutorServiceMetrics`).",
          "Propagate context — MDC, trace ids, the security context — into tasks by decorating the `Runnable` (Spring's `TaskDecorator`)."
        ] }
      ],
      followUps: [
        { q: "`Executors.newFixedThreadPool(32)` caused an `OutOfMemoryError` in production. Why?",
          a: "It uses an **unbounded** `LinkedBlockingQueue`. When submissions outpace processing — a slow database, a traffic spike — tasks accumulate in the queue until the heap runs out, and latency explodes long before that. Use a `ThreadPoolExecutor` with a bounded queue and an explicit rejection policy, and alert on queue depth." },
        { q: "How does `ForkJoinPool` differ from `ThreadPoolExecutor`?",
          a: "Each `ForkJoinPool` worker has its own deque: it pushes and pops its own subtasks at one end (LIFO, cache-friendly) and idle workers **steal** from the other end of busy workers' deques. That suits divide-and-conquer and many small tasks — parallel streams and default-async `CompletableFuture` stages run on the common pool. `ThreadPoolExecutor` has one shared queue and suits independent, coarse-grained tasks." },
        { q: "Implement `scheduleAtFixedRate`.",
          a: "Keep scheduled tasks in a `DelayQueue` ordered by next run time; workers `take()` tasks only when they are due. After running a task, compute its next time — fixed *rate*: previous scheduled time + period; fixed *delay*: completion time + delay — and re-queue it. If a run takes longer than the period, later runs start late rather than overlapping, which is what `ScheduledThreadPoolExecutor` does." }
      ],
      rubric: [
        "States the core → queue → extra threads → reject order correctly, with the 7-task example.",
        "Worker loop and shutdown drain the queue without losing tasks or hanging threads.",
        "Explains rejection policies and how caller-runs creates backpressure.",
        "Argues sizing with numbers (cores, Little's law) and bounds every queue.",
        "Knows the `execute` vs `submit` exception difference and how to observe a pool in production."
      ],
      notes: [
        "Most candidates assume a pool grows to its maximum *before* queueing. The JDK does the opposite, and that single fact explains several real outages (with an unbounded queue, extra threads are never created and latency grows instead).",
        "The mini pool in stage 3 is compiled and run by the course test suite: with 2 workers busy and a queue of 2, the 5th and 6th tasks are rejected, the remaining 4 complete after the gate opens, and submissions after shutdown are refused.",
        "In a Spring application you configure this rather than writing it: `ThreadPoolTaskExecutor` exposes core size, max size, queue capacity and the rejection policy, and Spring Boot's `spring.task.execution.pool.*` properties configure the default executor."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: concurrency & Maven',
      lead: 'Concurrency questions separate SDE-1 from SDE-2 quickly. Expect follow-ups that ask you to name the exact guarantee each tool gives.',
      qa: [
        { level: 1, q: "What does each of `volatile`, `synchronized` and the atomic classes guarantee?",
          a: "`volatile` guarantees **visibility and ordering** for a single variable — a write is seen by later reads, and operations are not reordered across it — but not atomicity of compound actions. `synchronized` guarantees **mutual exclusion and visibility**: one thread at a time runs the block, and everything written before releasing the monitor is visible to the next thread that acquires it. Atomic classes (`AtomicInteger`, `AtomicReference`, `LongAdder`) give **lock-free atomic** read-modify-write operations via CAS, with volatile semantics. Use `volatile` for flags and safely published references, atomics for counters and single-variable updates, and locks when several variables must change together.",
          follow: ["Why is `volatile long` meaningful even on 64-bit JVMs?"] },
        { level: 2, q: "Explain happens-before with one data race that `volatile` fixes and one that it does not.",
          a: "A worker loops `while (running) { … }` and another thread sets `running = false`. Without `volatile` the JIT may hoist the read out of the loop and the worker never stops — a **visibility** problem; making `running` volatile creates a happens-before edge from the write to the next read, so the worker stops. Now four threads execute `count++` on a `volatile int count`: each `++` is a read, an add and a write, so two threads can read the same value and one increment is lost — an **atomicity** problem that `volatile` cannot fix. Use `AtomicInteger.incrementAndGet()`, a `LongAdder`, or a lock.",
          follow: ["Which other actions create happens-before edges?"],
          flags: ["*volatile makes operations atomic*"] },
        { level: 2, q: "What are the four conditions for deadlock, and how do you prevent and detect one in production?",
          a: "Deadlock needs all four Coffman conditions: **mutual exclusion**, **hold and wait**, **no preemption** and **circular wait**. The practical prevention is breaking circular wait with a **global lock order** — for a money transfer, always lock the account with the smaller id first, as in the program. Alternatives: `tryLock` with a timeout and back-off, holding only one lock at a time, or avoiding shared locks altogether (message passing, single-writer designs). To detect a deadlock, take a thread dump (`jcmd <pid> Thread.print` or `jstack`) — the JVM reports *Found one Java-level deadlock* with the threads and locks involved — or call `ThreadMXBean.findDeadlockedThreads()` from a health check.",
          code: { lang: 'java', file: 'OrderedTransfers.java', src: code`
            import java.util.concurrent.*;

            public class OrderedTransfers {
                static final class Account {
                    final int id;
                    long balance;
                    Account(int id, long balance) { this.id = id; this.balance = balance; }
                }

                static void transfer(Account from, Account to, long amount) {
                    Account first = from.id < to.id ? from : to;      // global order breaks circular wait
                    Account second = first == from ? to : from;
                    synchronized (first) {
                        synchronized (second) {
                            from.balance -= amount;
                            to.balance += amount;
                        }
                    }
                }

                public static void main(String[] args) {
                    Account a = new Account(1, 1_000), b = new Account(2, 1_000);
                    try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
                        pool.submit(() -> { for (int i = 0; i < 10_000; i++) transfer(a, b, 1); });
                        pool.submit(() -> { for (int i = 0; i < 10_000; i++) transfer(b, a, 1); });   // opposite direction
                    }
                    System.out.println("transfers done: 20000, total conserved: " + (a.balance + b.balance == 2_000));
                }
            }`, out: 'transfers done: 20000, total conserved: true' },
          follow: ["What is a livelock, and how is it different?", "How would you handle deadlocks between database transactions?"] },
        { level: 2, q: "`CompletableFuture`: what is the difference between `thenApply`, `thenCompose` and `thenCombine`, and where do exceptions go?",
          a: "`thenApply(f)` maps the result with an ordinary function. `thenCompose(f)` is for a function that itself returns a `CompletableFuture` (a dependent asynchronous call) and flattens it, avoiding `CompletableFuture<CompletableFuture<T>>`. `thenCombine(other, f)` waits for **two independent** futures and combines their results. When a stage fails, every dependent stage is skipped and completes exceptionally until an `exceptionally`, `handle` or `whenComplete` deals with it; `join()` rethrows it wrapped in a `CompletionException`. Two production rules: pass your own executor to the `*Async` methods for I/O work (the default is the common ForkJoinPool), and add timeouts with `orTimeout` or `completeOnTimeout`.",
          code: { lang: 'java', file: 'CfDemo.java', src: code`
            import java.util.concurrent.CompletableFuture;

            public class CfDemo {
                public static void main(String[] args) {
                    CompletableFuture<Integer> price = CompletableFuture.supplyAsync(() -> 100);
                    CompletableFuture<Integer> discount = CompletableFuture.supplyAsync(() -> 15);
                    int total = price.thenCombine(discount, (p, d) -> p - d)               // two independent calls
                            .thenCompose(v -> CompletableFuture.supplyAsync(() -> v * 2))    // a dependent async call
                            .thenApply(v -> v + 1)                                          // plain mapping
                            .join();
                    System.out.println("total = " + total);

                    String r = CompletableFuture.supplyAsync(() -> {
                                if (true) throw new IllegalStateException("inventory down");
                                return "ok";
                            })
                            .thenApply(s -> s + "!")                                        // skipped: upstream failed
                            .exceptionally(ex -> "fallback (" + ex.getCause().getMessage() + ")")
                            .join();
                    System.out.println(r);
                }
            }`, out: code`
            total = 171
            fallback (inventory down)` },
          follow: ["Why is `ex` a `CompletionException` here?", "How would you run ten calls in parallel and wait for all of them?"] },
        { level: 2, q: "Why can `Executors.newCachedThreadPool()` take a service down?",
          a: "It uses a `SynchronousQueue` (no capacity) and an effectively unlimited maximum pool size: whenever no idle thread is available, it creates a new one. A burst of slow tasks — for example, calls to a dependency that has started timing out — creates thousands of threads, each with its own stack, until the process runs out of memory or the OS refuses (`OutOfMemoryError: unable to create native thread`), while context switching makes everything slower. The cure is the same as for unbounded queues: bound the pool and the queue, choose a rejection policy, and put timeouts on the work itself.",
          follow: ["When *is* a cached pool reasonable?"] },
        { level: 2, q: "`CountDownLatch`, `CyclicBarrier`, `Semaphore`, `Phaser` — give a backend use for each.",
          a: "**`CountDownLatch`**: wait until N events have happened, once — for example, a startup check that waits for several caches to warm up, or a test that waits for N async callbacks. **`CyclicBarrier`**: N threads repeatedly meet at a point before continuing — iterative parallel computations or load-test phases. **`Semaphore`**: limit concurrent access to a resource — at most 20 concurrent calls to a partner API, or guarding a connection pool when using virtual threads. **`Phaser`**: a reusable barrier whose number of parties can change between phases — multi-stage batch pipelines where workers join and leave. Most application code needs only latches and semaphores; frameworks wrap the rest.",
          follow: ["Can a latch be reset? What would you use instead?"] },
        { level: 3, q: "Virtual threads: what problem do they solve, what don't they solve, and what must change in a Spring Boot service when you enable them?",
          a: [
            "**Solve**: scaling blocking, I/O-bound thread-per-request code to tens of thousands of concurrent requests without reactive rewrites, because a blocked virtual thread releases its carrier.",
            "**Don't solve**: CPU-bound work (cores are still the limit), slow downstream systems, or contention on locks — and they make unbounded concurrency *easier* to create by accident.",
            "**Changes**: turn on `spring.threads.virtual.enabled`; size the **connection pools** and semaphores deliberately, because they become the real throttle; remove thread-pool tuning that assumed scarce threads; review `ThreadLocal`-heavy code and caches keyed by thread; on JDK 21–23 look for pinning (`synchronized` around I/O, old drivers); and update dashboards — thread counts stop meaning *load*.",
            "**Verify** with a load test comparing latency percentiles and error rates, not only throughput."
          ],
          follow: ["Why shouldn't you pool virtual threads?", "What are scoped values?"] },
        { level: 3, q: "`ThreadLocal` in thread pools: what bugs does it cause, and what are the modern alternatives?",
          a: "Pooled threads are reused, so a value set during one request **survives into the next request** that runs on the same thread unless it is removed — user A's tenant id or security context leaking into user B's request is a real security incident. Values also pin memory (and class loaders in application servers) for the life of the thread. With millions of virtual threads, per-thread copies become expensive. Mitigations and alternatives: always `set` in a `try` and `remove()` in `finally` (filters and interceptors are the usual place); pass context explicitly as parameters; use framework context propagation (Spring's `TaskDecorator`, Micrometer Context Propagation) for async hops; and on JDK 25 use **`ScopedValue`**, which binds an immutable value for the duration of a call and is inherited by structured child tasks.",
          follow: ["Why doesn't an `InheritableThreadLocal` help with thread pools?"],
          flags: ["Setting a `ThreadLocal` in a filter without removing it in `finally`"] },
        { level: 2, q: "Two dependencies bring different versions of the same library. Which version does Maven pick, and how do you control it?",
          a: "Maven's **dependency mediation** picks the version **nearest** to your project in the dependency tree; at equal depth, the one **declared first** wins. It does not pick the newest. So if A depends on C 1.0 directly and B depends on D, which depends on C 2.0, you get C 1.0 — and B may fail at run time with `NoSuchMethodError` if it needs 2.0. Diagnose with `mvn dependency:tree -Dverbose` (it shows omitted conflicts), control versions with `<dependencyManagement>` or an imported BOM (Spring Boot's parent does this for hundreds of libraries), use `<exclusions>` sparingly, and add the enforcer plugin's `dependencyConvergence` rule so conflicts fail the build instead of surfacing in production.",
          follow: ["What is the difference between `<dependencyManagement>` and `<dependencies>`?", "Why is `NoSuchMethodError` a run-time error and not a compile error here?"] },
        { level: 3, q: "A batch job uses a parallel stream that calls a REST API for each of 50,000 records, and the whole application slows down. Diagnose and redesign it.",
          a: "Parallel streams run on the JVM-wide **common ForkJoinPool** (cores − 1 threads). Blocking HTTP calls occupy all of them, so every other parallel stream and default-async `CompletableFuture` in the process stalls — and throughput is capped at a handful of concurrent calls anyway. Redesign: run the calls on **virtual threads** (or a dedicated, bounded executor), limit concurrency with a `Semaphore` to what the API and its rate limit allow, add timeouts and retries with backoff for transient failures, process in chunks with checkpoints so a failure does not restart 50,000 records, and make each record's processing idempotent. If the API offers batch endpoints, use them — 500 requests of 100 records beat 50,000 single calls.",
          follow: ["How would you respect a partner's limit of 100 requests per second?"] }
      ],
      notes: [
        "Both programs on this slide are verified: the ordered transfers never deadlock and conserve the total, and the `CompletableFuture` pipeline shows combining, composing and the exception path.",
        "For the virtual-threads question, interviewers in 2026 expect you to know pinning, semaphores instead of pools, and that connection pools become the bottleneck — that is the difference between having read a blog post and having run it.",
        "The Maven question looks like trivia, but `NoSuchMethodError` caused by dependency mediation is one of the most common production failures after an upgrade."
      ]
    }
  ],

  quiz: [
    { level: 3, q: "What does this program print?", code: { src: code`
        import java.util.concurrent.*;

        public class Main {
            public static void main(String[] args) {
                ThreadPoolExecutor pool = new ThreadPoolExecutor(2, 4, 1, TimeUnit.SECONDS, new ArrayBlockingQueue<>(2));
                CountDownLatch gate = new CountDownLatch(1);
                int rejected = 0;
                for (int i = 0; i < 7; i++) {
                    try { pool.execute(() -> { try { gate.await(); } catch (InterruptedException e) { } }); }
                    catch (RejectedExecutionException e) { rejected++; }
                }
                System.out.println("threads=" + pool.getPoolSize() + " queued=" + pool.getQueue().size() + " rejected=" + rejected);
                gate.countDown();
                pool.shutdown();
            }
        }`, out: 'threads=4 queued=2 rejected=1' },
      options: ['`threads=2 queued=5 rejected=0`', '`threads=4 queued=2 rejected=1`', '`threads=4 queued=3 rejected=0`', '`threads=2 queued=2 rejected=3`'], answer: 1,
      why: "Tasks 1–2 start core threads, 3–4 fill the queue, 5–6 start extra threads up to the maximum of 4, and task 7 finds the queue full and the pool at maximum, so it is rejected." },
    { level: 2, q: "Four threads each run `count++` 1,000 times on a `volatile int count`. What is the final value?",
      options: ['Always 4000', 'At most 4000 and often less, because `++` is not atomic', 'Always less than 4000', 'It throws a `ConcurrentModificationException`'], answer: 1,
      why: "`volatile` makes each read and write visible, but `++` is a read, an add and a write; two threads can read the same value and one update is lost. Use `AtomicInteger` or `LongAdder`." },
    { level: 2, q: "What does this program print?", code: { src: code`
        public class Main {
            public static void main(String[] args) throws Exception {
                Thread t = new Thread(() -> System.out.print(Thread.currentThread().getName() + " "), "worker");
                t.run();
                t.start();
                t.join();
                System.out.println();
            }
        }`, out: 'main worker' },
      options: ['`worker worker`', '`main worker`', '`main main`', '`worker main`'], answer: 1,
      why: "`run()` is an ordinary method call executed by the calling thread (`main`). Only `start()` creates a new thread, which runs the same `Runnable` as `worker`." },
    { level: 3, q: "Your project depends on A (which needs C 1.0) and on B (which needs D, which needs C 2.0). Which version of C is on the classpath, and what is the risk?",
      options: ['C 1.0 — the nearest declaration wins, so B\'s code may fail at run time with `NoSuchMethodError` if it uses 2.0 APIs', 'C 2.0 — Maven always picks the newest version', 'Both — Maven isolates versions per dependency', 'The build fails with a version-conflict error'], answer: 0,
      why: "Maven mediates by *nearest wins* (then first declaration), not by newest. Pin the version with `dependencyManagement` and enforce convergence to catch this at build time." },
    { level: 3, q: "On JDK 21, a virtual thread makes a blocking JDBC call inside a `synchronized` block. What happens?",
      options: ['It pins its carrier: the carrier platform thread is blocked for the whole call, reducing how many virtual threads can run', 'The JVM throws `IllegalMonitorStateException`', 'The virtual thread unmounts normally', 'The JDBC driver switches to non-blocking I/O automatically'], answer: 0,
      why: "On JDK 21–23, blocking while holding a monitor pins the virtual thread to its carrier. JDK 24 (JEP 491) lifted this for `synchronized`; native calls still pin." }
  ]
});
