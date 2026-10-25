COURSE.session({
  no: 14,
  short: 'JUnit 5, Mockito & MockMvc',
  title: 'JUnit 5 & Mockito — Service & Controller Testing, MockMvc for REST APIs',
  covers: [1, 2],
  objectives: [
    "Write clear JUnit 5 (Jupiter) tests with AssertJ, parameterized tests and nested structure.",
    "Isolate services with Mockito: stubbing, verification, argument captors and BDD style.",
    "Test controllers with `@WebMvcTest` + MockMvc (and MockMvcTester), including validation and error responses.",
    "Run realistic integration tests with `@SpringBootTest`, `@DataJpaTest` and Testcontainers MySQL."
  ],
  prereq: "Sessions 12–13: the Splitwise services, controllers and repositories we are about to test.",
  slides: [
    {
      type: 'theory',
      title: 'Why test — and the test pyramid',
      lead: 'Tests let you change code without fear. Most tests should be small and fast; a few should exercise the whole system.',
      diagram: { kind: 'pyramid', levels: [
        { t: 'End-to-end', s: 'few · slow · whole system through HTTP', tone: 'red' },
        { t: 'Integration', s: 'some · real DB / Spring context (Testcontainers, @SpringBootTest)', tone: 'orange' },
        { t: 'Slice tests', s: '@WebMvcTest, @DataJpaTest', tone: 'yellow' },
        { t: 'Unit tests', s: 'many · milliseconds · plain JUnit + Mockito', tone: 'green' }
      ] },
      points: [
        "**F.I.R.S.T.** — Fast, Independent, Repeatable, Self-validating, Timely.",
        "Structure every test as **Arrange → Act → Assert** (Given → When → Then).",
        "`spring-boot-starter-test` brings JUnit Jupiter, AssertJ, Mockito, Hamcrest, JSONassert and JsonPath."
      ],
      callout: { kind: 'version', text: "Spring Boot 4 ships **JUnit 6**, which keeps the JUnit 5 *Jupiter* programming model (`org.junit.jupiter.api.*`) taught here. JUnit 4 support is gone." },
      notes: [
        "The Splitwise money logic is the perfect motivation: a rounding bug that loses one paisa per expense is invisible in a demo and catastrophic in production. Tests make the invariants explicit.",
        "Speed matters: a unit suite that runs in 3 seconds gets run on every change; a suite that takes 10 minutes gets skipped. That's why the base of the pyramid is plain Java without Spring."
      ]
    },
    {
      type: 'theory',
      title: 'JUnit 5 (Jupiter) essentials',
      lead: 'Annotations organise the lifecycle; AssertJ makes assertions read like sentences.',
      table: { head: ['Annotation', 'Purpose'], rows: [
        ['`@Test`', 'a test method'],
        ['`@BeforeEach` / `@AfterEach`', 'run around every test (fresh fixtures)'],
        ['`@BeforeAll` / `@AfterAll`', 'once per class (static), e.g. start a container'],
        ['`@DisplayName("…")`', 'human-readable names in reports'],
        ['`@Nested`', 'group related tests in inner classes'],
        ['`@ParameterizedTest` + `@CsvSource` / `@ValueSource` / `@MethodSource`', 'same test, many inputs'],
        ['`@Tag("slow")`, `@Disabled`, `@Timeout`', 'filter, skip, guard against hangs'],
        ['`@ExtendWith(MockitoExtension.class)`', 'plug in extensions (Mockito, Spring)']
      ] },
      code: { lang: 'java', label: 'Assertions: JUnit vs AssertJ', verify: false, src: code`
        // JUnit assertions
        assertEquals(3, shares.size());
        assertThrows(BusinessRuleException.class, () -> strategy.split(amount, participants));

        // AssertJ — fluent, better failure messages
        assertThat(shares).hasSize(3).containsKeys(1L, 2L, 3L);
        assertThat(total).isEqualByComparingTo("1000.00");          // BigDecimal: ignore scale
        assertThatThrownBy(() -> strategy.split(amount, participants))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("add up to");` },
      notes: [
        "Test classes and methods can be package-private in JUnit 5 — no `public` noise needed.",
        "Use `isEqualByComparingTo` for BigDecimal: `400.0` and `400.00` are equal amounts but not `equals()` (Session 12).",
        "Good test names describe behaviour: `sharesAlwaysAddUpToTheAmount`, `rejectsPayerWhoIsNotAMember` — the report then reads like a specification."
      ]
    },
    {
      type: 'practical',
      title: 'Unit tests for the money logic',
      lead: 'Pure Java, no Spring, milliseconds per test — parameterized cases cover the tricky rounding edges.',
      code: [
        { lang: 'java', file: 'EqualSplitTest.java', src: code`
          package com.example.splitwise.expense.split;

          import static org.assertj.core.api.Assertions.assertThat;

          import java.math.BigDecimal;
          import java.util.List;
          import java.util.Map;
          import java.util.stream.LongStream;
          import org.junit.jupiter.params.ParameterizedTest;
          import org.junit.jupiter.params.provider.CsvSource;

          class EqualSplitTest {
              private final EqualSplit strategy = new EqualSplit();

              @ParameterizedTest(name = "{0} split {1} ways -> first share {2}")
              @CsvSource({
                  "100.00,  3, 33.34",
                  "2400.00, 4, 600.00",
                  "0.01,    2, 0.01",
                  "10.00,   3, 3.34"
              })
              void sharesAlwaysAddUpToTheAmount(BigDecimal amount, int people, BigDecimal firstShare) {
                  List<ParticipantInput> participants = LongStream.rangeClosed(1, people)
                          .mapToObj(id -> new ParticipantInput(id, null)).toList();

                  Map<Long, BigDecimal> shares = strategy.split(amount, participants);

                  assertThat(shares).hasSize(people);
                  assertThat(shares.get(1L)).isEqualByComparingTo(firstShare);
                  assertThat(shares.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add))
                          .isEqualByComparingTo(amount);
              }
          }` },
        { lang: 'java', file: 'DebtSimplifierTest.java', src: code`
          package com.example.splitwise.settlement;

          import static org.assertj.core.api.Assertions.assertThat;

          import java.math.BigDecimal;
          import java.util.LinkedHashMap;
          import java.util.Map;
          import org.junit.jupiter.api.DisplayName;
          import org.junit.jupiter.api.Nested;
          import org.junit.jupiter.api.Test;

          class DebtSimplifierTest {

              @Nested
              @DisplayName("given balances that sum to zero")
              class ZeroSum {
                  private final Map<String, BigDecimal> balances = new LinkedHashMap<>(Map.of(
                          "asha", new BigDecimal("1500.00"), "ravi", new BigDecimal("-700.00"),
                          "meera", new BigDecimal("-500.00"), "zoya", new BigDecimal("200.00"),
                          "dev", new BigDecimal("-500.00")));

                  @Test
                  void needsAtMostNMinusOneTransfers() {
                      assertThat(DebtSimplifier.simplify(balances)).hasSizeLessThanOrEqualTo(balances.size() - 1);
                  }

                  @Test
                  void transfersSettleEveryBalanceExactly() {
                      Map<String, BigDecimal> after = new LinkedHashMap<>(balances);
                      DebtSimplifier.simplify(balances).forEach(t -> {
                          after.merge(t.from(), t.amount(), BigDecimal::add);        // debtor pays
                          after.merge(t.to(), t.amount().negate(), BigDecimal::add); // creditor receives
                      });
                      assertThat(after.values()).allSatisfy(v -> assertThat(v).isZero());
                  }
              }

              @Test
              void noTransfersWhenEveryoneIsSettled() {
                  assertThat(DebtSimplifier.simplify(Map.of("asha", BigDecimal.ZERO, "ravi", BigDecimal.ZERO))).isEmpty();
              }
          }` }
      ],
      notes: [
        "The second test checks a *property* (after applying the transfers, every balance is zero) rather than one hard-coded answer — far more robust when the algorithm's tie-breaking changes.",
        "`@CsvSource` converts strings to `BigDecimal` and `int` automatically. Add a row for every bug you ever fix: the suite becomes a memory of past mistakes.",
        "`assertThat(v).isZero()` works for BigDecimal regardless of scale (0.00 vs 0)."
      ]
    },
    {
      type: 'theory',
      title: 'Mockito: isolating the unit under test',
      lead: 'A service depends on repositories and other services. Replace them with **test doubles** so a test checks one class\'s logic only.',
      table: { head: ['Double', 'What it is', 'Mockito'], rows: [
        ['Stub', 'returns canned answers', '`given(repo.findById(1L)).willReturn(Optional.of(u))`'],
        ['Mock', 'records calls so you can verify interactions', '`then(repo).should().save(any())`'],
        ['Spy', 'real object, selectively stubbed', '`@Spy`, `spy(realObject)`'],
        ['Fake', 'working lightweight implementation', 'in-memory repository (hand-written)'],
        ['Captor', 'captures arguments for assertions', '`ArgumentCaptor<Expense>`']
      ] },
      points: [
        "`@ExtendWith(MockitoExtension.class)` + `@Mock` fields; strict stubs fail tests with **unused** stubbing (keeps tests honest).",
        "Prefer constructing the service yourself (constructor injection pays off!) over `@InjectMocks` magic.",
        "Don't mock what you don't own deeply (e.g. JPA internals) and never mock the class under test.",
        "Verify **outcomes** first (return values, captured arguments); verify interactions only when they *are* the behaviour (e.g. `save` must not be called)."
      ],
      notes: [
        "BDD style (`given/willReturn`, `then(...).should()`) reads naturally with Arrange-Act-Assert; classic `when/thenReturn` and `verify` are equivalent.",
        "Over-mocking is a smell: if a test needs ten stubs, the class probably does too much. Tests give design feedback."
      ]
    },
    {
      type: 'practical',
      title: 'Service-layer test with Mockito',
      lead: 'Test `ExpenseService.addExpense` without a database: stub the repositories, capture what gets saved, and check the rule violations.',
      code: [
        { lang: 'java', file: 'ExpenseServiceTest.java', src: code`
          package com.example.splitwise.expense;

          import static org.assertj.core.api.Assertions.*;
          import static org.mockito.ArgumentMatchers.*;
          import static org.mockito.BDDMockito.*;

          import com.example.splitwise.common.BusinessRuleException;
          import com.example.splitwise.expense.split.*;
          import com.example.splitwise.group.ExpenseGroupRepository;
          import com.example.splitwise.user.UserRepository;
          import java.math.BigDecimal;
          import java.time.LocalDate;
          import java.util.List;
          import java.util.Optional;
          import org.junit.jupiter.api.BeforeEach;
          import org.junit.jupiter.api.Test;
          import org.junit.jupiter.api.extension.ExtendWith;
          import org.mockito.ArgumentCaptor;
          import org.mockito.Mock;
          import org.mockito.junit.jupiter.MockitoExtension;

          @ExtendWith(MockitoExtension.class)
          class ExpenseServiceTest {
              @Mock ExpenseGroupRepository groups;
              @Mock UserRepository users;
              @Mock ExpenseRepository expenses;
              ExpenseService service;

              @BeforeEach
              void setUp() {                  // constructor injection: no Spring needed in unit tests
                  service = new ExpenseService(groups, users, expenses,
                          new SplitStrategyResolver(List.of(new EqualSplit(), new ExactSplit())));
              }

              @Test
              void savesAnEqualExpenseWithThreeSplits() {
                  // Arrange
                  given(groups.findWithMembers(7L)).willReturn(Optional.of(TestData.groupWithMembers(7L, 1L, 2L, 3L)));
                  given(users.getReferenceById(anyLong())).willAnswer(inv -> TestData.user(inv.getArgument(0)));
                  given(expenses.save(any(Expense.class))).willAnswer(inv -> inv.getArgument(0));
                  var request = new CreateExpenseRequest("Dinner", new BigDecimal("1200.00"), 1L, SplitType.EQUAL,
                          LocalDate.of(2026, 10, 20), List.of(new ParticipantInput(1L, null),
                          new ParticipantInput(2L, null), new ParticipantInput(3L, null)));

                  // Act
                  service.addExpense(7L, 1L, request);

                  // Assert
                  ArgumentCaptor<Expense> saved = ArgumentCaptor.forClass(Expense.class);
                  then(expenses).should().save(saved.capture());
                  assertThat(saved.getValue().getSplits())
                          .extracting(ExpenseSplit::getShareAmount)
                          .containsExactly(new BigDecimal("400.00"), new BigDecimal("400.00"), new BigDecimal("400.00"));
              }

              @Test
              void rejectsAPayerWhoIsNotAMember() {
                  given(groups.findWithMembers(7L)).willReturn(Optional.of(TestData.groupWithMembers(7L, 1L, 2L)));
                  var request = new CreateExpenseRequest("Cab", new BigDecimal("300.00"), 99L, SplitType.EQUAL,
                          LocalDate.of(2026, 10, 21), List.of(new ParticipantInput(1L, null), new ParticipantInput(2L, null)));

                  assertThatThrownBy(() -> service.addExpense(7L, 1L, request))
                          .isInstanceOf(BusinessRuleException.class)
                          .hasMessage("payer is not a group member");
                  then(expenses).should(never()).save(any());       // nothing persisted
              }
          }` },
        { lang: 'java', file: 'TestData.java', src: code`
          package com.example.splitwise.expense;

          import com.example.splitwise.group.ExpenseGroup;
          import com.example.splitwise.group.GroupRole;
          import com.example.splitwise.user.User;
          import org.springframework.test.util.ReflectionTestUtils;

          /** Test data builders: readable fixtures with ids set as if loaded from the DB. */
          final class TestData {
              static User user(long id) {
                  User u = new User("user" + id + "@example.com", "User " + id);
                  ReflectionTestUtils.setField(u, "id", id);
                  return u;
              }

              static ExpenseGroup groupWithMembers(long groupId, Long... userIds) {
                  ExpenseGroup g = new ExpenseGroup("Goa Trip", user(userIds[0]));
                  for (int i = 1; i < userIds.length; i++) g.addMember(user(userIds[i]), GroupRole.MEMBER);
                  ReflectionTestUtils.setField(g, "id", groupId);
                  return g;
              }
          }` }
      ],
      notes: [
        "`CreateExpenseRequest` here has the Session 13 shape: description, amount, paidBy, splitType, expenseDate, participants.",
        "`willAnswer(inv -> inv.getArgument(0))` makes `save` return what it received — a common stub for repositories.",
        "The second test proves a *negative*: on a rule violation nothing is saved. `never()` verification is exactly the behaviour here, so verifying the interaction is justified."
      ]
    },
    {
      type: 'theory',
      title: 'Spring test slices: load only what you test',
      lead: 'Starting the whole application for every test is slow. Slices start just one layer, with everything else mocked or absent.',
      table: { head: ['Annotation', 'Loads', 'Use for', 'Boot 4 test starter'], rows: [
        ['*(none)* + Mockito', 'nothing', 'services, strategies, utilities', '`spring-boot-starter-test`'],
        ['`@WebMvcTest(Controller.class)`', 'MVC: controllers, advice, filters, Jackson, MockMvc', 'request mapping, validation, status codes, JSON', '`spring-boot-starter-webmvc-test`'],
        ['`@DataJpaTest`', 'JPA, repositories, Flyway, transactions (rolled back)', 'queries, mappings, constraints', '`spring-boot-starter-data-jpa-test`'],
        ['`@SpringBootTest`', 'the full application context', 'end-to-end flows across layers', '`spring-boot-starter-test`']
      ] },
      points: [
        "Replace a bean with a mock using **`@MockitoBean`** (`@MockBean` was removed in Boot 4).",
        "Spring caches application contexts between tests with the same configuration — keep configurations few and consistent.",
        "Boot 4 packages: `org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest`, `org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest`."
      ],
      notes: [
        "Spring Boot 4 split the test support into per-technology modules. If `@WebMvcTest` doesn't resolve, add `spring-boot-starter-webmvc-test` (which also brings `spring-boot-starter-test`).",
        "`@MockitoBean` comes from Spring Framework itself (`org.springframework.test.context.bean.override.mockito`), as does `@MockitoSpyBean`.",
        "Every distinct set of `@MockitoBean`s creates a new cached context; dozens of variations make suites slow. Consolidate where you can."
      ]
    },
    {
      type: 'practical',
      title: 'Controller tests with @WebMvcTest & MockMvc',
      lead: 'Send real HTTP requests through the MVC stack — mapping, validation, JSON, `@RestControllerAdvice` — with the service mocked.',
      code: { lang: 'java', file: 'ExpenseControllerTest.java', src: code`
        package com.example.splitwise.expense;

        import static org.mockito.ArgumentMatchers.*;
        import static org.mockito.BDDMockito.given;
        import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
        import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

        import com.example.splitwise.common.NotFoundException;
        import java.math.BigDecimal;
        import java.time.Instant;
        import java.util.List;
        import org.junit.jupiter.api.Test;
        import org.springframework.beans.factory.annotation.Autowired;
        import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
        import org.springframework.http.MediaType;
        import org.springframework.test.context.bean.override.mockito.MockitoBean;
        import org.springframework.test.web.servlet.MockMvc;

        @WebMvcTest(ExpenseController.class)              // web layer only
        class ExpenseControllerTest {
            @Autowired MockMvc mvc;
            @MockitoBean ExpenseService service;          // a Mockito mock registered as a bean

            @Test
            void createsAnExpenseAndReturns201WithLocation() throws Exception {
                given(service.addExpense(eq(7L), anyLong(), any())).willReturn(new ExpenseResponse(41L, 7L, "Dinner",
                        new BigDecimal("1200.00"), 1L, List.of(1L, 2L, 3L), Instant.parse("2026-10-20T19:30:00Z")));

                mvc.perform(post("/api/v1/groups/7/expenses")
                                .header("X-User-Id", 1)             // acting user until Session 16
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                    {"description": "Dinner", "amount": 1200.00, "paidBy": 1, "splitType": "EQUAL",
                                     "expenseDate": "2026-10-20",
                                     "participants": [{"userId": 1}, {"userId": 2}, {"userId": 3}]}
                                    """))
                   .andExpect(status().isCreated())
                   .andExpect(header().string("Location", "http://localhost/api/v1/groups/7/expenses/41"))
                   .andExpect(jsonPath("$.id").value(41))
                   .andExpect(jsonPath("$.participants.length()").value(3));
            }

            @Test
            void returns400WithFieldErrorsForAnInvalidBody() throws Exception {
                mvc.perform(post("/api/v1/groups/7/expenses")
                                .header("X-User-Id", 1)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                    {"description": "", "amount": -5, "paidBy": 1, "splitType": "EQUAL",
                                     "expenseDate": "2026-10-20", "participants": [{"userId": 1}]}
                                    """))
                   .andExpect(status().isBadRequest())
                   .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                   .andExpect(jsonPath("$.errors.description").exists())
                   .andExpect(jsonPath("$.errors.amount").value("must be greater than 0"));
            }

            @Test
            void returns404ProblemDetailForAnUnknownExpense() throws Exception {
                given(service.get(7L, 999L)).willThrow(new NotFoundException("expense 999 not found in group 7"));

                mvc.perform(get("/api/v1/groups/7/expenses/999"))
                   .andExpect(status().isNotFound())
                   .andExpect(jsonPath("$.title").value("Resource not found"))
                   .andExpect(jsonPath("$.detail").value("expense 999 not found in group 7"));
            }
        }` },
      notes: [
        "Request bodies as Java **text blocks** keep JSON readable and copy-pasteable from Postman.",
        "`@WebMvcTest` includes `@ControllerAdvice` beans, so the 400/404 tests prove that your `GlobalExceptionHandler` and the validation annotations work together.",
        "The controller test doesn't care *how* the service computes anything — that's the service test's job. Each layer is tested for its own responsibility."
      ]
    },
    {
      type: 'practical',
      title: 'MockMvcTester & full integration tests with Testcontainers',
      lead: 'AssertJ-style MockMvc for concise assertions, and a real MySQL in Docker for the end-to-end flow.',
      code: [
        { lang: 'java', file: 'ExpenseControllerTesterTest.java', label: 'MockMvcTester (AssertJ)', src: code`
          package com.example.splitwise.expense;

          import static org.assertj.core.api.Assertions.assertThat;
          import static org.mockito.BDDMockito.given;

          import com.example.splitwise.common.NotFoundException;
          import org.junit.jupiter.api.Test;
          import org.springframework.beans.factory.annotation.Autowired;
          import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
          import org.springframework.http.HttpStatus;
          import org.springframework.test.context.bean.override.mockito.MockitoBean;
          import org.springframework.test.web.servlet.assertj.MockMvcTester;

          @WebMvcTest(ExpenseController.class)
          class ExpenseControllerTesterTest {
              @Autowired MockMvcTester mvc;                  // auto-configured when AssertJ is present
              @MockitoBean ExpenseService service;

              @Test
              void unknownExpenseIs404() {
                  given(service.get(7L, 999L)).willThrow(new NotFoundException("expense 999 not found in group 7"));

                  assertThat(mvc.get().uri("/api/v1/groups/7/expenses/999"))
                          .hasStatus(HttpStatus.NOT_FOUND)
                          .bodyJson().extractingPath("$.detail").isEqualTo("expense 999 not found in group 7");
              }
          }` },
        { lang: 'java', file: 'SplitwiseFlowIT.java', label: 'Integration (Testcontainers)', src: code`
          package com.example.splitwise;

          import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
          import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

          import org.junit.jupiter.api.Test;
          import org.springframework.beans.factory.annotation.Autowired;
          import org.springframework.boot.test.context.SpringBootTest;
          import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
          import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
          import org.springframework.http.MediaType;
          import org.springframework.test.context.jdbc.Sql;
          import org.springframework.test.web.servlet.MockMvc;
          import org.testcontainers.junit.jupiter.Container;
          import org.testcontainers.junit.jupiter.Testcontainers;
          import org.testcontainers.mysql.MySQLContainer;

          @SpringBootTest
          @AutoConfigureMockMvc                      // MockMvc against the full context
          @Testcontainers
          @Sql("/seed-goa-trip.sql")                 // users 1-3 in group 7
          class SplitwiseFlowIT {

              @Container
              @ServiceConnection                     // Boot wires spring.datasource.* to the container
              static MySQLContainer mysql = new MySQLContainer("mysql:8.4");

              @Autowired MockMvc mvc;

              @Test
              void balancesSumToZeroAfterAnExpense() throws Exception {
                  mvc.perform(post("/api/v1/groups/7/expenses").header("X-User-Id", 1)
                                  .contentType(MediaType.APPLICATION_JSON)
                                  .content("""
                                      {"description": "Dinner", "amount": 1200.00, "paidBy": 1, "splitType": "EQUAL",
                                       "expenseDate": "2026-10-20",
                                       "participants": [{"userId": 1}, {"userId": 2}, {"userId": 3}]}
                                      """))
                     .andExpect(status().isCreated());

                  mvc.perform(get("/api/v1/groups/7/balances"))
                     .andExpect(status().isOk())
                     .andExpect(jsonPath("$[0].balance").value(800.00))
                     .andExpect(jsonPath("$[1].balance").value(-400.00))
                     .andExpect(jsonPath("$[2].balance").value(-400.00));
              }
          }` },
        { lang: 'xml', file: 'pom.xml', label: 'Test dependencies', src: code`
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webmvc-test</artifactId>
            <scope>test</scope>
          </dependency>
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa-test</artifactId>
            <scope>test</scope>
          </dependency>
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-testcontainers</artifactId>
            <scope>test</scope>
          </dependency>
          <dependency>   <!-- Testcontainers 2.x artifact names; versions managed by Boot -->
            <groupId>org.testcontainers</groupId>
            <artifactId>testcontainers-junit-jupiter</artifactId>
            <scope>test</scope>
          </dependency>
          <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>testcontainers-mysql</artifactId>
            <scope>test</scope>
          </dependency>` }
      ],
      notes: [
        "Testcontainers starts a throwaway MySQL 8.4 in Docker; Flyway migrates it; `@ServiceConnection` points the datasource at it. You test against the *same* database engine as production — no H2 dialect surprises.",
        "Name integration tests `*IT` so the failsafe plugin runs them in `verify` (Session 7), keeping `mvn test` fast.",
        "For `@DataJpaTest` + `@ServiceConnection`, Boot 4's default `@AutoConfigureTestDatabase(replace = NON_TEST)` keeps the container database instead of swapping in an embedded one."
      ]
    },
    {
      type: 'theory',
      title: 'What makes a good test suite',
      lead: 'Coverage is a flashlight, not a target. Aim for confidence in behaviour.',
      table: { head: ['Do', 'Avoid'], rows: [
        ['Test behaviour and invariants (shares sum to amount)', 'testing private methods or getters'],
        ['One reason to fail per test; clear names', 'giant tests asserting everything'],
        ['Builders / `TestData` for readable fixtures', 'copy-pasted setup in every test'],
        ['Deterministic time (`Clock.fixed`) and data', '`Thread.sleep` and test order dependencies'],
        ['Real DB for repository/integration tests (Testcontainers)', 'mocking JPA or SQL'],
        ['Run fast tests on every change, ITs in CI', 'skipping tests to “save time”']
      ] },
      points: [
        "JaCoCo (Session 7): `./mvnw verify` → `target/site/jacoco/index.html`; look for **untested branches** in business code.",
        "Mutation testing (PIT) checks whether tests actually *fail* when code is wrong.",
        "A flaky test is a bug — fix or delete it; never ignore it."
      ],
      notes: [
        "A useful team rule: every bug fix starts with a failing test that reproduces it. The suite then guards against regressions forever.",
        "Coverage of 100% with weak assertions is worth less than 70% with sharp ones. Show a test that executes code but asserts nothing — it adds coverage and zero safety."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: a test suite for Splitwise',
      lead: 'Cover the minor project from the bottom of the pyramid to the top.',
      steps: [
        "Add the test dependencies (webmvc-test, data-jpa-test, spring-boot-testcontainers, testcontainers-junit-jupiter, testcontainers-mysql).",
        "Write parameterized unit tests for all four split strategies, including invalid inputs (percentages ≠ 100, non-positive shares, wrong exact totals).",
        "Write `DebtSimplifierTest` with the property-style checks from the slides.",
        "Write `ExpenseServiceTest` with Mockito: happy path (captor on `save`), payer not a member, participant not a member, unknown group (404).",
        "Write `ExpenseControllerTest` with `@WebMvcTest` + `@MockitoBean`: 201 + Location, 400 field errors, 404 and 422 problem details.",
        "Write one `@DataJpaTest` for `findWithMembers` against Testcontainers MySQL (flush + clear before reloading).",
        "Write `SplitwiseFlowIT` covering expense → balances → settlement → balances, asserting the zero-sum invariant.",
        "Run `./mvnw verify`, open the JaCoCo report and push coverage of the `expense` and `settlement` packages above 80%."
      ],
      notes: [
        "Docker must be running for Testcontainers. If CI lacks Docker, tag ITs with `@Tag(\"it\")` and run them in a separate job.",
        "Pair students: one writes a test, the other tries to break the implementation so that the test still passes — a manual form of mutation testing."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: JUnit, Mockito & MockMvc',
      quiz: [
        { q: "In Spring Boot 4, which annotation replaces a bean with a Mockito mock in a Spring test?", options: ['@MockBean', '@MockitoBean', '@Mock', '@InjectMocks'], answer: 1,
          why: "`@MockBean` was removed in Boot 4; Spring Framework's `@MockitoBean` replaces it. `@Mock` is plain Mockito without Spring." },
        { q: "Which test loads only controllers, advice and the MVC infrastructure?", options: ['@SpringBootTest', '@DataJpaTest', '@WebMvcTest', '@JsonTest'], answer: 2,
          why: "`@WebMvcTest` is the web slice; services must be mocked with `@MockitoBean`." },
        { q: "How do you assert two BigDecimals 400.0 and 400.00 are the same amount in AssertJ?", options: ['isEqualTo', 'isSameAs', 'isEqualByComparingTo', 'hasToString'], answer: 2,
          why: "`isEqualByComparingTo` uses `compareTo`, ignoring scale; `equals` treats different scales as different." },
        { q: "What does `then(expenses).should(never()).save(any())` verify?", options: ['save was called once', 'save was never called', 'save threw an exception', 'the mock was reset'], answer: 1,
          why: "BDDMockito verification that no `save` interaction happened — nothing was persisted after a rule violation." },
        { q: "Why use Testcontainers instead of H2 for repository tests?", options: ['H2 is not free', 'Tests run against the real MySQL engine, catching dialect and constraint differences', 'Testcontainers needs no Docker', 'Spring forbids H2'], answer: 1,
          why: "Same engine and version as production — reserved words, CHECK constraints, SQL functions behave identically." }
      ],
      notes: [
        "Follow up Q5 with a real example from this course: the reserved word `groups` works in H2 but fails in MySQL 8 — exactly the class of bug only a real database catches."
      ]
    },
    {
      type: 'summary',
      title: 'Session 14 recap',
      points: [
        "Pyramid: many fast unit tests, fewer slices, a few integration/E2E tests; Arrange-Act-Assert; F.I.R.S.T.",
        "JUnit 5 Jupiter: lifecycle annotations, `@Nested`, `@ParameterizedTest`; AssertJ for fluent assertions (`isEqualByComparingTo`).",
        "Mockito: stubs, mocks, captors, BDD style; construct services with mocks via constructor injection.",
        "`@WebMvcTest` + MockMvc/MockMvcTester + `@MockitoBean` for controllers; JSON bodies as text blocks.",
        "Integration: `@SpringBootTest`/`@DataJpaTest` + Testcontainers MySQL with `@ServiceConnection`; Boot 4 test starters."
      ],
      cards: [
        ['Test pyramid', 'Many unit tests, fewer integration tests, very few end-to-end tests.'],
        ['@ParameterizedTest', 'Runs one test method for each row of inputs.'],
        ['Stub vs mock', 'Stub returns canned data; mock verifies interactions.'],
        ['ArgumentCaptor', 'Captures arguments passed to a mock for assertions.'],
        ['@WebMvcTest', 'Web-layer slice: controllers, advice, MockMvc.'],
        ['@MockitoBean', 'Spring Framework annotation replacing a bean with a Mockito mock.'],
        ['MockMvcTester', 'AssertJ-friendly MockMvc API (Spring Framework 6.2+).'],
        ['@ServiceConnection', 'Boot wires connection details from a Testcontainers container.']
      ],
      notes: [
        "Next session: performance. We introduce Redis, distinguish caches from cookies and server from browser caching, and cache the expensive balances query."
      ]
    }
  ]
});
