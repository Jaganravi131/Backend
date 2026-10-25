COURSE.session({
  no: 8,
  short: 'Spring Boot, MVC & HTTP methods',
  title: 'Spring Boot Foundations, Spring MVC Architecture & HTTP Methods',
  covers: [1],
  extra: ['Spring IoC container, dependency injection & auto-configuration'],
  objectives: [
    "Explain IoC and dependency injection; declare beans with stereotypes and `@Bean` methods.",
    "Describe what Spring Boot adds: starters, auto-configuration, embedded server, externalised configuration.",
    "Trace a request through Spring MVC (DispatcherServlet → handler → message converter) and its filters/interceptors.",
    "Use HTTP methods and status codes correctly in a `@RestController`."
  ],
  prereq: "Session 2 (programming to interfaces) and Session 7 (a running Spring Boot project).",
  slides: [
    {
      type: 'theory',
      title: 'Why Spring? From `new` everywhere to a container',
      lead: 'In Session 2 we wired `OrderService` by hand. Spring\'s **IoC container** creates objects (beans), injects their dependencies and manages their lifecycle for you.',
      diagram: { kind: 'grid', cols: 3, items: [
        { icon: '🌱', t: 'Spring Framework', s: 'IoC/DI core, AOP, transactions, Spring MVC, WebFlux', tone: 'green' },
        { icon: '🚀', t: 'Spring Boot', s: 'starters, auto-config, embedded Tomcat, Actuator', tone: 'blue' },
        { icon: '🗄️', t: 'Spring Data', s: 'repositories for JPA, Redis, MongoDB…', tone: 'purple' },
        { icon: '🔐', t: 'Spring Security', s: 'authentication, authorization, OAuth2', tone: 'red' },
        { icon: '☁️', t: 'Spring Cloud', s: 'gateway, config, discovery, circuit breakers', tone: 'orange' },
        { icon: '📨', t: 'Spring for Kafka', s: 'producers, listeners, retries', tone: 'teal' }
      ] },
      points: [
        "**Inversion of Control:** your classes don't create their dependencies — the container *gives* them (Hollywood principle: *don't call us, we'll call you*).",
        "**Spring Framework** provides the container and modules; **Spring Boot** makes them production-ready with almost zero configuration."
      ],
      notes: [
        "Recall the `DipDemo` from Session 2: `main()` constructed `EmailSender`, `SmsSender` and `OrderService` manually. In a real system there are hundreds of such objects — Spring builds that object graph for us, in the right order, and makes it easy to swap implementations (e.g. a fake sender in tests).",
        "The modules on this slide map to the rest of the course: MVC & Data in Module 2, Security & testing in Module 3, Cloud & Kafka in Module 4."
      ]
    },
    {
      type: 'theory',
      title: 'Beans & dependency injection',
      lead: 'A **bean** is an object managed by the container. Spring discovers beans by **component scanning** or from **`@Bean` methods**, then injects them where they are needed.',
      table: { head: ['Annotation', 'Meaning'], rows: [
        ['`@Component`', 'generic bean found by component scanning'],
        ['`@Service`', 'business logic layer (a specialised `@Component`)'],
        ['`@Repository`', 'data access layer; translates persistence exceptions'],
        ['`@Controller` / `@RestController`', 'web layer; `@RestController` = `@Controller` + `@ResponseBody`'],
        ['`@Configuration` + `@Bean`', 'factory methods for beans you can\'t annotate (third-party classes)'],
        ['`@Primary` / `@Qualifier("x")`', 'choose between several beans of the same type']
      ] },
      points: [
        "**Constructor injection** (preferred): dependencies are explicit, fields can be `final`, easy to test. With one constructor, `@Autowired` is optional.",
        "Avoid field injection (`@Autowired private Foo foo;`) — it hides dependencies and needs reflection to test.",
        "**Scopes:** `singleton` (default — one per container), `prototype` (new each time), `request`, `session`.",
        "Lifecycle hooks: `@PostConstruct` / `@PreDestroy` (package `jakarta.annotation`)."
      ],
      notes: [
        "Singleton scope means one instance per application context, shared by all requests and threads — so beans should be **stateless** (or hold only thread-safe state). This links back to the thread-safety lessons of Session 6.",
        "If two beans implement the same interface and you inject the interface, startup fails with *NoUniqueBeanDefinitionException* — fix it with `@Primary`, `@Qualifier`, or by injecting `List<Interface>` to get all of them."
      ]
    },
    {
      type: 'practical',
      title: 'Dependency injection in a Spring Boot app',
      lead: 'Two implementations of one interface, a third-party bean from a `@Bean` method, and constructor injection everywhere.',
      code: [
        { lang: 'java', file: 'NotificationSenders.java', src: code`
          package com.example.demo.notify;

          import org.springframework.context.annotation.Primary;
          import org.springframework.stereotype.Component;

          public interface NotificationSender {
              String channel();
              void send(String to, String message);
          }

          @Component
          class EmailSender implements NotificationSender {
              public String channel() { return "EMAIL"; }
              public void send(String to, String msg) { System.out.println("EMAIL -> " + to + ": " + msg); }
          }

          @Component
          @Primary                                       // default choice when one sender is injected
          class SmsSender implements NotificationSender {
              public String channel() { return "SMS"; }
              public void send(String to, String msg) { System.out.println("SMS   -> " + to + ": " + msg); }
          }` },
        { lang: 'java', file: 'OrderService.java', src: code`
          package com.example.demo.orders;

          import com.example.demo.notify.NotificationSender;
          import java.time.Clock;
          import java.time.LocalTime;
          import java.util.List;
          import org.springframework.stereotype.Service;

          @Service
          public class OrderService {
              private final NotificationSender primary;          // the @Primary bean (SmsSender)
              private final List<NotificationSender> all;        // every NotificationSender bean
              private final Clock clock;                          // provided by a @Bean method

              public OrderService(NotificationSender primary, List<NotificationSender> all, Clock clock) {
                  this.primary = primary;                         // single constructor: no @Autowired needed
                  this.all = all;
                  this.clock = clock;
              }

              public void place(String customer) {
                  primary.send(customer, "Order placed at " + LocalTime.now(clock).withNano(0));
                  System.out.println("channels available: " + all.stream().map(NotificationSender::channel).toList());
              }
          }` },
        { lang: 'java', file: 'DemoApplication.java', src: code`
          package com.example.demo;

          import com.example.demo.orders.OrderService;
          import java.time.Clock;
          import org.springframework.boot.CommandLineRunner;
          import org.springframework.boot.SpringApplication;
          import org.springframework.boot.autoconfigure.SpringBootApplication;
          import org.springframework.context.annotation.Bean;

          @SpringBootApplication
          public class DemoApplication {
              public static void main(String[] args) { SpringApplication.run(DemoApplication.class, args); }

              @Bean
              Clock clock() { return Clock.systemDefaultZone(); }      // third-party type as a bean

              @Bean
              CommandLineRunner demo(OrderService orders) {            // runs once at startup
                  return args -> orders.place("ravi");
              }
          }`, out: code`
          SMS   -> ravi: Order placed at 10:42:07
          channels available: [EMAIL, SMS]` }
      ],
      notes: [
        "Injecting `Clock` instead of calling `LocalTime.now()` directly is a small but professional habit: tests can inject `Clock.fixed(...)` and get deterministic times.",
        "`@SpringBootApplication` triggers component scanning of its own package and sub-packages — that's why `notify` and `orders` live *under* `com.example.demo`. A bean outside that tree is silently not found.",
        "Ask students to remove `@Primary` and read the startup failure message: Spring explains exactly which beans conflict and suggests the fixes."
      ]
    },
    {
      type: 'theory',
      title: 'What Spring Boot adds: starters & auto-configuration',
      lead: 'Boot looks at your classpath and configuration, then **auto-configures** sensible beans — which you can override at any time.',
      diagram: { kind: 'flow', nodes: [
        { t: 'main()', s: 'SpringApplication.run', tone: 'gray' },
        { t: 'Load config', s: 'application.yml, env vars, args', tone: 'yellow' },
        { t: 'Scan components', s: 'your @Component classes', tone: 'blue' },
        { t: 'Auto-configure', s: '@ConditionalOnClass / OnMissingBean', tone: 'purple' },
        { t: 'Start Tomcat', s: 'port 8080, ready', tone: 'green' }
      ] },
      points: [
        "**Starters** are curated dependency bundles: `spring-boot-starter-webmvc` brings Spring MVC, Jackson, Tomcat, validation hooks.",
        "**Auto-configuration** classes are guarded by conditions: *if Jackson is on the classpath and you defined no `JsonMapper`, create one*.",
        "Your own bean always wins (`@ConditionalOnMissingBean`) — override defaults by simply declaring a bean.",
        "**Externalised config:** the same JAR runs in dev and prod with different properties, profiles and environment variables.",
        "Run with `--debug` (or `debug=true`) to print the *conditions evaluation report*: what was configured and why."
      ],
      notes: [
        "Demystify the 'magic': auto-configuration is just regular `@Configuration` classes listed in `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` inside Boot's JARs, each with conditions.",
        "Spring Boot 4 split auto-configuration into many smaller modules aligned with the starters, so applications only load what they actually use.",
        "Embedded server: the web server is a library inside your app, not the other way round — which is what makes `java -jar app.jar` and containers so simple."
      ]
    },
    {
      type: 'practical',
      title: 'Externalised configuration & profiles',
      lead: 'Bind YAML to a type-safe record with `@ConfigurationProperties`, and switch behaviour per environment with profiles.',
      code: [
        { lang: 'yaml', file: 'application.yml', src: code`
          spring:
            application:
              name: splitwise
            profiles:
              active: dev            # default profile for local runs
          server:
            port: 8080
          app:
            currency: INR
            max-group-size: 50
            features:
              simplify-debts: true
          ---
          spring:
            config:
              activate:
                on-profile: prod
          server:
            port: 80
          app:
            features:
              simplify-debts: false` },
        { lang: 'java', file: 'AppProperties.java', src: code`
          package com.example.splitwise.config;

          import org.springframework.boot.context.properties.ConfigurationProperties;

          @ConfigurationProperties(prefix = "app")            // binds app.* (relaxed: max-group-size -> maxGroupSize)
          public record AppProperties(String currency, int maxGroupSize, Features features) {
              public record Features(boolean simplifyDebts) {}
          }

          // On the main class:  @ConfigurationPropertiesScan
          // Then inject it like any bean:  public GroupService(AppProperties props) { ... }` },
        { lang: 'bash', label: 'Override at runtime', src: code`
          $ java -jar splitwise.jar --spring.profiles.active=prod      # command-line argument
          $ SERVER_PORT=9090 APP_CURRENCY=USD java -jar splitwise.jar  # environment variables
          $ java -jar splitwise.jar --debug                            # conditions evaluation report` }
      ],
      table: { head: ['Source (higher wins)', 'Example'], rows: [
        ['Command-line args', '`--server.port=9090`'],
        ['Environment variables', '`SERVER_PORT=9090`, `SPRING_DATASOURCE_PASSWORD=…`'],
        ['Profile-specific files', '`application-prod.yml`'],
        ['`application.yml` / `.properties`', 'defaults packaged in the JAR']
      ] },
      notes: [
        "Prefer `@ConfigurationProperties` records over scattered `@Value(\"${...}\")` annotations: they're type-safe, validated (`@Validated`), documented in IDE autocomplete, and easy to test.",
        "Secrets (DB passwords, OAuth client secrets) must come from environment variables or a secret manager — never from a committed YAML file. That rule becomes concrete in Sessions 18 and 23.",
        "`---` separates documents in one YAML file; `spring.config.activate.on-profile` makes a document apply only for that profile."
      ]
    },
    {
      type: 'theory',
      title: 'HTTP essentials: methods, safety & idempotency',
      lead: 'HTTP is a stateless request/response protocol. The **method** states the intent; the **status code** reports the outcome.',
      code: { lang: 'http', label: 'A raw HTTP exchange', src: code`
        POST /api/v1/expenses HTTP/1.1
        Host: api.splitwise.local
        Content-Type: application/json
        Authorization: Bearer eyJhbGciOi...

        {"groupId": 7, "description": "Dinner", "amount": 2400.00}

        HTTP/1.1 201 Created
        Location: /api/v1/expenses/42
        Content-Type: application/json

        {"id": 42, "groupId": 7, "description": "Dinner", "amount": 2400.00}` },
      table: { head: ['Method', 'Purpose', 'Safe?', 'Idempotent?', 'Typical success'], rows: [
        ['GET', 'read a resource or collection', '✅', '✅', '200 OK'],
        ['POST', 'create / trigger processing', '❌', '❌', '201 Created (+ Location)'],
        ['PUT', 'replace a resource completely', '❌', '✅', '200 OK / 204 No Content'],
        ['PATCH', 'partial update', '❌', '❌ (not guaranteed)', '200 OK'],
        ['DELETE', 'remove a resource', '❌', '✅', '204 No Content'],
        ['HEAD / OPTIONS', 'headers only / allowed methods (CORS)', '✅', '✅', '200 OK']
      ] },
      points: [
        "**Safe** = no server-side change. **Idempotent** = repeating the request has the same effect as sending it once.",
        "Status classes: **2xx** success · **3xx** redirect · **4xx** client error (400, 401, 403, 404, 409, 422) · **5xx** server error (500, 502, 503)."
      ],
      notes: [
        "Idempotency matters because networks fail: a client that timed out will retry. Retrying PUT or DELETE is harmless; retrying POST may create a duplicate expense — which is why payment APIs accept an `Idempotency-Key` header (we implement one in Session 22).",
        "401 vs 403 is a classic confusion: **401 Unauthorized** really means *unauthenticated* (who are you?); **403 Forbidden** means *authenticated but not allowed*. Session 16 makes this concrete."
      ]
    },
    {
      type: 'theory',
      title: 'Spring MVC architecture: the DispatcherServlet',
      lead: 'Every request enters one **front controller**, the `DispatcherServlet`, which delegates to specialised components.',
      diagram: { kind: 'seq', actors: ['Client', 'DispatcherServlet', 'HandlerMapping', 'Controller', 'Jackson'], msgs: [
        [0, 1, 'GET /api/v1/contacts/1'],
        [1, 2, 'find handler'],
        [2, 1, 'ContactController.get()', 'r'],
        [1, 3, 'invoke, bind @PathVariable'],
        [3, 1, 'ResponseEntity<Contact>', 'r'],
        [1, 4, 'serialize body'],
        [4, 1, 'JSON bytes', 'r'],
        [1, 0, '200 OK + JSON', 'r']
      ] },
      points: [
        "**Servlet filters** run *before* the DispatcherServlet (security, CORS, request ids).",
        "**HandlerMapping** picks the controller method from path, method, headers, params.",
        "**HandlerAdapter** calls it, resolving arguments (`@PathVariable`, `@RequestBody`, …) and **HandlerInterceptors** run around it.",
        "Return values go through **HttpMessageConverters** (Jackson → JSON) for REST, or a **ViewResolver** for server-rendered pages.",
        "Exceptions are handled by **HandlerExceptionResolvers** → `@ExceptionHandler` / `@RestControllerAdvice` (Session 9)."
      ],
      notes: [
        "Draw the pipeline as an onion: filters (outer), DispatcherServlet, interceptors, controller (core). Knowing where code runs explains many bugs, e.g. a filter cannot see which controller method will handle the request, but an interceptor can.",
        "Classic Spring MVC returns view names rendered by Thymeleaf/JSP templates. REST controllers return data instead; `@RestController` adds `@ResponseBody` to every method so return values are written to the response body.",
        "Spring Boot registers the DispatcherServlet automatically, mapped to `/`."
      ]
    },
    {
      type: 'practical',
      title: 'A REST controller with every HTTP method',
      lead: 'GET, POST, PUT, PATCH and DELETE on one resource — returning the right status codes with `ResponseEntity`.',
      code: [
        { lang: 'java', file: 'ContactController.java', src: code`
          package com.example.demo.contacts;

          import java.net.URI;
          import java.util.*;
          import java.util.concurrent.ConcurrentHashMap;
          import java.util.concurrent.atomic.AtomicLong;
          import org.springframework.http.ResponseEntity;
          import org.springframework.web.bind.annotation.*;

          record Contact(Long id, String name, String email) {}

          @RestController
          @RequestMapping("/api/v1/contacts")
          public class ContactController {
              private final Map<Long, Contact> store = new ConcurrentHashMap<>();   // thread-safe: singleton bean!
              private final AtomicLong ids = new AtomicLong();

              @GetMapping                                        // GET /api/v1/contacts?name=asha
              public List<Contact> list(@RequestParam(required = false) String name) {
                  return store.values().stream()
                          .filter(c -> name == null || c.name().equalsIgnoreCase(name))
                          .sorted(Comparator.comparing(Contact::id))
                          .toList();
              }

              @GetMapping("/{id}")                               // GET /api/v1/contacts/1
              public ResponseEntity<Contact> get(@PathVariable Long id) {
                  return Optional.ofNullable(store.get(id))
                          .map(ResponseEntity::ok)
                          .orElse(ResponseEntity.notFound().build());
              }

              @PostMapping                                       // create -> 201 + Location header
              public ResponseEntity<Contact> create(@RequestBody Contact body) {
                  Contact saved = new Contact(ids.incrementAndGet(), body.name(), body.email());
                  store.put(saved.id(), saved);
                  return ResponseEntity.created(URI.create("/api/v1/contacts/" + saved.id())).body(saved);
              }

              @PutMapping("/{id}")                               // full replace
              public ResponseEntity<Contact> replace(@PathVariable Long id, @RequestBody Contact body) {
                  if (!store.containsKey(id)) return ResponseEntity.notFound().build();
                  Contact updated = new Contact(id, body.name(), body.email());
                  store.put(id, updated);
                  return ResponseEntity.ok(updated);
              }

              @PatchMapping("/{id}")                             // partial update
              public ResponseEntity<Contact> patch(@PathVariable Long id, @RequestBody Map<String, String> changes) {
                  Contact c = store.get(id);
                  if (c == null) return ResponseEntity.notFound().build();
                  Contact updated = new Contact(id, changes.getOrDefault("name", c.name()),
                          changes.getOrDefault("email", c.email()));
                  store.put(id, updated);
                  return ResponseEntity.ok(updated);
              }

              @DeleteMapping("/{id}")                            // 204 No Content
              public ResponseEntity<Void> delete(@PathVariable Long id) {
                  return store.remove(id) != null ? ResponseEntity.noContent().build()
                                                  : ResponseEntity.notFound().build();
              }
          }` },
        { lang: 'bash', label: 'curl session', src: code`
          $ curl -i -X POST localhost:8080/api/v1/contacts \
                 -H 'Content-Type: application/json' -d '{"name":"Asha","email":"asha@example.com"}'
          HTTP/1.1 201
          Location: /api/v1/contacts/1
          Content-Type: application/json
          {"id":1,"name":"Asha","email":"asha@example.com"}

          $ curl -s -X PATCH localhost:8080/api/v1/contacts/1 \
                 -H 'Content-Type: application/json' -d '{"email":"asha@new.in"}'
          {"id":1,"name":"Asha","email":"asha@new.in"}

          $ curl -s 'localhost:8080/api/v1/contacts?name=asha'
          [{"id":1,"name":"Asha","email":"asha@new.in"}]

          $ curl -i -X DELETE localhost:8080/api/v1/contacts/1
          HTTP/1.1 204

          $ curl -i localhost:8080/api/v1/contacts/1
          HTTP/1.1 404` }
      ],
      notes: [
        "The controller is a singleton used by all request threads at once, so its in-memory store must be a `ConcurrentHashMap` and ids an `AtomicLong` — Session 6 in action. Next session we move logic into a service layer, and in Session 10 into a real database.",
        "Spring answers `HEAD` and `OPTIONS` automatically for mapped paths (try `curl -i -X OPTIONS localhost:8080/api/v1/contacts`).",
        "Jackson (version 3 in Spring Boot 4) serialises records out of the box: component names become JSON fields."
      ]
    },
    {
      type: 'practical',
      title: 'Around the handler: filters & interceptors',
      lead: 'Cross-cutting web concerns belong in the pipeline, not in every controller method.',
      code: [
        { lang: 'java', file: 'RequestIdFilter.java', src: code`
          package com.example.demo.web;

          import jakarta.servlet.FilterChain;
          import jakarta.servlet.ServletException;
          import jakarta.servlet.http.HttpServletRequest;
          import jakarta.servlet.http.HttpServletResponse;
          import java.io.IOException;
          import java.util.Optional;
          import java.util.UUID;
          import org.springframework.stereotype.Component;
          import org.springframework.web.filter.OncePerRequestFilter;

          @Component                                     // servlet filter: runs BEFORE the DispatcherServlet
          public class RequestIdFilter extends OncePerRequestFilter {
              @Override
              protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                      throws ServletException, IOException {
                  String id = Optional.ofNullable(req.getHeader("X-Request-Id")).orElse(UUID.randomUUID().toString());
                  res.setHeader("X-Request-Id", id);
                  chain.doFilter(req, res);              // continue the chain
              }
          }` },
        { lang: 'java', file: 'TimingInterceptor.java', src: code`
          package com.example.demo.web;

          import jakarta.servlet.http.HttpServletRequest;
          import jakarta.servlet.http.HttpServletResponse;
          import org.slf4j.Logger;
          import org.slf4j.LoggerFactory;
          import org.springframework.context.annotation.Configuration;
          import org.springframework.stereotype.Component;
          import org.springframework.web.servlet.HandlerInterceptor;
          import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
          import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

          @Component                                     // MVC interceptor: runs AROUND the controller method
          public class TimingInterceptor implements HandlerInterceptor {
              private static final Logger log = LoggerFactory.getLogger(TimingInterceptor.class);

              @Override
              public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
                  req.setAttribute("start", System.nanoTime());
                  return true;                           // false = stop here (e.g. maintenance mode)
              }

              @Override
              public void afterCompletion(HttpServletRequest req, HttpServletResponse res, Object handler, Exception ex) {
                  long ms = (System.nanoTime() - (long) req.getAttribute("start")) / 1_000_000;
                  log.info("{} {} -> {} in {} ms", req.getMethod(), req.getRequestURI(), res.getStatus(), ms);
              }
          }

          @Configuration
          class WebConfig implements WebMvcConfigurer {
              private final TimingInterceptor timing;
              WebConfig(TimingInterceptor timing) { this.timing = timing; }

              @Override
              public void addInterceptors(InterceptorRegistry registry) {
                  registry.addInterceptor(timing).addPathPatterns("/api/**");
              }
          }`, out: code`
          INFO  c.e.demo.web.TimingInterceptor : POST /api/v1/contacts -> 201 in 14 ms
          INFO  c.e.demo.web.TimingInterceptor : GET /api/v1/contacts/1 -> 200 in 2 ms` }
      ],
      table: { head: ['', 'Servlet Filter', 'HandlerInterceptor'], rows: [
        ['Runs', 'before/after the DispatcherServlet', 'before/after the chosen handler'],
        ['Knows the handler method?', '❌', '✅ (`handler` argument)'],
        ['Typical use', 'security, CORS, request ids, compression', 'timing, locale, auditing per endpoint']
      ] },
      notes: [
        "Spring Security (Session 16) is implemented as a chain of servlet filters — understanding filters now pays off later.",
        "`OncePerRequestFilter` guarantees a single execution per request even with internal forwards/error dispatches.",
        "Next session we'll see a third, even more general mechanism for cross-cutting concerns: AOP."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: a Movies API with every HTTP method',
      lead: 'Build, wire and exercise your first Spring MVC REST API with layered beans and configuration.',
      steps: [
        "Generate `movies` on start.spring.io (Maven, Java 21, Boot 4.1.x) with *Spring Web* and *DevTools*.",
        "Create `record Movie(Long id, String title, int year, double rating)`.",
        "Create a `@Service MovieService` holding a `ConcurrentHashMap` + `AtomicLong`; inject it into the controller **through the constructor**.",
        "Implement `GET /api/v1/movies?year=`, `GET /{id}` (404 if missing), `POST` (201 + `Location`), `PUT`, `PATCH` (rating only) and `DELETE` (204).",
        "Exercise every endpoint with `curl -i` (or Postman/HTTPie) and check the status codes and headers.",
        "Add `app.max-movies` via a `@ConfigurationProperties` record; return **409 Conflict** when the limit is reached.",
        "Register the `TimingInterceptor` and `RequestIdFilter`; confirm the log line and the `X-Request-Id` response header.",
        "Stretch: run with `--debug` and find the auto-configuration that created the `DispatcherServlet`; try `OPTIONS` and `HEAD` requests."
      ],
      notes: [
        "Walk around and check that nobody uses field injection and that the service — not the controller — owns the data. That separation is what lets us swap the map for a database in Session 10 without touching the controller.",
        "Postman/Insomnia/HTTPie are all fine; insist that students *read* the status line, not just the body."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: Spring Boot core, MVC & HTTP',
      quiz: [
        { q: "Which injection style is recommended in Spring?", options: ['Field injection with @Autowired', 'Constructor injection', 'Static setters', 'Service locator lookups'], answer: 1,
          why: "Constructor injection makes dependencies explicit and final, and works without Spring in unit tests." },
        { q: "What is the default scope of a Spring bean?", options: ['prototype', 'request', 'singleton', 'session'], answer: 2,
          why: "One instance per application context — so beans should be stateless or thread-safe." },
        { q: "Which method is idempotent but NOT safe?", options: ['GET', 'POST', 'PUT', 'HEAD'], answer: 2,
          why: "PUT changes state (not safe) but repeating the same PUT leaves the same final state (idempotent). DELETE is the other example." },
        { q: "Correct response for a successful POST that created a resource:", options: ['200 OK with empty body', '201 Created with a Location header', '204 No Content', '302 Found'], answer: 1,
          why: "201 plus `Location: /api/v1/contacts/1` tells the client where the new resource lives." },
        { q: "What is the front controller of Spring MVC?", options: ['HandlerInterceptor', 'DispatcherServlet', 'ViewResolver', 'RestTemplate'], answer: 1,
          why: "The DispatcherServlet receives every request and delegates to handler mappings, adapters, converters and resolvers." },
        { q: "`@SpringBootApplication` combines…", options: ['@Controller + @Service + @Repository', '@Configuration + @EnableAutoConfiguration + @ComponentScan', '@EnableWebMvc + @EnableJpa', '@Bean + @Primary'], answer: 1,
          why: "It marks a configuration class, turns on auto-configuration and scans the package tree for components." }
      ],
      notes: [
        "For Q3, ask a student to give a real example where a non-idempotent POST causes harm on retry (double payment) and how an idempotency key prevents it."
      ]
    },
    {
      type: 'summary',
      title: 'Session 8 recap',
      points: [
        "IoC container builds the object graph; prefer constructor injection; beans are singletons by default → keep them stateless.",
        "Spring Boot = starters + conditional auto-configuration + embedded server + externalised config & profiles.",
        "HTTP methods carry intent; know safe vs idempotent; use precise status codes (201, 204, 400, 404, 409…).",
        "Spring MVC: filters → DispatcherServlet → HandlerMapping → interceptors → controller → message converters.",
        "`@RestController` + `@GetMapping`/`@PostMapping`/… + `ResponseEntity` build REST endpoints."
      ],
      cards: [
        ['IoC', 'The container, not your code, creates and wires objects.'],
        ['Bean', 'An object created and managed by the Spring container.'],
        ['@Primary', 'Marks the default bean when several candidates match a type.'],
        ['Auto-configuration', 'Conditional @Configuration classes Boot applies based on classpath and properties.'],
        ['@ConfigurationProperties', 'Binds a prefix of external config to a type-safe object/record.'],
        ['Idempotent', 'Repeating the request has the same effect as doing it once.'],
        ['DispatcherServlet', 'Spring MVC front controller that routes every request.'],
        ['HandlerInterceptor', 'Hook that runs before/after a controller method.']
      ],
      notes: [
        "Next session: designing REST APIs properly (resources, DTOs, validation, error responses, pagination) and handling cross-cutting concerns with AOP — plus Lombok to remove boilerplate."
      ]
    }
  ]
});
