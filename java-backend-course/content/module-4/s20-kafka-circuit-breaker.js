COURSE.session({
  no: 20,
  short: 'Kafka, Spring Cloud & circuit breakers',
  title: 'Message Queues & Kafka with Spring Boot, Spring Cloud & the Hystrix Circuit Breaker',
  covers: [1, 2],
  extra: ['Hystrix is retired: the circuit breaker is implemented with Resilience4j (Spring Cloud CircuitBreaker)'],
  objectives: [
    "Explain message queues vs pub/sub, delivery guarantees and why async messaging decouples services.",
    "Describe Kafka's topics, partitions, offsets, replication, consumer groups and KRaft mode.",
    "Produce and consume JSON events with Spring Kafka, with retries, dead-letter topics and idempotent consumers.",
    "Apply the circuit breaker pattern (Hystrix concept, Resilience4j implementation) with fallbacks, retries and timeouts."
  ],
  prereq: "Session 19 (services calling each other) and Session 6 (producer–consumer queues).",
  slides: [
    {
      type: 'theory',
      title: 'Message queues: decoupling in time',
      lead: 'Instead of calling a service and waiting, a producer **publishes a message** to a broker; consumers process it when they can.',
      diagram: { kind: 'compare', cols: [
        { t: 'Point-to-point queue', icon: '📬', tone: 'blue', points: ['each message processed by **one** consumer', 'work distribution (e.g. send 10k emails)', 'RabbitMQ queues, AWS SQS'] },
        { t: 'Publish / subscribe', icon: '📣', tone: 'green', points: ['each message delivered to **every** subscribing group', 'events: “BookingCreated” → payments, notifications, analytics', 'Kafka topics, RabbitMQ exchanges, SNS'] }
      ] },
      table: { head: ['Benefit', 'Example'], rows: [
        ['Temporal decoupling', 'notification-service can be down; events wait in the broker'],
        ['Load levelling', 'a burst of 50k bookings is processed at the consumers\' pace'],
        ['Extensibility', 'add an analytics consumer without touching booking-service'],
        ['Resilience', 'no cascading failure from slow downstream services']
      ] },
      points: [
        "Delivery semantics: **at-most-once** (may lose), **at-least-once** (may duplicate — most common), **exactly-once** (within limits, costly).",
        "At-least-once ⇒ consumers must be **idempotent**."
      ],
      notes: [
        "Recall Session 6's `BlockingQueue` producer–consumer: same idea, but the broker is a separate, durable, distributed system, so producers and consumers can live in different services and restart independently.",
        "The trade-off is eventual consistency: after a booking is created, the confirmation email arrives a moment later. For most workflows that's exactly right."
      ]
    },
    {
      type: 'theory',
      title: 'Kafka architecture',
      lead: 'Kafka is a distributed, **append-only log**. Topics are split into partitions, replicated across brokers, and read by consumer groups at their own pace.',
      diagram: { kind: 'layers', items: [
        { t: 'Producers', s: 'booking-service, payment-service', tone: 'blue', parts: ['key → partition = hash(key) % partitions', 'acks=all for durability'] },
        { t: 'Topic “booking.created” (3 partitions, replicated)', tone: 'orange', parts: ['P0: offsets 0 1 2 3 …', 'P1: offsets 0 1 2 …', 'P2: offsets 0 1 …', 'leader + follower replicas (ISR)'] },
        { t: 'Brokers (cluster) in KRaft mode', s: 'metadata managed by Kafka controllers — no ZooKeeper since Kafka 4.0', tone: 'purple' },
        { t: 'Consumer groups', tone: 'green', parts: ['notification-service (group A)', 'payment-service (group B)', 'each group reads every event; inside a group each partition has one consumer'] }
      ] },
      points: [
        "Messages are **retained** for a configured time (e.g. 7 days) — consumers can replay from any offset.",
        "**Ordering** is guaranteed only **within a partition** → use the entity id (bookingId) as the key.",
        "Parallelism per group ≤ number of partitions; adding consumers triggers a **rebalance**."
      ],
      notes: [
        "The key-to-partition mapping is hashing again (Session 5): Kafka's default partitioner hashes the key bytes (murmur2) modulo the partition count, so all events of booking 42 land in the same partition, in order.",
        "Unlike a classic queue, consuming doesn't delete messages; each consumer group stores its own *offset*. That's why payments and notifications can read the same event independently.",
        "Kafka 4.0 removed ZooKeeper entirely; clusters run in KRaft mode with Kafka's own Raft-based controllers. Old tutorials with a `zookeeper` container are outdated."
      ]
    },
    {
      type: 'practical',
      title: 'Run Kafka locally (KRaft) and try the CLI',
      lead: 'A single-node broker in Docker, a topic with 3 partitions, and keyed messages.',
      code: [
        { lang: 'yaml', file: 'compose.yaml', src: code`
          services:
            kafka:
              image: apache/kafka:4.1.0
              ports:
                - "9092:9092"
              environment:
                KAFKA_NODE_ID: 1
                KAFKA_PROCESS_ROLES: broker,controller          # KRaft: one node does both
                KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
                KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
                KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
                KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
                KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
                KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
                KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
                KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1` },
        { lang: 'bash', label: 'Kafka CLI', src: code`
          $ docker compose exec kafka bash
          $ cd /opt/kafka/bin
          $ ./kafka-topics.sh --bootstrap-server localhost:9092 --create --topic booking.created \
                --partitions 3 --replication-factor 1
          Created topic booking.created.

          $ ./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic booking.created \
                --property parse.key=true --property key.separator=:
          > 42:{"bookingId":42,"status":"CREATED"}
          > 42:{"bookingId":42,"status":"CONFIRMED"}
          > 7:{"bookingId":7,"status":"CREATED"}

          $ ./kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic booking.created \
                --group demo --from-beginning --property print.key=true --property print.partition=true
          Partition:1  42  {"bookingId":42,"status":"CREATED"}
          Partition:1  42  {"bookingId":42,"status":"CONFIRMED"}
          Partition:0  7   {"bookingId":7,"status":"CREATED"}` }
      ],
      notes: [
        "Both events for booking 42 go to the same partition and stay in order; booking 7 lands elsewhere. (Your partition numbers may differ.)",
        "Run a second consumer with the same `--group demo`: partitions get split between them. Run one with a different group: it receives everything again.",
        "Production clusters have 3+ brokers, replication factor 3 and `min.insync.replicas=2`; managed options include Amazon MSK and Confluent Cloud (Session 24)."
      ]
    },
    {
      type: 'practical',
      title: 'Producing events with Spring Kafka',
      lead: '`KafkaTemplate` sends records asynchronously; the key decides the partition.',
      code: [
        { lang: 'xml', file: 'pom.xml', src: code`
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-kafka</artifactId>   <!-- Boot 4 starter for Spring for Apache Kafka -->
          </dependency>` },
        { lang: 'yaml', file: 'application.yml (booking-service)', src: code`
          spring:
            kafka:
              bootstrap-servers: localhost:9092
              producer:
                key-serializer: org.apache.kafka.common.serialization.StringSerializer
                value-serializer: org.springframework.kafka.support.serializer.JacksonJsonSerializer
                acks: all                       # wait for all in-sync replicas
                properties:
                  enable.idempotence: true      # no duplicates from producer retries` },
        { lang: 'java', file: 'BookingEventsPublisher.java', src: code`
          package com.example.booking.events;

          import com.example.events.BookingCreated;
          import java.time.Instant;
          import java.util.UUID;
          import org.apache.kafka.clients.admin.NewTopic;
          import org.slf4j.Logger;
          import org.slf4j.LoggerFactory;
          import org.springframework.context.annotation.Bean;
          import org.springframework.context.annotation.Configuration;
          import org.springframework.kafka.config.TopicBuilder;
          import org.springframework.kafka.core.KafkaTemplate;
          import org.springframework.stereotype.Service;

          @Service
          public class BookingEventsPublisher {
              private static final Logger log = LoggerFactory.getLogger(BookingEventsPublisher.class);
              private final KafkaTemplate<String, Object> kafka;

              public BookingEventsPublisher(KafkaTemplate<String, Object> kafka) { this.kafka = kafka; }

              public void bookingCreated(BookingView b) {
                  BookingCreated event = new BookingCreated(UUID.randomUUID().toString(), b.id(), b.propertyId(),
                          b.guestId(), b.checkIn(), b.checkOut(), b.amount(), Instant.now());
                  kafka.send("booking.created", String.valueOf(b.id()), event)        // key = bookingId
                       .whenComplete((result, ex) -> {
                           if (ex != null) log.error("publish failed for booking {}", b.id(), ex);
                           else log.info("booking {} -> partition {} offset {}", b.id(),
                                   result.getRecordMetadata().partition(), result.getRecordMetadata().offset());
                       });
              }
          }

          @Configuration
          class TopicsConfig {
              @Bean
              NewTopic bookingCreatedTopic() {                  // created at startup if missing
                  return TopicBuilder.name("booking.created").partitions(3).replicas(1).build();
              }
          }` },
        { lang: 'java', file: 'BookingCreated.java (shared events module)', src: code`
          package com.example.events;

          import java.math.BigDecimal;
          import java.time.Instant;
          import java.time.LocalDate;

          public record BookingCreated(String eventId, Long bookingId, Long propertyId, Long guestId,
                                       LocalDate checkIn, LocalDate checkOut, BigDecimal amount, Instant occurredAt) {}` }
      ],
      notes: [
        "Spring Kafka 4 uses Jackson 3: the serializer is `JacksonJsonSerializer` (the older `JsonSerializer` is deprecated).",
        "Events are named in the past tense — they describe facts that already happened (`BookingCreated`, `PaymentFailed`) — and carry an `eventId` for de-duplication.",
        "`send` is asynchronous; never block on it inside a request thread unless you must. But how do we make sure the DB commit and the publish don't diverge? That's the outbox pattern in Session 22."
      ]
    },
    {
      type: 'practical',
      title: 'Consuming events: listeners, retries, DLT, idempotency',
      lead: 'A `@KafkaListener` method per event type; failures are retried, then parked in a dead-letter topic.',
      code: [
        { lang: 'yaml', file: 'application.yml (notification-service)', src: code`
          spring:
            kafka:
              bootstrap-servers: localhost:9092
              consumer:
                group-id: notification-service
                auto-offset-reset: earliest
                key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
                value-deserializer: org.springframework.kafka.support.serializer.ErrorHandlingDeserializer
                properties:
                  spring.deserializer.value.delegate.class: org.springframework.kafka.support.serializer.JacksonJsonDeserializer
                  spring.json.trusted.packages: "com.example.events"` },
        { lang: 'java', file: 'BookingCreatedListener.java', src: code`
          package com.example.notification;

          import com.example.events.BookingCreated;
          import org.slf4j.Logger;
          import org.slf4j.LoggerFactory;
          import org.springframework.context.annotation.Bean;
          import org.springframework.context.annotation.Configuration;
          import org.springframework.kafka.annotation.KafkaListener;
          import org.springframework.kafka.core.KafkaTemplate;
          import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
          import org.springframework.kafka.listener.DefaultErrorHandler;
          import org.springframework.stereotype.Component;
          import org.springframework.transaction.annotation.Transactional;
          import org.springframework.util.backoff.FixedBackOff;

          @Component
          public class BookingCreatedListener {
              private static final Logger log = LoggerFactory.getLogger(BookingCreatedListener.class);
              private final ProcessedEvents processed;          // table with UNIQUE(event_id)
              private final EmailSender email;

              public BookingCreatedListener(ProcessedEvents processed, EmailSender email) {
                  this.processed = processed; this.email = email;
              }

              @KafkaListener(topics = "booking.created")
              @Transactional
              public void on(BookingCreated event) {
                  if (!processed.markIfFirst(event.eventId())) {          // idempotent consumer
                      log.info("duplicate event {} ignored", event.eventId());
                      return;
                  }
                  email.sendBookingReceived(event.guestId(), event.bookingId(), event.checkIn());
              }
          }

          @Configuration
          class KafkaErrorHandling {
              @Bean   // Boot wires a single CommonErrorHandler bean into the listener containers
              DefaultErrorHandler errorHandler(KafkaTemplate<String, Object> template) {
                  var recoverer = new DeadLetterPublishingRecoverer(template);   // -> booking.created.DLT
                  return new DefaultErrorHandler(recoverer, new FixedBackOff(1000L, 3));   // 3 retries, 1 s apart
              }
          }` }
      ],
      table: { head: ['Concern', 'Solution'], rows: [
        ['Poison message (bad JSON)', '`ErrorHandlingDeserializer` → straight to the DLT, no infinite loop'],
        ['Transient failure (SMTP down)', 'retries with backoff, then DLT'],
        ['Duplicate delivery', 'idempotent consumer: remember processed `eventId`s'],
        ['Inspecting failures', 'consume/replay the `.DLT` topic after fixing the bug']
      ] },
      notes: [
        "Offsets are committed after the listener returns successfully (the default AckMode), which gives at-least-once delivery: a crash before the commit means the event is processed again — hence the idempotency table.",
        "`@RetryableTopic` is an alternative that retries via separate delay topics without blocking the partition.",
        "Keep listeners small: validate, de-duplicate, delegate to a service. Long-running work inside a listener delays the whole partition."
      ]
    },
    {
      type: 'theory',
      title: 'Spring Cloud & the circuit breaker pattern',
      lead: 'Spring Cloud packages proven distributed-systems patterns. Its first circuit breaker was Netflix **Hystrix**; today it is **Resilience4j**.',
      diagram: { kind: 'graph', cw: 230, ch: 110, bw: 150, nodes: [
        { id: 'closed', t: 'CLOSED', s: 'calls flow normally', x: 0, y: 0, tone: 'green' },
        { id: 'open', t: 'OPEN', s: 'fail fast → fallback', x: 2, y: 0, tone: 'red' },
        { id: 'half', t: 'HALF_OPEN', s: 'a few trial calls', x: 1, y: 1, tone: 'yellow' }
      ], edges: [['closed', 'open', 'failure rate ≥ threshold'], ['open', 'half', 'after wait duration'], ['half', 'closed', 'trials succeed'], ['half', 'open', 'trial fails']] },
      table: { head: ['Spring Cloud project', 'Purpose'], rows: [
        ['Netflix Eureka / LoadBalancer', 'discovery & client-side load balancing (Session 19)'],
        ['OpenFeign', 'declarative HTTP clients (Session 19)'],
        ['**CircuitBreaker** (Resilience4j)', 'circuit breakers, retries, time limits — today'],
        ['Gateway', 'edge routing, filters, rate limiting (Session 23)'],
        ['Config', 'centralised configuration (Session 23)']
      ] },
      callout: { kind: 'version', text: "**Hystrix** has been in maintenance mode since 2018 and was removed from Spring Cloud in 2020.0. The concept the brochure names is exactly the same — we implement it with **Resilience4j**." },
      notes: [
        "Electrical analogy: a breaker trips to protect the house when current is dangerous; it doesn't keep trying to push current through a short circuit. Likewise, an OPEN circuit stops sending requests to a failing service, giving it time to recover and keeping our threads free.",
        "HALF_OPEN lets a few trial calls through; success closes the circuit, failure re-opens it for another wait period."
      ]
    },
    {
      type: 'practical',
      title: 'Circuit breakers in code: Hystrix (legacy) vs Resilience4j',
      lead: 'Same idea, modern library: annotate the method, name the fallback, configure thresholds.',
      code: [
        { lang: 'java', file: 'PaymentGateway.java', label: 'Resilience4j (today)', src: code`
          package com.example.booking.payment;

          import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
          import io.github.resilience4j.retry.annotation.Retry;
          import org.slf4j.Logger;
          import org.slf4j.LoggerFactory;
          import org.springframework.stereotype.Service;

          @Service
          public class PaymentGateway {
              private static final Logger log = LoggerFactory.getLogger(PaymentGateway.class);
              private final PaymentClient client;                     // Feign/HTTP client to payment-service

              public PaymentGateway(PaymentClient client) { this.client = client; }

              @CircuitBreaker(name = "payment", fallbackMethod = "chargeFallback")
              @Retry(name = "payment")
              public PaymentResult charge(ChargeRequest req) {
                  return client.charge(req);
              }

              // same parameters + Throwable, same return type, same class
              PaymentResult chargeFallback(ChargeRequest req, Throwable ex) {
                  log.warn("payment unavailable for booking {}: {}", req.bookingId(), ex.toString());
                  return PaymentResult.pending(req.bookingId());      // keep booking PENDING, retry later
              }
          }` },
        { lang: 'yaml', file: 'application.yml', label: 'Resilience4j config', src: code`
          resilience4j:
            circuitbreaker:
              instances:
                payment:
                  sliding-window-type: COUNT_BASED
                  sliding-window-size: 10
                  minimum-number-of-calls: 5
                  failure-rate-threshold: 50            # % failures that opens the circuit
                  slow-call-duration-threshold: 2s
                  slow-call-rate-threshold: 50          # slow calls count as failures too
                  wait-duration-in-open-state: 30s
                  permitted-number-of-calls-in-half-open-state: 2
                  register-health-indicator: true
            retry:
              instances:
                payment:
                  max-attempts: 3                       # total attempts including the first
                  wait-duration: 500ms
          # pom: io.github.resilience4j:resilience4j-spring-boot4 (2.4.x) + spring-boot-starter-aspectj
          #   or spring-cloud-starter-circuitbreaker-resilience4j (managed by the Spring Cloud BOM)` },
        { lang: 'java', file: 'PaymentGateway.java', label: 'Hystrix (legacy, for reference)', legacy: true, verify: false, src: code`
          // Spring Cloud Hoxton era (2019). Does NOT run on Spring Boot 2.4+ / Spring Cloud 2020.0+.
          @EnableCircuitBreaker
          @SpringBootApplication
          public class BookingApp { }

          @Service
          public class PaymentGateway {
              @HystrixCommand(fallbackMethod = "chargeFallback", commandProperties = {
                  @HystrixProperty(name = "circuitBreaker.requestVolumeThreshold", value = "10"),
                  @HystrixProperty(name = "circuitBreaker.errorThresholdPercentage", value = "50"),
                  @HystrixProperty(name = "circuitBreaker.sleepWindowInMilliseconds", value = "30000")
              })
              public PaymentResult charge(ChargeRequest req) { return client.charge(req); }

              public PaymentResult chargeFallback(ChargeRequest req) {
                  return PaymentResult.pending(req.bookingId());
              }
          }` }
      ],
      notes: [
        "Map the concepts across tabs: Hystrix `requestVolumeThreshold` ≈ R4j `minimum-number-of-calls`, `errorThresholdPercentage` ≈ `failure-rate-threshold`, `sleepWindowInMilliseconds` ≈ `wait-duration-in-open-state`. Knowing both is useful when maintaining older systems.",
        "Annotations are AOP (Session 9): the method must be public and called from another bean. In Boot 4 the AOP starter is `spring-boot-starter-aspectj`.",
        "A good fallback degrades gracefully *and honestly*: here the booking stays PENDING and payment is retried later — not 'pretend the payment succeeded'.",
        "Retry wraps the circuit breaker by default in Resilience4j's aspect order, so each retry attempt is recorded by the breaker."
      ]
    },
    {
      type: 'practical',
      title: 'Feign fallbacks & Spring Cloud CircuitBreaker',
      lead: 'Protect Feign clients declaratively, or wrap any call programmatically through Spring Cloud\'s abstraction.',
      code: [
        { lang: 'java', file: 'PropertyClientFallback.java', src: code`
          // application.yml:  spring.cloud.openfeign.circuitbreaker.enabled: true
          // pom: spring-cloud-starter-circuitbreaker-resilience4j

          @FeignClient(name = "property-service", path = "/api/v1/properties", fallback = PropertyClientFallback.class)
          public interface PropertyClient {
              @GetMapping("/{id}") PropertySummary getProperty(@PathVariable("id") Long id);
          }

          @Component
          class PropertyClientFallback implements PropertyClient {
              @Override
              public PropertySummary getProperty(Long id) {
                  throw new DownstreamUnavailableException("property-service unavailable, try again shortly");
              }
          }` },
        { lang: 'java', file: 'AvailabilityService.java', src: code`
          package com.example.booking.property;

          import java.math.BigDecimal;
          import java.time.LocalDate;
          import org.springframework.cloud.client.circuitbreaker.CircuitBreakerFactory;
          import org.springframework.stereotype.Service;

          @Service
          public class AvailabilityService {
              private final CircuitBreakerFactory<?, ?> circuitBreakers;
              private final PropertyClient properties;

              public AvailabilityService(CircuitBreakerFactory<?, ?> circuitBreakers, PropertyClient properties) {
                  this.circuitBreakers = circuitBreakers;
                  this.properties = properties;
              }

              public PropertyClient.Availability check(Long id, LocalDate in, LocalDate out) {
                  return circuitBreakers.create("property").run(
                          () -> properties.availability(id, in, out),
                          ex -> new PropertyClient.Availability(false, BigDecimal.ZERO));   // conservative fallback
              }
          }` }
      ],
      table: { head: ['Resilience4j module', 'Protects against'], rows: [
        ['CircuitBreaker', 'repeatedly calling a failing dependency'],
        ['Retry', 'transient errors (only for idempotent operations!)'],
        ['TimeLimiter', 'calls that take too long (async)'],
        ['Bulkhead', 'one dependency exhausting all threads'],
        ['RateLimiter', 'overloading a dependency (or being overloaded)']
      ] },
      notes: [
        "For availability, the safe fallback is 'not available' — never 'available' — so we can't double-book while property-service is down.",
        "Watch the breaker live: with Actuator, `GET /actuator/circuitbreakers` and `/actuator/health` show states; metrics like `resilience4j_circuitbreaker_state` feed the Grafana dashboards of Session 24."
      ]
    },
    {
      type: 'practical',
      title: 'Build a tiny circuit breaker to see how it works',
      lead: 'A count-based sliding window, a failure-rate threshold and a wait duration — the core of Resilience4j in 60 lines (with a fake clock).',
      code: { lang: 'java', file: 'MiniCircuitBreaker.java', src: code`
        import java.time.Duration;
        import java.time.Instant;
        import java.util.ArrayDeque;
        import java.util.Deque;
        import java.util.function.Supplier;

        public class MiniCircuitBreaker {
            enum State { CLOSED, OPEN, HALF_OPEN }

            private final int windowSize;
            private final double failureRateThreshold;
            private final Duration waitInOpen;
            private final Deque<Boolean> window = new ArrayDeque<>();
            private State state = State.CLOSED;
            private Instant openedAt;
            private Instant now = Instant.parse("2026-10-25T10:00:00Z");   // fake clock: deterministic demo

            MiniCircuitBreaker(int windowSize, double failureRateThreshold, Duration waitInOpen) {
                this.windowSize = windowSize;
                this.failureRateThreshold = failureRateThreshold;
                this.waitInOpen = waitInOpen;
            }

            void advance(Duration d) { now = now.plus(d); }

            <T> T call(Supplier<T> action, Supplier<T> fallback) {
                if (state == State.OPEN) {
                    if (Duration.between(openedAt, now).compareTo(waitInOpen) >= 0) transition(State.HALF_OPEN);
                    else return fallback.get();                         // fail fast: no remote call at all
                }
                try {
                    T result = action.get();
                    record(true);
                    return result;
                } catch (RuntimeException e) {
                    record(false);
                    return fallback.get();
                }
            }

            private void record(boolean success) {
                if (state == State.HALF_OPEN) {                         // the trial call decides
                    transition(success ? State.CLOSED : State.OPEN);
                    return;
                }
                window.addLast(success);
                if (window.size() > windowSize) window.removeFirst();
                long failures = window.stream().filter(ok -> !ok).count();
                if (window.size() == windowSize && failures * 100.0 / windowSize >= failureRateThreshold) {
                    transition(State.OPEN);
                }
            }

            private void transition(State next) {
                System.out.println("  [" + state + " -> " + next + "]");
                state = next;
                window.clear();
                if (next == State.OPEN) openedAt = now;
            }

            public static void main(String[] args) {
                MiniCircuitBreaker cb = new MiniCircuitBreaker(4, 50.0, Duration.ofSeconds(30));
                boolean[] remoteUp = {true};
                int[] remoteCalls = {0};
                Supplier<String> remote = () -> {
                    remoteCalls[0]++;
                    if (!remoteUp[0]) throw new IllegalStateException("payment-service timeout");
                    return "OK";
                };
                Supplier<String> fallback = () -> "FALLBACK (queued for retry)";

                System.out.println("1: " + cb.call(remote, fallback));
                remoteUp[0] = false;                                     // payment-service goes down
                for (int i = 2; i <= 6; i++) System.out.println(i + ": " + cb.call(remote, fallback));
                System.out.println("remote calls so far: " + remoteCalls[0]);
                cb.advance(Duration.ofSeconds(31));                      // wait duration passes...
                remoteUp[0] = true;                                      // ...and the service recovered
                System.out.println("7: " + cb.call(remote, fallback));
                System.out.println("8: " + cb.call(remote, fallback));
                System.out.println("state: " + cb.state + ", remote calls: " + remoteCalls[0]);
            }
        }`, out: code`
        1: OK
        2: FALLBACK (queued for retry)
        3: FALLBACK (queued for retry)
          [CLOSED -> OPEN]
        4: FALLBACK (queued for retry)
        5: FALLBACK (queued for retry)
        6: FALLBACK (queued for retry)
        remote calls so far: 4
          [OPEN -> HALF_OPEN]
          [HALF_OPEN -> CLOSED]
        7: OK
        8: OK
        state: CLOSED, remote calls: 6` },
      notes: [
        "Key observation: calls 5 and 6 never reach the remote service (remote calls stay at 4) — that's the *fail fast* benefit protecting both our threads and the struggling dependency.",
        "Resilience4j adds time-based windows, slow-call detection, a configurable number of half-open trial calls, thread safety and metrics — but the state machine is exactly this one.",
        "Exercise: change the window to 10 calls and the threshold to 30%, and predict when the breaker opens before running it."
      ]
    },
    {
      type: 'theory',
      title: 'Resilience toolbox & Spring Framework 7\'s built-in retries',
      lead: 'Combine patterns deliberately; each one has a cost.',
      table: { head: ['Pattern', 'Use when', 'Careful about'], rows: [
        ['Timeout', 'always, on every remote call', 'too short → false failures'],
        ['Retry + backoff + jitter', 'transient faults, idempotent calls', 'retry storms; never blindly retry payments'],
        ['Circuit breaker', 'a dependency fails repeatedly', 'a meaningful fallback'],
        ['Bulkhead', 'isolate slow dependencies', 'sizing the pools'],
        ['Async messaging', 'the caller doesn\'t need an immediate answer', 'eventual consistency, idempotency']
      ] },
      code: { lang: 'java', label: 'Spring Framework 7 core resilience', src: code`
        @Configuration
        @EnableResilientMethods                 // required: the annotations are inert without it
        class ResilienceConfig {}

        @Service
        class ExchangeRateClient {
            @Retryable(maxRetries = 3, delay = 200, multiplier = 2, jitter = 50)   // up to 4 calls in total
            @ConcurrencyLimit(10)                                                // max 10 concurrent callers
            public BigDecimal rateFor(String currency) { /* remote call */ return BigDecimal.ONE; }
        }
        // imports: org.springframework.resilience.annotation.{EnableResilientMethods, Retryable, ConcurrencyLimit}` },
      callout: { kind: 'pitfall', text: "Off-by-one: Resilience4j `max-attempts: 3` = **3 calls in total**; Spring's `@Retryable(maxRetries = 3)` = **1 call + 3 retries = 4 calls**. Spring's core module has no circuit breaker or fallback methods — keep Resilience4j for those." },
      notes: [
        "Spring Framework 7 added lightweight `@Retryable` and `@ConcurrencyLimit` to the core (package `org.springframework.resilience`). They're handy for simple retries without extra dependencies.",
        "Jitter randomises backoff delays so thousands of clients don't retry in lock-step after an outage."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: events with Kafka + a circuit breaker',
      lead: 'Make booking-service publish events, notification-service consume them safely, and protect a synchronous call with Resilience4j.',
      steps: [
        "Start Kafka (KRaft) with the compose file; create `booking.created` with 3 partitions using the CLI.",
        "In booking-service add `spring-boot-starter-kafka`, the producer config and `BookingEventsPublisher`; publish when a booking is created.",
        "Create notification-service with the consumer config and `BookingCreatedListener` that logs a fake email; run two instances and watch partitions being shared.",
        "Add the `processed_events` table (UNIQUE event_id) and prove duplicates are ignored by re-sending the same event from the CLI.",
        "Send invalid JSON with the console producer; confirm it lands in `booking.created.DLT` and the listener keeps running.",
        "Add Resilience4j to booking-service: `@CircuitBreaker` + fallback on `PaymentGateway.charge` with the YAML config.",
        "Stop payment-service and fire requests: watch CLOSED → OPEN at `/actuator/circuitbreakers`, then restart it and watch HALF_OPEN → CLOSED.",
        "Stretch: switch the listener to `@RetryableTopic` and compare behaviour; run `MiniCircuitBreaker` with your own thresholds."
      ],
      notes: [
        "Remind students that the shared `events` module (records only) is the contract between services — version it carefully, and prefer adding optional fields over renaming.",
        "If consumers don't receive anything, check `spring.json.trusted.packages`, the group id, and `auto-offset-reset` (a new group with `latest` ignores old messages)."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: Kafka & circuit breakers',
      quiz: [
        { q: "Kafka guarantees message ordering…", options: ['across the whole topic', 'within a single partition', 'only with one broker', 'never'], answer: 1,
          why: "Order is per partition; use a key (e.g. bookingId) so related events share a partition." },
        { q: "Two consumers in the SAME group read a topic with 3 partitions. What happens?", options: ['Both get every message', 'Partitions are divided between them', 'Only one works, the other is idle forever', 'Messages are lost'], answer: 1,
          why: "Within a group each partition is assigned to one consumer; different groups each receive all messages." },
        { q: "With at-least-once delivery, consumers must be…", options: ['fast', 'idempotent', 'stateless', 'single-threaded'], answer: 1,
          why: "Redeliveries happen (e.g. crash before offset commit); processing the same event twice must be harmless." },
        { q: "What does an OPEN circuit breaker do with new calls?", options: ['Retries them', 'Fails fast and uses the fallback without calling the dependency', 'Queues them in Kafka', 'Sends them to another region'], answer: 1,
          why: "OPEN means short-circuit: no remote call until the wait duration passes and HALF_OPEN trials succeed." },
        { q: "What replaced Netflix Hystrix in Spring Cloud?", options: ['Eureka', 'Ribbon', 'Resilience4j via Spring Cloud CircuitBreaker', 'Zuul'], answer: 2,
          why: "Hystrix entered maintenance in 2018 and was removed in Spring Cloud 2020.0; Resilience4j is the standard implementation." }
      ],
      notes: [
        "Bonus question for Q2: what happens with 4 consumers in the group and 3 partitions? (One consumer is idle — parallelism is capped by partitions.)"
      ]
    },
    {
      type: 'summary',
      title: 'Session 20 recap',
      points: [
        "Messaging decouples services in time; queues distribute work, pub/sub broadcasts events; design for at-least-once.",
        "Kafka: topics → partitions (ordered logs) → offsets; replication; consumer groups; KRaft (no ZooKeeper).",
        "Spring Kafka: `KafkaTemplate` + JacksonJsonSerializer, `@KafkaListener`, ErrorHandlingDeserializer, DefaultErrorHandler + DLT, idempotent consumers.",
        "Circuit breaker states CLOSED/OPEN/HALF_OPEN: Hystrix is the classic, Resilience4j the current implementation.",
        "Combine timeouts, careful retries, breakers, bulkheads; Spring 7 adds `@Retryable`/`@ConcurrencyLimit` (watch the off-by-one)."
      ],
      cards: [
        ['Partition', 'Ordered, append-only log that is the unit of parallelism in Kafka.'],
        ['Offset', 'Position of a record in a partition; consumers commit offsets per group.'],
        ['Consumer group', 'Set of consumers sharing a topic\u2019s partitions; groups each get all messages.'],
        ['KRaft', 'Kafka\u2019s built-in Raft metadata mode replacing ZooKeeper (Kafka 4+).'],
        ['DLT', 'Dead-letter topic holding records that failed processing after retries.'],
        ['Idempotent consumer', 'Processing the same event twice has the same effect as once.'],
        ['Circuit breaker', 'Stops calls to a failing dependency and fails fast with a fallback.'],
        ['Fallback', 'Alternative response when a protected call fails or is short-circuited.']
      ],
      notes: [
        "Next session starts the major project: the Airbnb backend — high-level system design and data modeling for users, properties, bookings and payments."
      ]
    }
  ]
});
