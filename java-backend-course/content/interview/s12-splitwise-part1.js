/* Interview pack — Session 12: Splitwise part 1 (architecture, schema & money) */
COURSE.prep(12, {
  deepDives: [
    {
      title: 'Deep dive: money in software — precision, rounding, currencies & ledgers',
      lead: 'Payment and expense systems fail in tiny ways: a paisa lost per split, a rounding bias, a currency with three decimals. Interviewers probe exactly these.',
      points: [
        "Never use `double` for money — `0.1 + 0.2` is not `0.3` in binary floating point. Use `BigDecimal` built from strings (or `BigDecimal.valueOf`, never `new BigDecimal(0.1)`), or integer **minor units** (`long paise`).",
        "`BigDecimal.equals` compares **scale** as well as value: `2.0` and `2.00` are not equal, while `compareTo` says they are. Use `compareTo` for amounts, and be careful mixing `HashSet` (uses `equals`) and `TreeSet` (uses `compareTo`).",
        "Choose a `RoundingMode` explicitly. `HALF_EVEN` (banker's rounding) avoids a systematic upward bias when many values are rounded; `HALF_UP` matches many invoices. Dividing without a scale and rounding mode throws for non-terminating results such as 1/3.",
        "Remainders must go somewhere: ₹100.00 split three ways is 33.34 + 33.33 + 33.33, so the parts always sum to the total (largest-remainder method).",
        "Currencies differ: `Currency.getInstance(\"JPY\").getDefaultFractionDigits()` is 0, INR is 2, KWD is 3. Keep amount and currency together in a `Money` value object, and store FX rates with the timestamp used.",
        "**Double-entry ledger**: every movement is an immutable entry that debits one account and credits another by the same amount; balances are sums of entries; corrections are new reversing entries, never updates. That gives an audit trail and makes reconciliation possible. In SQL use `DECIMAL(19,4)` or `BIGINT` minor units — never `FLOAT`/`DOUBLE`."
      ],
      code: { lang: 'java', file: 'MoneyDemo.java', src: code`
        import java.math.*;
        import java.util.*;

        public class MoneyDemo {
            /** Splits an amount into n parts that sum exactly to it; the first parts absorb the remainder. */
            static List<BigDecimal> split(BigDecimal amount, int n) {
                BigDecimal base = amount.divide(BigDecimal.valueOf(n), 2, RoundingMode.DOWN);
                int extraCents = amount.subtract(base.multiply(BigDecimal.valueOf(n))).movePointRight(2).intValueExact();
                List<BigDecimal> parts = new ArrayList<>();
                for (int i = 0; i < n; i++) parts.add(i < extraCents ? base.add(new BigDecimal("0.01")) : base);
                return parts;
            }

            public static void main(String[] args) {
                System.out.println("double: 0.1 + 0.2 = " + (0.1 + 0.2));
                System.out.println("new BigDecimal(0.1) = " + new BigDecimal(0.1));
                System.out.println("BigDecimal.valueOf(0.1) = " + BigDecimal.valueOf(0.1));
                BigDecimal a = new BigDecimal("2.0"), b = new BigDecimal("2.00");
                System.out.println("equals: " + a.equals(b) + ", compareTo: " + a.compareTo(b));
                for (String v : List.of("2.345", "2.355")) {
                    BigDecimal x = new BigDecimal(v);
                    System.out.println(v + " HALF_UP=" + x.setScale(2, RoundingMode.HALF_UP) + " HALF_EVEN=" + x.setScale(2, RoundingMode.HALF_EVEN));
                }
                System.out.println("fraction digits: INR=" + Currency.getInstance("INR").getDefaultFractionDigits()
                        + " JPY=" + Currency.getInstance("JPY").getDefaultFractionDigits()
                        + " KWD=" + Currency.getInstance("KWD").getDefaultFractionDigits());
                List<BigDecimal> parts = split(new BigDecimal("100.00"), 3);
                System.out.println("split 100.00 / 3 = " + parts + " sum=" + parts.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
            }
        }`, out: code`
        double: 0.1 + 0.2 = 0.30000000000000004
        new BigDecimal(0.1) = 0.1000000000000000055511151231257827021181583404541015625
        BigDecimal.valueOf(0.1) = 0.1
        equals: false, compareTo: 0
        2.345 HALF_UP=2.35 HALF_EVEN=2.34
        2.355 HALF_UP=2.36 HALF_EVEN=2.36
        fraction digits: INR=2 JPY=0 KWD=3
        split 100.00 / 3 = [33.34, 33.33, 33.33] sum=100.00` },
      callout: { kind: 'interview', text: "If an interviewer hands you a money problem, say three things before coding: the representation (BigDecimal or minor units), the rounding mode and who absorbs the remainder, and the currency's number of decimals. That alone puts you ahead of most candidates." },
      notes: [
        "`new BigDecimal(0.1)` shows the exact binary value hidden behind the `double` literal — the clearest demonstration of why doubles cannot represent decimal money. `BigDecimal.valueOf(0.1)` goes through `Double.toString`, which is why it prints `0.1`.",
        "HALF_EVEN rounds 2.345 down to 2.34 (the preceding digit 4 is even) and 2.355 up to 2.36 (5 is odd). Over millions of transactions this avoids drifting upwards, which is why it is common in financial calculations — but follow the rule your business or regulator specifies.",
        "Ledgers also simplify concurrency: appending entries never conflicts the way updating one balance row does. Balances can be derived on read for small groups, or kept as cached aggregates (next slide)."
      ]
    },
    {
      title: 'Deep dive: storing balances — compute, materialise or event-source?',
      lead: 'Every Splitwise-style design must answer *who owes whom right now?* The three standard answers trade read speed against write contention and complexity.',
      table: { head: ['Approach', 'Reads', 'Writes', 'Consistency & risks'], rows: [
        ['Compute on read (`SUM` over expense splits and settlements)', 'Slower as history grows; fine for small groups with an index', 'Just insert the expense and its splits', 'Always correct; nothing to keep in sync'],
        ['Materialised pairwise balances (`balance(group, debtor, creditor, amount)`)', 'O(1) per pair', 'Update balance rows in the same transaction as the expense', 'Hot rows under contention; must use atomic `amount = amount + ?` updates'],
        ['Event-sourced ledger + snapshots', 'Snapshot + recent events', 'Append events only', 'Full history and audit; more moving parts; projections can lag']
      ] },
      points: [
        "Start with **compute on read** — correct by construction — and add an index on `(group_id, user_id)`. Materialise only when measurements show the reads are too slow.",
        "When materialising, update the balance rows **in the same transaction** as the expense, with atomic SQL (`UPDATE … SET amount = amount + :x`) so concurrent expenses cannot lose updates. Lock pairs in a consistent order (smaller user id first) to avoid deadlocks.",
        "Invariant to test and monitor: within a group, all net balances sum to **zero** — a nightly job that recomputes balances from the raw expenses and compares catches drift early.",
        "Edits and deletions should be **reversals**: record a compensating entry rather than updating history, so the audit trail stays intact and materialised balances can be adjusted by applying the reversal.",
        "Idempotent creation: accept an `Idempotency-Key` per expense (a unique index), because mobile clients retry on flaky networks."
      ],
      notes: [
        "A typical interview mistake is to start with the most complex option (event sourcing) without a reason. Explain the simple one, the trigger for moving to the next one (read latency, group size), and how you would migrate — that shows senior judgement.",
        "Pairwise balances grow with the square of the group size (n × (n − 1) / 2 pairs). For large groups, storing one *net balance per member* (positive = owed money, negative = owes) is smaller and is exactly the input that Session 13's debt-simplification algorithm needs.",
        "Reconciliation jobs are cheap insurance: compute the balances two ways and alert when they differ. Real payment systems run such checks continuously."
      ]
    }
  ],

  stretch: [
    "Add multi-currency groups: store each expense's original currency and amount, the FX rate and timestamp used, and the converted amount in the group's base currency; show balances in the base currency.",
    "Build the Splitwise core from today's design round and add property-based tests (for example with jqwik): for random expenses, splits always sum to the total and all balances sum to zero.",
    "Make `POST /expenses` idempotent with an `Idempotency-Key` header backed by a unique index, and test two identical requests sent concurrently."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: merge duplicate accounts (union-find)',
      lead: 'Importing contacts from several sources creates duplicates. Merging accounts that share any e-mail is a connected-components problem — LeetCode 721.',
      difficulty: 'Medium', minutes: 35, lc: 721, pattern: ['union-find', 'graph', 'hashing'],
      problem: [
        "Each account is a list `[name, email1, email2, …]`. Two accounts belong to the same person if they share **any** e-mail — directly or through a chain of accounts. Accounts of one person always carry the same name, but different people may share a name.",
        "Return one row per person: the name followed by all of that person's e-mails in sorted order. Order the rows by name, then by first e-mail."
      ],
      examples: [
        { in: '[John, johnsmith@mail.com, john_newyork@mail.com]\n[John, johnsmith@mail.com, john00@mail.com]\n[Mary, mary@mail.com]\n[John, johnnybravo@mail.com]',
          out: '[John, john00@mail.com, john_newyork@mail.com, johnsmith@mail.com]\n[John, johnnybravo@mail.com]\n[Mary, mary@mail.com]',
          why: "The first two Johns share johnsmith@mail.com; the third John is a different person with the same name." }
      ],
      constraints: ["`1 ≤ accounts.length ≤ 1000`", "`2 ≤ accounts[i].length ≤ 10`", "E-mails are up to 30 characters"],
      hints: [
        "Treat accounts as nodes and *shares an e-mail* as an edge. What is a merged person in graph terms?",
        "Find connected components: BFS/DFS over an e-mail graph, or union-find over account indices with a map from each e-mail to the first account that had it.",
        "With path compression and union by size each operation is nearly O(1); afterwards, group e-mails by their root and sort them."
      ],
      approaches: [
        { name: 'Repeated pairwise merging', idea: 'Merge any two accounts that share an e-mail until nothing changes', time: 'O(n² · k) or worse', space: 'O(N)' },
        { name: 'Graph + BFS', idea: 'Link each account\'s e-mails to its first e-mail; BFS finds components', time: 'O(N log N) with sorting', space: 'O(N)' },
        { name: 'Union-find', idea: 'Union accounts that share an e-mail, then bucket e-mails by root', time: 'O(N α(N) + N log N)', space: 'O(N)' }
      ],
      code: { lang: 'java', file: 'AccountsMerge.java', src: code`
        import java.util.*;

        public class AccountsMerge {
            static final class Dsu {
                private final int[] parent, size;
                Dsu(int n) {
                    parent = new int[n];
                    size = new int[n];
                    for (int i = 0; i < n; i++) { parent[i] = i; size[i] = 1; }
                }
                int find(int x) {
                    int r = x;
                    while (parent[r] != r) r = parent[r];
                    while (parent[x] != r) { int next = parent[x]; parent[x] = r; x = next; }   // path compression
                    return r;
                }
                void union(int a, int b) {
                    int ra = find(a), rb = find(b);
                    if (ra == rb) return;
                    if (size[ra] < size[rb]) { int t = ra; ra = rb; rb = t; }                // union by size
                    parent[rb] = ra;
                    size[ra] += size[rb];
                }
            }

            static final Comparator<List<String>> ROWS = Comparator.comparing((List<String> r) -> r.get(0)).thenComparing(r -> r.get(1));

            static List<List<String>> merge(List<List<String>> accounts) {
                Dsu dsu = new Dsu(accounts.size());
                Map<String, Integer> owner = new HashMap<>();            // e-mail -> first account that had it
                for (int i = 0; i < accounts.size(); i++) {
                    List<String> acc = accounts.get(i);
                    for (String email : acc.subList(1, acc.size())) {
                        Integer j = owner.putIfAbsent(email, i);
                        if (j != null) dsu.union(i, j);
                    }
                }
                Map<Integer, TreeSet<String>> byRoot = new HashMap<>();
                owner.forEach((email, i) -> byRoot.computeIfAbsent(dsu.find(i), k -> new TreeSet<>()).add(email));
                List<List<String>> out = new ArrayList<>();
                byRoot.forEach((root, emails) -> {
                    List<String> row = new ArrayList<>(List.of(accounts.get(root).get(0)));
                    row.addAll(emails);
                    out.add(row);
                });
                out.sort(ROWS);
                return out;
            }

            // reference: BFS over the e-mail graph
            static List<List<String>> mergeByBfs(List<List<String>> accounts) {
                Map<String, List<String>> graph = new HashMap<>();
                Map<String, String> nameOf = new HashMap<>();
                for (List<String> acc : accounts) {
                    String first = acc.get(1);
                    for (String e : acc.subList(1, acc.size())) {
                        graph.computeIfAbsent(e, k -> new ArrayList<>()).add(first);
                        graph.computeIfAbsent(first, k -> new ArrayList<>()).add(e);
                        nameOf.put(e, acc.get(0));
                    }
                }
                Set<String> seen = new HashSet<>();
                List<List<String>> out = new ArrayList<>();
                for (String start : graph.keySet()) {
                    if (!seen.add(start)) continue;
                    TreeSet<String> comp = new TreeSet<>();
                    Deque<String> q = new ArrayDeque<>(List.of(start));
                    while (!q.isEmpty()) {
                        String e = q.poll();
                        comp.add(e);
                        for (String n : graph.get(e)) if (seen.add(n)) q.add(n);
                    }
                    List<String> row = new ArrayList<>(List.of(nameOf.get(start)));
                    row.addAll(comp);
                    out.add(row);
                }
                out.sort(ROWS);
                return out;
            }

            public static void main(String[] args) {
                System.out.println(merge(List.of(
                        List.of("John", "johnsmith@mail.com", "john_newyork@mail.com"),
                        List.of("John", "johnsmith@mail.com", "john00@mail.com"),
                        List.of("Mary", "mary@mail.com"),
                        List.of("John", "johnnybravo@mail.com"))));
                System.out.println(merge(List.of(List.of("Asha", "a@x.com", "b@x.com"),
                        List.of("Asha", "c@x.com", "d@x.com"), List.of("Asha", "b@x.com", "c@x.com"))));   // transitive

                Random rnd = new Random(721);
                String[] names = {"Asha", "Bala", "Chen"};
                for (int t = 0; t < 500; t++) {
                    List<List<String>> accs = new ArrayList<>();
                    for (int i = rnd.nextInt(12) + 1; i > 0; i--) {
                        int person = rnd.nextInt(6);
                        List<String> acc = new ArrayList<>(List.of(names[person % 3]));
                        for (int k = rnd.nextInt(3) + 1; k > 0; k--) acc.add("p" + person + "-" + rnd.nextInt(5) + "@x.com");
                        accs.add(acc);
                    }
                    if (!merge(accs).equals(mergeByBfs(accs))) throw new AssertionError(accs);
                }
                System.out.println("500 random inputs: union-find matches BFS");
            }
        }`, out: code`
        [[John, john00@mail.com, john_newyork@mail.com, johnsmith@mail.com], [John, johnnybravo@mail.com], [Mary, mary@mail.com]]
        [[Asha, a@x.com, b@x.com, c@x.com, d@x.com]]
        500 random inputs: union-find matches BFS` },
      pitfalls: [
        "Merging only accounts that share an e-mail **directly** and missing transitive links (A–B and B–C means A–C).",
        "Using the name as a key: two different people may share a name.",
        "Forgetting to sort the e-mails within each person, or emitting the same e-mail twice.",
        "A `find` without path compression (or a recursive one on long chains) degrades badly on adversarial input."
      ],
      followUps: [
        { q: "Accounts arrive continuously from imports. Keep the merged view up to date.",
          a: "Union-find is naturally incremental: a new account unions with the current owners of its e-mails in almost constant time per e-mail, so the merged view never needs a full rebuild. Persist the e-mail → account mapping and the parent pointers, or recompute components periodically from the raw data as a safety check. A BFS solution, by contrast, would recompute everything." },
        { q: "A user removes an e-mail, which may split one person into two.",
          a: "Union-find cannot split sets. Rebuild just the affected component: collect its accounts, drop the removed e-mail, and recompute connectivity with BFS or a fresh union-find — components are small in practice. General dynamic connectivity with deletions is a hard problem; real systems recompute locally or periodically." },
        { q: "Do it for 500 million accounts.",
          a: "Use distributed connected components: iterative label propagation (each node adopts the smallest label among its neighbours until nothing changes) on Spark or a similar engine, or partitioned union-find with merge rounds. Filter out very high-degree e-mails such as `noreply@…` or shared family addresses first — otherwise they glue millions of unrelated accounts into one giant component." }
      ],
      rubric: [
        "Recognises connected components and explains the transitivity.",
        "Implements union-find with path compression and union by size or rank (or a correct BFS).",
        "Handles sorting, duplicate e-mails and same-name different-person cases.",
        "Discusses incremental updates and the deletion problem.",
        "Has a credible plan for very large inputs."
      ],
      notes: [
        "The union-find version and the BFS version are compared on 500 random inputs, including people who share a name and transitive chains — the same differential-testing habit used throughout this course.",
        "`putIfAbsent` returns the previous owner of an e-mail, which makes the union step one line: if the e-mail was already seen, union the current account with its first owner.",
        "This exact problem appears in identity resolution for real products: merging user profiles, deduplicating customers in a CRM, linking payment methods to one person for fraud checks."
      ]
    },
    {
      type: 'design',
      title: 'Design round: Splitwise (low-level design / machine coding)',
      lead: 'A 90-minute machine-coding favourite: model users, groups, expenses and splits, keep the money exact, and make new split types easy to add.',
      kind: 'LLD', difficulty: 'Hard', minutes: 90,
      prompt: "Implement the core of Splitwise: users and groups; expenses paid by one user and split EQUAL, EXACT or PERCENT; a view of who owes whom; and settling up. The code must be correct with money, extensible to new split types, and testable.",
      stages: [
        { t: 'Requirements and scope', ask: 'What do you confirm before writing code?', points: [
          "Split types now: EQUAL, EXACT amounts, PERCENT; later possibly SHARES or *by item*.",
          "Validation rules: exact amounts must add up to the total; percentages to 100; at least one participant.",
          "Money: two decimal places for INR; who absorbs rounding remainders; one currency per group for now.",
          "Out of scope for the round: authentication, notifications, multi-currency, debt simplification (Session 13) — but leave room for them."
        ] },
        { t: 'Entities and relationships', ask: 'Which classes hold data, and which hold behaviour?', diagram: { kind: 'erd', entities: [
          { n: 'User', f: ['id', 'name', 'email'], tone: 'blue' },
          { n: 'Group', f: ['id', 'name', 'members'], tone: 'green' },
          { n: 'Expense', f: ['id', 'paidBy', 'total', 'type', 'createdAt'], tone: 'orange' },
          { n: 'Split', f: ['user', 'amount'], tone: 'yellow' },
          { n: 'Settlement', f: ['from', 'to', 'amount'], tone: 'purple' }
        ], rels: ['Group 1 — * Expense', 'Expense 1 — * Split', 'Group * — * User (members)', 'Group 1 — * Settlement'] }, points: [
          "`Split` and `Settlement` are value objects (records); `Expense` is immutable once created — edits are reversals plus new expenses.",
          "A `BalanceSheet` (or ledger service) owns the balances; entities do not update each other's state."
        ] },
        { t: 'Split strategies and the money rules', ask: 'How do you add a new split type without touching existing code?', points: [
          "**Strategy pattern**: `SplitStrategy.split(total, users, inputs)` returns exact shares; a map from `SplitType` to strategy replaces `switch` statements.",
          "Each strategy validates its inputs and guarantees **shares sum to the total** — the equal split distributes leftover paise, the percent split lets the last share absorb the rounding.",
          "Balances are pairwise: `balances[a][b] > 0` means *b owes a*; every adjustment updates both directions, so the sheet is always antisymmetric."
        ], code: { lang: 'java', file: 'SplitwiseCore.java', src: code`
          import java.math.BigDecimal;
          import java.math.RoundingMode;
          import java.util.*;

          public class SplitwiseCore {
              enum SplitType { EQUAL, EXACT, PERCENT }
              record Split(String user, BigDecimal amount) {}

              /** Strategy: turns (total, participants, inputs) into exact shares that sum to the total. */
              interface SplitStrategy { List<Split> split(BigDecimal total, List<String> users, List<BigDecimal> inputs); }

              static final Map<SplitType, SplitStrategy> STRATEGIES = Map.of(
                  SplitType.EQUAL, (total, users, in) -> {
                      BigDecimal base = total.divide(BigDecimal.valueOf(users.size()), 2, RoundingMode.DOWN);
                      int extra = total.subtract(base.multiply(BigDecimal.valueOf(users.size()))).movePointRight(2).intValueExact();
                      List<Split> out = new ArrayList<>();
                      for (int i = 0; i < users.size(); i++) out.add(new Split(users.get(i), i < extra ? base.add(new BigDecimal("0.01")) : base));
                      return out;
                  },
                  SplitType.EXACT, (total, users, in) -> {
                      if (in.stream().reduce(BigDecimal.ZERO, BigDecimal::add).compareTo(total) != 0)
                          throw new IllegalArgumentException("exact shares must add up to " + total);
                      List<Split> out = new ArrayList<>();
                      for (int i = 0; i < users.size(); i++) out.add(new Split(users.get(i), in.get(i)));
                      return out;
                  },
                  SplitType.PERCENT, (total, users, in) -> {
                      if (in.stream().reduce(BigDecimal.ZERO, BigDecimal::add).compareTo(new BigDecimal("100")) != 0)
                          throw new IllegalArgumentException("percentages must add up to 100");
                      List<Split> out = new ArrayList<>();
                      BigDecimal assigned = BigDecimal.ZERO;
                      for (int i = 0; i < users.size(); i++) {
                          BigDecimal share = i == users.size() - 1 ? total.subtract(assigned)     // last share absorbs rounding
                                  : total.multiply(in.get(i)).divide(new BigDecimal("100"), 2, RoundingMode.HALF_EVEN);
                          assigned = assigned.add(share);
                          out.add(new Split(users.get(i), share));
                      }
                      return out;
                  });

              private final Map<String, Map<String, BigDecimal>> balances = new TreeMap<>();   // [a][b] > 0: b owes a

              void addExpense(String paidBy, BigDecimal total, SplitType type, List<String> users, List<BigDecimal> inputs) {
                  for (Split s : STRATEGIES.get(type).split(total, users, inputs)) {
                      if (!s.user().equals(paidBy)) adjust(paidBy, s.user(), s.amount());
                  }
              }

              void settle(String from, String to, BigDecimal amount) { adjust(to, from, amount.negate()); }

              private void adjust(String creditor, String debtor, BigDecimal amount) {
                  balances.computeIfAbsent(creditor, k -> new TreeMap<>()).merge(debtor, amount, BigDecimal::add);
                  balances.computeIfAbsent(debtor, k -> new TreeMap<>()).merge(creditor, amount.negate(), BigDecimal::add);
              }

              List<String> whoOwesWhom() {
                  List<String> out = new ArrayList<>();
                  balances.forEach((creditor, row) -> row.forEach((debtor, amt) -> {
                      if (amt.signum() > 0) out.add(debtor + " owes " + creditor + " " + amt);
                  }));
                  return out;
              }

              public static void main(String[] args) {
                  SplitwiseCore app = new SplitwiseCore();
                  List<String> trip = List.of("asha", "bala", "chen");
                  app.addExpense("asha", new BigDecimal("900.00"), SplitType.EQUAL, trip, List.of());
                  app.addExpense("bala", new BigDecimal("600.00"), SplitType.EXACT, trip,
                          List.of(new BigDecimal("100.00"), new BigDecimal("200.00"), new BigDecimal("300.00")));
                  app.addExpense("chen", new BigDecimal("100.00"), SplitType.PERCENT, trip,
                          List.of(new BigDecimal("33.33"), new BigDecimal("33.33"), new BigDecimal("33.34")));
                  app.whoOwesWhom().forEach(System.out::println);
                  app.settle("chen", "asha", new BigDecimal("166.67"));
                  System.out.println("after chen pays asha 166.67: " + app.whoOwesWhom());
                  try {
                      app.addExpense("asha", new BigDecimal("50.00"), SplitType.EXACT, trip,
                              List.of(new BigDecimal("10.00"), new BigDecimal("10.00"), new BigDecimal("10.00")));
                  } catch (IllegalArgumentException e) {
                      System.out.println("rejected: " + e.getMessage());
                  }
              }
          }`, out: code`
          bala owes asha 200.00
          chen owes asha 266.67
          chen owes bala 266.67
          after chen pays asha 166.67: [bala owes asha 200.00, chen owes asha 100.00, chen owes bala 266.67]
          rejected: exact shares must add up to 50.00` } },
        { t: 'Balances, settle-up and invariants', ask: 'How do you know the balance sheet is always right?', points: [
          "Invariants: every expense's shares sum to its total; for every pair, `balances[a][b] == -balances[b][a]`; all members' net balances sum to zero.",
          "Settle-up is just another adjustment in the opposite direction, recorded as a `Settlement` for the history.",
          "Simplifying debts (fewer transfers) is a separate, pluggable step — Session 13 covers why the optimal version is NP-hard."
        ] },
        { t: 'Concurrency, persistence and extensibility', ask: 'Two members add expenses at the same moment, and the product wants SHARES splits next month. What changes?', points: [
          "Persistence: `expense` + `expense_split` tables written in one transaction; balances either computed on read or updated atomically in the same transaction (previous slide).",
          "Concurrency: atomic SQL updates or optimistic locking on the group; an idempotency key per expense for client retries.",
          "New split type = one new strategy class plus one map entry; nothing else changes (open/closed principle).",
          "Tests: unit tests per strategy (rounding cases), property-based tests for the invariants, and an end-to-end test of the example above."
        ] }
      ],
      followUps: [
        { q: "How would you support editing an expense after balances were computed?",
          a: "Never update history in place: record a reversal of the old expense (negated shares applied to the balances) and then the corrected expense, both in one transaction, keeping an audit trail of who changed what. With computed-on-read balances, editing simply changes the rows and the next read is correct — another argument for starting simple." },
        { q: "Add multi-currency groups.",
          a: "Store each expense's original amount and currency, the FX rate and its timestamp, and the amount converted into the group's base currency. Show balances in the base currency, but let users settle in any currency at the rate of the settlement moment, recording any rounding difference explicitly. Never re-convert historical expenses with today's rate." },
        { q: "Groups can have 1,000 members (a company offsite). What breaks?",
          a: "Pairwise balances grow to about 500,000 pairs per group, and *who owes whom* output becomes useless. Switch to one net balance per member — computed from the shares — and generate a short list of settlement transfers with a greedy simplification (Session 13). Paginate expense history and index splits by user." }
      ],
      rubric: [
        "Clarifies split rules, validation and rounding before coding.",
        "Clean model: immutable value objects, a strategy per split type, balances owned by one component.",
        "Exact money handling: BigDecimal, explicit rounding, shares always sum to the total.",
        "States and tests invariants (antisymmetric pairs, zero-sum group).",
        "Working code with a demonstration or tests, plus a sensible persistence and concurrency story."
      ],
      notes: [
        "The core in stage 3 is compiled and run by the course test suite. Check the numbers by hand once: asha's ₹900 split three ways makes bala and chen owe her 300 each; bala's exact split and chen's percent split then net against those, leaving bala owing asha 200.00 and chen owing asha and bala 266.67 each.",
        "Machine-coding rounds are graded on running code, structure and extensibility in that order. Get the EQUAL split and the balance view working end to end before adding the other strategies.",
        "Typical deductions: `double` amounts, a `switch` over split types in several places, validation scattered across classes, and no way to show who owes whom after a settlement."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: money, Splitwise design & data modelling',
      lead: 'Questions about correctness under real-world conditions — rounding, retries, concurrency and audits.',
      qa: [
        { level: 1, q: "Why is `double` wrong for money, and what do you use instead in Java and in MySQL?",
          a: "`double` is binary floating point: most decimal fractions (0.1, 0.2) have no exact binary representation, so arithmetic produces values like 0.30000000000000004, and repeated additions drift. Money needs exact decimal arithmetic. In Java use `BigDecimal` (built from strings or `BigDecimal.valueOf`) with explicit scale and rounding, or integer minor units (`long` paise) when all amounts share one currency's precision. In MySQL use `DECIMAL(19,4)` (or `DECIMAL(19,2)` per your precision needs) or `BIGINT` minor units — never `FLOAT` or `DOUBLE`. Keep the currency alongside the amount.",
          follow: ["When are integer minor units better than `BigDecimal`?"] },
        { level: 2, q: "How do you split ₹100 among three people so the parts add up exactly? What about percentages?",
          a: "Divide with the currency's scale and round **down**: 33.33 each, totalling 99.99; the remaining 0.01 goes to the first participant (or by a documented rule, such as the payer or a rotating member), giving 33.34 + 33.33 + 33.33 — the largest-remainder method. For percentages, compute each share with an explicit rounding mode (for example `HALF_EVEN`) and let the last share be *total minus the sum of the others*, so rounding never creates or destroys money. Either way, validate the inputs first (percentages sum to 100, exact shares sum to the total) and test the property *shares always sum to the total*.",
          follow: ["Who should absorb the extra paisa, and why does it matter to users?"] },
        { level: 2, q: "Should balances be computed on read or stored? Discuss the trade-offs.",
          a: "**Computed on read** — `SUM` over expense splits and settlements with an index on `(group_id, user_id)` — is always correct and has nothing to keep in sync; it is fast enough for typical group sizes and histories. **Stored balances** make reads O(1) but add write-path complexity: they must be updated in the same transaction as each expense, with atomic `amount = amount + ?` updates to avoid lost updates, consistent lock ordering to avoid deadlocks, and a reconciliation job to detect drift. **Event-sourced** ledgers with snapshots give full history and auditability at the cost of more infrastructure. I would start with computing on read, measure, and materialise only when the numbers demand it.",
          follow: ["How would you migrate from computed to stored balances without downtime?"] },
        { level: 2, q: "Design the database schema for expenses with splits. Which constraints belong in the database?",
          a: "`expense(id, group_id, paid_by, total DECIMAL(19,2), currency CHAR(3), split_type, idempotency_key, created_at, created_by)`, `expense_split(expense_id, user_id, amount DECIMAL(19,2), PRIMARY KEY (expense_id, user_id))`, `settlement(id, group_id, from_user, to_user, amount, created_at)`, plus `group_member(group_id, user_id)`. In the database: foreign keys, `NOT NULL`, `CHECK (amount >= 0)`, the composite primary key (no duplicate participant), a **unique index on `(group_id, idempotency_key)`**, and indexes for the read paths (`expense(group_id, created_at)`, `expense_split(user_id)`). The rule *splits sum to the total* spans rows, so it is enforced in the application inside the same transaction (or with a trigger) and verified by a reconciliation query.",
          follow: ["Why keep `split_type` if the split amounts are stored anyway?"] },
        { level: 2, q: "How do you make *add expense* idempotent and safe when two members add expenses to the same group at once?",
          a: "Idempotency: the client generates an `Idempotency-Key` per expense and resends it on retry; a unique index on `(group_id, idempotency_key)` makes the second insert fail, and the service returns the original expense instead of creating a duplicate. Concurrency: inserting different expenses never conflicts; conflicts only arise if you maintain stored balances — then update balance rows with atomic SQL (`UPDATE … SET amount = amount + :x WHERE …`) inside the same transaction, locking pairs in a consistent order, or use optimistic locking on a group version and retry. The expense and its splits are inserted in one transaction so readers never see a half-created expense.",
          follow: ["What does the client do if the response to the first request was lost?"] },
        { level: 2, q: "Which `BigDecimal` pitfalls do interviewers ask about?",
          a: "(1) `new BigDecimal(0.1)` captures the exact binary double (0.1000000000000000055…); use `new BigDecimal(\"0.1\")` or `BigDecimal.valueOf(0.1)`. (2) `equals` compares scale — `2.0` is not equal to `2.00` — so use `compareTo` for amounts, and remember that a `HashSet` and a `TreeSet` of the same values can have different sizes. (3) `divide` without a scale throws `ArithmeticException` for non-terminating results such as 1 ÷ 3; always pass a scale and `RoundingMode` (or a `MathContext`). (4) It is immutable — `amount.add(x)` returns a new object, so forgetting to assign the result silently does nothing. (5) Normalise scale before storing or comparing as strings.",
          follow: ["Why might `stripTrailingZeros()` surprise you?"] },
        { level: 3, q: "Multi-currency groups: how do you model expenses and balances when members pay in INR, USD and EUR?",
          a: "Store each expense in its **original currency and amount**, plus the FX rate, its source and timestamp, and the amount converted into the group's **base currency** using that rate. Balances are kept (or computed) in the base currency, so they remain comparable; optionally show each member the original amounts as well. Settlements can be made in any currency at the rate of the settlement moment, with any rounding difference recorded explicitly rather than hidden. Never recompute history with today's rate — it would silently change what people owe. Rates should come from one service with caching, and conversions should round once, at a defined step, with a documented rounding mode.",
          follow: ["Should a balance shown to a user change when exchange rates move?"] },
        { level: 3, q: "Design the double-entry ledger behind Splitwise balances. Why are entries immutable?",
          a: "Each financial event becomes a journal transaction with two or more **entries** (legs) whose amounts sum to zero — for an expense, the payer's account is credited and each participant's account is debited by their share. Entries are append-only and reference the business event (expense id, settlement id). A balance is the sum of an account's entries — indexed, cached or snapshotted for speed. Immutability gives you an audit trail (what was known, when), makes concurrent writes conflict-free (appends rather than updates), and makes errors fixable without losing history: a correction is a reversing transaction plus a new one. Reconciliation checks that every transaction sums to zero and that cached balances equal the sum of entries.",
          follow: ["How do you show a balance as it was on a past date?"] },
        { level: 2, q: "Which design patterns would you use in a Splitwise LLD round, and why?",
          a: "**Strategy** for split types — each type encapsulates its validation and share computation, and adding SHARES later is one class. A **factory** (or a map from type to strategy) to pick the strategy, instead of `switch` statements spread around. **Value objects** (records) for `Money`, `Split` and `Settlement`, immutable and comparable. A **repository** interface for persistence so the core can run in memory in the round and on JPA later. **Observer** or domain events for notifications (e-mail when an expense is added) so the core does not depend on messaging. Avoid a god class: keep balance computation in one component, separate from expense creation.",
          follow: ["Where would the Command pattern help?"] },
        { level: 2, q: "How would you test the money logic thoroughly?",
          a: "Unit tests per split strategy with the nasty cases: amounts that do not divide evenly, one participant, many participants, percentages with rounding, invalid inputs. Compare amounts with `compareTo` (or `isEqualByComparingTo` in AssertJ), not `equals`. **Property-based tests** generate random expenses and assert invariants: shares sum to the total, balances are antisymmetric, all balances sum to zero, and a full settle-up leaves every balance at zero. Mutation testing (PIT) checks that the tests actually catch changed rounding modes or off-by-one errors. Integration tests verify the schema constraints and the idempotency key against a real MySQL in Testcontainers.",
          follow: ["What would a mutation-testing tool change in a split strategy, and would your tests catch it?"] }
      ],
      notes: [
        "Money questions reward precision: say *HALF_EVEN with scale 2, remainder to the first participant* rather than *I'd round it*.",
        "For the design questions, start simple (compute balances on read) and name the trigger for adding complexity. Interviewers penalise unjustified event sourcing as much as missing transactions.",
        "The ledger question is common at fintech companies and payment teams in big tech; the key words are *append-only*, *sum to zero* and *reversal*."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.math.BigDecimal;
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                List<BigDecimal> xs = List.of(new BigDecimal("2.0"), new BigDecimal("2.00"), new BigDecimal("2"));
                System.out.println(new HashSet<>(xs).size() + " " + new TreeSet<>(xs).size());
            }
        }`, out: '3 1' },
      options: ['`1 1`', '`3 3`', '`3 1`', '`1 3`'], answer: 2,
      why: "`HashSet` uses `equals`, which compares scale, so `2.0`, `2.00` and `2` are three different elements. `TreeSet` uses `compareTo`, which compares values only, so it keeps one." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.math.*;

        public class Main {
            public static void main(String[] args) {
                try {
                    System.out.println(BigDecimal.ONE.divide(BigDecimal.valueOf(3)));
                } catch (ArithmeticException e) {
                    System.out.println("ArithmeticException");
                }
                System.out.println(BigDecimal.ONE.divide(BigDecimal.valueOf(3), 4, RoundingMode.HALF_EVEN));
            }
        }`, out: code`
        ArithmeticException
        0.3333` },
      options: ['`0.3333333333 0.3333`', '`ArithmeticException 0.3333`', '`0 0.3333`', '`0.33 0.3333`'], answer: 1,
      why: "Without a scale, `divide` must return the exact result; 1/3 has no terminating decimal expansion, so it throws. Passing a scale and rounding mode makes the result well defined." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.math.*;

        public class Main {
            public static void main(String[] args) {
                System.out.println(new BigDecimal("0.125").setScale(2, RoundingMode.HALF_EVEN) + " "
                        + new BigDecimal("0.135").setScale(2, RoundingMode.HALF_EVEN));
            }
        }`, out: '0.12 0.14' },
      options: ['`0.13 0.14`', '`0.12 0.14`', '`0.12 0.13`', '`0.13 0.13`'], answer: 1,
      why: "HALF_EVEN rounds an exact half towards the even neighbour: 0.125 → 0.12 (2 is even) and 0.135 → 0.14 (3 is odd, so it rounds up to 4)." },
    { level: 3, q: "In a union-find **without** path compression or union by rank, what is the worst-case cost of a single `find`?",
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(α(n))'], answer: 2,
      why: "Unions can build a chain of n nodes, and `find` walks the whole chain. Union by rank alone bounds it to O(log n); with path compression as well, the amortised cost is O(α(n))." },
    { level: 3, q: "Balances live in `balance(group_id, debtor, creditor, amount)` and are updated in the same transaction as each expense. Two expenses for the same pair commit concurrently. What prevents a lost update?",
      options: ['An atomic `UPDATE balance SET amount = amount + ? WHERE …`, so the database row lock serialises the two changes', 'Nothing is needed — the two transactions are independent', 'Storing the amount as `double`', 'Recomputing all balances once a night'], answer: 0,
      why: "A read-modify-write in Java can overwrite the other transaction's change. Letting the database apply `amount + ?` under its row lock (or using optimistic locking) keeps both updates." }
  ]
});
