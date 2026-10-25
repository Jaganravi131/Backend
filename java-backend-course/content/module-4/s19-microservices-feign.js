COURSE.session({
  no: 19,
  short: 'Monolith vs microservices & Feign',
  title: 'Monolith vs Microservices & Feign Client Inter-Service Communication',
  covers: [0],
  extra: ['Service discovery with Eureka; HTTP Interface clients as the modern alternative'],
  objectives: [
    "Compare monoliths, modular monoliths and microservices, and decide when splitting is worth it.",
    "Decompose a domain into services around business capabilities with database-per-service.",
    "Register and discover services with Eureka and call them with OpenFeign (timeouts, error decoding, header propagation).",
    "Recognise the failure modes of synchronous calls that later sessions solve (Kafka, circuit breakers, sagas)."
  ],
  prereq: "Modules 2–3: Spring Boot REST services, security tokens (Session 18).",
  slides: [
    {
      type: 'theory',
      title: 'Monolith vs microservices',
      lead: 'A **monolith** is one deployable unit. **Microservices** are many small, independently deployable services, each owning one business capability and its data.',
      diagram: { kind: 'compare', cols: [
        { t: 'Monolith', icon: '🧱', tone: 'blue', points: ['one codebase, one deploy, one database', 'simple local dev, testing, debugging', 'in-process calls & ACID transactions', 'scales as a whole; one tech stack', 'big-bang deploys; coupling grows over time'] },
        { t: 'Modular monolith', icon: '🧩', tone: 'green', points: ['one deploy, strict internal modules', 'clear boundaries without network costs', 'easy to split later', 'great default for new products'] },
        { t: 'Microservices', icon: '🛰️', tone: 'purple', points: ['independent deploy & scaling per service', 'team autonomy, polyglot where useful', 'fault isolation (if designed for it)', 'network calls, eventual consistency', 'heavy ops: discovery, tracing, CI/CD per service'] }
      ] },
      notes: [
        "There is no universally better architecture. Microservices trade code complexity for *operational* and *distributed-systems* complexity. Many successful companies run large monoliths; others split once team size and scaling needs demand it.",
        "Our Splitwise project stays a (modular) monolith — appropriate for one team and one domain. The Airbnb-style major project is split because its domains (listings, bookings, payments) scale and evolve differently."
      ]
    },
    {
      type: 'theory',
      title: 'When are microservices worth it?',
      lead: 'Split for **organisational** and **scaling** reasons, not because it\'s fashionable.',
      table: { head: ['Signal', 'Monolith is fine', 'Consider microservices'], rows: [
        ['Team size', '1–2 teams', 'many teams stepping on each other in one codebase'],
        ['Deploy cadence', 'deploying everything together is OK', 'teams blocked by others\' releases'],
        ['Scaling profile', 'uniform load', 'search 100× more traffic than payments'],
        ['Domain clarity', 'boundaries still changing', 'stable, well-understood bounded contexts'],
        ['Ops maturity', 'no CI/CD, monitoring, containers', 'automated pipelines, observability, on-call']
      ] },
      points: [
        "**Conway's law:** systems mirror the communication structure of the organisations that build them.",
        "Anti-patterns: **distributed monolith** (services must deploy together), **shared database**, chatty fine-grained calls, nano-services."
      ],
      callout: { kind: 'interview', text: "*How would you migrate a monolith?* — The **strangler fig** pattern: put a gateway in front, carve out one capability at a time into a new service, route its traffic there, and retire the old code path." },
      notes: [
        "A distributed monolith combines the worst of both worlds: network latency and partial failures *plus* lock-step deployments. The tell-tale sign is a shared database schema that several services write to.",
        "Ask the class to classify: a 3-person startup MVP (monolith), a bank with 40 teams (services), an internal admin tool (monolith)."
      ]
    },
    {
      type: 'theory',
      title: 'Decomposing the Airbnb domain',
      lead: 'Use **bounded contexts** (from Domain-Driven Design): each service owns a capability, its model and its data.',
      diagram: { kind: 'grid', cols: 3, items: [
        { icon: '👤', t: 'user-service', s: 'accounts, hosts & guests, profiles', tone: 'blue' },
        { icon: '🏠', t: 'property-service', s: 'listings, photos, pricing, availability calendar', tone: 'green' },
        { icon: '📅', t: 'booking-service', s: 'reservations, booking state machine', tone: 'purple' },
        { icon: '💳', t: 'payment-service', s: 'charges, refunds, payouts', tone: 'orange' },
        { icon: '🔔', t: 'notification-service', s: 'email/SMS/push on events', tone: 'teal' },
        { icon: '⭐', t: 'review-service', s: 'ratings after completed stays', tone: 'yellow' }
      ] },
      points: [
        "**Database per service:** booking-service never queries the property tables directly — it asks property-service (API) or keeps its own copy of data it needs (events).",
        "The same word can mean different things per context: a *Property* in search (name, price, rating) vs in booking (id, max guests, cancellation policy)."
      ],
      notes: [
        "This decomposition is the starting point of the major project (Sessions 21–24). Draw arrows for which service needs which data: booking needs a property's price and capacity; payment needs the booking amount; notification listens to everyone's events.",
        "Database per service enables independent schema changes and scaling, but it means no cross-service JOINs and no cross-service ACID transactions — the reason for sagas in Session 22."
      ]
    },
    {
      type: 'theory',
      title: 'How services talk: sync vs async',
      lead: 'Synchronous calls are simple but couple availability; asynchronous messages decouple services in time.',
      table: { head: ['', 'Synchronous (REST / gRPC)', 'Asynchronous (Kafka, Session 20)'], rows: [
        ['Interaction', 'request → wait → response', 'publish event → consumers react later'],
        ['Coupling', 'caller needs callee **up now**', 'producer doesn\'t know consumers'],
        ['Latency', 'adds up along call chains', 'non-blocking for the producer'],
        ['Consistency', 'immediate answer', 'eventual consistency'],
        ['Good for', 'queries needing an answer now (price, availability)', 'notifications, workflows, data replication']
      ] },
      diagram: { kind: 'flow', nodes: [
        { t: 'booking-service', s: 'needs property data', tone: 'purple' },
        { t: 'Feign proxy', s: 'declarative client', tone: 'gray' },
        { t: 'LoadBalancer', s: 'picks an instance', tone: 'yellow' },
        { t: 'Eureka registry', s: 'where are the instances?', tone: 'blue' },
        { t: 'property-service #2', s: 'HTTP response', tone: 'green' }
      ] },
      notes: [
        "Service discovery: instances come and go (autoscaling, deployments), so callers resolve a *logical name* (`property-service`) to current addresses. Client-side discovery uses a registry like Eureka; on Kubernetes, platform DNS/Services often replace Eureka.",
        "Rule of thumb for this course: use synchronous calls for reads needed to answer the current request, and events for everything that can happen afterwards."
      ]
    },
    {
      type: 'practical',
      title: 'Service discovery with Eureka',
      lead: 'A registry server; services register themselves on startup and fetch the registry to find each other.',
      code: [
        { lang: 'xml', file: 'pom.xml (every service)', src: code`
          <properties>
            <java.version>21</java.version>
            <spring-cloud.version>2025.1.4</spring-cloud.version>   <!-- "Oakwood", for Boot 4.1 -->
          </properties>

          <dependencyManagement>
            <dependencies>
              <dependency>
                <groupId>org.springframework.cloud</groupId>
                <artifactId>spring-cloud-dependencies</artifactId>
                <version>\${spring-cloud.version}</version>
                <type>pom</type>
                <scope>import</scope>
              </dependency>
            </dependencies>
          </dependencyManagement>

          <!-- registry app:   spring-cloud-starter-netflix-eureka-server -->
          <!-- other services: spring-cloud-starter-netflix-eureka-client -->` },
        { lang: 'java', file: 'DiscoveryServerApplication.java', src: code`
          package com.example.discovery;

          import org.springframework.boot.SpringApplication;
          import org.springframework.boot.autoconfigure.SpringBootApplication;
          import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;

          @SpringBootApplication
          @EnableEurekaServer
          public class DiscoveryServerApplication {
              public static void main(String[] args) { SpringApplication.run(DiscoveryServerApplication.class, args); }
          }` },
        { lang: 'yaml', file: 'application.yml (registry / a client)', src: code`
          # discovery-server
          server:
            port: 8761
          eureka:
            client:
              register-with-eureka: false     # the registry doesn't register with itself
              fetch-registry: false
          ---
          # property-service (any client): registers automatically, no annotation needed
          spring:
            application:
              name: property-service          # the logical name others use
          eureka:
            client:
              service-url:
                defaultZone: http://localhost:8761/eureka/` }
      ],
      notes: [
        "Open the Eureka dashboard at `http://localhost:8761` and start two property-service instances on different ports (`--server.port=8082` and `8083`): both appear under one name.",
        "Clients send heartbeats; instances that stop heart-beating are evicted after a timeout. Keep that in mind when you kill an instance during the lab — callers may briefly still route to it, which is why retries and timeouts matter.",
        "The old `@EnableEurekaClient` annotation no longer exists; having the client starter on the classpath is enough."
      ]
    },
    {
      type: 'practical',
      title: 'Declarative HTTP calls with OpenFeign',
      lead: 'Write an interface with Spring MVC annotations; Feign generates the HTTP client, resolved through discovery and load balancing.',
      code: [
        { lang: 'java', file: 'PropertyClient.java', src: code`
          package com.example.booking.property;

          import java.math.BigDecimal;
          import java.time.LocalDate;
          import org.springframework.cloud.openfeign.FeignClient;
          import org.springframework.web.bind.annotation.GetMapping;
          import org.springframework.web.bind.annotation.PathVariable;
          import org.springframework.web.bind.annotation.RequestParam;

          @FeignClient(name = "property-service", path = "/api/v1/properties",
                       configuration = PropertyClientConfig.class)
          public interface PropertyClient {

              @GetMapping("/{id}")
              PropertySummary getProperty(@PathVariable("id") Long id);

              @GetMapping("/{id}/availability")
              Availability availability(@PathVariable("id") Long id,
                                        @RequestParam("checkIn") LocalDate checkIn,
                                        @RequestParam("checkOut") LocalDate checkOut);

              record PropertySummary(Long id, String title, Long hostId, BigDecimal pricePerNight, int maxGuests) {}
              record Availability(boolean available, BigDecimal totalPrice) {}
          }` },
        { lang: 'java', file: 'BookingService.java (excerpt)', src: code`
          @SpringBootApplication
          @EnableFeignClients                          // scan for @FeignClient interfaces
          public class BookingServiceApplication { ... }

          @Service
          @RequiredArgsConstructor
          public class BookingService {
              private final PropertyClient properties;   // injected like any bean

              public Quote quote(Long propertyId, LocalDate in, LocalDate out, int guests) {
                  PropertySummary p = properties.getProperty(propertyId);           // HTTP GET via Feign
                  if (guests > p.maxGuests()) throw new BusinessRuleException("too many guests");
                  Availability a = properties.availability(propertyId, in, out);
                  if (!a.available()) throw new BusinessRuleException("dates not available");
                  return new Quote(propertyId, in, out, a.totalPrice());
              }
          }` },
        { lang: 'yaml', file: 'application.yml (booking-service)', src: code`
          spring:
            cloud:
              openfeign:
                client:
                  config:
                    property-service:            # per-client settings (or "default")
                      connect-timeout: 2000      # ms
                      read-timeout: 3000         # ms - never rely on infinite defaults
                      logger-level: basic
          # pom: spring-cloud-starter-openfeign + spring-cloud-starter-netflix-eureka-client` }
      ],
      notes: [
        "`name = \"property-service\"` is resolved through Spring Cloud LoadBalancer and Eureka — no hard-coded host or port. Add `url = \"http://localhost:8082\"` to bypass discovery (handy for local debugging or WireMock tests).",
        "Feign reuses Spring's HTTP message converters, so the records deserialize with Jackson exactly like request bodies in our controllers.",
        "Timeouts are the first line of defence against slow dependencies. A read timeout of 3 s means a hung property-service costs us at most 3 s per call instead of tying up a thread indefinitely."
      ]
    },
    {
      type: 'practical',
      title: 'Feign errors & header propagation',
      lead: 'Translate remote HTTP errors into meaningful exceptions, and forward the caller\'s identity and request id.',
      code: { lang: 'java', file: 'PropertyClientConfig.java', src: code`
        package com.example.booking.property;

        import feign.RequestInterceptor;
        import feign.codec.ErrorDecoder;
        import org.slf4j.MDC;
        import org.springframework.context.annotation.Bean;
        import org.springframework.http.HttpHeaders;
        import org.springframework.web.context.request.RequestContextHolder;
        import org.springframework.web.context.request.ServletRequestAttributes;

        // NOT annotated with @Configuration: referenced only from @FeignClient(configuration = ...)
        class PropertyClientConfig {

            @Bean
            ErrorDecoder propertyErrorDecoder() {
                ErrorDecoder defaults = new ErrorDecoder.Default();
                return (methodKey, response) -> switch (response.status()) {
                    case 404 -> new PropertyNotFoundException("property not found: " + methodKey);
                    case 503, 504 -> new DownstreamUnavailableException("property-service unavailable");
                    default -> defaults.decode(methodKey, response);
                };
            }

            @Bean
            RequestInterceptor relayAuthAndRequestId() {
                return template -> {
                    if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
                        String auth = attrs.getRequest().getHeader(HttpHeaders.AUTHORIZATION);
                        if (auth != null) template.header(HttpHeaders.AUTHORIZATION, auth);   // token relay
                    }
                    String requestId = MDC.get("requestId");
                    if (requestId != null) template.header("X-Request-Id", requestId);    // correlation id
                };
            }
        }` },
      notes: [
        "Without an error decoder, any non-2xx response becomes a generic `FeignException` and your API would answer 500 for what is really a 404. Map remote errors to domain exceptions, which your `@RestControllerAdvice` already knows how to render.",
        "Pitfall: annotating this class with `@Configuration` inside the component-scan path makes its beans apply to *every* Feign client. Keep it unannotated (or outside the scanned packages).",
        "Token relay keeps the *user's* identity across services (each service re-validates the JWT — Session 18). For background jobs without a user, obtain a client-credentials token instead."
      ]
    },
    {
      type: 'practical',
      title: 'The modern alternative: HTTP Interface clients',
      lead: 'Spring Framework\'s own declarative clients (`@HttpExchange`) run on `RestClient` — no Netflix/OpenFeign dependency.',
      code: { lang: 'java', file: 'PropertyHttpClient.java', src: code`
        package com.example.booking.property;

        import org.springframework.cloud.client.loadbalancer.LoadBalanced;
        import org.springframework.context.annotation.Bean;
        import org.springframework.context.annotation.Configuration;
        import org.springframework.web.bind.annotation.PathVariable;
        import org.springframework.web.client.RestClient;
        import org.springframework.web.client.support.RestClientAdapter;
        import org.springframework.web.service.annotation.GetExchange;
        import org.springframework.web.service.annotation.HttpExchange;
        import org.springframework.web.service.invoker.HttpServiceProxyFactory;

        @HttpExchange("/api/v1/properties")
        public interface PropertyHttpClient {
            @GetExchange("/{id}")
            PropertyClient.PropertySummary getProperty(@PathVariable Long id);
        }

        @Configuration
        class HttpClientsConfig {

            @Bean
            @LoadBalanced                                      // resolve logical names via discovery
            RestClient.Builder loadBalancedRestClientBuilder() {
                return RestClient.builder();
            }

            @Bean
            PropertyHttpClient propertyHttpClient(RestClient.Builder builder) {
                RestClient restClient = builder.baseUrl("http://property-service").build();
                return HttpServiceProxyFactory.builderFor(RestClientAdapter.create(restClient))
                        .build()
                        .createClient(PropertyHttpClient.class);
            }
        }` },
      callout: { kind: 'version', text: "Spring Cloud OpenFeign is considered *feature-complete* (maintained, but no major new features). Spring now steers new code towards HTTP Interface clients; Spring Framework 7 further simplifies their registration (`@ImportHttpServices`). The brochure's Feign skills transfer directly — same declarative idea." },
      notes: [
        "Both styles look nearly identical to the caller: an injected interface. Teams with existing Feign code keep it; greenfield services can choose HTTP interfaces.",
        "Declaring your own `RestClient.Builder` bean replaces Boot's auto-configured builder; in larger apps, customise the auto-configured one or use a dedicated qualifier instead."
      ]
    },
    {
      type: 'theory',
      title: 'The dark side of synchronous calls',
      lead: 'Every network call can be slow, fail, or succeed without you knowing. Chains of calls multiply the risk.',
      diagram: { kind: 'seq', actors: ['Guest app', 'booking-service', 'property-service', 'payment-service'], msgs: [
        [0, 1, 'POST /bookings'],
        [1, 2, 'GET property (80 ms) OK'],
        [1, 3, 'POST /payments ...'],
        [3, 3, 'DB overloaded: no response'],
        [1, 1, 'request threads pile up waiting'],
        [0, 1, 'more requests arrive...'],
        [1, 0, 'everything slows: cascading failure', 'r']
      ] },
      table: { head: ['Problem', 'Mitigation', 'Where'], rows: [
        ['Slow dependency', 'timeouts on every call', 'today'],
        ['Repeated failures', 'circuit breaker + fallback', 'Session 20'],
        ['Transient errors', 'retries with backoff (idempotent calls only)', 'Session 20'],
        ['Temporal coupling', 'events / message queues', 'Session 20'],
        ['No distributed ACID', 'sagas + outbox', 'Session 22'],
        ['Hard to debug', 'correlation ids, distributed tracing', 'Session 24']
      ] },
      notes: [
        "Availability multiplies: if booking depends synchronously on three services each 99.9% available, booking can be at best ~99.7% available. Asynchronous designs break that multiplication.",
        "This slide is the roadmap for the rest of Module 4 — each row is solved in a later session."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: discovery + Feign between two services',
      lead: 'Stand up a registry, two property-service instances, and a booking-service that calls them.',
      steps: [
        "Create `discovery-server` (Eureka server, port 8761) and open its dashboard.",
        "Create `property-service` with `GET /api/v1/properties/{id}` and `/{id}/availability` (in-memory data is fine); register it with Eureka.",
        "Run two instances (`--server.port=8082`, `--server.port=8083`) and log the port in each response.",
        "Create `booking-service` with `@EnableFeignClients` and `PropertyClient`; expose `POST /api/v1/bookings/quote` that calls both endpoints.",
        "Call the quote endpoint repeatedly and observe load balancing across the two instances.",
        "Add `PropertyClientConfig`: 404 → `PropertyNotFoundException` (your advice returns 404) and timeouts of 2 s / 3 s.",
        "Add a `Thread.sleep(5000)` to one property endpoint and observe the read timeout; then stop one instance and observe the behaviour.",
        "Stretch: implement the same call with an HTTP Interface client and compare."
      ],
      notes: [
        "Students will see failures when killing an instance (Eureka eviction delay). Perfect setup for next session's circuit breakers and retries.",
        "Use different terminal tabs or a `compose.yaml` to run the services; Docker Compose is formalised in Session 23."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: microservices & Feign',
      quiz: [
        { q: "Which is a defining property of microservices?", options: ['They share one database', 'Each is independently deployable and owns its data', 'They must use different languages', 'They never call each other'], answer: 1,
          why: "Independent deployment and database-per-service are core; polyglot is optional." },
        { q: "Services that must always be deployed together and share a schema form a…", options: ['modular monolith', 'distributed monolith', 'service mesh', 'saga'], answer: 1,
          why: "A distributed monolith pays network costs without gaining independence." },
        { q: "What does Eureka provide?", options: ['A message broker', 'Service registration and discovery', 'A database', 'An API gateway'], answer: 1,
          why: "Instances register under a logical name; clients look up current instances." },
        { q: "With `@FeignClient(name = \"property-service\")`, how is the target host found?", options: ['Hard-coded in the annotation', 'Via Spring Cloud LoadBalancer and the discovery registry', 'DNS of the caller', 'From a database table'], answer: 1,
          why: "The logical name is resolved to a live instance chosen by the load balancer." },
        { q: "The most important first protection for synchronous calls is…", options: ['logging', 'timeouts', 'bigger servers', 'more threads'], answer: 1,
          why: "Without timeouts a slow dependency can exhaust your threads and cascade the failure." }
      ],
      notes: [
        "Ask for a real-world example of Conway's law from students' own organisations or projects — it makes the 'organisational reasons' argument tangible."
      ]
    },
    {
      type: 'summary',
      title: 'Session 19 recap',
      points: [
        "Monolith → modular monolith → microservices: choose by team, scaling and ops maturity; beware distributed monoliths.",
        "Decompose by bounded contexts; database per service; no cross-service JOINs or ACID transactions.",
        "Sync (REST/Feign) for immediate queries, async (events) for everything that can happen later.",
        "Eureka registers instances; Feign (or HTTP Interface clients) call them by logical name with load balancing.",
        "Always set timeouts, decode errors, propagate tokens and correlation ids."
      ],
      cards: [
        ['Bounded context', 'Boundary within which a domain model and its language are consistent.'],
        ['Database per service', 'Each service owns its data; others access it only via APIs/events.'],
        ['Strangler fig', 'Incrementally replace parts of a monolith behind a routing layer.'],
        ['Service discovery', 'Resolving a logical service name to live instance addresses.'],
        ['@FeignClient', 'Declarative HTTP client interface generated by Spring Cloud OpenFeign.'],
        ['ErrorDecoder', 'Feign hook translating error responses into exceptions.'],
        ['@HttpExchange', 'Spring Framework declarative HTTP client annotation.'],
        ['Cascading failure', 'A slow/failed dependency exhausting resources up the call chain.']
      ],
      notes: [
        "Next session: decouple services with message queues and Kafka, and protect synchronous calls with circuit breakers — the Spring Cloud & Hystrix topic, implemented with today's Resilience4j."
      ]
    }
  ]
});
