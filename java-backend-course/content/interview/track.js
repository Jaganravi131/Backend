/* FAANG-level interview track — hub content shown at #/interview.
 * The per-session packs (content/interview/sNN-*.js) add deep dives, coding and
 * design rounds, interview Q&A and harder quiz questions to each session via
 * COURSE.prep(no, {...}). This file holds what is shared across sessions: the
 * interview loop, how to run each round, level expectations, a study plan, the
 * DSA pattern catalogue, mock-interview formats and behavioral preparation.   */
(function (C) {
  'use strict';

  C.track = {
    intro: "Tier-1 product companies hire backend engineers through a loop of coding, design and deep-dive interviews. This track layers that loop on top of the 24 sessions: every session adds **deep-dive lessons**, a **timed coding round** (LeetCode Medium/Hard style) whose Java reference solution is compiled and run by the course test suite, **8–10 interview questions** with model answers, follow-ups and red flags, and **harder quiz questions** — each graded SDE-1, SDE-2 or Senior. Use the tabs to track progress, drill patterns and run timed mock interviews.",

    loopIntro: "Formats vary by company and level, but almost every loop is built from the rounds below. Click **Practise** to jump to the matching material.",
    loop: [
      { icon: '\u{1F9EE}', name: 'Online assessment', time: '60–90 min', tab: 'coding', what: [
        "2–3 algorithmic problems on an online judge with hidden test cases.",
        "Large inputs are part of the hidden tests, so an `O(n²)` solution often times out where `O(n log n)` passes.",
        "Some backend assessments add SQL, debugging or CS-fundamentals questions."
      ] },
      { icon: '\u{1F4DE}', name: 'Technical phone screen', time: '45–60 min', tab: 'mock', what: [
        "One or two Medium problems in a shared editor — no IDE, no autocomplete, no running the code.",
        "You are expected to clarify, explain the approach, write code that would compile, test it by hand and state the complexity."
      ] },
      { icon: '\u2328\uFE0F', name: 'Coding rounds (usually two)', time: '45 min each', tab: 'coding', what: [
        "Medium–Hard problems, then follow-ups that change the constraints: stream the input, make it thread-safe, scale it past one machine.",
        "Scored on problem solving, coding fluency, verification and communication — not only on reaching the optimal answer."
      ] },
      { icon: '\u{1F9F1}', name: 'Low-level design / machine coding', time: '60–90 min', tab: 'design', what: [
        "Design the classes and interfaces of a system (parking lot, Splitwise, thread pool) and write working, extensible code.",
        "Evaluates OOP, SOLID, design patterns, concurrency and code quality; especially common in Indian product-company loops."
      ] },
      { icon: '\u{1F3DB}\uFE0F', name: 'System design (HLD)', time: '45–60 min', tab: 'design', what: [
        "Open-ended prompts such as a URL shortener, notification system or payment system.",
        "Requirements → estimates → API → data model → architecture → deep dives → trade-offs. Usually from SDE-2 upwards; Senior candidates must drive it."
      ] },
      { icon: '\u{1F52C}', name: 'Backend deep dive', time: '45–60 min', tab: 'bank', what: [
        "Java and JVM internals, concurrency, Spring, databases and transactions, caching, messaging, security.",
        "Often anchored on a project from your résumé — the interviewer keeps asking *why?* until they find the edge of your understanding."
      ] },
      { icon: '\u{1F5E3}\uFE0F', name: 'Behavioral / leadership', time: '45–60 min', tab: 'behavioral', what: [
        "Past-experience questions about ownership, conflict, failure, ambiguity and impact.",
        "Amazon's published Leadership Principles are the best-known framework; every story needs specific actions and measurable results."
      ] }
    ],

    method: [
      { icon: '\u2328\uFE0F', name: 'Coding round (45 min)', steps: [
        "**Clarify** (2–4 min): input sizes, duplicates, negatives, empty input, output format. Restate the problem with your own small example.",
        "**Brute force first**: state it and its complexity in one sentence. It proves you understand the problem and gives a baseline.",
        "**Optimise**: name the bottleneck, pick a pattern (hashing, two pointers, heap, binary search on the answer, DP…) and agree on it *before* coding.",
        "**Code** cleanly: meaningful names, small helpers, no premature micro-optimisation. Keep talking while you type.",
        "**Test** by hand: one normal case, then edge cases — empty, single element, duplicates, overflow, maximum size.",
        "**Analyse**: time and space, plus what dominates in practice (boxing, recursion depth, cache misses).",
        "**Follow-ups**: be ready for *doesn't fit in memory*, *arrives as a stream*, *many threads call it*."
      ] },
      { icon: '\u{1F3DB}\uFE0F', name: 'System design round (45–60 min)', steps: [
        "**Requirements** (5 min): the 3–4 core use cases and the non-functionals — latency, availability, consistency, durability, scale.",
        "**Estimates** (3–5 min): average and peak QPS, storage per year, bandwidth, read:write ratio. One day ≈ 10⁵ seconds.",
        "**API** (5 min): endpoints with request/response, idempotency keys, pagination.",
        "**Data model** (5 min): entities, keys and access patterns → SQL or NoSQL, indexes, partition key.",
        "**Architecture** (10 min): client → load balancer/gateway → services → cache/queue → storage. Walk the request path of the top use case.",
        "**Deep dives** (15 min): the hard parts — hot keys, consistency, failures, the bottleneck at 10× scale.",
        "**Wrap-up**: bottlenecks, monitoring and alerting, the trade-offs you made and what you would do next."
      ] },
      { icon: '\u{1F52C}', name: 'Deep-dive question', steps: [
        "Answer in layers: one-sentence definition → how it works inside → when it breaks → what you do about it in production.",
        "Anchor on a concrete example — the Splitwise and Airbnb projects in this course give you real ones.",
        "Quantify: numbers beat adjectives (16 buckets and load factor 0.75, 200 Tomcat threads, p99 of 120 ms).",
        "Say *I don't know, but here is how I would find out* instead of bluffing — bluffing is a red flag at every level.",
        "Close with the trade-off: at SDE-2 and above, every answer should say what you give up."
      ] }
    ],

    levels: {
      intro: "Titles differ between companies and the equivalents below are approximate. The same question is graded differently by level — the Q&A in this course is tagged with the level at which an answer is *expected*.",
      head: ['', 'SDE-1 (entry, ~0–2 yrs)', 'SDE-2 (mid, ~2–5 yrs)', 'Senior (~5+ yrs)'],
      rows: [
        ['Rough equivalents', 'Google L3 · Meta E3 · Amazon SDE I', 'Google L4 · Meta E4 · Amazon SDE II', 'Google L5 · Meta E5 · Amazon SDE III'],
        ['Coding', 'Solves Mediums, maybe with a hint; correct and readable code', 'Solves Medium–Hard independently; tests proactively; clean abstractions', 'Fast and clean on Hards; handles scale and concurrency follow-ups'],
        ['Design', 'Often an OOP/LLD round instead of HLD', 'Designs a service end to end with sensible trade-offs', 'Drives an ambiguous design, quantifies it, finds failure modes and plans its evolution'],
        ['Deep dive', 'Knows *how* the tools work', 'Knows *why* they behave that way and how they fail', 'Has run them in production; knows their limits, costs and alternatives'],
        ['Behavioral', 'Learning, teamwork, owning tasks', 'Owning features, handling conflict, mentoring', 'Cross-team influence, ambiguity, technical direction']
      ]
    },

    plan: {
      title: 'A 12-week plan alongside the course',
      intro: "Two sessions a week plus about six hours of interview practice. Do each session's coding round *before* reading its solution, rate yourself, and let the revisit list drive your review.",
      head: ['Week', 'Sessions', 'Coding focus', 'Design & deep-dive focus', 'Mock'],
      rows: [
        ['1', 'S1–S2', 'Hashing, iterator design', 'JVM memory and GC, exceptions; LLD: parking lot', '—'],
        ['2', 'S3–S4', 'Stacks and parsing, heaps, k-way merge', 'Lambdas and the JMM, generics, collection internals', 'Phone screen'],
        ['3', 'S5–S6', 'LRU cache, bounded blocking queue', 'HashMap/ConcurrentHashMap internals, thread pools; LLD: thread pool', '—'],
        ['4', 'S7–S8', 'Topological sort, tries', 'Maven resolution, Spring internals; HLD: URL shortener', 'Phone screen'],
        ['5', 'S9–S10', 'Sliding window, SQL window functions', 'AOP proxies, API design, transactions and isolation', 'Backend deep dive'],
        ['6', 'S11–S12', 'Tree serialization, union-find', 'JPA internals; LLD: Splitwise machine coding', 'Coding onsite'],
        ['7', 'S13–S14', 'Backtracking with bitmask DP, binary search on the answer', 'Debt simplification, testing strategy', '—'],
        ['8', 'S15–S16', 'LFU cache, token bucket', 'HLD: distributed cache, distributed rate limiter', 'System design'],
        ['9', 'S17–S18', 'LCS diff (DP), graph DFS with cycle detection', 'AI-assisted engineering; HLD: auth and SSO', 'Coding onsite'],
        ['10', 'S19–S20', 'Dijkstra, monotonic deque', 'HLD: monolith decomposition, notification system; Kafka internals', 'System design'],
        ['11', 'S21–S22', 'Sweep line, weighted interval scheduling', 'HLD: Airbnb search, payment system; sagas', 'Full loop'],
        ['12', 'S23–S24', 'Weighted round-robin, two heaps', 'HLD: API gateway, metrics platform; SRE', 'Full loop + revisit list']
      ]
    },

    patternsIntro: "Around twenty patterns cover most interview problems. Learn to spot the **signals** in a problem statement, then adapt the template. Each card links to the coding rounds in this course that use the pattern.",
    patterns: [
      { id: 'hashing', name: 'Hash map / hash set',
        signals: ["You need `O(1)` membership, counting, or *have I seen this before?*", "Pairs and complements (two-sum), grouping by a key (anagrams), de-duplication", "Trading memory for time to turn an `O(n²)` double loop into `O(n)`"],
        complexity: "`O(n)` time and space on average; long collision chains are treeified to `O(log n)` since Java 8.",
        pitfalls: ["Mutable keys, or `equals` without a matching `hashCode`", "Boxing: a `HashMap<Integer, Integer>` costs roughly ten times the memory of an `int[]`", "`HashMap` iteration order is unspecified — never depend on it"],
        template: { lang: 'java', file: 'Hashing.java', src: code`
          // two-sum: one pass, look up the complement before inserting
          static int[] twoSum(int[] a, int target) {
              Map<Integer, Integer> seen = new HashMap<>();      // value -> index
              for (int i = 0; i < a.length; i++) {
                  Integer j = seen.get(target - a[i]);
                  if (j != null) return new int[] { j, i };
                  seen.put(a[i], i);
              }
              return new int[0];
          }

          // frequency count in one line per element
          static Map<String, Integer> freq(List<String> words) {
              Map<String, Integer> f = new HashMap<>();
              for (String w : words) f.merge(w, 1, Integer::sum);
              return f;
          }` } },
      { id: 'two-pointers', name: 'Two pointers',
        signals: ["A sorted array or string: find a pair or triplet with a target sum", "In-place partitioning or removing duplicates", "Palindromes and comparisons from both ends"],
        complexity: "`O(n)` after an optional `O(n log n)` sort, `O(1)` extra space.",
        pitfalls: ["Forgetting to skip duplicates (3-sum)", "Moving the wrong pointer — argue why the discarded side cannot contain the answer"],
        template: { lang: 'java', file: 'TwoPointers.java', src: code`
          static boolean pairWithSum(int[] sorted, int target) {
              int lo = 0, hi = sorted.length - 1;
              while (lo < hi) {
                  int sum = sorted[lo] + sorted[hi];
                  if (sum == target) return true;
                  if (sum < target) lo++;      // need a bigger sum
                  else hi--;                   // need a smaller sum
              }
              return false;
          }` } },
      { id: 'sliding-window', name: 'Sliding window',
        signals: ["Longest or shortest **contiguous** subarray/substring that satisfies a constraint", "*At most K distinct*, *contains all of*, *sum ≥ target* over a range", "Streaming metrics over the last N events"],
        complexity: "`O(n)` — every element enters and leaves the window once.",
        pitfalls: ["Only works when the constraint is monotonic in the window size; negative numbers break *sum ≥ target*", "Off-by-one in the window length (`right - left + 1`)"],
        template: { lang: 'java', file: 'SlidingWindow.java', src: code`
          // longest substring with at most k distinct characters
          static int longestAtMostK(String s, int k) {
              Map<Character, Integer> count = new HashMap<>();
              int best = 0;
              for (int left = 0, right = 0; right < s.length(); right++) {
                  count.merge(s.charAt(right), 1, Integer::sum);       // expand
                  while (count.size() > k) {                           // shrink until valid
                      char c = s.charAt(left++);
                      if (count.merge(c, -1, Integer::sum) == 0) count.remove(c);
                  }
                  best = Math.max(best, right - left + 1);
              }
              return best;
          }` } },
      { id: 'monotonic', name: 'Monotonic stack / deque',
        signals: ["*Next greater / smaller element*, stock span, daily temperatures", "Maximum or minimum of every window of size k", "Largest rectangle in a histogram"],
        complexity: "`O(n)` amortised — each index is pushed and popped at most once.",
        pitfalls: ["Store **indices**, not values, so elements that left the window can be expired", "Strict vs non-strict comparison decides how duplicates behave"],
        template: { lang: 'java', file: 'Monotonic.java', src: code`
          // next greater element to the right (-1 if none)
          static int[] nextGreater(int[] a) {
              int[] res = new int[a.length];
              Arrays.fill(res, -1);
              Deque<Integer> stack = new ArrayDeque<>();      // indices; values decreasing
              for (int i = 0; i < a.length; i++) {
                  while (!stack.isEmpty() && a[stack.peek()] < a[i]) res[stack.pop()] = a[i];
                  stack.push(i);
              }
              return res;
          }` } },
      { id: 'binary-search', name: 'Binary search (and on the answer)',
        signals: ["Sorted data — or a **monotonic predicate** over the answer: *minimum capacity such that…*", "First/last occurrence, rotated arrays", "A huge answer range (up to 10⁹) with an `O(n)` feasibility check"],
        complexity: "`O(log R)` iterations × the cost of the check — often `O(n log R)`.",
        pitfalls: ["`(lo + hi) / 2` overflows — use `lo + (hi - lo) / 2`", "Mixing inclusive and exclusive bounds: write the loop invariant down", "The predicate must really be monotonic — prove it"],
        template: { lang: 'java', file: 'BinarySearch.java', src: code`
          // smallest x in [lo, hi] with ok(x) true, for ok = false...false true...true
          static long firstTrue(long lo, long hi, LongPredicate ok) {
              while (lo < hi) {
                  long mid = lo + (hi - lo) / 2;
                  if (ok.test(mid)) hi = mid;      // mid works: answer is mid or left of it
                  else lo = mid + 1;               // mid fails: answer is to the right
              }
              return lo;
          }` } },
      { id: 'heap', name: 'Heap / top-K / k-way merge',
        signals: ["*K largest*, *K most frequent*, *K closest*", "Merging K sorted lists or streams; earliest-deadline scheduling", "Running median (two heaps)"],
        complexity: "Top-K with a size-k heap: `O(n log k)`. Merging k lists of N total items: `O(N log k)`.",
        pitfalls: ["Top-K *largest* needs a **min**-heap of size k (evict the smallest)", "Never write a comparator as `a - b` — it overflows; use `Integer.compare`", "`PriorityQueue` iteration order is not sorted and `remove(Object)` is `O(n)`"],
        template: { lang: 'java', file: 'TopK.java', src: code`
          // k most frequent words with a min-heap of size k
          static List<String> topK(Map<String, Integer> freq, int k) {
              PriorityQueue<Map.Entry<String, Integer>> heap =
                  new PriorityQueue<>(Map.Entry.comparingByValue());
              for (var e : freq.entrySet()) {
                  heap.offer(e);
                  if (heap.size() > k) heap.poll();          // drop the least frequent
              }
              List<String> res = new ArrayList<>();
              while (!heap.isEmpty()) res.add(heap.poll().getKey());
              Collections.reverse(res);                      // most frequent first
              return res;
          }` } },
      { id: 'intervals', name: 'Intervals & sweep line',
        signals: ["Overlapping meetings or bookings, merging intervals, free slots", "*Maximum number concurrent* — rooms needed, peak load", "Range additions over a timeline (difference arrays)"],
        complexity: "`O(n log n)` to sort, then a linear sweep; a `TreeMap` supports online inserts in `O(log n)`.",
        pitfalls: ["Decide open vs closed ends: a stay `[10, 12)` does not overlap `[12, 14)`", "At equal coordinates, process ends before starts for half-open intervals"],
        template: { lang: 'java', file: 'Sweep.java', src: code`
          // peak number of overlapping half-open intervals [start, end)
          static int maxOverlap(int[][] intervals) {
              TreeMap<Integer, Integer> delta = new TreeMap<>();
              for (int[] iv : intervals) {
                  delta.merge(iv[0], 1, Integer::sum);
                  delta.merge(iv[1], -1, Integer::sum);
              }
              int cur = 0, best = 0;
              for (int d : delta.values()) best = Math.max(best, cur += d);
              return best;
          }` } },
      { id: 'stack', name: 'Stack & expression parsing',
        signals: ["Matching brackets, evaluating expressions, undo history", "Nested structures — flatten nested lists, decode strings", "Turning recursion into iteration"],
        complexity: "`O(n)` time, `O(n)` stack.",
        pitfalls: ["Use `ArrayDeque`, not the legacy synchronized `Stack`", "Operator precedence and unary minus in calculators"],
        template: { lang: 'java', file: 'Brackets.java', src: code`
          static boolean balanced(String s) {
              Deque<Character> st = new ArrayDeque<>();
              for (char c : s.toCharArray()) {
                  switch (c) {
                      case '(', '[', '{' -> st.push(c);
                      case ')' -> { if (st.isEmpty() || st.pop() != '(') return false; }
                      case ']' -> { if (st.isEmpty() || st.pop() != '[') return false; }
                      case '}' -> { if (st.isEmpty() || st.pop() != '{') return false; }
                      default -> { }
                  }
              }
              return st.isEmpty();
          }` } },
      { id: 'linked-list', name: 'Linked lists',
        signals: ["`O(1)` insert/remove at a known node — LRU and LFU caches", "Reversal, cycle detection (Floyd), finding the middle, merging sorted lists", "Reordering in place with `O(1)` extra space"],
        complexity: "`O(n)` traversal, `O(1)` splice.",
        pitfalls: ["Use **sentinel** head and tail nodes to remove null checks", "Update both `prev` and `next` in a doubly linked list", "Draw the pointers before coding a reversal"],
        template: { lang: 'java', file: 'Reverse.java', src: code`
          static final class Node { int val; Node next; Node(int v) { val = v; } }

          static Node reverse(Node head) {
              Node prev = null;
              while (head != null) {
                  Node next = head.next;   // save
                  head.next = prev;        // flip
                  prev = head;             // advance
                  head = next;
              }
              return prev;
          }` } },
      { id: 'trees', name: 'Trees: DFS, BFS & serialization',
        signals: ["Hierarchies: categories, org charts, file systems, comment threads", "Lowest common ancestor, path sums, level-order output", "Encoding a structure for a cache or the wire"],
        complexity: "`O(n)` time; recursion depth `O(h)` — `O(n)` for a skewed tree.",
        pitfalls: ["Deep or skewed trees overflow the call stack — use an explicit stack", "Preorder serialization is only unambiguous with null markers"],
        template: { lang: 'java', file: 'Levels.java', src: code`
          record TreeNode(int val, TreeNode left, TreeNode right) {}

          static List<List<Integer>> levels(TreeNode root) {
              List<List<Integer>> out = new ArrayList<>();
              Deque<TreeNode> q = new ArrayDeque<>();
              if (root != null) q.offer(root);
              while (!q.isEmpty()) {
                  List<Integer> level = new ArrayList<>();
                  for (int n = q.size(); n > 0; n--) {         // exactly one level per pass
                      TreeNode t = q.poll();
                      level.add(t.val());
                      if (t.left() != null) q.offer(t.left());
                      if (t.right() != null) q.offer(t.right());
                  }
                  out.add(level);
              }
              return out;
          }` } },
      { id: 'trie', name: 'Trie (prefix tree)',
        signals: ["Prefix queries: autocomplete, *starts with*, IP routing tables", "HTTP route or URL path matching, segment by segment", "Searching many words at once"],
        complexity: "`O(L)` per insert or lookup for a key of length L — independent of how many keys are stored.",
        pitfalls: ["One map per node adds up — use arrays for small alphabets", "Mark terminal nodes: a prefix is not automatically a word"],
        template: { lang: 'java', file: 'Trie.java', src: code`
          static final class Trie {
              private final Map<Character, Trie> next = new HashMap<>();
              private boolean word;

              void insert(String s) {
                  Trie t = this;
                  for (char c : s.toCharArray()) t = t.next.computeIfAbsent(c, k -> new Trie());
                  t.word = true;
              }

              boolean startsWith(String prefix) {
                  Trie t = this;
                  for (char c : prefix.toCharArray()) if ((t = t.next.get(c)) == null) return false;
                  return true;
              }
          }` } },
      { id: 'graph', name: 'Graph BFS / DFS',
        signals: ["Connectivity, reachability, islands, cloning a graph", "Shortest path in an **unweighted** graph (BFS)", "Cycle detection, dependency resolution, permission inheritance"],
        complexity: "`O(V + E)`.",
        pitfalls: ["Mark nodes visited when you **enqueue** them, not when you dequeue", "Recursive DFS overflows around 10⁴–10⁵ deep — iterate with a stack", "Directed-cycle detection needs three colours (unvisited / in progress / done)"],
        template: { lang: 'java', file: 'Bfs.java', src: code`
          // BFS distances from src in an unweighted graph
          static int[] bfs(List<List<Integer>> g, int src) {
              int[] dist = new int[g.size()];
              Arrays.fill(dist, -1);
              Deque<Integer> q = new ArrayDeque<>();
              dist[src] = 0;
              q.offer(src);
              while (!q.isEmpty()) {
                  int u = q.poll();
                  for (int v : g.get(u)) {
                      if (dist[v] == -1) { dist[v] = dist[u] + 1; q.offer(v); }
                  }
              }
              return dist;
          }` } },
      { id: 'topo-sort', name: 'Topological sort',
        signals: ["Ordering with dependencies: builds, course schedules, migrations, DAG workflows", "Detecting a dependency cycle", "Parallel *waves* of independent tasks"],
        complexity: "`O(V + E)` with Kahn's algorithm; `O((V + E) log V)` for the lexicographically smallest order.",
        pitfalls: ["If fewer than V nodes come out, there is a cycle", "Edge direction: `a -> b` means a must come **before** b"],
        template: { lang: 'java', file: 'Topo.java', src: code`
          // Kahn's algorithm; edge {a, b} means a before b. Empty list = cycle.
          static List<Integer> topo(int n, int[][] edges) {
              List<List<Integer>> g = new ArrayList<>();
              for (int i = 0; i < n; i++) g.add(new ArrayList<>());
              int[] indeg = new int[n];
              for (int[] e : edges) { g.get(e[0]).add(e[1]); indeg[e[1]]++; }
              Deque<Integer> q = new ArrayDeque<>();
              for (int i = 0; i < n; i++) if (indeg[i] == 0) q.offer(i);
              List<Integer> order = new ArrayList<>();
              while (!q.isEmpty()) {
                  int u = q.poll();
                  order.add(u);
                  for (int v : g.get(u)) if (--indeg[v] == 0) q.offer(v);
              }
              return order.size() == n ? order : List.of();
          }` } },
      { id: 'union-find', name: 'Union-Find (disjoint sets)',
        signals: ["Merging groups that share something — accounts with a common e-mail", "Dynamic connectivity: *are x and y connected now?*", "Counting components while edges arrive; Kruskal's MST"],
        complexity: "Amortised `O(α(n))` — effectively constant — with path compression and union by rank.",
        pitfalls: ["Without both optimisations a find can degrade to `O(n)`", "Union-find cannot split sets; deletions need a rebuild"],
        template: { lang: 'java', file: 'Dsu.java', src: code`
          static final class Dsu {
              private final int[] parent, rank;

              Dsu(int n) {
                  parent = new int[n];
                  rank = new int[n];
                  for (int i = 0; i < n; i++) parent[i] = i;
              }
              int find(int x) {                                  // path compression
                  return parent[x] == x ? x : (parent[x] = find(parent[x]));
              }
              boolean union(int a, int b) {
                  int ra = find(a), rb = find(b);
                  if (ra == rb) return false;
                  if (rank[ra] < rank[rb]) { int t = ra; ra = rb; rb = t; }
                  parent[rb] = ra;                               // attach the shorter tree
                  if (rank[ra] == rank[rb]) rank[ra]++;
                  return true;
              }
          }` } },
      { id: 'shortest-path', name: 'Shortest paths (Dijkstra and friends)',
        signals: ["Weighted graph with non-negative weights: latency, cost, distance", "*Minimum time for a signal to reach every node*", "*At most K stops* → Bellman-Ford or BFS by layers"],
        complexity: "Dijkstra with a binary heap: `O((V + E) log V)`.",
        pitfalls: ["Negative edges break Dijkstra — use Bellman-Ford", "Skip stale heap entries (`if (d > dist[u]) continue;`)", "Use `long` distances when weights can sum past 2³¹"],
        template: { lang: 'java', file: 'Dijkstra.java', src: code`
          static long[] dijkstra(List<List<int[]>> g, int src) {      // g.get(u) = {v, w} pairs
              long[] dist = new long[g.size()];
              Arrays.fill(dist, Long.MAX_VALUE);
              dist[src] = 0;
              PriorityQueue<long[]> pq = new PriorityQueue<>(Comparator.comparingLong(x -> x[1]));
              pq.offer(new long[] { src, 0 });
              while (!pq.isEmpty()) {
                  long[] top = pq.poll();
                  int u = (int) top[0];
                  if (top[1] > dist[u]) continue;                     // stale entry
                  for (int[] e : g.get(u)) {
                      long nd = dist[u] + e[1];
                      if (nd < dist[e[0]]) { dist[e[0]] = nd; pq.offer(new long[] { e[0], nd }); }
                  }
              }
              return dist;
          }` } },
      { id: 'backtracking', name: 'Backtracking',
        signals: ["*Generate all* combinations, permutations, subsets, partitions", "Constraint satisfaction (N-Queens, Sudoku)", "Exact answers to NP-hard problems on tiny inputs (n ≤ 20)"],
        complexity: "Exponential — `O(2ⁿ)` or `O(n!)`; pruning and ordering decide whether it finishes.",
        pitfalls: ["Undo the choice after the recursive call", "Prune early: sort the input, skip duplicates, cut branches that cannot beat the best answer"],
        template: { lang: 'java', file: 'Subsets.java', src: code`
          static void subsets(int[] a, int i, Deque<Integer> cur, List<List<Integer>> out) {
              if (i == a.length) { out.add(new ArrayList<>(cur)); return; }
              subsets(a, i + 1, cur, out);         // skip a[i]
              cur.addLast(a[i]);                   // choose
              subsets(a, i + 1, cur, out);
              cur.removeLast();                    // un-choose
          }` } },
      { id: 'dp', name: 'Dynamic programming',
        signals: ["*Count the ways*, *min/max cost*, *longest/shortest* with overlapping subproblems", "Each step's result depends only on a small state (index, remaining capacity, last choice)", "Sequences: LCS and edit distance (diffs), knapsack, profit scheduling"],
        complexity: "`O(states × transitions)`; memory can often shrink to one or two rows.",
        pitfalls: ["Define the state in words first (`dp[i][j]` = …)", "Base cases and iteration order; memoised recursion first, tabulate if needed", "`int` overflow in counting problems"],
        template: { lang: 'java', file: 'Lcs.java', src: code`
          // dp[i][j] = length of the LCS of a[0..i) and b[0..j)
          static int lcs(String a, String b) {
              int[][] dp = new int[a.length() + 1][b.length() + 1];
              for (int i = 1; i <= a.length(); i++)
                  for (int j = 1; j <= b.length(); j++)
                      dp[i][j] = a.charAt(i - 1) == b.charAt(j - 1)
                          ? dp[i - 1][j - 1] + 1
                          : Math.max(dp[i - 1][j], dp[i][j - 1]);
              return dp[a.length()][b.length()];
          }` } },
      { id: 'bitmask', name: 'Bitmask DP & bit tricks',
        signals: ["n ≤ 20 items and you need the best subset, assignment or order", "Visiting every node (TSP-style), splitting into zero-sum groups", "Compact sets of flags or permissions"],
        complexity: "`O(2ⁿ · n)` time and `O(2ⁿ)` memory — fine up to n ≈ 20 (about 2×10⁷ steps).",
        pitfalls: ["Precedence: always write `(mask & (1 << i)) != 0`", "Iterate masks in an order where the smaller sub-states are already computed"],
        template: { lang: 'java', file: 'SubsetSums.java', src: code`
          // sum of every subset in O(2^n): reuse the subset without its lowest bit
          static int[] subsetSums(int[] a) {
              int n = a.length;
              int[] sum = new int[1 << n];
              for (int mask = 1; mask < (1 << n); mask++) {
                  int low = Integer.numberOfTrailingZeros(mask);
                  sum[mask] = sum[mask & (mask - 1)] + a[low];
              }
              return sum;
          }` } },
      { id: 'greedy', name: 'Greedy',
        signals: ["A locally best choice provably never hurts (exchange argument)", "Scheduling by earliest end time, interval covering", "Weighted load balancing and round-robin selection"],
        complexity: "Usually `O(n log n)` for the sort, or `O(n)`.",
        pitfalls: ["Greedy is often wrong: test it against brute force on small random inputs", "Know a counter-example for *why not greedy?* (debt simplification, coin change with arbitrary coins)"],
        template: { lang: 'java', file: 'Greedy.java', src: code`
          // maximum number of non-overlapping intervals: keep the one that ends first
          static int maxNonOverlapping(int[][] iv) {
              Arrays.sort(iv, Comparator.comparingInt(x -> x[1]));
              int count = 0;
              long end = Long.MIN_VALUE;
              for (int[] x : iv) {
                  if (x[0] >= end) { count++; end = x[1]; }
              }
              return count;
          }` } },
      { id: 'design', name: 'Data-structure design (LRU, LFU, iterators…)',
        signals: ["*Design a class whose operations run in O(1)*", "Combining structures: a hash map for lookup plus a list, heap or tree for order", "Iterators, rate limiters, time-based key-value stores"],
        complexity: "Hit the stated per-operation bound — usually `O(1)` or `O(log n)` — and say which structure gives it to you.",
        pitfalls: ["Keep every structure consistent on every path (map **and** list)", "Clarify capacity 0, duplicate puts and whether it must be thread-safe"],
        template: { lang: 'java', file: 'IndexPlusOrder.java', src: code`
          // the skeleton most design rounds end up with: an index plus an order
          final class Cache<K, V> {
              private final Map<K, Node<K, V>> index = new HashMap<>();   // O(1) lookup
              private final Node<K, V> head = new Node<>(null, null);      // sentinels:
              private final Node<K, V> tail = new Node<>(null, null);      // no null checks
              Cache() { head.next = tail; tail.prev = head; }

              private void unlink(Node<K, V> n) { n.prev.next = n.next; n.next.prev = n.prev; }
              private void addFront(Node<K, V> n) {
                  n.next = head.next; n.prev = head; head.next.prev = n; head.next = n;
              }

              static final class Node<K, V> {
                  final K key; V val; Node<K, V> prev, next;
                  Node(K k, V v) { key = k; val = v; }
              }
          }` } },
      { id: 'concurrency', name: 'Concurrency primitives',
        signals: ["*Make it thread-safe*, producer/consumer, bounded buffers", "Rate limiters, pools and caches under contention", "Ordering threads (print in order, alternate output)"],
        complexity: "Correctness first: find the shared mutable state, then the smallest critical section that protects it.",
        pitfalls: ["Always wait in a `while` loop — spurious wake-ups are allowed", "A global lock order prevents deadlocks; `tryLock` with a timeout detects them", "Prefer `java.util.concurrent` (atomics, `ConcurrentHashMap`, `Semaphore`) to hand-rolled locking"],
        template: { lang: 'java', file: 'BoundedBuffer.java', src: code`
          final class BoundedBuffer<T> {
              private final Deque<T> q = new ArrayDeque<>();
              private final int cap;
              private final ReentrantLock lock = new ReentrantLock();
              private final Condition notFull = lock.newCondition(), notEmpty = lock.newCondition();

              BoundedBuffer(int cap) { this.cap = cap; }

              void put(T x) throws InterruptedException {
                  lock.lock();
                  try {
                      while (q.size() == cap) notFull.await();
                      q.addLast(x);
                      notEmpty.signal();
                  } finally { lock.unlock(); }
              }

              T take() throws InterruptedException {
                  lock.lock();
                  try {
                      while (q.isEmpty()) notEmpty.await();
                      T x = q.removeFirst();
                      notFull.signal();
                      return x;
                  } finally { lock.unlock(); }
              }
          }` } },
      { id: 'sql', name: 'SQL & window functions',
        signals: ["*Top N per group*, running totals, ranking, de-duplication", "Ratios over filtered sets — cancellation rate, conversion", "Gaps and islands, consecutive events"],
        complexity: "Think in sets; the optimiser picks the algorithm. Your job is correct semantics plus the index that supports it.",
        pitfalls: ["`RANK` vs `DENSE_RANK` vs `ROW_NUMBER` on ties", "NULLs: `COUNT(col)` skips them, and `NOT IN (… NULL …)` matches nothing", "Integer division, and selecting columns that are neither grouped nor aggregated"],
        template: { lang: 'sql', file: 'top-n-per-group.sql', src: code`
          -- top 3 distinct salaries per department
          SELECT department, employee, salary
          FROM (
            SELECT d.name AS department, e.name AS employee, e.salary,
                   DENSE_RANK() OVER (PARTITION BY e.department_id
                                      ORDER BY e.salary DESC) AS rnk
            FROM employee e
            JOIN department d ON d.id = e.department_id
          ) ranked
          WHERE rnk <= 3;` } },
      { id: 'strings', name: 'Strings & parsing',
        signals: ["Tokenising input: calculators, routers, log lines", "Comparing sequences (diffs), palindromes, anagrams", "Building large outputs efficiently"],
        complexity: "`O(n)` with a single pass; avoid `O(n²)` concatenation in loops.",
        pitfalls: ["Use `StringBuilder` in loops", "`split` takes a regex — `split(\".\")` splits on every character", "`charAt` returns UTF-16 code units, not code points"],
        template: { lang: 'java', file: 'Tokens.java', src: code`
          // tokenise "12+3*(4-1)" into numbers and one-character operators
          static List<String> tokens(String s) {
              List<String> out = new ArrayList<>();
              for (int i = 0; i < s.length(); ) {
                  char c = s.charAt(i);
                  if (Character.isWhitespace(c)) { i++; continue; }
                  if (Character.isDigit(c)) {
                      int j = i;
                      while (j < s.length() && Character.isDigit(s.charAt(j))) j++;
                      out.add(s.substring(i, j));
                      i = j;
                  } else {
                      out.add(String.valueOf(c));
                      i++;
                  }
              }
              return out;
          }` } }
    ],

    mockIntro: "Pick a format and practise under the clock. The generator favours rounds you have not solved yet and answers you marked as missed. Speak out loud as if an interviewer were listening — or ask a friend to play the interviewer with the model answers open.",
    mocks: [
      { id: 'phone', name: 'Technical phone screen', minutes: 45,
        desc: "One Medium coding round plus three quick deep-dive questions — the most common first technical step.",
        rules: "Plain editor, no autocomplete, no running the code. About 5 minutes clarifying, 25 coding, 5 testing; use the last 10 for the questions.",
        parts: [{ type: 'coding', count: 1, difficulty: 'Medium' }, { type: 'qa', count: 3, minLevel: 1 }] },
      { id: 'onsite', name: 'Coding onsite (two rounds)', minutes: 90,
        desc: "Two back-to-back 45-minute rounds: one Medium, one Hard.",
        rules: "Reset after 45 minutes even if unfinished — interviewers grade the process (clarifying, testing, complexity), not only the final code.",
        parts: [{ type: 'coding', count: 1, difficulty: 'Medium' }, { type: 'coding', count: 1, difficulty: 'Hard' }] },
      { id: 'hld', name: 'System design', minutes: 60,
        desc: "A high-level design round followed by two senior-level probing questions.",
        rules: "Spend no more than 10 minutes on requirements and estimates. Draw the architecture before you go deep, and state every trade-off out loud.",
        parts: [{ type: 'design', count: 1, kind: 'HLD' }, { type: 'qa', count: 2, minLevel: 3 }] },
      { id: 'lld', name: 'Low-level design / machine coding', minutes: 90,
        desc: "An LLD round plus a data-structure design problem.",
        rules: "Get a working core end to end first, then extend. Interviewers look for clean interfaces, the right patterns and tests.",
        parts: [{ type: 'design', count: 1, kind: 'LLD' }, { type: 'coding', count: 1, pattern: 'design' }] },
      { id: 'deep', name: 'Backend deep dive', minutes: 60,
        desc: "Twelve rapid-fire questions across Java, Spring, databases and distributed systems at SDE-2 and Senior level.",
        rules: "About four minutes per question: definition, internals, failure mode, production practice. Rate yourself honestly after each one.",
        parts: [{ type: 'qa', count: 12, minLevel: 2 }] },
      { id: 'loop', name: 'Full loop (half day)', minutes: 240,
        desc: "Two coding rounds, a design round, a deep dive and behavioral — the closest thing to a real onsite.",
        rules: "Take a 10-minute break between rounds, exactly as you would on the day. Review the whole loop afterwards and move weak items to the revisit list.",
        parts: [{ type: 'coding', count: 1, difficulty: 'Medium' }, { type: 'coding', count: 1, difficulty: 'Hard' }, { type: 'design', count: 1 },
          { type: 'qa', count: 6, minLevel: 2 }, { type: 'behavioral', count: 3 }] },
      { id: 'behavioral', name: 'Behavioral', minutes: 45,
        desc: "Four behavioral prompts — answer each in STAR form in three to four minutes.",
        rules: "Record yourself. Check that every answer says *I*, contains a number and ends with what you learned.",
        parts: [{ type: 'behavioral', count: 4 }] }
    ],

    behavioral: {
      intro: "Behavioral rounds can veto an otherwise strong loop. Interviewers look for evidence of ownership, judgement and impact, told as specific stories rather than opinions. Prepare six to eight stories you can adapt — the course projects (Splitwise, Splitwise with AI agents, Airbnb) give you real material if you are early in your career.",
      star: [
        "**Situation** (about 15%): one or two sentences of context — the team, the product, the constraint.",
        "**Task**: what *you* were responsible for, and why it was hard.",
        "**Action** (50–60%): what *you* did, step by step — decisions, trade-offs, how you brought others along. Say *I*, not *we*.",
        "**Result**: the measurable outcome (p99 down 40%, zero incidents, shipped two weeks early) and how you know.",
        "**Learning**: what you would do differently — this is where seniority shows."
      ],
      tips: [
        "Specific beats general: one real incident with numbers is worth more than *I always communicate well*.",
        "Keep answers to two or three minutes and let the interviewer dig — follow-ups are where they score you.",
        "Own failures honestly and show the mechanism you changed afterwards: a test, an alert, a checklist.",
        "Show disagreement handled with data and respect, ending in commitment.",
        "Cover the common themes: conflict, failure, tight deadline, ambiguity, mentoring, going beyond scope, simplifying, customer impact.",
        "Never blame teammates or past employers, and never invent stories — follow-up questions expose them quickly."
      ],
      prompts: [
        { theme: 'Ownership', q: "Tell me about a time you took ownership of a problem that was not assigned to you.",
          probe: ["Did you act without being asked — and why?", "How did you balance it with your own commitments?", "What changed permanently because of you (process, tooling, alerting)?"],
          story: "the N+1 query or flaky test you found while building Splitwise and fixed for everyone — with before-and-after numbers." },
        { theme: 'Dive deep', q: "Describe the hardest bug you have debugged. How did you find the root cause?",
          probe: ["A hypothesis-driven process: logs, metrics, a minimal reproduction, bisecting", "Real technical depth — can you explain the mechanism?", "What you did so the whole class of bug cannot come back"],
          story: "a lost update, deadlock or `LazyInitializationException` from Sessions 6, 10 and 11, and how you reproduced it." },
        { theme: 'Disagree and commit', q: "Tell me about a time you disagreed with a technical decision made by your lead or team.",
          probe: ["Did you argue with data rather than opinion?", "Did you escalate respectfully, and commit once the decision was made?", "What happened — and were you right?"],
          story: "monolith versus microservices, or REST versus messaging, for the Airbnb project — the trade-off tables from Sessions 19–20 are your evidence." },
        { theme: 'Deliver results', q: "Tell me about a time you delivered under a tight deadline. What did you cut?",
          probe: ["Prioritisation: essential versus nice-to-have", "Communicating scope changes early", "The quality safeguards you kept despite the pressure"],
          story: "shipping the Splitwise MVP: which features you deferred (simplify debts, multi-currency) and why." },
        { theme: 'Failure', q: "Tell me about a time you failed or made a significant mistake.",
          probe: ["A genuine failure with real impact, not a humble-brag", "Accountability without excuses", "The mechanism you put in place afterwards"],
          story: "a broken deployment or migration — then the expand/contract and canary process from Session 23 that you adopted." },
        { theme: 'Ambiguity', q: "Describe a project where the requirements were unclear. How did you move forward?",
          probe: ["How you clarified users, metrics and constraints", "Deciding reversible things quickly and irreversible things carefully", "Iterating on feedback"],
          story: "scoping Airbnb search in Session 21: what you assumed, what you measured and what changed." },
        { theme: 'Customer obsession', q: "Tell me about a time you improved the experience of a user or customer.",
          probe: ["Did it start from a real pain backed by data?", "The trade-off between user value and engineering cost", "How you measured the improvement"],
          story: "making settle-up idempotent so nobody is ever charged twice (Sessions 12 and 22)." },
        { theme: 'Influence', q: "Tell me about a time you convinced others to adopt an idea or a technology.",
          probe: ["Building consensus with prototypes, benchmarks and design docs", "Taking sceptics' valid concerns seriously", "Adoption and long-term result"],
          story: "introducing Testcontainers or contract tests (Session 14) and the bugs they caught." },
        { theme: 'Mentoring', q: "Describe a time you helped a teammate grow or unblocked someone.",
          probe: ["Teaching rather than doing it for them", "Adapting to their level", "The outcome for them and for the team"],
          story: "pairing with a classmate on the JPA N+1 problem or the Spring Security filter chain." },
        { theme: 'Bias for action', q: "Tell me about a time you made a decision with incomplete information.",
          probe: ["Assessing risk and reversibility", "Which data you lacked and how you limited the downside", "How you followed up when more information arrived"],
          story: "choosing cache TTLs or circuit-breaker thresholds before production data existed (Sessions 15 and 20), then tuning them from metrics." },
        { theme: 'Simplify', q: "Tell me about a time you simplified a complex system or process.",
          probe: ["What the complexity was costing (incidents, onboarding time, latency)", "What you removed, not just what you added", "The impact in numbers"],
          story: "replacing hand-written JDBC mapping with Spring Data repositories, or collapsing duplicated configuration into shared profiles." },
        { theme: 'Using AI responsibly', q: "How do you use AI coding assistants? Tell me about a time one produced something wrong.",
          probe: ["Verification habits: tests, code review, reading the docs", "Understanding of failure modes such as hallucinated or outdated APIs", "Security and licensing awareness"],
          story: "the Cursor agent session in Session 17: the outdated API it suggested, how your tests caught it, and the project rule you added." }
      ],
      ask: [
        "What does a successful first six months look like in this role?",
        "How is the roadmap decided, and how are engineers involved?",
        "What does on-call look like, and how are incidents reviewed?",
        "How are code reviews and design reviews run on this team?",
        "What is the biggest technical challenge the team faces this year?",
        "How do engineers grow from this level to the next one here?"
      ]
    }
  };
})(COURSE);
