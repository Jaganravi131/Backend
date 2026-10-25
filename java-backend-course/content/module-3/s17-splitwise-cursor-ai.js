COURSE.session({
  no: 17,
  short: 'Splitwise + Cursor AI agents',
  title: 'Minor Project — Splitwise Advanced with Cursor AI: JUnit + Redis + Security Integration',
  covers: [6],
  objectives: [
    "Integrate testing, Redis caching and Spring Security into one coherent Splitwise release.",
    "Implement role-based access and advanced (cross-field, class-level) validations.",
    "Use Cursor's AI modes (Ask, Agent, inline edit) with project rules to automate repetitive backend work.",
    "Review AI-generated code critically and prove it with tests before merging."
  ],
  prereq: "Sessions 13–16: Splitwise flows, tests, Redis caching and Spring Security.",
  slides: [
    {
      type: 'project',
      title: 'Project brief: Splitwise Advanced',
      lead: '“Enhance the Splitwise backend with advanced capabilities — integrate JUnit testing and Redis caching, add Spring Security with role-based access, implement advanced validations, and use AI Agents in Cursor to automate repetitive backend code tasks.” — brochure',
      diagram: { kind: 'tiers', tiers: [
        { label: 'Security', nodes: [{ t: 'SecurityFilterChain', s: 'Basic/Bearer auth, 401/403 problem+json', tone: 'red' }, { t: '@PreAuthorize', s: 'group roles', tone: 'red' }] },
        { label: 'Web', nodes: [{ t: 'Controllers', s: 'DTOs + @Valid + @ValidSplit', tone: 'blue' }] },
        { label: 'Domain', nodes: [{ t: 'Services', s: '@Transactional, strategies', tone: 'green' }, { t: 'BalanceService', s: '@Cacheable / @CacheEvict', tone: 'green' }] },
        { label: 'Data', nodes: [{ t: 'MySQL 8.4', s: 'Flyway, constraints', tone: 'orange' }, { t: 'Redis 7', s: 'balances cache, rate limits', tone: 'red' }] },
        { label: 'Quality', nodes: [{ t: 'JUnit 5 + Mockito + MockMvc', tone: 'purple' }, { t: 'Testcontainers ITs', tone: 'purple' }, { t: 'JaCoCo ≥ 80%', tone: 'purple' }] }
      ] },
      table: { head: ['Deliverable', 'Definition of done'], rows: [
        ['Role-based access', 'platform ADMIN vs USER; group ADMIN vs MEMBER enforced and tested'],
        ['Advanced validations', 'class-level `@ValidSplit`, business rules → 400/422 problem details'],
        ['Redis caching', 'balances cached, evicted on every write, TTL safety net'],
        ['Testing', 'unit + slice + Testcontainers ITs green in `./mvnw verify`'],
        ['AI-assisted workflow', 'Cursor rules committed; an AI-usage log in the README']
      ] },
      notes: [
        "This session is an integration sprint: no new framework concepts, but making Sessions 13–16 work *together* is where real engineering problems appear (cache keys vs authorization, test setup with security, validation layering).",
        "Tech for this minor project per the brochure: JUnit & Mockito, Redis, Spring Security, Cursor AI."
      ]
    },
    {
      type: 'theory',
      title: 'AI-assisted development with Cursor',
      lead: 'Cursor is an AI-first code editor (built on VS Code) that can read your codebase, answer questions, and make multi-file changes — with you in control.',
      table: { head: ['Mode', 'What it does', 'Use it for'], rows: [
        ['Tab (autocomplete)', 'predicts multi-line edits as you type', 'boilerplate, repetitive patterns'],
        ['Inline edit (Ctrl/Cmd + K)', 'rewrites the selected code from an instruction', 'refactor a method, add logging, convert to a record'],
        ['Ask', 'answers questions about the code — read-only', 'understanding a module, planning a change'],
        ['Agent', 'plans, edits many files, runs terminal commands (with your approval)', 'a feature + tests, a migration, a cross-cutting refactor']
      ] },
      points: [
        "**Context** is everything: @-mention files, folders and docs (`@ExpenseService.java`, `@Docs`) so the model works from *your* code.",
        "**Project rules** (`.cursor/rules/*.mdc`, or an `AGENTS.md` file) encode conventions the agent must follow on every request.",
        "Keep the agent on a short leash: plan first, small steps, run the tests, review every diff."
      ],
      callout: { kind: 'warn', text: "Models are trained on years of older code: unguided, they often emit Spring Boot 2/3 patterns (`@MockBean`, `WebSecurityConfigurerAdapter`, `javax.*`, `spring-boot-starter-web`). Rules + compiling + tests catch this." },
      notes: [
        "Tool names and features evolve quickly; the workflow principles here (context, rules, plan → implement → test → review) transfer to any AI coding assistant.",
        "Cursor indexes the repository to retrieve relevant code. Respect your organisation's policies: use privacy settings, and never paste secrets or customer data into prompts."
      ]
    },
    {
      type: 'practical',
      title: 'Project rules: teach the agent your conventions',
      lead: 'A rules file turns tribal knowledge into instructions the AI sees on every request — and documents conventions for humans too.',
      code: [
        { lang: 'text', file: '.cursor/rules/spring-boot.mdc', lint: false, src: code`
          ---
          description: Conventions for the Splitwise Spring Boot 4 backend
          globs: ["src/**/*.java", "pom.xml", "src/**/*.sql"]
          alwaysApply: true
          ---
          - Java 21, Spring Boot 4.1.x, Spring Framework 7, Jakarta EE: jakarta.* imports only.
          - Starters: spring-boot-starter-webmvc (not -web), spring-boot-starter-aspectj (not -aop),
            spring-boot-starter-flyway + flyway-mysql. Tests: spring-boot-starter-webmvc-test.
          - Tests: JUnit Jupiter + AssertJ + Mockito. Use @MockitoBean (never @MockBean).
            MockMvc request bodies as Java text blocks.
          - Security: a SecurityFilterChain bean with the lambda DSL. No WebSecurityConfigurerAdapter,
            no antMatchers, no .and() chaining.
          - Money: BigDecimal with scale 2 and DECIMAL(12,2) columns; compare with compareTo; never double.
          - API: request/response DTOs as records; never return entities; errors as ProblemDetail via
            GlobalExceptionHandler (400 validation, 404 not found, 409 conflict, 422 business rule).
          - Persistence: Flyway migrations only (ddl-auto=validate); LAZY associations; avoid N+1 queries.
          - Caching: @Cacheable on BalanceService only; every write path must @CacheEvict "balances".
          - Every new public service method needs a unit test; every endpoint a @WebMvcTest.
          - Ask before adding dependencies. Run ./mvnw -q verify before saying a task is done.` },
        { lang: 'text', file: 'AGENTS.md (alternative)', src: code`
          # Agent instructions
          Build: ./mvnw -q verify      Run: docker compose up -d && ./mvnw spring-boot:run
          Read .cursor/rules/spring-boot.mdc for coding conventions.
          Never commit secrets. Never edit applied Flyway migrations; add a new V<n>__*.sql instead.` }
      ],
      notes: [
        "Notice how the rules mirror everything we learned: they are the course's 'version notes' turned into machine-readable guidance. Updating them is part of upgrading Spring Boot.",
        "`globs` scopes a rule to matching files; `alwaysApply: true` includes it in every request. Keep rules short and specific — long essays get ignored by models just like by humans.",
        "Commit the rules to Git so the whole team (and CI review bots) share them."
      ]
    },
    {
      type: 'theory',
      title: 'Prompting for backend tasks',
      lead: 'Treat the agent like a fast junior developer: precise task, relevant context, constraints, and a way to verify.',
      code: { lang: 'text', label: 'Prompt template', src: code`
        TASK         Implement <feature> in <module>.
        CONTEXT      @File1.java @File2.java @.cursor/rules/spring-boot.mdc
        REQUIREMENTS - business rule 1 ...
                     - error handling: <exception> -> <status> problem detail
        CONSTRAINTS  - no new dependencies; follow existing package structure
                     - keep public APIs unchanged
        TESTS        - unit tests for <cases>; @WebMvcTest for <endpoint>
        PROCESS      Show a short plan first. Wait for my approval before editing.
                     After editing, run ./mvnw -q test and report the result.` },
      table: { head: ['Do', 'Don\'t'], rows: [
        ['Ask for a plan before edits', 'accept a 40-file diff you haven\'t read'],
        ['Give examples of existing code to imitate (@EqualSplit.java)', 'describe conventions vaguely'],
        ['Ask for tests first, then the implementation', 'trust "it should work" without running tests'],
        ['Iterate in small, committed steps', 'mix three features in one request'],
        ['Paste the exact error/stack trace when something fails', 'say "it doesn\'t work"']
      ] },
      notes: [
        "Good prompts contain acceptance criteria; the agent can then check its own work by running the tests. That loop — generate, run, read failures, fix — is where agents genuinely save time.",
        "For repetitive work (DTOs for ten endpoints, mapping code, test scaffolding, migrations from an ERD) agents shine. For core money rules, write or at least review every line yourself."
      ]
    },
    {
      type: 'practical',
      title: 'Advanced validation: a class-level @ValidSplit constraint',
      lead: 'Field annotations can\'t compare fields with each other. A class-level constraint validates the request as a whole.',
      code: [
        { lang: 'java', file: 'ValidSplit.java', src: code`
          package com.example.splitwise.expense.validation;

          import jakarta.validation.Constraint;
          import jakarta.validation.Payload;
          import java.lang.annotation.*;

          @Target(ElementType.TYPE)
          @Retention(RetentionPolicy.RUNTIME)
          @Constraint(validatedBy = ValidSplitValidator.class)
          public @interface ValidSplit {
              String message() default "split values are inconsistent with the split type";
              Class<?>[] groups() default {};
              Class<? extends Payload>[] payload() default {};
          }` },
        { lang: 'java', file: 'ValidSplitValidator.java', src: code`
          package com.example.splitwise.expense.validation;

          import com.example.splitwise.expense.CreateExpenseRequest;
          import com.example.splitwise.expense.ParticipantInput;
          import jakarta.validation.ConstraintValidator;
          import jakarta.validation.ConstraintValidatorContext;
          import java.math.BigDecimal;
          import java.util.List;
          import java.util.Objects;

          public class ValidSplitValidator implements ConstraintValidator<ValidSplit, CreateExpenseRequest> {
              private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

              @Override
              public boolean isValid(CreateExpenseRequest req, ConstraintValidatorContext ctx) {
                  if (req == null || req.amount() == null || req.splitType() == null || req.participants() == null) {
                      return true;                                   // field-level @NotNull reports these
                  }
                  List<BigDecimal> values = req.participants().stream().map(ParticipantInput::value).toList();
                  String error = switch (req.splitType()) {
                      case EQUAL -> values.stream().allMatch(Objects::isNull) ? null : "EQUAL splits must not specify values";
                      case EXACT -> values.contains(null) ? "every participant needs an amount"
                              : sum(values).compareTo(req.amount()) == 0 ? null : "exact amounts must add up to " + req.amount();
                      case PERCENTAGE -> values.contains(null) ? "every participant needs a percentage"
                              : sum(values).compareTo(HUNDRED) == 0 ? null : "percentages must add up to 100";
                      case SHARES -> values.stream().allMatch(v -> v != null && v.signum() > 0) ? null : "shares must be positive";
                  };
                  if (error == null) return true;
                  ctx.disableDefaultConstraintViolation();
                  ctx.buildConstraintViolationWithTemplate(error)      // never put raw user text in templates
                     .addPropertyNode("participants")
                     .addConstraintViolation();
                  return false;
              }

              private static BigDecimal sum(List<BigDecimal> values) {
                  return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
              }
          }` },
        { lang: 'java', file: 'CreateExpenseRequest.java', src: code`
          @ValidSplit                                                   // class-level, cross-field rule
          public record CreateExpenseRequest(
                  @NotBlank @Size(max = 120) String description,
                  @NotNull @Positive @Digits(integer = 10, fraction = 2) BigDecimal amount,
                  @NotNull Long paidBy,
                  @NotNull SplitType splitType,
                  @NotNull @PastOrPresent LocalDate expenseDate,
                  @NotEmpty @Size(max = 50) List<@Valid @NotNull ParticipantInput> participants) {}` }
      ],
      callout: { kind: 'pitfall', text: "Hibernate Validator interprets `{…}` and `${…}` in message templates. Building templates from user input enables **expression-language injection** — only include trusted values (like the numeric amount here)." },
      notes: [
        "Validation layering in the final design: field constraints (shape) → `@ValidSplit` (internal consistency, no database) → service rules (membership, needs data) → database constraints (last line of defence).",
        "The violation is attached to the `participants` property, so our `GlobalExceptionHandler` reports it in the same `errors` map as field errors — clients get one consistent 400 format.",
        "`@PastOrPresent` on the date and `@Size(max = 50)` on participants are cheap guards against nonsense and abuse."
      ]
    },
    {
      type: 'practical',
      title: 'Role-based access: the permission matrix',
      lead: 'Write the matrix first, then make every cell a test.',
      table: { head: ['Action', 'Platform ADMIN', 'Group ADMIN', 'Group MEMBER', 'Non-member'], rows: [
        ['View group, expenses, balances', '✅', '✅', '✅', '❌ 403'],
        ['Add / edit own expense', '—', '✅', '✅', '❌ 403'],
        ['Edit / delete any expense in the group', '—', '✅', '❌ 403', '❌ 403'],
        ['Add / remove members, rename group', '—', '✅', '❌ 403', '❌ 403'],
        ['Record a settlement (as payer)', '—', '✅', '✅', '❌ 403'],
        ['List all users, disable accounts (`/api/v1/admin/**`)', '✅', '❌ 403', '❌ 403', '❌ 403']
      ] },
      code: { lang: 'java', label: 'Security + caching, layered safely', verify: false, src: code`
        @Service
        @RequiredArgsConstructor
        public class GroupQueries {                       // authorization at the entry point...
            private final BalanceService balances;

            @PreAuthorize("@groupAccess.isMember(#groupId, authentication)")
            public List<MemberBalance> balancesFor(Long groupId) {
                return balances.balances(groupId);       // ...cache in a separate bean (no self-invocation)
            }
        }

        @Service
        public class BalanceService {
            @Cacheable(cacheNames = "balances", key = "#groupId", sync = true)
            public List<MemberBalance> balances(long groupId) { ... }   // pure data access, no user context
        }` },
      notes: [
        "Why split `GroupQueries` and `BalanceService`? The cache key is the group id only, so the authorization check must *always* run before the cache lookup — otherwise a non-member could read cached balances. Keeping them in separate beans makes the order explicit and avoids self-invocation.",
        "'Edit own expense' is a data-level rule: compare `expense.createdBy` with the principal's id in the service (or in a `@PreAuthorize` bean method).",
        "Ask an AI agent to *generate the security tests from this matrix* — a perfect, verifiable, repetitive task."
      ]
    },
    {
      type: 'practical',
      title: 'An agent session, step by step',
      lead: 'What a productive, controlled Agent-mode session looks like.',
      code: { lang: 'text', label: 'Agent transcript (abridged)', src: code`
        YOU    Implement the SHARES split strategy.
               Context: @SplitStrategy.java @EqualSplit.java @Allocation.java @.cursor/rules/spring-boot.mdc
               - shares must be positive, allocate paise with the largest-remainder rule (reuse Allocation)
               - BusinessRuleException with a clear message on invalid input
               - SharesSplitTest: 1000.00 with 2:1:1 -> 500/250/250; 100.00 with 1:1:1 -> 33.34/33.33/33.33;
                 a zero share is rejected
               Show a plan first; don't edit until I approve.

        AGENT  Plan: 1) SharesSplit implements SplitStrategy, annotated @Component (resolver picks it up)
                     2) SharesSplitTest as a @ParameterizedTest + one negative test
                     3) run ./mvnw -q test -Dtest=SharesSplitTest
        YOU    Approved.
        AGENT  Created SharesSplit.java, SharesSplitTest.java. Running tests...
               FAILED: expected 33.34 for user 1 but was 33.33 (leftover paisa went to user 3)
               Cause: tie-break on equal fractions used the HashMap iteration order.
               Fix: iterate participants in request order (LinkedHashMap) as EqualSplit does. Re-running...
               Tests: 4 passed, 0 failed.
        YOU    (reviews the diff: BigDecimal only, no new deps, message wording, test names)
               git commit -m "feat: SHARES split strategy with tests"` },
      notes: [
        "The valuable moment is the failing test: the agent's first attempt had a subtle rounding-order bug — exactly the kind of mistake that would slip through without tests. Tests turn AI output from 'plausible' into 'verified'.",
        "The human's job shifts to specification (the prompt), judgement (approving the plan) and review (the diff). That's still engineering — arguably the most important part.",
        "Keep an *AI usage log* in the README for this project: prompt, what was generated, what you changed and why. Interviewers increasingly ask how candidates use AI responsibly."
      ]
    },
    {
      type: 'theory',
      title: 'Reviewing AI-generated code',
      lead: 'You own every line you merge — regardless of who (or what) typed it.',
      table: { head: ['Check', 'What to look for'], rows: [
        ['Compiles & tests pass', 'run `./mvnw verify` yourself; hallucinated APIs fail here'],
        ['Current APIs', 'Boot 4 starters, `@MockitoBean`, `jakarta.*`, lambda security DSL'],
        ['Correctness', 'money as BigDecimal, rounding rules, transactions around multi-step writes'],
        ['Security', 'authorization on every endpoint, no secrets, parameterised SQL, no EL in messages'],
        ['Performance', 'N+1 queries, missing indexes, cache eviction on every write path'],
        ['Tests that test', 'assertions on behaviour, not just executed lines; negative cases'],
        ['Scope', 'no unrequested dependencies, renames or "drive-by" refactors']
      ] },
      points: [
        "Risks: confident but wrong code, outdated patterns, **prompt injection** via files or issues the agent reads, leaking sensitive data in prompts.",
        "Mitigations: rules, small diffs, mandatory tests/CI, code review, privacy settings, least-privilege terminal access."
      ],
      notes: [
        "Run the course's own lint idea in CI: a simple grep for `@MockBean`, `javax.persistence` or `antMatchers` fails the build — cheap protection against outdated AI suggestions.",
        "Agents that can execute terminal commands must be supervised: approve commands, never give them production credentials."
      ]
    },
    {
      type: 'practical',
      title: 'Integration test: security + Redis + MySQL together',
      lead: 'One Testcontainers-backed test proves the layers cooperate: a member writes, balances get cached, an outsider is refused.',
      code: { lang: 'java', file: 'SecuredFlowIT.java', src: code`
        package com.example.splitwise;

        import static org.assertj.core.api.Assertions.assertThat;
        import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
        import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
        import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

        import org.junit.jupiter.api.Test;
        import org.springframework.beans.factory.annotation.Autowired;
        import org.springframework.boot.test.context.SpringBootTest;
        import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
        import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
        import org.springframework.cache.CacheManager;
        import org.springframework.http.MediaType;
        import org.springframework.test.context.jdbc.Sql;
        import org.springframework.test.web.servlet.MockMvc;
        import org.testcontainers.containers.GenericContainer;
        import org.testcontainers.junit.jupiter.Container;
        import org.testcontainers.junit.jupiter.Testcontainers;
        import org.testcontainers.mysql.MySQLContainer;

        @SpringBootTest
        @AutoConfigureMockMvc
        @Testcontainers
        @Sql("/seed-secured-goa-trip.sql")      // users with known BCrypt hashes; zoya is not a member
        class SecuredFlowIT {

            @Container @ServiceConnection
            static MySQLContainer mysql = new MySQLContainer("mysql:8.4");

            @Container @ServiceConnection(name = "redis")
            static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

            @Autowired MockMvc mvc;
            @Autowired CacheManager caches;

            @Test
            void memberWritesBalancesAreCachedOutsiderIsRefused() throws Exception {
                mvc.perform(post("/api/v1/groups/7/expenses").with(httpBasic("asha@example.com", "correct-horse-battery"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                    {"description": "Dinner", "amount": 1200.00, "paidBy": 1, "splitType": "EQUAL",
                                     "expenseDate": "2026-10-20",
                                     "participants": [{"userId": 1}, {"userId": 2}, {"userId": 3}]}
                                    """))
                   .andExpect(status().isCreated());

                mvc.perform(get("/api/v1/groups/7/balances").with(httpBasic("ravi@example.com", "correct-horse-battery")))
                   .andExpect(status().isOk())
                   .andExpect(jsonPath("$[0].balance").value(800.00));
                assertThat(caches.getCache("balances").get(7L)).isNotNull();          // now cached in Redis

                mvc.perform(get("/api/v1/groups/7/balances").with(httpBasic("zoya@example.com", "correct-horse-battery")))
                   .andExpect(status().isForbidden());                               // checked before the cache
            }
        }` },
      notes: [
        "Two containers start once per test class: MySQL (with Flyway migrations) and Redis. `@ServiceConnection(name = \"redis\")` tells Boot that the generic container is a Redis server.",
        "The seed script inserts users with BCrypt hashes generated once — never plain passwords — and group memberships for asha/ravi/meera.",
        "This single test would have caught the 'cache before authorization' bug from the permission-matrix slide."
      ]
    },
    {
      type: 'lab',
      title: 'Project milestone 3: Splitwise Advanced',
      lead: 'Ship the integrated, secured, cached and tested release — using AI where it helps, proving everything with tests.',
      steps: [
        "Commit `.cursor/rules/spring-boot.mdc` (and/or `AGENTS.md`) with the course conventions; verify the agent follows them on a small task.",
        "Use Agent mode to scaffold `@ValidSplit` + validator tests from a precise prompt; review and fix the result.",
        "Implement the permission matrix with `@PreAuthorize` + `GroupAccess`; have the agent generate one MockMvc security test per matrix cell.",
        "Ensure `BalanceService` caching sits behind authorization (separate beans) and every write path evicts `balances`.",
        "Add rate limiting (429) on expense creation and an `Idempotency-Key` on settlements using Redis.",
        "Write `SecuredFlowIT` with MySQL + Redis Testcontainers; make `./mvnw verify` green with ≥ 80% coverage on service packages.",
        "Add an **AI usage log** to the README: three prompts, what was accepted, what you changed and why.",
        "Open the *Splitwise Advanced* pull request; review a peer's PR using the AI-code review checklist."
      ],
      notes: [
        "Assessment focuses on behaviour (tests prove the matrix), not on how much code the AI wrote. A student who rejects a bad AI suggestion and explains why has demonstrated exactly the judgement employers want.",
        "If students lack Cursor access, the same workflow works with any assistant that supports project instructions; the rules file content stays the same."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: Splitwise Advanced & AI-assisted coding',
      quiz: [
        { q: "Which Cursor mode is best for a multi-file feature that must also run the test suite?", options: ['Tab autocomplete', 'Ask', 'Agent', 'Inline edit'], answer: 2,
          why: "Agent mode plans, edits multiple files and can run terminal commands (with approval)." },
        { q: "Why commit a rules file such as `.cursor/rules/spring-boot.mdc`?", options: ['It speeds up Maven', 'It makes the AI follow project conventions (e.g. Boot 4 APIs) on every request', 'Cursor refuses to run without it', 'It replaces code review'], answer: 1,
          why: "Rules provide persistent context so generated code matches your stack and conventions; review is still required." },
        { q: "Cross-field rules like 'percentages must add up to 100' are best implemented as…", options: ['Field-level @Min/@Max', 'A class-level constraint (custom ConstraintValidator)', 'A database trigger only', 'A frontend check only'], answer: 1,
          why: "Only a class-level constraint can see several fields of the request at once." },
        { q: "Balances are cached by group id. What must happen before the cache is consulted?", options: ['Nothing', 'An authorization check that the caller is a group member', 'A cache flush', 'A database write'], answer: 1,
          why: "Otherwise a non-member could read another group's cached balances. Authorize first, then hit the cache." },
        { q: "The AI generates a test using `@MockBean`. In a Boot 4 project you should…", options: ['Keep it', 'Replace it with @MockitoBean (and tighten your rules file)', 'Downgrade to Boot 3', 'Delete the test'], answer: 1,
          why: "`@MockBean` was removed in Boot 4. Fix the code and update the rules so it doesn't recur." }
      ],
      notes: [
        "Discuss Q5's broader lesson: AI assistants reflect the *average* of their training data, which lags behind the latest framework releases."
      ]
    },
    {
      type: 'summary',
      title: 'Session 17 recap',
      points: [
        "Splitwise Advanced integrates security (RBAC + domain checks), Redis caching, advanced validation and a full test pyramid.",
        "Class-level constraints (`@ValidSplit`) handle cross-field rules; never build message templates from user input.",
        "Authorize before cache access — keep `@PreAuthorize` and `@Cacheable` in separate beans.",
        "Cursor: Tab, inline edit, Ask, Agent; @-context and project rules make output fit your stack.",
        "AI accelerates repetitive work; tests, CI and human review make it trustworthy."
      ],
      cards: [
        ['Class-level constraint', 'Bean Validation annotation on a type, validating several fields together.'],
        ['Permission matrix', 'Table of roles × actions — each cell becomes a security test.'],
        ['Agent mode', 'AI plans and applies multi-file changes, running commands with approval.'],
        ['Project rules', 'Persistent instructions (e.g. .cursor/rules/*.mdc, AGENTS.md) for AI assistants.'],
        ['@-mention context', 'Pointing the AI at specific files, folders or docs.'],
        ['Prompt injection', 'Malicious instructions hidden in content an AI reads.'],
        ['EL injection', 'Abusing validator message templates with ${} expressions.'],
        ['AI usage log', 'Record of prompts, accepted output and human changes.']
      ],
      notes: [
        "Next session: OAuth 2.0 — delegated authorization, flows and scopes — and 'Login with GitHub' in Spring Boot, ending with a bridge to microservices."
      ]
    }
  ]
});
