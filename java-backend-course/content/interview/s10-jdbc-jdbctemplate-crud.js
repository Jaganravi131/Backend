/* Interview pack — Session 10: JDBC, JdbcTemplate & CRUD on MySQL */
COURSE.prep(10, {
  deepDives: [
    {
      title: 'Deep dive: transactions in InnoDB — MVCC, locks and anomalies',
      lead: 'Isolation levels are defined by the anomalies they prevent. Senior interviews go further: what InnoDB actually does, and which bugs survive the default level.',
      table: { head: ['Isolation level', 'Dirty read', 'Non-repeatable read', 'Phantom', 'Notes for MySQL InnoDB'], rows: [
        ['READ UNCOMMITTED', 'possible', 'possible', 'possible', 'Almost never appropriate'],
        ['READ COMMITTED', 'prevented', 'possible', 'possible', 'Each statement reads a fresh snapshot (PostgreSQL\'s default)'],
        ['REPEATABLE READ', 'prevented', 'prevented', 'prevented for plain reads', 'InnoDB default: one snapshot per transaction; locking reads use next-key locks'],
        ['SERIALIZABLE', 'prevented', 'prevented', 'prevented', 'Plain SELECTs become locking reads when autocommit is off']
      ] },
      points: [
        "**MVCC**: InnoDB keeps older row versions in undo logs. A plain (consistent) read sees a snapshot — taken at the transaction's first read under REPEATABLE READ — so readers never block writers and writers never block readers.",
        "**Locking reads** (`SELECT … FOR UPDATE` / `FOR SHARE`) and `UPDATE`/`DELETE` read the **latest committed** version and lock it. **Next-key locks** (record + gap) on scanned index ranges block inserts into the range, which prevents phantoms for locking reads.",
        "**Lost update**: two transactions read balance 100 and both write back `100 − 30` — one withdrawal vanishes, and InnoDB's REPEATABLE READ does not detect it. Fixes: an atomic conditional `UPDATE`, pessimistic `SELECT … FOR UPDATE`, or an optimistic `version` column.",
        "**Write skew** survives snapshot isolation: two on-call doctors each see *someone else is on call* and both go off call. Lock the rows the decision depends on, materialise the conflict in one row both must update, or use SERIALIZABLE.",
        "**Deadlocks** are normal under contention: InnoDB detects the cycle and rolls back the transaction that is cheapest to undo. Keep transactions short, touch rows in a consistent order, and retry the whole transaction.",
        "Pool sizing: HikariCP's guidance starts from `connections = (cores × 2) + effective spindles` — a small pool (often 10–20) beats hundreds of connections because the database can only run so much in parallel."
      ],
      code: [
        { lang: 'sql', file: 'conditional-updates.sql', label: 'statements', setup: true, src: code`
          CREATE TABLE account (
            id      INTEGER PRIMARY KEY,
            balance INTEGER NOT NULL CHECK (balance >= 0),
            version INTEGER NOT NULL DEFAULT 0
          );
          INSERT INTO account (id, balance) VALUES (1, 100);

          -- withdrawal A (70): check and update in ONE statement - no read-modify-write in Java
          UPDATE account SET balance = balance - 70, version = version + 1
          WHERE id = 1 AND balance >= 70;                 -- 1 row affected

          -- withdrawal B (50): the condition is false now -> 0 rows affected -> "insufficient funds"
          UPDATE account SET balance = balance - 50, version = version + 1
          WHERE id = 1 AND balance >= 50;                 -- 0 rows affected

          -- optimistic locking: a writer that read version 0 earlier is now stale -> 0 rows, re-read and retry
          UPDATE account SET balance = 999, version = version + 1
          WHERE id = 1 AND version = 0;                   -- 0 rows affected` },
        { lang: 'sql', file: 'check.sql', label: 'final state', src: code`
          SELECT id, balance, version FROM account;`, out: code`
          id | balance | version
          1  | 30      | 1` }
      ],
      notes: [
        "The script is verified on SQLite by the course test suite and behaves identically on MySQL. In Java, read the affected-row count — `jdbcTemplate.update(...)` returns it — and translate `0` into *insufficient funds* or *stale version, retry*. That single number replaces a whole class of race conditions.",
        "Why doesn't InnoDB's REPEATABLE READ catch lost updates? Because `UPDATE` always works on the latest committed row, not the snapshot; if the application computed the new value from an old snapshot, the update silently overwrites. PostgreSQL's REPEATABLE READ instead aborts the second writer with a serialization failure — a common interview contrast.",
        "Deadlock retries belong around the whole transaction, not around the statement that failed: after a deadlock the transaction is already rolled back."
      ]
    },
    {
      title: 'Deep dive: indexes — B+trees, covering indexes & reading EXPLAIN',
      lead: 'Most backend performance problems are missing or misused indexes. Interviewers expect you to design one from a query and to read a plan.',
      table: { head: ['`EXPLAIN` type', 'Meaning', 'Typical cause'], rows: [
        ['`const` / `eq_ref`', 'At most one matching row via a unique index', 'Lookup by primary key or unique key'],
        ['`ref`', 'Several rows via a non-unique index prefix', '`WHERE group_id = ?` on an index starting with `group_id`'],
        ['`range`', 'Index range scan', '`BETWEEN`, `>`, `IN (…)` on indexed columns'],
        ['`index`', 'Full scan of an index', 'The index covers the query but no prefix filters it'],
        ['`ALL`', 'Full table scan', 'No usable index — fine for tiny tables, a red flag otherwise']
      ] },
      points: [
        "InnoDB tables are **clustered** on the primary key: the B+tree leaves hold whole rows in key order. A secondary index stores its columns plus the primary key, so a lookup through it descends a second tree to fetch the row.",
        "Each 16 KB page holds hundreds of keys, so three or four levels cover hundreds of millions of rows — an indexed lookup is a handful of page reads, mostly from the buffer pool.",
        "**Leftmost prefix**: an index on `(group_id, created_at)` serves `WHERE group_id = ?`, `WHERE group_id = ? AND created_at > ?` and `ORDER BY created_at` within one group — but generally not `WHERE created_at > ?` on its own.",
        "**Covering index**: when every column a query needs is in the index, InnoDB skips the row lookup (`Using index` in `EXPLAIN`'s Extra). `SELECT *` defeats this.",
        "Random UUIDv4 primary keys scatter inserts across the clustered index (page splits, poor caching); prefer `BIGINT AUTO_INCREMENT` or time-ordered UUIDv7 keys.",
        "Read plans with `EXPLAIN` (type, key, rows, Extra such as `Using filesort`/`Using temporary`) and confirm with `EXPLAIN ANALYZE` (MySQL 8.0.18+), which runs the query and reports actual rows and time per step."
      ],
      code: { lang: 'sql', file: 'index-design.sql', src: code`
        -- query: latest 20 expenses of a group since a date
        SELECT id, payer_id, amount, created_at
        FROM expense
        WHERE group_id = ? AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 20;

        -- equality column first, then the range/sort column; add the selected columns to make it covering
        CREATE INDEX idx_expense_group_created
          ON expense (group_id, created_at DESC, id, payer_id, amount);

        -- verify: expect a range scan on idx_expense_group_created, no filesort
        EXPLAIN ANALYZE
        SELECT id, payer_id, amount, created_at FROM expense
        WHERE group_id = 42 AND created_at >= '2026-10-01'
        ORDER BY created_at DESC LIMIT 20;` },
      notes: [
        "Column order rule of thumb: equality predicates first, then the range or ordering column. Reversing it — `(created_at, group_id)` — forces a scan over every group's rows in the date range.",
        "Indexes are not free: each one slows writes (every insert updates every index) and uses memory in the buffer pool. Remove unused indexes; MySQL's `sys.schema_unused_indexes` view lists candidates.",
        "Functions on indexed columns (`WHERE DATE(created_at) = ?`, `WHERE LOWER(email) = ?`) prevent normal index use — rewrite as a range, or create a functional index (MySQL 8.0.13+)."
      ]
    }
  ],

  stretch: [
    "Reproduce a lost update with two concurrent transactions against MySQL in Testcontainers, then fix it three ways — an atomic `UPDATE … WHERE balance >= ?`, `SELECT … FOR UPDATE`, and a `version` column — with one test per fix.",
    "Insert one million rows with `JdbcTemplate.batchUpdate` in batches of 1,000, with and without `rewriteBatchedStatements=true` on the JDBC URL, and report rows per second for each.",
    "Add the `(group_id, created_at)` index and use `EXPLAIN ANALYZE` to show the group-expenses query changing from a full scan to an index range scan."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round (SQL): top three salaries per department',
      lead: 'Backend loops often include a SQL round. This one tests window functions, tie semantics and whether you can do it without them.',
      difficulty: 'Hard', minutes: 30, lc: 185, pattern: ['sql'],
      problem: [
        "Tables: `employee(id, name, salary, department_id)` and `department(id, name)`.",
        "A **high earner** is an employee whose salary is among the **top three distinct salaries** of their department. Write a query that returns `department`, `employee` and `salary` for every high earner, ordered by department, then salary descending, then name. It must run on MySQL 8.",
        "Then write a second version **without window functions** (for older databases) and explain the performance of both."
      ],
      examples: [
        { in: 'IT salaries: Max 90000, Joe 85000, Randy 85000, Will 70000, Janet 69000\nSales salaries: Henry 80000, Sam 60000', out: 'IT: Max, Joe, Randy, Will\nSales: Henry, Sam',
          why: "IT's top three *distinct* salaries are 90000, 85000 and 70000 — both 85000 earners are included and Janet is not." }
      ],
      constraints: ["`employee` may hold millions of rows", "Salaries may tie; ties share a rank", "Departments with fewer than three distinct salaries return all their employees"],
      hints: [
        "Top-N per group needs a ranking *within* each department. Which window function ranks ties without leaving gaps?",
        "For 90k, 85k, 85k, 70k: `DENSE_RANK()` gives 1, 2, 2, 3; `RANK()` gives 1, 2, 2, 4; `ROW_NUMBER()` gives 1, 2, 3, 4. Which one matches *top three distinct salaries*?",
        "Without window functions: keep an employee if fewer than three **distinct** salaries in the same department are higher than theirs — a correlated subquery."
      ],
      approaches: [
        { name: 'Correlated subquery', idea: 'Count distinct higher salaries in the same department; keep rows where that count is below 3', time: 'O(n²) worst case; much better with an index', space: 'O(1) extra' },
        { name: 'DENSE_RANK window', idea: 'Rank salaries within each department partition, filter rank ≤ 3 in an outer query', time: 'O(n log n) for the partition sort', space: 'O(n)' },
        { name: 'In the application', idea: 'Fetch every row and group in Java', time: 'O(n log n)', space: 'O(n) plus the cost of shipping every row' }
      ],
      code: [
        { lang: 'sql', file: 'schema.sql', label: 'schema + data', setup: true, src: code`
          CREATE TABLE department (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
          CREATE TABLE employee (
            id            INTEGER PRIMARY KEY,
            name          TEXT    NOT NULL,
            salary        INTEGER NOT NULL,
            department_id INTEGER NOT NULL REFERENCES department (id)
          );
          CREATE INDEX idx_employee_dept_salary ON employee (department_id, salary DESC);
          INSERT INTO department VALUES (1, 'IT'), (2, 'Sales');
          INSERT INTO employee VALUES
            (1, 'Joe', 85000, 1), (2, 'Henry', 80000, 2), (3, 'Sam', 60000, 2), (4, 'Max', 90000, 1),
            (5, 'Janet', 69000, 1), (6, 'Randy', 85000, 1), (7, 'Will', 70000, 1);` },
        { lang: 'sql', file: 'window.sql', label: 'DENSE_RANK', src: code`
          SELECT department, employee, salary
          FROM (
            SELECT d.name AS department, e.name AS employee, e.salary,
                   DENSE_RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS rnk
            FROM employee e
            JOIN department d ON d.id = e.department_id
          ) ranked
          WHERE rnk <= 3                         -- a window result can only be filtered from outside
          ORDER BY department, salary DESC, employee;`, out: code`
          department | employee | salary
          IT         | Max      | 90000
          IT         | Joe      | 85000
          IT         | Randy    | 85000
          IT         | Will     | 70000
          Sales      | Henry    | 80000
          Sales      | Sam      | 60000` },
        { lang: 'sql', file: 'no-window.sql', label: 'without window functions', src: code`
          SELECT d.name AS department, e.name AS employee, e.salary
          FROM employee e
          JOIN department d ON d.id = e.department_id
          WHERE (SELECT COUNT(DISTINCT e2.salary)
                 FROM employee e2
                 WHERE e2.department_id = e.department_id
                   AND e2.salary > e.salary) < 3      -- fewer than 3 distinct salaries above mine
          ORDER BY department, salary DESC, employee;`, out: code`
          department | employee | salary
          IT         | Max      | 90000
          IT         | Joe      | 85000
          IT         | Randy    | 85000
          IT         | Will     | 70000
          Sales      | Henry    | 80000
          Sales      | Sam      | 60000` }
      ],
      pitfalls: [
        "`RANK()` or `ROW_NUMBER()` instead of `DENSE_RANK()`: with ties they drop people who share a top-three salary or include the wrong ones.",
        "Filtering on the window function in the same query's `WHERE` — not allowed; wrap it in a subquery or CTE.",
        "`LIMIT 3` returns the top three overall, not per department.",
        "No index on `(department_id, salary)`: the correlated version then scans the table once per employee."
      ],
      followUps: [
        { q: "A dashboard runs this every minute over 50 million employees. Make it cheap.",
          a: "The index `(department_id, salary DESC)` lets the database read each department's salaries pre-sorted, but recomputing a window over 50 million rows every minute is still wasteful when salaries change rarely. Precompute: maintain a small `department_top_salaries` table updated by a scheduled job or change-data-capture, or cache the result with a TTL and invalidate it on salary changes." },
        { q: "Also show each employee's share of the department payroll and a running total by salary.",
          a: "Window aggregates: `ROUND(100.0 * salary / SUM(salary) OVER (PARTITION BY department_id), 1)` for the share, and `SUM(salary) OVER (PARTITION BY department_id ORDER BY salary DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` for the running total. Use `ROWS` rather than the default `RANGE` framing, otherwise tied salaries are summed together." },
        { q: "Run it from Spring and map the rows to a record.",
          a: "With `JdbcClient`: `jdbcClient.sql(sql).query(HighEarner.class).list()` — it maps columns to the record's components by name (`department`, `employee`, `salary`). With `JdbcTemplate`: `jdbcTemplate.query(sql, (rs, n) -> new HighEarner(rs.getString(\"department\"), rs.getString(\"employee\"), rs.getInt(\"salary\")))`." }
      ],
      rubric: [
        "Chooses `DENSE_RANK` and explains the tie semantics of all three ranking functions.",
        "Correct structure: the window in a subquery or CTE, the join, the filter and a deterministic `ORDER BY`.",
        "Provides a version without window functions and states the complexity of both.",
        "Proposes the supporting index and reasons about scale, caching or precomputation."
      ],
      notes: [
        "Both queries are executed by the course's SQL verifier against the sample data on SQLite and must produce identical tables; they use only standard SQL that MySQL 8 runs unchanged. LeetCode's version names the column `departmentId`.",
        "In an interview, say the tie semantics out loud before writing anything — *top three distinct salaries, so two people at 85,000 both count and the next salary is still third*. Many candidates lose this round on that single point.",
        "If asked which version is faster: the window version sorts each partition once (O(n log n)); the correlated version can be fast with the right index but degrades badly without it. Check with `EXPLAIN ANALYZE` rather than guessing."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: JDBC, SQL & transactions',
      lead: 'Database questions are where backend interviews get concrete: isolation, locking, indexing, pooling and bulk loading.',
      qa: [
        { level: 1, q: "`Statement` versus `PreparedStatement` — why is the prepared one safer, and when is it faster?",
          a: "A `PreparedStatement` sends the SQL text with `?` placeholders separately from the parameter values, so user input is always treated as **data**, never as SQL — that defeats SQL injection such as `' OR '1'='1`. It can also be faster: the database (or driver) parses and plans the statement once and reuses the plan for different parameters, and batching works naturally. Placeholders only work for values, not identifiers: a user-chosen `ORDER BY` column must be validated against an allow-list before being concatenated. With MySQL Connector/J, statements are prepared client-side by default; server-side preparation and statement caching are opt-in settings.",
          follow: ["How would you safely support a user-selected sort column?"] },
        { level: 1, q: "Explain ACID using a money transfer.",
          a: "Transfer ₹500 from A to B. **Atomicity**: both the debit and the credit happen, or neither does — a crash in between leaves no half-transfer, thanks to the undo log and rollback. **Consistency**: the transaction moves the database from one valid state to another, respecting constraints such as `balance >= 0` and foreign keys. **Isolation**: concurrent transactions do not see each other's partial work — another query never sees the money missing from both accounts — to the degree set by the isolation level. **Durability**: once committed, the transfer survives a crash because the redo log was flushed to disk (with `innodb_flush_log_at_trx_commit = 1`, the default).",
          follow: ["Which of the four properties does the isolation level relax?"] },
        { level: 2, q: "What does REPEATABLE READ guarantee in InnoDB, and how does it differ from PostgreSQL?",
          a: "In InnoDB, REPEATABLE READ (the default) gives each transaction a **consistent snapshot** taken at its first read, so repeated plain SELECTs return the same rows — no non-repeatable reads and, for plain reads, no phantoms. Locking reads and writes, however, operate on the **latest committed** data and use next-key locks. Consequence: a read-modify-write based on the snapshot can silently overwrite another transaction's committed change (a lost update). PostgreSQL defaults to READ COMMITTED; its REPEATABLE READ is snapshot isolation that **aborts** the second of two conflicting writers with a serialization failure, which the application must retry. So the same code can lose updates on MySQL and throw on PostgreSQL.",
          follow: ["How would you write the transfer so it is correct on both databases?"] },
        { level: 2, q: "Two requests withdraw from the same account at the same time. How do you prevent a lost update?",
          a: [
            "**Atomic SQL**: `UPDATE account SET balance = balance - :amt WHERE id = :id AND balance >= :amt` and check the affected-row count — no read-modify-write in Java at all. Simplest and fastest.",
            "**Pessimistic locking**: `SELECT … FOR UPDATE` inside the transaction, then update; the second request waits for the first to commit. Good when the logic is complex and contention is high — keep the transaction short.",
            "**Optimistic locking**: a `version` column; `UPDATE … SET …, version = version + 1 WHERE id = ? AND version = ?`; zero rows means someone else won — re-read and retry, or return 409. Good when conflicts are rare (JPA's `@Version` does this).",
            "Whatever you choose, keep a `CHECK (balance >= 0)` constraint as the last line of defence."
          ],
          follow: ["Which approach would you choose for a flash sale on one product?"] },
        { level: 2, q: "What is a database deadlock, how does InnoDB handle it, and how should the application respond?",
          a: "Two transactions each hold a lock the other needs — for example, T1 locks account A and wants B while T2 locks B and wants A. InnoDB's deadlock detector finds the cycle immediately and rolls back one transaction (the one cheaper to undo) with error 1213, *Deadlock found when trying to get lock*; Spring translates it into a `DeadlockLoserDataAccessException` / `CannotAcquireLockException`. The application should **retry the whole transaction** a few times with backoff — the work was rolled back, so retrying is safe if the transaction is self-contained. Reduce deadlocks by keeping transactions short, accessing rows in a consistent order (sort ids before locking), and indexing the columns in `WHERE` clauses so locks cover fewer rows. `SHOW ENGINE INNODB STATUS` shows the latest deadlock.",
          follow: ["Why can a missing index increase deadlocks?"] },
        { level: 2, q: "How do you size a connection pool, and what happens when it is exhausted?",
          a: "A database can only execute a limited number of queries truly in parallel (roughly its CPU cores plus I/O concurrency), so more connections beyond that just queue inside the database and add context switching. HikariCP's guidance starts from `(cores × 2) + effective spindles` on the database server, which usually means **10–20 connections** per service instance (HikariCP's default is 10). Multiply by the number of instances and keep the total under the database's `max_connections` (151 by default in MySQL). When the pool is exhausted, threads wait for a connection up to `connectionTimeout` (30 s by default) and then fail with `SQLTransientConnectionException` — latency spikes first, errors follow. Watch active, idle and *pending* connections; pending > 0 for long means the pool or the queries need attention.",
          follow: ["Why can a bigger pool make things slower?", "What does Little's law tell you about the pool size you need?"] },
        { level: 2, q: "Design an index for `SELECT … FROM expense WHERE group_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 20`, and explain why column order matters.",
          a: "Create `(group_id, created_at)` — equality column first, range/sort column second. The B+tree is sorted by `group_id` and then by `created_at` within each group, so the database seeks to the group, walks the date range in order and stops after 20 rows — no filesort. Reversed, `(created_at, group_id)`, the database would scan every group's rows in the date range and filter them. Appending the selected columns (or keeping the projection small) makes it a **covering index** that never touches the table rows. Confirm with `EXPLAIN` (`range` on the index, no *Using filesort*) and `EXPLAIN ANALYZE` for real row counts.",
          follow: ["When would you not add an index even though a query would benefit?"] },
        { level: 2, q: "How does Spring translate `SQLException` into exceptions like `DuplicateKeyException`, and why does it matter?",
          a: "JDBC reports every database problem as a checked `SQLException` carrying a vendor-specific error code (MySQL uses 1062 for a duplicate key) and an SQLState. Spring's `SQLExceptionTranslator` maps those codes into the unchecked, portable `DataAccessException` hierarchy — `DuplicateKeyException`, `DataIntegrityViolationException`, `CannotAcquireLockException`, `QueryTimeoutException`. Your service code can then react to *what happened* — return 409 for a duplicate e-mail, retry on lock failure — without parsing vendor codes or depending on MySQL. And because the exceptions are unchecked, they propagate cleanly and trigger transaction rollback by default.",
          follow: ["Should you check for duplicates with a SELECT before inserting?"] },
        { level: 3, q: "A nightly job inserts five million rows over JDBC and takes three hours. How do you get it down to minutes?",
          a: [
            "**Batch**: `addBatch`/`executeBatch` (or `JdbcTemplate.batchUpdate`) in batches of 1,000–5,000 rows, with `rewriteBatchedStatements=true` so MySQL Connector/J sends multi-row inserts instead of one round trip per row.",
            "**Transactions**: turn off auto-commit and commit per batch — not per row (fsync per row) and not one giant transaction (huge undo log, long locks).",
            "**Bulk path**: for very large loads, `LOAD DATA [LOCAL] INFILE` is far faster than any INSERT.",
            "**Schema**: load into a staging table without secondary indexes, then build indexes or `INSERT … SELECT` into the target; avoid ORM entity overhead for bulk work.",
            "**Parallelism and safety**: partition the input and load partitions concurrently (watch lock contention), make the job idempotent with upserts (`INSERT … ON DUPLICATE KEY UPDATE`) and checkpoints so a failure restarts from the last batch.",
            "**Measure** rows per second after each change rather than guessing."
          ],
          follow: ["How do you keep the job from hurting daytime traffic if it overruns?"] },
        { level: 3, q: "Two on-call doctors both go off call at the same moment, leaving nobody on call. Why doesn't REPEATABLE READ prevent this, and how do you fix it?",
          a: "Each transaction checks `SELECT COUNT(*) FROM doctor WHERE shift = 1 AND on_call` (sees 2), then updates **its own** row to off-call. Under snapshot isolation each transaction sees its own consistent snapshot, the two updates touch **different rows**, so there is no write-write conflict — both commit, and the invariant *at least one doctor on call* is broken. This is **write skew**. Fixes: make the check a locking read (`SELECT … FOR UPDATE` on the rows of that shift), so the second transaction waits and then re-evaluates; **materialise the conflict** by having both transactions update a shared row (a `shift` row with an on-call counter) so they genuinely collide; enforce the rule with a constraint or trigger if possible; or run this transaction at SERIALIZABLE and retry on failure.",
          follow: ["Give another real-world example of write skew."] }
      ],
      notes: [
        "Database questions reward precision: name the isolation level, the anomaly and the exact SQL. *Use a transaction* is never a complete answer — transactions at REPEATABLE READ still allow lost updates and write skew in InnoDB.",
        "The connection-pool question is a favourite because it combines queueing theory with operations; mention pending-connection metrics and the total across instances.",
        "For Senior candidates, interviewers often switch from *how* to *what would you measure*: plans, rows examined, lock waits and deadlock logs."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "Which anomaly does InnoDB's default REPEATABLE READ prevent for plain SELECTs that READ COMMITTED allows?",
      options: ['Dirty reads', 'Non-repeatable reads', 'Lost updates', 'Write skew'], answer: 1,
      why: "Under REPEATABLE READ the whole transaction reads one snapshot, so re-reading a row returns the same value. Dirty reads are prevented by both levels; lost updates and write skew are prevented by neither." },
    { level: 2, q: "An index exists on `(user_id, created_at)`. Which query can use it for both filtering and ordering?",
      options: ['`WHERE user_id = ? ORDER BY created_at DESC`', '`WHERE created_at > ?`', '`WHERE user_id = ? ORDER BY amount`', '`WHERE LOWER(user_id) = ?`'], answer: 0,
      why: "The leftmost column is fixed by equality, so rows of that user are already sorted by `created_at`. Filtering only on `created_at` skips the leftmost column, ordering by `amount` is not in the index, and a function on the column prevents normal index use." },
    { level: 3, q: "Two transactions at REPEATABLE READ on InnoDB both `SELECT balance` (100), then each runs `UPDATE account SET balance = <value computed in Java>` — 70 and 50. What is the result?",
      options: ['The last committer\'s value (70 or 50) wins — one withdrawal is lost', 'The balance becomes 20', 'The second transaction fails with a serialization error', 'The balance stays 100'], answer: 0,
      why: "InnoDB does not detect lost updates at REPEATABLE READ: `UPDATE` overwrites the latest row with the value computed from an old snapshot. Use `balance = balance - 30` with a condition, `FOR UPDATE`, or a version column. (PostgreSQL's REPEATABLE READ would raise a serialization failure instead.)" },
    { level: 2, q: "Each service instance uses HikariCP with `maximumPoolSize = 10`, and MySQL has `max_connections = 151`. You scale from 8 to 20 instances. What happens?",
      options: ['Up to 200 connections exceed the limit, so new instances fail with *Too many connections*', 'HikariCP shares connections between instances', 'MySQL queues the extra connections until others close', 'Nothing changes'], answer: 0,
      why: "Pools are per instance, so the total is instances × pool size. Plan the total against `max_connections`, or put a proxy such as ProxySQL in front when instance counts vary." },
    { level: 2, q: "`SELECT name FROM employee WHERE id NOT IN (SELECT manager_id FROM employee)` returns no rows, although many employees manage nobody. Why?",
      options: ['`manager_id` contains a NULL, and `x NOT IN (…, NULL)` is never true', 'The subquery is evaluated only once', '`NOT IN` cannot be used with subqueries', 'MySQL caches the empty result'], answer: 0,
      why: "With a NULL in the list, `NOT IN` evaluates to UNKNOWN for every row. Use `NOT EXISTS (SELECT 1 FROM employee m WHERE m.manager_id = e.id)` or filter the NULLs out." }
  ]
});
