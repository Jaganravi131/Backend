COURSE.session({
  no: 12,
  short: 'Splitwise Part 1: architecture & schema',
  title: 'Minor Project — Splitwise Backend (Part 1): Setup, Architecture & Data Modeling',
  covers: [7],
  objectives: [
    "Turn the Splitwise brief into requirements, use cases and an API contract.",
    "Set up the project environment (Spring Boot 4, MySQL 8.4 via Docker Compose, Flyway, Git).",
    "Design the technical architecture (HLSD), the add-expense and settle-up flowcharts, and the ERD.",
    "Implement the schema, the core entities and exact money splitting with BigDecimal."
  ],
  prereq: "Sessions 7–11: project setup, REST design, JDBC/JPA, transactions.",
  slides: [
    {
      type: 'project',
      title: 'Project brief: a Splitwise-like expense sharing app',
      lead: '“Build a Splitwise-like Expense Sharing Application from the ground up — project environment setup, technical architecture design, project flowchart, expense creation and settlement flows, user and group management features, HLSD, and data modeling concepts.” — brochure',
      diagram: { kind: 'compare', cols: [
        { t: 'Part 1 — Session 12', icon: '🏗️', tone: 'blue', points: ['environment & repo setup', 'architecture + HLSD', 'flowcharts', 'data model & schema', 'users & groups API'] },
        { t: 'Part 2 — Session 13', icon: '💸', tone: 'green', points: ['expense creation (4 split types)', 'balances', 'settlements & debt simplification', 'group management rules'] },
        { t: 'Advanced — Session 17', icon: '🤖', tone: 'purple', points: ['JUnit + Mockito tests', 'Redis caching', 'Spring Security + roles', 'Cursor AI agents'] }
      ] },
      points: [
        "**Functional:** users, groups & members, expenses split *equally / exactly / by percentage / by shares*, balances, settle-up, activity history.",
        "**Non-functional:** money must be exact to the paisa, writes must be atomic, reads fast (cached later), APIs secured (Session 16)."
      ],
      notes: [
        "This is the first project of the course (tech: Spring Boot, MySQL, Hibernate, REST). Treat it like a real product: requirements first, design second, code third.",
        "Show the actual Splitwise app on a phone if possible: a group 'Goa Trip', someone adds 'Dinner ₹2,400 paid by Asha, split equally among 4', and everyone's balance updates. That is the flow we will build."
      ]
    },
    {
      type: 'theory',
      title: 'Requirements → use cases → API contract',
      lead: 'Every endpoint should trace back to a use case. Part 1 delivers users and groups; Part 2 adds money movement.',
      diagram: { kind: 'grid', cols: 4, items: [
        { icon: '👤', t: 'Register / profile', s: 'Part 1 (passwords: S16)', tone: 'blue' },
        { icon: '👥', t: 'Create group, add/remove members', s: 'Part 1', tone: 'blue' },
        { icon: '🧾', t: 'Add / edit / delete expense', s: 'Part 2', tone: 'green' },
        { icon: '⚖️', t: 'View balances & settle up', s: 'Part 2', tone: 'green' }
      ] },
      table: { head: ['Endpoint', 'Purpose', 'Part'], rows: [
        ['`POST /api/v1/users`', 'register a user', '1'],
        ['`GET /api/v1/users/{id}`', 'user profile', '1'],
        ['`POST /api/v1/groups`', 'create a group (creator becomes ADMIN)', '1'],
        ['`GET /api/v1/groups/{id}`', 'group with members', '1'],
        ['`POST /api/v1/groups/{id}/members` · `DELETE …/members/{userId}`', 'manage members', '1'],
        ['`POST /api/v1/groups/{id}/expenses` · `GET …/expenses?page=`', 'add / list expenses', '2'],
        ['`GET /api/v1/groups/{id}/balances` · `POST …/settlements`', 'balances & settle-up', '2']
      ] },
      notes: [
        "Write the contract before the code and share it with the frontend team (or with your future self). Changing a table now costs minutes; changing a public API later costs a migration plan.",
        "Business rules to capture now: only members can be part of an expense; the payer must be a member; split amounts must add up to the total exactly; a member with a non-zero balance cannot be removed."
      ]
    },
    {
      type: 'project',
      title: 'Environment setup',
      lead: 'A reproducible local environment: one command starts the database, one command starts the app.',
      table: { head: ['Tool', 'Version / choice', 'Why'], rows: [
        ['JDK', '21 LTS (Temurin)', 'records, virtual threads, Boot 4 support'],
        ['Build', 'Maven wrapper `./mvnw`', 'same Maven everywhere (Session 7)'],
        ['Framework', 'Spring Boot 4.1.x', 'webmvc, validation, data-jpa, flyway, actuator, lombok, devtools'],
        ['Database', 'MySQL 8.4 in Docker Compose', 'no local installs, easy reset'],
        ['API client', 'Postman / HTTPie / curl', 'exercise endpoints'],
        ['VCS', 'Git + GitHub', 'feature branches, PRs']
      ] },
      code: [
        { lang: 'yaml', file: 'compose.yaml', src: code`
          services:
            mysql:
              image: mysql:8.4
              environment:
                MYSQL_DATABASE: splitwise
                MYSQL_USER: app
                MYSQL_PASSWORD: apppw          # local dev only
                MYSQL_ROOT_PASSWORD: rootpw
              ports:
                - "3306:3306"
              volumes:
                - mysql-data:/var/lib/mysql
              healthcheck:
                test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
                interval: 5s
                retries: 10
          volumes:
            mysql-data:` },
        { lang: 'text', label: 'Package structure', src: code`
          com.example.splitwise
          ├── SplitwiseApplication.java
          ├── config/        AppProperties, Clock bean
          ├── common/        PageResponse, exceptions, GlobalExceptionHandler
          ├── user/          User, UserRepository, UserService, UserController, dto/
          ├── group/         ExpenseGroup, GroupMember, GroupRole, GroupService, GroupController
          ├── expense/       Expense, ExpenseSplit, SplitType, split/ (strategies, Session 13)
          └── settlement/    Settlement, BalanceService, SettlementController (Session 13)` }
      ],
      callout: { kind: 'tip', text: "Add `spring-boot-docker-compose` (scope runtime/optional) and `./mvnw spring-boot:run` starts `compose.yaml` automatically and wires the datasource for you." },
      notes: [
        "Package by **feature** (user, group, expense) rather than by layer (controllers, services): related code stays together and features can later be extracted into microservices (Module 4).",
        "`docker compose up -d` then `docker compose ps` — wait for `healthy` before starting the app if you don't use the Boot integration."
      ]
    },
    {
      type: 'theory',
      title: 'Technical architecture (HLSD)',
      lead: 'A layered, modular monolith first — the right starting point. We note where scale and security will plug in later.',
      diagram: { kind: 'tiers', tiers: [
        { label: 'Clients', nodes: [{ t: 'Web app', tone: 'gray' }, { t: 'Mobile app', tone: 'gray' }, { t: 'Postman', tone: 'gray' }] },
        { label: 'API', via: 'HTTPS + JSON', nodes: [{ t: 'Controllers', s: 'DTOs, validation, ProblemDetail', tone: 'blue' }, { t: 'Security filter chain', s: 'Session 16', tone: 'red' }] },
        { label: 'Domain', nodes: [{ t: 'Services', s: 'rules, @Transactional', tone: 'green' }, { t: 'Split strategies', s: 'Session 13', tone: 'green' }] },
        { label: 'Data', nodes: [{ t: 'JPA repositories', tone: 'purple' }, { t: 'MySQL 8.4', s: 'source of truth', tone: 'orange' }, { t: 'Redis', s: 'cache, Session 15', tone: 'red' }] }
      ] },
      points: [
        "**Stateless** API instances → scale horizontally behind a load balancer.",
        "**Single source of truth:** MySQL with constraints; balances are *derived* from expenses and settlements.",
        "**Consistency:** each command (add expense, settle up) is one ACID transaction.",
        "**Observability** from day one: Actuator health, structured logs with request ids."
      ],
      notes: [
        "HLSD (high-level system design) answers: what are the components, how do they talk, where does data live, and how does it scale and fail? Interviewers expect you to sketch exactly this before writing any code.",
        "Why not microservices immediately? A small team and a young domain benefit from one deployable unit. Module 4 shows when and how to split — and the Airbnb project does exactly that."
      ]
    },
    {
      type: 'theory',
      title: 'Flowchart: adding an expense',
      lead: 'The most important write path. Every check happens before anything is stored, and storing happens in one transaction.',
      diagram: { kind: 'flow', dir: 'v', nodes: [
        { t: 'POST /groups/{id}/expenses', s: 'JSON body: description, amount, paidBy, splitType, participants', tone: 'blue' },
        { t: 'Validate request DTO', s: 'invalid → 400 ProblemDetail', tone: 'gray' },
        { t: 'Load group + members', s: 'unknown group → 404', tone: 'gray' },
        { t: 'Payer & participants are members?', s: 'no → 422 business rule', tone: 'yellow' },
        { t: 'Compute shares with SplitStrategy', s: 'EQUAL / EXACT / PERCENTAGE / SHARES; sum must equal amount', tone: 'purple' },
        { t: 'Save expense + splits (one transaction)', s: 'rollback on any failure', tone: 'green' },
        { t: '201 Created + Location', s: 'balances now reflect the expense', tone: 'green' }
      ] },
      notes: [
        "Walk through two failure paths: participant not in the group (422, nothing saved) and a database error after saving the expense but before the splits (transaction rollback — still nothing saved).",
        "The SplitStrategy box is deliberately abstract: in Session 13 it becomes the Strategy pattern, one class per split type, selected from a map."
      ]
    },
    {
      type: 'theory',
      title: 'Balances & the settle-up flow',
      lead: 'A member\'s balance = **total paid − total owed**, adjusted by settlements. Positive: others owe you; negative: you owe.',
      diagram: { kind: 'seq', actors: ['Ravi (owes)', 'API', 'MySQL'], msgs: [
        [0, 1, 'GET /groups/7/balances'],
        [1, 2, 'sum paid, sum owed, settlements'],
        [2, 1, 'Asha +900, Ravi -600, Meera -300', 'r'],
        [1, 0, 'you owe Asha 600', 'r'],
        [0, 1, 'POST /groups/7/settlements {to: Asha, 600}'],
        [1, 2, 'INSERT settlement (transaction)'],
        [1, 0, '201 Created, balance now 0', 'r']
      ] },
      table: { head: ['Goa Trip (₹)', 'Paid', 'Owed', 'Balance'], rows: [
        ['Asha', '1,200', '300', '**+900**'],
        ['Ravi', '0', '600', '**−600**'],
        ['Meera', '0', '300', '**−300**'],
        ['Sum', '1,200', '1,200', '**0** ✅']
      ] },
      notes: [
        "Invariant: the balances of a group always sum to zero. That's a great property to assert in tests (Session 14).",
        "Derived vs stored balances: computing from expenses/splits/settlements is always correct but costs a query; storing running balances is fast but needs careful concurrency control. We compute (and cache with Redis in Session 15)."
      ]
    },
    {
      type: 'theory',
      title: 'Data model (ERD)',
      lead: 'Six tables capture everything; `expense_splits` records exactly what each participant owes for each expense.',
      diagram: { kind: 'erd', entities: [
        { n: 'users', f: ['id PK', 'email UQ', 'display_name', 'password_hash', 'status', 'version'], tone: 'blue' },
        { n: 'expense_groups', f: ['id PK', 'name', 'currency', 'created_by FK → users', 'version'], tone: 'green' },
        { n: 'group_members', f: ['id PK', 'group_id FK', 'user_id FK', 'role', 'UQ (group_id, user_id)'], tone: 'green' },
        { n: 'expenses', f: ['id PK', 'group_id FK', 'description', 'amount DECIMAL(12,2)', 'split_type', 'paid_by FK → users', 'expense_date', 'deleted_at', 'version'], tone: 'orange' },
        { n: 'expense_splits', f: ['id PK', 'expense_id FK', 'user_id FK', 'share_amount DECIMAL(12,2)', 'UQ (expense_id, user_id)'], tone: 'orange' },
        { n: 'settlements', f: ['id PK', 'group_id FK', 'payer_id FK → users', 'payee_id FK → users', 'amount', 'settled_at'], tone: 'purple' }
      ], rels: ['expense_groups 1 — N group_members', 'users 1 — N group_members', 'expense_groups 1 — N expenses', 'expenses 1 — N expense_splits', 'users 1 — N expense_splits', 'expense_groups 1 — N settlements'] },
      points: [
        "Store **computed shares** for every split type → balances are simple sums, and history never changes when rules change.",
        "**Soft delete** (`deleted_at`) keeps an audit trail; queries filter `deleted_at IS NULL`.",
        "Indexes follow access paths: `(group_id, expense_date)` for the expense feed, FK columns for joins."
      ],
      notes: [
        "Ask: why not store percentages instead of amounts? Because rounding must be resolved once, at write time, so that every reader sees the same paise. The split type is kept for display and editing.",
        "Money columns are `DECIMAL(12,2)`: up to ₹9,999,999,999.99 — plenty for group expenses."
      ]
    },
    {
      type: 'practical',
      title: 'Schema as a Flyway migration',
      lead: '`V1__splitwise_schema.sql` creates the full model with constraints the application can rely on.',
      code: { lang: 'sql', file: 'db/migration/V1__splitwise_schema.sql', src: code`
        CREATE TABLE users (
          id            BIGINT AUTO_INCREMENT PRIMARY KEY,
          email         VARCHAR(255) NOT NULL,
          display_name  VARCHAR(100) NOT NULL,
          password_hash VARCHAR(100) NULL,                 -- filled from Session 16
          status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
          created_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          version       BIGINT       NOT NULL DEFAULT 0,
          CONSTRAINT uq_users_email UNIQUE (email)
        );

        CREATE TABLE expense_groups (
          id          BIGINT AUTO_INCREMENT PRIMARY KEY,
          name        VARCHAR(100) NOT NULL,
          currency    CHAR(3)      NOT NULL DEFAULT 'INR',
          created_by  BIGINT       NOT NULL,
          created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          version     BIGINT       NOT NULL DEFAULT 0,
          CONSTRAINT fk_groups_creator FOREIGN KEY (created_by) REFERENCES users (id)
        );

        CREATE TABLE group_members (
          id         BIGINT AUTO_INCREMENT PRIMARY KEY,
          group_id   BIGINT       NOT NULL,
          user_id    BIGINT       NOT NULL,
          role       VARCHAR(10)  NOT NULL,
          joined_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          CONSTRAINT uq_member UNIQUE (group_id, user_id),
          CONSTRAINT fk_members_group FOREIGN KEY (group_id) REFERENCES expense_groups (id) ON DELETE CASCADE,
          CONSTRAINT fk_members_user  FOREIGN KEY (user_id)  REFERENCES users (id)
        );

        CREATE TABLE expenses (
          id            BIGINT AUTO_INCREMENT PRIMARY KEY,
          group_id      BIGINT        NOT NULL,
          description   VARCHAR(120)  NOT NULL,
          amount        DECIMAL(12,2) NOT NULL,
          split_type    VARCHAR(12)   NOT NULL,           -- EQUAL | EXACT | PERCENTAGE | SHARES
          paid_by       BIGINT        NOT NULL,
          created_by    BIGINT        NOT NULL,
          expense_date  DATE          NOT NULL,
          created_at    TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          deleted_at    TIMESTAMP(6)  NULL,
          version       BIGINT        NOT NULL DEFAULT 0,
          CONSTRAINT chk_expense_amount CHECK (amount > 0),
          CONSTRAINT fk_expenses_group   FOREIGN KEY (group_id)   REFERENCES expense_groups (id),
          CONSTRAINT fk_expenses_payer   FOREIGN KEY (paid_by)    REFERENCES users (id),
          CONSTRAINT fk_expenses_creator FOREIGN KEY (created_by) REFERENCES users (id),
          INDEX idx_expenses_group_date (group_id, expense_date)
        );

        CREATE TABLE expense_splits (
          id            BIGINT AUTO_INCREMENT PRIMARY KEY,
          expense_id    BIGINT        NOT NULL,
          user_id       BIGINT        NOT NULL,
          share_amount  DECIMAL(12,2) NOT NULL,           -- what this user owes for the expense
          CONSTRAINT uq_split UNIQUE (expense_id, user_id),
          CONSTRAINT chk_split_amount CHECK (share_amount >= 0),
          CONSTRAINT fk_splits_expense FOREIGN KEY (expense_id) REFERENCES expenses (id) ON DELETE CASCADE,
          CONSTRAINT fk_splits_user    FOREIGN KEY (user_id)    REFERENCES users (id)
        );

        CREATE TABLE settlements (
          id          BIGINT AUTO_INCREMENT PRIMARY KEY,
          group_id    BIGINT        NOT NULL,
          payer_id    BIGINT        NOT NULL,             -- pays back
          payee_id    BIGINT        NOT NULL,             -- receives
          amount      DECIMAL(12,2) NOT NULL,
          settled_at  TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          CONSTRAINT chk_settlement_amount  CHECK (amount > 0),
          CONSTRAINT chk_settlement_parties CHECK (payer_id <> payee_id),
          CONSTRAINT fk_settlements_group FOREIGN KEY (group_id) REFERENCES expense_groups (id),
          CONSTRAINT fk_settlements_payer FOREIGN KEY (payer_id) REFERENCES users (id),
          CONSTRAINT fk_settlements_payee FOREIGN KEY (payee_id) REFERENCES users (id),
          INDEX idx_settlements_group (group_id)
        );` },
      notes: [
        "Flyway records each applied migration in `flyway_schema_history`; never edit an applied migration — add `V2__...` instead.",
        "`TIMESTAMP(6)` keeps microseconds, matching Java's `Instant` precision closely and giving stable ordering for activity feeds.",
        "With `ddl-auto: validate`, Hibernate verifies at startup that the entities match this schema — a mismatch fails fast instead of corrupting data."
      ]
    },
    {
      type: 'practical',
      title: 'Core entities: Expense & ExpenseSplit',
      lead: 'The expense is an aggregate root that owns its splits and refuses splits that don\'t add up.',
      code: [
        { lang: 'java', file: 'Expense.java', src: code`
          package com.example.splitwise.expense;

          import com.example.splitwise.group.ExpenseGroup;
          import com.example.splitwise.user.User;
          import jakarta.persistence.*;
          import java.math.BigDecimal;
          import java.time.Instant;
          import java.time.LocalDate;
          import java.util.*;

          @Entity
          @Table(name = "expenses")
          public class Expense {
              @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
              private Long id;

              @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "group_id")
              private ExpenseGroup group;

              @Column(nullable = false, length = 120)
              private String description;

              @Column(nullable = false, precision = 12, scale = 2)
              private BigDecimal amount;

              @Enumerated(EnumType.STRING) @Column(name = "split_type", nullable = false, length = 12)
              private SplitType splitType;

              @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "paid_by")
              private User paidBy;

              @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by")
              private User createdBy;

              @Column(name = "expense_date", nullable = false)
              private LocalDate expenseDate;

              @Column(name = "created_at", nullable = false, updatable = false)
              private Instant createdAt;

              @Column(name = "deleted_at")
              private Instant deletedAt;

              @OneToMany(mappedBy = "expense", cascade = CascadeType.ALL, orphanRemoval = true)
              private List<ExpenseSplit> splits = new ArrayList<>();

              @Version
              private long version;

              protected Expense() {}

              public Expense(ExpenseGroup group, String description, BigDecimal amount, SplitType splitType,
                             User paidBy, User createdBy, LocalDate expenseDate) {
                  this.group = group; this.description = description; this.amount = amount;
                  this.splitType = splitType; this.paidBy = paidBy; this.createdBy = createdBy;
                  this.expenseDate = expenseDate;
              }

              @PrePersist
              void onCreate() { createdAt = Instant.now(); }

              /** Replaces all splits; the shares must add up to the amount exactly. */
              public void replaceSplits(Map<User, BigDecimal> shares) {
                  BigDecimal total = shares.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
                  if (total.compareTo(amount) != 0) {
                      throw new IllegalArgumentException("splits total " + total + " != amount " + amount);
                  }
                  splits.clear();
                  shares.forEach((user, share) -> splits.add(new ExpenseSplit(this, user, share)));
              }

              public void softDelete() { this.deletedAt = Instant.now(); }

              public Long getId() { return id; }
              public BigDecimal getAmount() { return amount; }
              public User getPaidBy() { return paidBy; }
              public List<ExpenseSplit> getSplits() { return Collections.unmodifiableList(splits); }
          }` },
        { lang: 'java', file: 'ExpenseSplit.java', src: code`
          package com.example.splitwise.expense;

          import com.example.splitwise.user.User;
          import jakarta.persistence.*;
          import java.math.BigDecimal;

          @Entity
          @Table(name = "expense_splits")
          public class ExpenseSplit {
              @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
              private Long id;

              @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "expense_id")
              private Expense expense;

              @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id")
              private User user;

              @Column(name = "share_amount", nullable = false, precision = 12, scale = 2)
              private BigDecimal shareAmount;

              protected ExpenseSplit() {}

              ExpenseSplit(Expense expense, User user, BigDecimal shareAmount) {
                  this.expense = expense; this.user = user; this.shareAmount = shareAmount;
              }

              public User getUser() { return user; }
              public BigDecimal getShareAmount() { return shareAmount; }
          }

          // SplitType.java:  public enum SplitType { EQUAL, EXACT, PERCENTAGE, SHARES }` }
      ],
      notes: [
        "`compareTo` instead of `equals` for BigDecimal: `new BigDecimal(\"10.00\").equals(new BigDecimal(\"10.0\"))` is `false` because the scales differ (see the next slide).",
        "The `Settlement` entity follows the same pattern: group, payer, payee, amount, `settledAt` — students write it in the lab.",
        "Keeping the 'shares must add up' rule inside the entity means no service can ever persist an inconsistent expense."
      ]
    },
    {
      type: 'practical',
      title: 'Exact money: splitting with BigDecimal',
      lead: '₹100 split three ways is not 33.333… — someone pays the extra paisa. Decide the rule once and apply it everywhere.',
      code: { lang: 'java', file: 'MoneySplit.java', src: code`
        import java.math.BigDecimal;
        import java.math.RoundingMode;
        import java.util.ArrayList;
        import java.util.List;

        public class MoneySplit {

            /** Equal split; leftover paise go to the first participants, so the sum is always exact. */
            static List<BigDecimal> splitEqually(BigDecimal amount, int n) {
                BigDecimal total = amount.setScale(2, RoundingMode.UNNECESSARY);   // reject 3+ decimals
                long paise = total.movePointRight(2).longValueExact();
                long base = paise / n, remainder = paise % n;
                List<BigDecimal> shares = new ArrayList<>();
                for (int i = 0; i < n; i++) {
                    shares.add(BigDecimal.valueOf(base + (i < remainder ? 1 : 0), 2));
                }
                return shares;
            }

            public static void main(String[] args) {
                System.out.println(0.1 + 0.2);                                       // why never double
                System.out.println(new BigDecimal("0.1").add(new BigDecimal("0.2")));

                List<BigDecimal> shares = splitEqually(new BigDecimal("100.00"), 3);
                System.out.println(shares + " sum=" + shares.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
                System.out.println(splitEqually(new BigDecimal("2400"), 4));

                System.out.println(new BigDecimal("10.00").equals(new BigDecimal("10.0"))
                        + " vs compareTo=" + new BigDecimal("10.00").compareTo(new BigDecimal("10.0")));
                try {
                    splitEqually(new BigDecimal("10.005"), 2);
                } catch (ArithmeticException e) {
                    System.out.println("rejected: " + e.getMessage());
                }
            }
        }`, out: code`
        0.30000000000000004
        0.3
        [33.34, 33.33, 33.33] sum=100.00
        [600.00, 600.00, 600.00, 600.00]
        false vs compareTo=0
        rejected: Rounding necessary` },
      notes: [
        "Working in integer paise for the division avoids rounding-mode debates entirely; converting back with `BigDecimal.valueOf(paise, 2)` gives clean two-decimal amounts.",
        "Always construct BigDecimal from **strings** (`new BigDecimal(\"0.1\")`), never from doubles — `new BigDecimal(0.1)` captures the binary error `0.1000000000000000055511…`.",
        "This function becomes `EqualSplitStrategy` in Session 13, and its unit tests (100/3, 2400/4, 0.01/2) are the first tests we write in Session 14."
      ]
    },
    {
      type: 'lab',
      title: 'Project milestone 1: Splitwise foundations',
      lead: 'Deliver a running service with the full schema, core entities, users & groups API — and design docs in the README.',
      steps: [
        "Create the GitHub repo `splitwise-backend` and a Spring Boot 4.1.x project with webmvc, validation, data-jpa, mysql, flyway (+ `flyway-mysql`), actuator, lombok, devtools.",
        "Add `compose.yaml` (MySQL 8.4), run `docker compose up -d`, and point `spring.datasource.*` at it (password from an environment variable).",
        "Add `V1__splitwise_schema.sql`; start the app and confirm the tables and `flyway_schema_history` exist.",
        "Implement the entities `User`, `ExpenseGroup`, `GroupMember`, `Expense`, `ExpenseSplit`, `Settlement` (+ enums); `ddl-auto: validate` must pass.",
        "Implement `MoneySplit.splitEqually` (or a `Money` utility) with the remainder rule and check 100/3 → 33.34, 33.33, 33.33.",
        "Build the Part 1 endpoints (users, groups, members) with DTOs, validation and `ProblemDetail` errors (409 duplicate email, 404 unknown group).",
        "Document the architecture diagram, the add-expense flowchart and the ERD in `README.md` (images or Mermaid).",
        "Open a pull request *Splitwise Part 1* and review a classmate's PR against the API contract."
      ],
      notes: [
        "Grading checklist: app starts against a fresh database; migrations apply cleanly; every endpoint returns the documented status codes; no entity is returned directly from a controller; README explains the design.",
        "Encourage small commits per step — it makes the PR easy to review and shows good habits to future employers browsing the repository."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: Splitwise design',
      quiz: [
        { q: "Why are money columns DECIMAL(12,2) and fields BigDecimal?", options: ['They are faster', 'Exact decimal arithmetic — no binary rounding errors', 'MySQL has no FLOAT', 'JSON requires it'], answer: 1,
          why: "`0.1 + 0.2` is `0.30000000000000004` in double. DECIMAL/BigDecimal represent paise exactly." },
        { q: "₹100.00 split equally among 3 people with our rule gives…", options: ['33.33 each (99.99 total)', '33.34, 33.33, 33.33', '33.333 each', '34, 33, 33'], answer: 1,
          why: "10,000 paise / 3 = 3,333 remainder 1; the first participant absorbs the extra paisa so the total stays exactly 100.00." },
        { q: "Why store a row per participant in `expense_splits`?", options: ['To make inserts slower', 'It supports every split type and keeps resolved amounts stable for balances and history', 'Because JPA requires it', 'To avoid foreign keys'], answer: 1,
          why: "Rounding is resolved once at write time; balances become simple sums over stored shares." },
        { q: "Why is the table called `expense_groups` instead of `groups`?", options: ['Style preference only', 'GROUPS is a reserved word in MySQL 8', 'Hibernate forbids it', 'Flyway forbids it'], answer: 1,
          why: "MySQL 8 reserves GROUPS (window functions). Avoid reserved words rather than quoting them everywhere." },
        { q: "A member's balance in a group is…", options: ['what they paid', 'what they owe', 'total paid − total owed, adjusted by settlements', 'always zero'], answer: 2,
          why: "Positive means others owe them; negative means they owe. Across the group, balances sum to zero." }
      ],
      notes: [
        "Use Q3 to discuss alternatives (computing shares on the fly from percentages) and why they fail when two readers round differently."
      ]
    },
    {
      type: 'summary',
      title: 'Session 12 recap — Module 2 complete',
      points: [
        "Brief → use cases → API contract before code; Part 1 = users, groups, members.",
        "Reproducible environment: Boot 4 + Maven wrapper + MySQL 8.4 in Compose + Flyway + Git.",
        "HLSD: stateless layered monolith, MySQL as source of truth, Redis & Security slots for later.",
        "Flowcharts for add-expense and settle-up; ERD with expense_splits and settlements; constraints everywhere.",
        "Money is exact: DECIMAL(12,2), BigDecimal from strings, remainder distribution, compareTo for equality."
      ],
      cards: [
        ['HLSD', 'High-level system design: components, data stores, communication, scaling.'],
        ['Use case', 'A user goal the system supports, e.g. “settle up with a friend”.'],
        ['Aggregate root', 'Entity that owns and protects a cluster of objects (Expense → splits).'],
        ['Soft delete', 'Mark a row deleted (deleted_at) instead of removing it.'],
        ['Balance invariant', 'Balances within a group always sum to zero.'],
        ['Remainder distribution', 'Give leftover paise to some participants so shares sum exactly.'],
        ['Flyway migration', 'Versioned SQL script (V1__..., V2__...) applied once per database.'],
        ['compose.yaml', 'Declares local infrastructure (MySQL) started with docker compose up.']
      ],
      notes: [
        "Module 2 is complete: students now have a real Spring Boot service on MySQL. Module 3 continues the same project — expense flows and group management in Session 13, then testing, caching and security."
      ]
    }
  ]
});
