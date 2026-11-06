/* Interview pack — Session 11: Hibernate, Spring Data JPA & relationships */
COURSE.prep(11, {
  deepDives: [
    {
      title: 'Deep dive: the persistence context — dirty checking, flush order & batching',
      lead: 'JPA feels like magic until something is slow or surprising. These are the mechanics interviewers expect an SDE-2 to know.',
      points: [
        "The persistence context is an **identity map** — one Java object per database row per transaction — plus a **snapshot** of every managed entity as it was loaded.",
        "**Dirty checking**: at flush, Hibernate compares each managed entity with its snapshot and issues UPDATEs for what changed — no `save()` call needed. The cost grows with the number of managed entities: load 10,000 rows and every flush compares 10,000 objects.",
        "**Flush** happens at commit, before queries that touch affected tables (`FlushMode.AUTO`), or on explicit `flush()`. Statements are ordered by type — inserts, updates, collection changes, deletes — so *delete then re-insert the same unique key* in one transaction can hit a constraint violation.",
        "**Write-behind with JDBC batching**: set `hibernate.jdbc.batch_size` (e.g. 50) plus `order_inserts`/`order_updates`. `GenerationType.IDENTITY` **disables insert batching**, because Hibernate must execute each INSERT to learn the generated id; sequences with a pooled optimizer or ids assigned in Java (such as time-ordered UUIDv7) keep batching.",
        "`@Transactional(readOnly = true)` lets Spring and Hibernate skip dirty-checking snapshots and flushes for that transaction, and lets a routing data source send it to a read replica.",
        "Bulk JPQL `UPDATE`/`DELETE` bypass the persistence context: managed entities keep stale values, versions are not incremented and lifecycle callbacks do not run. Use `@Modifying(clearAutomatically = true, flushAutomatically = true)` and treat bulk statements as plain SQL."
      ],
      code: [
        { lang: 'yaml', file: 'application.yml', src: code`
          spring:
            jpa:
              open-in-view: false                 # no lazy loading during JSON rendering
              properties:
                hibernate:
                  jdbc.batch_size: 50             # group INSERT/UPDATE statements
                  order_inserts: true
                  order_updates: true
                  default_batch_fetch_size: 50    # load lazy associations 50 at a time (fewer N+1 queries)
                  query.fail_on_pagination_over_collection_fetch: true` },
        { lang: 'java', file: 'Expense.java', src: code`
          @Entity
          public class Expense {
              @Id
              private UUID id = UuidV7.next();           // assigned in Java: inserts can be batched

              @Version
              private long version;                      // optimistic locking

              @ManyToOne(fetch = FetchType.LAZY, optional = false)
              private ExpenseGroup group;                // JPA's default for @ManyToOne is EAGER - override it

              protected Expense() { }                    // required by JPA, hidden from callers
          }` }
      ],
      notes: [
        "Dirty checking is why a read-only listing endpoint can be surprisingly slow: loading 5,000 entities to serialise them builds 5,000 snapshots and compares them all at commit. Use `readOnly = true`, DTO projections, or both for read paths.",
        "The ordering problem is real: replacing a child collection by clearing it and adding new elements with the same unique key fails, because Hibernate executes the inserts before the deletes. Flush explicitly between the two steps, or update the existing rows instead.",
        "`UuidV7.next()` stands for any time-ordered UUID generator — Java's `UUID` class does not create version 7 UUIDs itself, so teams use a small library or utility. Time ordering keeps inserts near the end of the primary-key index instead of scattering them."
      ]
    },
    {
      title: 'Deep dive: fetching at scale — fetch joins, entity graphs, batch fetching & DTOs',
      lead: 'Every JPA performance review ends up here: how many queries does this endpoint run, and how much data does each one move?',
      table: { head: ['Strategy (100 orders, each with a customer)', 'Queries', 'Watch out for'], rows: [
        ['Lazy `customer`, accessed in a loop', '1 + 100 (N+1)', 'Invisible in code, obvious in SQL logs'],
        ['`JOIN FETCH o.customer`', '1', 'Fine for *to-one*; fetching a collection multiplies rows'],
        ['`@EntityGraph(attributePaths = \"customer\")`', '1', 'Declarative per repository method; same SQL as a fetch join'],
        ['`default_batch_fetch_size = 50`', '1 + 2', 'Works with pagination; one `IN (…)` query per 50 owners'],
        ['DTO projection (`select new …` or interface)', '1', 'Only the needed columns, nothing managed or dirty-checked'],
        ['Fetch join on a **collection** + `Pageable`', '1, but…', 'Pagination is applied **in memory** after loading every matching row']
      ] },
      points: [
        "Make `@ManyToOne` and `@OneToOne` associations **LAZY** (their JPA default is EAGER), then choose the fetching per use case: a fetch join or entity graph where you know you need the data, batch fetching as a safety net.",
        "Fetch-joining collections duplicates parent rows (one per child) and makes database pagination impossible. Paginate in two steps: select a page of ids, then fetch those parents with their collections — or fetch the children in a second query.",
        "**Open Session in View** (`spring.jpa.open-in-view`, enabled by default with a startup warning) keeps the session open while the response is rendered, so lazy loading *works* in controllers — hiding N+1 queries and holding a database connection longer. Turn it off for APIs.",
        "Read models do not need entities: projections into records skip the persistence context entirely and select only the columns the endpoint returns.",
        "Detect problems early: count statements in tests (Hibernate statistics or a datasource proxy) and fail the build when an endpoint's query count grows."
      ],
      code: { lang: 'java', file: 'OrderRepository.java', src: code`
        public interface OrderRepository extends JpaRepository<Order, Long> {

            // to-one association loaded in the same query
            @EntityGraph(attributePaths = "customer")
            List<Order> findByStatus(OrderStatus status);

            // two-step pagination for a collection: 1) a page of ids ...
            @Query("select o.id from Order o where o.customer.id = :customerId order by o.createdAt desc")
            Page<Long> findIdsByCustomer(Long customerId, Pageable pageable);

            // ... 2) the parents with their items, by id (no in-memory pagination)
            @Query("select distinct o from Order o left join fetch o.items where o.id in :ids")
            List<Order> findWithItems(Collection<Long> ids);

            // read model: only what the API returns, nothing managed
            @Query("select new com.example.orders.OrderSummary(o.id, o.total, o.createdAt) from Order o where o.customer.id = :customerId")
            List<OrderSummary> summaries(Long customerId);
        }` },
      notes: [
        "Hibernate logs a warning when it paginates a collection fetch in memory — and `hibernate.query.fail_on_pagination_over_collection_fetch=true` (in the configuration on the previous slide) turns that warning into an exception, which is what you want in development.",
        "With batch fetching, Hibernate initialises lazy proxies of up to N owners at once with `WHERE id IN (…)`. It is not as tight as a hand-written fetch join, but it caps the damage of forgotten N+1 cases with one setting.",
        "Remember that the database is not the only cost: returning entities from controllers serialises everything reachable, including lazy relations. DTOs make the response contract explicit and the queries predictable."
      ]
    }
  ],

  stretch: [
    "Add a test that counts SQL statements for `GET /groups/{id}` (Hibernate statistics or a datasource proxy) and fails when it exceeds a budget; break it with an N+1, then fix it with an entity graph.",
    "Paginate groups with their members using the two-step pattern (a page of ids, then a fetch join by ids) and compare the SQL and memory use with a `JOIN FETCH` + `Pageable` version.",
    "Switch the expense id from IDENTITY to a time-ordered UUID assigned in Java, enable `hibernate.jdbc.batch_size=50`, and measure insert throughput for 100,000 expenses before and after."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: serialize and deserialize a tree (cache it as one string)',
      lead: 'A classic hard problem with a backend framing: store a category hierarchy as a single cache value and rebuild it exactly.',
      difficulty: 'Hard', minutes: 40, lc: 297, pattern: ['trees', 'strings'],
      problem: [
        "Design `serialize(Node root)` → `String` and `deserialize(String data)` → `Node` for a binary tree, such that deserializing a serialized tree gives back exactly the same values **and** shape.",
        "The format is up to you, but it must be compact and work for every tree — including the empty tree and extremely deep, skewed trees. Context: a category hierarchy is cached in Redis as one value and rebuilt on every cache hit."
      ],
      examples: [
        { in: 'root = [1,2,3,null,null,4,5]', out: '"1,2,#,#,3,4,#,#,5,#,#"', why: "Preorder, with # for every missing child." },
        { in: 'root = []', out: '"#"' }
      ],
      constraints: ["`0 ≤ nodes ≤ 10⁴` (follow-up: a single chain of `10⁵` nodes)", "`-1000 ≤ Node.val ≤ 1000`"],
      hints: [
        "A plain preorder traversal is ambiguous — many different trees share it. What extra information would make it unambiguous?",
        "Emit a marker for every null child. Preorder with null markers determines the tree uniquely, and deserialization is the same preorder walk, reading one token at a time.",
        "Recursion depth equals the tree's height — 10⁵ for a chain. Use an explicit stack (and note that `ArrayDeque` does not accept `null`)."
      ],
      approaches: [
        { name: 'Level order (BFS) with nulls', idea: 'Write nodes level by level, null for missing children; rebuild with a queue', time: 'O(n)', space: 'O(n)' },
        { name: 'Preorder + null markers (recursive)', idea: 'Write value, recurse left, recurse right; read back the same way', time: 'O(n)', space: 'O(h) call stack' },
        { name: 'Preorder + null markers (iterative)', idea: 'Same format, explicit stacks for both directions — safe for any height', time: 'O(n)', space: 'O(h) heap' },
        { name: 'BST only: preorder without markers', idea: 'Value bounds decide where each node goes (LeetCode 449)', time: 'O(n)', space: 'O(h)' }
      ],
      code: { lang: 'java', file: 'TreeCodec.java', src: code`
        import java.util.*;

        public class TreeCodec {
            static final class Node {
                final int val;
                Node left, right;
                Node(int val) { this.val = val; }
            }

            /** Preorder with '#' for null children, e.g. "1,2,#,#,3,4,#,#,5,#,#". Iterative: no stack overflow. */
            static String serialize(Node root) {
                StringBuilder sb = new StringBuilder();
                List<Node> stack = new ArrayList<>();           // ArrayList accepts null (ArrayDeque does not)
                stack.add(root);
                while (!stack.isEmpty()) {
                    Node n = stack.remove(stack.size() - 1);
                    if (sb.length() > 0) sb.append(',');
                    if (n == null) { sb.append('#'); continue; }
                    sb.append(n.val);
                    stack.add(n.right);                         // pushed first, so the left subtree comes out first
                    stack.add(n.left);
                }
                return sb.toString();
            }

            private static final class Frame {
                final Node node;
                boolean leftDone;
                Frame(Node node) { this.node = node; }
            }

            static Node deserialize(String data) {
                String[] t = data.split(",");
                Node root = parse(t[0]);
                if (root == null) return null;
                Deque<Frame> stack = new ArrayDeque<>();        // nodes still waiting for a child
                stack.push(new Frame(root));
                for (int i = 1; i < t.length; i++) {
                    Frame top = stack.peek();
                    Node child = parse(t[i]);
                    if (!top.leftDone) { top.node.left = child; top.leftDone = true; }
                    else { top.node.right = child; stack.pop(); }   // both children set: node complete
                    if (child != null) stack.push(new Frame(child));
                }
                return root;
            }

            private static Node parse(String s) { return s.equals("#") ? null : new Node(Integer.parseInt(s)); }

            static Node insert(Node r, int v) {                // iterative BST insert, to make random shapes
                Node n = new Node(v);
                if (r == null) return n;
                for (Node cur = r; ; ) {
                    if (v < cur.val) { if (cur.left == null) { cur.left = n; return r; } cur = cur.left; }
                    else { if (cur.right == null) { cur.right = n; return r; } cur = cur.right; }
                }
            }

            public static void main(String[] args) {
                Node root = new Node(1);
                root.left = new Node(2);
                root.right = new Node(3);
                root.right.left = new Node(4);
                root.right.right = new Node(5);
                String s = serialize(root);
                System.out.println(s);
                System.out.println(serialize(deserialize(s)).equals(s) + " " + serialize(null));

                Random rnd = new Random(297);
                for (int t = 0; t < 1_000; t++) {
                    Node r = null;
                    for (int i = rnd.nextInt(40); i > 0; i--) r = insert(r, rnd.nextInt(1000) - 500);
                    String a = serialize(r);
                    if (!serialize(deserialize(a)).equals(a)) throw new AssertionError(a);
                }
                System.out.println("1000 random trees round-trip");

                Node chain = new Node(0), cur = chain;          // skewed: recursion would overflow
                for (int i = 1; i < 100_000; i++) { cur.left = new Node(i); cur = cur.left; }
                String big = serialize(chain);
                System.out.println("skewed tree of 100000 nodes: " + (serialize(deserialize(big)).equals(big) ? "round trip ok" : "mismatch"));
            }
        }`, out: code`
        1,2,#,#,3,4,#,#,5,#,#
        true #
        1000 random trees round-trip
        skewed tree of 100000 nodes: round trip ok` },
      pitfalls: [
        "Leaving out the null markers — the preorder sequence alone is ambiguous.",
        "Building the string with `+=` in a loop (quadratic) instead of a `StringBuilder`.",
        "Recursing on a skewed tree of 10⁵ nodes and overflowing the call stack.",
        "Tokenisers that break on negative or multi-digit values."
      ],
      followUps: [
        { q: "The tree is a binary search tree. Can you make the format smaller?",
          a: "Yes — drop the null markers. The preorder of a BST is enough, because the BST property tells you where each value belongs: deserialize recursively (or with a stack) using value bounds — each node accepts values within `(lo, hi)`, values below the node go left, above go right. That is LeetCode 449, and it saves roughly half the tokens." },
        { q: "The structure is a graph with cycles — say, entities with bidirectional relations.",
          a: "Give each node an id the first time you visit it and emit a *reference* token when you meet it again, keeping an identity map of visited nodes. Without that you recurse forever — the same bug as serialising bidirectional JPA relations to JSON. Hibernate's persistence context and Jackson's `@JsonIdentityInfo` use exactly this identity-map idea." },
        { q: "The cached value is large and the format must evolve over time.",
          a: "Use a binary encoding (variable-length integers, Protocol Buffers or CBOR) and compress large values, and put a version marker at the front so old and new readers can coexist during a rolling deploy. Measure: deserialising on every cache hit may cost more CPU than you save in network bytes." }
      ],
      rubric: [
        "Explains why null markers make preorder unambiguous (or chooses level order with a clear argument).",
        "Runs in linear time with a `StringBuilder` and a straightforward tokenizer.",
        "Handles the empty tree, negative values and deep trees — iteratively, or with a stated recursion limit.",
        "Proves correctness with round-trip tests, ideally on random trees.",
        "Connects the problem to cache formats, versioning and cyclic object graphs."
      ],
      notes: [
        "The two iterative traversals mirror each other: serialization pops a node and pushes its right child before its left; deserialization tracks, for each unfinished node, whether its left child is already assigned. Walk through the example on paper once and the code becomes obvious.",
        "The round-trip test on 1,000 random trees plus a 100,000-node chain is the kind of evidence that convinces interviewers — and in production, a format change without such a test is how caches start returning corrupted data.",
        "In this course's projects, the same idea appears when caching a hierarchy (categories, comment threads, org charts) in Redis as one string rather than as many keys."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: Hibernate, JPA & Spring Data',
      lead: 'JPA questions separate people who use the annotations from people who know what SQL they produce.',
      qa: [
        { level: 1, q: "What are the entity lifecycle states, and what moves an entity between them?",
          a: "**Transient** (new): a plain object, unknown to the persistence context. `persist()` makes it **managed**: tracked, dirty-checked, written at flush. Entities loaded through `find()` or queries are managed too. **Detached**: was managed, but the persistence context closed, or `detach()`/`clear()` was called — changes are no longer tracked; `merge()` copies a detached entity's state onto a managed instance. **Removed**: `remove()` schedules a DELETE for the next flush. In Spring, a persistence context usually lives as long as the transaction, so entities returned from a `@Transactional` service method arrive detached in the controller.",
          follow: ["What happens if you call `persist()` on a detached entity?"] },
        { level: 2, q: "`persist`, `merge` and Spring Data's `save()` — what is the difference, and what surprises developers?",
          a: "`persist(entity)` makes **that object** managed and schedules an INSERT; it fails for detached entities. `merge(entity)` copies the state onto a managed instance — loading it with a SELECT if needed — and **returns the managed copy**; the argument stays detached, so later changes to it are ignored. Spring Data's `save()` calls `persist` when the entity *is new* and `merge` otherwise, where *new* means a null id (or null version). The surprise: with ids assigned in Java, `save()` thinks every entity is not new and runs a SELECT before each INSERT. Fix it by implementing `Persistable#isNew` or adding a `@Version` field, which makes new entities detectable. And always use the object `save()` returns.",
          follow: ["Why can `merge` lead to unexpected SELECT statements?"] },
        { level: 2, q: "How does dirty checking work, and why can a read-only endpoint be slow because of it?",
          a: "When an entity is loaded, Hibernate stores a snapshot of its state. At flush — before commit or before an affected query — it compares every managed entity with its snapshot and issues UPDATEs for the differences. That is why changing a managed entity inside a transaction is enough to persist it. The cost is proportional to the number of managed entities: an endpoint that loads 5,000 entities to render a report builds 5,000 snapshots and compares them all, even though nothing changed. Mark read paths `@Transactional(readOnly = true)` (no snapshots, no flush), use DTO projections that skip the persistence context, or page the data.",
          follow: ["Can you get an UPDATE without changing any field?"] },
        { level: 2, q: "How do you detect N+1 queries during development, and how do you stop them reaching production?",
          a: "In development, log SQL with bind parameters and watch a single request, or turn on Hibernate statistics (`hibernate.generate_statistics`) and look at the statement count per request. Tracing (Micrometer/OpenTelemetry) shows dozens of identical SELECT spans under one HTTP span. To stop regressions, **assert query counts in tests**: wrap the `DataSource` with a counting proxy (datasource-proxy) or read Hibernate statistics, call the endpoint, and fail when the count exceeds a budget. Set `default_batch_fetch_size` as a safety net and turn Open Session in View off, so lazy loading outside the service layer fails fast instead of silently querying.",
          follow: ["Why is SQL logging alone not enough in CI?"] },
        { level: 2, q: "What causes `LazyInitializationException`, and why is enabling Open Session in View not the fix?",
          a: "Lazy associations are loaded on first access through a proxy that needs an open session. If the access happens after the transaction — typically in a controller or during JSON serialisation of an entity — the session is closed and Hibernate throws `LazyInitializationException`. Open Session in View keeps the session open for the whole request, so the exception disappears — but every lazy access in the view becomes a hidden query (N+1), the database connection is held while the response is rendered, and data access spreads into the web layer. The real fix is to fetch what the use case needs inside the service (fetch join, entity graph, batch fetching) and return DTOs, not entities.",
          follow: ["What does `Hibernate.initialize()` do, and when is it acceptable?"] },
        { level: 2, q: "Why should `@ManyToOne` usually be LAZY although JPA's default is EAGER?",
          a: "EAGER means *always* load the association, for every query and every use case, and it cannot be switched off per query. With JPQL queries, eager to-one associations are typically fetched with **extra SELECTs per row** after the main query — an N+1 you did not ask for — and eager associations chain, so loading one entity can drag in a large graph. LAZY lets each use case decide: fetch joins or entity graphs where the data is needed, nothing where it is not. Making every association lazy and opting in to fetching is the standard, predictable approach.",
          follow: ["Does `optional = false` change how a lazy to-one association can be loaded?"] },
        { level: 2, q: "How should `equals` and `hashCode` be implemented for entities?",
          a: "They must stay consistent across the entity's lifecycle, including the moment the database assigns the id. Two safe options: (1) a **business key** that is immutable and unique (an ISBN, a username) — use it in both methods; (2) the **id**, with `equals` comparing ids only when non-null and `hashCode` returning a constant (for example `getClass().hashCode()`), so the hash does not change on persist. Use `instanceof` (not `getClass()` equality) and getters rather than fields, because Hibernate may hand you a proxy subclass whose fields are not initialised. Never use Lombok's `@Data` or include collections — that causes lazy loading and recursion.",
          follow: ["Why is a constant `hashCode` acceptable here, performance-wise?"] },
        { level: 3, q: "IDENTITY, SEQUENCE or UUID identifiers — what is the impact on batching, index locality and distributed systems?",
          a: "**IDENTITY** (MySQL `AUTO_INCREMENT`): simple, compact, ordered inserts — but Hibernate must execute each INSERT immediately to learn the id, which **disables JDBC insert batching** and write-behind. **SEQUENCE** with a pooled optimizer: Hibernate reserves blocks of ids in advance, so inserts batch well — natural on PostgreSQL and Oracle; MySQL has no native sequences. **UUIDs** assigned in Java: no round trip, batching works, ids can be generated anywhere (useful for idempotency and offline clients) — but random UUIDv4 values scatter inserts across the clustered index, causing page splits and poor cache use. **Time-ordered UUIDv7** (or similar) keeps most of the locality while staying globally unique. Store UUIDs as `BINARY(16)`, not 36-character strings.",
          follow: ["Why do random primary keys hurt InnoDB more than other databases?"] },
        { level: 3, q: "An API must page through orders together with their items. What goes wrong with `JOIN FETCH` plus `Pageable`, and what do you do instead?",
          a: "A fetch join on a collection returns one row per item, so the database cannot apply `LIMIT/OFFSET` to *orders*. Hibernate therefore loads **every matching row** and applies the page in memory (logging a warning) — fine in tests, an out-of-memory error in production. Options: (1) **two-step pagination** — query a page of order ids (database-paginated, possibly keyset), then fetch those orders with their items by id; (2) page the orders alone and load items with batch fetching (`IN (…)` queries); (3) a DTO projection for the orders plus a second query for their items, assembled in the service. Enable `fail_on_pagination_over_collection_fetch` so the problem cannot slip back in.",
          follow: ["How would keyset pagination change step one?"] },
        { level: 2, q: "What are the pitfalls of bulk updates with `@Modifying @Query(\"update …\")`?",
          a: "Bulk JPQL statements run directly against the database and **bypass the persistence context**: entities already loaded in the transaction keep their old values (and may overwrite the bulk change at flush), `@Version` is not incremented unless you do it in the statement, entity lifecycle callbacks and listeners do not run, and the second-level cache is not updated entry by entry. Use `@Modifying(flushAutomatically = true, clearAutomatically = true)` to flush pending changes before and clear stale entities after, increment the version explicitly when optimistic locking matters, and keep bulk operations in their own transaction. They are still the right tool for large changes — just treat them as SQL, not as entity operations.",
          follow: ["When is a loop over entities preferable to a bulk update?"] }
      ],
      notes: [
        "JPA interview questions nearly always come back to SQL: be ready to say how many statements an operation executes and why.",
        "The pagination question is a favourite at SDE-2 and Senior level because the naive solution passes every test with small data and fails in production.",
        "If you mention Open Session in View, say what you do instead — interviewers listen for *fetch per use case and return DTOs*."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "Inside a `@Transactional` method you load an entity, change one field and never call `save()`. What happens at commit?",
      options: ['Hibernate detects the change by dirty checking and issues an UPDATE', 'Nothing — changes are saved only by `save()`', 'An exception is thrown because the entity was modified', 'An INSERT creates a new row'], answer: 0,
      why: "The entity is managed, so at flush Hibernate compares it with its snapshot and writes the difference. `save()` on a managed entity is redundant." },
    { level: 3, q: "100 orders each reference a different customer through a lazy `@ManyToOne`. The code prints every customer's name with `hibernate.default_batch_fetch_size = 50`. How many SELECT statements run?",
      options: ['101', '3', '1', '51'], answer: 1,
      why: "One query loads the orders; batch fetching then initialises the customer proxies 50 at a time with `IN (…)` queries — 2 more. Without batch fetching it would be 1 + 100." },
    { level: 2, q: "An entity uses `GenerationType.IDENTITY` on MySQL and `hibernate.jdbc.batch_size = 50`. How are 1,000 new entities inserted?",
      options: ['With one INSERT per entity — IDENTITY prevents insert batching', 'In 20 batches of 50', 'In a single multi-row INSERT', 'The batch size is ignored only for updates'], answer: 0,
      why: "Hibernate needs each generated id immediately after persisting, so it executes every INSERT on its own. Use pre-assigned ids or a pooled sequence where batching matters." },
    { level: 2, q: "`Order managed = em.merge(detachedOrder);` Then the code calls `detachedOrder.setStatus(PAID)` and the transaction commits. Is the new status saved?",
      options: ['No — only the managed copy returned by `merge` is tracked', 'Yes — `merge` links the two objects', 'Yes, but only if `save()` is called again', 'It throws an exception at commit'], answer: 0,
      why: "`merge` copies the detached state onto a managed instance and returns it; the argument remains detached. Always continue with the returned object." },
    { level: 3, q: "`Page<Order> findAll(Pageable page)` is annotated with `@EntityGraph(attributePaths = \"items\")` and runs against a million orders. What is the risk?",
      options: ['Hibernate loads every matching row and applies the page in memory', 'The page size is silently halved', 'Items are never loaded', 'The database rejects the query'], answer: 0,
      why: "Fetching a collection makes SQL-level pagination impossible, so Hibernate paginates after loading everything. Use two-step pagination or batch fetching instead." }
  ]
});
