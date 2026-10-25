COURSE.session({
  no: 22,
  short: 'Booking workflows & sagas',
  title: 'Microservices Architecture & Booking Management Workflows',
  covers: [4],
  objectives: [
    "Model the booking lifecycle as an explicit state machine with valid transitions only.",
    "Coordinate booking and payment across services with a choreography saga and compensating actions.",
    "Prevent double bookings under concurrency and make every step idempotent.",
    "Publish events reliably with the transactional outbox pattern."
  ],
  prereq: "Session 20 (Kafka, idempotent consumers) and Session 21 (schemas and the overlap rule).",
  slides: [
    {
      type: 'theory',
      title: 'The booking state machine',
      lead: 'A booking moves through well-defined states. Making transitions explicit prevents impossible situations like confirming an expired booking.',
      diagram: { kind: 'graph', cw: 250, ch: 110, bw: 160, nodes: [
        { id: 'p', t: 'PENDING', s: 'nights held 15 min', x: 0, y: 1, tone: 'yellow' },
        { id: 'c', t: 'CONFIRMED', s: 'paid', x: 1, y: 0, tone: 'green' },
        { id: 'x', t: 'CANCELLED', s: 'by guest / payment failed', x: 1, y: 2, tone: 'red' },
        { id: 'e', t: 'EXPIRED', s: 'unpaid in time', x: 0, y: 2, tone: 'gray' },
        { id: 'd', t: 'COMPLETED', s: 'after check-out', x: 2, y: 0, tone: 'purple' }
      ], edges: [['p', 'c', 'payment.completed'], ['p', 'x', 'payment.failed'], ['p', 'e', 'timeout'], ['c', 'x', 'cancel → refund'], ['c', 'd', 'check-out']] },
      table: { head: ['Transition', 'Trigger', 'Side effects'], rows: [
        ['PENDING → CONFIRMED', '`payment.completed` event', 'notify guest & host'],
        ['PENDING → CANCELLED', '`payment.failed` event or guest cancels', 'release nights (compensation)'],
        ['PENDING → EXPIRED', 'scheduler: `expires_at` passed', 'release nights'],
        ['CONFIRMED → CANCELLED', 'guest/host cancels', 'refund per policy, release nights'],
        ['CONFIRMED → COMPLETED', 'check-out date passed', 'enable reviews, host payout']
      ] },
      notes: [
        "Terminal states (CANCELLED, EXPIRED, COMPLETED) have no outgoing transitions. Encoding this in one place means a late or duplicate event can never resurrect a booking.",
        "The 15-minute hold balances fairness (guests can't block dates forever) with time to complete payment."
      ]
    },
    {
      type: 'practical',
      title: 'State machine & cancellation policy in code',
      lead: 'An `EnumMap` of allowed transitions guards every change; refunds are a pure function of policy and timing.',
      code: { lang: 'java', file: 'BookingWorkflow.java', src: code`
        import java.math.BigDecimal;
        import java.math.RoundingMode;
        import java.time.Duration;
        import java.time.LocalDateTime;
        import java.util.*;

        public class BookingWorkflow {
            enum Status { PENDING, CONFIRMED, CANCELLED, EXPIRED, COMPLETED }
            enum Policy { FLEXIBLE, MODERATE, STRICT }

            static final Map<Status, Set<Status>> ALLOWED = new EnumMap<>(Map.of(
                    Status.PENDING, EnumSet.of(Status.CONFIRMED, Status.CANCELLED, Status.EXPIRED),
                    Status.CONFIRMED, EnumSet.of(Status.CANCELLED, Status.COMPLETED),
                    Status.CANCELLED, EnumSet.noneOf(Status.class),
                    Status.EXPIRED, EnumSet.noneOf(Status.class),
                    Status.COMPLETED, EnumSet.noneOf(Status.class)));

            static class Booking {
                final long id;
                Status status = Status.PENDING;
                final List<String> history = new ArrayList<>();
                Booking(long id) { this.id = id; }

                void transition(Status to, String reason) {
                    if (!ALLOWED.get(status).contains(to)) {
                        throw new IllegalStateException("booking " + id + ": " + status + " -> " + to + " not allowed");
                    }
                    history.add(status + " -> " + to + " (" + reason + ")");
                    status = to;
                }
            }

            /** Refund when cancelling 'before' the check-in time (simplified policies). */
            static BigDecimal refund(Policy policy, BigDecimal paid, Duration before) {
                long hours = before.toHours();
                BigDecimal fraction = switch (policy) {
                    case FLEXIBLE -> hours >= 24 ? BigDecimal.ONE : BigDecimal.ZERO;
                    case MODERATE -> hours >= 5 * 24 ? BigDecimal.ONE : new BigDecimal("0.5");
                    case STRICT -> hours >= 7 * 24 ? new BigDecimal("0.5") : BigDecimal.ZERO;
                };
                return paid.multiply(fraction).setScale(2, RoundingMode.HALF_EVEN);
            }

            public static void main(String[] args) {
                Booking b = new Booking(42);
                b.transition(Status.CONFIRMED, "payment.completed");
                b.transition(Status.COMPLETED, "guest checked out");
                b.history.forEach(h -> System.out.println("42: " + h));

                Booking late = new Booking(43);
                late.transition(Status.EXPIRED, "unpaid after 15 min");
                try {
                    late.transition(Status.CONFIRMED, "payment.completed arrived late");   // must not resurrect
                } catch (IllegalStateException e) {
                    System.out.println("rejected: " + e.getMessage());
                }

                LocalDateTime checkIn = LocalDateTime.of(2026, 12, 20, 14, 0);
                BigDecimal paid = new BigDecimal("18000.00");
                for (Policy p : Policy.values()) {
                    for (LocalDateTime cancelAt : List.of(checkIn.minusDays(10), checkIn.minusDays(3), checkIn.minusHours(6))) {
                        Duration before = Duration.between(cancelAt, checkIn);
                        System.out.printf("%-8s cancel %3d h before -> refund %s%n", p, before.toHours(), refund(p, paid, before));
                    }
                }
            }
        }`, out: code`
        42: PENDING -> CONFIRMED (payment.completed)
        42: CONFIRMED -> COMPLETED (guest checked out)
        rejected: booking 43: EXPIRED -> CONFIRMED not allowed
        FLEXIBLE cancel 240 h before -> refund 18000.00
        FLEXIBLE cancel  72 h before -> refund 18000.00
        FLEXIBLE cancel   6 h before -> refund 0.00
        MODERATE cancel 240 h before -> refund 18000.00
        MODERATE cancel  72 h before -> refund 9000.00
        MODERATE cancel   6 h before -> refund 9000.00
        STRICT   cancel 240 h before -> refund 9000.00
        STRICT   cancel  72 h before -> refund 0.00
        STRICT   cancel   6 h before -> refund 0.00` },
      notes: [
        "In the JPA entity, `transition()` also appends a `booking_status_history` row; the `ALLOWED` map is identical.",
        "Booking 43 is the important case: the payment event arrived *after* the booking expired. The state machine rejects the confirmation, and booking-service instead requests a refund — a compensating action.",
        "Pure functions like `refund` are trivially unit-testable; put every policy edge (exactly 24 h, exactly 5 days) into a parameterized test."
      ]
    },
    {
      type: 'theory',
      title: 'Distributed transactions & the saga pattern',
      lead: 'A booking spans two databases (booking & payment). There is no single ACID transaction across services — so we use a **saga**: a sequence of local transactions with compensations.',
      diagram: { kind: 'compare', cols: [
        { t: 'Choreography', icon: '💃', tone: 'green', points: ['services react to each other\'s events', 'no central coordinator; loose coupling', 'simple for short flows (our booking)', 'flow is implicit — needs good tracing'] },
        { t: 'Orchestration', icon: '🎼', tone: 'blue', points: ['an orchestrator tells each service what to do', 'flow explicit in one place', 'better for long, branching workflows', 'orchestrator is extra infrastructure (e.g. Temporal, Camunda)'] }
      ] },
      points: [
        "Why not two-phase commit (XA)? It blocks on the slowest participant, couples availability, and Kafka/most cloud services don't take part in it.",
        "Every step needs a **compensating action**: release the nights, refund the payment, notify the guest.",
        "Sagas are **eventually consistent**: for a moment a booking is PENDING while payment is processed."
      ],
      notes: [
        "Compensation is not rollback: the payment really happened and must be refunded; the email really went out and needs a follow-up. Design compensations as business operations.",
        "We use choreography because the booking flow has two participants and a short path. If we later add fraud checks, insurance and loyalty points, an orchestrator would keep the flow understandable."
      ]
    },
    {
      type: 'theory',
      title: 'Our booking saga (choreography over Kafka)',
      lead: 'Each service does one local transaction and publishes an event; the next service reacts.',
      diagram: { kind: 'seq', actors: ['Guest', 'booking-service', 'Kafka', 'payment-service', 'notification'], msgs: [
        [0, 1, 'POST /bookings (Idempotency-Key)'],
        [1, 1, 'tx: booking PENDING + nights + outbox'],
        [1, 0, '201 Created (PENDING)', 'r'],
        [1, 2, 'booking.created (via outbox relay)'],
        [2, 3, 'booking.created'],
        [3, 3, 'charge provider (idempotency key)'],
        [3, 2, 'payment.completed | payment.failed'],
        [2, 1, 'payment.completed'],
        [1, 1, 'tx: PENDING -> CONFIRMED'],
        [2, 4, 'booking/payment events'],
        [4, 0, 'email: booking confirmed', 'r']
      ] },
      table: { head: ['Failure', 'Compensation'], rows: [
        ['payment.failed', 'booking → CANCELLED, delete booked nights'],
        ['no payment within 15 min', 'scheduler → EXPIRED, delete booked nights'],
        ['payment.completed after EXPIRED', 'publish refund request → payment-service refunds'],
        ['guest cancels a CONFIRMED booking', 'refund per policy, release nights']
      ] },
      notes: [
        "The guest gets an immediate 201 with status PENDING; the client polls `GET /bookings/{id}` (or receives a push) until CONFIRMED. This keeps the API fast and resilient to payment-provider slowness.",
        "Notice no service calls another synchronously after the initial request — failures in payment or notification can't break booking creation."
      ]
    },
    {
      type: 'theory',
      title: 'Concurrency: two guests, one apartment',
      lead: 'Two requests for overlapping nights arrive at the same millisecond. Exactly one must win.',
      diagram: { kind: 'seq', actors: ['Guest A', 'booking-service', 'MySQL', 'Guest B'], msgs: [
        [0, 1, 'book 20–24 Dec'],
        [3, 1, 'book 22–26 Dec'],
        [1, 2, 'tx A: INSERT nights 20, 21, 22, 23'],
        [1, 2, 'tx B: INSERT nights 22, 23, 24, 25'],
        [2, 2, 'B waits on night 22 (A holds it)'],
        [2, 1, 'A commits', 'r'],
        [2, 1, 'B: duplicate key (22) -> rollback', 'r'],
        [1, 0, '201 Created', 'r'],
        [1, 3, '409 Conflict: dates just taken', 'r']
      ] },
      table: { head: ['Strategy', 'How', 'Pros', 'Cons'], rows: [
        ['Pessimistic lock', '`SELECT … FOR UPDATE` on a per-property row, then overlap query + insert', 'simple to reason about', 'serialises all bookings of a property; lock waits'],
        ['Optimistic (`@Version`)', 'version on a per-property calendar row; conflicting commit retries', 'no blocking', 'retry storms on popular properties'],
        ['**Unique nights** ✅', 'PK `(property_id, night)`; insert one row per night', 'database-enforced, fine-grained, simple', 'one row per night; delete on cancel/expiry']
      ] },
      notes: [
        "All three are correct when implemented carefully; we choose unique nights because the guarantee lives in the schema — no code path (or future developer) can bypass it.",
        "The application-level overlap check is still useful: it gives a friendly early error before trying the insert, and serves availability queries."
      ]
    },
    {
      type: 'practical',
      title: 'Creating a booking: idempotent, atomic, conflict-safe',
      lead: 'One local transaction: booking row, its nights, and an outbox event — all or nothing.',
      code: { lang: 'java', file: 'BookingService.java', src: code`
        package com.example.booking;

        import com.example.booking.outbox.OutboxEvent;
        import com.example.booking.outbox.OutboxRepository;
        import com.example.booking.property.PropertyClient.PropertySummary;
        import com.example.events.BookingCreated;
        import java.math.BigDecimal;
        import java.sql.Date;
        import java.time.*;
        import java.util.List;
        import lombok.RequiredArgsConstructor;
        import org.springframework.dao.DuplicateKeyException;
        import org.springframework.jdbc.core.JdbcTemplate;
        import org.springframework.stereotype.Service;
        import org.springframework.transaction.annotation.Transactional;
        import tools.jackson.databind.json.JsonMapper;

        @Service
        @RequiredArgsConstructor
        public class BookingService {
            private final BookingRepository bookings;
            private final OutboxRepository outbox;
            private final JdbcTemplate jdbc;
            private final JsonMapper json;                    // Jackson 3, auto-configured by Boot 4
            private final Clock clock;

            /** 'property' was fetched via Feign BEFORE this transaction (never hold a tx during remote calls). */
            @Transactional
            public BookingResponse create(Long guestId, CreateBookingRequest req, String idempotencyKey,
                                          PropertySummary property) {
                var existing = bookings.findByIdempotencyKey(idempotencyKey);
                if (existing.isPresent()) return BookingResponse.from(existing.get());   // client retry -> same answer

                if (req.guests() > property.maxGuests()) throw new BusinessRuleException("too many guests");
                Stay stay = new Stay(req.checkIn(), req.checkOut());                     // validates check-out > check-in
                List<LocalDate> nights = stay.nights();
                BigDecimal total = property.pricePerNight().multiply(BigDecimal.valueOf(nights.size()));

                Booking booking = bookings.saveAndFlush(Booking.pending(req.propertyId(), guestId, property.hostId(),
                        stay, req.guests(), total, "INR", idempotencyKey, Instant.now(clock).plus(Duration.ofMinutes(15))));
                try {
                    jdbc.batchUpdate("INSERT INTO booked_nights (property_id, night, booking_id) VALUES (?, ?, ?)",
                            nights, nights.size(), (ps, night) -> {
                                ps.setLong(1, req.propertyId());
                                ps.setDate(2, Date.valueOf(night));
                                ps.setLong(3, booking.getId());
                            });
                } catch (DuplicateKeyException e) {
                    throw new ConflictException("some of these nights were just booked");   // 409, whole tx rolls back
                }
                outbox.save(OutboxEvent.of("booking.created", booking.getId().toString(),
                        json.writeValueAsString(BookingCreated.from(booking))));            // same transaction
                return BookingResponse.from(booking);
            }
        }` },
      notes: [
        "Order matters: the duplicate-key error must surface *inside* the try block, so the nights are inserted with JDBC immediately (and the booking with `saveAndFlush`). With deferred JPA flushing the violation would appear at commit time, outside our handler.",
        "JdbcTemplate participates in the same JPA transaction because both use the same DataSource — one connection, one commit.",
        "Idempotency: the unique `idempotency_key` column makes a retried POST return the original booking instead of creating a second one (two concurrent identical retries: one insert fails on the unique key → return the winner's booking)."
      ]
    },
    {
      type: 'theory',
      title: 'The dual-write problem & the transactional outbox',
      lead: 'Committing to MySQL and publishing to Kafka are two separate systems. If one succeeds and the other fails, services disagree forever.',
      diagram: { kind: 'flow', nodes: [
        { t: 'Local transaction', s: 'INSERT booking + nights + outbox row', tone: 'green' },
        { t: 'outbox_events table', s: 'unpublished rows', tone: 'yellow' },
        { t: 'Relay', s: 'poller (FOR UPDATE SKIP LOCKED) or CDC (Debezium)', tone: 'purple' },
        { t: 'Kafka topic', s: 'booking.created', tone: 'orange' },
        { t: 'Consumers', s: 'idempotent (event id)', tone: 'blue' }
      ] },
      table: { head: ['Naive approach', 'What can go wrong'], rows: [
        ['commit DB, then publish', 'crash after commit → event never sent → payment never happens'],
        ['publish, then commit DB', 'DB rollback after publish → payment for a booking that doesn\'t exist'],
        ['**outbox** ✅', 'event stored atomically with the data; published at least once by the relay']
      ] },
      notes: [
        "The outbox gives us atomicity between state change and 'intent to publish'. The relay may publish an event twice (crash between send and mark-as-published), which is fine because every consumer is idempotent (Session 20).",
        "CDC (change data capture) tools like Debezium tail the MySQL binlog and publish outbox rows without polling — an operational upgrade for high volume."
      ]
    },
    {
      type: 'practical',
      title: 'Outbox table and relay',
      lead: 'A polling relay that several instances can run safely in parallel.',
      code: [
        { lang: 'sql', file: 'V2__outbox.sql', src: code`
          CREATE TABLE outbox_events (
            id            BIGINT AUTO_INCREMENT PRIMARY KEY,
            topic         VARCHAR(100) NOT NULL,
            event_key     VARCHAR(100) NOT NULL,           -- Kafka key (bookingId) keeps per-booking order
            payload       JSON         NOT NULL,
            created_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            published_at  TIMESTAMP(6) NULL,
            INDEX idx_outbox_unpublished (published_at, id)
          );` },
        { lang: 'java', file: 'OutboxRelay.java', src: code`
          package com.example.booking.outbox;

          import java.util.List;
          import org.springframework.jdbc.core.simple.JdbcClient;
          import org.springframework.kafka.core.KafkaTemplate;
          import org.springframework.scheduling.annotation.Scheduled;
          import org.springframework.stereotype.Component;
          import org.springframework.transaction.annotation.Transactional;

          record OutboxRow(Long id, String topic, String eventKey, String payload) {}

          @Component                                   // requires @EnableScheduling on a configuration class
          public class OutboxRelay {
              private final JdbcClient jdbc;
              private final KafkaTemplate<String, String> kafka;   // payload is already JSON text

              public OutboxRelay(JdbcClient jdbc, KafkaTemplate<String, String> kafka) {
                  this.jdbc = jdbc;
                  this.kafka = kafka;
              }

              @Scheduled(fixedDelay = 500)
              @Transactional
              public void publishBatch() {
                  List<OutboxRow> batch = jdbc.sql("""
                          SELECT id, topic, event_key, payload FROM outbox_events
                          WHERE published_at IS NULL
                          ORDER BY id
                          LIMIT 100
                          FOR UPDATE SKIP LOCKED
                          """)
                      .query(OutboxRow.class)
                      .list();                         // other relay instances skip these locked rows
                  for (OutboxRow row : batch) {
                      kafka.send(row.topic(), row.eventKey(), row.payload()).join();   // wait for broker ack
                      jdbc.sql("UPDATE outbox_events SET published_at = CURRENT_TIMESTAMP(6) WHERE id = :id")
                          .param("id", row.id())
                          .update();
                  }
              }
          }` }
      ],
      notes: [
        "`FOR UPDATE SKIP LOCKED` (MySQL 8+) lets three booking-service instances run the relay concurrently without publishing the same row twice in normal operation.",
        "Consumers of JSON-text payloads set the target type, e.g. `spring.json.value.default.type`, or the relay can add type headers. Keep payload schemas backward compatible: add fields, don't rename or remove them.",
        "Housekeeping: delete published rows older than a few days with a scheduled job."
      ]
    },
    {
      type: 'practical',
      title: 'Reacting to payment events (and compensating)',
      lead: 'Booking-service listens to payment results and applies state transitions idempotently.',
      code: { lang: 'java', file: 'PaymentEventsHandler.java', src: code`
        package com.example.booking;

        import com.example.events.PaymentCompleted;
        import com.example.events.PaymentFailed;
        import lombok.RequiredArgsConstructor;
        import org.springframework.jdbc.core.simple.JdbcClient;
        import org.springframework.kafka.annotation.KafkaListener;
        import org.springframework.stereotype.Component;
        import org.springframework.transaction.annotation.Transactional;

        @Component
        @RequiredArgsConstructor
        public class PaymentEventsHandler {
            private final BookingRepository bookings;
            private final JdbcClient jdbc;
            private final RefundRequests refunds;               // writes a refund request to the outbox

            @KafkaListener(topics = "payment.completed", groupId = "booking-service")
            @Transactional
            public void completed(PaymentCompleted e) {
                Booking b = bookings.findById(e.bookingId()).orElseThrow();
                switch (b.getStatus()) {
                    case CONFIRMED -> { }                        // duplicate event: already applied
                    case PENDING -> b.transition(BookingStatus.CONFIRMED, "payment " + e.paymentId());
                    default -> refunds.request(e, "booking is " + b.getStatus());   // compensation (e.g. EXPIRED)
                }
            }

            @KafkaListener(topics = "payment.failed", groupId = "booking-service")
            @Transactional
            public void failed(PaymentFailed e) {
                Booking b = bookings.findById(e.bookingId()).orElseThrow();
                if (b.getStatus() != BookingStatus.PENDING) return;              // idempotent
                b.transition(BookingStatus.CANCELLED, "payment failed: " + e.reason());
                jdbc.sql("DELETE FROM booked_nights WHERE booking_id = :id")     // compensation: free the nights
                    .param("id", b.getId())
                    .update();
            }
        }` },
      notes: [
        "The `switch` over the current status makes every possible ordering of events safe: duplicates do nothing, late events trigger compensation.",
        "`@Version` on `Booking` protects against two handlers (say, a payment event and the expiry job) updating the same booking simultaneously: one commit wins, the other retries via the error handler and then sees the new state.",
        "Payment-service mirrors this: it consumes `booking.created`, charges the provider with idempotency key `booking-<id>` (so retries never double-charge), stores the payment, and writes `payment.completed`/`payment.failed` to its own outbox."
      ]
    },
    {
      type: 'theory',
      title: 'Microservices patterns in the project',
      lead: 'By now the Airbnb backend uses most of the classic microservices patterns — each for a concrete reason.',
      diagram: { kind: 'grid', cols: 4, items: [
        { t: 'Database per service', s: 'independent schemas', tone: 'blue' },
        { t: 'Service discovery', s: 'Eureka (S19)', tone: 'blue' },
        { t: 'Circuit breaker', s: 'Resilience4j (S20)', tone: 'red' },
        { t: 'Event-driven', s: 'Kafka topics (S20)', tone: 'orange' },
        { t: 'Saga', s: 'booking ↔ payment', tone: 'purple' },
        { t: 'Transactional outbox', s: 'reliable events', tone: 'purple' },
        { t: 'Idempotency keys', s: 'safe retries', tone: 'green' },
        { t: 'CQRS read model', s: 'search index (S21)', tone: 'yellow' },
        { t: 'API gateway', s: 'single entry (S23)', tone: 'teal' },
        { t: 'Externalised config', s: 'profiles, env vars (S23)', tone: 'teal' },
        { t: 'Correlation & tracing', s: 'request ids, traces (S24)', tone: 'gray' },
        { t: 'Health checks', s: 'liveness/readiness (S23–24)', tone: 'gray' }
      ] },
      points: [
        "Contracts: version event schemas and APIs; prefer additive changes; consider consumer-driven contract tests (Spring Cloud Contract, Pact).",
        "Each service: own repository or module, own pipeline, own database, own on-call ownership."
      ],
      notes: [
        "Ask students to map each pattern to the failure it prevents — e.g. outbox prevents lost events, idempotency prevents double charges, circuit breakers prevent cascading failures.",
        "Patterns have costs; a modular monolith needs only a few of them. That's why Splitwise didn't."
      ]
    },
    {
      type: 'lab',
      title: 'Project milestone 2: booking workflow end to end',
      lead: 'Implement the saga with Kafka, prove there are no double bookings under concurrency, and handle every failure path.',
      steps: [
        "Implement the `Booking` entity with the state machine (`ALLOWED` map, `@Version`, status history).",
        "Implement `POST /api/v1/bookings` with `Idempotency-Key`, unique booked nights and the outbox, returning 201 PENDING (409 on conflicts).",
        "Add the outbox table and `OutboxRelay`; verify `booking.created` reaches Kafka (console consumer).",
        "In payment-service, consume `booking.created`, simulate the provider (fail when amount ends in .13), store the payment and publish `payment.completed`/`payment.failed` via its outbox.",
        "In booking-service, handle payment events with the idempotent `switch`; add the expiry `@Scheduled` job.",
        "Concurrency test: fire 20 parallel requests for overlapping dates (e.g. a JUnit test with an `ExecutorService`) — assert exactly one 201 and 19 × 409.",
        "Failure drills: stop payment-service (bookings stay PENDING, then EXPIRE); replay an event twice (no double processing); deliver `payment.completed` after expiry (refund requested).",
        "Stretch: consume all events in notification-service and log 'emails'; add `POST /bookings/{id}/cancel` with the refund policy."
      ],
      notes: [
        "The concurrency test is the highlight: reuse Session 6's `CountDownLatch` start-gun pattern so all requests hit the database at once. Seeing exactly one success is deeply satisfying — and proves the schema-level guarantee.",
        "Have teams draw the saga on paper first, listing for each event: producer, consumers, idempotency mechanism and compensation."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: booking workflows',
      quiz: [
        { q: "A payment.completed event arrives for a booking that already EXPIRED. Correct reaction?", options: ['Confirm the booking anyway', 'Ignore it silently', 'Keep the booking expired and trigger a refund (compensation)', 'Delete the booking'], answer: 2,
          why: "Terminal states can't be resurrected; the money must be returned via a compensating action." },
        { q: "Why not use a two-phase commit across booking and payment databases?", options: ['MySQL can\'t do transactions', 'It couples availability, blocks on the slowest participant and isn\'t supported by Kafka/most cloud services', 'It is too fast', 'Spring forbids it'], answer: 1,
          why: "Sagas with local transactions and compensations are the standard microservices alternative." },
        { q: "What problem does the transactional outbox solve?", options: ['Slow queries', 'The dual write: DB commit and event publish can\'t be atomic otherwise', 'Authentication', 'Schema migrations'], answer: 1,
          why: "The event is stored in the same transaction as the state change, then published by a relay." },
        { q: "With `booked_nights` PK (property_id, night), two transactions insert night 22 concurrently. What happens?", options: ['Both succeed', 'One commits; the other gets a duplicate-key error and rolls back', 'MySQL merges them', 'Both fail'], answer: 1,
          why: "The second insert waits on the first's lock and then violates the primary key." },
        { q: "Why does POST /bookings accept an Idempotency-Key header?", options: ['For caching', 'So a retried request returns the original booking instead of creating a duplicate', 'For authentication', 'To choose a Kafka partition'], answer: 1,
          why: "Network retries are normal; idempotency keys make creation safe to repeat." }
      ],
      notes: [
        "Use Q1 to emphasise that 'eventual consistency' still requires *eventual correctness*: every path ends in a consistent business state."
      ]
    },
    {
      type: 'summary',
      title: 'Session 22 recap',
      points: [
        "Booking state machine: PENDING → CONFIRMED/CANCELLED/EXPIRED → COMPLETED; transitions guarded centrally.",
        "Choreography saga over Kafka: booking.created → payment.completed/failed → confirm or compensate.",
        "No double booking: unique (property_id, night) rows inside one transaction; 409 on conflict; idempotency keys for retries.",
        "Transactional outbox + relay (SKIP LOCKED / CDC) for reliable, at-least-once events; idempotent consumers.",
        "Every failure path has a compensation: release nights, refund payments, notify users."
      ],
      cards: [
        ['Saga', 'Sequence of local transactions with compensating actions instead of a distributed transaction.'],
        ['Choreography', 'Services coordinate by reacting to each other\u2019s events.'],
        ['Orchestration', 'A central coordinator directs each saga step.'],
        ['Compensating action', 'Business operation undoing a completed step (refund, release).'],
        ['Transactional outbox', 'Events stored in the same DB transaction, published later by a relay.'],
        ['Dual-write problem', 'Updating two systems without atomicity leads to inconsistency.'],
        ['SKIP LOCKED', 'SQL option to skip rows locked by other transactions (parallel workers).'],
        ['Terminal state', 'A state with no outgoing transitions (CANCELLED, EXPIRED, COMPLETED).']
      ],
      notes: [
        "Next session: one front door for all services with Spring Cloud Gateway, scalability patterns, Docker images and Compose, deployment strategies and environment configuration."
      ]
    }
  ]
});
