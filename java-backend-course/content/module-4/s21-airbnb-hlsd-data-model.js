COURSE.session({
  no: 21,
  short: 'Airbnb: HLSD & data modeling',
  title: 'Major Project — Airbnb Backend: HLSD & Data Modeling for Users, Properties & Bookings',
  covers: [3],
  objectives: [
    "Capture functional and non-functional requirements and estimate scale for a rental platform.",
    "Produce a high-level system design: services, data stores, event bus, caching and search.",
    "Model users, properties, availability, bookings and payments with database-per-service.",
    "Encode the no-double-booking rule (half-open date intervals) in code and in the schema."
  ],
  prereq: "Sessions 19–20 (service decomposition, Kafka) and Session 12 (design → schema workflow).",
  slides: [
    {
      type: 'project',
      title: 'Major project brief: an Airbnb-like rental platform',
      lead: '“Build and deploy an Airbnb-like Property Rental Platform — HLSD, data modeling for users, properties, bookings and payments, scalable microservices architecture, Spring Cloud Gateway routing, containerized deployment, monitoring, logging, and production readiness.” — brochure',
      diagram: { kind: 'flow', nodes: [
        { t: 'S21', s: 'requirements, HLSD, data model', tone: 'blue' },
        { t: 'S22', s: 'services & booking workflows (Kafka, saga)', tone: 'purple' },
        { t: 'S23', s: 'gateway, scaling, Docker, deployment', tone: 'orange' },
        { t: 'S24', s: 'monitoring, performance, production readiness', tone: 'green' }
      ] },
      points: [
        "Tech per the brochure: **Microservices, Kafka, Spring Cloud, Docker, AWS**.",
        "Everything from Modules 1–3 is reused: REST design, JPA, Flyway, tests, Redis, security, OAuth2 tokens."
      ],
      notes: [
        "Frame the next four sessions as one sprint toward a production-ready system. Each session ends with a milestone that builds on the previous one.",
        "Encourage teams of 2–3: one owner per service mirrors how real microservice teams work (Conway's law, Session 19)."
      ]
    },
    {
      type: 'theory',
      title: 'Requirements & back-of-the-envelope estimates',
      lead: 'Design starts from what users do and what the system must guarantee.',
      table: { head: ['Functional', 'Non-functional'], rows: [
        ['Hosts list properties with photos, amenities, prices, calendar', '**No double booking** — strong consistency for availability'],
        ['Guests search by city, dates, guests, price, amenities', 'Search p95 < 300 ms; read-heavy (≈ 500 reads : 1 write)'],
        ['View a property and its availability', 'Bookings & payments must be reliable and idempotent'],
        ['Book, pay, cancel (per policy), get notified', '99.9% availability; graceful degradation'],
        ['Leave reviews after completed stays', 'Secure: OAuth2 tokens, least privilege, PCI scope minimal']
      ] },
      diagram: { kind: 'grid', cols: 4, items: [
        { t: '20 M users', s: '2 M listings', tone: 'blue' },
        { t: '100 k bookings/day', s: '≈ 1.2/s avg, ~20/s peak', tone: 'purple' },
        { t: '50 M searches/day', s: '≈ 600/s avg, ~5 k/s peak', tone: 'green' },
        { t: '≈ 20 TB photos', s: '2 M × 20 × 500 KB → object storage + CDN', tone: 'orange' }
      ] },
      notes: [
        "Back-of-the-envelope math: 100,000 / 86,400 s ≈ 1.2 bookings per second; assume 10–20× at peak (holidays). Writes are modest; reads (search) dominate by orders of magnitude — so search gets its own read-optimised store and caching.",
        "Consistency requirements differ per feature: search results may lag by seconds (eventual consistency is fine), but availability at booking time must be exact. This single insight drives much of the architecture."
      ]
    },
    {
      type: 'theory',
      title: 'High-level system design (HLSD)',
      lead: 'Services own their data; synchronous calls for immediate answers; Kafka events for everything that can happen afterwards.',
      diagram: { kind: 'tiers', tiers: [
        { label: 'Clients', nodes: [{ t: 'Web', tone: 'gray' }, { t: 'iOS / Android', tone: 'gray' }, { t: 'CDN', s: 'photos, static assets', tone: 'teal' }] },
        { label: 'Edge', via: 'HTTPS + JWT', nodes: [{ t: 'API Gateway', s: 'routing, auth, rate limits (S23)', tone: 'blue' }, { t: 'Auth server', s: 'OAuth2 / OIDC (S18)', tone: 'purple' }] },
        { label: 'Services', nodes: [{ t: 'user', tone: 'green' }, { t: 'property', tone: 'green' }, { t: 'search', tone: 'green' }, { t: 'booking', tone: 'green' }, { t: 'payment', tone: 'green' }, { t: 'notification', tone: 'green' }] },
        { label: 'Kafka event bus', bus: true, nodes: ['property.updated', 'booking.created', 'payment.completed', 'payment.failed'], tone: 'orange' },
        { label: 'Data', nodes: [{ t: 'MySQL per service', tone: 'orange' }, { t: 'Redis', s: 'cache, idempotency, rate limits', tone: 'red' }, { t: 'OpenSearch', s: 'search index', tone: 'yellow' }, { t: 'S3', s: 'photos', tone: 'teal' }] }
      ] },
      points: [
        "**property-service** is the source of truth for listings; **search-service** keeps a denormalised index fed by `property.updated` events.",
        "**booking-service** owns reservations and the availability guarantee; **payment-service** talks to the payment provider.",
        "**notification-service** only consumes events — adding it never touches other services."
      ],
      notes: [
        "Walk the 'book a stay' path across the diagram: gateway → booking-service (sync check with property-service for price/capacity) → booking stored as PENDING → `booking.created` → payment-service charges → `payment.completed` → booking CONFIRMED → notification sent. Session 22 implements exactly this choreography.",
        "Why OpenSearch/Elasticsearch? Full-text relevance, faceted filters and geo queries at thousands of QPS are what search engines are built for; MySQL remains the system of record."
      ]
    },
    {
      type: 'theory',
      title: 'Service APIs at a glance',
      lead: 'A first contract per service — refined as we implement.',
      table: { head: ['Service', 'Key endpoints', 'Publishes / consumes'], rows: [
        ['user', '`POST /users`, `GET /users/{id}`, `POST /users/{id}/host-profile`', '—'],
        ['property', '`POST /properties`, `PUT /properties/{id}`, `GET /properties/{id}`, `PUT /properties/{id}/calendar`', 'publishes `property.updated`'],
        ['search', '`GET /search?city=&checkIn=&checkOut=&guests=&minPrice=&maxPrice=&page=`', 'consumes `property.updated`'],
        ['booking', '`POST /bookings` (Idempotency-Key), `GET /bookings/{id}`, `POST /bookings/{id}/cancel`', 'publishes `booking.created`; consumes `payment.*`'],
        ['payment', '`GET /payments/{bookingId}`, provider webhook', 'consumes `booking.created`; publishes `payment.completed/failed`'],
        ['notification', '—', 'consumes everything relevant']
      ] },
      notes: [
        "All endpoints sit under `/api/v1/...` behind the gateway. Mutating endpoints that a client might retry (create booking, cancel) accept an `Idempotency-Key` header (Session 15's Redis pattern, now essential).",
        "Event names follow `<entity>.<past-tense-verb>`; payloads are versioned records in a shared `events` module."
      ]
    },
    {
      type: 'theory',
      title: 'Data model: users & properties',
      lead: 'Each service has its own schema. Cross-service references are plain ids — no foreign keys across databases.',
      diagram: { kind: 'erd', entities: [
        { n: 'users', svc: 'user-service', f: ['id PK', 'email UQ', 'name', 'password_hash', 'phone', 'created_at'], tone: 'blue' },
        { n: 'user_roles', svc: 'user-service', f: ['user_id PK, FK → users', 'role PK (GUEST, HOST, ADMIN)'], tone: 'blue' },
        { n: 'properties', svc: 'property-service', f: ['id PK', 'host_id (user id, no FK)', 'title', 'city', 'lat / lng', 'max_guests', 'base_price DECIMAL(10,2)', 'currency', 'cancellation_policy', 'status', 'version'], tone: 'green' },
        { n: 'property_photos', svc: 'property-service', f: ['id PK', 'property_id FK', 'url (S3)', 'position'], tone: 'green' },
        { n: 'amenities', svc: 'property-service', f: ['id PK', 'code UQ', 'name'], tone: 'green' },
        { n: 'property_amenities', svc: 'property-service', f: ['property_id FK', 'amenity_id FK', 'PK (property_id, amenity_id)'], tone: 'green' },
        { n: 'calendar_overrides', svc: 'property-service', f: ['property_id FK', 'night DATE', 'price DECIMAL(10,2)', 'blocked BOOLEAN', 'PK (property_id, night)'], tone: 'green' }
      ], rels: ['users 1 — N user_roles', 'properties 1 — N property_photos', 'properties M — N amenities', 'properties 1 — N calendar_overrides', 'properties.host_id ⇢ users.id (by id, across services)'] },
      notes: [
        "Photos live in object storage (S3); the database stores URLs. Never store large binaries in MySQL rows.",
        "`calendar_overrides` stores only exceptions (blocked nights, special prices); the default price is `base_price`. Booked nights live in booking-service — the authority on reservations.",
        "Data duplication across services is normal: search keeps its own denormalised copy of property data, updated by events."
      ]
    },
    {
      type: 'theory',
      title: 'Data model: bookings & payments',
      lead: 'Booking-service owns reservations and enforces availability; payment-service owns money movement.',
      diagram: { kind: 'erd', entities: [
        { n: 'bookings', svc: 'booking-service', f: ['id PK', 'property_id', 'guest_id', 'host_id', 'check_in DATE', 'check_out DATE', 'guests', 'status', 'total_amount DECIMAL(12,2)', 'currency', 'idempotency_key UQ', 'expires_at', 'version'], tone: 'purple' },
        { n: 'booked_nights', svc: 'booking-service', f: ['property_id PK', 'night DATE PK', 'booking_id FK → bookings'], tone: 'purple' },
        { n: 'booking_status_history', svc: 'booking-service', f: ['id PK', 'booking_id FK', 'from_status', 'to_status', 'changed_at', 'reason'], tone: 'purple' },
        { n: 'payments', svc: 'payment-service', f: ['id PK', 'booking_id UQ', 'amount DECIMAL(12,2)', 'currency', 'status', 'provider_ref', 'idempotency_key UQ', 'created_at'], tone: 'orange' },
        { n: 'refunds', svc: 'payment-service', f: ['id PK', 'payment_id FK', 'amount', 'reason', 'created_at'], tone: 'orange' }
      ], rels: ['bookings 1 — N booked_nights', 'bookings 1 — N booking_status_history', 'payments 1 — N refunds', 'payments.booking_id ⇢ bookings.id (by id, across services)'] },
      points: [
        "`booked_nights` has one row per occupied night with **PRIMARY KEY (property_id, night)** — the database itself refuses a second booking of the same night.",
        "Status history gives an audit trail of the booking state machine (Session 22)."
      ],
      notes: [
        "This mirrors Splitwise's `expense_splits` idea: store the resolved facts (each night) rather than only a range, so integrity rules become simple key constraints.",
        "Payment-service never stores card numbers: a provider (Stripe, Razorpay…) tokenises cards, keeping us out of most PCI-DSS scope."
      ]
    },
    {
      type: 'theory',
      title: 'The no-double-booking rule',
      lead: 'Stays are **half-open intervals** `[check-in, check-out)`: the guest leaves on the check-out morning, so that night is free for the next guest.',
      code: { lang: 'java', file: 'BookingOverlap.java', src: code`
        import java.time.LocalDate;
        import java.util.List;

        public class BookingOverlap {
            /** Half-open stay [checkIn, checkOut). */
            record Stay(String guest, LocalDate checkIn, LocalDate checkOut) {
                Stay {
                    if (!checkOut.isAfter(checkIn)) throw new IllegalArgumentException("check-out must be after check-in");
                }
                boolean overlaps(Stay other) {                 // a.in < b.out AND a.out > b.in
                    return checkIn.isBefore(other.checkOut) && checkOut.isAfter(other.checkIn);
                }
                List<LocalDate> nights() { return checkIn.datesUntil(checkOut).toList(); }
            }

            public static void main(String[] args) {
                Stay existing = new Stay("asha", LocalDate.of(2026, 12, 20), LocalDate.of(2026, 12, 24));
                List<Stay> requests = List.of(
                        new Stay("ravi", LocalDate.of(2026, 12, 24), LocalDate.of(2026, 12, 27)),   // starts on asha's check-out day
                        new Stay("meera", LocalDate.of(2026, 12, 18), LocalDate.of(2026, 12, 21)),  // overlaps asha's first night
                        new Stay("zoya", LocalDate.of(2026, 12, 21), LocalDate.of(2026, 12, 22)),   // inside asha's stay
                        new Stay("dev", LocalDate.of(2026, 12, 15), LocalDate.of(2026, 12, 20)));   // ends on asha's check-in day
                System.out.println("asha nights: " + existing.nights());
                for (Stay r : requests) {
                    System.out.printf("%-5s %s -> %s : %s%n", r.guest(), r.checkIn(), r.checkOut(),
                            r.overlaps(existing) ? "CONFLICT" : "ok");
                }
                try {
                    new Stay("bad", LocalDate.of(2026, 12, 25), LocalDate.of(2026, 12, 25));
                } catch (IllegalArgumentException e) {
                    System.out.println("rejected: " + e.getMessage());
                }
            }
        }`, out: code`
        asha nights: [2026-12-20, 2026-12-21, 2026-12-22, 2026-12-23]
        ravi  2026-12-24 -> 2026-12-27 : ok
        meera 2026-12-18 -> 2026-12-21 : CONFLICT
        zoya  2026-12-21 -> 2026-12-22 : CONFLICT
        dev   2026-12-15 -> 2026-12-20 : ok
        rejected: check-out must be after check-in` },
      table: { head: ['Layer', 'Enforcement'], rows: [
        ['Domain', '`overlaps()` check with half-open intervals'],
        ['SQL query', '`WHERE property_id = ? AND check_in < :newCheckOut AND check_out > :newCheckIn AND status IN (PENDING, CONFIRMED)`'],
        ['Schema', '`booked_nights` PK `(property_id, night)` — concurrent inserts of the same night fail'],
        ['Concurrency', 'compared in Session 22: row lock vs `@Version` vs unique nights']
      ] },
      notes: [
        "The edge cases are the whole point: ravi checking in on asha's check-out day and dev checking out on asha's check-in day are both fine. Off-by-one errors here mean either double bookings or wrongly rejected guests.",
        "`LocalDate.datesUntil(end)` (Java 9+) excludes the end date — exactly the half-open semantics we need to generate `booked_nights` rows.",
        "Keep this test in the booking-service suite; it's the most important unit test of the project."
      ]
    },
    {
      type: 'practical',
      title: 'Schemas as Flyway migrations',
      lead: 'property-service and booking-service each get their own database and migrations.',
      code: [
        { lang: 'sql', file: 'property-service: V1__properties.sql', src: code`
          CREATE TABLE properties (
            id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
            host_id              BIGINT        NOT NULL,          -- user id from user-service (no cross-DB FK)
            title                VARCHAR(150)  NOT NULL,
            description          TEXT,
            city                 VARCHAR(80)   NOT NULL,
            country              CHAR(2)       NOT NULL,
            latitude             DECIMAL(9,6),
            longitude            DECIMAL(9,6),
            max_guests           SMALLINT      NOT NULL,
            bedrooms             SMALLINT      NOT NULL,
            base_price           DECIMAL(10,2) NOT NULL,
            currency             CHAR(3)       NOT NULL DEFAULT 'INR',
            cancellation_policy  VARCHAR(10)   NOT NULL,         -- FLEXIBLE | MODERATE | STRICT
            status               VARCHAR(10)   NOT NULL DEFAULT 'DRAFT',
            created_at           TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            version              BIGINT        NOT NULL DEFAULT 0,
            CONSTRAINT chk_guests CHECK (max_guests > 0),
            CONSTRAINT chk_price  CHECK (base_price > 0),
            INDEX idx_properties_city (city, status)
          );

          CREATE TABLE calendar_overrides (
            property_id  BIGINT        NOT NULL,
            night        DATE          NOT NULL,
            price        DECIMAL(10,2) NULL,
            blocked      BOOLEAN       NOT NULL DEFAULT FALSE,
            PRIMARY KEY (property_id, night),
            CONSTRAINT fk_calendar_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
          );` },
        { lang: 'sql', file: 'booking-service: V1__bookings.sql', src: code`
          CREATE TABLE bookings (
            id               BIGINT AUTO_INCREMENT PRIMARY KEY,
            property_id      BIGINT        NOT NULL,
            guest_id         BIGINT        NOT NULL,
            host_id          BIGINT        NOT NULL,
            check_in         DATE          NOT NULL,
            check_out        DATE          NOT NULL,
            guests           SMALLINT      NOT NULL,
            status           VARCHAR(12)   NOT NULL,           -- PENDING | CONFIRMED | CANCELLED | EXPIRED | COMPLETED
            total_amount     DECIMAL(12,2) NOT NULL,
            currency         CHAR(3)       NOT NULL,
            idempotency_key  VARCHAR(64)   NOT NULL,
            created_at       TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            expires_at       TIMESTAMP(6)  NULL,               -- PENDING bookings expire if unpaid
            version          BIGINT        NOT NULL DEFAULT 0,
            CONSTRAINT uq_booking_idempotency UNIQUE (idempotency_key),
            CONSTRAINT chk_dates CHECK (check_out > check_in),
            INDEX idx_bookings_property_dates (property_id, check_in, check_out),
            INDEX idx_bookings_guest (guest_id, created_at)
          );

          CREATE TABLE booked_nights (
            property_id  BIGINT NOT NULL,
            night        DATE   NOT NULL,
            booking_id   BIGINT NOT NULL,
            PRIMARY KEY (property_id, night),                  -- one booking per property per night
            CONSTRAINT fk_nights_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE
          );` }
      ],
      notes: [
        "`idx_bookings_property_dates` serves the overlap query; `booked_nights`' primary key serves the integrity check. When a booking is cancelled or expires, its `booked_nights` rows are deleted, freeing the nights.",
        "Each service's Flyway history is independent — services evolve their schemas without coordinating releases.",
        "In local development all service databases can live in one MySQL container as separate schemas; in production each service gets its own instance or cluster."
      ]
    },
    {
      type: 'theory',
      title: 'Search: a read model fed by events',
      lead: 'Search reads must be fast and filterable; they can tolerate a few seconds of staleness. Booking can\'t — so it re-checks.',
      diagram: { kind: 'flow', nodes: [
        { t: 'Host updates listing', s: 'property-service (MySQL)', tone: 'green' },
        { t: 'property.updated', s: 'Kafka event', tone: 'orange' },
        { t: 'search-service', s: 'updates the index', tone: 'yellow' },
        { t: 'OpenSearch', s: 'full-text, filters, geo', tone: 'yellow' },
        { t: 'Guest search', s: 'p95 < 300 ms, Redis for hot queries', tone: 'blue' }
      ] },
      points: [
        "This is **CQRS** (Command Query Responsibility Segregation): writes go to the system of record, reads to an optimised model.",
        "Availability in search results is a *hint*; the authoritative check happens in booking-service at booking time.",
        "Cache popular queries ('Goa, this weekend, 2 guests') in Redis for a short TTL."
      ],
      notes: [
        "For the project, a simpler first version is fine: search directly in property-service with indexed MySQL queries and pagination. Introduce the event-fed search-service as a stretch goal — the event already exists.",
        "Eventual consistency explained to users: a listing edited a second ago may show its old price in search, but the booking page always shows the authoritative price."
      ]
    },
    {
      type: 'lab',
      title: 'Project milestone 1: Airbnb foundations',
      lead: 'Skeleton services, schemas, and the most important rule — tested.',
      steps: [
        "Create a repository with `user-service`, `property-service`, `booking-service`, `payment-service` (Spring Boot 4.1, Java 21) and a shared `events` module.",
        "Add Flyway migrations per service (schemas from today's slides) and a local MySQL with one schema per service.",
        "Implement property CRUD for hosts and `GET /api/v1/properties/search?city=&guests=&page=` with indexed queries and paging.",
        "Implement `GET /api/v1/properties/{id}/availability?checkIn=&checkOut=` using `calendar_overrides` (blocked nights) and a price quote.",
        "In booking-service implement the `Stay.overlaps()` rule and the overlap SQL query; unit-test all edge cases from the slide.",
        "Document the HLSD diagram, service API table and ERDs in the README.",
        "Register services with Eureka (Session 19) and call property availability from booking-service with Feign + timeouts.",
        "Stretch: emit `property.updated` events and build a minimal search-service consuming them."
      ],
      notes: [
        "Keep scope tight: the aim is a coherent skeleton with correct data rules. Workflows (payments, saga) come next session.",
        "Review each team's ERDs before they code: check cross-service references are ids only, money columns are DECIMAL, and nights are half-open."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: Airbnb HLSD & data model',
      quiz: [
        { q: "Booking A is 20–24 Dec (check-out 24th). Can booking B check in on 24 Dec?", options: ['No, it overlaps', 'Yes — stays are half-open intervals [check-in, check-out)', 'Only if A is cancelled', 'Only for 1 night'], answer: 1,
          why: "The night of the 24th isn't part of A; A's guest leaves that morning." },
        { q: "How does `booked_nights` with PRIMARY KEY (property_id, night) prevent double bookings?", options: ['It slows inserts down', 'A second insert of the same property-night violates the key and fails', 'It locks the whole table', 'It deletes old bookings'], answer: 1,
          why: "The database enforces uniqueness even under concurrent transactions." },
        { q: "Why may search results be eventually consistent but booking may not?", options: ['Search is less important', 'Search can tolerate brief staleness; booking must re-check authoritative availability', 'Booking uses Redis', 'Search never changes'], answer: 1,
          why: "Different consistency requirements per feature: hints vs guarantees." },
        { q: "In database-per-service, how does property-service reference a host?", options: ['Foreign key to user-service\'s table', 'By storing the host\'s user id (no cross-database FK)', 'By copying the whole users table', 'It doesn\'t'], answer: 1,
          why: "Services reference each other's entities by id; integrity across services is handled by APIs and events." },
        { q: "≈100,000 bookings/day is on average about…", options: ['1 per second', '100 per second', '1,000 per second', '0.01 per second'], answer: 0,
          why: "100,000 / 86,400 s ≈ 1.2/s; plan for 10–20× at peak." }
      ],
      notes: [
        "Q5 is a reminder that most systems' write loads are smaller than people fear — the hard parts are correctness under concurrency and read scalability."
      ]
    },
    {
      type: 'summary',
      title: 'Session 21 recap',
      points: [
        "Requirements and estimates drive design: read-heavy search, low-volume but critical bookings.",
        "HLSD: gateway, six services, MySQL per service, Redis, OpenSearch, S3/CDN, Kafka event bus.",
        "Data model: properties + calendar overrides; bookings + booked_nights + status history; payments + refunds; ids across services.",
        "No double booking: half-open intervals, overlap query, and a primary key on (property_id, night).",
        "Search is a CQRS read model fed by events; booking re-checks authoritative availability."
      ],
      cards: [
        ['HLSD', 'High-level system design: services, stores, flows and scaling choices.'],
        ['Half-open interval', '[check-in, check-out): check-out day is not a booked night.'],
        ['booked_nights', 'One row per occupied night; PK (property_id, night) prevents double booking.'],
        ['Back-of-envelope', 'Quick capacity estimate from daily volumes to per-second rates.'],
        ['CQRS', 'Separate models for writes (commands) and reads (queries).'],
        ['Read model', 'Denormalised, query-optimised copy of data (e.g. a search index).'],
        ['Database per service', 'No cross-service foreign keys; reference by id.'],
        ['PCI scope', 'Avoid storing card data by using a payment provider\u2019s tokens.']
      ],
      notes: [
        "Next session: implement the microservices and the booking workflow — the booking state machine, a Kafka choreography saga with payments, the outbox pattern and idempotent consumers."
      ]
    }
  ]
});
