COURSE.session({
  no: 16,
  short: 'Spring Security & DB authentication',
  title: 'Spring Security — Authentication vs Authorization & Database-Based User Authentication',
  covers: [4, 5],
  objectives: [
    "Distinguish authentication from authorization, 401 from 403, roles from permissions.",
    "Explain Spring Security's filter chain, AuthenticationManager, UserDetailsService and SecurityContext.",
    "Authenticate users stored in MySQL with BCrypt-hashed passwords via a custom `UserDetailsService`.",
    "Authorize with URL rules and method security (`@PreAuthorize`) including domain-level checks — and test it."
  ],
  prereq: "Sessions 8–9 (filters, AOP proxies) and Session 12 (the users table).",
  slides: [
    {
      type: 'theory',
      title: 'Authentication vs authorization',
      lead: '**Authentication** answers *who are you?* **Authorization** answers *what are you allowed to do?* Authentication always comes first.',
      diagram: { kind: 'compare', cols: [
        { t: 'Authentication (AuthN)', icon: '🪪', tone: 'blue', points: ['verify identity: password, token, OAuth login, certificate', 'result: an authenticated *principal*', 'failure → **401 Unauthorized** (really: unauthenticated)'] },
        { t: 'Authorization (AuthZ)', icon: '🛂', tone: 'purple', points: ['decide access: role, permission, ownership, group membership', 'URL rules and method rules', 'failure → **403 Forbidden**'] }
      ] },
      table: { head: ['Term', 'Splitwise example'], rows: [
        ['Principal', 'the logged-in user asha@example.com (id 1)'],
        ['Credentials', 'password, bearer token'],
        ['Authority / role', '`ROLE_USER`, `ROLE_ADMIN` (app-wide)'],
        ['Domain permission', '“is ADMIN *of group 7*” (stored in `group_members.role`)']
      ] },
      notes: [
        "Analogy: at an airport, showing your passport is authentication; your boarding pass deciding which gate and seat you may access is authorization.",
        "Notice two kinds of roles in Splitwise: global roles (platform admin) and per-group roles (group admin). URL rules handle the first; method security with domain checks handles the second."
      ]
    },
    {
      type: 'theory',
      title: 'Spring Security architecture',
      lead: 'Security is a chain of **servlet filters** in front of the DispatcherServlet. Each request is authenticated, then authorized, before your controller runs.',
      diagram: { kind: 'flow', dir: 'v', nodes: [
        { t: 'HTTP request', tone: 'gray' },
        { t: 'FilterChainProxy → SecurityFilterChain', s: 'CORS → CSRF → authentication filters (Basic / Bearer / OAuth2 login) → ExceptionTranslation → AuthorizationFilter', tone: 'red' },
        { t: 'AuthenticationManager (ProviderManager)', s: 'DaoAuthenticationProvider: UserDetailsService + PasswordEncoder', tone: 'purple' },
        { t: 'SecurityContextHolder', s: 'stores the Authentication for this request (thread-bound)', tone: 'yellow' },
        { t: 'DispatcherServlet → controller → @PreAuthorize service', s: 'method security via AOP proxy', tone: 'green' }
      ] },
      points: [
        "Add `spring-boot-starter-security` and **everything** is secured by default (generated password in the log).",
        "You customise behaviour by declaring a `SecurityFilterChain` bean with the **lambda DSL**.",
        "Failures become `AuthenticationException` (→ 401 via an *entry point*) or `AccessDeniedException` (→ 403 via an *access-denied handler*)."
      ],
      notes: [
        "This builds directly on Session 8: Spring Security registers one servlet filter (`DelegatingFilterProxy` → `FilterChainProxy`) that runs its own internal chain of security filters.",
        "`SecurityContextHolder` uses a ThreadLocal by default — the current user is available anywhere on the request thread (`SecurityContextHolder.getContext().getAuthentication()`), which is how `@PreAuthorize` and `@AuthenticationPrincipal` find it."
      ]
    },
    {
      type: 'practical',
      title: 'Configuring the SecurityFilterChain',
      lead: 'Public registration and health, admin-only admin API, everything else authenticated — stateless, with JSON error bodies.',
      code: [
        { lang: 'java', file: 'SecurityConfig.java', src: code`
          package com.example.splitwise.security;

          import org.springframework.context.annotation.Bean;
          import org.springframework.context.annotation.Configuration;
          import org.springframework.http.HttpMethod;
          import org.springframework.security.config.Customizer;
          import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
          import org.springframework.security.config.annotation.web.builders.HttpSecurity;
          import org.springframework.security.config.http.SessionCreationPolicy;
          import org.springframework.security.crypto.factory.PasswordEncoderFactories;
          import org.springframework.security.crypto.password.PasswordEncoder;
          import org.springframework.security.web.SecurityFilterChain;

          @Configuration
          @EnableMethodSecurity                                   // turns on @PreAuthorize
          public class SecurityConfig {

              @Bean
              SecurityFilterChain api(HttpSecurity http, ProblemJsonHandlers problems) throws Exception {
                  http
                      .authorizeHttpRequests(auth -> auth
                          .requestMatchers(HttpMethod.POST, "/api/v1/auth/register").permitAll()
                          .requestMatchers("/actuator/health/**").permitAll()
                          .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                          .anyRequest().authenticated())
                      .httpBasic(basic -> basic.authenticationEntryPoint(problems))
                      .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                      .csrf(csrf -> csrf.disable())                // no cookies -> no CSRF attack surface
                      .cors(Customizer.withDefaults())
                      .exceptionHandling(ex -> ex
                          .authenticationEntryPoint(problems)       // 401 as problem+json
                          .accessDeniedHandler(problems));          // 403 as problem+json
                  return http.build();
              }

              @Bean
              PasswordEncoder passwordEncoder() {
                  return PasswordEncoderFactories.createDelegatingPasswordEncoder();   // {bcrypt} by default
              }
          }` },
        { lang: 'java', file: 'ProblemJsonHandlers.java', src: code`
          package com.example.splitwise.security;

          import jakarta.servlet.http.HttpServletRequest;
          import jakarta.servlet.http.HttpServletResponse;
          import java.io.IOException;
          import org.springframework.http.MediaType;
          import org.springframework.security.access.AccessDeniedException;
          import org.springframework.security.core.AuthenticationException;
          import org.springframework.security.web.AuthenticationEntryPoint;
          import org.springframework.security.web.access.AccessDeniedHandler;
          import org.springframework.stereotype.Component;

          @Component
          public class ProblemJsonHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

              @Override   // not authenticated -> 401
              public void commence(HttpServletRequest req, HttpServletResponse res, AuthenticationException ex)
                      throws IOException {
                  res.setHeader("WWW-Authenticate", "Basic realm=\"splitwise\"");
                  write(res, 401, "Unauthorized", "Authentication required", req.getRequestURI());
              }

              @Override   // authenticated but not allowed -> 403
              public void handle(HttpServletRequest req, HttpServletResponse res, AccessDeniedException ex)
                      throws IOException {
                  write(res, 403, "Forbidden", "You are not allowed to perform this action", req.getRequestURI());
              }

              private void write(HttpServletResponse res, int status, String title, String detail, String path)
                      throws IOException {
                  res.setStatus(status);
                  res.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                  res.getWriter().write("""
                      {"type":"about:blank","title":"%s","status":%d,"detail":"%s","instance":"%s"}"""
                      .formatted(title, status, detail, path));
              }
          }` }
      ],
      notes: [
        "Rules are evaluated top to bottom; put specific matchers first and `anyRequest()` last.",
        "CSRF protection matters when the browser automatically attaches credentials (session cookies). A stateless API that requires an `Authorization` header on every request isn't vulnerable in the same way, so disabling CSRF is standard there — keep it enabled for cookie-based sessions and server-rendered forms.",
        "The removed `WebSecurityConfigurerAdapter`, `antMatchers` and `.and()` chaining from old tutorials don't exist in Spring Security 7 — always use this bean + lambda style."
      ]
    },
    {
      type: 'theory',
      title: 'Storing passwords safely',
      lead: 'Never store passwords — store a **slow, salted, adaptive hash** of them, so a stolen database doesn\'t reveal the passwords.',
      table: { head: ['Approach', 'Verdict', 'Why'], rows: [
        ['Plain text / encryption', '❌', 'one leak exposes every password'],
        ['MD5 / SHA-256 (unsalted, fast)', '❌', 'rainbow tables; billions of guesses per second on GPUs'],
        ['**BCrypt** (cost 10–12)', '✅', 'salted, deliberately slow, tunable cost'],
        ['**Argon2id**, scrypt, PBKDF2', '✅', 'memory-hard / standardised alternatives']
      ] },
      code: { lang: 'text', label: 'Anatomy of a stored hash', src: code`
        {bcrypt}$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
        └──┬───┘└┬┘└┬┘└──────────┬─────────┘└──────────────┬──────────────┘
           │     │  │            │                         └─ hash (31 chars)
           │     │  │            └─ random salt (22 chars), different for every user
           │     │  └─ cost 10 = 2^10 rounds (~100 ms per check)
           │     └─ BCrypt version
           └─ algorithm id used by DelegatingPasswordEncoder (allows future upgrades)` },
      points: [
        "`encoder.encode(raw)` creates a new random salt each time; `encoder.matches(raw, stored)` verifies.",
        "`DelegatingPasswordEncoder` reads the `{id}` prefix, so you can migrate algorithms without forcing resets.",
        "BCrypt only considers the first 72 bytes of a password — enforce a sensible maximum length."
      ],
      notes: [
        "Encoding the same password twice yields two different strings because of the salt — that's why you must use `matches`, never compare hashes with `equals`.",
        "Slowness is the feature: ~100 ms is invisible to a user logging in but makes brute-forcing a leaked database impractically expensive. Re-tune the cost factor as hardware gets faster.",
        "Connection to Session 5: this is the 'password hashing' row of the hashing table — the opposite design goal from HashMap's fast hash functions."
      ]
    },
    {
      type: 'practical',
      title: 'Database-based authentication with a custom UserDetailsService',
      lead: 'Spring Security asks one question — *load the user called X* — and does the password check itself.',
      code: [
        { lang: 'sql', file: 'db/migration/V2__security.sql', src: code`
          CREATE TABLE user_roles (
            user_id  BIGINT      NOT NULL,
            role     VARCHAR(20) NOT NULL,                 -- USER | ADMIN (platform-wide)
            PRIMARY KEY (user_id, role),
            CONSTRAINT fk_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
          );` },
        { lang: 'java', file: 'User.java (additions)', src: code`
          @Column(name = "password_hash", length = 100)
          private String passwordHash;

          @ElementCollection(fetch = FetchType.EAGER)            // small set, always needed for auth
          @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
          @Column(name = "role", length = 20)
          @Enumerated(EnumType.STRING)
          private Set<Role> roles = new HashSet<>(Set.of(Role.USER));

          public void changePasswordHash(String hash) { this.passwordHash = hash; }
          public String getPasswordHash() { return passwordHash; }
          public Set<Role> getRoles() { return Collections.unmodifiableSet(roles); }` },
        { lang: 'java', file: 'AppUserPrincipal.java', src: code`
          package com.example.splitwise.security;

          import com.example.splitwise.user.Role;
          import java.util.Collection;
          import java.util.Set;
          import org.springframework.security.core.GrantedAuthority;
          import org.springframework.security.core.authority.SimpleGrantedAuthority;
          import org.springframework.security.core.userdetails.UserDetails;

          /** Our principal: carries the database id so controllers never look the user up again. */
          public record AppUserPrincipal(Long id, String email, String passwordHash, Set<Role> roles, boolean active)
                  implements UserDetails {
              @Override public Collection<? extends GrantedAuthority> getAuthorities() {
                  return roles.stream().map(r -> new SimpleGrantedAuthority("ROLE_" + r.name())).toList();
              }
              @Override public String getPassword() { return passwordHash; }
              @Override public String getUsername() { return email; }
              @Override public boolean isEnabled() { return active; }
          }` },
        { lang: 'java', file: 'JpaUserDetailsService.java', src: code`
          package com.example.splitwise.security;

          import com.example.splitwise.user.UserRepository;
          import com.example.splitwise.user.UserStatus;
          import org.springframework.security.core.userdetails.UserDetails;
          import org.springframework.security.core.userdetails.UserDetailsService;
          import org.springframework.security.core.userdetails.UsernameNotFoundException;
          import org.springframework.stereotype.Service;
          import org.springframework.transaction.annotation.Transactional;

          @Service
          public class JpaUserDetailsService implements UserDetailsService {
              private final UserRepository users;

              public JpaUserDetailsService(UserRepository users) { this.users = users; }

              @Override
              @Transactional(readOnly = true)
              public UserDetails loadUserByUsername(String email) {
                  return users.findByEmail(email.trim().toLowerCase())
                          .map(u -> new AppUserPrincipal(u.getId(), u.getEmail(), u.getPasswordHash(),
                                  Set.copyOf(u.getRoles()), u.getStatus() == UserStatus.ACTIVE))
                          .orElseThrow(() -> new UsernameNotFoundException("unknown user"));
              }
          }` }
      ],
      notes: [
        "Boot sees a single `UserDetailsService` bean plus a `PasswordEncoder` bean and wires a `DaoAuthenticationProvider` automatically — no manual AuthenticationManager setup.",
        "Never reveal whether the username or the password was wrong: Spring returns the same 401 for both, which prevents user enumeration.",
        "(`Set` here is `java.util.Set`; imports trimmed for space.) Group roles are *not* loaded here — they're per group and checked at method level."
      ]
    },
    {
      type: 'practical',
      title: 'Registration, the current user, and the responses',
      lead: 'Hash on the way in, read the principal on the way out.',
      code: [
        { lang: 'java', file: 'AuthController.java', src: code`
          package com.example.splitwise.security;

          import com.example.splitwise.user.*;
          import jakarta.validation.Valid;
          import jakarta.validation.constraints.*;
          import java.net.URI;
          import java.util.Set;
          import org.springframework.http.ResponseEntity;
          import org.springframework.security.core.annotation.AuthenticationPrincipal;
          import org.springframework.web.bind.annotation.*;

          record RegisterRequest(@NotBlank @Email String email,
                                 @NotBlank @Size(max = 100) String displayName,
                                 @NotBlank @Size(min = 12, max = 72) String password) {}
          record MeResponse(Long id, String email, Set<Role> roles) {}

          @RestController
          class AuthController {
              private final UserService users;
              AuthController(UserService users) { this.users = users; }

              @PostMapping("/api/v1/auth/register")
              ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest req) {
                  UserResponse created = users.register(req.email(), req.displayName(), req.password());
                  return ResponseEntity.created(URI.create("/api/v1/users/" + created.id())).body(created);
              }

              @GetMapping("/api/v1/me")
              MeResponse me(@AuthenticationPrincipal AppUserPrincipal me) {   // injected from the SecurityContext
                  return new MeResponse(me.id(), me.email(), me.roles());
              }
          }

          // UserService.register(...):
          //   if (repo.existsByEmail(email)) throw new ConflictException("email already registered");   // 409
          //   User u = new User(email, displayName);
          //   u.changePasswordHash(passwordEncoder.encode(rawPassword));                                 // BCrypt
          //   return UserResponse.from(repo.save(u));` },
        { lang: 'bash', label: 'curl', src: code`
          $ curl -i localhost:8080/api/v1/me
          HTTP/1.1 401
          WWW-Authenticate: Basic realm="splitwise"
          {"type":"about:blank","title":"Unauthorized","status":401,"detail":"Authentication required","instance":"/api/v1/me"}

          $ curl -s -X POST localhost:8080/api/v1/auth/register -H 'Content-Type: application/json' \
                 -d '{"email":"asha@example.com","displayName":"Asha","password":"correct-horse-battery"}'
          {"id":1,"email":"asha@example.com","displayName":"Asha"}

          $ curl -s -u asha@example.com:correct-horse-battery localhost:8080/api/v1/me
          {"id":1,"email":"asha@example.com","roles":["USER"]}

          $ curl -i -u asha@example.com:correct-horse-battery localhost:8080/api/v1/admin/users
          HTTP/1.1 403
          {"type":"about:blank","title":"Forbidden","status":403,...}` }
      ],
      notes: [
        "The temporary `X-User-Id` header from Sessions 13–14 now disappears: controllers take the acting user from `@AuthenticationPrincipal` — clients can no longer impersonate others by changing a header.",
        "HTTP Basic sends credentials (base64, not encrypted!) on every request — acceptable for learning and service-to-service calls **over HTTPS only**. Token-based authentication (OAuth2/JWT) follows in Session 18.",
        "Password policy: length beats complexity rules; check against breached-password lists in real systems."
      ]
    },
    {
      type: 'theory',
      title: 'Authorization: URL rules, method security & domain checks',
      lead: 'Coarse rules at the URL level, fine-grained rules where the business logic lives.',
      table: { head: ['Level', 'How', 'Example'], rows: [
        ['URL', '`requestMatchers(...).hasRole(...)`', '`/api/v1/admin/**` → ADMIN only'],
        ['Method', '`@PreAuthorize("hasRole(\'ADMIN\')")`', 'service method for platform admins'],
        ['Domain', '`@PreAuthorize("@groupAccess.isAdmin(#groupId, authentication)")`', 'only admins *of this group* remove members'],
        ['Data', 'filter queries by the current user', '`findGroupsOf(me.id())` — never list others\' groups']
      ] },
      points: [
        "`hasRole('ADMIN')` checks the authority `ROLE_ADMIN`; `hasAuthority('expense:write')` checks exact permission strings.",
        "Principle of **least privilege**: deny by default (`anyRequest().authenticated()`), grant explicitly.",
        "Broken object-level authorization (*IDOR*: changing `/groups/7` to `/groups/8`) is the #1 API security risk — always check ownership."
      ],
      notes: [
        "URL rules can't express 'admin of *this* group' because the decision needs data. Method security evaluates SpEL with access to method arguments (`#groupId`) and the `authentication`.",
        "SpEL argument names like `#groupId` rely on the `-parameters` compiler flag, which the Spring Boot parent POM enables.",
        "OWASP API Security Top 10 lists Broken Object Level Authorization first — a test for 'user of group 7 requests group 8' belongs in every API test suite."
      ]
    },
    {
      type: 'practical',
      title: 'Method security with a domain permission bean',
      lead: 'A small bean answers membership questions; `@PreAuthorize` calls it before the service method runs.',
      code: [
        { lang: 'java', file: 'GroupAccess.java', src: code`
          package com.example.splitwise.security;

          import com.example.splitwise.group.GroupMemberRepository;
          import com.example.splitwise.group.GroupRole;
          import org.springframework.security.core.Authentication;
          import org.springframework.stereotype.Component;

          @Component("groupAccess")                     // referenced by name from SpEL
          public class GroupAccess {
              private final GroupMemberRepository members;

              public GroupAccess(GroupMemberRepository members) { this.members = members; }

              public boolean isMember(Long groupId, Authentication auth) {
                  return members.existsByGroupIdAndUserId(groupId, userId(auth));
              }

              public boolean isAdmin(Long groupId, Authentication auth) {
                  return members.existsByGroupIdAndUserIdAndRole(groupId, userId(auth), GroupRole.ADMIN);
              }

              private Long userId(Authentication auth) {
                  return ((AppUserPrincipal) auth.getPrincipal()).id();
              }
          }` },
        { lang: 'java', file: 'GroupService.java (secured)', src: code`
          @Service
          @RequiredArgsConstructor
          public class GroupService {

              @PreAuthorize("@groupAccess.isMember(#groupId, authentication)")
              @Transactional(readOnly = true)
              public GroupDetails get(Long groupId) { ... }

              @PreAuthorize("@groupAccess.isAdmin(#groupId, authentication)")
              @Transactional
              public void removeMember(Long groupId, Long userId) { ... }      // non-admin -> 403

              @PreAuthorize("@groupAccess.isMember(#groupId, authentication)")
              @Transactional
              public ExpenseResponse addExpense(Long groupId, AppUserPrincipal me, CreateExpenseRequest req) { ... }
          }` }
      ],
      notes: [
        "When `@PreAuthorize` evaluates to false, Spring throws `AccessDeniedException`; our `ProblemJsonHandlers` (or an `@ExceptionHandler` for `AccessDeniedException` in the advice) turns it into a 403 problem response.",
        "Should a non-member get 403 or 404 for a group? 404 hides the group's existence (prevents enumeration); 403 is more debuggable. Pick a policy and apply it consistently.",
        "These membership checks run a query per call — cheap with the `UNIQUE (group_id, user_id)` index, and cacheable if needed."
      ]
    },
    {
      type: 'theory',
      title: 'Sessions vs tokens, CORS & testing security',
      lead: 'How the identity travels after login decides which protections you need.',
      table: { head: ['', 'Server session + cookie', 'Bearer token (e.g. JWT)'], rows: [
        ['State', 'server stores the session (memory/Redis)', 'stateless — token carries claims'],
        ['Sent as', '`Cookie: SESSION=…` automatically', '`Authorization: Bearer …` explicitly'],
        ['CSRF risk', '✅ yes — keep CSRF protection on', 'low (no automatic credentials)'],
        ['Revocation', 'easy: delete the session', 'hard: short expiry + refresh tokens'],
        ['Fits', 'server-rendered web apps', 'SPAs, mobile apps, microservices (Session 18)']
      ] },
      code: [
        { lang: 'java', label: 'CORS for a browser front-end', src: code`
          @Bean
          CorsConfigurationSource corsConfigurationSource() {      // used by http.cors(withDefaults())
              CorsConfiguration cfg = new CorsConfiguration();
              cfg.setAllowedOrigins(List.of("https://app.splitwise.local"));
              cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE"));
              cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
              UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
              source.registerCorsConfiguration("/api/**", cfg);
              return source;
          }` },
        { lang: 'java', file: 'GroupControllerSecurityTest.java', label: 'Security tests', src: code`
          @WebMvcTest(GroupController.class)
          @Import({SecurityConfig.class, ProblemJsonHandlers.class})   // slices don't load your security config
          class GroupControllerSecurityTest {
              @Autowired MockMvc mvc;
              @MockitoBean GroupService groups;
              @MockitoBean UserDetailsService userDetailsService;

              @Test
              void anonymousRequestsGet401() throws Exception {
                  mvc.perform(get("/api/v1/groups/7")).andExpect(status().isUnauthorized());
              }

              @Test
              @WithMockUser(roles = "USER")                              // needs spring-boot-starter-security-test
              void regularUsersCannotUseTheAdminApi() throws Exception {
                  mvc.perform(get("/api/v1/admin/users")).andExpect(status().isForbidden());
              }
          }` }
      ],
      notes: [
        "CORS is a *browser* mechanism: it decides whether JavaScript from another origin may read your responses. It is not an authentication mechanism and doesn't protect non-browser clients.",
        "Security tests are cheap insurance: one test per rule (anonymous → 401, wrong role → 403, right role → 200, non-member → 403/404) catches the misconfigurations that otherwise reach production.",
        "`@WithMockUser` creates a simple Spring `User` principal; for tests that need our `AppUserPrincipal` (domain checks), use `.with(user(new AppUserPrincipal(...)))` from `SecurityMockMvcRequestPostProcessors`."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: secure the Splitwise API',
      lead: 'Real users, hashed passwords, roles, and per-group permissions — with tests proving each rule.',
      steps: [
        "Add `spring-boot-starter-security` (and `spring-boot-starter-security-test` for tests); note the generated-password behaviour, then add `SecurityConfig`.",
        "Add `V2__security.sql`, the `passwordHash`/`roles` fields, `AppUserPrincipal` and `JpaUserDetailsService`.",
        "Implement `POST /api/v1/auth/register` (BCrypt, 409 on duplicate email) and `GET /api/v1/me` with `@AuthenticationPrincipal`.",
        "Replace the `X-User-Id` header everywhere with the authenticated principal.",
        "Add `GroupAccess` and `@PreAuthorize` rules: members read/add expenses; only group ADMINs remove members or rename the group.",
        "Make 401 and 403 responses `application/problem+json`.",
        "Write security tests: anonymous → 401, USER on admin API → 403, non-member reading a group → 403, admin removing a member → 204.",
        "Stretch: store sessions in Redis with Spring Session and switch the chain to form login + CSRF to compare the two models."
      ],
      notes: [
        "Seed an ADMIN user in a Flyway migration with a *pre-computed* BCrypt hash — never a plain password in SQL. Generate the hash once with `PasswordEncoderFactories.createDelegatingPasswordEncoder().encode(\"...\")` in a scratch test.",
        "Common pitfall: `hasRole(\"ROLE_ADMIN\")` — `hasRole` adds the `ROLE_` prefix itself, so this checks `ROLE_ROLE_ADMIN` and always fails."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: Spring Security',
      quiz: [
        { q: "A request with no credentials hits a protected endpoint. Correct status?", options: ['403 Forbidden', '401 Unauthorized', '404 Not Found', '400 Bad Request'], answer: 1,
          why: "401 means the client isn't authenticated; 403 means authenticated but not permitted." },
        { q: "What does Spring Security need from your code for database authentication?", options: ['A login controller', 'A UserDetailsService (plus a PasswordEncoder)', 'A custom servlet', 'A JWT library'], answer: 1,
          why: "`loadUserByUsername` returns UserDetails; the DaoAuthenticationProvider checks the password with the encoder." },
        { q: "Why is BCrypt preferred over SHA-256 for passwords?", options: ['It is shorter', 'It is salted and deliberately slow (adaptive cost)', 'It is reversible', 'MySQL requires it'], answer: 1,
          why: "Fast hashes enable massive brute-force attempts; BCrypt's cost factor makes each guess expensive and the salt defeats rainbow tables." },
        { q: "Which expression allows only admins of the group in the method argument `groupId`?", options: ['hasRole(\'ADMIN\')', 'permitAll()', '@groupAccess.isAdmin(#groupId, authentication)', 'authenticated()'], answer: 2,
          why: "Per-group roles need data, so a bean method evaluated via SpEL performs the domain-level check." },
        { q: "When is disabling CSRF protection reasonable?", options: ['Always', 'For a stateless API authenticated by an Authorization header on every request', 'For form login with session cookies', 'Never'], answer: 1,
          why: "CSRF exploits credentials the browser sends automatically (cookies). Header-based tokens aren't attached automatically." }
      ],
      notes: [
        "For Q4, ask why `hasRole('ADMIN')` is insufficient: a platform admin and a group admin are different concepts — mixing them grants far too much power."
      ]
    },
    {
      type: 'summary',
      title: 'Session 16 recap',
      points: [
        "AuthN = who you are (401 on failure); AuthZ = what you may do (403 on failure).",
        "Security filter chain → AuthenticationManager → UserDetailsService + PasswordEncoder → SecurityContext.",
        "Configure a `SecurityFilterChain` bean with the lambda DSL: matchers, httpBasic, stateless sessions, problem+json errors.",
        "Store BCrypt hashes (DelegatingPasswordEncoder); load users from MySQL with a custom principal carrying the id.",
        "Authorize at URL, method (`@PreAuthorize`) and domain level; test every rule with MockMvc."
      ],
      cards: [
        ['Principal', 'The authenticated identity (our AppUserPrincipal).'],
        ['SecurityFilterChain', 'Bean defining the ordered security filters and rules for requests.'],
        ['UserDetailsService', 'Loads a user by username for authentication.'],
        ['DelegatingPasswordEncoder', 'Encoder that stores {id} prefixes so algorithms can evolve.'],
        ['@PreAuthorize', 'Method-level authorization with SpEL, evaluated before the call.'],
        ['IDOR', 'Insecure direct object reference — accessing others\u2019 objects by changing an id.'],
        ['CSRF', 'Attack abusing automatically sent browser credentials (cookies).'],
        ['CORS', 'Browser rules for which origins may read cross-origin responses.']
      ],
      notes: [
        "Next session: the Splitwise Advanced minor project — integrating JUnit, Redis and Spring Security with role-based access and advanced validations, using Cursor's AI agents to speed up the repetitive parts."
      ]
    }
  ]
});
