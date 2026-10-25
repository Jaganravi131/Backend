COURSE.session({
  no: 13,
  short: 'Splitwise Part 2: expenses & groups',
  title: 'Splitwise Backend (Part 2): Expense Flows & Group Management',
  covers: [0],
  objectives: [
    "Implement equal, exact, percentage and shares splits with the Strategy pattern and exact money allocation.",
    "Build the add/edit/delete expense flows as transactional, validated operations.",
    "Compute group balances with SQL and simplify debts with a greedy two-heap algorithm.",
    "Enforce group-management rules: membership, roles, removing members, settling up."
  ],
  prereq: "Session 12: Splitwise schema, entities and money splitting.",
  slides: [
    {
      type: 'project',
      title: 'Part 2 scope: money starts moving',
      lead: 'Part 1 gave us users, groups and a schema. Part 2 implements the flows that make Splitwise useful.',
      diagram: { kind: 'flow', nodes: [
        { t: 'Add expense', s: '4 split types', tone: 'blue' },
        { t: 'Balances', s: 'paid − owed ± settlements', tone: 'green' },
        { t: 'Simplify debts', s: 'fewest transfers', tone: 'purple' },
        { t: 'Settle up', s: 'record a payment', tone: 'orange' },
        { t: 'Balances = 0', s: 'group can close', tone: 'green' }
      ] },
      table: { head: ['Endpoint', 'Flow'], rows: [
        ['`POST /api/v1/groups/{id}/expenses`', 'add expense (EQUAL, EXACT, PERCENTAGE, SHARES)'],
        ['`PUT` / `DELETE …/expenses/{expenseId}`', 'edit (optimistic locking) / soft delete'],
        ['`GET …/expenses?page=&size=`', 'expense feed, newest first'],
        ['`GET /api/v1/groups/{id}/balances`', 'per-member balance'],
        ['`GET …/balances/simplified`', 'suggested transfers'],
        ['`POST /api/v1/groups/{id}/settlements`', 'settle up'],
        ['`DELETE /api/v1/groups/{id}/members/{userId}`', 'remove member (only when balance is 0)']
      ] },
      notes: [
        "This session covers the brochure's 'expense creation and settlement flows' and 'user and group management features' for the minor project.",
        "Remind students of the Session 12 flowchart: we now implement each box. Keep the invariant in mind — balances in a group always sum to zero."
      ]
    },
    {
      type: 'theory',
      title: 'The Strategy pattern for split types',
      lead: 'Each split type is a small class behind one interface. Adding a new type never touches `ExpenseService` — the Open/Closed principle.',
      diagram: { kind: 'tree', layout: 'org', root: { t: 'SplitStrategy', s: 'interface', tone: 'purple', c: [
        { t: 'EqualSplit', s: 'weights 1 : 1 : 1', tone: 'blue' },
        { t: 'ExactSplit', s: 'amounts must sum', tone: 'green' },
        { t: 'PercentageSplit', s: 'percents sum to 100', tone: 'orange' },
        { t: 'SharesSplit', s: 'weights 2 : 1 : 1', tone: 'teal' }
      ] } },
      table: { head: ['Type', 'Client sends', 'Validation', '₹1,000 among A, B, C'], rows: [
        ['EQUAL', 'participants', '≥ 1 participant', '333.34 / 333.33 / 333.33'],
        ['EXACT', 'amount per person', 'amounts sum to the total', '450 / 300 / 250'],
        ['PERCENTAGE', 'percent per person', 'percents sum to 100', '50% / 33.33% / 16.67% → 500 / 333.30 / 166.70'],
        ['SHARES', 'shares per person', 'shares > 0', '2 : 1 : 1 → 500 / 250 / 250']
      ] },
      notes: [
        "Equal, percentage and shares are the same algorithm with different weights: allocate the total in paise proportionally, then hand leftover paise out by the *largest remainder* rule so the sum is exact.",
        "In Spring every strategy is a `@Component`; a resolver receives `List<SplitStrategy>` and indexes it into an `EnumMap<SplitType, SplitStrategy>`. A new strategy is picked up automatically.",
        "Interview tip: this is the canonical answer to 'how do you avoid a giant switch over types?'."
      ]
    },
    {
      type: 'practical',
      title: 'Split strategies in pure Java',
      lead: 'The core money logic has no Spring or database dependency — so it is trivial to test (Session 14).',
      code: { lang: 'java', file: 'SplitStrategies.java', src: code`
        import java.math.BigDecimal;
        import java.math.RoundingMode;
        import java.util.*;

        public class SplitStrategies {
            enum SplitType { EQUAL, EXACT, PERCENTAGE, SHARES }

            record Participant(String userId, BigDecimal value) {
                static Participant of(String id) { return new Participant(id, BigDecimal.ONE); }
                static Participant of(String id, String value) { return new Participant(id, new BigDecimal(value)); }
            }

            interface SplitStrategy {
                SplitType type();
                Map<String, BigDecimal> split(BigDecimal amount, List<Participant> participants);
            }

            /** Proportional allocation in paise; leftover paise go to the largest fractional parts. */
            static Map<String, BigDecimal> allocate(BigDecimal amount, List<Participant> ps) {
                long total = amount.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact();
                BigDecimal weightSum = ps.stream().map(Participant::value).reduce(BigDecimal.ZERO, BigDecimal::add);
                long[] paise = new long[ps.size()];
                BigDecimal[] fraction = new BigDecimal[ps.size()];
                long allocated = 0;
                for (int i = 0; i < ps.size(); i++) {
                    BigDecimal exact = ps.get(i).value().multiply(BigDecimal.valueOf(total))
                            .divide(weightSum, 10, RoundingMode.DOWN);
                    paise[i] = exact.setScale(0, RoundingMode.DOWN).longValueExact();
                    fraction[i] = exact.subtract(BigDecimal.valueOf(paise[i]));
                    allocated += paise[i];
                }
                List<Integer> order = new ArrayList<>();
                for (int i = 0; i < ps.size(); i++) order.add(i);
                order.sort(Comparator.comparing((Integer i) -> fraction[i]).reversed().thenComparing(i -> i));
                for (int k = 0; k < total - allocated; k++) paise[order.get(k)]++;
                Map<String, BigDecimal> result = new LinkedHashMap<>();
                for (int i = 0; i < ps.size(); i++) result.put(ps.get(i).userId(), BigDecimal.valueOf(paise[i], 2));
                return result;
            }

            static BigDecimal sum(List<Participant> ps) {
                return ps.stream().map(Participant::value).reduce(BigDecimal.ZERO, BigDecimal::add);
            }

            static class EqualSplit implements SplitStrategy {
                public SplitType type() { return SplitType.EQUAL; }
                public Map<String, BigDecimal> split(BigDecimal amount, List<Participant> ps) {
                    return allocate(amount, ps.stream().map(p -> Participant.of(p.userId())).toList());
                }
            }

            static class ExactSplit implements SplitStrategy {
                public SplitType type() { return SplitType.EXACT; }
                public Map<String, BigDecimal> split(BigDecimal amount, List<Participant> ps) {
                    if (sum(ps).compareTo(amount) != 0)
                        throw new IllegalArgumentException("exact amounts add up to " + sum(ps) + ", expected " + amount);
                    Map<String, BigDecimal> r = new LinkedHashMap<>();
                    ps.forEach(p -> r.put(p.userId(), p.value().setScale(2, RoundingMode.UNNECESSARY)));
                    return r;
                }
            }

            static class PercentageSplit implements SplitStrategy {
                public SplitType type() { return SplitType.PERCENTAGE; }
                public Map<String, BigDecimal> split(BigDecimal amount, List<Participant> ps) {
                    if (sum(ps).compareTo(BigDecimal.valueOf(100)) != 0)
                        throw new IllegalArgumentException("percentages add up to " + sum(ps) + ", expected 100");
                    return allocate(amount, ps);
                }
            }

            static class SharesSplit implements SplitStrategy {
                public SplitType type() { return SplitType.SHARES; }
                public Map<String, BigDecimal> split(BigDecimal amount, List<Participant> ps) {
                    if (ps.stream().anyMatch(p -> p.value().signum() <= 0))
                        throw new IllegalArgumentException("shares must be positive");
                    return allocate(amount, ps);
                }
            }

            public static void main(String[] args) {
                Map<SplitType, SplitStrategy> strategies = new EnumMap<>(SplitType.class);
                for (SplitStrategy s : List.of(new EqualSplit(), new ExactSplit(), new PercentageSplit(), new SharesSplit())) {
                    strategies.put(s.type(), s);                 // Spring builds this map for us
                }
                BigDecimal dinner = new BigDecimal("1000.00");
                System.out.println("EQUAL      " + strategies.get(SplitType.EQUAL).split(dinner,
                        List.of(Participant.of("asha"), Participant.of("ravi"), Participant.of("meera"))));
                System.out.println("EXACT      " + strategies.get(SplitType.EXACT).split(dinner,
                        List.of(Participant.of("asha", "450"), Participant.of("ravi", "300"), Participant.of("meera", "250"))));
                System.out.println("PERCENTAGE " + strategies.get(SplitType.PERCENTAGE).split(dinner,
                        List.of(Participant.of("asha", "50"), Participant.of("ravi", "33.33"), Participant.of("meera", "16.67"))));
                System.out.println("SHARES     " + strategies.get(SplitType.SHARES).split(dinner,
                        List.of(Participant.of("asha", "2"), Participant.of("ravi", "1"), Participant.of("meera", "1"))));
                try {
                    strategies.get(SplitType.EXACT).split(dinner, List.of(Participant.of("asha", "500"), Participant.of("ravi", "300")));
                } catch (IllegalArgumentException e) {
                    System.out.println("rejected: " + e.getMessage());
                }
            }
        }`, out: code`
        EQUAL      {asha=333.34, ravi=333.33, meera=333.33}
        EXACT      {asha=450.00, ravi=300.00, meera=250.00}
        PERCENTAGE {asha=500.00, ravi=333.30, meera=166.70}
        SHARES     {asha=500.00, ravi=250.00, meera=250.00}
        rejected: exact amounts add up to 800, expected 1000.00` },
      notes: [
        "Walk through `allocate` for EQUAL: 100,000 paise × 1/3 = 33,333.33… each; the floors sum to 99,999, so one leftover paisa goes to the first participant (ties broken by position).",
        "Every result sums exactly to the expense amount — the same invariant `Expense.replaceSplits` enforces (Session 12). Defence in depth.",
        "In the real project, ids are `Long` user ids and validation failures throw `BusinessRuleException` (→ 422)."
      ]
    },
    {
      type: 'practical',
      title: 'Wiring it into Spring: the add-expense service',
      lead: 'Strategies become beans; the service loads the group, checks the rules, splits, and saves — in one transaction.',
      code: [
        { lang: 'java', file: 'SplitStrategyResolver.java', src: code`
          package com.example.splitwise.expense.split;

          import com.example.splitwise.common.BusinessRuleException;
          import com.example.splitwise.expense.SplitType;
          import java.util.EnumMap;
          import java.util.List;
          import java.util.Map;
          import org.springframework.stereotype.Component;

          @Component
          public class SplitStrategyResolver {
              private final Map<SplitType, SplitStrategy> byType = new EnumMap<>(SplitType.class);

              public SplitStrategyResolver(List<SplitStrategy> strategies) {    // every @Component strategy
                  for (SplitStrategy s : strategies) {
                      if (byType.put(s.type(), s) != null) throw new IllegalStateException("duplicate " + s.type());
                  }
              }

              public SplitStrategy get(SplitType type) {
                  SplitStrategy s = byType.get(type);
                  if (s == null) throw new BusinessRuleException("unsupported split type " + type);
                  return s;
              }
          }` },
        { lang: 'java', file: 'ExpenseService.java', src: code`
          package com.example.splitwise.expense;

          import com.example.splitwise.common.*;
          import com.example.splitwise.expense.split.SplitStrategyResolver;
          import com.example.splitwise.group.*;
          import com.example.splitwise.user.*;
          import java.math.BigDecimal;
          import java.util.*;
          import lombok.RequiredArgsConstructor;
          import org.springframework.stereotype.Service;
          import org.springframework.transaction.annotation.Transactional;

          @Service
          @RequiredArgsConstructor
          public class ExpenseService {
              private final ExpenseGroupRepository groups;
              private final UserRepository users;
              private final ExpenseRepository expenses;
              private final SplitStrategyResolver strategies;

              @Transactional
              public ExpenseResponse addExpense(Long groupId, Long currentUserId, CreateExpenseRequest req) {
                  ExpenseGroup group = groups.findWithMembers(groupId)
                          .orElseThrow(() -> new NotFoundException("group " + groupId + " not found"));
                  Set<Long> memberIds = group.memberIds();
                  List<Long> participantIds = req.participants().stream().map(ParticipantInput::userId).toList();

                  if (!memberIds.contains(req.paidBy()))        throw new BusinessRuleException("payer is not a group member");
                  if (!memberIds.containsAll(participantIds))   throw new BusinessRuleException("every participant must be a member");
                  if (new HashSet<>(participantIds).size() != participantIds.size())
                      throw new BusinessRuleException("duplicate participants");

                  Map<Long, BigDecimal> shares = strategies.get(req.splitType()).split(req.amount(), req.participants());

                  Expense expense = new Expense(group, req.description(), req.amount(), req.splitType(),
                          users.getReferenceById(req.paidBy()), users.getReferenceById(currentUserId), req.expenseDate());
                  Map<User, BigDecimal> byUser = new LinkedHashMap<>();
                  shares.forEach((userId, share) -> byUser.put(users.getReferenceById(userId), share));
                  expense.replaceSplits(byUser);                                   // invariant: shares sum to amount
                  return ExpenseResponse.from(expenses.save(expense));             // cascade inserts the splits
              }
          }` }
      ],
      notes: [
        "`getReferenceById` returns a lazy proxy without a SELECT — enough to set a foreign key. We already proved the ids are members, so no extra queries are needed.",
        "Any exception (rule violation, constraint violation) rolls the whole transaction back: no expense without splits, no splits without an expense.",
        "`group.memberIds()` is a small helper on the aggregate that returns the set of member user ids (loaded by `findWithMembers` in a single query — no N+1)."
      ]
    },
    {
      type: 'practical',
      title: 'Computing balances with one SQL query',
      lead: 'Balance = paid − owed + settlements sent − settlements received. Let the database aggregate.',
      code: { lang: 'java', file: 'BalanceService.java', src: code`
        package com.example.splitwise.settlement;

        import java.math.BigDecimal;
        import java.util.List;
        import org.springframework.jdbc.core.simple.JdbcClient;
        import org.springframework.stereotype.Service;
        import org.springframework.transaction.annotation.Transactional;

        record MemberBalance(Long userId, String displayName, BigDecimal balance) {}

        @Service
        public class BalanceService {
            private final JdbcClient jdbc;

            public BalanceService(JdbcClient jdbc) { this.jdbc = jdbc; }

            @Transactional(readOnly = true)
            public List<MemberBalance> balances(long groupId) {
                return jdbc.sql("""
                    SELECT u.id AS user_id, u.display_name,
                           COALESCE(paid.total, 0) - COALESCE(owed.total, 0)
                         + COALESCE(sent.total, 0) - COALESCE(recv.total, 0) AS balance
                    FROM group_members gm
                    JOIN users u ON u.id = gm.user_id
                    LEFT JOIN (SELECT paid_by AS uid, SUM(amount) AS total FROM expenses
                               WHERE group_id = :g AND deleted_at IS NULL GROUP BY paid_by) paid ON paid.uid = u.id
                    LEFT JOIN (SELECT s.user_id AS uid, SUM(s.share_amount) AS total
                               FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
                               WHERE e.group_id = :g AND e.deleted_at IS NULL GROUP BY s.user_id) owed ON owed.uid = u.id
                    LEFT JOIN (SELECT payer_id AS uid, SUM(amount) AS total FROM settlements
                               WHERE group_id = :g GROUP BY payer_id) sent ON sent.uid = u.id
                    LEFT JOIN (SELECT payee_id AS uid, SUM(amount) AS total FROM settlements
                               WHERE group_id = :g GROUP BY payee_id) recv ON recv.uid = u.id
                    WHERE gm.group_id = :g
                    ORDER BY balance DESC
                    """)
                    .param("g", groupId)
                    .query(MemberBalance.class)
                    .list();
            }
        }` },
      notes: [
        "Each derived table aggregates one source; `LEFT JOIN` + `COALESCE` give 0 for members with no activity. With the `(group_id, …)` indexes from Session 12 this stays fast for thousands of expenses.",
        "Sign convention check: a debtor (negative) who *sends* a settlement moves towards zero (+ sent); a creditor who *receives* one also moves towards zero (− received).",
        "We mix JPA (writes, aggregates) and JdbcClient (a reporting query) in one application — perfectly normal. This result is a prime candidate for Redis caching in Session 15."
      ]
    },
    {
      type: 'practical',
      title: 'Simplifying debts with two priority queues',
      lead: 'Instead of everyone paying everyone, match the biggest debtor with the biggest creditor until all balances are zero.',
      code: { lang: 'java', file: 'DebtSimplifier.java', src: code`
        import java.math.BigDecimal;
        import java.util.*;

        public class DebtSimplifier {
            record Transfer(String from, String to, BigDecimal amount) {
                @Override public String toString() { return from + " pays " + to + " " + amount; }
            }
            record Balance(String user, BigDecimal amount) {}

            /** Greedy: largest debtor pays largest creditor. Produces at most n - 1 transfers. */
            static List<Transfer> simplify(Map<String, BigDecimal> balances) {
                Comparator<Balance> biggestFirst = Comparator.comparing(Balance::amount).reversed()
                        .thenComparing(Balance::user);                       // deterministic tie-break
                PriorityQueue<Balance> creditors = new PriorityQueue<>(biggestFirst);
                PriorityQueue<Balance> debtors = new PriorityQueue<>(biggestFirst);
                balances.forEach((user, amt) -> {
                    if (amt.signum() > 0) creditors.add(new Balance(user, amt));
                    else if (amt.signum() < 0) debtors.add(new Balance(user, amt.negate()));
                });
                List<Transfer> transfers = new ArrayList<>();
                while (!creditors.isEmpty() && !debtors.isEmpty()) {
                    Balance c = creditors.poll(), d = debtors.poll();
                    BigDecimal pay = c.amount().min(d.amount());
                    transfers.add(new Transfer(d.user(), c.user(), pay));
                    if (c.amount().compareTo(pay) > 0) creditors.add(new Balance(c.user(), c.amount().subtract(pay)));
                    if (d.amount().compareTo(pay) > 0) debtors.add(new Balance(d.user(), d.amount().subtract(pay)));
                }
                return transfers;
            }

            public static void main(String[] args) {
                Map<String, BigDecimal> balances = new LinkedHashMap<>();     // paid - owed, sums to zero
                balances.put("asha", new BigDecimal("1500.00"));
                balances.put("ravi", new BigDecimal("-700.00"));
                balances.put("meera", new BigDecimal("-500.00"));
                balances.put("zoya", new BigDecimal("200.00"));
                balances.put("dev", new BigDecimal("-500.00"));
                System.out.println("sum = " + balances.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add));
                simplify(balances).forEach(System.out::println);
            }
        }`, out: code`
        sum = 0.00
        ravi pays asha 700.00
        dev pays asha 500.00
        meera pays asha 300.00
        meera pays zoya 200.00` },
      callout: { kind: 'interview', text: "Finding the *absolute minimum* number of transfers is NP-hard in general (it relates to subset-sum). The greedy heap approach runs in O(n log n) and never needs more than n − 1 transfers — the practical choice." },
      notes: [
        "This reuses Session 4's `PriorityQueue` with a multi-key `Comparator` — the tie-break on the user name makes results deterministic, which matters for tests and for users who refresh the page.",
        "Each iteration settles at least one person completely, hence at most n − 1 transfers.",
        "The endpoint `GET /balances/simplified` simply feeds `BalanceService.balances()` into this function; nothing is stored until someone actually records a settlement."
      ]
    },
    {
      type: 'theory',
      title: 'Group management rules & concurrency',
      lead: 'Money rules must hold even when two members act at the same moment.',
      diagram: { kind: 'flow', dir: 'v', nodes: [
        { t: 'DELETE /groups/7/members/3', tone: 'blue' },
        { t: 'Lock the group row', s: 'SELECT … FOR UPDATE (findByIdForUpdate)', tone: 'purple' },
        { t: 'Balance of user 3 == 0 ?', s: 'no → 422 “settle up first”', tone: 'yellow' },
        { t: 'Remove membership', s: 'orphanRemoval deletes the row', tone: 'green' },
        { t: 'Commit → 204 No Content', tone: 'green' }
      ] },
      table: { head: ['Rule', 'Enforced by'], rows: [
        ['Only members appear in expenses and settlements', 'service checks + foreign keys'],
        ['Shares sum to the amount', 'strategy + `Expense.replaceSplits`'],
        ['Members can leave/be removed only with balance 0', 'service check under a row lock'],
        ['Two people editing the same expense', '`@Version` → 409 Conflict, client reloads'],
        ['Only ADMINs can remove members or delete the group', 'Spring Security, Sessions 16–17'],
        ['Deleting an expense keeps history', 'soft delete (`deleted_at`)']
      ] },
      notes: [
        "Why lock when removing a member? Without it, an expense involving user 3 could be committed between our balance check and the removal, leaving a non-zero balance for someone no longer in the group (a classic check-then-act race — Session 6, now at database level).",
        "Optimistic locking suits expense edits (rare conflicts, users can retry); a short pessimistic lock suits the 'check balance then remove' sequence. Choose per operation.",
        "Advanced: expose the entity version as an HTTP `ETag` and require `If-Match` on PUT — the REST-native form of optimistic locking."
      ]
    },
    {
      type: 'practical',
      title: 'The whole flow from the command line',
      lead: 'Two expenses, balances, a simplified plan and a settlement — the numbers must always add up to zero.',
      code: { lang: 'bash', label: 'HTTPie session', src: code`
        # group 7 members: Asha (1), Ravi (2), Meera (3)
        $ http POST :8080/api/v1/groups/7/expenses description=Dinner amount=1200.00 paidBy:=1 \
              splitType=EQUAL expenseDate=2026-10-20 participants:='[{"userId":1},{"userId":2},{"userId":3}]'
        HTTP/1.1 201 Created
        Location: http://localhost:8080/api/v1/groups/7/expenses/41

        $ http POST :8080/api/v1/groups/7/expenses description=Cab amount=600.00 paidBy:=2 \
              splitType=EXACT expenseDate=2026-10-21 participants:='[{"userId":2,"value":100},{"userId":3,"value":500}]'
        HTTP/1.1 201 Created

        $ http :8080/api/v1/groups/7/balances
        [ {"userId":1,"displayName":"Asha","balance":800.00},
          {"userId":2,"displayName":"Ravi","balance":100.00},
          {"userId":3,"displayName":"Meera","balance":-900.00} ]

        $ http :8080/api/v1/groups/7/balances/simplified
        [ {"from":"Meera","to":"Asha","amount":800.00}, {"from":"Meera","to":"Ravi","amount":100.00} ]

        $ http POST :8080/api/v1/groups/7/settlements payerId:=3 payeeId:=1 amount=800.00
        HTTP/1.1 201 Created

        $ http :8080/api/v1/groups/7/balances
        [ {"userId":2,"displayName":"Ravi","balance":100.00},
          {"userId":1,"displayName":"Asha","balance":0.00},
          {"userId":3,"displayName":"Meera","balance":-100.00} ]

        $ http DELETE :8080/api/v1/groups/7/members/3
        HTTP/1.1 422
        {"title":"Business rule violated","detail":"settle up first: balance is -100.00", ...}` },
      notes: [
        "Verify by hand with the class: Dinner gives each person a 400 share; Asha paid 1200 → +800. Cab: Ravi paid 600, owes 400 + 100 → +100. Meera owes 400 + 500 → −900. Sum = 0 ✓.",
        "After Meera pays Asha 800, Asha is settled and Meera still owes Ravi 100 — exactly the second suggested transfer.",
        "HTTPie syntax: `field=value` sends a string, `field:=json` sends raw JSON (numbers, arrays). Equivalent curl commands work just as well."
      ]
    },
    {
      type: 'lab',
      title: 'Project milestone 2: expenses, balances & settlements',
      lead: 'Complete the money flows of the minor project with tests-ready, rule-enforcing services.',
      steps: [
        "Create `SplitStrategy` + `EqualSplit`, `ExactSplit`, `PercentageSplit`, `SharesSplit` as Spring components and the `SplitStrategyResolver`.",
        "Implement `POST /groups/{id}/expenses` with the membership rules; return 201 + Location; reject bad splits with 422.",
        "Add `GET …/expenses` (paged, newest first, excluding soft-deleted), `PUT` with `@Version` (409 on conflict) and soft `DELETE`.",
        "Implement `BalanceService` and `GET /groups/{id}/balances`; log a warning if the balances don't sum to zero.",
        "Implement `DebtSimplifier` and `GET /groups/{id}/balances/simplified`.",
        "Implement `POST /groups/{id}/settlements` (members only, payer ≠ payee, amount > 0) and watch balances move.",
        "Implement member removal with the row lock and zero-balance rule (422 otherwise).",
        "Export a Postman/HTTPie collection covering happy paths and every error path; open the *Splitwise Part 2* pull request."
      ],
      notes: [
        "Encourage students to keep the pure-Java strategies and simplifier free of Spring annotations except `@Component` — next session they write fast unit tests for them, then MockMvc tests for the endpoints.",
        "Stretch goal for strong students: an activity feed endpoint merging expenses and settlements ordered by time (a `UNION ALL` query projected into a DTO)."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: expense flows & group management',
      quiz: [
        { q: "Which design lets you add a new split type without modifying ExpenseService?", options: ['A big switch statement', 'Strategy pattern + a resolver map', 'Inheritance from ExpenseService', 'A static utility class'], answer: 1,
          why: "Each type is a strategy bean; the resolver discovers new strategies automatically (Open/Closed principle)." },
        { q: "₹1,000 split by SHARES 2 : 1 : 1 gives…", options: ['333.34 / 333.33 / 333.33', '500 / 250 / 250', '400 / 300 / 300', '666.67 / 166.67 / 166.66'], answer: 1,
          why: "Weights 2/4, 1/4, 1/4 of 1,000 → 500, 250, 250 — no remainder to distribute." },
        { q: "With 5 members, the greedy debt simplification produces at most…", options: ['10 transfers', '5 transfers', '4 transfers', '1 transfer'], answer: 2,
          why: "Each step settles at least one person, so at most n − 1 = 4 transfers." },
        { q: "A member with balance −100 asks to leave the group. The API should…", options: ['remove them anyway', 'return 422 and ask them to settle up', 'delete their expenses', 'set their balance to zero'], answer: 1,
          why: "Group-management rule: only members with a zero balance can leave or be removed." },
        { q: "Why soft-delete expenses instead of `DELETE FROM expenses`?", options: ['It is faster', 'It preserves history and audit trails (and allows undo)', 'MySQL cannot delete rows with foreign keys', 'JPA requires it'], answer: 1,
          why: "Money systems keep history; balances simply ignore rows with `deleted_at` set." }
      ],
      notes: [
        "Bonus discussion for Q3: can you find balances where greedy uses more transfers than optimal? (e.g. two separate pairs that cancel exactly — greedy may cross them). It's still bounded by n − 1."
      ]
    },
    {
      type: 'summary',
      title: 'Session 13 recap',
      points: [
        "Strategy pattern: one class per split type, resolved from an `EnumMap`; proportional allocation with largest-remainder keeps sums exact.",
        "Add-expense = validate → load group → membership rules → split → save expense + splits atomically.",
        "Balances come from one aggregate SQL query: paid − owed + sent − received; they always sum to zero.",
        "Greedy two-heap debt simplification: O(n log n), at most n − 1 transfers.",
        "Group rules: members only, zero balance to leave (under a row lock), `@Version` for edits, soft deletes."
      ],
      cards: [
        ['Strategy pattern', 'Family of interchangeable algorithms behind one interface.'],
        ['Largest remainder', 'Allocate floors, then give leftover units to the largest fractional parts.'],
        ['getReferenceById', 'JPA proxy for an id without loading the row — ideal for setting FKs.'],
        ['Balance', 'Paid − owed + settlements sent − settlements received.'],
        ['Debt simplification', 'Greedy matching of largest debtor and creditor.'],
        ['Row lock', 'SELECT … FOR UPDATE: blocks concurrent writers until commit.'],
        ['ETag / If-Match', 'HTTP headers for optimistic concurrency on updates.'],
        ['Zero-sum invariant', 'Balances in a group always add up to zero.']
      ],
      notes: [
        "Next session: prove all of this works — JUnit 5 and Mockito for services and strategies, and MockMvc for the REST endpoints."
      ]
    }
  ]
});
