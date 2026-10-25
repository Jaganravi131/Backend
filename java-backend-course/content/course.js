/*
 * Course definition — the single source of truth for the syllabus.
 *
 * Everything in BROCHURE is copied verbatim from the GeeksforGeeks
 * "Java Backend Development Course With IBM Certification" brochure
 * (9 pages, 24 sessions, 4 modules, 3 projects).
 *
 * Session files (content/module-N/sXX-*.js) register themselves with
 * COURSE.session({...}). Each session declares which brochure topics it
 * covers via `covers: [topicIndex, ...]`, which lets the Syllabus page and
 * tools/validate.mjs prove that every brochure topic is taught.
 */
(function (root) {
  'use strict';

  /* ---------- `code` template tag -------------------------------------
   * Raw (backslashes kept as typed) + dedented. Inside a code block write
   * \${ for a literal ${ and \` for a literal backtick.                    */
  function code(strings) {
    if (arguments.length > 1) {
      throw new Error('Unescaped ${ inside a code block. Write \\${ instead.');
    }
    var s = strings.raw.join('').replace(/\\(\$\{|`)/g, '$1');
    s = s.replace(/^[ \t]*\n/, '').replace(/\n[ \t]*$/, '');
    var lines = s.split('\n');
    var min = Infinity;
    lines.forEach(function (l) {
      if (l.trim()) min = Math.min(min, l.match(/^[ \t]*/)[0].length);
    });
    if (!isFinite(min)) min = 0;
    return lines.map(function (l) { return l.slice(min); }).join('\n');
  }

  var BROCHURE = {
    title: 'Java Backend Development Course With IBM Certification',
    provider: 'GeeksforGeeks',
    headline: 'Become an industry-ready Java Backend Developer from the ground up.',
    summary: 'An industry-focused program designed to build strong backend engineering skills using Java and the Spring ecosystem. Covers core and Advanced Java, REST API Development, Databases, Security, Caching, Microservices, Messaging, and Cloud-ready Deployment practices.',
    highlights: ['4.8 Rating', '1:1 Mentorship', '24/7 AI Support', 'Dedicated doubt-clearing sessions', '24 Sessions'],
    journeyIntro: 'We don\u2019t just teach Java syntax. We take you from core programming fundamentals to building scalable backend systems and production-grade APIs \u2014 with real-world architecture and system design concepts built in.',
    journey: [
      { icon: '\u{1F5C2}\uFE0F', title: 'Industry-Ready Java Backend', text: 'Master everything from Core Java and OOPs to advanced backend development. Build scalable REST APIs with Spring Boot, work with databases, and understand real-world backend architecture and security practices.' },
      { icon: '\u2615', title: 'Deep Java Fundamentals', text: 'Master multithreading, collections, JVM internals, exception handling, streams, and memory management. Go far beyond the basics of Java programming.' },
      { icon: '\u{1F343}', title: 'Spring Boot Ecosystem', text: 'Build production-ready backend applications using Spring Boot, Hibernate, JPA, Microservices, and industry-standard backend development practices.' },
      { icon: '\u{1F5C4}\uFE0F', title: 'Database & System Design', text: 'Learn SQL, database optimization, caching, load balancing, authentication, and scalable backend system design used in modern tech products.' },
      { icon: '\u2601\uFE0F', title: 'Deploy & Scale', text: 'Deploy Java backend applications using Docker, AWS, CI/CD pipelines, and cloud platforms while learning monitoring, scaling, and performance optimization.' },
      { icon: '\u{1F680}', title: 'Microservices & Messaging', text: 'Design, build, and deploy production-grade microservices using Kafka, Spring Cloud, and circuit breaker patterns for resilient, scalable systems.' }
    ],
    skills: [
      'OOPs Concepts & Core Java', 'Exception Handling & Multithreading',
      'Functional Programming with Java 8', 'JDBC & Database Connectivity',
      'Collections Framework & Stream API', 'Backend System Design Fundamentals',
      'REST API Development', 'Microservices Architecture'
    ],
    techStack: [
      { name: 'Java', icon: '\u2615' }, { name: 'Spring Framework', icon: '\u{1F343}' },
      { name: 'Spring Boot', icon: '\u23FB' }, { name: 'MySQL', icon: '\u{1F42C}' },
      { name: 'Kafka', icon: '\u{1F4E8}' }, { name: 'Git & GitHub', icon: '\u{1F500}' },
      { name: 'OAuth2', icon: '\u{1F511}' }, { name: 'Redis', icon: '\u26A1' },
      { name: 'Multithreading', icon: '\u{1F9F5}' }
    ],
    techNote: 'Focusing strictly on tools that have proven their practical utility beyond the 6-month hype cycle.',
    curriculumIntro: '24 intensive sessions structured in a cohesive, backend-focused learning model designed to transform you into an industry-ready Java Backend Engineer.'
  };

  var MODULES = [
    {
      no: 1, id: 'm1', color: '#c9c43d', sessions: [1, 6],
      title: 'Core Java & OOP Fundamentals',
      blurb: 'Build a rock-solid Java foundation covering everything from JVM internals and OOP principles to concurrency and build tools.',
      topics: [
        'Java architecture, JVM internals & core OOP principles',
        'Abstract classes, interfaces & exception hierarchy',
        'Singleton design pattern & exception propagation',
        'Lambda expressions & functional interfaces',
        'Collections framework, Queues & Generics',
        'Streams API, HashMap & hashing algorithms',
        'Multithreading, thread pools & synchronization',
        'ExecutorService, Maven POM.xml & lifecycle management'
      ],
      project: null
    },
    {
      no: 2, id: 'm2', color: '#3d9bd1', sessions: [7, 12],
      title: 'Spring Boot, REST & Databases',
      blurb: 'Build production-ready APIs, connect to real databases, and launch your first backend project \u2014 a Splitwise-style expense sharing application.',
      topics: [
        'Maven plugins, archetypes & project setup',
        'Spring MVC architecture & HTTP methods',
        'RESTful API design & implementation',
        'AOP, cross-cutting concerns & Lombok integration',
        'JDBC, DDL/DML & Spring JDBC Template',
        'CRUD operations & RowMapper',
        'Hibernate, Spring Data JPA & entity relationships',
        'Minor Project: Splitwise Backend (Part 1) \u2014 architecture & schema design'
      ],
      project: 'Minor Project: Splitwise Backend \u2014 Environment setup, technical architecture & data modeling'
    },
    {
      no: 3, id: 'm3', color: '#8b6cf0', sessions: [13, 18],
      title: 'Testing, Security & Microservices Intro',
      blurb: 'Harden your backend with unit testing, Redis caching, Spring Security, and OAuth2 \u2014 then enhance the Splitwise project with all these capabilities.',
      topics: [
        'Splitwise Backend (Part 2): expense flows & group management',
        'JUnit 5 & Mockito \u2014 service & controller layer testing',
        'MockMvc for REST API testing',
        'Redis: cache vs cookie, server vs browser cache',
        'Spring Security \u2014 authentication vs authorization',
        'Database-based user authentication',
        'Splitwise with Cursor AI: JUnit + Redis + Security integration',
        'OAuth 2.0 workflow, scopes & GitHub OAuth2 with Spring Boot'
      ],
      project: 'Minor Project: Splitwise Backend Advanced \u2014 Redis caching, Spring Security & AI-assisted coding with Cursor Agents'
    },
    {
      no: 4, id: 'm4', color: '#e0773a', sessions: [19, 24],
      title: 'Microservices, Messaging & Major Project',
      blurb: 'Go from microservices fundamentals to deploying a full-scale Airbnb-like property rental platform \u2014 end-to-end production deployment included.',
      topics: [
        'Monolith vs microservices & Feign Client inter-service communication',
        'Message queues, Kafka integration with Spring Boot',
        'Spring Cloud & Hystrix circuit breaker',
        'Airbnb Backend: HLSD, data modeling for users, properties & bookings',
        'Microservices architecture & booking management workflows',
        'Spring Cloud Gateway routing & scalability patterns',
        'Containerization, deployment strategy & environment configuration',
        'Monitoring, logging, performance optimization & production readiness'
      ],
      project: 'Major Project: Airbnb Backend System \u2014 Build & deploy a production-ready property rental platform across Sessions 21-24'
    }
  ];

  var PROJECTS = [
    {
      id: 'splitwise', kind: 'Minor Project', when: 'Sessions 12-13', sessions: [12, 13],
      title: 'Splitwise Backend', color: '#a26bf5',
      text: 'Build a Splitwise-like Expense Sharing Application from the ground up \u2014 project environment setup, technical architecture design, project flowchart, expense creation and settlement flows, user and group management features, HLSD, and data modeling concepts.',
      tags: ['Spring Boot', 'MySQL', 'Hibernate', 'REST API']
    },
    {
      id: 'splitwise-ai', kind: 'Minor Project', when: 'Session 17', sessions: [17],
      title: 'Splitwise with Cursor AI Agents', color: '#6f8cff',
      text: 'Enhance the Splitwise backend with advanced capabilities \u2014 integrate JUnit testing and Redis caching, add Spring Security with role-based access, implement advanced validations, and use AI Agents in Cursor to automate repetitive backend code tasks.',
      tags: ['JUnit & Mockito', 'Redis', 'Spring Security', 'Cursor AI']
    },
    {
      id: 'airbnb', kind: 'Major Project', when: 'Sessions 21-24', sessions: [21, 22, 23, 24],
      title: 'Airbnb Backend System', color: '#f08a3c',
      text: 'Build and deploy an Airbnb-like Property Rental Platform \u2014 HLSD, data modeling for users, properties, bookings and payments, scalable microservices architecture, Spring Cloud Gateway routing, containerized deployment, monitoring, logging, and production readiness.',
      tags: ['Microservices', 'Kafka', 'Spring Cloud', 'Docker', 'AWS']
    }
  ];

  /* Versions used in all code samples (verified October 2026). */
  var STACK = {
    java: 'Java 21 LTS (Java 25 LTS also works)',
    boot: 'Spring Boot 4.1.x (Spring Framework 7)',
    cloud: 'Spring Cloud 2025.1.x "Oakwood"',
    build: 'Maven 3.9 / 3.10 (via the ./mvnw wrapper)',
    db: 'MySQL 8.4 LTS',
    redis: 'Redis 7',
    kafka: 'Apache Kafka 4.x (KRaft mode, no ZooKeeper)',
    verified: 'October 2026'
  };

  var TYPES = {
    theory:    { label: 'Theory',    icon: '\u{1F4D8}' },
    practical: { label: 'Practical', icon: '\u{1F4BB}' },
    lab:       { label: 'Hands-on Lab', icon: '\u{1F9EA}' },
    quiz:      { label: 'Quiz',      icon: '\u2753' },
    summary:   { label: 'Summary',   icon: '\u2B50' },
    project:   { label: 'Project',   icon: '\u{1F3D7}\uFE0F' }
  };

  var sessions = [];

  var COURSE = {
    brochure: BROCHURE,
    modules: MODULES,
    projects: PROJECTS,
    stack: STACK,
    types: TYPES,
    sessions: sessions,
    code: code,
    session: function (s) {
      if (sessions.some(function (x) { return x.no === s.no; })) {
        throw new Error('Session ' + s.no + ' registered twice');
      }
      s.id = 's' + s.no;
      sessions.push(s);
      sessions.sort(function (a, b) { return a.no - b.no; });
      return s;
    },
    moduleOf: function (no) {
      return MODULES.filter(function (m) { return no >= m.sessions[0] && no <= m.sessions[1]; })[0];
    }
  };

  root.COURSE = COURSE;
  root.code = code;
})(typeof window !== 'undefined' ? window : globalThis);
