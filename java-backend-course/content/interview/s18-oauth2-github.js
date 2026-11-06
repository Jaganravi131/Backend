/* Interview pack — Session 18: OAuth 2.0, OpenID Connect & GitHub login */
COURSE.prep(18, {
  deepDives: [
    {
      title: 'Deep dive: OAuth 2.1 & OpenID Connect — flows, PKCE and the attacks they stop',
      lead: 'Identity questions are a staple of senior backend interviews: which flow for which client, and what each parameter defends against.',
      points: [
        "OAuth 2.0 is **delegated authorization** — a client obtains an access token to call an API on a user's behalf. **OpenID Connect** adds **authentication** on top: an ID token (a JWT describing the user), a `userinfo` endpoint and discovery at `/.well-known/openid-configuration`.",
        "**Authorization code + PKCE** is the flow for every user-facing client. The client creates a random `code_verifier`, sends `code_challenge = BASE64URL(SHA-256(verifier))` with the authorization request, and must present the verifier to redeem the code — an intercepted code is useless without it.",
        "OAuth 2.1 (an IETF draft consolidating years of best practice) requires PKCE, drops the implicit and password grants, and demands exact redirect-URI matching and protected refresh tokens.",
        "`state` protects the client's callback against CSRF (it binds the response to the browser session that started the flow); `nonce` binds the ID token to that authentication request, preventing replay.",
        "**Access tokens** are short-lived (minutes) and meant for APIs; **refresh tokens** are long-lived, rotated on use and revocable; **ID tokens** are for the client only — never send them to an API as if they were access tokens.",
        "Other grants: **client credentials** for service-to-service calls without a user, and the **device authorization grant** for TVs and command-line tools."
      ],
      code: { lang: 'java', file: 'Pkce.java', src: code`
        import java.nio.charset.StandardCharsets;
        import java.security.MessageDigest;
        import java.security.SecureRandom;
        import java.util.Base64;

        public class Pkce {
            static String challenge(String verifier) throws Exception {
                byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
                return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);   // S256 = BASE64URL(SHA-256(verifier))
            }

            static String newVerifier() {
                byte[] random = new byte[32];
                new SecureRandom().nextBytes(random);                                    // 256 bits of entropy
                return Base64.getUrlEncoder().withoutPadding().encodeToString(random);    // 43 characters
            }

            public static void main(String[] args) throws Exception {
                String verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";          // RFC 7636, Appendix B
                System.out.println("challenge: " + challenge(verifier));
                System.out.println("matches RFC 7636: " + challenge(verifier).equals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"));
                String v = newVerifier();
                System.out.println("fresh verifier length: " + v.length() + ", challenge length: " + challenge(v).length());
            }
        }`, out: code`
        challenge: E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
        matches RFC 7636: true
        fresh verifier length: 43, challenge length: 43` },
      callout: { kind: 'interview', text: "*Which flow would you use?* — SPA: authorization code + PKCE, ideally through a backend-for-frontend that keeps tokens off the browser. Mobile: authorization code + PKCE via the system browser. Server-side web app: authorization code (+ PKCE). Service to service: client credentials. Never the implicit or password grants." },
      notes: [
        "The program reproduces the test vector published in RFC 7636 (Appendix B), which is how libraries are checked against the specification. In Spring Security, PKCE is applied automatically for public clients and can be enabled for confidential ones.",
        "Why PKCE even for server-side clients? Authorization codes can leak through logs, browser history or malicious redirects (code injection). PKCE binds the code to the instance that started the flow, so a leaked code cannot be redeemed by anyone else.",
        "GitHub supports the authorization code flow for both OAuth Apps and GitHub Apps; for *Sign in with GitHub* you only need the user's identity, so request the minimum scopes."
      ]
    },
    {
      title: 'Deep dive: validating JWTs safely — algorithms, keys, rotation & revocation',
      lead: 'A JWT is only as safe as the checks the resource server performs. These are the checks, the attacks, and the operational side.',
      table: { head: ['Attack', 'How it works', 'Defence'], rows: [
        ['`alg: none`', 'Token claims to be unsigned; a naive library accepts it', 'Accept only an allow-listed algorithm configured on the server'],
        ['Algorithm confusion', 'An RS256 public key is used as an HS256 secret to forge tokens', 'Fix the algorithm per key; never let the token choose it'],
        ['Missing audience check', 'A token minted for another API is accepted', 'Validate `aud` (and `iss`) for every token'],
        ['Long-lived stolen token', 'A leaked bearer token works until it expires', 'Short access-token lifetimes; sender-constrained tokens (mTLS, DPoP)'],
        ['Key injection via headers', '`jku`/`x5u`/`kid` point verification at attacker-controlled keys', 'Fetch keys only from the configured issuer\'s JWKS; treat `kid` as a lookup key only']
      ] },
      points: [
        "A resource server must verify the signature with the **expected algorithm and key**, then validate `iss`, `aud`, `exp`/`nbf` (with a small clock-skew allowance) and the required scopes.",
        "Keys come from the issuer's **JWKS** endpoint and tokens name their key with `kid`. Cache the key set and refresh it (rate-limited) on an unknown `kid` — that is how keys rotate without downtime: publish the new key, start signing with it, retire the old one after the longest token lifetime.",
        "JWTs cannot be recalled once issued: keep access tokens short (5–15 minutes), revoke at the refresh-token level, and for emergencies keep a deny-list of token ids (`jti`) checked at the gateway.",
        "**Opaque tokens + introspection** give central control and instant revocation at the cost of a call per request (cache briefly). Many platforms use opaque tokens at the edge and exchange them for internal JWTs at the gateway.",
        "A JWT payload is only base64url-encoded: anyone can read it. Never put secrets or sensitive personal data in it — signatures give integrity, not confidentiality."
      ],
      code: { lang: 'yaml', file: 'application.yml', src: code`
        spring:
          security:
            oauth2:
              resourceserver:
                jwt:
                  issuer-uri: https://auth.example.com          # discovery + JWKS, and iss validation
                  audiences: splitwise-api                       # reject tokens minted for other APIs
                  jws-algorithms: RS256                          # explicit algorithm allow-list` },
      notes: [
        "Spring Security's resource-server support performs signature, `iss`, `exp` and `nbf` validation when `issuer-uri` is set; the `audiences` property adds the `aud` check — a frequently forgotten line that the attack table explains.",
        "Key rotation is an operational routine, not an emergency: practise it, and alert if the JWKS endpoint becomes unreachable, because resource servers can only verify new keys they can fetch.",
        "DPoP and mutual-TLS-bound tokens tie a token to a key held by the client, so a token copied from logs or a compromised proxy cannot be replayed elsewhere."
      ]
    }
  ],

  stretch: [
    "Implement refresh-token rotation with reuse detection: store token families, issue a new refresh token on every refresh, and revoke the whole family when an already-used token is presented — with a test for the replay.",
    "Publish two keys in your JWKS, rotate the active signing key, and prove that tokens signed with the old key still validate until they expire while new tokens use the new key.",
    "Add an emergency deny-list (by `jti`) checked at the gateway, backed by Redis with a TTL equal to the access-token lifetime, and measure its latency impact."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: effective permissions in a role hierarchy',
      lead: 'Authorization logic is graph logic: roles inherit roles, permissions flow along the edges, and a configuration mistake can create a cycle.',
      difficulty: 'Medium', minutes: 40, pattern: ['graph', 'hashing'],
      problem: [
        "Roles may inherit other roles (`ADMIN` inherits `MEMBER`, `MEMBER` inherits `VIEWER`), and each role grants some permissions directly. Permissions look like `resource:action`; a wildcard `expense:*` grants every `expense:` action and `*` grants everything.",
        "Implement `effective(role)` — every permission the role has through inheritance — and `can(role, permission)` with wildcard support. A cyclic configuration must be rejected with an error that **names the cycle**. Results should be computed once per role, not on every query."
      ],
      examples: [
        { in: 'VIEWER: group:view, expense:view\nMEMBER inherits VIEWER: expense:create\nADMIN inherits MEMBER: expense:*\ncan(ADMIN, expense:delete)', out: 'true', why: "The wildcard `expense:*` covers `expense:delete`." },
        { in: 'misconfiguration: VIEWER inherits OWNER, OWNER inherits ADMIN', out: 'error: role cycle: ADMIN -> MEMBER -> VIEWER -> OWNER -> ADMIN' }
      ],
      constraints: ["Up to 10⁴ roles and 10⁵ inheritance edges", "Permission checks happen on every request — they must be fast", "Configuration can change at run time"],
      hints: [
        "Roles and their *inherits* edges form a directed graph. A role's effective permissions are the union over every role reachable from it.",
        "DFS with memoisation computes each role once. Keep the roles on the **current DFS path**: reaching a role that is still on the path closes a cycle.",
        "For wildcards, match `expense:*` against any permission starting with `expense:` — including the colon, so `expense*` mistakes cannot match `expenses:…`."
      ],
      approaches: [
        { name: 'BFS per query', idea: 'Walk the inheritance graph on every `can` call', time: 'O(V + E) per query', space: 'O(V)' },
        { name: 'Memoised DFS', idea: 'Compute each role\'s closure once, reuse it for every query', time: 'O(V + E + total permissions) once; O(p) per query', space: 'O(V · p)' },
        { name: 'Precomputed bitsets', idea: 'Number the permissions; each role holds a bitset, OR-ed along edges', time: 'O((V + E) · P / 64)', space: 'O(V · P / 64)' }
      ],
      code: { lang: 'java', file: 'RoleHierarchy.java', src: code`
        import java.util.*;

        public class RoleHierarchy {
            private final Map<String, List<String>> parents = new HashMap<>();     // role -> roles it inherits
            private final Map<String, Set<String>> direct = new HashMap<>();       // role -> granted permissions
            private final Map<String, Set<String>> memo = new HashMap<>();

            void role(String name, List<String> inherits, String... permissions) {
                parents.put(name, inherits);
                direct.put(name, Set.of(permissions));
                memo.clear();                                                      // configuration changed
            }

            Set<String> effective(String role) { return effective(role, new LinkedHashSet<>()); }

            private Set<String> effective(String role, LinkedHashSet<String> path) {
                Set<String> cached = memo.get(role);
                if (cached != null) return cached;
                if (!parents.containsKey(role)) throw new IllegalArgumentException("unknown role " + role);
                if (!path.add(role)) {                                             // still on the current path: a cycle
                    List<String> onPath = new ArrayList<>(path);
                    List<String> cycle = onPath.subList(onPath.indexOf(role), onPath.size());
                    throw new IllegalStateException("role cycle: " + String.join(" -> ", cycle) + " -> " + role);
                }
                Set<String> result = new TreeSet<>(direct.get(role));
                for (String p : parents.get(role)) result.addAll(effective(p, path));
                path.remove(role);
                memo.put(role, Collections.unmodifiableSet(result));
                return memo.get(role);
            }

            /** "expense:*" grants "expense:delete"; "*" grants everything. */
            boolean can(String role, String permission) {
                for (String p : effective(role)) {
                    if (p.equals("*") || p.equals(permission)) return true;
                    if (p.endsWith(":*") && permission.startsWith(p.substring(0, p.length() - 1))) return true;
                }
                return false;
            }

            public static void main(String[] args) {
                RoleHierarchy h = new RoleHierarchy();
                h.role("VIEWER", List.of(), "group:view", "expense:view");
                h.role("MEMBER", List.of("VIEWER"), "expense:create", "expense:edit-own");
                h.role("ADMIN", List.of("MEMBER"), "expense:*", "member:invite");
                h.role("OWNER", List.of("ADMIN"), "group:delete", "member:*");
                h.role("AUDITOR", List.of("VIEWER"), "report:export");
                System.out.println("MEMBER  -> " + h.effective("MEMBER"));
                System.out.println("OWNER   -> " + h.effective("OWNER"));
                for (String[] q : new String[][] {{"MEMBER", "expense:delete"}, {"ADMIN", "expense:delete"},
                        {"AUDITOR", "report:export"}, {"AUDITOR", "expense:create"}, {"OWNER", "member:remove"}}) {
                    System.out.println("can(" + q[0] + ", " + q[1] + ") = " + h.can(q[0], q[1]));
                }
                h.role("VIEWER", List.of("OWNER"), "group:view");                 // misconfiguration
                try {
                    h.effective("ADMIN");
                } catch (IllegalStateException e) {
                    System.out.println(e.getMessage());
                }

                Random rnd = new Random(18);                                       // differential test vs BFS closure
                for (int t = 0; t < 200; t++) {
                    RoleHierarchy g = new RoleHierarchy();
                    Map<String, List<String>> par = new HashMap<>();
                    Map<String, Set<String>> dir = new HashMap<>();
                    int n = 2 + rnd.nextInt(10);
                    for (int i = 0; i < n; i++) {
                        List<String> ps = new ArrayList<>();
                        for (int j = 0; j < i; j++) if (rnd.nextInt(4) == 0) ps.add("R" + j);   // smaller index: a DAG
                        Set<String> perms = new HashSet<>();
                        for (int k = rnd.nextInt(3); k > 0; k--) perms.add("p" + rnd.nextInt(8));
                        par.put("R" + i, ps);
                        dir.put("R" + i, perms);
                        g.role("R" + i, ps, perms.toArray(String[]::new));
                    }
                    for (int i = 0; i < n; i++) {
                        Set<String> expected = new TreeSet<>();
                        Deque<String> q = new ArrayDeque<>(List.of("R" + i));
                        Set<String> seen = new HashSet<>(q);
                        while (!q.isEmpty()) {
                            String r = q.poll();
                            expected.addAll(dir.get(r));
                            for (String p : par.get(r)) if (seen.add(p)) q.add(p);
                        }
                        if (!expected.equals(g.effective("R" + i))) throw new AssertionError("graph " + t);
                    }
                }
                System.out.println("200 random hierarchies: memoized DFS matches BFS closure");
            }
        }`, out: code`
        MEMBER  -> [expense:create, expense:edit-own, expense:view, group:view]
        OWNER   -> [expense:*, expense:create, expense:edit-own, expense:view, group:delete, group:view, member:*, member:invite]
        can(MEMBER, expense:delete) = false
        can(ADMIN, expense:delete) = true
        can(AUDITOR, report:export) = true
        can(AUDITOR, expense:create) = false
        can(OWNER, member:remove) = true
        role cycle: ADMIN -> MEMBER -> VIEWER -> OWNER -> ADMIN
        200 random hierarchies: memoized DFS matches BFS closure` },
      pitfalls: [
        "Recursing forever on a cyclic configuration instead of detecting it — a whole service can fail on one bad admin edit.",
        "Stale memoised permissions after a role change: invalidate on every configuration update. A stale grant is a security bug.",
        "Sloppy wildcard matching: `expense*` must not match `expenses:delete`; include the separator in the prefix.",
        "Assuming permissions only ever add up: once deny rules exist, evaluation needs explicit precedence."
      ],
      followUps: [
        { q: "Add explicit deny rules — an AUDITOR must never `expense:delete`, even if some inherited role allows it.",
          a: "Evaluate denies first: explicit deny beats explicit allow, which beats the implicit default deny (the model AWS IAM uses). Keep deny permissions in a separate set per role, propagate them through inheritance like grants, and check them — including wildcard denies — before looking at allows. Test the precedence explicitly." },
        { q: "Roles change at run time and 50 service instances cache effective permissions. How do you keep them correct?",
          a: "Version the role configuration. Publish a change event when it changes; instances drop their caches (or reload that version) on the event, with a short TTL as a safety net in case an event is missed. Revocations must propagate within the agreed window — that is a security requirement, so monitor the propagation lag." },
        { q: "When is role-based access control not enough?",
          a: "When decisions depend on attributes or relationships rather than static roles — *the owner of this expense*, *members of this group*, *users in this region during business hours*. Use attribute-based rules or relationship-based access control in the style of Google's Zanzibar paper (tuples such as *user U is a member of group G*, *expense E belongs to group G*), evaluated by a dedicated policy service." }
      ],
      rubric: [
        "Models roles as a graph and effective permissions as reachability.",
        "Implements memoised DFS with correct cycle detection and a helpful error message.",
        "Gets wildcard semantics right and tests them.",
        "Discusses cache invalidation, deny precedence and the limits of RBAC."
      ],
      notes: [
        "Using a `LinkedHashSet` for the current path gives both O(1) membership checks and the insertion order needed to print the cycle in the error message.",
        "The differential test builds 200 random acyclic hierarchies and compares the memoised DFS with a plain BFS closure computed from scratch.",
        "In Spring Security, `RoleHierarchyImpl` provides role inheritance for `hasRole` checks; fine-grained permissions with wildcards are usually implemented in your own permission service, as here."
      ]
    },
    {
      type: 'design',
      title: 'Design round: authentication & SSO for a microservices platform',
      lead: 'A senior-level design that ties together OAuth, tokens, gateways and revocation — the identity backbone of the course\'s Airbnb project.',
      kind: 'HLD', difficulty: 'Hard', minutes: 50,
      prompt: "Design authentication and authorization for an Airbnb-style platform: users sign in with GitHub or e-mail and password; a web SPA and mobile apps call APIs through a gateway; 15 backend services authorize requests and call each other. Support *log out from all devices*, and make role changes take effect within a minute.",
      stages: [
        { t: 'Requirements and threat model', ask: 'Who are the actors, what are the assets, and what could go wrong?', points: [
          "Actors: guests and hosts (users), administrators, services, external identity providers (GitHub).",
          "Assets: credentials, tokens, personal data, payment actions.",
          "Threats: stolen or replayed tokens, CSRF against cookie sessions, privilege escalation (IDOR), compromised services moving laterally.",
          "Non-functionals: low latency on every request, logins highly available, revocation within a minute, auditable admin actions."
        ] },
        { t: 'Components', ask: 'Which components are involved, and who trusts whom?', diagram: { kind: 'tiers', tiers: [
          { label: 'Clients', nodes: [{ t: 'Web SPA', s: 'via a BFF: session cookie only', tone: 'blue' }, { t: 'Mobile apps', s: 'auth code + PKCE, secure storage', tone: 'blue' }] },
          { label: 'Edge', via: 'HTTPS', nodes: [{ t: 'BFF', s: 'holds tokens server-side', tone: 'gray' }, { t: 'API gateway', s: 'validates tokens, rate limits, deny-list', tone: 'orange' }] },
          { label: 'Identity', via: 'OIDC', nodes: [{ t: 'Authorization server', s: 'OIDC provider, token issuance, JWKS', tone: 'green' }, { t: 'GitHub', s: 'federated identity provider', tone: 'gray' }, { t: 'Permission service', s: 'roles and fine-grained grants', tone: 'purple' }] },
          { label: 'Services', via: 'JWT (token relay) + mTLS', nodes: [{ t: '15 resource servers', s: 'local JWT validation via cached JWKS', tone: 'red' }] }
        ] }, points: [
          "The authorization server (for example Spring Authorization Server or Keycloak) is the only component that issues tokens; it federates GitHub logins and links them to local accounts.",
          "Resource servers validate tokens locally with cached keys, so the authorization server is not on the hot path of every request."
        ] },
        { t: 'Login flows per client', ask: 'Which OAuth flow does each client use, and where do tokens live?', points: [
          "**SPA**: a backend-for-frontend runs the authorization code flow with PKCE and keeps tokens server-side; the browser only holds an `HttpOnly`, `Secure`, `SameSite` session cookie — no tokens in JavaScript-readable storage.",
          "**Mobile**: authorization code + PKCE through the system browser (not an embedded web view); tokens in the platform's secure storage.",
          "**GitHub federation**: the authorization server redirects to GitHub, receives the identity, and provisions or links the local user by GitHub's stable numeric user id — not by e-mail, which can change or be unverified.",
          "**E-mail and password**: handled by the authorization server only, with Argon2id/bcrypt hashing, rate limiting and optional MFA (Session 16)."
        ] },
        { t: 'Tokens and service-to-service calls', ask: 'What goes into an access token, and how do services call each other?', points: [
          "Access tokens: JWTs valid for 5–10 minutes, audience-restricted per API, carrying the user id and **coarse** roles or scopes — not every fine-grained permission (size limits and staleness).",
          "The gateway validates tokens and relays them; services re-validate (defence in depth) and ask the permission service (cached for under a minute) for fine-grained decisions.",
          "Service to service: the client-credentials grant for calls without user context, and **token exchange** (RFC 8693) to call a downstream service on behalf of a user with a narrower scope; mutual TLS (via a service mesh) authenticates the services themselves."
        ] },
        { t: 'Revocation, rotation and availability', ask: 'A device is stolen. The signing key must change. The authorization server is down. What happens?', points: [
          "Refresh tokens rotate on every use; reusing an old one revokes the whole token family (theft detection). *Log out everywhere* revokes all refresh tokens for the user.",
          "For immediate cut-off, the gateway checks a small deny-list of user ids or token ids (TTL = access-token lifetime); otherwise access ends within the access-token lifetime.",
          "Signing keys rotate through the JWKS endpoint: publish, switch, retire after the maximum token lifetime.",
          "If the authorization server is down, already-issued tokens keep working (local validation with cached keys); new logins and refreshes fail — so run it highly available across zones and alert on errors."
        ] }
      ],
      followUps: [
        { q: "Why not put all of a user's permissions into the JWT?",
          a: "Tokens travel on every request and many proxies limit header sizes to a few kilobytes; permissions change, and a token would carry stale grants until it expires; and every service would see every permission, which leaks more information than needed. Keep coarse roles or scopes in the token and resolve fine-grained permissions in the service, with a short-lived cache." },
        { q: "A user's account is compromised. How quickly can you cut off access, and how?",
          a: "Immediately for new sessions: revoke all refresh tokens and force re-authentication with MFA. For tokens already issued, add the user id (or token ids) to the gateway's deny-list until the longest access-token lifetime has passed — otherwise the window equals that lifetime (5–10 minutes). Then notify the user, review recent actions in the audit log and reset credentials." },
        { q: "How do you migrate existing username/password users to *Sign in with GitHub* without account duplication?",
          a: "Offer *link GitHub* from inside an authenticated session, so the link is proven by both sides; store the GitHub numeric id on the existing account. Do not auto-merge by e-mail address unless the provider marks it verified and you accept that risk. On first GitHub login without a link, create a new account or ask the user to sign in to the existing one first." }
      ],
      rubric: [
        "Starts from a threat model and explicit requirements (revocation time, client types).",
        "Chooses the right flow per client: BFF for the SPA, PKCE for mobile, client credentials or token exchange for services.",
        "Designs tokens deliberately: lifetimes, audiences, claim size, local validation.",
        "Covers revocation, key rotation and the authorization server's failure behaviour.",
        "Handles identity federation and account linking safely."
      ],
      notes: [
        "The essential trade-off throughout is *local validation versus central control*: JWTs make every request fast and independent of the identity service, at the price of revocation latency, which you buy back with short lifetimes, refresh-token control and a small deny-list.",
        "Interviewers often probe the SPA token-storage question; the backend-for-frontend pattern is the currently recommended answer for browser apps.",
        "Mention auditing: who granted which role and when, and every login and token issuance, are essential for incident response."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: OAuth 2.0, OpenID Connect & tokens',
      lead: 'Precise vocabulary matters in identity interviews. Each answer should say which party does what, and which attack a mechanism prevents.',
      qa: [
        { level: 1, q: "OAuth 2.0 versus OpenID Connect — what does each give you?",
          a: "**OAuth 2.0** is an authorization framework: it lets a client obtain an **access token** to call an API on behalf of a resource owner (a user) without learning the user's password, with the user's consent limited to certain scopes. It does not define how the client learns *who* the user is. **OpenID Connect** is an identity layer on top of OAuth 2.0: it adds the **ID token** (a signed JWT with claims such as `sub`, `iss`, `aud`, `exp`, `nonce`), the `userinfo` endpoint, standard scopes (`openid`, `profile`, `email`) and discovery. *Log in with X* is OpenID Connect (or, for GitHub, OAuth 2.0 plus a user API call); *let this app read my repositories* is OAuth 2.0.",
          follow: ["Why is using an access token as proof of identity a mistake?"] },
        { level: 2, q: "Explain the authorization code flow with PKCE and the attack PKCE prevents.",
          a: [
            "1. The client creates a random `code_verifier` and its `code_challenge = BASE64URL(SHA-256(verifier))`.",
            "2. It redirects the user to the authorization server with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state` and the `code_challenge`.",
            "3. The user authenticates and consents; the server redirects back with a short-lived, single-use authorization `code` and the `state`.",
            "4. The client checks `state`, then exchanges the code at the token endpoint, sending the `code_verifier`; the server recomputes the challenge and only then issues tokens.",
            "**Attack prevented**: authorization-code interception or injection — a malicious app or a leaked log captures the code, but cannot redeem it without the verifier, which never left the legitimate client."
          ],
          follow: ["Why is the plain (non-hashed) PKCE method discouraged?"] },
        { level: 2, q: "`state` versus `nonce` — what does each protect against?",
          a: "`state` is an unguessable value the client generates and ties to the user's browser session before redirecting; on the callback, the client rejects responses whose `state` does not match. It prevents **CSRF on the redirect endpoint** — an attacker making the victim's browser complete a login with the attacker's authorization code (login CSRF). `nonce` (OpenID Connect) is placed in the authentication request and returned inside the ID token; the client checks it to make sure the ID token was issued for *this* request, preventing **ID-token replay**. PKCE overlaps with `state` for code-injection protection, but `state` is still used to carry and verify the client's own context.",
          follow: ["Where should the client store `state` while the user is at the provider?"] },
        { level: 2, q: "Access token, refresh token and ID token — what are their lifetimes, audiences and storage rules?",
          a: "**Access token**: presented to resource servers (audience = the API); short-lived (minutes); may be a JWT or opaque; stored as briefly and safely as possible. **Refresh token**: presented only to the authorization server to get new access tokens; long-lived (days or weeks), ideally rotated on every use and revocable; never sent to APIs; stored server-side (BFF) or in secure platform storage on mobile. **ID token**: a JWT for the **client** (audience = the client id) describing the authentication event and the user; used to establish the client's session, not to call APIs. Mixing them up — sending ID tokens to APIs, keeping refresh tokens in browser storage — is a classic security flaw.",
          follow: ["Why must refresh tokens never reach the browser in a SPA?"] },
        { level: 2, q: "Where should a browser single-page app keep its tokens?",
          a: "`localStorage`/`sessionStorage` is readable by any script on the page, so an XSS bug — including one in a third-party dependency — steals the tokens. In-memory storage limits the exposure but tokens are lost on reload and are still reachable by injected scripts. The recommended pattern is a **backend-for-frontend (BFF)**: a server-side component performs the OAuth flow, keeps access and refresh tokens server-side, and gives the browser only an `HttpOnly`, `Secure`, `SameSite` session cookie; the BFF attaches tokens when proxying API calls. That moves the CSRF concern to the cookie (handled by `SameSite` and CSRF tokens) and keeps tokens out of JavaScript entirely.",
          follow: ["What new responsibilities does the BFF take on?"] },
        { level: 2, q: "How does a resource server validate a JWT, and what are the classic JWT attacks?",
          a: "It parses the header and payload, fetches the issuer's public key by `kid` from a cached JWKS, verifies the signature **using the algorithm configured for that key**, and validates `iss`, `aud`, `exp`/`nbf` (with small clock skew) and required scopes; only then does it build the security context. Classic attacks: `alg: none` (unsigned tokens accepted by naive libraries); algorithm confusion (using the RSA public key as an HMAC secret); missing audience checks (accepting tokens minted for another API); trusting header parameters such as `jku`/`x5u` that point to attacker keys; and long-lived tokens that remain useful after theft. Use a maintained library with an explicit algorithm allow-list, and keep lifetimes short.",
          follow: ["Why should the server never let the token choose its own algorithm?"] },
        { level: 3, q: "How would you implement *log out from all devices* when access tokens are JWTs?",
          a: "Separate the two token types. Store refresh tokens (or their families) server-side, keyed by user and device, and revoke them all on *log out everywhere* — no new access tokens can be minted. Already-issued access tokens stay valid until they expire, so keep them short (5–10 minutes). If that window is unacceptable, add a **deny-list** checked at the gateway: either specific `jti` values or a per-user *tokens issued before T are invalid* timestamp, stored in Redis with a TTL equal to the maximum access-token lifetime. Alternatively use opaque access tokens with introspection for instant revocation, at the cost of a lookup per request (cached briefly).",
          follow: ["Which is cheaper to check at the gateway: a jti deny-list or a per-user cut-off timestamp?"] },
        { level: 3, q: "How does refresh-token rotation with reuse detection work, and why is it worth it?",
          a: "Every time a client uses a refresh token, the authorization server issues a **new** refresh token and invalidates the old one, recording that both belong to the same *family*. A legitimate client always holds the latest token. If an **old**, already-used refresh token is ever presented again, someone has a copy — either the attacker or the legitimate client after the attacker used it first — so the server revokes the entire family and forces re-authentication. This limits the damage of a stolen refresh token to a short race and makes theft detectable, which is why it is recommended for public clients such as SPAs and mobile apps.",
          follow: ["What about legitimate concurrent refreshes from two browser tabs?"] },
        { level: 2, q: "GitHub OAuth App or GitHub App — and what should a *Sign in with GitHub* integration store?",
          a: "An **OAuth App** acts on behalf of a user with broad scopes; a **GitHub App** has fine-grained permissions, short-lived tokens, and can act as itself or on behalf of a user within the repositories where it is installed — GitHub generally recommends GitHub Apps for integrations. For *login only*, either works with minimal scopes. Store GitHub's **numeric user id** (stable) linked to your local user — not the login name (users can rename) or the e-mail (can change or be unverified). Do not keep GitHub access tokens unless you actually call GitHub's API later; if you must, encrypt them at rest and respect their expiry.",
          follow: ["What happens to your link if the user renames their GitHub account?"] },
        { level: 3, q: "Service-to-service authentication in a microservice platform — what are the options and trade-offs?",
          a: "**Mutual TLS**, usually through a service mesh with workload identities (for example SPIFFE IDs), authenticates the calling service at the transport level, encrypts traffic and enables identity-based policies (*orders may call payments*), with automated certificate rotation. **OAuth client credentials** gives each service a JWT with scopes for application-level authorization; easy to inspect and propagate through gateways. **Token exchange** (RFC 8693) lets a service call downstream *on behalf of the user* with a narrower token, preserving end-user context for authorization and audit. Static API keys are simple but hard to rotate and scope — avoid them internally. Mature platforms combine mTLS (who is calling) with tokens (on whose behalf, with which permissions) — a zero-trust posture in which the network location alone grants nothing.",
          follow: ["Why is *it's inside the VPC* not an authorization strategy?"] }
      ],
      notes: [
        "Identity interviews reward exact terms: *audience*, *issuer*, *PKCE verifier*, *token family*. Use them precisely and say which component checks what.",
        "If you have implemented GitHub login in this course, describe the identity-linking decision (numeric id versus e-mail) — it is a real design choice with security consequences.",
        "For Senior roles, expect the conversation to move from flows to operations: key rotation, revocation windows and what happens when the identity provider is unavailable."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "What does this program print?", code: { src: code`
        import java.util.Base64;

        public class Main {
            public static void main(String[] args) {
                byte[] bytes = {(byte) 0xfb, (byte) 0xff, (byte) 0xfe};
                System.out.println(Base64.getEncoder().encodeToString(bytes) + " "
                        + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
            }
        }`, out: '+//+ -__-' },
      options: ['`+//+ -__-`', '`+//+ +//+`', '`-__- +//+`', '`+//+ +__+`'], answer: 0,
      why: "The 24 bits split into four 6-bit values 62, 63, 63, 62. Standard Base64 maps them to `+` and `/`; the URL-safe alphabet used by JWTs and PKCE maps them to `-` and `_`, so the value can travel in URLs unescaped." },
    { level: 2, q: "A backend service must call another service's API with no user involved. Which OAuth grant should it use?",
      options: ['Client credentials', 'Authorization code', 'Implicit', 'Resource owner password'], answer: 0,
      why: "Client credentials lets a confidential client obtain a token for itself. The implicit and password grants are deprecated; the authorization code flow needs a user." },
    { level: 3, q: "A resource server accepts any JWT whose signature verifies with the issuer's key, and a token minted by the same issuer for a different API is accepted. Which check is missing?",
      options: ['The audience (`aud`) check', 'The expiry check', 'The `kid` check', 'HTTPS'], answer: 0,
      why: "The issuer signs tokens for many APIs. Only the audience claim says which API a token is meant for; without checking it, a token for a low-privilege API works everywhere." },
    { level: 3, q: "With refresh-token rotation, an already-used refresh token is presented again. What should the authorization server do?",
      options: ['Treat it as theft: revoke the entire token family and require re-authentication', 'Accept it and issue new tokens', 'Return the previously issued tokens again', 'Ignore it silently'], answer: 0,
      why: "Only a copy of the token can be reused after rotation, so the family is compromised. Revoking it limits the attacker's window to a single refresh." },
    { level: 2, q: "Why is PKCE recommended even for confidential, server-side clients?",
      options: ['It binds the authorization code to the client instance that started the flow, so a leaked or injected code cannot be redeemed', 'It encrypts the access token', 'It replaces the client secret entirely', 'It makes the redirect URI optional'], answer: 0,
      why: "Codes can leak via logs, referrers or malicious redirects. Without the verifier held by the original client, an intercepted code is worthless — which is why OAuth 2.1 requires PKCE for all clients." }
  ]
});
