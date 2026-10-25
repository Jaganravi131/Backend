COURSE.session({
  no: 9,
  short: 'REST design, AOP & Lombok',
  title: 'RESTful API Design & Implementation, AOP & Lombok',
  covers: [2, 3],
  extra: ['Logging with SLF4J/Logback, MDC & structured logs'],
  objectives: [
    "Design resource-oriented REST APIs: URIs, methods, status codes, pagination, versioning.",
    "Implement a layered API with DTOs, Bean Validation and RFC 9457 `ProblemDetail` error responses.",
    "Explain AOP (aspects, advice, pointcuts, proxies) and write logging/auditing aspects.",
    "Remove boilerplate with Lombok and log professionally with SLF4J, MDC and structured logging."
  ],
  prereq: "Session 8: Spring beans, `@RestController`, HTTP methods and status codes.",
  slides: [
    {
      type: 'theory',
      title: 'REST principles & the maturity model',
      lead: 'REST (Representational State Transfer) models your system as **resources** identified by URIs and manipulated through a **uniform interface** — the HTTP methods.',
      points: [
        "**Resources are nouns:** `/groups/7/expenses`, not `/getExpensesForGroup?id=7`.",
        "**Representations:** clients exchange JSON views of a resource, not the resource itself.",
        "**Stateless:** each request carries everything needed (e.g. a token) — servers keep no client session, so they scale horizontally.",
        "**Cacheable** responses and a **layered system** (gateways, CDNs) in between are allowed."
      ],
      diagram: { kind: 'pyramid', levels: [
        { t: 'Level 3 — Hypermedia (HATEOAS)', s: 'responses contain links to next actions', tone: 'purple' },
        { t: 'Level 2 — HTTP verbs + status codes', s: 'GET/POST/PUT/DELETE, 201/404/409… ← target for most APIs', tone: 'green' },
        { t: 'Level 1 — Resources', s: 'separate URIs per resource, but one verb', tone: 'blue' },
        { t: 'Level 0 — RPC over HTTP', s: 'one endpoint, POST everything', tone: 'gray' }
      ], caption: 'Richardson Maturity Model' },
      notes: [
        "Most production 'REST' APIs are Level 2 — and that is a perfectly good target. Level 3 (HATEOAS) is valuable for long-lived public APIs; Spring HATEOAS supports it, but we won't need it for our projects.",
        "Statelessness is the property that lets us run five copies of the Splitwise API behind a load balancer (Session 23): any instance can serve any request."
      ]
    },
    {
      type: 'theory',
      title: 'Designing the Splitwise API',
      lead: 'Model the domain as resources first, then map operations onto methods and sub-resources.',
      table: { head: ['Operation', 'Method & URI', 'Success'], rows: [
        ['Create a group', '`POST /api/v1/groups`', '201 + Location'],
        ['List my groups (paged)', '`GET /api/v1/groups?page=0&size=20&sort=name`', '200'],
        ['Add a member', '`POST /api/v1/groups/{groupId}/members`', '201'],
        ['Add an expense', '`POST /api/v1/groups/{groupId}/expenses`', '201'],
        ['Expense details', '`GET /api/v1/groups/{groupId}/expenses/{expenseId}`', '200 / 404'],
        ['Edit an expense', '`PUT /api/v1/groups/{groupId}/expenses/{expenseId}`', '200'],
        ['Delete an expense', '`DELETE /api/v1/groups/{groupId}/expenses/{expenseId}`', '204'],
        ['Record a settlement', '`POST /api/v1/groups/{groupId}/settlements`', '201'],
        ['Balances in a group', '`GET /api/v1/groups/{groupId}/balances`', '200']
      ] },
      points: [
        "Plural nouns, lowercase, hyphens (`/expense-categories`); nest only one or two levels deep.",
        "Actions become resources: *settle up* → `POST /settlements` (a settlement is a thing that gets created).",
        "**Filtering, sorting, paging** via query params; return page metadata (`totalElements`, `totalPages`).",
        "**Versioning:** URI (`/api/v1`), header (`API-Version: 2`), or media type — pick one and be consistent."
      ],
      callout: { kind: 'version', text: "Spring Framework 7 has **built-in API versioning**: `@GetMapping(path = \"/{id}\", version = \"2.0\")` plus e.g. `spring.mvc.apiversion.use.header=API-Version` in Spring Boot 4. We keep the simple `/api/v1` prefix in the projects." },
      notes: [
        "Design reviews start with this table, not with code. Ask the class: should balances be stored or computed? (Computed from expenses and settlements — a read model; we revisit this in Session 13.)",
        "Never put verbs like `/createGroup` in URIs and never use GET for operations that change data — crawlers, prefetchers and retries assume GET is safe."
      ]
    },
    {
      type: 'theory',
      title: 'Layered architecture & DTOs',
      lead: 'Each layer has one job. Data crosses the API boundary as **DTOs**, never as JPA entities.',
      diagram: { kind: 'tiers', tiers: [
        { label: 'Web', nodes: [{ t: 'Controller', s: 'HTTP ↔ DTOs, validation, status codes', tone: 'blue' }] },
        { label: 'Business', via: 'DTOs / commands', nodes: [{ t: 'Service', s: 'rules, transactions, orchestration', tone: 'green' }] },
        { label: 'Persistence', via: 'domain objects', nodes: [{ t: 'Repository', s: 'SQL / JPA (Sessions 10–11)', tone: 'purple' }] },
        { label: 'Database', nodes: [{ t: 'MySQL', s: 'tables, constraints, indexes', tone: 'orange' }] }
      ] },
      points: [
        "**Request DTOs** describe exactly what a client may send (no `id`, no `createdAt`).",
        "**Response DTOs** decide what is exposed (never the password hash) and decouple the API from the schema.",
        "Validate at the edge (controller), enforce business rules in the service, constraints in the database."
      ],
      notes: [
        "Exposing entities directly causes real problems: accidental data leaks, lazy-loading exceptions during JSON serialisation (Session 11), infinite recursion with bidirectional relations, and an API that breaks whenever a column changes.",
        "Records are ideal DTOs: immutable, concise, and Jackson 3 handles them natively. Mapping can be manual (clear, explicit) or generated with MapStruct for large models."
      ]
    },
    {
      type: 'practical',
      title: 'DTOs + Bean Validation in practice',
      lead: 'Declare constraints on the request record, trigger them with `@Valid`, and return `201 Created` with a `Location` header.',
      code: [
        { lang: 'java', file: 'CreateExpenseRequest.java', src: code`
          package com.example.splitwise.expense;

          import jakarta.validation.constraints.*;
          import java.math.BigDecimal;
          import java.util.List;

          public record CreateExpenseRequest(
                  @NotBlank @Size(max = 120) String description,
                  @NotNull @Positive @Digits(integer = 10, fraction = 2) BigDecimal amount,
                  @NotNull Long paidBy,
                  @NotEmpty List<@NotNull Long> participants) {}` },
        { lang: 'java', file: 'ExpenseResponse.java', src: code`
          package com.example.splitwise.expense;

          import java.math.BigDecimal;
          import java.time.Instant;
          import java.util.List;

          public record ExpenseResponse(Long id, Long groupId, String description, BigDecimal amount,
                                        Long paidBy, List<Long> participants, Instant createdAt) {}` },
        { lang: 'java', file: 'ExpenseController.java', src: code`
          package com.example.splitwise.expense;

          import jakarta.validation.Valid;
          import java.net.URI;
          import org.springframework.http.ResponseEntity;
          import org.springframework.web.bind.annotation.*;
          import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

          @RestController
          @RequestMapping("/api/v1/groups/{groupId}/expenses")
          public class ExpenseController {
              private final ExpenseService service;

              public ExpenseController(ExpenseService service) { this.service = service; }

              @PostMapping
              public ResponseEntity<ExpenseResponse> create(@PathVariable Long groupId,
                                                            @Valid @RequestBody CreateExpenseRequest request) {
                  ExpenseResponse created = service.create(groupId, request);
                  URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                          .path("/{id}").buildAndExpand(created.id()).toUri();
                  return ResponseEntity.created(location).body(created);
              }

              @GetMapping("/{expenseId}")
              public ExpenseResponse get(@PathVariable Long groupId, @PathVariable Long expenseId) {
                  return service.get(groupId, expenseId);       // NotFoundException -> 404 (next slide)
              }
          }` },
        { lang: 'java', file: 'ExpenseService.java', src: code`
          package com.example.splitwise.expense;

          import com.example.splitwise.web.BusinessRuleException;
          import com.example.splitwise.web.NotFoundException;
          import java.time.Clock;
          import java.time.Instant;
          import java.util.Map;
          import java.util.concurrent.ConcurrentHashMap;
          import java.util.concurrent.atomic.AtomicLong;
          import org.springframework.stereotype.Service;

          @Service
          public class ExpenseService {
              private final Map<Long, ExpenseResponse> store = new ConcurrentHashMap<>();  // DB from Session 10
              private final AtomicLong ids = new AtomicLong();
              private final Clock clock;

              public ExpenseService(Clock clock) { this.clock = clock; }

              public ExpenseResponse create(Long groupId, CreateExpenseRequest r) {
                  if (!r.participants().contains(r.paidBy())) {            // business rule, not syntax
                      throw new BusinessRuleException("payer must be one of the participants");
                  }
                  ExpenseResponse e = new ExpenseResponse(ids.incrementAndGet(), groupId, r.description(),
                          r.amount(), r.paidBy(), r.participants(), Instant.now(clock));
                  store.put(e.id(), e);
                  return e;
              }

              public ExpenseResponse get(Long groupId, Long id) {
                  ExpenseResponse e = store.get(id);
                  if (e == null || !e.groupId().equals(groupId)) {
                      throw new NotFoundException("expense " + id + " not found in group " + groupId);
                  }
                  return e;
              }
          }` }
      ],
      notes: [
        "`spring-boot-starter-validation` brings Hibernate Validator. Without `@Valid` the annotations are ignored — a classic bug.",
        "Distinguish *syntactic* validation (annotations: required, positive, max length) from *business* rules (payer must participate, group must be active) which need data and live in the service.",
        "Money is `BigDecimal` with `@Digits(fraction = 2)` — never `double` (Session 1 warned us). JSON numbers like `2400.00` map straight onto `BigDecimal`."
      ]
    },
    {
      type: 'practical',
      title: 'Consistent errors with @RestControllerAdvice & ProblemDetail',
      lead: 'One class translates exceptions into **RFC 9457** problem responses (`application/problem+json`) for the whole API.',
      code: [
        { lang: 'java', file: 'GlobalExceptionHandler.java', src: code`
          package com.example.splitwise.web;

          import java.net.URI;
          import java.util.Map;
          import java.util.stream.Collectors;
          import org.springframework.http.HttpStatus;
          import org.springframework.http.ProblemDetail;
          import org.springframework.validation.FieldError;
          import org.springframework.web.bind.MethodArgumentNotValidException;
          import org.springframework.web.bind.annotation.ExceptionHandler;
          import org.springframework.web.bind.annotation.RestControllerAdvice;

          @RestControllerAdvice
          public class GlobalExceptionHandler {

              @ExceptionHandler(NotFoundException.class)
              ProblemDetail notFound(NotFoundException ex) {
                  ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
                  pd.setTitle("Resource not found");
                  pd.setType(URI.create("https://docs.splitwise.local/errors/not-found"));
                  return pd;
              }

              @ExceptionHandler(BusinessRuleException.class)
              ProblemDetail businessRule(BusinessRuleException ex) {
                  ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_CONTENT, ex.getMessage());
                  pd.setTitle("Business rule violated");
                  return pd;
              }

              @ExceptionHandler(MethodArgumentNotValidException.class)
              ProblemDetail invalid(MethodArgumentNotValidException ex) {
                  ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request validation failed");
                  Map<String, String> errors = ex.getBindingResult().getFieldErrors().stream()
                          .collect(Collectors.toMap(FieldError::getField,
                                  fe -> String.valueOf(fe.getDefaultMessage()), (a, b) -> a));
                  pd.setProperty("errors", errors);                  // custom extension member
                  return pd;
              }
          }` },
        { lang: 'java', file: 'Exceptions.java', label: 'NotFound / BusinessRule', verify: false, src: code`
          // NotFoundException.java
          public class NotFoundException extends RuntimeException {
              public NotFoundException(String message) { super(message); }
          }

          // BusinessRuleException.java
          public class BusinessRuleException extends RuntimeException {
              public BusinessRuleException(String message) { super(message); }
          }` },
        { lang: 'http', label: 'Responses', src: code`
          POST /api/v1/groups/7/expenses   {"description":"","amount":-5,"paidBy":1,"participants":[1,2]}

          HTTP/1.1 400
          Content-Type: application/problem+json
          {
            "type": "about:blank",
            "title": "Bad Request",
            "status": 400,
            "detail": "Request validation failed",
            "instance": "/api/v1/groups/7/expenses",
            "errors": { "description": "must not be blank", "amount": "must be greater than 0" }
          }

          GET /api/v1/groups/7/expenses/999

          HTTP/1.1 404
          Content-Type: application/problem+json
          {"type":"https://docs.splitwise.local/errors/not-found","title":"Resource not found","status":404,
           "detail":"expense 999 not found in group 7","instance":"/api/v1/groups/7/expenses/999"}` }
      ],
      callout: { kind: 'tip', text: "Set `spring.mvc.problemdetails.enabled=true` so Spring's built-in errors (unsupported media type, missing parameters, 405…) use the same `ProblemDetail` format." },
      notes: [
        "Remember Session 2's custom exceptions: services throw meaningful domain exceptions; this advice is the single place that maps them to HTTP. Controllers stay free of try/catch.",
        "`HttpStatus.UNPROCESSABLE_CONTENT` is the Spring Framework 7 name for 422 (the older `UNPROCESSABLE_ENTITY` is deprecated). Use 422 for semantically invalid requests and 409 Conflict for state conflicts such as duplicates or version clashes.",
        "Never leak stack traces or SQL in error bodies — log them server-side with the request id instead."
      ]
    },
    {
      type: 'theory',
      title: 'Cross-cutting concerns & AOP',
      lead: 'Logging, security, transactions, caching and metrics cut across every layer. **Aspect-Oriented Programming** writes them once and applies them declaratively.',
      diagram: { kind: 'flow', nodes: [
        { t: 'Caller', s: 'controller', tone: 'gray' },
        { t: 'Proxy', s: 'before advice', tone: 'purple' },
        { t: 'Target', s: 'ExpenseService.create()', tone: 'green' },
        { t: 'Proxy', s: 'after / around advice', tone: 'purple' },
        { t: 'Caller', s: 'gets the result', tone: 'gray' }
      ] },
      table: { head: ['Term', 'Meaning'], rows: [
        ['Aspect', 'a module for one concern (`@Aspect` class)'],
        ['Join point', 'a point in execution — in Spring AOP always a **method call** on a bean'],
        ['Pointcut', 'an expression selecting join points: `execution(* ..service..*(..))`, `@annotation(Audited)`'],
        ['Advice', 'the code to run: `@Before`, `@AfterReturning`, `@AfterThrowing`, `@After`, `@Around`'],
        ['Weaving', 'linking aspects to targets — Spring does it at runtime with **proxies** (JDK dynamic proxy or CGLIB subclass)']
      ] },
      notes: [
        "Without AOP every service method would start with timing code, logging, a security check and a transaction begin/commit — duplicated hundreds of times and easy to forget.",
        "Spring AOP is proxy-based: the bean other beans receive is a proxy wrapping your object. Only calls that go *through* the proxy are advised — remember this for the self-invocation pitfall on the next slides.",
        "Full AspectJ (compile- or load-time weaving) can advise field access and constructors too, but Spring's proxy model covers almost every backend need."
      ]
    },
    {
      type: 'practical',
      title: 'Writing aspects: timing & auditing',
      lead: 'An `@Around` advice measures every service method; a custom annotation marks methods that must be audited.',
      code: [
        { lang: 'xml', file: 'pom.xml', src: code`
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-aspectj</artifactId>   <!-- Boot 4 name (was -aop) -->
          </dependency>` },
        { lang: 'java', file: 'PerformanceAspect.java', src: code`
          package com.example.splitwise.aop;

          import org.aspectj.lang.ProceedingJoinPoint;
          import org.aspectj.lang.annotation.Around;
          import org.aspectj.lang.annotation.Aspect;
          import org.aspectj.lang.annotation.Pointcut;
          import org.slf4j.Logger;
          import org.slf4j.LoggerFactory;
          import org.springframework.stereotype.Component;

          @Aspect
          @Component
          public class PerformanceAspect {
              private static final Logger log = LoggerFactory.getLogger(PerformanceAspect.class);

              @Pointcut("within(com.example.splitwise..*Service)")     // every class named *Service
              void serviceLayer() {}

              @Around("serviceLayer()")
              public Object time(ProceedingJoinPoint pjp) throws Throwable {
                  long start = System.nanoTime();
                  try {
                      return pjp.proceed();                               // invoke the real method
                  } finally {
                      long ms = (System.nanoTime() - start) / 1_000_000;
                      log.info("{} took {} ms", pjp.getSignature().toShortString(), ms);
                  }
              }
          }` },
        { lang: 'java', file: 'Audited.java', src: code`
          package com.example.splitwise.aop;

          import java.lang.annotation.*;

          @Target(ElementType.METHOD)
          @Retention(RetentionPolicy.RUNTIME)      // must be visible at runtime for the aspect
          public @interface Audited {
              String action();
          }` },
        { lang: 'java', file: 'AuditAspect.java', src: code`
          package com.example.splitwise.aop;

          import java.util.Arrays;
          import org.aspectj.lang.JoinPoint;
          import org.aspectj.lang.annotation.AfterReturning;
          import org.aspectj.lang.annotation.AfterThrowing;
          import org.aspectj.lang.annotation.Aspect;
          import org.slf4j.Logger;
          import org.slf4j.LoggerFactory;
          import org.springframework.stereotype.Component;

          @Aspect
          @Component
          public class AuditAspect {
              private static final Logger log = LoggerFactory.getLogger("AUDIT");

              @AfterReturning(pointcut = "@annotation(audited)", returning = "result")
              public void success(JoinPoint jp, Audited audited, Object result) {
                  log.info("{} ok args={} result={}", audited.action(), Arrays.toString(jp.getArgs()), result);
              }

              @AfterThrowing(pointcut = "@annotation(audited)", throwing = "ex")
              public void failure(Audited audited, Exception ex) {
                  log.warn("{} failed: {}", audited.action(), ex.getMessage());
              }
          }

          // Usage in ExpenseService:
          //   @Audited(action = "CREATE_EXPENSE")
          //   public ExpenseResponse create(Long groupId, CreateExpenseRequest r) { ... }`, out: code`
          INFO  AUDIT : CREATE_EXPENSE ok args=[7, CreateExpenseRequest[description=Dinner, ...]] result=ExpenseResponse[id=1, ...]
          INFO  c.e.s.aop.PerformanceAspect : ExpenseService.create(..) took 3 ms
          WARN  AUDIT : CREATE_EXPENSE failed: payer must be one of the participants` }
      ],
      notes: [
        "`@Around` is the most powerful advice: it decides whether and when the target runs (`proceed()`), can change arguments and return values, and can catch exceptions. Use the weakest advice that does the job.",
        "Binding the annotation as a parameter (`@annotation(audited)`) gives typed access to its attributes.",
        "Be careful what you log: arguments may contain personal data or secrets. Production audit logs mask sensitive fields."
      ]
    },
    {
      type: 'theory',
      title: 'Spring runs on AOP — and the self-invocation pitfall',
      lead: 'Many annotations you will use are implemented as proxies around your beans.',
      table: { head: ['Annotation', 'Advice applied by the proxy', 'Session'], rows: [
        ['`@Transactional`', 'begin → commit / rollback on exception', '10–11'],
        ['`@Cacheable` / `@CacheEvict`', 'return cached value or store result', '15'],
        ['`@PreAuthorize`', 'check permissions before the call', '16'],
        ['`@Async`', 'run the method on an executor', '6, 22'],
        ['`@Retryable` (Spring Framework 7)', 'retry on failure with backoff', '20']
      ] },
      code: { lang: 'java', label: 'Self-invocation bypasses the proxy', verify: false, src: code`
        @Service
        public class SettlementService {

            public void settleAll(List<Long> ids) {
                ids.forEach(this::settle);   // "this" is the raw object, NOT the proxy:
            }                                // @Transactional on settle() is silently ignored!

            @Transactional
            public void settle(Long id) { /* debit + credit */ }
        }
        // Fixes: put the annotation on the outer method, move settle() to another bean,
        // or call through an injected self-reference.` },
      callout: { kind: 'pitfall', text: "Proxies only intercept **external, public** calls to the bean. Internal `this.method()` calls, `private` methods and `final` methods are not advised." },
      notes: [
        "This is one of the most common Spring bugs in real projects and a favourite interview question: *Why doesn't my @Transactional/@Cacheable work?* Answer: self-invocation or a non-public method.",
        "You can see the proxy at runtime: `service.getClass()` prints something like `ExpenseService$$SpringCGLIB$$0`."
      ]
    },
    {
      type: 'practical',
      title: 'Lombok: less boilerplate, same bytecode',
      lead: 'Lombok is an annotation processor that generates getters, constructors, builders and loggers at compile time.',
      code: [
        { lang: 'java', file: 'ExpenseService.java', label: 'Lombok in a service', src: code`
          package com.example.splitwise.expense;

          import java.time.Clock;
          import lombok.RequiredArgsConstructor;
          import lombok.extern.slf4j.Slf4j;
          import org.springframework.stereotype.Service;

          @Slf4j                       // private static final Logger log = LoggerFactory.getLogger(...)
          @Service
          @RequiredArgsConstructor     // constructor for all final fields = constructor injection
          public class ExpenseService {
              private final ExpenseRepository repository;
              private final Clock clock;

              public ExpenseResponse create(Long groupId, CreateExpenseRequest r) {
                  log.info("Creating expense '{}' in group {}", r.description(), groupId);
                  // ...
                  return null;
              }
          }` },
        { lang: 'java', file: 'UserAccount.java', label: 'Builder & friends', src: code`
          package com.example.splitwise.user;

          import lombok.*;

          @Getter
          @Setter
          @NoArgsConstructor
          @AllArgsConstructor
          @Builder
          @ToString(exclude = "passwordHash")        // never print secrets
          public class UserAccount {
              private Long id;
              private String email;
              private String displayName;
              private String passwordHash;
          }

          // UserAccount u = UserAccount.builder().email("asha@example.com").displayName("Asha").build();` },
        { lang: 'xml', file: 'pom.xml', label: 'Setup', src: code`
          <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>              <!-- version managed by Spring Boot -->
          </dependency>

          <!-- build/plugins: register Lombok as an annotation processor (Initializr adds this) -->
          <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <configuration>
              <annotationProcessorPaths>
                <path><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId></path>
              </annotationProcessorPaths>
            </configuration>
          </plugin>` }
      ],
      table: { head: ['Use', 'Prefer'], rows: [
        ['Immutable DTOs / value objects', 'Java **records** (no Lombok needed)'],
        ['Spring beans', '`@RequiredArgsConstructor` + `@Slf4j`'],
        ['JPA entities', '`@Getter`/`@Setter` + explicit `equals`/`hashCode` — **avoid `@Data`**'],
        ['Objects with many optional fields', '`@Builder`']
      ] },
      notes: [
        "Recent JDKs no longer run annotation processors found on the classpath implicitly, so declaring Lombok in `annotationProcessorPaths` is required for reliable builds — Spring Initializr generates it. IntelliJ needs the Lombok plugin (bundled) and annotation processing enabled.",
        "Why not `@Data` on entities? It generates `equals`/`hashCode`/`toString` over all fields, which triggers lazy loading and infinite recursion on bidirectional relationships (Session 11).",
        "Lombok is a compile-time dependency only; it is excluded from the runtime JAR."
      ]
    },
    {
      type: 'practical',
      title: 'Logging like a professional: SLF4J, levels, MDC',
      lead: 'Spring Boot uses **SLF4J** as the API and **Logback** as the default implementation. Log with levels, parameters and context.',
      code: [
        { lang: 'java', file: 'MdcFilter.java', src: code`
          package com.example.splitwise.web;

          import jakarta.servlet.FilterChain;
          import jakarta.servlet.ServletException;
          import jakarta.servlet.http.HttpServletRequest;
          import jakarta.servlet.http.HttpServletResponse;
          import java.io.IOException;
          import java.util.UUID;
          import org.slf4j.MDC;
          import org.springframework.stereotype.Component;
          import org.springframework.web.filter.OncePerRequestFilter;

          @Component
          public class MdcFilter extends OncePerRequestFilter {
              @Override
              protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                      throws ServletException, IOException {
                  MDC.put("requestId", UUID.randomUUID().toString().substring(0, 8));  // added to every log line
                  try {
                      chain.doFilter(req, res);
                  } finally {
                      MDC.clear();                       // threads are pooled: always clean up!
                  }
              }
          }` },
        { lang: 'yaml', file: 'application.yml', src: code`
          logging:
            level:
              root: INFO
              com.example.splitwise: DEBUG          # your code
              org.hibernate.SQL: DEBUG              # see generated SQL (Session 11)
            pattern:
              console: "%d{HH:mm:ss} %-5level [%X{requestId}] %logger{20} : %msg%n"
          # Production: JSON logs for log aggregation (ELK, Loki, CloudWatch)
          # logging.structured.format.console: ecs` }
      ],
      table: { head: ['Level', 'Use for'], rows: [
        ['ERROR', 'failures needing attention (with the exception as last argument)'],
        ['WARN', 'unexpected but handled (fallback used, retry happened)'],
        ['INFO', 'business events (expense created, user registered)'],
        ['DEBUG / TRACE', 'diagnostics, disabled in production by default']
      ] },
      notes: [
        "Use placeholders — `log.info(\"user {} paid {}\", id, amount)` — not string concatenation: the message is only built if the level is enabled. Pass the exception as the last argument to get the stack trace: `log.error(\"payment failed for {}\", id, ex)`.",
        "MDC (Mapped Diagnostic Context) attaches the request id to every line logged while handling that request, so you can grep one request's story across the logs. Session 24 extends this to distributed tracing across services.",
        "Structured (JSON) logging is built into Spring Boot via `logging.structured.format.*` (ECS, GELF, Logstash formats)."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: Expenses API v1 — validated, layered, observable',
      lead: 'Turn the in-memory API into a professional one: DTOs, validation, problem details, aspects, Lombok and logging.',
      steps: [
        "In the `splitwise` project add *Validation*, *Lombok* and `spring-boot-starter-aspectj`.",
        "Create `CreateExpenseRequest` and `ExpenseResponse` records with Bean Validation annotations (BigDecimal amounts!).",
        "Implement `ExpenseService` (in-memory for now) with the rule *payer must be a participant*, using `@RequiredArgsConstructor` and `@Slf4j`.",
        "Implement `POST` and `GET` endpoints under `/api/v1/groups/{groupId}/expenses` returning 201 + Location / 200.",
        "Add `GlobalExceptionHandler` mapping validation → 400 (with field errors), not found → 404, business rule → 422; enable `spring.mvc.problemdetails.enabled`.",
        "Add `PerformanceAspect` and an `@Audited` annotation on `create`; check both log lines.",
        "Add the `MdcFilter` and a console pattern showing `%X{requestId}`.",
        "Verify with curl: one valid request, one with blank description and negative amount, one unknown id, one payer outside participants. Stretch: add paging to `GET /expenses` with `page`, `size` (max 100) and a `PageResponse<T>` record."
      ],
      notes: [
        "Students should end with four distinct, well-formed responses: 201, 400 with an `errors` map, 404 and 422 — all `application/problem+json` except the success.",
        "If an aspect doesn't fire, check: is the class a Spring bean, is the method public, is it called from another bean (not `this`), and does the pointcut actually match the package?"
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: REST, AOP & Lombok',
      quiz: [
        { q: "Best URI and method to record that Asha paid Ravi back in group 7?", options: ['GET /settleUp?group=7&from=asha', 'POST /api/v1/groups/7/settlements', 'PUT /api/v1/settle', 'POST /api/v1/doSettlement'], answer: 1,
          why: "A settlement is a resource that gets created inside a group: POST to the collection, 201 on success." },
        { q: "The request body fails `@Valid` checks. Which status fits?", options: ['200', '400 Bad Request', '404 Not Found', '500'], answer: 1,
          why: "Malformed or invalid input is a client error: 400 with details of each failing field." },
        { q: "In Spring AOP, a join point is always…", options: ['a field write', 'a method execution on a Spring bean', 'a constructor call', 'a class load'], answer: 1,
          why: "Spring's proxy-based AOP intercepts method calls on beans (full AspectJ supports more join point types)." },
        { q: "`@Transactional` on a method called via `this.settle()` from the same class…", options: ['works normally', 'is ignored because the call bypasses the proxy', 'throws at startup', 'runs twice'], answer: 1,
          why: "Self-invocation doesn't pass through the proxy, so no advice — including transactions — is applied." },
        { q: "Which Lombok annotation gives you constructor injection for final fields?", options: ['@Data', '@Builder', '@RequiredArgsConstructor', '@Value'], answer: 2,
          why: "It generates a constructor for all final (and @NonNull) fields; with a single constructor Spring injects through it." }
      ],
      notes: [
        "Q4 deserves a whiteboard sketch: caller → proxy → target, and the internal call that never leaves the target object.",
        "For Q1, push back on answers that use PUT: a client cannot know the id of a settlement that doesn't exist yet, so creation via POST to the collection is the natural fit."
      ]
    },
    {
      type: 'summary',
      title: 'Session 9 recap',
      points: [
        "REST = resources (nouns) + uniform HTTP methods + correct status codes + stateless requests; aim for maturity Level 2.",
        "Controller → Service → Repository; request/response DTOs (records), `@Valid` + Bean Validation, `BigDecimal` for money.",
        "One `@RestControllerAdvice` → RFC 9457 `ProblemDetail` responses (400/404/409/422…).",
        "AOP: aspects, pointcuts and advice applied through proxies; beware self-invocation and non-public methods.",
        "Lombok for beans and builders (not `@Data` on entities); SLF4J placeholders, levels, MDC and structured logs."
      ],
      cards: [
        ['Richardson Level 2', 'Resources + HTTP verbs + status codes — the practical REST target.'],
        ['DTO', 'Data Transfer Object: the shape of data crossing the API boundary.'],
        ['ProblemDetail', 'RFC 9457 standard error body (type, title, status, detail, instance).'],
        ['Pointcut', 'Expression selecting which method executions an advice applies to.'],
        ['@Around', 'Advice that wraps a call and decides when to proceed().'],
        ['Self-invocation', 'An internal this.call() that bypasses the Spring proxy.'],
        ['@RequiredArgsConstructor', 'Lombok constructor for final fields — clean constructor injection.'],
        ['MDC', 'Per-thread logging context, e.g. a request id on every line.']
      ],
      notes: [
        "Next session: persistence with plain JDBC — DDL/DML, connections, PreparedStatements — and then Spring's JdbcTemplate with RowMapper to implement full CRUD."
      ]
    }
  ]
});
