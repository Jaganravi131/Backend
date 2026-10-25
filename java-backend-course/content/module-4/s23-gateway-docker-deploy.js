COURSE.session({
  no: 23,
  short: 'Gateway, Docker & deployment',
  title: 'Spring Cloud Gateway, Scalability Patterns, Containerization & Deployment',
  covers: [5, 6],
  extra: ['CI pipeline with GitHub Actions'],
  objectives: [
    "Route all client traffic through Spring Cloud Gateway with load balancing, auth, rate limiting and fallbacks.",
    "Apply scalability patterns: stateless replicas, caching, read replicas, async processing, autoscaling.",
    "Containerise services with multi-stage Dockerfiles and run the whole system with Docker Compose.",
    "Configure environments safely (profiles, env vars, secrets) and choose a deployment strategy and CI pipeline."
  ],
  prereq: "Sessions 19–22: the Airbnb services, Eureka, Kafka and Redis.",
  slides: [
    {
      type: 'theory',
      title: 'The API gateway: one front door',
      lead: 'Clients shouldn\'t know about six services, their ports and instances. A **gateway** routes requests and handles edge concerns once.',
      diagram: { kind: 'tiers', tiers: [
        { label: 'Clients', nodes: [{ t: 'Web', tone: 'gray' }, { t: 'Mobile', tone: 'gray' }, { t: 'Partners', tone: 'gray' }] },
        { label: 'Gateway', via: 'https://api.stayhub.example', nodes: [{ t: 'Spring Cloud Gateway', s: 'routing · JWT check · rate limit · CORS · circuit breaker · request id', tone: 'blue' }] },
        { label: 'Services', via: 'lb://<service-name> (Eureka)', nodes: [{ t: 'property ×2', tone: 'green' }, { t: 'search ×3', tone: 'green' }, { t: 'booking ×2', tone: 'green' }, { t: 'payment ×2', tone: 'green' }] }
      ] },
      table: { head: ['Responsibility', 'Why at the edge'], rows: [
        ['Routing & load balancing', 'clients use one host; instances can change freely'],
        ['Authentication (JWT validation)', 'reject anonymous traffic before it reaches services'],
        ['Rate limiting', 'protect services from abuse and spikes'],
        ['CORS, TLS termination, compression', 'configure once, not in every service'],
        ['Circuit breakers & fallbacks', 'fail fast with a friendly 503 instead of hanging']
      ] },
      notes: [
        "The gateway is also where the strangler-fig migration (Session 19) happens: routes decide whether a path goes to the old monolith or a new service.",
        "Keep business logic out of the gateway — it should stay a thin, fast, stateless layer. Services still validate tokens themselves (defence in depth)."
      ]
    },
    {
      type: 'practical',
      title: 'Routing with Spring Cloud Gateway',
      lead: 'Routes = **predicates** (when) + **filters** (what to do) + a **URI** (where). `lb://` resolves service names through discovery.',
      code: [
        { lang: 'xml', file: 'pom.xml (api-gateway)', src: code`
          <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-gateway-server-webflux</artifactId>   <!-- Gateway 5 (reactive) -->
          </dependency>
          <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
          </dependency>` },
        { lang: 'yaml', file: 'application.yml (api-gateway)', src: code`
          server:
            port: 8080
          spring:
            application:
              name: api-gateway
            cloud:
              gateway:
                server:
                  webflux:                       # Gateway 5 property prefix
                    default-filters:
                      - AddResponseHeader=X-Served-By, api-gateway
                    routes:
                      - id: properties
                        uri: lb://property-service
                        predicates:
                          - Path=/api/v1/properties/**
                      - id: search
                        uri: lb://search-service
                        predicates:
                          - Path=/api/v1/search/**
                          - Method=GET
                      - id: bookings
                        uri: lb://booking-service
                        predicates:
                          - Path=/api/v1/bookings/**
                      - id: legacy-reviews       # rewrite an old public path to a new service
                        uri: lb://review-service
                        predicates:
                          - Path=/reviews/**
                        filters:
                          - RewritePath=/reviews/(?<rest>.*), /api/v1/reviews/\${rest}` }
      ],
      notes: [
        "Spring Cloud Gateway 5 (Spring Cloud 2025.x) uses the starter `spring-cloud-starter-gateway-server-webflux` (a servlet-based `-webmvc` variant also exists), and its routes live under `spring.cloud.gateway.server.webflux.routes`. The old `spring.cloud.gateway.routes` prefix from earlier tutorials no longer binds.",
        "The reactive (WebFlux/Netty) gateway handles many concurrent connections with few threads — ideal for a proxy that mostly waits on I/O.",
        "`GET /actuator/gateway/routes` (with the gateway endpoint exposed) lists the active routes — handy for debugging."
      ]
    },
    {
      type: 'practical',
      title: 'Gateway resilience & security',
      lead: 'Circuit breaker with a fallback, Redis-backed rate limiting per user, and JWT validation at the edge.',
      code: [
        { lang: 'yaml', file: 'application.yml (bookings route, extended)', src: code`
          - id: bookings
            uri: lb://booking-service
            predicates:
              - Path=/api/v1/bookings/**
            filters:
              - name: CircuitBreaker                       # spring-cloud-starter-circuitbreaker-reactor-resilience4j
                args:
                  name: bookingsCB
                  fallbackUri: forward:/fallback/bookings
              - name: RequestRateLimiter                   # needs spring-boot-starter-data-redis-reactive
                args:
                  redis-rate-limiter.replenishRate: 10     # tokens per second
                  redis-rate-limiter.burstCapacity: 20
                  key-resolver: "#{@userKeyResolver}"` },
        { lang: 'java', file: 'GatewayConfig.java', src: code`
          package com.example.gateway;

          import java.security.Principal;
          import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
          import org.springframework.context.annotation.Bean;
          import org.springframework.context.annotation.Configuration;
          import org.springframework.http.HttpMethod;
          import org.springframework.http.HttpStatus;
          import org.springframework.http.ProblemDetail;
          import org.springframework.http.ResponseEntity;
          import org.springframework.security.config.Customizer;
          import org.springframework.security.config.web.server.ServerHttpSecurity;
          import org.springframework.security.web.server.SecurityWebFilterChain;
          import org.springframework.web.bind.annotation.RequestMapping;
          import org.springframework.web.bind.annotation.RestController;
          import reactor.core.publisher.Mono;

          @Configuration
          class GatewayConfig {

              @Bean
              KeyResolver userKeyResolver() {                      // rate-limit per user, else per IP
                  return exchange -> exchange.getPrincipal().map(Principal::getName)
                          .switchIfEmpty(Mono.justOrEmpty(exchange.getRequest().getRemoteAddress())
                                  .map(addr -> addr.getAddress().getHostAddress()));
              }

              @Bean
              SecurityWebFilterChain security(ServerHttpSecurity http) {   // reactive security
                  return http
                          .authorizeExchange(ex -> ex
                                  .pathMatchers(HttpMethod.GET, "/api/v1/properties/**", "/api/v1/search/**").permitAll()
                                  .pathMatchers("/actuator/health/**", "/fallback/**").permitAll()
                                  .anyExchange().authenticated())
                          .oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults()))
                          .csrf(ServerHttpSecurity.CsrfSpec::disable)
                          .build();
              }
          }

          @RestController
          class FallbackController {
              @RequestMapping("/fallback/bookings")
              Mono<ResponseEntity<ProblemDetail>> bookingsUnavailable() {
                  ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                          "Booking is temporarily unavailable. Your request was not processed; please retry shortly.");
                  return Mono.just(ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(pd));
              }
          }` }
      ],
      notes: [
        "Exceeding the rate limit returns **429 Too Many Requests**. The token-bucket parameters allow short bursts (20) but a sustained rate of 10/s per user.",
        "The fallback message is honest: it says the booking was *not* processed, so the client can safely retry with the same Idempotency-Key (Session 22).",
        "Searching and browsing stay public; everything else needs a valid JWT (Session 18). Services keep validating tokens too."
      ]
    },
    {
      type: 'theory',
      title: 'Scalability patterns',
      lead: 'Scale **out** (more instances) rather than **up** (bigger machines) — which only works if services are stateless.',
      table: { head: ['Pattern', 'What it does', 'In our project'], rows: [
        ['Stateless services + horizontal scaling', 'any instance serves any request; add replicas under load', 'JWT auth, no HTTP sessions in services'],
        ['Load balancing', 'spread requests (round robin, least connections)', 'gateway + Spring Cloud LoadBalancer'],
        ['Caching', 'serve repeated reads from memory', 'Redis for search results & property pages; CDN for photos'],
        ['Read replicas', 'route reads to MySQL replicas', 'search-heavy reads, reports'],
        ['Async processing', 'queue work instead of doing it inline', 'Kafka for payments & notifications'],
        ['Partitioning / sharding', 'split data by key across nodes', 'Kafka partitions by bookingId; DB sharding by region later'],
        ['Autoscaling', 'adjust replicas by CPU/latency/queue lag', 'ECS/Kubernetes autoscaling (Session 24)'],
        ['Back-pressure & rate limits', 'refuse or slow excess load gracefully', 'gateway 429s, bounded queues']
      ] },
      points: [
        "Scale the bottleneck you measured, not the one you imagine (Session 24: metrics and load tests).",
        "Databases are usually the hardest part to scale — protect them with caching, connection pools and async writes."
      ],
      notes: [
        "Statelessness is why we chose bearer tokens over server sessions for the APIs: with sessions you'd need sticky routing or a shared session store.",
        "Different services scale differently: search might run 6 replicas while payment runs 2. That independent scaling was one of the reasons to split the system in the first place (Session 19)."
      ]
    },
    {
      type: 'theory',
      title: 'Containers & Docker essentials',
      lead: 'A container image packages your app **with** its runtime and dependencies, so it runs the same on a laptop, CI and the cloud.',
      diagram: { kind: 'compare', cols: [
        { t: 'Virtual machine', icon: '🖥️', tone: 'gray', points: ['full guest OS per VM', 'GBs, boots in minutes', 'strong isolation'] },
        { t: 'Container', icon: '📦', tone: 'blue', points: ['shares the host kernel; isolated processes', 'MBs, starts in seconds', 'immutable image layers, cached and shared'] }
      ] },
      table: { head: ['Command', 'Purpose'], rows: [
        ['`docker build -t booking-service:1.0 .`', 'build an image from a Dockerfile'],
        ['`docker run -p 8080:8080 booking-service:1.0`', 'start a container, publish a port'],
        ['`docker ps` / `docker logs -f <id>`', 'list containers / follow logs'],
        ['`docker exec -it <id> sh`', 'shell into a running container'],
        ['`docker push <registry>/booking-service:1.0`', 'publish to a registry (GHCR, ECR, Docker Hub)']
      ] },
      notes: [
        "Images are built in layers; unchanged layers are reused from cache. Ordering Dockerfile instructions from least to most frequently changing (dependencies before source code) makes rebuilds fast.",
        "Tag images with an immutable version (git SHA or semantic version), never deploy `latest` to production."
      ]
    },
    {
      type: 'practical',
      title: 'A production-grade Dockerfile for a Spring Boot service',
      lead: 'Multi-stage: build with Maven + JDK, run on a slim JRE as a non-root user.',
      code: [
        { lang: 'dockerfile', file: 'Dockerfile', src: code`
          # ---- build stage: JDK + Maven ----
          FROM maven:3.9-eclipse-temurin-21 AS build
          WORKDIR /workspace
          COPY pom.xml .
          RUN mvn -q -B dependency:go-offline        # dependencies cached in their own layer
          COPY src ./src
          RUN mvn -q -B package -DskipTests          # tests already ran in CI

          # ---- runtime stage: JRE only ----
          FROM eclipse-temurin:21-jre
          RUN groupadd --system app && useradd --system --gid app app
          WORKDIR /app
          COPY --from=build /workspace/target/*.jar app.jar
          USER app                                   # never run as root
          EXPOSE 8080
          ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
          ENTRYPOINT ["java", "-jar", "/app/app.jar"]` },
        { lang: 'text', file: '.dockerignore', src: code`
          target/
          .git/
          .idea/
          *.iml
          .env` },
        { lang: 'bash', label: 'Build & run', src: code`
          $ docker build -t booking-service:1.0.0 .
          $ docker images booking-service
          REPOSITORY        TAG     SIZE
          booking-service   1.0.0   ~300MB        # JRE base + app; the JDK/Maven stage is discarded

          $ docker run --rm -p 8083:8080 -e SPRING_PROFILES_ACTIVE=docker booking-service:1.0.0

          # Alternative without a Dockerfile: Cloud Native Buildpacks
          $ ./mvnw spring-boot:build-image -Dspring-boot.build-image.imageName=booking-service:1.0.0` }
      ],
      notes: [
        "The final image contains no compiler, no Maven, no source code — smaller and with a smaller attack surface. That's the JRE-vs-JDK distinction from Session 1 in practice.",
        "`MaxRAMPercentage` makes the JVM size its heap from the container's memory limit instead of the host's RAM; `ExitOnOutOfMemoryError` lets the orchestrator restart a broken container instead of leaving it half-alive.",
        "For faster rebuilds, Spring Boot can extract the JAR into layers (`java -Djarmode=tools -jar app.jar extract --layers`) so dependency layers are cached separately from your classes."
      ]
    },
    {
      type: 'practical',
      title: 'Running the whole platform with Docker Compose',
      lead: 'Infrastructure + services + gateway on one network, started with one command.',
      code: [
        { lang: 'yaml', file: 'compose.yaml', src: code`
          services:
            mysql:
              image: mysql:8.4
              environment:
                MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}        # from .env (git-ignored)
              volumes:
                - mysql-data:/var/lib/mysql
                - ./infra/mysql-init:/docker-entrypoint-initdb.d   # creates one schema + user per service
              healthcheck:
                test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
                interval: 5s
                retries: 20

            redis:
              image: redis:7-alpine

            kafka:
              image: apache/kafka:4.1.0
              environment:
                KAFKA_NODE_ID: 1
                KAFKA_PROCESS_ROLES: broker,controller
                KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
                KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092   # reachable by name on the network
                KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
                KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
                KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
                KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

            discovery:
              build: ./discovery-server
              ports: ["8761:8761"]

            booking-service:
              build: ./booking-service
              environment:
                SPRING_PROFILES_ACTIVE: docker
                SPRING_DATASOURCE_PASSWORD: \${BOOKING_DB_PASSWORD}
              depends_on:
                mysql: { condition: service_healthy }
                kafka: { condition: service_started }
                discovery: { condition: service_started }
              deploy:
                replicas: 2                                        # two instances behind the gateway

            api-gateway:
              build: ./api-gateway
              ports: ["8080:8080"]                                 # the only public entry point
              environment:
                SPRING_PROFILES_ACTIVE: docker
              depends_on: [discovery, redis]

          volumes:
            mysql-data:` },
        { lang: 'yaml', file: 'booking-service/src/main/resources/application-docker.yml', src: code`
          spring:
            datasource:
              url: jdbc:mysql://mysql:3306/booking_db
              username: booking
            kafka:
              bootstrap-servers: kafka:9092
            data:
              redis:
                host: redis
          eureka:
            client:
              service-url:
                defaultZone: http://discovery:8761/eureka/` }
      ],
      notes: [
        "Inside the Compose network services reach each other by name (`mysql`, `kafka`, `discovery`). Only the gateway publishes a port — services aren't directly reachable from outside, as in production.",
        "`docker compose up --build -d`, then `docker compose ps` and `docker compose logs -f booking-service`. Scale on the fly: `docker compose up -d --scale booking-service=3`.",
        "Environment-specific values live in a `docker` profile file; secrets come from environment variables populated from a git-ignored `.env` file."
      ]
    },
    {
      type: 'theory',
      title: 'Environment configuration done right',
      lead: 'Build **one** immutable artifact; inject everything that differs per environment at runtime (12-factor app).',
      table: { head: ['Kind of setting', 'Where it lives', 'Example'], rows: [
        ['Defaults & structure', '`application.yml` in the JAR', 'timeouts, pool sizes, feature defaults'],
        ['Per-environment values', 'profile files / env vars', '`application-prod.yml`, `SPRING_DATASOURCE_URL`'],
        ['Secrets', 'secret manager → env vars', 'DB passwords, OAuth secrets, JWT keys (AWS Secrets Manager, Vault, K8s secrets)'],
        ['Shared, changing config', 'Spring Cloud Config server (Git-backed)', 'feature flags, limits across services'],
        ['Never', 'Git or Docker images', 'plain-text passwords, private keys']
      ] },
      code: { lang: 'yaml', file: 'application-prod.yml', src: code`
        spring:
          datasource:
            url: \${DB_URL}                               # injected by the platform
            username: \${DB_USER}
            password: \${DB_PASSWORD}                     # from the secret manager
          jpa:
            open-in-view: false
          config:
            import: optional:configserver:\${CONFIG_SERVER_URL:http://config:8888}   # Spring Cloud Config (optional)
        server:
          shutdown: graceful                             # finish in-flight requests on SIGTERM
        management:
          endpoint:
            health:
              probes:
                enabled: true                            # /actuator/health/liveness and /readiness` },
      notes: [
        "The same Docker image runs in dev, staging and prod; only configuration changes. That makes 'it worked in staging' meaningful.",
        "Relaxed binding maps environment variables to properties: `SPRING_DATASOURCE_PASSWORD` → `spring.datasource.password`.",
        "Spring Cloud Config centralises configuration for many services (backed by Git, with refresh support); it's optional — many teams use their platform's parameter/secret stores instead."
      ]
    },
    {
      type: 'theory',
      title: 'Deployment strategies & zero downtime',
      lead: 'How you replace version N with N+1 decides whether users notice.',
      table: { head: ['Strategy', 'How', 'Pros', 'Cons'], rows: [
        ['Recreate', 'stop all old, start all new', 'simple', 'downtime'],
        ['Rolling update', 'replace instances a few at a time', 'no downtime, no extra capacity', 'two versions run side by side'],
        ['Blue-green', 'deploy full new stack, switch traffic at the load balancer', 'instant switch & rollback', 'double capacity during deploy'],
        ['Canary', 'send 5% → 25% → 100% of traffic to the new version', 'limits blast radius, data-driven', 'needs good metrics & routing']
      ] },
      diagram: { kind: 'flow', nodes: [
        { t: 'Build & test', s: 'CI: ./mvnw verify', tone: 'blue' },
        { t: 'Image', s: 'tag = git SHA', tone: 'gray' },
        { t: 'Deploy N+1', s: 'readiness probe passes', tone: 'green' },
        { t: 'Shift traffic', s: 'rolling / canary', tone: 'yellow' },
        { t: 'Watch metrics', s: 'errors, latency → rollback?', tone: 'red' }
      ] },
      points: [
        "Prerequisites: **readiness/liveness probes** (enabled by default in Spring Boot 4), **graceful shutdown**, backward-compatible APIs and events.",
        "Database changes use **expand → migrate → contract**: add the new column first, deploy code that writes both, backfill, then remove the old column in a later release."
      ],
      notes: [
        "During a rolling update old and new versions serve traffic at the same time — so version N+1 must work with the schema and events that version N produces, and vice versa. That's why we insisted on additive changes.",
        "Readiness says 'send me traffic'; liveness says 'restart me if false'. A service that is starting up (Flyway running) is alive but not ready."
      ]
    },
    {
      type: 'practical',
      title: 'Continuous integration with GitHub Actions',
      lead: 'Every pull request is built and tested; every merge to `main` publishes versioned images.',
      code: { lang: 'yaml', file: '.github/workflows/ci.yml', src: code`
        name: ci
        on:
          pull_request:
          push:
            branches: [main]

        jobs:
          build:
            runs-on: ubuntu-latest
            permissions:
              contents: read
              packages: write                       # push images to GHCR
            steps:
              - uses: actions/checkout@v7
              - uses: actions/setup-java@v6
                with:
                  distribution: temurin
                  java-version: '21'
                  cache: maven

              - name: Build and test (unit + Testcontainers ITs use the runner's Docker)
                run: ./mvnw -B verify

              - name: Log in to GitHub Container Registry
                if: github.ref == 'refs/heads/main'
                uses: docker/login-action@v4
                with:
                  registry: ghcr.io
                  username: \${{ github.actor }}
                  password: \${{ secrets.GITHUB_TOKEN }}

              - name: Build and push booking-service image
                if: github.ref == 'refs/heads/main'
                uses: docker/build-push-action@v7
                with:
                  context: ./booking-service
                  push: true
                  tags: ghcr.io/\${{ github.repository }}/booking-service:\${{ github.sha }}` },
      notes: [
        "Pull requests run the full test pyramid from Session 14, including Testcontainers integration tests — GitHub-hosted Ubuntu runners have Docker available.",
        "Images are tagged with the commit SHA, so every deployment is traceable to exact code. A deployment job (Session 24: AWS) can pick up that tag.",
        "Secrets such as the registry token come from GitHub's encrypted secrets, never from the repository."
      ]
    },
    {
      type: 'lab',
      title: 'Project milestone 3: gateway + containers',
      lead: 'Make the Airbnb platform start with one command behind a single, protected entry point.',
      steps: [
        "Create `api-gateway` with `spring-cloud-starter-gateway-server-webflux` and Eureka; route `/api/v1/properties/**`, `/search/**`, `/bookings/**` with `lb://` URIs.",
        "Add the bookings circuit breaker with a `/fallback/bookings` 503 problem response; stop booking-service and observe it.",
        "Add Redis rate limiting per user (429 beyond the limit) and JWT validation at the gateway.",
        "Write a multi-stage `Dockerfile` (non-root, JRE runtime) for every service; build and run one locally.",
        "Write `compose.yaml` with MySQL (schema per service), Redis, Kafka (KRaft), discovery, all services and the gateway; add `application-docker.yml` files.",
        "Run `docker compose up --build -d`, scale booking-service to 3 and confirm the gateway balances across instances.",
        "Externalise secrets into a git-ignored `.env`; confirm `git status` shows no secrets.",
        "Add the GitHub Actions workflow; open a PR and watch the pipeline go green. Stretch: canary routing with two gateway routes and weights."
      ],
      notes: [
        "Common issues: services starting before MySQL is ready (use healthchecks + `depends_on: condition`), Kafka advertised listener pointing at localhost inside containers, and Eureka URLs still set to localhost (use the docker profile).",
        "The `Weight` route predicate in Spring Cloud Gateway (e.g. `Weight=bookings, 90` / `Weight=bookings, 10`) implements a simple canary split for the stretch goal."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: gateway, scaling & deployment',
      quiz: [
        { q: "In Spring Cloud Gateway 5, where do route definitions live in YAML?", options: ['spring.cloud.gateway.routes', 'spring.cloud.gateway.server.webflux.routes', 'zuul.routes', 'server.routes'], answer: 1,
          why: "Gateway 5 moved its properties under `spring.cloud.gateway.server.webflux` (or `.webmvc`); the old prefix no longer binds." },
        { q: "What does `uri: lb://booking-service` mean?", options: ['A load balancer appliance address', 'Resolve booking-service via discovery and load-balance across its instances', 'Use HTTP/2', 'Local booking file'], answer: 1,
          why: "The `lb` scheme uses Spring Cloud LoadBalancer with the service registry." },
        { q: "Why use a multi-stage Dockerfile?", options: ['To run two apps in one container', 'Build with JDK/Maven, ship only the JRE and the JAR — smaller and safer images', 'It is required by Docker', 'To skip tests'], answer: 1,
          why: "Build tools stay in the discarded stage; the runtime image is minimal." },
        { q: "Which deployment strategy sends a small percentage of traffic to the new version first?", options: ['Recreate', 'Blue-green', 'Canary', 'Big bang'], answer: 2,
          why: "Canary releases expose a fraction of users and expand based on metrics." },
        { q: "Where should the production database password come from?", options: ['application.yml in Git', 'Baked into the Docker image', 'A secret manager injected as an environment variable at runtime', 'A comment in the Dockerfile'], answer: 2,
          why: "Secrets never live in Git or images; the platform injects them at runtime." }
      ],
      notes: [
        "Ask students to explain why horizontal scaling *requires* stateless services, using sessions vs JWTs as the example.",
        "For Q1, show a gateway that silently routes nothing because of the old property prefix: the app starts fine, every request 404s — a perfect example of why reading the release notes during upgrades matters."
      ]
    },
    {
      type: 'summary',
      title: 'Session 23 recap',
      points: [
        "Spring Cloud Gateway 5: routes with predicates, filters and `lb://` URIs under `spring.cloud.gateway.server.webflux`; JWT, rate limiting, circuit breaker fallbacks at the edge.",
        "Scale out stateless services; cache, replicate reads, process asynchronously, autoscale, apply back-pressure.",
        "Multi-stage Dockerfiles (JDK build → JRE runtime, non-root); Compose runs infra + services + gateway.",
        "One immutable image, configuration injected per environment; secrets from secret managers.",
        "Rolling / blue-green / canary deployments need probes, graceful shutdown and backward-compatible changes; CI builds, tests and publishes images."
      ],
      cards: [
        ['API gateway', 'Single entry point handling routing and edge concerns.'],
        ['Route predicate', 'Condition (path, method, header) selecting a gateway route.'],
        ['Gateway filter', 'Modifies requests/responses: rewrite, rate limit, circuit breaker.'],
        ['Horizontal scaling', 'Adding instances instead of bigger machines.'],
        ['Multi-stage build', 'Dockerfile with separate build and runtime stages.'],
        ['12-factor config', 'Store configuration in the environment, not in code.'],
        ['Blue-green deployment', 'Two full environments; switch traffic at once.'],
        ['Expand/contract', 'Backward-compatible database migration in steps.']
      ],
      notes: [
        "Final session: production readiness — monitoring with Actuator, Micrometer, Prometheus and Grafana, logging and tracing, performance tuning, and deploying to AWS. Then the capstone wrap-up."
      ]
    }
  ]
});
