/* Interview pack — Session 13: Splitwise part 2 (expense flows, balances & group management) */
COURSE.prep(13, {
  deepDives: [
    {
      title: 'Deep dive: debt simplification — why the optimum is NP-hard and what to ship',
      lead: 'The two-heap greedy from this session is what most apps ship. Interviewers love to ask whether it is optimal — it is not, and the reason is a classic hardness result.',
      points: [
        "Reduce the group to **net balances** (positive = is owed, negative = owes). Any settlement only has to bring these to zero, so the expense history no longer matters.",
        "k non-zero balances can always be settled with **at most k − 1 transfers**: each transfer fully settles at least one person, and the last one settles two. The two-heap greedy (largest creditor ↔ largest debtor) achieves this bound.",
        "The **minimum** is `k − m`, where m is the largest number of disjoint subgroups whose balances each sum to zero — a zero-sum subgroup of size s needs exactly s − 1 transfers.",
        "Finding m is **NP-hard** (it contains subset-sum: deciding whether any proper subgroup sums to zero), so exact algorithms are exponential — a DP over bitmasks in O(2ᵏ · k) is practical up to about k = 20.",
        "Greedy can lose: with balances A +7, B +6, C −6, D −4, E −3 it uses 4 transfers, while {A, D, E} and {B, C} settle separately in 3.",
        "In practice: greedy for everyone, an optional exact pass for small groups, deterministic tie-breaking so the suggested plan does not change between page loads, and constraints such as *only pay people you share expenses with*."
      ],
      table: { head: ['Step', 'Greedy (largest creditor ↔ largest debtor)', 'Optimal (zero-sum subgroups)'], rows: [
        ['1', 'C pays A 6 → A still owed 1', '{B, C}: C pays B 6'],
        ['2', 'D pays B 4 → B still owed 2', '{A, D, E}: D pays A 4'],
        ['3', 'E pays B 2 → E still owes 1', '{A, D, E}: E pays A 3'],
        ['4', 'E pays A 1', '—'],
        ['Total', '4 transfers', '3 transfers']
      ] },
      callout: { kind: 'interview', text: "A strong answer to *is your settle-up optimal?*: *No — minimising transfers is NP-hard because it requires partitioning balances into zero-sum groups. Greedy guarantees at most k − 1, I can compute the exact optimum for small groups with a bitmask DP, and here is a counterexample where greedy loses.*" },
      notes: [
        "Why is `k − m` the optimum? The transfers of any plan form a graph whose connected components must each have a zero total — money only moves inside a component — and a component with s people needs at least s − 1 transfers. A plan with c components therefore uses at least k − c transfers, and c can be at most m. Settling each zero-sum subgroup with a simple chain achieves exactly k − m.",
        "The hardness argument in one sentence: deciding whether the minimum is less than k − 1 is the same as deciding whether some proper, non-empty subgroup has zero total — a subset-sum question.",
        "The coding round on this slide's topic (LeetCode 465) computes the exact optimum with a bitmask DP and checks it against brute-force backtracking and the greedy on random cases."
      ]
    }
  ],

  stretch: [
    "Offer `?optimal=true` on the settle-up endpoint: use the exact bitmask DP for groups with at most 15 non-zero balances and the greedy above that; measure the latency at 15 members.",
    "Write a property-based test: for random balances, the plan zeroes every balance, uses at most k − 1 transfers, and equals the exact optimum when k ≤ 8.",
    "Add a foreign key from `expense_split (group_id, user_id)` to `group_member (group_id, user_id)` and prove with a concurrent test that a member removed mid-request can never receive a split."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: optimal account balancing (minimum transfers)',
      lead: 'LeetCode 465 — a hard problem that combines a modelling step (net balances), a proof (k − 1 and zero-sum groups) and an exponential but practical DP.',
      difficulty: 'Hard', minutes: 45, lc: 465, pattern: ['bitmask', 'dp', 'backtracking', 'greedy'],
      problem: [
        "You are given transactions `[from, to, amount]`, meaning person `from` paid `amount` on behalf of person `to` — so `to` now owes `from` that amount.",
        "Return the **minimum number of transfers** needed so that nobody owes anybody. Then explain why the two-heap greedy is not always optimal."
      ],
      examples: [
        { in: '[[0,1,10],[2,0,5]]', out: '2', why: "Person 0 is owed 5 net, person 1 owes 10, person 2 is owed 5: two transfers from person 1." },
        { in: '[[0,1,10],[1,0,1],[1,2,5],[2,0,5]]', out: '1', why: "Only person 1 owes (4) and only person 0 is owed (4)." },
        { in: 'net balances A +7, B +6, C −6, D −4, E −3', out: '3', why: "{B, C} and {A, D, E} are zero-sum groups; greedy needs 4." }
      ],
      constraints: ["At most 20 people end up with a non-zero balance", "Amounts are positive integers that fit comfortably in an `int`", "`from != to`"],
      hints: [
        "Only net balances matter. Compute each person's balance and drop the zeros.",
        "k non-zero balances can always be settled with k − 1 transfers. When can you do better? Think about subgroups whose balances sum to zero.",
        "Answer = k − (maximum number of disjoint zero-sum subgroups). With k ≤ 20 a DP over bitmasks finds it: `dp[mask] = max over i in mask of dp[mask without i]`, plus 1 when the sum of `mask` is zero."
      ],
      approaches: [
        { name: 'Two-heap greedy', idea: 'Repeatedly settle the largest creditor with the largest debtor', time: 'O(k log k)', space: 'O(k)' },
        { name: 'Backtracking', idea: 'Settle the first non-zero balance against each opposite-signed one, recurse, prune perfect matches', time: 'O((k − 1)!) worst case', space: 'O(k)' },
        { name: 'Bitmask DP', idea: 'Maximum number of zero-sum groups over all subsets; answer = k − dp[all]', time: 'O(2ᵏ · k)', space: 'O(2ᵏ)' }
      ],
      code: { lang: 'java', file: 'OptimalBalancing.java', src: code`
        import java.util.*;

        public class OptimalBalancing {
            /** Net balance per person: positive = is owed, negative = owes. Zero balances are dropped. */
            static int[] balances(int[][] tx) {
                Map<Integer, Integer> net = new TreeMap<>();
                for (int[] t : tx) { net.merge(t[0], t[2], Integer::sum); net.merge(t[1], -t[2], Integer::sum); }
                return net.values().stream().filter(v -> v != 0).mapToInt(Integer::intValue).toArray();
            }

            /** Exact: k - (max number of disjoint zero-sum groups). Bitmask DP, O(2^k * k). */
            static int minTransfers(int[] b) {
                int k = b.length, full = (1 << k) - 1;
                int[] sum = new int[1 << k], dp = new int[1 << k];
                for (int mask = 1; mask <= full; mask++) {
                    sum[mask] = sum[mask & (mask - 1)] + b[Integer.numberOfTrailingZeros(mask)];
                    int best = 0;
                    for (int rest = mask; rest != 0; rest &= rest - 1) {
                        best = Math.max(best, dp[mask ^ (rest & -rest)]);       // drop one member
                    }
                    dp[mask] = best + (sum[mask] == 0 ? 1 : 0);                 // mask closes a zero-sum group
                }
                return k - dp[full];
            }

            /** Reference: classic backtracking with the perfect-match pruning. */
            static int backtrack(int[] b, int start) {
                while (start < b.length && b[start] == 0) start++;
                if (start == b.length) return 0;
                int best = Integer.MAX_VALUE;
                for (int i = start + 1; i < b.length; i++) {
                    if ((long) b[i] * b[start] < 0) {                        // opposite signs only
                        b[i] += b[start];
                        best = Math.min(best, 1 + backtrack(b, start + 1));
                        b[i] -= b[start];
                        if (b[i] + b[start] == 0) break;                     // a perfect match cannot be beaten
                    }
                }
                return best;
            }

            /** Greedy: largest creditor with largest debtor. At most k - 1 transfers, not always optimal. */
            static List<String> greedy(int[] b, String[] names) {
                Comparator<int[]> byAmount = (x, y) -> Integer.compare(y[0], x[0]);
                PriorityQueue<int[]> creditors = new PriorityQueue<>(byAmount), debtors = new PriorityQueue<>(byAmount);
                for (int i = 0; i < b.length; i++) {
                    if (b[i] > 0) creditors.add(new int[] {b[i], i});
                    if (b[i] < 0) debtors.add(new int[] {-b[i], i});
                }
                List<String> plan = new ArrayList<>();
                while (!creditors.isEmpty()) {
                    int[] c = creditors.poll(), d = debtors.poll();
                    int amt = Math.min(c[0], d[0]);
                    plan.add((names == null ? "P" + d[1] : names[d[1]]) + "->" + (names == null ? "P" + c[1] : names[c[1]]) + " " + amt);
                    if (c[0] > amt) creditors.add(new int[] {c[0] - amt, c[1]});
                    if (d[0] > amt) debtors.add(new int[] {d[0] - amt, d[1]});
                }
                return plan;
            }

            public static void main(String[] args) {
                System.out.println(minTransfers(balances(new int[][] {{0, 1, 10}, {2, 0, 5}})));
                System.out.println(minTransfers(balances(new int[][] {{0, 1, 10}, {1, 0, 1}, {1, 2, 5}, {2, 0, 5}})));

                String[] names = {"A", "B", "C", "D", "E"};
                int[] b = {7, 6, -6, -4, -3};
                List<String> plan = greedy(b, names);
                System.out.println("greedy: " + plan.size() + " transfers " + plan);
                System.out.println("optimal: " + minTransfers(b) + " transfers ({A,D,E} and {B,C} settle separately)");

                Random rnd = new Random(465);
                for (int t = 0; t < 300; t++) {
                    int[][] tx = new int[1 + rnd.nextInt(8)][];
                    for (int i = 0; i < tx.length; i++) {
                        int from = rnd.nextInt(8), to = (from + 1 + rnd.nextInt(7)) % 8;
                        tx[i] = new int[] {from, to, 1 + rnd.nextInt(20)};
                    }
                    int[] bal = balances(tx);
                    int dp = minTransfers(bal), bt = backtrack(bal.clone(), 0), gr = greedy(bal, null).size();
                    if (dp != bt || gr < dp || gr > Math.max(0, bal.length - 1)) throw new AssertionError(Arrays.deepToString(tx));
                }
                System.out.println("300 random cases: DP == backtracking <= greedy <= k - 1");
            }
        }`, out: code`
        2
        1
        greedy: 4 transfers [C->A 6, D->B 4, E->B 2, E->A 1]
        optimal: 3 transfers ({A,D,E} and {B,C} settle separately)
        300 random cases: DP == backtracking <= greedy <= k - 1` },
      pitfalls: [
        "Assuming the two-heap greedy is optimal — the counterexample above disproves it.",
        "Working on raw transactions instead of net balances: the history is irrelevant once balances are known.",
        "Overflow when summing large amounts across many members — use `long` in production.",
        "Running the exponential algorithm on a 200-member group: guard it with a size limit and fall back to greedy."
      ],
      followUps: [
        { q: "A company group has 200 members with non-zero balances. What do you compute?",
          a: "Exact search is out of the question (2²⁰⁰ subsets). Run the greedy, which guarantees at most k − 1 transfers, after a cheap pre-pass that pairs exact opposites (+50 with −50) and then small zero-sum triples — those exact matches deliver most of the savings in practice. Make tie-breaking deterministic (by user id) so the plan is stable." },
        { q: "Members only want to pay people they already shared an expense with.",
          a: "The transfers must use edges of a *who-knows-whom* graph, which makes it a flow problem: find a flow on allowed edges that brings every balance to zero (min-cost flow finds a feasible plan with small amounts). Minimising the *number* of edges carrying flow remains NP-hard, so use the flow solution plus heuristics, and fall back to a mediator when no feasible plan exists." },
        { q: "Prove that the greedy never needs more than k − 1 transfers.",
          a: "Each transfer moves `min(creditor, debtor)`, so at least one of the two reaches zero and leaves the problem. After at most k − 2 such transfers two people remain with equal and opposite balances, and one final transfer settles both — k − 1 in total." }
      ],
      rubric: [
        "Reduces the problem to net balances before anything else.",
        "Explains the k − 1 upper bound and the zero-sum-subgroup characterisation of the optimum.",
        "Implements an exact algorithm (bitmask DP or backtracking) correctly and states its complexity.",
        "Shows with a concrete counterexample that greedy is not optimal.",
        "Explains what to ship for large groups and how to keep the plan stable."
      ],
      notes: [
        "The DP relies on a neat fact: if you add a group's members one at a time, the number of prefixes whose sum is zero can be made equal to the number of disjoint zero-sum subgroups. `dp[mask]` is the best such count over all orders, computed from smaller masks.",
        "`rest & -rest` isolates the lowest set bit and `rest &= rest - 1` clears it — the standard idioms for iterating over the members of a bitmask.",
        "The randomized check confirms three things on every case: the DP equals backtracking (two independent exact methods), greedy is never better than the optimum, and greedy respects the k − 1 bound."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: expense flows, balances & group rules',
      lead: 'Domain-modelling questions with concurrency traps — exactly what product companies ask about their own core flows.',
      qa: [
        { level: 1, q: "Explain the two-heap greedy for settling debts and its complexity.",
          a: "Compute each member's net balance. Put creditors (positive) in a max-heap and debtors (negative, by absolute value) in another max-heap. Repeatedly pop the largest creditor and largest debtor, transfer `min(owed, owing)`, and push back whichever still has a non-zero remainder. Each step fully settles at least one person, so there are at most k − 1 transfers for k non-zero balances, and each step costs O(log k) heap work — O(k log k) overall after O(n) to compute balances from n expenses. It is simple, fast and explainable, but not always minimal.",
          follow: ["Why does the largest-first choice not guarantee the minimum?"] },
        { level: 2, q: "Why is minimising the number of transfers NP-hard, and what exactly is the minimum?",
          a: "The minimum is `k − m`, where k is the number of non-zero balances and m the maximum number of disjoint subgroups whose balances each sum to zero: each zero-sum subgroup of size s can be settled with s − 1 transfers and no fewer. Deciding whether the answer is below k − 1 means deciding whether *some* proper subgroup sums to zero — the subset-sum problem, which is NP-complete. So any exact algorithm is exponential in the worst case: a bitmask DP over subsets in O(2ᵏ · k) works up to roughly 20 people, and backtracking with pruning handles similar sizes.",
          follow: ["Give a set of balances where greedy uses more transfers than necessary."] },
        { level: 2, q: "A member wants to leave a group while their balance is not zero. Which rules and race conditions do you consider?",
          a: "Product rules first: block leaving until the balance is settled, or allow it but keep the member as *former* so history and balances remain visible and settle-up still works — never delete their splits. Technically, the dangerous race is *leave* committing while another request adds an expense that splits with them. Prevent it in the database: make `expense_split (group_id, user_id)` reference `group_member (group_id, user_id)` so a split for a removed member fails, or take a lock on the membership row (`SELECT … FOR SHARE`) in the add-expense transaction while *leave* takes `FOR UPDATE`. A group version column with optimistic locking also works. Checking membership in Java before inserting, without one of these, is a race.",
          follow: ["How would you notify the other members reliably when someone leaves?"] },
        { level: 2, q: "How would you design `GET /groups/{id}/balances` so it is correct and fast?",
          a: "Compute the net balance per member with **one aggregation query**: amounts paid (from `expense.paid_by` and settlements made) minus amounts owed (from `expense_split` and settlements received), combined with `UNION ALL` and grouped by user — supported by indexes on `expense(group_id)`, `expense_split(expense_id, user_id)` and `settlement(group_id)`. That is correct by construction and fast for typical groups. If it becomes hot, cache the result keyed by group with a version (or ETag) that every write increments, so the cache is invalidated precisely; materialise balances only if measurements require it. Return amounts as strings or decimals with currency, never as floating-point numbers.",
          follow: ["How would an ETag let mobile clients avoid re-downloading unchanged balances?"] },
        { level: 2, q: "Strategy pattern or a `switch` over split types — what do you gain, and when is a `switch` fine?",
          a: "Strategy puts each split type's validation and computation in its own class: easy to unit-test in isolation, and a new type is one new class plus registration (open/closed principle) instead of edits in every `switch`. A `switch` is fine when the set is small and **closed**, the logic is short, and the compiler checks exhaustiveness — with a sealed interface or an enum and a pattern-matching `switch`, adding a type produces compile errors at every place that must handle it, which is safe. Rule of thumb: strategies when the behaviour per type is substantial or varies independently; an exhaustive switch for small, stable decision logic.",
          follow: ["How would you load strategies from Spring beans automatically?"] },
        { level: 3, q: "Design settle-up when real money moves through a payment provider such as UPI.",
          a: [
            "**Model** a settlement as a state machine: `INITIATED → PENDING → SUCCEEDED | FAILED | EXPIRED`, created with an idempotency key so retries never create a second payment.",
            "**Balances change only on success**: a pending settlement is shown but not applied; apply it in the same transaction that marks it succeeded.",
            "**Provider callbacks**: verify webhook signatures, deduplicate events by provider id, and handle out-of-order events (a *failed* after a *succeeded* must not undo it).",
            "**Unknown outcomes**: if the provider call times out, poll its status API rather than retrying blindly; run a reconciliation job that compares provider settlement reports with local records.",
            "**User experience**: show *pending* clearly, allow cancellation before completion, and notify both parties once confirmed. Session 22 covers payment-system design in depth."
          ],
          follow: ["What if the provider confirms a payment that your system marked as expired?"] },
        { level: 3, q: "A corporate account adds thousands of expenses per day to one group. How do you keep balance reads fast and writes free of contention?",
          a: "Treat expenses and settlements as an **append-only ledger** — appends never conflict. Avoid a single hot balance row: either compute per-member balances asynchronously from the ledger (a consumer updates a read model a few hundred milliseconds behind, which is acceptable for a dashboard), or keep per-member running totals updated with atomic increments in the write transaction, ordered by member id to avoid deadlocks. Serve reads from the read model or a cache keyed by a group version; snapshot balances daily so recomputation never scans years of history; and shard by group id if one database is not enough. Monitor the invariant that the balances still sum to zero.",
          follow: ["What consistency would you promise users for the dashboard numbers?"] },
        { level: 2, q: "How would you test the debt-simplification code?",
          a: "Example tests for the known cases (including the greedy counterexample) plus **property-based tests** over random balance sets: the plan zeroes every balance; every transfer amount is positive and goes from a debtor to a creditor; the number of transfers is at most k − 1; and for small k (say ≤ 8) the exact algorithm's count is never greater than the greedy's and equals an independent brute-force search. Also test determinism — the same balances always produce the same plan — and performance limits for the exact algorithm (it refuses or falls back above its size limit).",
          follow: ["Which bug would a determinism test catch?"] },
        { level: 2, q: "How would you expose the simplified settlement plan through the API and keep it stable between calls?",
          a: "Compute it on demand from the current balances rather than storing it — it is a *suggestion*, not a record. Make it deterministic: sort creditors and debtors by amount and then by user id, so ties always resolve the same way and the plan does not shuffle between page loads. Include the balances' version (or an ETag) in the response so clients can tell when it changed, and when a user acts on a suggested transfer, record it as an ordinary settlement — the next plan is then recomputed from the new balances.",
          follow: ["Why shouldn't you persist the suggested plan?"] },
        { level: 2, q: "How do you stop an expense from being split with a user who was removed from the group a moment earlier?",
          a: "Make the database enforce membership: a composite foreign key from `expense_split (group_id, user_id)` to `group_member (group_id, user_id)` with `ON DELETE RESTRICT` (or a soft-delete flag checked by a trigger) means the insert fails if the membership row is gone, no matter how the requests interleave. Alternatively, read the membership rows with `SELECT … FOR SHARE` inside the add-expense transaction so a concurrent removal (which needs an exclusive lock) waits until the expense commits, or use an optimistic group version. A check in Java followed by an insert, without one of these, leaves a race window.",
          follow: ["Why is the foreign-key approach the most robust?"] }
      ],
      notes: [
        "Interviewers often start with the greedy and ask *is that optimal?* — have the counterexample ready: A +7, B +6, C −6, D −4, E −3.",
        "The concurrency questions here are small versions of real incidents: membership races and hot balance rows. Answers that name the database mechanism (foreign key, locking read, atomic update) score far better than *add synchronized*.",
        "The settle-up question bridges to payment-system design; keep it structured as states, idempotency, callbacks and reconciliation."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "Net balances are A +7, B +6, C −6, D −4, E −3. What is the minimum number of transfers that settles everyone?",
      options: ['2', '3', '4', '5'], answer: 1,
      why: "{B, C} sums to zero (one transfer) and {A, D, E} sums to zero (two transfers): 5 − 2 = 3. The largest-first greedy uses 4." },
    { level: 2, q: "For k people with non-zero balances, how many transfers does the two-heap greedy use at most?",
      options: ['k / 2', 'k − 1', 'k', 'k²'], answer: 1,
      why: "Every transfer settles at least one person completely and the last one settles two, so the plan never exceeds k − 1 transfers." },
    { level: 3, q: "The exact bitmask DP for optimal balancing runs with k = 20 non-zero balances. Roughly how much work is that?",
      options: ['About 400 steps', 'About 20 million steps (2²⁰ × 20)', 'About 10¹² steps', 'About 20! ≈ 2.4 × 10¹⁸ steps'], answer: 1,
      why: "There are 2²⁰ ≈ 10⁶ subsets and each examines up to 20 members — roughly 2 × 10⁷ operations, well under a second. At k = 40 it would be hopeless." },
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.*;

        public class Main {
            public static void main(String[] args) {
                int[][] tx = {{0, 1, 10}, {1, 2, 5}, {2, 0, 5}};    // {from, to, amount}: from paid for to
                Map<Integer, Integer> net = new TreeMap<>();
                for (int[] t : tx) { net.merge(t[0], t[2], Integer::sum); net.merge(t[1], -t[2], Integer::sum); }
                System.out.println(net);
            }
        }`, out: '{0=5, 1=-5, 2=0}' },
      options: ['`{0=5, 1=-5, 2=0}`', '`{0=10, 1=-5, 2=-5}`', '`{0=-5, 1=5, 2=0}`', '`{0=5, 1=-5}`'], answer: 0,
      why: "Person 0 is credited 10 and debited 5; person 1 is debited 10 and credited 5; person 2 is debited 5 and credited 5. `merge` keeps the zero entry for person 2 — it is not removed automatically." },
    { level: 3, q: "A member is removed from a group while another request adds an expense split that includes them. Which mechanism reliably prevents a split for a non-member?",
      options: ['A composite foreign key from `expense_split (group_id, user_id)` to `group_member (group_id, user_id)`, or a locking read of the membership in the same transaction', 'Checking membership in Java just before inserting the split', 'Retrying the insert three times', 'Running the removal at night'], answer: 0,
      why: "Only the database can see both transactions. A foreign key (or a shared lock held until commit) makes the interleaving impossible; a Java check before the insert leaves a race window." }
  ]
});
