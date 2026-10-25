COURSE.session({
  no: 24,
  short: 'Observability, performance & production',
  title: 'Monitoring, Logging, Performance Optimization & Production Readiness',
  covers: [7],
  extra: ['Deploying on AWS (ECS Fargate, RDS, ElastiCache, MSK) and the capstone wrap-up'],
  objectives: [
    "Instrument services with Actuator health, Micrometer metrics and OpenTelemetry tracing.",
    "Produce structured, correlated logs and build dashboards and alerts around SLOs.",
    "Find and fix performance bottlenecks with load tests, profiling and query tuning.",
    "Run a production-readiness review and deploy the platform to AWS with a CI/CD pipeline."
  ],
  prereq: "Session 23: containerised services, gateway, CI pipeline.",
  slides: [
    {
      type: 'theory',
      title: 'Observability: knowing what your system is doing',
      lead: '**Monitoring** tells you *that* something is wrong; **observability** lets you ask *why* — using metrics, logs and traces together.',
      diagram: { kind: 'grid', cols: 4, items: [
        { icon: '📈', t: 'Metrics', s: 'numbers over time: rate, errors, latency, saturation (Micrometer → Prometheus)', tone: 'green' },
        { icon: '📜', t: 'Logs', s: 'discrete events with context (structured JSON → Loki/ELK/CloudWatch)', tone: 'blue' },
        { icon: '🧵', t: 'Traces', s: 'one request\'s path across services (OpenTelemetry → Tempo/Jaeger)', tone: 'purple' },
        { icon: '❤️', t: 'Health', s: 'liveness & readiness for orchestrators (Actuator)', tone: 'red' }
      ] },
      table: { head: ['Golden signal', 'Booking-service example'], rows: [
        ['Latency', 'p95 of `POST /bookings`'],
        ['Traffic', 'requests per second, bookings created per minute'],
        ['Errors', '5xx rate, payment failures, DLT messages'],
        ['Saturation', 'DB pool usage, CPU, Kafka consumer lag']
      ] },
      notes: [
        "Use all three signals together: a dashboard shows p95 latency jumped (metric) → exemplars or filtering show slow requests (traces) → the trace's id finds the exact log lines explaining the database timeout (logs).",
        "RED (Rate, Errors, Duration) for services and USE (Utilisation, Saturation, Errors) for resources are two handy checklists derived from the golden signals."
      ]
    },
    {
      type: 'practical',
      title: 'Spring Boot Actuator: health, info & metrics',
      lead: 'Actuator adds production endpoints; Micrometer records metrics in a vendor-neutral way.',
      code: [
        { lang: 'xml', file: 'pom.xml', src: code`
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
          </dependency>
          <dependency>
            <groupId>io.micrometer</groupId>
            <artifactId>micrometer-registry-prometheus</artifactId>   <!-- exposes /actuator/prometheus -->
          </dependency>` },
        { lang: 'yaml', file: 'application.yml', src: code`
          management:
            endpoints:
              web:
                exposure:
                  include: health, info, metrics, prometheus
            endpoint:
              health:
                show-details: when-authorized
                probes:
                  enabled: true                       # /actuator/health/liveness, /readiness
            metrics:
              tags:
                application: \${spring.application.name}
              distribution:
                percentiles-histogram:
                  http.server.requests: true          # enables p95/p99 queries` },
        { lang: 'bash', label: 'Try it', src: code`
          $ curl -s localhost:8083/actuator/health
          {"status":"UP","groups":["liveness","readiness"]}
          $ curl -s localhost:8083/actuator/health/readiness
          {"status":"UP"}
          $ curl -s localhost:8083/actuator/prometheus | grep http_server_requests_seconds_count
          http_server_requests_seconds_count{application="booking-service",method="POST",status="201",uri="/api/v1/bookings"} 128` }
      ],
      notes: [
        "Built-in health contributors cover the database, Redis, Kafka, disk space and more; add your own by implementing a `HealthIndicator` bean (e.g. pinging the payment provider).",
        "Expose only what you need and protect it: in production put Actuator on a separate internal port (`management.server.port`) or behind security — `/actuator/env` and `/actuator/heapdump` can leak secrets.",
        "Readiness should fail when the service can't do useful work (e.g. DB unreachable during startup); liveness only when the process is stuck and needs a restart."
      ]
    },
    {
      type: 'practical',
      title: 'Business metrics, Prometheus & Grafana',
      lead: 'Record what matters to the business, scrape it with Prometheus, visualise and alert in Grafana.',
      code: [
        { lang: 'java', file: 'BookingMetrics.java', src: code`
          package com.example.booking.observability;

          import io.micrometer.core.instrument.Counter;
          import io.micrometer.core.instrument.MeterRegistry;
          import io.micrometer.core.instrument.Timer;
          import java.util.function.Supplier;
          import org.springframework.stereotype.Component;

          @Component
          public class BookingMetrics {
              private final Counter created;
              private final Counter conflicts;
              private final Timer quoteTimer;

              public BookingMetrics(MeterRegistry registry) {
                  this.created = Counter.builder("bookings.created").description("Bookings created").register(registry);
                  this.conflicts = Counter.builder("bookings.conflicts")
                          .description("Double-booking attempts rejected").register(registry);
                  this.quoteTimer = Timer.builder("bookings.quote.time").publishPercentileHistogram().register(registry);
              }

              public void bookingCreated() { created.increment(); }
              public void conflict() { conflicts.increment(); }
              public <T> T timeQuote(Supplier<T> quote) { return quoteTimer.record(quote); }
          }` },
        { lang: 'yaml', file: 'prometheus.yml', src: code`
          scrape_configs:
            - job_name: spring-services
              metrics_path: /actuator/prometheus
              eureka_sd_configs:                       # discover every registered instance automatically
                - server: http://discovery:8761/eureka` },
        { lang: 'promql', label: 'PromQL', src: code`
          # 5xx error rate of booking-service
          sum(rate(http_server_requests_seconds_count{application="booking-service", status=~"5.."}[5m]))

          # p95 latency of POST /api/v1/bookings
          histogram_quantile(0.95, sum by (le) (rate(
            http_server_requests_seconds_bucket{application="booking-service", uri="/api/v1/bookings", method="POST"}[5m])))

          # bookings per hour and the conflict ratio
          sum(increase(bookings_created_total[1h]))
          sum(rate(bookings_conflicts_total[15m])) / sum(rate(bookings_created_total[15m]))` }
      ],
      notes: [
        "Micrometer names `bookings.created` become `bookings_created_total` in Prometheus. Keep tag values low-cardinality (no user ids or booking ids as tags!) — every distinct value creates a new time series.",
        "Add Prometheus (`prom/prometheus`) and Grafana (`grafana/grafana`) to the Compose file; import a JVM/Spring Boot dashboard, then build one for the golden signals and business metrics.",
        "A rising conflict ratio may mean a popular property — or a bug in availability caching. Business metrics often detect problems before technical ones."
      ]
    },
    {
      type: 'theory',
      title: 'Distributed tracing with OpenTelemetry',
      lead: 'A **trace** follows one request through every service; each step is a **span**. The trace id travels in the `traceparent` header (and Kafka headers).',
      diagram: { kind: 'seq', actors: ['Gateway', 'booking-service', 'property-service', 'MySQL', 'Kafka'], msgs: [
        [0, 1, 'POST /bookings  trace 4bf9…'],
        [1, 2, 'GET /properties/101 (span 2)'],
        [2, 1, '38 ms', 'r'],
        [1, 3, 'INSERT booking + nights (span 3)'],
        [3, 1, '12 ms', 'r'],
        [1, 4, 'outbox → booking.created (span 4)'],
        [1, 0, '201 in 71 ms', 'r']
      ] },
      code: [
        { lang: 'xml', file: 'pom.xml', src: code`
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-opentelemetry</artifactId>   <!-- Boot 4: OTel SDK + Micrometer bridge -->
          </dependency>` },
        { lang: 'yaml', file: 'application.yml', src: code`
          management:
            tracing:
              sampling:
                probability: 1.0                    # dev: trace everything; prod: e.g. 0.1
            opentelemetry:
              tracing:
                export:
                  otlp:
                    endpoint: http://otel-lgtm:4318/v1/traces
          spring:
            kafka:
              template:
                observation-enabled: true           # propagate trace context through Kafka
              listener:
                observation-enabled: true
          # compose: otel-lgtm -> image grafana/otel-lgtm (Grafana + Tempo + Loki + Prometheus in one container)` }
      ],
      notes: [
        "Spring Boot 4's `spring-boot-starter-opentelemetry` brings the OpenTelemetry SDK and the Micrometer tracing bridge; traces are exported over OTLP. The Boot 3 property `management.otlp.tracing.endpoint` was replaced by `management.opentelemetry.tracing.export.otlp.endpoint`.",
        "HTTP clients built from Boot's builders (RestClient, WebClient) and Feign propagate context automatically; enabling Kafka observations carries the trace across the saga's asynchronous hops.",
        "With tracing active, `traceId` and `spanId` are added to the logging MDC, so every log line can be joined with its trace — the request-id idea from Session 9, standardised."
      ]
    },
    {
      type: 'practical',
      title: 'Production logging: structured, correlated, safe',
      lead: 'Logs are for machines first: JSON with trace ids, shipped to a central store, searchable and retained by policy.',
      code: [
        { lang: 'yaml', file: 'application-prod.yml', src: code`
          logging:
            structured:
              format:
                console: ecs                         # JSON lines (Elastic Common Schema)
            level:
              root: INFO
              com.example: INFO
              org.hibernate.SQL: WARN                # never DEBUG in production` },
        { lang: 'json', label: 'One log line (abridged)', src: code`
          {"@timestamp":"2026-10-25T10:15:30.123Z","log.level":"INFO","message":"booking 42 created for property 101",
           "service.name":"booking-service","process.thread.name":"tomcat-handler-12",
           "log.logger":"com.example.booking.BookingService",
           "traceId":"4bf92f3577b34da6a3ce929d0e0e4736","spanId":"00f067aa0ba902b7"}` }
      ],
      table: { head: ['Do', 'Don\'t'], rows: [
        ['log business events at INFO, failures at ERROR with the exception', 'log every request body (cost, privacy)'],
        ['include ids: bookingId, propertyId, traceId', 'log passwords, tokens, card data, full personal data'],
        ['ship logs to Loki / OpenSearch / CloudWatch', 'ssh into servers to read files'],
        ['set retention & access controls', 'keep logs forever "just in case"']
      ] },
      notes: [
        "Containers should log to stdout/stderr; the platform (Docker, ECS, Kubernetes) collects and ships the stream. No log files inside containers.",
        "Privacy and compliance (e.g. India's DPDP Act, GDPR) apply to logs too: mask emails/phones, never log secrets, and restrict who can search production logs."
      ]
    },
    {
      type: 'theory',
      title: 'Performance optimisation: measure first',
      lead: 'Never guess. Reproduce the load, measure, find the bottleneck, change one thing, measure again.',
      diagram: { kind: 'flow', nodes: [
        { t: 'Define target', s: 'e.g. p95 < 300 ms at 200 RPS', tone: 'blue' },
        { t: 'Load test', s: 'k6 / Gatling', tone: 'purple' },
        { t: 'Find bottleneck', s: 'metrics, traces, JFR profile, EXPLAIN', tone: 'orange' },
        { t: 'Fix one thing', tone: 'green' },
        { t: 'Re-measure', s: 'keep or revert', tone: 'gray' }
      ] },
      table: { head: ['Common bottleneck', 'Typical fix', 'Session'], rows: [
        ['N+1 queries, missing indexes', 'fetch joins / projections, composite indexes', '11, today'],
        ['Repeated expensive reads', 'Redis caching with eviction', '15'],
        ['Exhausted DB connection pool', 'size pool from measurements; shorter transactions', '10'],
        ['Blocking I/O under load', 'virtual threads: `spring.threads.virtual.enabled=true`', '6'],
        ['Slow downstream services', 'timeouts, circuit breakers, async events', '19–20'],
        ['Large payloads', 'pagination, compression, field selection', '9'],
        ['GC pauses / memory', 'right-size heap (`MaxRAMPercentage`), choose GC, fix leaks', '1, 23']
      ] },
      notes: [
        "Virtual threads (Java 21, Session 6) let a Spring MVC service handle many more concurrent blocking requests with the same simple code: one property switches Tomcat request handling, `@Async` and scheduling onto virtual threads. Measure — they help I/O-bound workloads, not CPU-bound ones.",
        "Most backend latency is I/O: database round trips and remote calls. Count them per request before optimising Java code."
      ]
    },
    {
      type: 'practical',
      title: 'Load testing, profiling & query tuning',
      lead: 'A k6 script with SLO thresholds, a Java Flight Recorder profile, and an index that turns a table scan into a range scan.',
      code: [
        { lang: 'js', file: 'search-load.js', label: 'k6 load test', src: code`
          import http from 'k6/http';
          import { check, sleep } from 'k6';

          export const options = {
            stages: [
              { duration: '1m', target: 50 },      // ramp up
              { duration: '3m', target: 200 },     // sustained load
              { duration: '1m', target: 0 },       // ramp down
            ],
            thresholds: {
              http_req_duration: ['p(95)<300'],    // SLO: 95% under 300 ms
              http_req_failed: ['rate<0.01'],      // < 1% errors
            },
          };

          export default function () {
            const res = http.get('http://localhost:8080/api/v1/search?city=Goa&guests=2&page=0');
            check(res, { 'status is 200': (r) => r.status === 200 });
            sleep(1);
          }` },
        { lang: 'bash', label: 'Run & profile', src: code`
          $ k6 run search-load.js
            ✓ status is 200
            http_req_duration....: avg=48ms  p(90)=95ms  p(95)=142ms   ✓ p(95)<300
            http_req_failed......: 0.12%                                ✓ rate<0.01
            http_reqs............: 41237  137/s

          # Java Flight Recorder: low-overhead production profiling (open the .jfr in JDK Mission Control)
          $ jcmd <pid> JFR.start duration=60s filename=/tmp/booking.jfr settings=profile` },
        { lang: 'sql', label: 'EXPLAIN the overlap query', src: code`
          EXPLAIN SELECT id FROM bookings
          WHERE property_id = 101 AND status IN ('PENDING', 'CONFIRMED')
            AND check_in < '2026-12-24' AND check_out > '2026-12-20';

          -- without an index:  type=ALL    rows=1843210  (full table scan)
          CREATE INDEX idx_bookings_property_dates ON bookings (property_id, check_in, check_out);
          -- with the index:    type=range  rows=12       key=idx_bookings_property_dates` }
      ],
      notes: [
        "Run load tests against a production-like environment (same instance sizes, realistic data volume). A test against an empty database on a laptop proves very little.",
        "JFR's method profiling and allocation views show where CPU and memory go; combine with traces to see whether time is spent in your code or waiting on I/O.",
        "Turn on MySQL's slow query log in staging and review it weekly — the cheapest performance tool there is."
      ]
    },
    {
      type: 'theory',
      title: 'SLOs, alerts & incident response',
      lead: 'Agree on what "good enough" means, alert when users are hurting, and learn from every incident.',
      table: { head: ['Term', 'Example for booking-service'], rows: [
        ['SLI (indicator)', 'share of `POST /bookings` answered successfully in < 500 ms'],
        ['SLO (objective)', '99.5% of requests meet the SLI over 30 days'],
        ['Error budget', '0.5% ≈ 3.6 hours of "bad" requests per month to spend on releases and incidents'],
        ['Alert', 'page when the budget burns too fast (e.g. 2% in 1 hour), not on every CPU spike'],
        ['Runbook', 'step-by-step response: check dashboards, recent deploys, DLT size, rollback'],
        ['Postmortem', 'blameless write-up: timeline, root cause, action items']
      ] },
      points: [
        "Alert on **symptoms** users feel (errors, latency, booking failures), investigate **causes** with dashboards.",
        "Every alert needs an owner and a runbook; noisy alerts get ignored — delete or fix them."
      ],
      notes: [
        "Error budgets turn reliability into a shared decision: if the budget is exhausted, the team prioritises reliability work over new features.",
        "Great incident habits: one incident commander, a public status note, frequent updates, and rollback as the first resort when a deploy is the likely cause."
      ]
    },
    {
      type: 'theory',
      title: 'Production readiness checklist',
      lead: 'Before go-live, every service passes the same review.',
      table: { head: ['Area', 'Checks'], rows: [
        ['Security', 'TLS everywhere, JWT validation in gateway & services, least-privilege IAM, secrets in a manager, dependency scanning'],
        ['Reliability', 'timeouts on all calls, circuit breakers, idempotent endpoints & consumers, DLT monitoring, graceful shutdown'],
        ['Data', 'Flyway migrations reviewed (expand/contract), automated backups, restore tested, PITR enabled'],
        ['Observability', 'health probes, golden-signal dashboards, business metrics, tracing, structured logs, SLO alerts'],
        ['Performance', 'load-tested at 2× expected peak, connection pools sized, caches with TTLs, indexes verified'],
        ['Operations', 'CI/CD with rollback, runbooks, on-call rota, capacity plan, cost alarms']
      ] },
      callout: { kind: 'best', text: "Practise failure before it happens: kill a service instance, drop the cache, pause Kafka, restore a backup into a scratch database. A **game day** reveals gaps no checklist can." },
      notes: [
        "Walk through the list against the Airbnb project and mark each item done/partial/missing — it's an excellent final project review and a strong interview story.",
        "Backups that were never restored are hopes, not backups."
      ]
    },
    {
      type: 'theory',
      title: 'Deploying on AWS',
      lead: 'Managed services remove undifferentiated operational work. A typical production layout for our platform:',
      diagram: { kind: 'tiers', tiers: [
        { label: 'Edge', nodes: [{ t: 'Route 53', s: 'DNS', tone: 'gray' }, { t: 'CloudFront + S3', s: 'photos, static web', tone: 'teal' }, { t: 'WAF', s: 'filter attacks', tone: 'red' }] },
        { label: 'Ingress', via: 'HTTPS', nodes: [{ t: 'Application Load Balancer', s: 'TLS, health checks', tone: 'blue' }] },
        { label: 'Compute', via: 'private subnets', nodes: [{ t: 'ECS Fargate services', s: 'gateway + 6 services, autoscaling', tone: 'green' }, { t: 'ECR', s: 'container images', tone: 'gray' }] },
        { label: 'Data', nodes: [{ t: 'RDS MySQL', s: 'Multi-AZ, read replica', tone: 'orange' }, { t: 'ElastiCache Redis', tone: 'red' }, { t: 'Amazon MSK', s: 'Kafka', tone: 'orange' }, { t: 'OpenSearch', tone: 'yellow' }] },
        { label: 'Ops', nodes: [{ t: 'CloudWatch', s: 'logs, metrics, alarms', tone: 'purple' }, { t: 'Secrets Manager', tone: 'purple' }, { t: 'IAM', s: 'least privilege', tone: 'purple' }] }
      ] },
      points: [
        "Services run in **private subnets**; only the load balancer is public. Security groups allow just the required ports.",
        "Region choice: e.g. `ap-south-1` (Mumbai) for Indian users; Multi-AZ for resilience.",
        "Alternatives: EKS (Kubernetes) for more control, Elastic Beanstalk/App Runner for simplicity."
      ],
      notes: [
        "Map each local container to its managed counterpart: MySQL → RDS, Redis → ElastiCache, Kafka → MSK, Eureka → often replaced by ECS Service Connect/Cloud Map or Kubernetes Services, Compose → ECS services.",
        "Cost awareness: managed Kafka and OpenSearch are the expensive parts. For a portfolio deployment, run fewer services or use smaller instance types — and set billing alarms on day one."
      ]
    },
    {
      type: 'practical',
      title: 'CD pipeline: GitHub Actions → ECR → ECS',
      lead: 'Keyless deployments with OIDC: build, push the image tagged with the commit SHA, roll out a new task definition.',
      code: [
        { lang: 'yaml', file: '.github/workflows/deploy.yml', src: code`
          name: deploy-booking-service
          on:
            push:
              branches: [main]
          jobs:
            deploy:
              runs-on: ubuntu-latest
              permissions:
                id-token: write                  # OIDC token -> no long-lived AWS keys in GitHub
                contents: read
              steps:
                - uses: actions/checkout@v7
                - uses: aws-actions/configure-aws-credentials@v6
                  with:
                    role-to-assume: arn:aws:iam::123456789012:role/github-deploy
                    aws-region: ap-south-1
                - id: ecr
                  uses: aws-actions/amazon-ecr-login@v2
                - name: Build and push image
                  run: |
                    IMAGE=\${{ steps.ecr.outputs.registry }}/booking-service:\${{ github.sha }}
                    docker build -t $IMAGE booking-service
                    docker push $IMAGE
                - id: taskdef
                  uses: aws-actions/amazon-ecs-render-task-definition@v1
                  with:
                    task-definition: infra/booking-taskdef.json
                    container-name: booking-service
                    image: \${{ steps.ecr.outputs.registry }}/booking-service:\${{ github.sha }}
                - uses: aws-actions/amazon-ecs-deploy-task-definition@v2
                  with:
                    task-definition: \${{ steps.taskdef.outputs.task-definition }}
                    cluster: stayhub-prod
                    service: booking-service
                    wait-for-service-stability: true      # rolling update; fails if tasks don't become healthy` },
        { lang: 'json', file: 'infra/booking-taskdef.json (excerpt)', src: code`
          {
            "family": "booking-service",
            "requiresCompatibilities": ["FARGATE"],
            "networkMode": "awsvpc",
            "cpu": "512",
            "memory": "1024",
            "containerDefinitions": [{
              "name": "booking-service",
              "portMappings": [{ "containerPort": 8080 }],
              "environment": [{ "name": "SPRING_PROFILES_ACTIVE", "value": "prod" }],
              "secrets": [{ "name": "DB_PASSWORD",
                            "valueFrom": "arn:aws:secretsmanager:ap-south-1:123456789012:secret:booking/db" }],
              "logConfiguration": { "logDriver": "awslogs", "options": {
                  "awslogs-group": "/ecs/booking-service", "awslogs-region": "ap-south-1", "awslogs-stream-prefix": "app" } }
            }]
          }` }
      ],
      notes: [
        "OIDC federation lets GitHub Actions assume an IAM role for the duration of the job — nothing secret is stored in the repository.",
        "The ALB target group health check should call `/actuator/health/readiness`; ECS replaces tasks gradually and only shifts traffic to healthy ones (rolling update with automatic rollback when deployment circuit breaker is enabled).",
        "Secrets are injected by ECS from Secrets Manager at container start — the image and task definition contain only references."
      ]
    },
    {
      type: 'project',
      title: 'Capstone wrap-up: what you built',
      lead: 'Two complete backends, mapped to the brochure\'s skills.',
      table: { head: ['Brochure skill', 'Where you practised it'], rows: [
        ['OOPs Concepts & Core Java', 'Sessions 1–3; every project class'],
        ['Exception Handling & Multithreading', 'Sessions 2–3, 6; ProblemDetail errors, concurrency tests'],
        ['Functional Programming with Java 8', 'Sessions 3, 5; streams & lambdas everywhere'],
        ['JDBC & Database Connectivity', 'Sessions 10–11; JdbcClient, JPA, Flyway'],
        ['Collections Framework & Stream API', 'Sessions 4–5; debt simplifier heaps'],
        ['Backend System Design Fundamentals', 'Sessions 12, 21–24; HLSD, data modeling, scaling'],
        ['REST API Development', 'Sessions 8–9, 13–18; Splitwise & Airbnb APIs'],
        ['Microservices Architecture', 'Sessions 19–24; Feign, Kafka, sagas, gateway, Docker, AWS']
      ] },
      points: [
        "**Portfolio:** two public repositories with READMEs (architecture diagrams, ERDs, API tables, how to run with one command), CI badges and an AI-usage log.",
        "**Interview stories:** exact money splitting, the zero-sum invariant, no double booking with unique nights, the outbox pattern, cache-after-authorization.",
        "**Next steps:** Kubernetes, gRPC, GraphQL, event sourcing, advanced SQL tuning, system design practice."
      ],
      notes: [
        "Ask each student to present their Airbnb system in five minutes: architecture, one hard problem they solved, one metric dashboard, one thing they'd do differently. This mirrors a real system design interview.",
        "Point students to the official Spring guides, the Spring Boot reference documentation and release notes — framework knowledge has a shelf life, and reading release notes is a professional habit."
      ]
    },
    {
      type: 'lab',
      title: 'Final milestone: production-ready Airbnb backend',
      lead: 'Make the platform observable, measured and deployable — then review it like a production team.',
      steps: [
        "Add Actuator + Prometheus registry to every service; expose health probes and the `bookings.created` / `bookings.conflicts` metrics.",
        "Add Prometheus and Grafana to Compose; build a dashboard with the four golden signals per service and the business metrics.",
        "Add `spring-boot-starter-opentelemetry` and `grafana/otel-lgtm`; follow one booking's trace from gateway to Kafka consumer.",
        "Switch to JSON logs (`logging.structured.format.console: ecs`) and find all log lines of one trace id.",
        "Run the k6 search test; record p95, find the slowest endpoint with traces/EXPLAIN, fix it, and re-run.",
        "Enable `spring.threads.virtual.enabled=true` on one I/O-heavy service and compare results under the same load.",
        "Fill in the production-readiness checklist for your system and fix the top three gaps.",
        "Stretch: deploy one service to AWS ECS Fargate with the GitHub Actions workflow (or document the exact steps and costs)."
      ],
      notes: [
        "Grade with the checklist and a short demo: dashboard → trace → logs for one request, plus before/after load-test numbers for one optimisation.",
        "Remind students to tear down cloud resources after experimenting and to keep billing alarms on."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: observability & production',
      quiz: [
        { q: "Which signal best answers 'which service made this request slow?'", options: ['A CPU metric', 'A distributed trace', 'A health check', 'A Dockerfile'], answer: 1,
          why: "Traces show each span's duration across services for one request." },
        { q: "In Spring Boot 4, which property sets the OTLP endpoint for traces?", options: ['management.otlp.tracing.endpoint', 'management.opentelemetry.tracing.export.otlp.endpoint', 'spring.tracing.url', 'otel.trace.url only'], answer: 1,
          why: "Boot 4 moved tracing export under `management.opentelemetry.tracing.export.otlp.*`; the old key no longer takes effect." },
        { q: "Why must metric tags have low cardinality?", options: ['Prometheus rejects strings', 'Each distinct tag value creates a new time series — user ids would explode storage', 'Tags are encrypted', 'Grafana limits tags to 3'], answer: 1,
          why: "High-cardinality tags (ids) create millions of series and overwhelm the metrics backend." },
        { q: "What should a pager alert typically be based on?", options: ['Any CPU spike', 'User-facing symptoms such as error-rate or latency SLO burn', 'Log volume', 'Number of deployments'], answer: 1,
          why: "Alert on symptoms tied to SLOs; investigate causes with dashboards." },
        { q: "How does the GitHub Actions workflow authenticate to AWS without stored keys?", options: ['Hard-coded access keys', 'OIDC federation assuming an IAM role', 'SSH keys', 'The ECR password in the repo'], answer: 1,
          why: "`id-token: write` + `configure-aws-credentials` exchanges a short-lived OIDC token for temporary role credentials." }
      ],
      notes: [
        "Close the course by asking students which single practice from Module 4 they would introduce first in a real team — there is no wrong answer, but they should justify it with a failure it prevents."
      ]
    },
    {
      type: 'summary',
      title: 'Session 24 recap — course complete',
      points: [
        "Observability = metrics (Micrometer/Prometheus), logs (structured, correlated), traces (OpenTelemetry), health probes (Actuator).",
        "Performance: set targets, load-test, profile, tune queries and pools, cache, use virtual threads for blocking I/O.",
        "SLOs and error budgets guide alerting and priorities; runbooks and blameless postmortems guide incidents.",
        "Production readiness covers security, reliability, data, observability, performance and operations.",
        "AWS: ALB → ECS Fargate → RDS/ElastiCache/MSK with CloudWatch & Secrets Manager; GitHub Actions deploys via OIDC."
      ],
      cards: [
        ['Golden signals', 'Latency, traffic, errors, saturation.'],
        ['Micrometer', 'Vendor-neutral metrics facade used by Spring Boot.'],
        ['Span', 'One timed operation within a distributed trace.'],
        ['traceparent', 'W3C header carrying trace context between services.'],
        ['SLO', 'Target level for a service level indicator over a time window.'],
        ['Error budget', 'Allowed unreliability (100% − SLO) to spend on change.'],
        ['JFR', 'Java Flight Recorder — low-overhead JVM profiling.'],
        ['OIDC deploy', 'CI assumes a cloud role with short-lived credentials, no stored keys.']
      ],
      notes: [
        "Congratulations — all 24 sessions complete. Encourage students to keep their repositories alive: upgrade dependencies, add features, and write about what they learned."
      ]
    }
  ]
});
