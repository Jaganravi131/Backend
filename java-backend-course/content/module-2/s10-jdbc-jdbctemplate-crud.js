COURSE.session({
  no: 10,
  short: 'JDBC, JdbcTemplate & CRUD',
  title: 'JDBC, DDL/DML, Spring JdbcTemplate, CRUD Operations & RowMapper',
  covers: [4, 5],
  objectives: [
    "Write DDL and DML for a relational schema with keys, constraints and indexes (MySQL 8.4).",
    "Use plain JDBC safely: connections, PreparedStatement, ResultSet, generated keys, transactions.",
    "Replace JDBC boilerplate with Spring's JdbcTemplate/JdbcClient and map rows with RowMapper.",
    "Implement full CRUD behind a REST API with `@Transactional` services and translated exceptions."
  ],
  prereq: "Session 9 (layered REST API). Docker installed to run MySQL locally.",
  slides: [
    {
      type: 'theory',
      title: 'Relational databases & the SQL families',
      lead: 'Data lives in **tables** of rows and columns, linked by **keys**. SQL statements fall into five families.',
      diagram: { kind: 'grid', cols: 5, items: [
        { t: 'DDL', s: 'CREATE, ALTER, DROP, TRUNCATE — define structure', tone: 'blue' },
        { t: 'DML', s: 'INSERT, UPDATE, DELETE — change data', tone: 'green' },
        { t: 'DQL', s: 'SELECT — read data', tone: 'purple' },
        { t: 'TCL', s: 'COMMIT, ROLLBACK, SAVEPOINT', tone: 'orange' },
        { t: 'DCL', s: 'GRANT, REVOKE — permissions', tone: 'gray' }
      ] },
      points: [
        "**Primary key** identifies a row; **foreign key** references another table's key and enforces integrity.",
        "**Constraints** (`NOT NULL`, `UNIQUE`, `CHECK`, `FOREIGN KEY`) are the last line of defence for data quality.",
        "**Normalisation** (1NF–3NF) removes duplication; **indexes** speed up lookups at some write cost.",
        "**ACID** transactions: Atomicity, Consistency, Isolation, Durability."
      ],
      notes: [
        "MySQL 8.4 is the current LTS line and what our Docker setup uses. InnoDB (the default engine) gives us transactions, row-level locking and foreign keys.",
        "Keep validation in layers: Bean Validation at the API edge, business rules in services, and *constraints in the database* — the only layer that sees every writer, including scripts and other services.",
        "Normalisation in one sentence per form: 1NF — atomic values, no repeating groups; 2NF — every non-key column depends on the whole key; 3NF — no non-key column depends on another non-key column."
      ]
    },
    {
      type: 'practical',
      title: 'DDL & DML for the Splitwise core',
      lead: 'Start MySQL in Docker, create users and groups with real constraints, then query them with a JOIN.',
      code: [
        { lang: 'bash', label: 'Start MySQL', src: code`
          $ docker run -d --name splitwise-db -p 3306:3306 \
              -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=splitwise \
              -e MYSQL_USER=app -e MYSQL_PASSWORD=apppw  mysql:8.4
          $ docker exec -it splitwise-db mysql -uapp -papppw splitwise` },
        { lang: 'sql', file: 'schema.sql', label: 'DDL', src: code`
          CREATE TABLE users (
            id            BIGINT AUTO_INCREMENT PRIMARY KEY,
            email         VARCHAR(255) NOT NULL UNIQUE,
            display_name  VARCHAR(100) NOT NULL,
            created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
          );

          -- "groups" is a reserved word in MySQL 8, hence expense_groups
          CREATE TABLE expense_groups (
            id          BIGINT AUTO_INCREMENT PRIMARY KEY,
            name        VARCHAR(100) NOT NULL,
            created_by  BIGINT       NOT NULL,
            created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_group_creator FOREIGN KEY (created_by) REFERENCES users (id)
          );

          CREATE TABLE group_members (
            group_id   BIGINT NOT NULL,
            user_id    BIGINT NOT NULL,
            role       ENUM('ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
            joined_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, user_id),                          -- composite key: no duplicates
            CONSTRAINT fk_gm_group FOREIGN KEY (group_id) REFERENCES expense_groups (id) ON DELETE CASCADE,
            CONSTRAINT fk_gm_user  FOREIGN KEY (user_id)  REFERENCES users (id)
          );

          CREATE TABLE wallets (
            user_id  BIGINT PRIMARY KEY,
            balance  DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            CONSTRAINT chk_balance_non_negative CHECK (balance >= 0),
            CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users (id)
          );

          CREATE INDEX idx_groups_created_by ON expense_groups (created_by);
          ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL AFTER display_name;` },
        { lang: 'sql', label: 'DML + query', src: code`
          INSERT INTO users (email, display_name) VALUES
            ('asha@example.com', 'Asha'), ('ravi@example.com', 'Ravi'), ('meera@example.com', 'Meera');
          INSERT INTO expense_groups (name, created_by) VALUES ('Goa Trip', 1);
          INSERT INTO group_members (group_id, user_id, role) VALUES (1, 1, 'ADMIN'), (1, 2, 'MEMBER'), (1, 3, 'MEMBER');

          UPDATE users SET display_name = 'Asha K' WHERE id = 1;
          DELETE FROM group_members WHERE group_id = 1 AND user_id = 3;

          SELECT g.name, u.display_name, gm.role
          FROM group_members gm
          JOIN expense_groups g ON g.id = gm.group_id
          JOIN users u          ON u.id = gm.user_id
          WHERE g.id = 1
          ORDER BY gm.role, u.display_name;`, out: code`
          +----------+--------------+--------+
          | name     | display_name | role   |
          +----------+--------------+--------+
          | Goa Trip | Asha K       | ADMIN  |
          | Goa Trip | Ravi         | MEMBER |
          +----------+--------------+--------+` }
      ],
      notes: [
        "Always write `WHERE` on UPDATE/DELETE — try running the DELETE without it on a copy to feel the danger. MySQL Workbench's 'safe updates' mode exists for this reason.",
        "`DECIMAL(12,2)` stores money exactly; `FLOAT`/`DOUBLE` never. `TRUNCATE` (DDL) empties a table fast and resets AUTO_INCREMENT; `DELETE` (DML) removes rows one by one and can be rolled back.",
        "`ON DELETE CASCADE` on memberships means deleting a group removes its memberships automatically — but we deliberately did *not* cascade from users, so deleting a user with groups fails instead of silently destroying data."
      ]
    },
    {
      type: 'theory',
      title: 'JDBC architecture',
      lead: 'JDBC is Java\'s standard API for relational databases. Your code talks to interfaces; a vendor **driver** implements them.',
      diagram: { kind: 'layers', items: [
        { t: 'Your code', tone: 'blue', parts: ['Repository / DAO classes'] },
        { t: 'JDBC API (java.sql / javax.sql)', tone: 'green', parts: ['DataSource', 'Connection', 'PreparedStatement', 'ResultSet', 'SQLException'] },
        { t: 'Connection pool', s: 'HikariCP — Spring Boot default', tone: 'yellow', parts: ['reuses open connections', 'max pool size', 'timeouts'] },
        { t: 'JDBC driver', s: 'com.mysql:mysql-connector-j', tone: 'orange', parts: ['speaks the MySQL wire protocol'] },
        { t: 'MySQL server', tone: 'purple' }
      ] },
      points: [
        "URL format: `jdbc:mysql://host:3306/splitwise`.",
        "Opening a TCP connection + authentication is slow → production code always uses a **pool** via `DataSource`.",
        "Every `Connection`, `Statement` and `ResultSet` must be closed → try-with-resources (Session 2)."
      ],
      notes: [
        "Because JDBC is just interfaces, switching from MySQL to PostgreSQL mostly means swapping the driver and fixing vendor-specific SQL.",
        "HikariCP is fast and has sane defaults (10 connections). A pool that is too small makes requests queue for connections; one that is too large overloads the database. Size it from measurements, not guesses."
      ]
    },
    {
      type: 'practical',
      title: 'Plain JDBC: CRUD, generated keys & a transaction',
      lead: 'The raw API — powerful, but notice how much ceremony every operation needs.',
      code: { lang: 'java', file: 'JdbcDemo.java', verify: 'compile', src: code`
        import java.math.BigDecimal;
        import java.sql.*;

        public class JdbcDemo {
            static final String URL = "jdbc:mysql://localhost:3306/splitwise";

            public static void main(String[] args) throws SQLException {
                try (Connection con = DriverManager.getConnection(URL, "app", System.getenv("DB_PASSWORD"))) {
                    long id = insertUser(con, "zoya@example.com", "Zoya");
                    System.out.println("inserted user id=" + id);

                    String sql = "SELECT id, email, display_name FROM users WHERE email = ?";
                    try (PreparedStatement ps = con.prepareStatement(sql)) {
                        ps.setString(1, "zoya@example.com");              // bound parameter, never concatenated
                        try (ResultSet rs = ps.executeQuery()) {
                            while (rs.next()) {
                                System.out.println(rs.getLong("id") + " " + rs.getString("email")
                                        + " " + rs.getString("display_name"));
                            }
                        }
                    }

                    con.setAutoCommit(false);                             // begin transaction
                    try (PreparedStatement debit = con.prepareStatement(
                                 "UPDATE wallets SET balance = balance - ? WHERE user_id = ?");
                         PreparedStatement credit = con.prepareStatement(
                                 "UPDATE wallets SET balance = balance + ? WHERE user_id = ?")) {
                        BigDecimal amount = new BigDecimal("500.00");
                        debit.setBigDecimal(1, amount);  debit.setLong(2, 1);
                        credit.setBigDecimal(1, amount); credit.setLong(2, 2);
                        debit.executeUpdate();                            // CHECK (balance >= 0) may fail here
                        credit.executeUpdate();
                        con.commit();                                     // both updates, or...
                    } catch (SQLException e) {
                        con.rollback();                                   // ...neither
                        throw e;
                    }
                }
            }

            static long insertUser(Connection con, String email, String name) throws SQLException {
                String sql = "INSERT INTO users (email, display_name) VALUES (?, ?)";
                try (PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, email);
                    ps.setString(2, name);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        keys.next();
                        return keys.getLong(1);
                    }
                }
            }
        }`, out: code`
        inserted user id=4
        4 zoya@example.com Zoya` },
      notes: [
        "Count the boilerplate: getting connections, three nested try-with-resources, manual mapping column by column, checked `SQLException` everywhere, manual commit/rollback. JdbcTemplate removes all of it.",
        "The transfer shows **atomicity**: if the debit violates the `CHECK (balance >= 0)` constraint, the rollback guarantees the credit never happens.",
        "Run with the driver on the classpath, e.g. `java -cp .:mysql-connector-j.jar JdbcDemo`; modern drivers register themselves automatically (no `Class.forName` needed)."
      ]
    },
    {
      type: 'theory',
      title: 'SQL injection & why PreparedStatement matters',
      lead: 'Concatenating user input into SQL lets an attacker change the **meaning** of your query.',
      code: { lang: 'java', label: 'Vulnerable vs safe', verify: false, src: code`
        // ❌ VULNERABLE: input is pasted into the SQL text
        String email = request.getParameter("email");          // attacker sends:  x' OR '1'='1
        String sql = "SELECT * FROM users WHERE email = '" + email + "'";
        // becomes: SELECT * FROM users WHERE email = 'x' OR '1'='1'   -> returns EVERY user
        ResultSet rs = connection.createStatement().executeQuery(sql);

        // ✅ SAFE: the SQL text is fixed; the value is sent separately as data
        PreparedStatement ps = connection.prepareStatement("SELECT * FROM users WHERE email = ?");
        ps.setString(1, email);                                // treated as a literal string, never as SQL
        ResultSet safe = ps.executeQuery();` },
      points: [
        "SQL injection is consistently near the top of the OWASP Top 10 risks.",
        "Always bind parameters (`?` or `:name`). For dynamic *identifiers* (sort column), use an allow-list.",
        "Bonus: prepared statements are parsed once and can be reused efficiently (and batched)."
      ],
      callout: { kind: 'warn', text: "ORMs don't make you immune: string-concatenated JPQL or native queries are just as injectable. Parameters, always." },
      notes: [
        "Demo idea: build a tiny `/search?email=` endpoint with concatenation against the dev database, send `x' OR '1'='1`, and watch every user come back. Then switch to a bound parameter and show it returns nothing.",
        "Sorting is the classic place where people reintroduce injection: `ORDER BY ` + userInput. Map the user's choice to a fixed set of column names instead."
      ]
    },
    {
      type: 'theory',
      title: 'Spring JDBC: JdbcTemplate, JdbcClient & exception translation',
      lead: 'Spring keeps the SQL in your hands but takes over connections, statements, cleanup and error handling.',
      table: { head: ['You write', 'Spring handles'], rows: [
        ['SQL + parameters', 'getting/releasing pooled connections'],
        ['row → object mapping (`RowMapper`)', 'creating & closing statements and result sets'],
        ['transaction boundaries (`@Transactional`)', 'commit/rollback on the right connection'],
        ['handling *specific* failures', 'translating `SQLException` into unchecked `DataAccessException` subclasses']
      ] },
      diagram: { kind: 'compare', cols: [
        { t: 'JdbcTemplate', tone: 'blue', points: ['classic API, `?` placeholders', '`query`, `queryForObject`, `update`, `batchUpdate`'] },
        { t: 'NamedParameterJdbcTemplate', tone: 'purple', points: ['`:name` placeholders', 'params from a `Map` or bean'] },
        { t: 'JdbcClient (Spring 6.1+)', tone: 'green', points: ['fluent: `sql(...).param(...).query(...)`', 'maps records automatically'] }
      ] },
      points: [
        "`DuplicateKeyException` (unique violation) → **409**; `DataIntegrityViolationException` (FK/CHECK) → **409/422**; `EmptyResultDataAccessException` → **404**.",
        "Spring Boot auto-configures a HikariCP `DataSource`, `JdbcTemplate` and `JdbcClient` from `spring.datasource.*`."
      ],
      notes: [
        "Exception translation is a big deal: your service code catches meaningful, database-independent exceptions (`DuplicateKeyException`) instead of parsing vendor error codes from `SQLException`.",
        "JdbcTemplate is still widely used for reporting queries, bulk operations and performance-critical paths, even in applications whose main persistence is JPA (Session 11)."
      ]
    },
    {
      type: 'practical',
      title: 'Configuring Spring JDBC with MySQL',
      lead: 'Two dependencies, a few properties, and an optional `schema.sql` that runs at startup in development.',
      code: [
        { lang: 'xml', file: 'pom.xml', src: code`
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-jdbc</artifactId>   <!-- JdbcTemplate, JdbcClient, HikariCP -->
          </dependency>
          <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
          </dependency>` },
        { lang: 'yaml', file: 'application.yml', src: code`
          spring:
            datasource:
              url: jdbc:mysql://localhost:3306/splitwise
              username: app
              password: \${DB_PASSWORD}          # from the environment, never committed
              hikari:
                maximum-pool-size: 10
                connection-timeout: 3000         # ms to wait for a free connection
            sql:
              init:
                mode: always                     # run schema.sql + data.sql on startup (dev only!)` }
      ],
      notes: [
        "`spring.sql.init.mode=always` is handy for learning; in real projects schema changes are versioned with **Flyway** or Liquibase migrations (Boot 4 needs `spring-boot-starter-flyway`), which we adopt in Session 12.",
        "`\${DB_PASSWORD}` is resolved from an environment variable (`export DB_PASSWORD=apppw`) or any other property source — keep secrets out of Git."
      ]
    },
    {
      type: 'practical',
      title: 'CRUD repository with JdbcTemplate & RowMapper',
      lead: 'A `RowMapper` turns one `ResultSet` row into one object; the template does everything else.',
      code: [
        { lang: 'java', file: 'UserJdbcRepository.java', src: code`
          package com.example.splitwise.user;

          import java.sql.PreparedStatement;
          import java.sql.Statement;
          import java.util.List;
          import java.util.Optional;
          import org.springframework.jdbc.core.JdbcTemplate;
          import org.springframework.jdbc.core.RowMapper;
          import org.springframework.jdbc.support.GeneratedKeyHolder;
          import org.springframework.jdbc.support.KeyHolder;
          import org.springframework.stereotype.Repository;

          @Repository
          public class UserJdbcRepository {
              private static final RowMapper<User> USER_ROW_MAPPER = (rs, rowNum) -> new User(
                      rs.getLong("id"),
                      rs.getString("email"),
                      rs.getString("display_name"),
                      rs.getTimestamp("created_at").toInstant());

              private final JdbcTemplate jdbc;

              public UserJdbcRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

              public List<User> findAll() {                                       // READ many
                  return jdbc.query("SELECT id, email, display_name, created_at FROM users ORDER BY id",
                          USER_ROW_MAPPER);
              }

              public Optional<User> findById(long id) {                          // READ one
                  return jdbc.query("SELECT id, email, display_name, created_at FROM users WHERE id = ?",
                          USER_ROW_MAPPER, id).stream().findFirst();
              }

              public long insert(String email, String displayName) {             // CREATE
                  KeyHolder keys = new GeneratedKeyHolder();
                  jdbc.update(con -> {
                      PreparedStatement ps = con.prepareStatement(
                              "INSERT INTO users (email, display_name) VALUES (?, ?)", Statement.RETURN_GENERATED_KEYS);
                      ps.setString(1, email);
                      ps.setString(2, displayName);
                      return ps;
                  }, keys);
                  return keys.getKey().longValue();
              }

              public boolean updateName(long id, String displayName) {           // UPDATE
                  return jdbc.update("UPDATE users SET display_name = ? WHERE id = ?", displayName, id) == 1;
              }

              public boolean delete(long id) {                                   // DELETE
                  return jdbc.update("DELETE FROM users WHERE id = ?", id) == 1;
              }

              public int[] insertAll(List<User> users) {                         // BATCH
                  return jdbc.batchUpdate("INSERT INTO users (email, display_name) VALUES (?, ?)",
                          users, 100, (ps, u) -> { ps.setString(1, u.email()); ps.setString(2, u.displayName()); });
              }
          }` },
        { lang: 'java', file: 'User.java', src: code`
          package com.example.splitwise.user;

          import java.time.Instant;

          public record User(Long id, String email, String displayName, Instant createdAt) {}` }
      ],
      notes: [
        "`queryForObject` throws `EmptyResultDataAccessException` when no row matches; `query(...).stream().findFirst()` returns an `Optional` — usually nicer for 'find by id'.",
        "`update` returns the number of affected rows: 0 means 'not found' for updates and deletes — a cheap way to return 404 without an extra SELECT.",
        "`batchUpdate` sends many inserts in round trips of 100, often 10–50× faster than individual inserts. With MySQL add `rewriteBatchedStatements=true` to the JDBC URL for the full benefit."
      ]
    },
    {
      type: 'practical',
      title: 'JdbcClient & named parameters',
      lead: 'The fluent `JdbcClient` (Spring Framework 6.1+) reads almost like the SQL itself and maps records automatically.',
      code: { lang: 'java', file: 'GroupJdbcRepository.java', src: code`
        package com.example.splitwise.group;

        import java.util.List;
        import java.util.Optional;
        import org.springframework.jdbc.core.simple.JdbcClient;
        import org.springframework.jdbc.support.GeneratedKeyHolder;
        import org.springframework.jdbc.support.KeyHolder;
        import org.springframework.stereotype.Repository;

        record GroupSummary(Long id, String name, int memberCount) {}

        @Repository
        public class GroupJdbcRepository {
            private final JdbcClient jdbc;

            public GroupJdbcRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

            public long create(String name, long createdBy) {
                KeyHolder keys = new GeneratedKeyHolder();
                jdbc.sql("INSERT INTO expense_groups (name, created_by) VALUES (:name, :createdBy)")
                    .param("name", name)
                    .param("createdBy", createdBy)
                    .update(keys);
                return keys.getKey().longValue();
            }

            public void addMember(long groupId, long userId, String role) {
                jdbc.sql("INSERT INTO group_members (group_id, user_id, role) VALUES (:g, :u, :r)")
                    .param("g", groupId).param("u", userId).param("r", role)
                    .update();
            }

            public Optional<GroupSummary> summary(long groupId) {
                return jdbc.sql("""
                        SELECT g.id, g.name, COUNT(gm.user_id) AS member_count
                        FROM expense_groups g
                        LEFT JOIN group_members gm ON gm.group_id = g.id
                        WHERE g.id = :id
                        GROUP BY g.id, g.name
                        """)
                    .param("id", groupId)
                    .query(GroupSummary.class)          // columns -> record components (member_count -> memberCount)
                    .optional();
            }

            public List<String> memberEmails(long groupId) {
                return jdbc.sql("SELECT u.email FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = :id")
                    .param("id", groupId)
                    .query(String.class)
                    .list();
            }
        }` },
      notes: [
        "Java text blocks (`\"\"\"`) make multi-line SQL readable without string concatenation.",
        "`query(GroupSummary.class)` uses a data-class row mapper: column labels are matched to record components, with `snake_case` → `camelCase` conversion.",
        "JdbcTemplate, NamedParameterJdbcTemplate and JdbcClient can be mixed; JdbcClient is the most pleasant for new code."
      ]
    },
    {
      type: 'theory',
      title: 'Transactions with @Transactional',
      lead: 'Declare the boundary on a service method; Spring opens the transaction before it and commits or rolls back after it.',
      code: { lang: 'java', file: 'GroupService.java', src: code`
        package com.example.splitwise.group;

        import java.util.List;
        import org.springframework.stereotype.Service;
        import org.springframework.transaction.annotation.Transactional;

        @Service
        public class GroupService {
            private final GroupJdbcRepository groups;

            public GroupService(GroupJdbcRepository groups) { this.groups = groups; }

            @Transactional                       // all statements share one connection + transaction
            public long createGroup(String name, long creatorId, List<Long> memberIds) {
                long groupId = groups.create(name, creatorId);
                groups.addMember(groupId, creatorId, "ADMIN");
                for (Long memberId : memberIds) {
                    groups.addMember(groupId, memberId, "MEMBER");   // unknown user -> FK violation ->
                }                                                    // DataIntegrityViolationException -> ROLLBACK
                return groupId;                                      // no half-created groups, ever
            }

            @Transactional(readOnly = true)      // hint: no writes, can be optimised
            public GroupSummary summary(long groupId) {
                return groups.summary(groupId).orElseThrow(() -> new IllegalArgumentException("no group " + groupId));
            }
        }` },
      table: { head: ['Isolation level', 'Dirty read', 'Non-repeatable read', 'Phantom read'], rows: [
        ['READ_UNCOMMITTED', 'possible', 'possible', 'possible'],
        ['READ_COMMITTED', '—', 'possible', 'possible'],
        ['REPEATABLE_READ (MySQL InnoDB default)', '—', '—', 'mostly prevented in InnoDB'],
        ['SERIALIZABLE', '—', '—', '—']
      ] },
      points: [
        "Default rollback: on **unchecked** exceptions (and `Error`); checked exceptions commit unless you set `rollbackFor`.",
        "Default propagation `REQUIRED`: join the caller's transaction or start a new one; `REQUIRES_NEW` suspends it and starts another.",
        "It's AOP: keep `@Transactional` on **public** service methods called from other beans (Session 9 pitfall)."
      ],
      notes: [
        "Transactions belong in the service layer because that's where a *business operation* is defined — creating a group with its members is one unit of work.",
        "Isolation is about concurrent transactions seeing each other's changes. Higher isolation = fewer anomalies but more locking. For money movements we'll combine transactions with explicit locking or optimistic versioning (Sessions 13 and 22).",
        "Keep transactions short: never call a slow remote service while holding a DB transaction open."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: Users & Groups CRUD on MySQL with JdbcTemplate',
      lead: 'Replace the in-memory maps with a real database, end to end.',
      steps: [
        "Start MySQL 8.4 in Docker (previous slide) and add `spring-boot-starter-jdbc` + `mysql-connector-j` to the Splitwise project.",
        "Put the DDL in `src/main/resources/schema.sql`, seed three users in `data.sql`, and set `spring.sql.init.mode=always`.",
        "Implement `UserJdbcRepository` (JdbcTemplate + `RowMapper`) with findAll, findById, insert, updateName and delete.",
        "Expose `/api/v1/users` CRUD endpoints: 201 + Location on create, 404 when `update`/`delete` affect 0 rows.",
        "Map `DuplicateKeyException` (same email twice) to **409 Conflict** in your `@RestControllerAdvice`.",
        "Implement `GroupJdbcRepository` with `JdbcClient` and a `@Transactional` `createGroup(name, creator, members)`.",
        "Prove atomicity: create a group with a non-existent member id → expect an error and **no** row in `expense_groups`.",
        "Stretch: write a vulnerable `/users/search?email=` endpoint with concatenation, exploit it with `x' OR '1'='1`, then fix it with a bound parameter."
      ],
      notes: [
        "Verify state directly in MySQL after each API call (`SELECT * FROM users;`). Seeing the rows appear (and *not* appear after a rollback) makes transactions tangible.",
        "If the app fails to start with 'Access denied', check `DB_PASSWORD` is exported in the same terminal/IDE run configuration."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: JDBC & JdbcTemplate',
      quiz: [
        { q: "Which statement family does `ALTER TABLE users ADD COLUMN phone ...` belong to?", options: ['DML', 'DDL', 'DQL', 'TCL'], answer: 1,
          why: "It changes structure (schema), so it's Data Definition Language." },
        { q: "Why use PreparedStatement with `?` placeholders?", options: ['It returns more rows', 'Parameters are sent as data, preventing SQL injection', 'It avoids transactions', 'It is required for SELECT'], answer: 1,
          why: "The SQL text is fixed and values are bound separately, so input can never change the query's structure." },
        { q: "What does a RowMapper do?", options: ['Opens connections', 'Maps one ResultSet row to an object', 'Creates tables', 'Commits transactions'], answer: 1,
          why: "`RowMapper<T>.mapRow(rs, rowNum)` converts the current row into a `T`; the template iterates the rows for you." },
        { q: "Inserting a duplicate email (UNIQUE column) through JdbcTemplate throws…", options: ['SQLException (checked)', 'DuplicateKeyException', 'NullPointerException', 'Nothing — it is ignored'], answer: 1,
          why: "Spring translates the vendor error into its unchecked `DataAccessException` hierarchy; `DuplicateKeyException` maps nicely to HTTP 409." },
        { q: "A `@Transactional` method throws a checked exception. By default the transaction…", options: ['rolls back', 'commits', 'is suspended', 'retries'], answer: 1,
          why: "Spring rolls back on unchecked exceptions and errors; checked exceptions commit unless `rollbackFor` is configured." }
      ],
      notes: [
        "Q5 surprises many developers. Discuss why: checked exceptions historically represented 'expected business outcomes', so Spring followed the EJB convention of committing."
      ]
    },
    {
      type: 'summary',
      title: 'Session 10 recap',
      points: [
        "DDL defines structure, DML changes data; constraints + keys + indexes protect integrity and performance.",
        "JDBC: DataSource (pooled) → Connection → PreparedStatement → ResultSet; always close resources; bind parameters.",
        "JdbcTemplate / JdbcClient remove boilerplate; RowMapper maps rows; Spring translates SQLExceptions.",
        "CRUD = query/queryForObject + update + batchUpdate; affected-row counts drive 404s.",
        "`@Transactional` on service methods gives atomic business operations (rollback on unchecked exceptions)."
      ],
      cards: [
        ['DDL vs DML', 'DDL changes schema (CREATE/ALTER); DML changes rows (INSERT/UPDATE/DELETE).'],
        ['Foreign key', 'Column referencing another table\u2019s key; the DB enforces the link.'],
        ['HikariCP', 'Spring Boot\u2019s default JDBC connection pool.'],
        ['PreparedStatement', 'Precompiled SQL with bound parameters — prevents injection.'],
        ['RowMapper', 'Callback mapping one ResultSet row to one object.'],
        ['DataAccessException', 'Spring\u2019s unchecked, vendor-neutral persistence exception hierarchy.'],
        ['JdbcClient', 'Fluent JDBC API (Spring 6.1+) with named params and record mapping.'],
        ['ACID', 'Atomicity, Consistency, Isolation, Durability — transaction guarantees.']
      ],
      notes: [
        "Next session: ORM with Hibernate and Spring Data JPA — entities instead of rows, repositories without SQL, and mapping relationships like users ↔ groups."
      ]
    }
  ]
});
