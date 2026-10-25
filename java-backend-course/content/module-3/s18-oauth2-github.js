COURSE.session({
  no: 18,
  short: 'OAuth 2.0 & GitHub login',
  title: 'OAuth 2.0 Workflow, Scopes & GitHub OAuth2 with Spring Boot',
  covers: [7],
  extra: ['Bridge to Module 4: securing many services with tokens'],
  objectives: [
    "Explain OAuth 2.0 roles, the authorization-code flow (with state and PKCE), grant types and tokens.",
    "Choose minimal scopes and distinguish OAuth 2.0 (authorization) from OpenID Connect (authentication).",
    "Implement 'Login with GitHub' in Spring Boot and provision local users from GitHub identities.",
    "Understand JWT access tokens and resource servers — the security model for microservices."
  ],
  prereq: "Session 16: Spring Security filter chain, principals and authorities.",
  slides: [
    {
      type: 'theory',
      title: 'Why OAuth 2.0? Delegated authorization',
      lead: 'Never give an app your password. OAuth 2.0 lets you grant an app **limited access** to your data on another service — and revoke it any time.',
      diagram: { kind: 'grid', cols: 4, items: [
        { icon: '🙋', t: 'Resource owner', s: 'the user (you, owner of the GitHub account)', tone: 'blue' },
        { icon: '🧩', t: 'Client', s: 'the app wanting access (our Spring Boot app)', tone: 'green' },
        { icon: '🏛️', t: 'Authorization server', s: 'authenticates the user, issues tokens (github.com)', tone: 'purple' },
        { icon: '🗄️', t: 'Resource server', s: 'API holding the data (api.github.com)', tone: 'orange' }
      ] },
      points: [
        "The client receives an **access token**: a credential with limited **scope** and lifetime — not the password.",
        "The user consents on the authorization server's own page; the client never sees the password.",
        "Tokens can be revoked per app without changing the password."
      ],
      notes: [
        "The 'password anti-pattern': early apps asked for your email password to import contacts. If that app was breached, so was your mailbox. OAuth replaced that with scoped, revocable tokens.",
        "OAuth 2.0 is an *authorization* framework (RFC 6749). Logging users in with it requires an identity layer — OpenID Connect — or, for providers like GitHub, calling a user-info API with the token."
      ]
    },
    {
      type: 'theory',
      title: 'The authorization code flow',
      lead: 'The browser carries a short-lived **code**; the server exchanges it for tokens over a back channel, authenticating with its client secret.',
      diagram: { kind: 'seq', actors: ['User / Browser', 'Spring Boot app', 'GitHub (auth server)', 'api.github.com'], msgs: [
        [0, 1, 'GET /oauth2/authorization/github'],
        [1, 0, '302 to github.com/login/oauth/authorize', 'r'],
        [0, 2, 'authorize?client_id&scope&state&redirect_uri'],
        [2, 2, 'user logs in and consents'],
        [2, 0, '302 /login/oauth2/code/github?code&state', 'r'],
        [0, 1, 'callback with code + state'],
        [1, 2, 'POST /access_token (code + client secret)'],
        [2, 1, 'access_token', 'r'],
        [1, 3, 'GET /user with Bearer token'],
        [3, 1, 'id, login, name, avatar_url', 'r'],
        [1, 0, 'session created: logged in', 'r']
      ] },
      points: [
        "**state** — random value round-tripped to stop CSRF on the callback.",
        "**PKCE** (code_verifier/code_challenge) — proves the code is redeemed by the client that started the flow; required for public clients, recommended for all.",
        "The access token never touches the browser in this server-side flow."
      ],
      notes: [
        "Walk through the steps with real URLs. Spring Security implements all of them: the `/oauth2/authorization/{registrationId}` entry point, state generation, the callback at `/login/oauth2/code/{registrationId}`, the token exchange and the user-info call.",
        "Why not return the token directly in the redirect (the old implicit flow)? URLs leak through browser history, logs and referrer headers. A one-time code exchanged on the back channel is far safer."
      ]
    },
    {
      type: 'theory',
      title: 'Grant types, tokens & scopes',
      lead: 'Pick the grant for the kind of client; request the **smallest scope** that works.',
      table: { head: ['Grant', 'For', 'Status'], rows: [
        ['Authorization code + PKCE', 'web apps, SPAs, mobile apps', '✅ the default'],
        ['Client credentials', 'service-to-service (no user)', '✅ microservices (Module 4)'],
        ['Device authorization', 'TVs, CLIs without a browser', '✅'],
        ['Refresh token', 'get new access tokens without re-login', '✅ with rotation'],
        ['Implicit / Password (ROPC)', 'legacy', '❌ removed in OAuth 2.1 drafts']
      ] },
      diagram: { kind: 'compare', cols: [
        { t: 'GitHub scopes (examples)', icon: '🔑', tone: 'purple', points: ['*(no scope)* — public profile, read-only', '`read:user` — read profile data', '`user:email` — read email addresses (incl. private)', '`repo` — full private repo access ⚠️ never for login'] },
        { t: 'OAuth 2.0 vs OpenID Connect', icon: '🪪', tone: 'blue', points: ['OAuth 2.0: *access* (authorization)', 'OIDC: adds an **ID token** (JWT) + standard user claims = *login*', 'Google, Microsoft, Keycloak, Okta speak OIDC', 'GitHub OAuth Apps: OAuth only → login via the `/user` API'] }
      ] },
      notes: [
        "Least privilege: a 'Login with GitHub' button needs at most `read:user` (and `user:email` if you need a verified email). Asking for `repo` scares users and creates enormous risk if your app leaks tokens.",
        "Access tokens should be short-lived (minutes); refresh tokens longer-lived but rotated and revocable."
      ]
    },
    {
      type: 'practical',
      title: 'Register a GitHub OAuth App',
      lead: 'Create the client on GitHub and keep its secret out of Git.',
      steps: [
        "GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.",
        "Application name: `Splitwise Local`; Homepage URL: `http://localhost:8080`.",
        "Authorization callback URL: `http://localhost:8080/login/oauth2/code/github` (Spring Security's default).",
        "Register, then **Generate a new client secret**; copy the Client ID and secret once.",
        "Export them: `export GITHUB_CLIENT_ID=...` and `export GITHUB_CLIENT_SECRET=...` (or your IDE run configuration). Never commit them."
      ],
      table: { head: ['Value', 'Where it goes'], rows: [
        ['Client ID', '`spring.security.oauth2.client.registration.github.client-id` (not secret)'],
        ['Client secret', 'env var `GITHUB_CLIENT_SECRET` → property placeholder (secret!)'],
        ['Callback URL', 'must match exactly, including port and path']
      ] },
      notes: [
        "The callback URL mismatch is the #1 setup error (GitHub shows 'redirect_uri is not associated with this application'). Use separate OAuth Apps for local, staging and production, each with its own callback URL.",
        "If a secret leaks, regenerate it on GitHub immediately and rotate it in your secret store."
      ]
    },
    {
      type: 'practical',
      title: 'Login with GitHub in Spring Boot',
      lead: 'One starter, a few properties, and `oauth2Login()` in the filter chain. Spring Security knows GitHub\'s endpoints already.',
      code: [
        { lang: 'xml', file: 'pom.xml', src: code`
          <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security-oauth2-client</artifactId>   <!-- Boot 4 name -->
          </dependency>` },
        { lang: 'yaml', file: 'application.yml', src: code`
          spring:
            security:
              oauth2:
                client:
                  registration:
                    github:
                      client-id: \${GITHUB_CLIENT_ID}
                      client-secret: \${GITHUB_CLIENT_SECRET}
                      scope: read:user` },
        { lang: 'java', file: 'WebSecurityConfig.java', src: code`
          package com.example.splitwise.security;

          import org.springframework.context.annotation.Bean;
          import org.springframework.context.annotation.Configuration;
          import org.springframework.security.config.annotation.web.builders.HttpSecurity;
          import org.springframework.security.web.SecurityFilterChain;

          @Configuration
          public class WebSecurityConfig {

              @Bean
              SecurityFilterChain web(HttpSecurity http, GitHubUserService gitHubUsers) throws Exception {
                  http
                      .authorizeHttpRequests(auth -> auth
                          .requestMatchers("/", "/error", "/css/**").permitAll()
                          .anyRequest().authenticated())
                      .oauth2Login(oauth -> oauth
                          .userInfoEndpoint(userInfo -> userInfo.userService(gitHubUsers))  // provision local users
                          .defaultSuccessUrl("/me", true))
                      .logout(logout -> logout.logoutSuccessUrl("/"));                     // CSRF stays ON (cookies)
                  return http.build();
              }
          }` },
        { lang: 'java', file: 'MeController.java', src: code`
          package com.example.splitwise.security;

          import java.util.Map;
          import org.springframework.security.core.GrantedAuthority;
          import org.springframework.security.core.annotation.AuthenticationPrincipal;
          import org.springframework.security.oauth2.core.user.OAuth2User;
          import org.springframework.web.bind.annotation.GetMapping;
          import org.springframework.web.bind.annotation.RestController;

          @RestController
          class MeController {
              @GetMapping("/me")
              Map<String, Object> me(@AuthenticationPrincipal OAuth2User user) {
                  return Map.of(
                          "login", user.getAttribute("login"),
                          "name", String.valueOf(user.getAttribute("name")),
                          "avatar", user.getAttribute("avatar_url"),
                          "authorities", user.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList());
              }
          }`, out: code`
          {"login":"asha-dev","name":"Asha K","avatar":"https://avatars.githubusercontent.com/u/1234567?v=4",
           "authorities":["OAUTH2_USER","ROLE_USER","SCOPE_read:user"]}` }
      ],
      notes: [
        "Visiting any protected page redirects to GitHub; after consent, Spring creates an HTTP session and the user is logged in. This is a browser login, so the session cookie + CSRF protection model from Session 16 applies.",
        "Spring Boot 4 renamed the starter to `spring-boot-starter-security-oauth2-client` (the old `spring-boot-starter-oauth2-client` name is gone).",
        "Spring Security's `CommonOAuth2Provider.GITHUB` supplies the authorization, token and user-info URLs, so the `provider` section can be omitted for GitHub (and Google, Facebook, Okta)."
      ]
    },
    {
      type: 'practical',
      title: 'Provisioning local users from GitHub identities',
      lead: 'GitHub proves *who* the user is; your database still decides *what* they can do in Splitwise.',
      code: [
        { lang: 'sql', file: 'db/migration/V3__github_login.sql', src: code`
          ALTER TABLE users
            ADD COLUMN github_id BIGINT NULL,
            ADD CONSTRAINT uq_users_github UNIQUE (github_id);` },
        { lang: 'java', file: 'GitHubUserService.java', src: code`
          package com.example.splitwise.security;

          import com.example.splitwise.user.User;
          import com.example.splitwise.user.UserRepository;
          import java.util.HashSet;
          import java.util.Optional;
          import java.util.Set;
          import org.springframework.security.core.GrantedAuthority;
          import org.springframework.security.core.authority.SimpleGrantedAuthority;
          import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
          import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
          import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
          import org.springframework.security.oauth2.core.user.OAuth2User;
          import org.springframework.stereotype.Service;
          import org.springframework.transaction.annotation.Transactional;

          @Service
          public class GitHubUserService extends DefaultOAuth2UserService {
              private final UserRepository users;

              public GitHubUserService(UserRepository users) { this.users = users; }

              @Override
              @Transactional
              public OAuth2User loadUser(OAuth2UserRequest request) {
                  OAuth2User gh = super.loadUser(request);                       // GET https://api.github.com/user
                  long githubId = ((Number) gh.getAttribute("id")).longValue();
                  String login = gh.getAttribute("login");
                  String name = Optional.ofNullable((String) gh.getAttribute("name")).orElse(login);

                  User user = users.findByGithubId(githubId).orElseGet(() ->      // first login: create account
                          users.save(User.fromGitHub(githubId, login, name)));

                  Set<GrantedAuthority> authorities = new HashSet<>(gh.getAuthorities());
                  user.getRoles().forEach(r -> authorities.add(new SimpleGrantedAuthority("ROLE_" + r.name())));
                  return new DefaultOAuth2User(authorities, gh.getAttributes(), "login");
              }
          }

          // User.fromGitHub(...) sets githubId, displayName = name, and a placeholder
          // email "<id>+<login>@users.noreply.github.com" (GitHub may keep the real email private).` }
      ],
      notes: [
        "Key on the immutable numeric GitHub `id`, not the `login` (users can rename their GitHub account) and not the email (may be private or change).",
        "Account linking: an existing Splitwise user (registered with a password in Session 16) can link GitHub later; then both login methods resolve to the same local `User`. Be careful to link only after verifying ownership of both.",
        "To get the private email you'd add the `user:email` scope and call `https://api.github.com/user/emails` with the token."
      ]
    },
    {
      type: 'theory',
      title: 'Access tokens for APIs: JWTs & resource servers',
      lead: 'Between services there are no browsers or sessions. Each request carries a **bearer token**, typically a signed **JWT** that every service can verify on its own.',
      code: { lang: 'yaml', file: 'application.yml (an API service)', src: code`
        spring:
          security:
            oauth2:
              resourceserver:
                jwt:
                  issuer-uri: http://localhost:8180/realms/splitwise   # e.g. Keycloak; keys fetched via JWKS
        # pom: spring-boot-starter-security-oauth2-resource-server
        # chain: http.oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults()))
        # rules: .requestMatchers(HttpMethod.GET, "/api/**").hasAuthority("SCOPE_expenses:read")` },
      table: { head: ['Claim', 'Meaning', 'Checked by the resource server'], rows: [
        ['`iss`', 'issuer (which authorization server)', '✅ must match the configured issuer'],
        ['`sub`', 'subject (user id)', 'used as the principal name'],
        ['`aud`', 'intended audience (which API)', '✅ recommended'],
        ['`exp` / `iat`', 'expiry / issued-at (Unix seconds)', '✅ expired tokens rejected'],
        ['`scope`', 'granted permissions', 'mapped to `SCOPE_*` authorities']
      ] },
      points: [
        "A JWT is `base64url(header).base64url(payload).signature` — **signed, not encrypted**: anyone can read it, nobody can change it undetected.",
        "Services verify signatures with the issuer's public keys (JWKS) — no call to the auth server per request.",
        "Identity providers: Keycloak, Auth0, Okta, AWS Cognito, or your own with Spring Authorization Server."
      ],
      notes: [
        "Never put secrets or personal data you wouldn't print into a JWT payload — it's only base64-encoded.",
        "For browser SPAs, the recommended pattern is a *Backend for Frontend*: the server keeps tokens and gives the browser an HttpOnly session cookie, rather than storing tokens in localStorage where XSS can steal them."
      ]
    },
    {
      type: 'practical',
      title: 'How a JWT signature protects claims (pure JDK demo)',
      lead: 'Sign with HMAC-SHA256, decode the parts, then watch verification fail after tampering.',
      code: { lang: 'java', file: 'JwtDemo.java', src: code`
        import java.nio.charset.StandardCharsets;
        import java.security.MessageDigest;
        import java.util.Base64;
        import javax.crypto.Mac;
        import javax.crypto.spec.SecretKeySpec;

        public class JwtDemo {
            static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
            static final Base64.Decoder D64 = Base64.getUrlDecoder();

            static String hmacSha256(String data, byte[] key) throws Exception {
                Mac mac = Mac.getInstance("HmacSHA256");
                mac.init(new SecretKeySpec(key, "HmacSHA256"));
                return B64.encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
            }

            static String sign(String headerJson, String payloadJson, byte[] key) throws Exception {
                String unsigned = B64.encodeToString(headerJson.getBytes(StandardCharsets.UTF_8)) + "."
                        + B64.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
                return unsigned + "." + hmacSha256(unsigned, key);
            }

            static boolean verify(String jwt, byte[] key) throws Exception {
                String[] parts = jwt.split("\\.");
                String expected = hmacSha256(parts[0] + "." + parts[1], key);
                return MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),      // constant-time
                        parts[2].getBytes(StandardCharsets.US_ASCII));
            }

            public static void main(String[] args) throws Exception {
                byte[] key = "a-256-bit-demo-secret-for-the-splitwise-course!!".getBytes(StandardCharsets.UTF_8);
                String header = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
                String payload = "{\"iss\":\"https://auth.splitwise.local\",\"sub\":\"42\","
                        + "\"scope\":\"expenses:read expenses:write\",\"exp\":1793000000}";

                String jwt = sign(header, payload, key);
                String[] parts = jwt.split("\\.");
                System.out.println("parts: " + parts.length);
                System.out.println("header : " + new String(D64.decode(parts[0]), StandardCharsets.UTF_8));
                System.out.println("payload: " + new String(D64.decode(parts[1]), StandardCharsets.UTF_8));
                System.out.println("valid signature? " + verify(jwt, key));

                String tampered = payload.replace("\"sub\":\"42\"", "\"sub\":\"1\"");   // attacker impersonates user 1
                String forged = parts[0] + "." + B64.encodeToString(tampered.getBytes(StandardCharsets.UTF_8)) + "." + parts[2];
                System.out.println("tampered token valid? " + verify(forged, key));
                System.out.println("wrong key valid? " + verify(jwt,
                        "another-secret-another-secret-another-secret!!!!".getBytes(StandardCharsets.UTF_8)));
            }
        }`, out: code`
        parts: 3
        header : {"alg":"HS256","typ":"JWT"}
        payload: {"iss":"https://auth.splitwise.local","sub":"42","scope":"expenses:read expenses:write","exp":1793000000}
        valid signature? true
        tampered token valid? false
        wrong key valid? false` },
      callout: { kind: 'warn', text: "This demo is for understanding only. In real services let Spring Security (Nimbus JOSE) validate tokens: it checks the algorithm, expiry, issuer, audience and key rotation — hand-rolled JWT code is a classic source of vulnerabilities." },
      notes: [
        "The payload is readable by anyone (we just decoded it); the signature is what makes it trustworthy. Changing `sub` from 42 to 1 breaks the signature, so the forged token is rejected.",
        "HS256 uses one shared secret (fine inside one system); most identity providers sign with RS256/ES256 private keys so that services only need the *public* keys to verify.",
        "`MessageDigest.isEqual` compares in constant time, avoiding timing attacks that leak how many leading characters matched."
      ]
    },
    {
      type: 'theory',
      title: 'Bridge to microservices: one identity, many services',
      lead: 'Module 4 splits a system into services. OAuth 2.0 tokens are how they share identity and permissions safely.',
      diagram: { kind: 'tiers', tiers: [
        { label: 'Clients', nodes: [{ t: 'Web / mobile app', s: 'auth code + PKCE', tone: 'gray' }] },
        { label: 'Edge', via: 'access token', nodes: [{ t: 'API Gateway', s: 'validates/relays tokens (Session 23)', tone: 'blue' }, { t: 'Authorization server', s: 'Keycloak / Spring Authorization Server', tone: 'purple' }] },
        { label: 'Services', via: 'Bearer JWT', nodes: [{ t: 'user-service', s: 'resource server', tone: 'green' }, { t: 'booking-service', s: 'resource server', tone: 'green' }, { t: 'payment-service', s: 'resource server', tone: 'green' }] },
        { label: 'Service ↔ service', nodes: [{ t: 'client credentials', s: 'machine identity, no user', tone: 'orange' }] }
      ] },
      points: [
        "Every service validates tokens itself (zero trust) — no shared session store needed.",
        "User context travels with the token; machine-to-machine calls use the **client credentials** grant.",
        "Why split at all? Independent deployment and scaling, team autonomy, fault isolation — at the cost of distributed complexity. That trade-off opens Session 19."
      ],
      notes: [
        "Splitwise is a sensible monolith. The Airbnb-style major project (Sessions 21–24) has independent domains — users, properties, bookings, payments — with different scaling needs, which makes it a good microservices candidate.",
        "Preview: Feign clients (Session 19) can propagate the caller's bearer token or obtain their own via client credentials."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: "Login with GitHub" for Splitwise',
      lead: 'Wire up GitHub OAuth2 login end to end and map GitHub identities to Splitwise accounts.',
      steps: [
        "Register a GitHub OAuth App with callback `http://localhost:8080/login/oauth2/code/github`; export the client id and secret.",
        "Add `spring-boot-starter-security-oauth2-client` and the `github` registration with scope `read:user`.",
        "Add the `WebSecurityConfig` chain with `oauth2Login()`; open `http://localhost:8080/me` and complete the login.",
        "Add `V3__github_login.sql` and `GitHubUserService`; confirm a local `users` row is created on first login and reused afterwards.",
        "Show the granted authorities on `/me` (OAUTH2_USER, SCOPE_read:user, ROLE_USER); add `user:email` and observe the new consent screen.",
        "Run the `JwtDemo` and explain each output line to a partner.",
        "Keep the API chain from Session 16 for `/api/**` (stateless) and the login chain for browser pages — use `securityMatcher` + `@Order` for two chains.",
        "Stretch: run Keycloak in Docker (`start-dev`), create a `splitwise` realm and client, and protect `/api/**` as a JWT resource server with `SCOPE_expenses:read`."
      ],
      notes: [
        "Revoke the app in GitHub (Settings → Applications → Authorized OAuth Apps) and log in again — students see the consent screen reappear, making 'revocable delegated access' concrete.",
        "Two filter chains: annotate the API chain with `@Order(1)` and `http.securityMatcher(\"/api/**\")`; the browser chain (no matcher) handles everything else."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: OAuth 2.0 & GitHub login',
      quiz: [
        { q: "In 'Login with GitHub' for our app, which role does GitHub's github.com play?", options: ['Client', 'Resource owner', 'Authorization server', 'API gateway'], answer: 2,
          why: "github.com authenticates the user and issues tokens; our Spring Boot app is the client; api.github.com is the resource server." },
        { q: "What is the purpose of the `state` parameter?", options: ['Store the access token', 'Protect the callback against CSRF by round-tripping a random value', 'Select scopes', 'Encrypt the code'], answer: 1,
          why: "The client checks that the state returned matches the one it sent, so attackers can't inject their own authorization responses." },
        { q: "Which grant suits a booking-service calling payment-service with no user involved?", options: ['Authorization code', 'Implicit', 'Client credentials', 'Device code'], answer: 2,
          why: "Client credentials authenticate the calling service itself (machine-to-machine)." },
        { q: "A JWT's payload is…", options: ['encrypted and unreadable', 'base64url-encoded and readable; protected against tampering by the signature', 'a database id only', 'always opaque'], answer: 1,
          why: "Standard JWTs (JWS) are signed, not encrypted — never put secrets in them." },
        { q: "Minimal GitHub scope for a simple login that reads the public profile?", options: ['repo', 'admin:org', 'read:user (or no scope)', 'delete_repo'], answer: 2,
          why: "Least privilege: profile access is enough to identify the user." }
      ],
      notes: [
        "Use Q1 to re-draw the four roles on the board with our concrete systems in each box.",
        "For Q4, paste a real token into a JWT debugger in class (one from the Keycloak stretch lab, never a production token) to show that anyone can read the claims."
      ]
    },
    {
      type: 'summary',
      title: 'Session 18 recap — Module 3 complete',
      points: [
        "OAuth 2.0 = delegated, scoped, revocable access via tokens; four roles: owner, client, authorization server, resource server.",
        "Authorization code flow (+ state, PKCE): code in the browser, token exchange on the back channel.",
        "Scopes = least privilege; OIDC adds login (ID token) — GitHub OAuth Apps use the `/user` API instead.",
        "Spring Boot: `spring-boot-starter-security-oauth2-client` + `oauth2Login()` + a custom `OAuth2UserService` to provision local users.",
        "APIs and microservices use bearer JWTs verified by resource servers; services use client credentials."
      ],
      cards: [
        ['Access token', 'Short-lived credential with limited scope used to call an API.'],
        ['Authorization code', 'One-time code exchanged for tokens over the back channel.'],
        ['PKCE', 'Proof Key for Code Exchange — binds the code to the client that requested it.'],
        ['Scope', 'Named permission requested by the client and consented by the user.'],
        ['OIDC', 'OpenID Connect: identity layer on OAuth 2.0 with ID tokens.'],
        ['JWT', 'Signed token: header.payload.signature (base64url).'],
        ['Resource server', 'API that validates bearer tokens before serving requests.'],
        ['Client credentials', 'Grant for service-to-service calls without a user.']
      ],
      notes: [
        "Module 3 complete: Splitwise is tested, cached, secured, and can log users in with GitHub. Module 4 starts with monoliths vs microservices and Feign clients."
      ]
    }
  ]
});
