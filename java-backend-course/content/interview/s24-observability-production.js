/* Interview pack — Session 24: Observability, performance & production */
COURSE.prep(24, {
  deepDives: [
    {
      title: 'Deep dive: performance engineering & SRE — percentiles, queues, SLOs and profiling',
      lead: 'Senior interviews test whether you can reason about latency quantitatively: why averages lie, why systems collapse near full utilisation, and how to alert on what users feel.',
      points: [
        "**Percentiles, not averages**: a mean of 80 ms can hide a p99 of 2 s. Track p50, p95, p99 and p99.9 per endpoint, and never average percentiles across instances — merge histograms instead.",
        "**Tail amplification**: if a request fans out to N services, the chance that at least one is slower than its p99 is 1 − 0.99ᴺ — about 63% for N = 100. Fan-out turns rare tails into common latency (hedged requests, timeouts and fewer hops help).",
        "**Little's law**: in-flight requests = throughput × latency. Use it to size thread pools, connection pools and concurrency limits, and to predict when they saturate.",
        "**Queueing**: latency explodes as utilisation approaches 100% — in the simple M/M/1 model, average time in the system is service time ÷ (1 − utilisation). Keep critical resources well below saturation and shed load early.",
        "**USE** (utilisation, saturation, errors) for resources and **RED** (rate, errors, duration) for services organise what to measure. **SLOs** with error budgets turn reliability into a number the team can spend; alert on fast and slow **burn rates**, not on every blip.",
        "**Measure before optimising**: profile with JFR or async-profiler (flame graphs), read GC logs, check database plans — and load-test at a **constant arrival rate** to avoid *coordinated omission*, where a stalled client stops sending and hides the very latency you wanted to see."
      ],
      code: { lang: 'java', file: 'TailMath.java', src: code`
        public class TailMath {
            public static void main(String[] args) {
                for (int n : new int[] {1, 10, 100}) {
                    System.out.printf("fan-out %3d: P(at least one call slower than its p99) = %.1f%%%n", n, 100 * (1 - Math.pow(0.99, n)));
                }
                double rps = 400, latencySec = 0.150;
                System.out.printf("Little's law: %.0f req/s x %.3f s = %.0f requests in flight%n", rps, latencySec, rps * latencySec);
                double serviceMs = 10;                         // M/M/1: average time in system = service / (1 - utilisation)
                for (double u : new double[] {0.5, 0.8, 0.9, 0.95, 0.99}) {
                    System.out.printf("utilization %2.0f%% -> average latency %6.1f ms%n", u * 100, serviceMs / (1 - u));
                }
            }
        }`, out: code`
        fan-out   1: P(at least one call slower than its p99) = 1.0%
        fan-out  10: P(at least one call slower than its p99) = 9.6%
        fan-out 100: P(at least one call slower than its p99) = 63.4%
        Little's law: 400 req/s x 0.150 s = 60 requests in flight
        utilization 50% -> average latency   20.0 ms
        utilization 80% -> average latency   50.0 ms
        utilization 90% -> average latency  100.0 ms
        utilization 95% -> average latency  200.0 ms
        utilization 99% -> average latency 1000.0 ms` },
      callout: { kind: 'interview', text: "Three numbers win latency discussions: the fan-out tail formula (63% at 100 calls), Little's law for sizing, and the utilisation curve (latency doubles from 90% to 95% busy). Quote them, then explain what you would measure to confirm." },
      notes: [
        "The M/M/1 model assumes random arrivals and service times; real systems differ, but the shape — a hockey stick near full utilisation — holds generally. That is why autoscaling targets of 50–70% CPU are common and why connection pools need headroom.",
        "Coordinated omission is subtle: a load generator that waits for each response before sending the next request slows down exactly when the server stalls, so the stall barely appears in its statistics. Tools such as wrk2 or k6 with constant-arrival-rate executors keep sending on schedule.",
        "An error budget makes trade-offs explicit: with a 99.9% monthly availability SLO you may fail about 43 minutes a month; burning it fast pauses risky releases, while an unspent budget is permission to move faster."
      ]
    }
  ],

  stretch: [
    "Load-test the booking API with k6 at a constant arrival rate, report p50, p99 and p99.9, and compare with a closed-loop test that suffers from coordinated omission.",
    "Define SLOs for search and booking and write Prometheus multi-window burn-rate alerts (for example 1 h / 5 min and 6 h / 30 min) for them.",
    "Record a JFR profile during the load test, find the hottest method in the flame graph, optimise it, and show the before/after percentiles."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: running median and p99 from a stream',
      lead: 'LeetCode 295 — two heaps for the exact median — then the production version: fixed-memory, mergeable percentile histograms.',
      difficulty: 'Hard', minutes: 40, lc: 295, pattern: ['heap', 'design'],
      problem: [
        "Implement `add(int x)` and `median()` for a stream of numbers: after every addition, the median of everything seen so far must be available in O(1), with O(log n) per addition.",
        "Then: a service handles millions of requests per minute across many instances. Design a way to report **p99 and p99.9 latency** with fixed memory per instance and the ability to combine instances."
      ],
      examples: [
        { in: 'add(1), add(2), median(), add(3), median()', out: '1.5, 2.0' },
        { in: '200,000 latencies (median ~55 ms, 1% slow outliers)', out: 'histogram p99 within 2% of the exact value using 1,200 buckets' }
      ],
      constraints: ["`-10⁵ ≤ x ≤ 10⁵`", "Up to `5 × 10⁴` calls (exact median)", "Follow-up: unbounded streams, many instances"],
      hints: [
        "Sorting after every insert is O(n log n) per call. What if you only maintained the *middle*?",
        "Keep the smaller half in a max-heap and the larger half in a min-heap, balanced so their sizes differ by at most one. The median is a top (or the average of both tops).",
        "For percentiles at scale you cannot keep every value: bucket values into ranges whose width grows with the value (log-linear buckets) — fixed memory, bounded relative error, and buckets from many instances simply add up."
      ],
      approaches: [
        { name: 'Sort on demand', idea: 'Store all values; sort when asked', time: 'O(n log n) per query', space: 'O(n)' },
        { name: 'Two heaps', idea: 'Max-heap of the lower half, min-heap of the upper half, rebalanced after each insert', time: 'O(log n) add, O(1) median', space: 'O(n)' },
        { name: 'Order-statistic tree', idea: 'Balanced tree with subtree sizes — any percentile in O(log n)', time: 'O(log n)', space: 'O(n)' },
        { name: 'Log-linear histogram (HDR-style)', idea: 'Count values per bucket of bounded relative width; percentiles from cumulative counts', time: 'O(1) add, O(buckets) query', space: 'O(buckets), mergeable' }
      ],
      code: { lang: 'java', file: 'StreamingPercentiles.java', src: code`
        import java.util.*;

        public class StreamingPercentiles {
            /** LeetCode 295: running median with two heaps. */
            static final class MedianFinder {
                private final PriorityQueue<Integer> low = new PriorityQueue<>(Comparator.reverseOrder());  // smaller half (max-heap)
                private final PriorityQueue<Integer> high = new PriorityQueue<>();                          // larger half (min-heap)

                void add(int x) {
                    low.add(x);
                    high.add(low.poll());                                   // the largest of the small half moves up
                    if (high.size() > low.size()) low.add(high.poll());     // keep |low| = |high| or |high| + 1
                }

                double median() {
                    return low.size() > high.size() ? low.peek() : ((long) low.peek() + high.peek()) / 2.0;
                }
            }

            /** Fixed-memory percentiles: buckets 2% wider than the previous one (log-linear, as in HDR histograms). */
            static final class LatencyHistogram {
                private static final double GROWTH = 1.02;
                private final long[] counts = new long[1200];               // covers up to 1.02^1200 ms
                private long total;

                void record(double ms) {
                    int b = ms <= 1 ? 0 : (int) Math.ceil(StrictMath.log(ms) / StrictMath.log(GROWTH));
                    counts[Math.min(b, counts.length - 1)]++;
                    total++;
                }

                /** Upper edge of the bucket that holds the p-th percentile: at most 2% above the true value. */
                double percentile(double p) {
                    long rank = (long) Math.ceil(p / 100.0 * total), seen = 0;
                    for (int b = 0; b < counts.length; b++) {
                        seen += counts[b];
                        if (seen >= rank) return StrictMath.pow(GROWTH, b);
                    }
                    return Double.NaN;
                }

                void merge(LatencyHistogram other) {                       // histograms from many instances add up
                    for (int b = 0; b < counts.length; b++) counts[b] += other.counts[b];
                    total += other.total;
                }
            }

            public static void main(String[] args) {
                MedianFinder mf = new MedianFinder();
                mf.add(1); mf.add(2);
                double first = mf.median();
                mf.add(3);
                System.out.println("LeetCode example: " + first + " " + mf.median());

                Random rnd = new Random(295);
                for (int t = 0; t < 500; t++) {                             // differential test vs sorting
                    MedianFinder m = new MedianFinder();
                    List<Integer> seen = new ArrayList<>();
                    for (int i = 0; i < 1 + rnd.nextInt(40); i++) {
                        int x = rnd.nextInt(201) - 100;
                        m.add(x);
                        seen.add(x);
                        List<Integer> s = new ArrayList<>(seen);
                        Collections.sort(s);
                        int n = s.size();
                        double exact = n % 2 == 1 ? s.get(n / 2) : (s.get(n / 2 - 1) + s.get(n / 2)) / 2.0;
                        if (exact != m.median()) throw new AssertionError("median mismatch");
                    }
                }
                System.out.println("500 random streams: two-heap median == sorted median");

                LatencyHistogram instanceA = new LatencyHistogram(), instanceB = new LatencyHistogram();
                double[] all = new double[200_000];
                for (int i = 0; i < all.length; i++) {
                    double ms = StrictMath.exp(4 + 0.6 * rnd.nextGaussian());       // typical requests, median ~55 ms
                    if (rnd.nextInt(100) == 0) ms *= 20;                            // 1% slow outliers
                    all[i] = ms;
                    (i % 2 == 0 ? instanceA : instanceB).record(ms);
                }
                instanceA.merge(instanceB);
                Arrays.sort(all);
                boolean within = true;
                for (double p : new double[] {50, 99, 99.9}) {
                    double exact = all[(int) Math.ceil(p / 100.0 * all.length) - 1], est = instanceA.percentile(p);
                    within &= est >= exact && est <= exact * 1.02;
                    System.out.printf("p%-4s exact %8.1f ms   histogram %8.1f ms%n", p == 99.9 ? "99.9" : String.valueOf((int) p), exact, est);
                }
                System.out.println("estimates within 2% above exact: " + within + " (1200 buckets instead of 200000 samples)");
            }
        }`, out: code`
        LeetCode example: 1.5 2.0
        500 random streams: two-heap median == sorted median
        p50   exact     55.0 ms   histogram     55.7 ms
        p99   exact    383.8 ms   histogram    387.8 ms
        p99.9 exact   2325.5 ms   histogram   2351.1 ms
        estimates within 2% above exact: true (1200 buckets instead of 200000 samples)` },
      pitfalls: [
        "Letting the heaps drift out of balance, or rebalancing in the wrong direction, so the median comes from the wrong top.",
        "Integer overflow when averaging the two tops — widen to `long` first.",
        "Averaging percentiles from several instances: the mean of per-instance p99s is not the p99 of the fleet. Merge histograms (or sketches) instead.",
        "Keeping raw samples for percentiles in a high-traffic service — memory grows without bound."
      ],
      followUps: [
        { q: "Median over a sliding window of the last k values (LeetCode 480).",
          a: "Two heaps plus **lazy deletion**: when a value leaves the window, record it in a *to delete* map and remove it only when it reaches a heap top, adjusting the balance counts as if it were already gone. O(log k) per step. An order-statistic tree (or two `TreeMap`s with counts) is an alternative with true deletions." },
        { q: "Why can't you average p99s across instances, and what do monitoring systems do instead?",
          a: "Percentiles do not compose: one instance with a terrible tail and nine healthy ones average to a misleadingly low number, and instances handle different volumes. Systems export **histograms** — Prometheus histogram buckets, HDR histograms, or mergeable sketches such as t-digest or DDSketch — which add up exactly (or with bounded error) across instances and time windows; the percentile is computed after merging." },
        { q: "What accuracy do the buckets give, and how do you choose them?",
          a: "With buckets whose width grows by a factor of (1 + ε), any reported value is within a relative error of ε of the truth — here 2% with 1,200 buckets covering from 1 ms to beyond a day. Choose ε by how precisely the SLO must be checked (latency SLOs rarely need better than 1–2%) and the range by the smallest and largest values that matter. Fixed-boundary buckets (Prometheus defaults) are simpler but need boundaries placed around your SLO thresholds." }
      ],
      rubric: [
        "Implements the two-heap median with correct balancing and overflow-safe averaging.",
        "States the complexities and why the approach beats re-sorting.",
        "Explains why percentiles must come from mergeable histograms or sketches at scale.",
        "Quantifies the accuracy and memory trade-off of the bucket scheme."
      ],
      notes: [
        "The histogram here records each value into a bucket whose upper edge is a power of 1.02, so the reported percentile is never below the true value and never more than 2% above it — verified against exact sorting on 200,000 values split across two simulated instances and merged.",
        "Micrometer can publish percentile histograms (`management.metrics.distribution.percentiles-histogram`), letting Prometheus compute fleet-wide percentiles with `histogram_quantile` — the same mergeability argument in production form.",
        "In an interview, mention that the median is a special case: the heaps generalise to any fixed percentile by changing the target size ratio between them."
      ]
    },
    {
      type: 'design',
      title: 'Design round: metrics monitoring & alerting platform',
      lead: 'Designing the system that watches every other system: ingestion at high volume, time-series storage, queries, alerting — and staying up when everything else is on fire.',
      kind: 'HLD', difficulty: 'Hard', minutes: 50,
      prompt: "Design a metrics monitoring and alerting platform (think Prometheus at company scale or a hosted metrics service): thousands of services emit metrics; engineers query dashboards over the last hours to the last year; alerts must fire within a minute of an SLO breach. Expect around 50 million active time series and 5 million samples per second.",
      stages: [
        { t: 'Requirements and estimates', ask: 'How much data is this, and what must never fail?', table: { head: ['Quantity', 'Estimate'], rows: [
          ['Active series', '50 M (metric name × label combinations)'],
          ['Ingestion', '5 M samples/s (each series every ~10 s)'],
          ['Raw storage', '~1.5 bytes/sample after compression → ~650 GB/day'],
          ['Retention', 'Raw 15 days; downsampled (1 min, 1 h) for a year'],
          ['Alert latency', 'Evaluated every 15–60 s; notification within a minute']
        ] }, points: [
          "The alerting path must be more reliable than the systems it monitors — and keep working when they are down.",
          "Queries: recent data for dashboards and alerts (hot), long ranges for capacity planning (downsampled)."
        ] },
        { t: 'Ingestion: pull or push?', ask: 'Do services push metrics, or does the platform scrape them?', points: [
          "**Pull** (Prometheus-style scraping): the platform controls rate and knows when a target is down (failed scrape = signal); needs service discovery and network reachability.",
          "**Push** (OTLP, StatsD, remote-write): works through firewalls and for short-lived jobs; needs back-pressure and authentication, and *absence* of data is ambiguous.",
          "Common hybrid: local agents scrape services and **remote-write** to a central, horizontally scaled ingestion tier, sharded by series hash, with replication for durability."
        ], diagram: { kind: 'tiers', tiers: [
          { label: 'Sources', nodes: [{ t: 'Services', s: '/actuator/prometheus, OTLP', tone: 'gray' }, { t: 'Agents', s: 'scrape + remote-write', tone: 'blue' }] },
          { label: 'Ingestion', via: 'sharded by series hash', nodes: [{ t: 'Distributors', s: 'validate, rate-limit, replicate ×3', tone: 'orange' }, { t: 'Ingesters', s: 'in-memory chunks, WAL', tone: 'green' }] },
          { label: 'Storage', via: 'flush compressed blocks', nodes: [{ t: 'Object storage', s: 'immutable blocks + index', tone: 'purple' }, { t: 'Compactor', s: 'merge, downsample, retention', tone: 'gray' }] },
          { label: 'Read & alert', via: 'query fan-out', nodes: [{ t: 'Query engine', s: 'PromQL, caching', tone: 'yellow' }, { t: 'Rule evaluator', s: 'recording + alert rules', tone: 'red' }, { t: 'Alert manager', s: 'dedupe, group, route', tone: 'red' }] }
        ] } },
        { t: 'Time-series storage', ask: 'How do you store 5 million samples a second cheaply?', points: [
          "Series are identified by metric name plus labels; an inverted index maps label values to series ids for fast selection.",
          "Samples are appended to per-series in-memory **chunks** (with a write-ahead log for crash recovery) and flushed as immutable compressed blocks, typically every two hours.",
          "**Compression** in the style of Facebook's Gorilla paper: delta-of-delta encoding for timestamps (regular intervals compress to almost nothing) and XOR encoding for values — around 1–2 bytes per sample.",
          "A compactor merges blocks, downsamples old data and enforces retention; object storage keeps long-term data cheap."
        ] },
        { t: 'Cardinality and multi-tenancy', ask: 'A team adds `user_id` as a label. What happens?', points: [
          "Every unique label combination is a new series: a `user_id` label on a request counter multiplies series by the number of users — memory and index blow up for **everyone**.",
          "Enforce per-tenant limits on active series and ingestion rate at the distributors, reject or drop offending metrics, and show teams their top cardinality contributors.",
          "High-cardinality detail belongs in logs and traces (with exemplars linking a metric bucket to a trace id), not in metric labels."
        ] },
        { t: 'Querying and alerting', ask: 'How do dashboards stay fast, and how do alerts stay trustworthy?', points: [
          "Queries fan out to the ingesters (recent data) and object storage (older blocks), merge the results, and use caching; **recording rules** precompute expensive expressions such as per-service p99.",
          "Alert rules are evaluated on a schedule by a dedicated, isolated component; alerts go to an alert manager that deduplicates, groups, silences and routes them to on-call.",
          "Alert on **symptoms** (SLO burn rates, error ratios) rather than causes (CPU), use multi-window burn-rate rules to balance speed and noise, and monitor the monitoring: a dead-man's-switch alert that must fire continuously, and a meta-monitor outside the platform."
        ] }
      ],
      followUps: [
        { q: "Pull or push — which would you choose here, and why?",
          a: "Pull for long-running services inside the network: the platform controls scrape load, a failed scrape is itself a health signal, and targets need no knowledge of the backend. Push (remote-write or OTLP) for short-lived jobs, edge devices or across network boundaries. At company scale, agents scrape locally and push to the central ingestion tier — getting the advantages of both." },
        { q: "How do you keep alerting working when the platform itself is degraded?",
          a: "Run rule evaluation and the alert manager separately from the query path, with their own capacity and highly available replicas; evaluate critical alerts on recent data held in memory by the ingesters; use a dead-man's-switch alert (always firing) monitored by an external service, so silence itself pages someone; and keep a minimal out-of-band monitor for the platform's own SLOs." },
        { q: "How would you add tracing and logs to this picture without tripling the cost?",
          a: "Sample traces intelligently — keep all errors and slow requests, a small percentage of the rest (tail-based sampling in a collector) — and link metrics to traces with exemplars. Keep logs structured, index only a few fields, store the rest cheaply with short retention for debug-level data. The three signals answer different questions: metrics say *something is wrong*, traces say *where*, logs say *why*." }
      ],
      rubric: [
        "Sizes ingestion, storage and retention from the numbers.",
        "Discusses pull versus push and designs a sharded, replicated ingestion path.",
        "Explains time-series storage: chunks, WAL, compression, blocks, compaction and downsampling.",
        "Identifies cardinality as the main scaling risk and enforces limits.",
        "Designs reliable alerting: recording rules, symptom-based burn-rate alerts, monitoring of the monitor."
      ],
      notes: [
        "The architecture resembles horizontally scalable Prometheus-compatible systems (Cortex, Thanos, Mimir, VictoriaMetrics): distributors, ingesters, object storage and queriers. Naming one is fine; explaining the parts is what scores.",
        "Cardinality is the question interviewers most often push on, because it is the most common real-world failure of metrics systems.",
        "This round closes the course loop: the services you built in Sessions 12–23 emit metrics through Actuator and Micrometer, and this platform is where those metrics go."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: observability, performance & production',
      lead: 'Production questions separate people who build features from people who run systems. Expect numbers, tools and incident stories.',
      qa: [
        { level: 1, q: "Metrics, logs and traces — what is each good for?",
          a: "**Metrics** are cheap, aggregated numbers over time (request rate, error ratio, latency histograms, queue lag): ideal for dashboards, SLOs and alerting — *something is wrong*. **Traces** follow one request across services as a tree of spans with timings: they show *where* time is spent or where an error originated. **Logs** are detailed, timestamped events with context: they explain *why* — the exception, the input, the decision. They work best linked: a trace id in every log line, and exemplars that connect a slow latency bucket to a concrete trace. Each has a cost profile — metrics are cheap but low-detail, logs are detailed but expensive at volume, traces are usually sampled.",
          follow: ["Which would you look at first during an incident, and why?"] },
        { level: 2, q: "Why is p99 more important than average latency? Explain tail amplification.",
          a: "The average hides the experience of a meaningful number of users: with a million requests a day, a p99 of 2 s means 10,000 slow requests even if the mean is 80 ms — and heavy users, who make many requests, almost certainly hit it. Tails also amplify: a page that calls 100 services, each with a 1% chance of being slower than its p99, has a 1 − 0.99¹⁰⁰ ≈ 63% chance of being slow overall. So track high percentiles per endpoint and dependency, budget latency along the critical path, and reduce fan-out or use techniques such as timeouts, hedged requests and caching for the slowest dependencies.",
          follow: ["What is a hedged request, and what does it cost?"] },
        { level: 2, q: "How do you use Little's law in practice?",
          a: "Little's law says the average number of items in a stable system equals the arrival rate times the average time spent: L = λ × W. Practical uses: **sizing** — a service doing 400 requests per second at 150 ms needs about 60 requests in flight, so a pool or concurrency limit of 60 plus headroom; **predicting saturation** — with 200 Tomcat threads and 1 s latency the service caps at 200 requests per second, however idle the CPU; **diagnosis** — if in-flight requests grow while throughput stays flat, latency must be growing, which points to a downstream bottleneck. It applies to thread pools, connection pools, queues and Kafka consumers alike.",
          follow: ["Why does a connection pool of 10 limit throughput when queries take 50 ms?"] },
        { level: 2, q: "CPU usage is high and latency is rising. How do you find the cause?",
          a: [
            "1. **Scope**: one instance or all? since a deploy? correlated with traffic? Dashboards per instance and per endpoint answer this.",
            "2. **Is it the JVM or the app?** GC logs or JFR show whether garbage collection is eating CPU (allocation pressure, a heap too small) versus application code.",
            "3. **Profile**: async-profiler or JFR CPU sampling produces a flame graph showing the hot methods — often JSON serialisation, regular expressions, logging, inefficient loops or lock spinning.",
            "4. **Threads**: `jcmd <pid> Thread.print` (repeated a few times) reveals busy or spinning threads.",
            "5. **Fix and verify** with before/after percentiles under the same load; roll back first if a recent deploy is the cause."
          ],
          follow: ["How do you profile a production JVM safely?"] },
        { level: 2, q: "Memory grows until the service crashes once a day. How do you investigate?",
          a: "First decide whether it is the **heap** (old generation keeps growing after full GCs; eventually `OutOfMemoryError`) or **native** memory (container RSS grows while the heap looks fine; eventually an OOM kill with exit code 137). For the heap: enable `-XX:+HeapDumpOnOutOfMemoryError`, or take dumps a few hours apart with `jcmd <pid> GC.heap_dump`, and compare them in a heap analyser — the dominator tree and paths to GC roots show what retains memory (an unbounded cache or map, listeners never removed, `ThreadLocal`s in pools). For native memory: Native Memory Tracking (`-XX:NativeMemoryTracking=summary` and `jcmd VM.native_memory`) shows thread stacks, metaspace, direct buffers or code cache growth. Fix the retention, add bounds, and add a memory-trend alert.",
          follow: ["What does a steadily rising old generation after each full GC indicate?"] },
        { level: 2, q: "Define SLI, SLO and SLA, and explain error budgets and burn-rate alerts.",
          a: "An **SLI** is a measured indicator of user experience — the ratio of successful requests, or of requests faster than 300 ms. An **SLO** is the internal target for it — 99.9% of requests succeed over 30 days. An **SLA** is an external contract with consequences (credits) and is set looser than the SLO. The **error budget** is the allowed failure — 0.1% of requests, roughly 43 minutes of full outage per month. **Burn rate** measures how fast the budget is being consumed; multi-window alerts page on fast burn (for example 14.4× over 1 hour confirmed over 5 minutes, which would exhaust a 30-day budget in about two days) and open tickets on slow burn. This alerts on what users feel and cuts noise compared with alerting on every CPU spike.",
          follow: ["What should a team do when the error budget is exhausted?"] },
        { level: 2, q: "What is metric cardinality, and why can one label take down a monitoring system?",
          a: "Each unique combination of metric name and label values is a separate time series that must be indexed and kept in memory. Labels with bounded, small value sets (`method`, `status`, `endpoint` template) are fine; unbounded ones (`user_id`, `order_id`, raw URLs with ids, exception messages) create a new series per value — millions of series from one counter, exhausting memory and slowing queries for every team on the platform. Keep metric labels bounded, use route templates (`/bookings/{id}`) rather than raw paths, enforce per-team series limits, and put high-cardinality detail in logs and traces, linked through exemplars.",
          follow: ["How would you find which metric is causing a cardinality explosion?"] },
        { level: 3, q: "What is coordinated omission in load testing, and how do you avoid it?",
          a: "Many load generators work in a closed loop: each virtual user sends a request, waits for the response, then sends the next. When the server stalls for two seconds, the generator *also* stops sending during that time, so instead of recording hundreds of requests that each waited up to two seconds, it records one slow request — the stall nearly disappears from the percentiles, exactly the tail you wanted to measure. Avoid it with an **open model**: a constant arrival rate independent of responses (wrk2, k6's constant-arrival-rate executor, Gatling's open injection), recording latency from the intended send time, and by comparing results with production histograms.",
          follow: ["Why does a closed-loop test still make sense for some systems?"] },
        { level: 3, q: "Walk me through how you would lead the response to a production incident.",
          a: [
            "**Declare and organise**: open an incident channel, assign an incident commander, a communications lead and investigators — one person decides, the others feed information.",
            "**Mitigate first, diagnose later**: roll back the last deploy, disable the feature flag, shed load, scale out or fail over — restore service before searching for the root cause.",
            "**Communicate** status at a regular cadence to stakeholders and customers (status page), with what is known, what is being done and the next update time.",
            "**Verify recovery** with the SLIs, not with *it seems fine*.",
            "**Blameless postmortem**: timeline, impact, contributing factors, what went well, and action items with owners and dates — focused on systems and mechanisms (tests, alerts, guard-rails), not on individuals."
          ],
          follow: ["What makes a postmortem action item good?"] },
        { level: 3, q: "Design a highly available deployment on AWS for the booking platform. What fails, and what keeps it up?",
          a: "Run every tier in at least **three availability zones**: an Application Load Balancer across the zones, container tasks or pods spread across them (ECS or EKS) with health checks and autoscaling, **RDS for MySQL in a Multi-AZ** configuration (synchronous standby, automatic failover in roughly a minute or two) plus read replicas for read scaling, ElastiCache for Redis with replicas and automatic failover, and a managed Kafka (MSK) cluster with replication factor 3 across zones. Keep services stateless, store files in S3, and manage configuration and secrets centrally. Plan for failures explicitly: a zone loss (capacity headroom of N+1 zones), a database failover (connection retry, short DNS TTLs), a dependency outage (timeouts, circuit breakers), and regional disaster (backups and infrastructure as code for recovery, or active-passive in a second region if the business needs it — with documented recovery time and recovery point objectives).",
          follow: ["What are RTO and RPO, and how do they change the design?"] }
      ],
      notes: [
        "For production questions, structure answers as *detect → mitigate → diagnose → prevent*. Interviewers look for mitigation before root-cause hunting.",
        "Bring numbers: percentiles, Little's law, error-budget minutes, failover times. They show operational experience.",
        "If you have run the course's Airbnb project with Actuator, Prometheus and tracing, use it as your incident story — describe a concrete slowdown you found and how you proved the fix."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "A request fans out to 100 backend calls, each with a 1% chance of being slower than its p99. Roughly how often is at least one call slow?",
      options: ['About 1%', 'About 10%', 'About 63%', 'About 99%'], answer: 2,
      why: "1 − 0.99¹⁰⁰ ≈ 0.634. Fan-out turns per-call tails into common request-level latency — the core of *the tail at scale*." },
    { level: 2, q: "A service handles 400 requests per second with an average latency of 150 ms. About how many requests are in flight at any moment?",
      options: ['About 60', 'About 2.7', 'About 400', 'About 2,700'], answer: 0,
      why: "Little's law: L = λ × W = 400 × 0.15 = 60. Size pools and concurrency limits from this, plus headroom." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                PriorityQueue<Integer> low = new PriorityQueue<>(Comparator.reverseOrder()), high = new PriorityQueue<>();
                List<String> medians = new ArrayList<>();
                for (int x : new int[] {5, 15, 1, 3}) {
                    low.add(x);
                    high.add(low.poll());
                    if (high.size() > low.size()) low.add(high.poll());
                    medians.add(low.size() > high.size() ? String.valueOf(low.peek()) : String.valueOf((low.peek() + high.peek()) / 2.0));
                }
                System.out.println(medians);
            }
        }`, out: '[5, 10.0, 5, 4.0]' },
      options: ['`[5, 10.0, 5, 4.0]`', '`[5, 10.0, 1, 3.0]`', '`[5, 15, 5, 4.0]`', '`[5, 10.0, 5, 5.0]`'], answer: 0,
      why: "After 5: median 5. After 15: (5 + 15) / 2 = 10.0. After 1: the middle of {1, 5, 15} is 5. After 3: the middle two of {1, 3, 5, 15} average to 4.0." },
    { level: 3, q: "Each of 20 instances reports its own p99 latency. How do you get the fleet-wide p99?",
      options: ['Merge their latency histograms (or mergeable sketches) and compute the percentile from the combined distribution', 'Average the 20 p99 values', 'Take the maximum of the 20 p99 values', 'Take the median of the 20 p99 values'], answer: 0,
      why: "Percentiles do not compose arithmetically — instances differ in traffic and shape. Histograms add up exactly, which is why Prometheus computes `histogram_quantile` over summed buckets." },
    { level: 3, q: "A closed-loop load test (each virtual user waits for a response before sending the next request) reports a great p99, but production p99 is far worse. What is the most likely flaw in the test?",
      options: ['Coordinated omission — during stalls the generator stops sending, so the slow period is barely recorded', 'Too many virtual users', 'The test ran over HTTPS', 'The test used a staging database'], answer: 0,
      why: "When the server stalls, a closed-loop generator stalls too and under-records latency. Use a constant arrival rate and measure from the intended send time." }
  ]
});
