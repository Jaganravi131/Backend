COURSE.session({
  no: 11,
  short: 'Hibernate, Spring Data JPA & relations',
  title: 'Hibernate, Spring Data JPA & Entity Relationships',
  covers: [6],
  objectives: [
    "Explain ORM, JPA, Hibernate and Spring Data JPA, and the entity lifecycle / persistence context.",
    "Map entities with ids, columns, enums, versions and relationships (1:1, 1:N, N:1, M:N).",
    "Write Spring Data repositories with derived queries, JPQL, pagination and projections.",
    "Recognise and fix the N+1 problem, lazy-loading exceptions and lost updates (optimistic locking)."
  ],
  prereq: "Session 10: SQL, keys, JDBC and `@Transactional`.",
  slides: [
    {
      type: 'theory',
      title: 'ORM: objects in Java, rows in MySQL',
      lead: 'An **Object-Relational Mapper** translates between your object graph and relational tables, generating SQL for you.',
      diagram: { kind: 'layers', items: [
        { t: 'Your code', tone: 'blue', parts: ['services work with entities'] },
        { t: 'Spring Data JPA', s: 'repositories, derived queries, paging', tone: 'green', parts: ['JpaRepository<User, Long>'] },
        { t: 'Jakarta Persistence (JPA) API', s: 'the standard', tone: 'yellow', parts: ['@Entity', 'EntityManager', 'JPQL'] },
        { t: 'Hibernate ORM 7', s: 'the implementation', tone: 'orange', parts: ['SQL generation', 'caching', 'dirty checking'] },
        { t: 'JDBC + HikariCP → MySQL', tone: 'purple' }
      ] },
      points: [
        "**JPA** is a specification (`jakarta.persistence.*`); **Hibernate** is the most used implementation.",
        "**Spring Data JPA** adds repository interfaces whose implementations are generated at runtime.",
        "Mismatch to manage: inheritance, object identity vs primary keys, navigation (`group.getMembers()`) vs joins."
      ],
      notes: [
        "Last session we wrote SQL and RowMappers by hand. With JPA we map classes once and let Hibernate generate INSERT/UPDATE/SELECT statements — huge productivity, but we must understand what SQL it generates. Always keep SQL logging on while learning.",
        "Spring Boot 4 ships Hibernate 7 and Jakarta Persistence 3.2. The `javax.persistence` package from old tutorials no longer exists — it's `jakarta.persistence` everywhere."
      ]
    },
    {
      type: 'theory',
      title: 'Entity lifecycle & the persistence context',
      lead: 'Inside a transaction, the **persistence context** tracks every managed entity — it is a first-level cache and a change detector.',
      diagram: { kind: 'graph', cw: 200, ch: 96, nodes: [
        { id: 'new', t: 'Transient', s: 'new User(...)', x: 0, y: 0, tone: 'gray' },
        { id: 'man', t: 'Managed', s: 'tracked in context', x: 1, y: 0, tone: 'green' },
        { id: 'det', t: 'Detached', s: 'context closed', x: 2, y: 0, tone: 'yellow' },
        { id: 'rem', t: 'Removed', s: 'DELETE on flush', x: 1, y: 1, tone: 'red' }
      ], edges: [['new', 'man', 'persist()'], ['man', 'det', 'tx ends'], ['det', 'man', 'merge()'], ['man', 'rem', 'remove()']] },
      points: [
        "**Dirty checking:** change a managed entity's field and Hibernate issues the UPDATE at flush/commit — no `save()` call needed.",
        "**First-level cache:** `find(User.class, 1)` twice in one transaction hits the database once.",
        "**Flush** writes pending changes (before commit, before queries that might be affected, or on `flush()`).",
        "Outside a transaction, entities are **detached**: changes are not tracked and lazy associations can't load."
      ],
      notes: [
        "This explains the most surprising JPA behaviour for beginners: 'I changed the name and it was saved even though I never called save!' — because the entity was managed inside a `@Transactional` method.",
        "`JpaRepository.save()` calls `persist` for new entities and `merge` for detached ones. For an already managed entity it's a no-op apart from returning it.",
        "Each request should use a short transaction in the service layer; the persistence context lives exactly as long as that transaction."
      ]
    },
    {
      type: 'practical',
      title: 'Mapping an entity',
      lead: 'Annotations describe how a class maps to a table. Keep entities **intention-revealing** — not bags of setters.',
      code: { lang: 'java', file: 'User.java', src: code`
        package com.example.splitwise.user;

        import jakarta.persistence.*;
        import java.time.Instant;

        @Entity
        @Table(name = "users")
        public class User {

            @Id
            @GeneratedValue(strategy = GenerationType.IDENTITY)    // MySQL AUTO_INCREMENT
            private Long id;

            @Column(nullable = false, unique = true, length = 255)
            private String email;

            @Column(name = "display_name", nullable = false, length = 100)
            private String displayName;

            @Enumerated(EnumType.STRING)                            // store 'ACTIVE', not 0
            @Column(nullable = false, length = 20)
            private UserStatus status = UserStatus.ACTIVE;

            @Column(name = "created_at", nullable = false, updatable = false)
            private Instant createdAt;

            @Version                                                // optimistic locking
            private long version;

            protected User() {}                                     // JPA needs a no-arg constructor

            public User(String email, String displayName) {
                this.email = email;
                this.displayName = displayName;
            }

            @PrePersist
            void onCreate() { this.createdAt = Instant.now(); }

            public void rename(String newName) { this.displayName = newName; }   // behaviour, not setters

            public Long getId() { return id; }
            public String getEmail() { return email; }
            public String getDisplayName() { return displayName; }
            public UserStatus getStatus() { return status; }
            public Instant getCreatedAt() { return createdAt; }

            @Override public boolean equals(Object o) {             // identity = database id
                return this == o || (o instanceof User other && id != null && id.equals(other.getId()));
            }
            @Override public int hashCode() { return getClass().hashCode(); }   // stable before/after persist
        }` },
      notes: [
        "Always use `EnumType.STRING`: the default `ORDINAL` stores 0/1/2 and silently corrupts data when someone reorders the enum.",
        "Why this `equals`/`hashCode`? A new entity has no id until it is persisted; a hash code based on the id would change and break `HashSet` membership (Session 5!). A constant per-class hash code with id-based equality is the standard safe recipe.",
        "Note `other.getId()` rather than `other.id`: Hibernate may hand you a lazy *proxy* subclass whose fields are not populated — only its getters load the real data.",
        "Records cannot be entities (entities need mutability and a no-arg constructor), but they are perfect for DTOs and projections."
      ]
    },
    {
      type: 'practical',
      title: 'Spring Data JPA repositories',
      lead: 'Declare an interface; Spring generates the implementation, including queries derived from **method names**.',
      code: [
        { lang: 'java', file: 'UserRepository.java', src: code`
          package com.example.splitwise.user;

          import java.time.Instant;
          import java.util.List;
          import java.util.Optional;
          import org.springframework.data.domain.Page;
          import org.springframework.data.domain.Pageable;
          import org.springframework.data.jpa.repository.JpaRepository;
          import org.springframework.data.jpa.repository.Query;
          import org.springframework.data.repository.query.Param;

          public interface UserRepository extends JpaRepository<User, Long> {   // save, findById, findAll, delete...

              Optional<User> findByEmail(String email);                             // derived queries
              boolean existsByEmail(String email);
              List<User> findByDisplayNameContainingIgnoreCaseOrderByDisplayNameAsc(String part);
              Page<User> findByStatus(UserStatus status, Pageable pageable);

              @Query("select m.user from GroupMember m where m.group.id = :groupId")   // JPQL: entities, not tables
              List<User> findMembersOfGroup(@Param("groupId") Long groupId);

              @Query("""
                     select new com.example.splitwise.user.UserCard(u.id, u.displayName)
                     from User u where u.createdAt >= :since
                     """)                                                           // DTO projection
              List<UserCard> recentCards(@Param("since") Instant since);

              @Query(value = "SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE", nativeQuery = true)
              long countCreatedToday();                                             // native SQL when needed
          }` },
        { lang: 'java', file: 'UserController.java', label: 'Paging in the API', src: code`
          package com.example.splitwise.user;

          import java.util.List;
          import org.springframework.data.domain.Page;
          import org.springframework.data.domain.Pageable;
          import org.springframework.data.web.PageableDefault;
          import org.springframework.web.bind.annotation.*;

          record UserCard(Long id, String displayName) {}
          record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {
              static <T> PageResponse<T> of(Page<T> p) {
                  return new PageResponse<>(p.getContent(), p.getNumber(), p.getSize(), p.getTotalElements(), p.getTotalPages());
              }
          }

          @RestController
          @RequestMapping("/api/v1/users")
          class UserController {
              private final UserRepository users;
              UserController(UserRepository users) { this.users = users; }

              @GetMapping            // GET /api/v1/users?page=0&size=20&sort=displayName,asc
              PageResponse<UserCard> list(@PageableDefault(size = 20, sort = "displayName") Pageable pageable) {
                  return PageResponse.of(users.findByStatus(UserStatus.ACTIVE, pageable)
                          .map(u -> new UserCard(u.getId(), u.getDisplayName())));
              }
          }` }
      ],
      notes: [
        "Derived query keywords: `findBy`, `existsBy`, `countBy`, `deleteBy` + properties combined with `And`, `Or`, `Between`, `LessThan`, `Containing`, `IgnoreCase`, `OrderBy…`. Startup fails fast if a property name is wrong — a nice safety net.",
        "JPQL queries *entities and fields* (`User u`, `u.createdAt`), not tables and columns. Use native queries for vendor-specific features, and keep parameters bound.",
        "Returning our own `PageResponse` record gives clients a stable JSON shape instead of serialising Spring's internal `PageImpl`."
      ]
    },
    {
      type: 'theory',
      title: 'Relationships: owning side, mappedBy, cascade & fetch',
      lead: 'Associations map foreign keys to object references. The side holding the foreign key is the **owning** side.',
      diagram: { kind: 'erd', entities: [
        { n: 'users', f: ['id PK', 'email UQ', 'display_name', 'status', 'version'], tone: 'blue' },
        { n: 'expense_groups', f: ['id PK', 'name', 'created_by FK → users', 'version'], tone: 'green' },
        { n: 'group_members', f: ['id PK', 'group_id FK → expense_groups', 'user_id FK → users', 'role', 'joined_at', 'UQ (group_id, user_id)'], tone: 'purple' },
        { n: 'user_profiles', f: ['user_id PK, FK → users', 'phone', 'upi_id'], tone: 'gray' }
      ], rels: ['users 1 — 1 user_profiles', 'users 1 — N group_members', 'expense_groups 1 — N group_members', 'users N — M expense_groups (via group_members)'] },
      table: { head: ['Annotation', 'Default fetch', 'Notes'], rows: [
        ['`@ManyToOne`', 'EAGER ⚠️', 'owning side (FK column) — set `fetch = LAZY`'],
        ['`@OneToMany(mappedBy = "...")`', 'LAZY', 'inverse side; often `cascade = ALL, orphanRemoval = true`'],
        ['`@OneToOne`', 'EAGER ⚠️', 'consider `@MapsId` to share the primary key'],
        ['`@ManyToMany`', 'LAZY', 'only for *pure* links without extra columns']
      ] },
      notes: [
        "Group membership has extra data (role, joined_at), so we model it as its own entity `GroupMember` with two `@ManyToOne`s instead of a `@ManyToMany`. This is the most common real-world advice: start with an explicit join entity.",
        "We use a surrogate `id` plus a `UNIQUE (group_id, user_id)` constraint for `group_members`. A composite primary key works too, but needs `@EmbeddedId` + `@MapsId`, which is more complex to get right.",
        "`mappedBy` tells JPA 'the foreign key lives on the other side'; only changes to the *owning* side are written to the database — hence helper methods that update both sides together."
      ]
    },
    {
      type: 'practical',
      title: 'Mapping the group ↔ member ↔ user relationships',
      lead: 'An aggregate root (`ExpenseGroup`) owns its members via cascade; helper methods keep both sides consistent.',
      code: [
        { lang: 'java', file: 'ExpenseGroup.java', src: code`
          package com.example.splitwise.group;

          import com.example.splitwise.user.User;
          import jakarta.persistence.*;
          import java.util.ArrayList;
          import java.util.Collections;
          import java.util.List;

          @Entity
          @Table(name = "expense_groups")
          public class ExpenseGroup {
              @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
              private Long id;

              @Column(nullable = false, length = 100)
              private String name;

              @ManyToOne(fetch = FetchType.LAZY, optional = false)
              @JoinColumn(name = "created_by")                       // FK column: this is the owning side
              private User createdBy;

              @OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
              private List<GroupMember> members = new ArrayList<>();

              @Version
              private long version;

              protected ExpenseGroup() {}

              public ExpenseGroup(String name, User creator) {
                  this.name = name;
                  this.createdBy = creator;
                  addMember(creator, GroupRole.ADMIN);
              }

              public GroupMember addMember(User user, GroupRole role) {   // sync both sides
                  boolean exists = members.stream().anyMatch(m -> m.getUser().equals(user));
                  if (exists) throw new IllegalStateException("already a member");
                  GroupMember m = new GroupMember(this, user, role);
                  members.add(m);
                  return m;
              }

              public void removeMember(User user) {
                  members.removeIf(m -> m.getUser().equals(user));         // orphanRemoval -> DELETE row
              }

              public void rename(String newName) { this.name = newName; }

              public Long getId() { return id; }
              public String getName() { return name; }
              public List<GroupMember> getMembers() { return Collections.unmodifiableList(members); }
          }` },
        { lang: 'java', file: 'GroupMember.java', src: code`
          package com.example.splitwise.group;

          import com.example.splitwise.user.User;
          import jakarta.persistence.*;
          import java.time.Instant;

          @Entity
          @Table(name = "group_members",
                 uniqueConstraints = @UniqueConstraint(columnNames = {"group_id", "user_id"}))
          public class GroupMember {
              @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
              private Long id;

              @ManyToOne(fetch = FetchType.LAZY, optional = false)
              @JoinColumn(name = "group_id")
              private ExpenseGroup group;

              @ManyToOne(fetch = FetchType.LAZY, optional = false)
              @JoinColumn(name = "user_id")
              private User user;

              @Enumerated(EnumType.STRING)
              @Column(nullable = false, length = 10)
              private GroupRole role;

              @Column(name = "joined_at", nullable = false)
              private Instant joinedAt = Instant.now();

              protected GroupMember() {}

              GroupMember(ExpenseGroup group, User user, GroupRole role) {   // only the aggregate creates members
                  this.group = group;
                  this.user = user;
                  this.role = role;
              }

              public User getUser() { return user; }
              public GroupRole getRole() { return role; }
          }` },
        { lang: 'java', file: 'GroupService.java', label: 'Using it', src: code`
          @Service
          @RequiredArgsConstructor
          public class GroupService {
              private final ExpenseGroupRepository groups;
              private final UserRepository users;

              @Transactional
              public Long create(String name, Long creatorId, List<Long> memberIds) {
                  User creator = users.findById(creatorId).orElseThrow(() -> new NotFoundException("user " + creatorId));
                  ExpenseGroup group = new ExpenseGroup(name, creator);
                  users.findAllById(memberIds).forEach(u -> group.addMember(u, GroupRole.MEMBER));
                  return groups.save(group).getId();         // cascade ALL: members inserted too
              }

              @Transactional
              public void rename(Long groupId, String newName) {
                  groups.findById(groupId).orElseThrow().rename(newName);   // dirty checking: UPDATE at commit
              }
          }` }
      ],
      notes: [
        "`cascade = ALL` + `orphanRemoval = true` makes `ExpenseGroup` the *aggregate root*: you save, update and delete members only through the group. That's a DDD idea that keeps invariants (no duplicate members) in one place.",
        "Notice `getMembers()` returns an unmodifiable view: outside code can't bypass `addMember`'s rules.",
        "`rename` has no `save()` call: the group is managed inside the transaction, so dirty checking flushes the UPDATE at commit (and `@Version` protects it from concurrent edits)."
      ]
    },
    {
      type: 'theory',
      title: 'Lazy loading & the N+1 query problem',
      lead: 'Loading N groups and then touching each group\'s members fires **1 + N** queries. It is the #1 JPA performance bug.',
      code: { lang: 'sql', label: 'Hibernate SQL log', src: code`
        -- groups.findAll() then group.getMembers().size() for each group  ->  1 + N queries
        select g1_0.id, g1_0.created_by, g1_0.name, g1_0.version from expense_groups g1_0
        select m1_0.group_id, m1_0.id, m1_0.joined_at, m1_0.role, m1_0.user_id from group_members m1_0 where m1_0.group_id=?
        select m1_0.group_id, m1_0.id, m1_0.joined_at, m1_0.role, m1_0.user_id from group_members m1_0 where m1_0.group_id=?
        ... one more query per group ...

        -- with a fetch join / entity graph  ->  1 query
        select g1_0.id, g1_0.name, m1_0.id, m1_0.role, u1_0.id, u1_0.display_name
        from expense_groups g1_0
        left join group_members m1_0 on g1_0.id = m1_0.group_id
        left join users u1_0 on u1_0.id = m1_0.user_id` },
      points: [
        "Fixes: **JOIN FETCH** in JPQL, **`@EntityGraph`** on repository methods, **DTO projections**, or batch fetching (`hibernate.default_batch_fetch_size`).",
        "`LazyInitializationException`: touching a lazy association after the transaction closed (e.g. during JSON serialisation of an entity).",
        "Set `spring.jpa.open-in-view=false` so lazy loading can't silently happen in the web layer; map to DTOs inside the service."
      ],
      notes: [
        "Turn on `logging.level.org.hibernate.SQL=DEBUG` during development and *count the queries* for each endpoint. Ten groups → eleven queries is a bug that becomes a disaster at a thousand groups.",
        "Open Session in View (enabled by default in Spring Boot, with a startup warning) keeps the persistence context open during rendering, hiding N+1 problems until production load. Disabling it forces explicit fetching decisions."
      ]
    },
    {
      type: 'practical',
      title: 'Fixing N+1 with fetch joins & entity graphs',
      lead: 'Tell Hibernate up front which associations a use case needs.',
      code: { lang: 'java', file: 'ExpenseGroupRepository.java', src: code`
        package com.example.splitwise.group;

        import jakarta.persistence.LockModeType;
        import java.util.List;
        import java.util.Optional;
        import org.springframework.data.jpa.repository.*;
        import org.springframework.data.repository.query.Param;

        public interface ExpenseGroupRepository extends JpaRepository<ExpenseGroup, Long> {

            // Option 1: JPQL fetch join
            @Query("""
                   select distinct g from ExpenseGroup g
                   join fetch g.members m
                   join fetch m.user
                   where g.id = :id
                   """)
            Optional<ExpenseGroup> findWithMembers(@Param("id") Long id);

            // Option 2: entity graph on a derived query
            @EntityGraph(attributePaths = {"members", "members.user"})
            List<ExpenseGroup> findByNameContainingIgnoreCase(String name);

            // Option 3: project straight into a DTO (no entities, no lazy loading at all)
            @Query("select new com.example.splitwise.group.GroupCard(g.id, g.name, size(g.members)) from ExpenseGroup g")
            List<GroupCard> findAllCards();

            // Concurrency control for critical updates (used in Sessions 13 and 22)
            @Lock(LockModeType.PESSIMISTIC_WRITE)               // SELECT ... FOR UPDATE
            @Query("select g from ExpenseGroup g where g.id = :id")
            Optional<ExpenseGroup> findByIdForUpdate(@Param("id") Long id);
        }

        record GroupCard(Long id, String name, int memberCount) {}` },
      notes: [
        "Fetch-joining several collections at once multiplies rows (a Cartesian product); fetch one collection per query or use batch fetching for the rest.",
        "Paging + collection fetch join is a trap: Hibernate has to paginate in memory (it warns about it). Page over ids or DTOs instead.",
        "Pessimistic locks block other writers until commit — strong but costly. Optimistic `@Version` checks (next slide) are the usual default."
      ]
    },
    {
      type: 'theory',
      title: 'Lost updates, @Version & schema management',
      lead: 'Two users edit the same expense at once: without protection the last write silently wins.',
      diagram: { kind: 'seq', actors: ['Asha', 'Database', 'Ravi'], msgs: [
        [0, 1, 'read expense (version 3)'],
        [2, 1, 'read expense (version 3)'],
        [0, 1, 'UPDATE ... WHERE id=9 AND version=3'],
        [1, 1, 'row updated, version -> 4'],
        [2, 1, 'UPDATE ... WHERE id=9 AND version=3'],
        [1, 2, '0 rows: OptimisticLock -> 409', 'r']
      ] },
      points: [
        "`@Version` adds `AND version = ?` to every UPDATE; 0 rows updated → `ObjectOptimisticLockingFailureException` → return **409 Conflict**, let the client reload and retry.",
        "`spring.jpa.hibernate.ddl-auto`: `create-drop` for throwaway tests, **`validate`** (or `none`) for real environments.",
        "Version schema changes with **Flyway** migrations (`V1__init.sql`, `V2__add_phone.sql`) applied automatically at startup."
      ],
      code: { lang: 'yaml', file: 'application.yml', src: code`
        spring:
          jpa:
            hibernate:
              ddl-auto: validate          # schema comes from Flyway; Hibernate only checks it
            open-in-view: false
          flyway:
            locations: classpath:db/migration
        logging:
          level:
            org.hibernate.SQL: DEBUG                 # generated SQL
            org.hibernate.orm.jdbc.bind: TRACE       # bound parameter values (dev only)` },
      notes: [
        "Dependencies for Flyway in Spring Boot 4: `spring-boot-starter-flyway` plus `org.flywaydb:flyway-mysql` (MySQL support lives in its own module). Versions are managed by Boot.",
        "Never use `ddl-auto: update` in production: it can't rename or drop columns safely and leaves no audit trail. Migrations are code — reviewed, versioned and repeatable on every environment.",
        "Optimistic locking needs no database locks at all, which makes it ideal for web apps where users 'think' between reading and saving."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: Users & Groups on Spring Data JPA',
      lead: 'Migrate the JDBC implementation to JPA, map the relationships, and prove you have no N+1 queries.',
      steps: [
        "Add `spring-boot-starter-data-jpa`, `spring-boot-starter-flyway` and `flyway-mysql`; move the DDL into `db/migration/V1__init.sql` (with `version` columns and the `group_members` surrogate id + unique constraint).",
        "Set `ddl-auto: validate`, `open-in-view: false` and enable SQL logging.",
        "Create the `User`, `ExpenseGroup`, `GroupMember` entities and `GroupRole` enum as on the slides.",
        "Create `UserRepository` and `ExpenseGroupRepository`; implement `GroupService.create` with cascade and `rename` via dirty checking.",
        "Expose `GET /api/v1/users?page=&size=&sort=` returning `PageResponse<UserCard>`.",
        "Write `GET /api/v1/groups/{id}` returning a DTO with members; count queries in the log — then fix N+1 with `findWithMembers`.",
        "Trigger an optimistic-lock conflict: load the same group in two transactions (two curl calls with a breakpoint/sleep), rename both, map the exception to **409**.",
        "Stretch: add `V2__add_user_profiles.sql` and a `@OneToOne` `UserProfile` sharing the user's primary key via `@MapsId`."
      ],
      notes: [
        "Common errors: `Schema-validation: missing column [version]` (migration and entity disagree — that's `validate` doing its job), and `LazyInitializationException` (map to DTOs inside the transactional service).",
        "Ask students to paste their before/after SQL logs for the N+1 step — seeing 11 queries collapse into 1 is the lesson that sticks."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: JPA & relationships',
      quiz: [
        { q: "Inside a @Transactional method you load a User and call `user.rename(\"X\")`. What happens without calling save()?", options: ['Nothing is saved', 'Hibernate detects the change and issues an UPDATE at commit', 'An exception is thrown', 'The change is saved only in the cache'], answer: 1,
          why: "Managed entities are dirty-checked; pending changes are flushed before commit." },
        { q: "In a bidirectional one-to-many, which side owns the relationship?", options: ['The @OneToMany side', 'The side with mappedBy', 'The @ManyToOne side holding the foreign key', 'Both equally'], answer: 2,
          why: "The FK column lives on the many side; `mappedBy` marks the inverse side whose changes are not persisted." },
        { q: "Listing 50 groups and printing each group's members triggers 51 queries. This is…", options: ['Optimistic locking', 'The N+1 problem', 'A cartesian product', 'Dirty checking'], answer: 1,
          why: "One query for the list plus one lazy load per group. Fix with a fetch join, an entity graph or a DTO projection." },
        { q: "Why prefer `EnumType.STRING` over the default `ORDINAL`?", options: ['It is faster', 'Reordering enum constants won\'t corrupt existing data', 'ORDINAL is not supported by MySQL', 'STRING uses less storage'], answer: 1,
          why: "ORDINAL stores positions (0, 1, 2…); inserting or reordering constants changes their meaning." },
        { q: "What does `@Version` protect against?", options: ['SQL injection', 'Lost updates from concurrent edits', 'N+1 queries', 'Schema drift'], answer: 1,
          why: "UPDATEs include `WHERE version = ?`; a stale write updates 0 rows and fails with an optimistic locking exception." }
      ],
      notes: [
        "Q2 is often answered wrong. Draw the tables: the `group_id` column physically lives in `group_members`, so `GroupMember.group` is the owning side."
      ]
    },
    {
      type: 'summary',
      title: 'Session 11 recap',
      points: [
        "JPA (spec) + Hibernate (implementation) + Spring Data JPA (repositories) map objects to tables.",
        "Persistence context = first-level cache + dirty checking; entities are transient, managed, detached or removed.",
        "Relationships: owning side holds the FK, `mappedBy` on the inverse side; prefer LAZY, explicit join entities, aggregate roots with cascade.",
        "Repositories: derived queries, JPQL, native SQL, paging, DTO projections.",
        "Avoid N+1 (fetch join, entity graph, DTOs), disable open-in-view, use `@Version`, manage schema with Flyway."
      ],
      cards: [
        ['Persistence context', 'Per-transaction set of managed entities: cache + change tracking.'],
        ['Dirty checking', 'Hibernate compares managed entities to snapshots and issues UPDATEs at flush.'],
        ['Owning side', 'The association side that holds the foreign key and is persisted.'],
        ['orphanRemoval', 'Deletes child rows removed from the parent\u2019s collection.'],
        ['N+1 problem', '1 query for a list + 1 per element to load an association.'],
        ['@EntityGraph', 'Declares associations to fetch eagerly for one repository method.'],
        ['@Version', 'Optimistic locking column checked on every update.'],
        ['Flyway', 'Versioned SQL migrations applied in order at startup.']
      ],
      notes: [
        "Next session is the Splitwise project, part 1: environment setup, technical architecture, flowcharts, HLSD and the complete data model — everything from Module 2 comes together."
      ]
    }
  ]
});
