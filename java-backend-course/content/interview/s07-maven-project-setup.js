/* Interview pack — Session 7: Maven plugins, archetypes & project setup (Git & GitHub) */
COURSE.prep(7, {
  deepDives: [
    {
      title: 'Deep dive: how Maven really builds — lifecycle bindings, the reactor & reproducibility',
      lead: 'Phases do nothing by themselves; plugins do. Knowing what runs, in which order and with which versions is what senior engineers are expected to debug.',
      table: { head: ['Phase (jar packaging)', 'Goal bound by default', 'What it does'], rows: [
        ['`process-resources`', '`resources:resources`', 'Copies `src/main/resources` into `target/classes`'],
        ['`compile`', '`compiler:compile`', 'Compiles `src/main/java`'],
        ['`test-compile`', '`compiler:testCompile`', 'Compiles `src/test/java`'],
        ['`test`', '`surefire:test`', 'Runs unit tests (`*Test`)'],
        ['`package`', '`jar:jar`', 'Builds the JAR (Spring Boot adds `spring-boot:repackage`)'],
        ['`verify`', 'nothing by default', 'Where `failsafe:verify` (integration tests) and quality checks are bound'],
        ['`install` / `deploy`', '`install:install` / `deploy:deploy`', 'Copy the artifact to `~/.m2` / to a remote repository']
      ] },
      points: [
        "Running a phase runs **every earlier phase** of its lifecycle — `mvn verify` compiles, tests and packages first. `mvn clean verify` runs two lifecycles: *clean*, then *default*.",
        "The **reactor** reads every module, builds the graph of inter-module dependencies and sorts it topologically. `-pl api -am` builds a module **and** what it needs; `-pl domain -amd` builds it **and** everything depending on it.",
        "**Mediation** picks the *nearest* version, then the *first declared* — not the newest. `<dependencyManagement>` and imported BOMs (`<scope>import</scope>`) pin versions without adding dependencies.",
        "**Scopes**: `compile` (default, everywhere), `provided` (the container supplies it at run time), `runtime` (needed only to run, e.g. JDBC drivers), `test`, and `import` (BOMs only). `<optional>` dependencies do not propagate.",
        "**Reproducible builds**: set `project.build.outputTimestamp`, pin every plugin version, avoid SNAPSHOTs and version ranges in releases — two builds of the same commit should produce identical JARs.",
        "**Speed**: `mvn -T 1C` builds independent modules in parallel (one thread per core), and CI caches `~/.m2/repository` keyed by a hash of all `pom.xml` files."
      ],
      code: { lang: 'xml', file: 'pom.xml (excerpt)', src: code`
        <properties>
          <java.version>21</java.version>
          <!-- reproducible builds: fixed timestamps inside the JAR -->
          <project.build.outputTimestamp>2026-11-01T00:00:00Z</project.build.outputTimestamp>
        </properties>

        <dependencyManagement>
          <dependencies>
            <!-- a BOM pins versions for a whole family of libraries -->
            <dependency>
              <groupId>org.springframework.cloud</groupId>
              <artifactId>spring-cloud-dependencies</artifactId>
              <version>2025.1.4</version>
              <type>pom</type>
              <scope>import</scope>
            </dependency>
          </dependencies>
        </dependencyManagement>

        <build>
          <plugins>
            <plugin>
              <groupId>org.apache.maven.plugins</groupId>
              <artifactId>maven-enforcer-plugin</artifactId>
              <version>3.6.3</version>
              <executions>
                <execution>
                  <id>enforce</id>
                  <goals><goal>enforce</goal></goals>
                  <configuration>
                    <rules>
                      <requireMavenVersion><version>[3.9,)</version></requireMavenVersion>
                      <dependencyConvergence/>   <!-- fail on conflicting transitive versions -->
                    </rules>
                  </configuration>
                </execution>
              </executions>
            </plugin>
          </plugins>
        </build>` },
      notes: [
        "The phase table is the default binding for `jar` packaging; other packagings (`war`, `pom`) bind different goals. `mvn help:effective-pom` shows exactly which plugins and versions your build uses after inheritance from the Spring Boot parent.",
        "`dependencyConvergence` makes Maven fail when two paths in the tree request different versions of the same artifact. It is noisy on big projects at first, but every message is a potential `NoSuchMethodError` in production.",
        "Reproducibility matters for security (anyone can rebuild and verify a release artifact) and for caching: build caches only work when the same inputs produce the same outputs."
      ]
    },
    {
      title: 'Deep dive: Git internals — objects, refs, merge vs rebase & recovering anything',
      lead: 'Git becomes predictable once you see it as a content-addressed database of snapshots with a few movable pointers on top.',
      diagram: { kind: 'graph', cw: 170, ch: 96, bw: 128, nodes: [
        { id: 'c1', t: 'C1', s: 'initial commit', x: 0, y: 1, tone: 'gray' },
        { id: 'c2', t: 'C2', s: 'merge base', x: 1, y: 1, tone: 'gray' },
        { id: 'c3', t: 'C3', s: 'main', x: 2, y: 0, tone: 'blue' },
        { id: 'f1', t: 'F1', s: 'feature', x: 2, y: 2, tone: 'green' },
        { id: 'f2', t: 'F2', s: 'feature tip', x: 3, y: 2, tone: 'green' },
        { id: 'm', t: 'M', s: 'merge commit: 2 parents', x: 4, y: 1, tone: 'purple' }
      ], edges: [['c1', 'c2'], ['c2', 'c3'], ['c2', 'f1'], ['f1', 'f2'], ['c3', 'm'], ['f2', 'm']] },
      points: [
        "Git stores **objects** named by a hash of their content: *blobs* (file contents), *trees* (directories), *commits* (a tree, parent commits, author and message). Identical content is stored once.",
        "A **branch** is a movable pointer — a file holding a commit id — and `HEAD` points at the current branch. Creating a branch is O(1), which is why short-lived branches are cheap.",
        "**Merge** creates a commit with two parents using a three-way merge against the merge base. **Rebase** replays your commits onto a new base, producing *new* commits with new ids — never rebase commits that others have already pulled.",
        "Committed work is hard to lose: `git reflog` records every position `HEAD` has had, so a bad `reset --hard` or a deleted branch can be restored with `git branch rescue <id>` until garbage collection prunes unreachable objects (weeks later by default).",
        "`git bisect` binary-searches history for the commit that introduced a bug: about log₂(n) test runs — roughly 10 for 1,000 commits — and `git bisect run ./test.sh` automates it.",
        "At scale, teams use **trunk-based development**: short-lived branches, required reviews and CI checks, feature flags for unfinished work, and tags or release branches for versions."
      ],
      code: { lang: 'bash', file: 'recover-and-bisect.sh', src: code`
        # undo a bad reset --hard: find the lost commit in the reflog and point a branch at it
        git reflog --date=relative | head -5
        git branch rescue HEAD@{2}

        # find the commit that broke the build, automatically
        git bisect start
        git bisect bad                 # current commit is broken
        git bisect good v1.4.0         # last known good release
        git bisect run ./mvnw -q -DskipITs test
        git bisect reset` },
      notes: [
        "In the diagram, `M` is a merge commit with parents `C3` and `F2`. A rebase of the feature branch would instead create `F1'` and `F2'` on top of `C3` — new commits with new ids — and history would become a straight line.",
        "Squash merging (common on GitHub) turns a whole pull request into one commit on `main`. History stays readable, but the individual commits of the branch disappear from `main`, so keep pull requests small and focused.",
        "Uncommitted work is a different story: `reset --hard` destroys uncommitted changes for good, apart from IDE local history. Commit early and often on your own branch; you can always clean history before merging."
      ]
    }
  ],

  stretch: [
    "Turn the course workspace into a multi-module build (`common`, `domain`, `api`, `app`) and add `maven-enforcer-plugin` with `requireMavenVersion` and `dependencyConvergence`; fix every violation it reports.",
    "Make the build reproducible: set `project.build.outputTimestamp`, build twice from clean checkouts and compare the JARs with `sha256sum`.",
    "Practise recovery: make three commits, run `git reset --hard HEAD~3`, restore them from `git reflog`, then find a deliberately introduced bug with `git bisect run`."
  ],

  rounds: [
    {
      type: 'coding',
      title: 'Coding round: build order for a multi-module project (topological sort)',
      lead: 'Course Schedule II in disguise — the algorithm Maven\'s reactor runs on every multi-module build, including cycle reporting and parallel waves.',
      difficulty: 'Medium', minutes: 35, lc: 210, pattern: ['topo-sort', 'graph'],
      problem: [
        "A project has `n` modules numbered `0…n−1` and a list of dependencies `deps[i] = [a, b]` meaning **module `a` depends on module `b`**, so `b` must be built first.",
        "Return a valid build order. If several modules are ready at the same time, build the one with the **smallest index** first, so every build produces the same order. If the dependencies contain a cycle, return an empty array — and, as Maven does, be able to report one cycle."
      ],
      examples: [
        { in: 'n = 2, deps = [[1,0]]', out: '[0, 1]' },
        { in: 'n = 4, deps = [[1,0],[2,0],[3,1],[3,2]]', out: '[0, 1, 2, 3]', why: "Modules 1 and 2 both become ready after 0; the smaller index goes first." },
        { in: 'n = 2, deps = [[0,1],[1,0]]', out: '[]  (cycle: 0 -> 1 -> 0)' }
      ],
      constraints: ["`1 ≤ n ≤ 2000`", "`0 ≤ deps.length ≤ n × (n − 1)`", "All pairs are distinct"],
      hints: [
        "Model modules as nodes and *a depends on b* as an edge `b → a`. What property must every valid build order satisfy?",
        "Kahn's algorithm: start with modules that depend on nothing; when a module is built, decrement the count of unbuilt dependencies of every module that depends on it.",
        "If fewer than n modules come out, the rest lie on or behind a cycle. A **min-heap** instead of a FIFO queue gives the deterministic order; a three-colour DFS can print the actual cycle."
      ],
      approaches: [
        { name: 'Brute force', idea: 'Repeatedly scan for any module whose dependencies are all built', time: 'O(n · (n + E))', space: 'O(n)' },
        { name: 'DFS post-order', idea: 'Build a module after recursively building its dependencies; a grey node means a cycle', time: 'O(n + E)', space: 'O(n) recursion' },
        { name: 'Kahn (BFS)', idea: 'Queue of ready modules; decrement in-degrees of dependents', time: 'O(n + E)', space: 'O(n + E)' },
        { name: 'Kahn + min-heap', idea: 'Same, but always take the smallest ready index — deterministic order', time: 'O((n + E) log n)', space: 'O(n + E)' }
      ],
      code: { lang: 'java', file: 'ReactorOrder.java', src: code`
        import java.util.*;

        public class ReactorOrder {
            /** deps[i] = {a, b}: a depends on b. Smallest ready index first; empty array = cycle. */
            static int[] buildOrder(int n, int[][] deps) {
                List<List<Integer>> dependents = new ArrayList<>();
                for (int i = 0; i < n; i++) dependents.add(new ArrayList<>());
                int[] waiting = new int[n];                              // unbuilt dependencies per module
                for (int[] d : deps) { dependents.get(d[1]).add(d[0]); waiting[d[0]]++; }
                PriorityQueue<Integer> ready = new PriorityQueue<>();
                for (int i = 0; i < n; i++) if (waiting[i] == 0) ready.add(i);
                int[] order = new int[n];
                int k = 0;
                while (!ready.isEmpty()) {
                    int m = ready.poll();
                    order[k++] = m;
                    for (int d : dependents.get(m)) if (--waiting[d] == 0) ready.add(d);
                }
                return k == n ? order : new int[0];
            }

            /** Groups of modules that can be built in parallel, like mvn -T. */
            static List<List<Integer>> waves(int n, int[][] deps) {
                List<List<Integer>> dependents = new ArrayList<>();
                for (int i = 0; i < n; i++) dependents.add(new ArrayList<>());
                int[] waiting = new int[n];
                for (int[] d : deps) { dependents.get(d[1]).add(d[0]); waiting[d[0]]++; }
                List<Integer> current = new ArrayList<>();
                for (int i = 0; i < n; i++) if (waiting[i] == 0) current.add(i);
                List<List<Integer>> out = new ArrayList<>();
                while (!current.isEmpty()) {
                    out.add(current);
                    List<Integer> next = new ArrayList<>();
                    for (int m : current) for (int d : dependents.get(m)) if (--waiting[d] == 0) next.add(d);
                    Collections.sort(next);
                    current = next;
                }
                return out;
            }

            /** One cycle, as "a -> b -> ... -> a" (a depends on b ...), via three-colour DFS. */
            static List<Integer> findCycle(int n, int[][] deps) {
                List<List<Integer>> needs = new ArrayList<>();
                for (int i = 0; i < n; i++) needs.add(new ArrayList<>());
                for (int[] d : deps) needs.get(d[0]).add(d[1]);
                int[] colour = new int[n], parent = new int[n];           // 0 new, 1 on stack, 2 done
                for (int s = 0; s < n; s++) {
                    if (colour[s] == 0) {
                        List<Integer> c = dfs(s, needs, colour, parent);
                        if (c != null) return c;
                    }
                }
                return List.of();
            }

            private static List<Integer> dfs(int u, List<List<Integer>> g, int[] colour, int[] parent) {
                colour[u] = 1;
                for (int v : g.get(u)) {
                    if (colour[v] == 1) {                                 // back edge closes a cycle
                        List<Integer> cyc = new ArrayList<>();
                        for (int x = u; x != v; x = parent[x]) cyc.add(x);
                        cyc.add(v);
                        Collections.reverse(cyc);
                        cyc.add(v);
                        return cyc;
                    }
                    if (colour[v] == 0) {
                        parent[v] = u;
                        List<Integer> c = dfs(v, g, colour, parent);
                        if (c != null) return c;
                    }
                }
                colour[u] = 2;
                return null;
            }

            static List<String> names(String[] mods, List<Integer> idx) { return idx.stream().map(i -> mods[i]).toList(); }

            public static void main(String[] args) {
                System.out.println(Arrays.toString(buildOrder(2, new int[][] {{1, 0}})));
                System.out.println(Arrays.toString(buildOrder(4, new int[][] {{1, 0}, {2, 0}, {3, 1}, {3, 2}})));
                System.out.println(Arrays.toString(buildOrder(2, new int[][] {{0, 1}, {1, 0}})) + " (cycle)");

                String[] mods = {"common", "domain", "persistence", "service", "api", "app", "test-support"};
                int[][] deps = {{1, 0}, {2, 1}, {3, 1}, {3, 2}, {4, 3}, {5, 4}, {5, 2}, {6, 0}};
                System.out.println("build order: " + names(mods, Arrays.stream(buildOrder(mods.length, deps)).boxed().toList()));
                System.out.println("parallel waves: " + waves(mods.length, deps).stream().map(w -> names(mods, w)).toList());
                int[][] cyclic = Arrays.copyOf(deps, deps.length + 1);
                cyclic[deps.length] = new int[] {0, 5};                    // common now depends on app
                System.out.println("cycle: " + String.join(" -> ", names(mods, findCycle(mods.length, cyclic))));
            }
        }`, out: code`
        [0, 1]
        [0, 1, 2, 3]
        [] (cycle)
        build order: [common, domain, persistence, service, api, app, test-support]
        parallel waves: [[common], [domain, test-support], [persistence], [service], [api], [app]]
        cycle: common -> app -> api -> service -> domain -> common` },
      pitfalls: [
        "Edge direction: `[a, b]` means *a needs b*, so the edge for Kahn's algorithm is `b → a`. Getting it backwards produces a reversed order.",
        "Detecting cycles by checking `visited` with only two states in DFS — a node on the current path (grey) must be distinguished from a finished one (black).",
        "Recursive DFS on 10⁵ modules can overflow the stack; Kahn's algorithm is iterative.",
        "Iterating a `HashSet` of ready modules makes the order change between runs — bad for reproducible builds and for debugging."
      ],
      followUps: [
        { q: "How much does `mvn -T 8` help, and what limits the speed-up?",
          a: "The waves show the parallelism: modules in the same wave can be built at once, but the build can never be faster than the **longest dependency chain** (the critical path) — here six waves. With real build times, compute each module's earliest finish time (longest weighted path in the DAG); threads beyond the widest wave sit idle. Breaking a long chain (for example, splitting `service`) often helps more than adding threads." },
        { q: "Only `domain` changed. Which modules must be rebuilt and retested?",
          a: "Everything downstream of it: the set reachable from `domain` along *dependent* edges — `domain`, `persistence`, `service`, `api` and `app`, but not `common` or `test-support`. That is `mvn -pl domain -amd`. Monorepo build systems (Bazel, Gradle's build cache, Maven's incremental extensions) use this affected-set computation to keep CI fast." },
        { q: "Return the lexicographically smallest order by module **name** rather than by index.",
          a: "Put names (or a comparator on names) into the priority queue instead of indices. Complexity stays O((n + E) log n). The key insight is that Kahn's algorithm lets you choose *any* ready node at each step, and a heap makes that choice optimal for a given ordering." }
      ],
      rubric: [
        "States the model (nodes, edge direction) and the cycle condition before coding.",
        "Implements Kahn's algorithm or DFS in O(n + E) and handles cycles explicitly.",
        "Explains determinism (min-heap) and why it matters for reproducible builds.",
        "Connects the result to parallel builds (waves, critical path) and incremental builds (`-amd`)."
      ],
      notes: [
        "Maven's reactor prints its build order at the start of every multi-module build (*Reactor Build Order:*), and when modules depend on each other in a loop it fails with an error naming the cyclic reference — exactly the two outputs this round asks for.",
        "LeetCode 210 accepts any valid order. The smallest-index requirement here is a common interview twist; it changes the queue to a heap and the complexity to O((n + E) log n).",
        "Practise drawing the graph for the module example before coding: it makes the waves and the critical path obvious, which sets up the follow-up questions."
      ]
    },
    {
      type: 'interview',
      title: 'Interview deep dive: Maven, builds & Git',
      lead: 'Build and version-control questions are where interviewers check real-world experience — answer with the commands you would run.',
      qa: [
        { level: 1, q: "What is the difference between a lifecycle phase and a plugin goal? What happens when you run `mvn package`?",
          a: "A **phase** is a named step in a lifecycle (`validate`, `compile`, `test`, `package`, `verify`, `install`, `deploy`); a **goal** is a task provided by a plugin (`compiler:compile`, `surefire:test`, `jar:jar`). Phases do nothing on their own — goals are *bound* to them, by default according to the packaging or explicitly in the POM. `mvn package` runs every phase of the default lifecycle up to and including `package`: resources are processed, main and test code compiled, unit tests run, and the JAR built. In a Spring Boot project, `spring-boot:repackage` then turns the plain JAR into an executable fat JAR.",
          follow: ["How would you run a single goal without a phase?", "How do you skip tests, and why is that dangerous in CI?"] },
        { level: 1, q: "What is the difference between `<dependencyManagement>` and `<dependencies>`, and what is a BOM?",
          a: "`<dependencies>` actually adds libraries to the build. `<dependencyManagement>` only **declares versions** (and scopes or exclusions) for dependencies that may be added later — in this module or in child modules — without adding anything itself. A **BOM** (bill of materials) is a POM consisting mainly of a `dependencyManagement` section; importing it with `<type>pom</type><scope>import</scope>` pins versions for a whole family of artifacts that are known to work together, which is how Spring Boot and Spring Cloud keep hundreds of libraries consistent. You then add dependencies without versions.",
          follow: ["What happens if two imported BOMs pin different versions of the same library?"] },
        { level: 2, q: "Explain Maven dependency scopes, with a real example for each.",
          a: "`compile` (default): needed to compile and run — `spring-boot-starter-webmvc`. `provided`: needed to compile, supplied at run time by the environment — the Servlet API when deploying a WAR to an external Tomcat; it is not packaged. `runtime`: not needed to compile, needed to run — a JDBC driver such as `mysql-connector-j`. `test`: only for compiling and running tests — JUnit, Mockito, Testcontainers. `import`: only inside `dependencyManagement`, to import a BOM. Scopes also affect transitivity: test and provided dependencies of your dependencies are not inherited, which is why a library's test frameworks never leak into your classpath.",
          follow: ["Why should a JDBC driver be `runtime` rather than `compile`?"] },
        { level: 2, q: "SNAPSHOT versus release versions — why should a release never depend on a SNAPSHOT?",
          a: "A `-SNAPSHOT` version is a moving target: the repository may hold many timestamped builds under the same version, and Maven checks for newer ones (daily by default), so the same POM can resolve different code on different days. Releases are immutable — once `1.4.0` is published it must never change. A release that depends on a SNAPSHOT is therefore not reproducible: rebuilding the same tag later can produce a different artifact or fail outright. The release plugin and enforcer rules (`requireReleaseDeps`) block it; use SNAPSHOTs only between modules under active development.",
          follow: ["How do CI-friendly versions (`${revision}`) help with releases?"] },
        { level: 2, q: "After a dependency upgrade the service fails in production with `NoSuchMethodError`. How do you debug it?",
          a: [
            "1. Read the error: it names the class and method signature the caller expected — the caller was compiled against a different version of that class than the one loaded at run time.",
            "2. Find which JAR supplied the class at run time (the stack trace, `-verbose:class`, or the JAR listing inside the fat JAR) and which version the caller expects.",
            "3. Run `mvn dependency:tree -Dverbose -Dincludes=group:artifact` to see every path to the library and which version mediation picked — usually *nearest wins* chose an older version.",
            "4. Fix by pinning the right version in `<dependencyManagement>` (or upgrading the BOM), then add `dependencyConvergence` to the enforcer plugin so the build fails next time.",
            "5. For truly incompatible requirements, consider shading one copy, or upgrading the consumer."
          ],
          follow: ["Why does the code compile fine but fail at run time?"] },
        { level: 2, q: "Merge, rebase or squash — what does each do to history, and what policy would you choose for a team?",
          a: "A **merge** keeps every commit and adds a merge commit with two parents: history is truthful but can become a tangle. A **rebase** replays the branch's commits on top of the target, giving linear history but rewriting commit ids — fine for your own unpublished branch, harmful for shared branches. A **squash merge** combines the pull request into one commit on the main branch: tidy history, one commit per change to revert or bisect, but the branch's intermediate commits are not kept on main. A common team policy: rebase your own branch to stay current, squash-merge small pull requests into `main`, never rewrite `main`, and protect it with required reviews and CI.",
          follow: ["How does squash merging affect `git bisect`?"] },
        { level: 2, q: "You ran `git reset --hard` and lost a day of commits. How do you get them back?",
          a: "Committed work is still in the object database. `git reflog` lists every position `HEAD` has had (`HEAD@{1}`, `HEAD@{2}`, …) with the operation that moved it; find the entry before the reset and run `git branch rescue <id>` (or `git reset --hard <id>` if you are sure). Deleted branches are recovered the same way. If something was only staged, `git fsck --lost-found` can find dangling blobs. Truly uncommitted, unstaged changes are not recoverable by Git — only IDE local history may help. Unreachable objects are pruned by garbage collection after a few weeks, so recover promptly.",
          follow: ["What does the reflog look like on a fresh clone?"] },
        { level: 2, q: "How does `git bisect` work, and when would you use it?",
          a: "You mark a *bad* commit (the bug is present) and a *good* one (it was not); Git checks out the commit halfway between, you test it and mark it good or bad, and Git halves the range again. After about log₂(n) steps — roughly 10 for 1,000 commits — it names the first bad commit. `git bisect run <script>` automates it: the script's exit code (0 good, 1–127 bad, 125 skip) drives the search. Use it for regressions — performance drops, flaky behaviour that became consistent, a test that started failing — when reading the diff of a big release would take far longer. It works best when every commit builds, which is another argument for small, self-contained commits.",
          follow: ["How do you handle commits in the range that don't compile?"] },
        { level: 3, q: "Monorepo or polyrepo for 30 microservices? Discuss the trade-offs and the tooling each needs.",
          a: "A **monorepo** gives atomic cross-service changes (an API change and all its callers in one pull request), one version of shared libraries, easy refactoring and consistent tooling — but needs build tooling that only builds and tests what changed (Maven `-amd`, Gradle or Bazel with remote caching), code ownership rules (`CODEOWNERS`), and CI that scales with the repository. A **polyrepo** gives independent release cadence, smaller CI, clear ownership and permission boundaries — but shared libraries must be versioned and published, version skew between services accumulates, cross-cutting changes need many coordinated pull requests, and you need dependency-update automation. The deciding factors are team structure, how often changes cross service boundaries, and investment in build infrastructure; many companies run a monorepo per domain as a middle ground.",
          follow: ["How do you keep CI time under 15 minutes in a large monorepo?"] },
        { level: 3, q: "Design the CI pipeline for a multi-module Maven project used by 200 engineers.",
          a: [
            "**On every pull request**: build and unit-test only the affected modules (`-pl <changed> -amd`) in parallel (`-T 1C`), with a cache of `~/.m2` keyed by the POM hashes and, ideally, a build cache for module outputs.",
            "**Quality gates**: compiler warnings as errors for new code, static analysis, test coverage on changed lines, the enforcer plugin (convergence, banned dependencies), and dependency vulnerability scanning with an SBOM.",
            "**Integration tests** with Testcontainers in a separate stage (failsafe at `verify`), parallelised across runners.",
            "**Merge queue**: changes are tested against the latest `main` before merging, so `main` stays green as commit volume grows.",
            "**Artifacts**: CI-friendly versions (`${revision}`), reproducible builds, images built once and promoted between environments rather than rebuilt.",
            "**Health**: track build time and flaky tests, quarantine flaky tests automatically with an owner and a deadline, and alert when the pipeline slows down."
          ],
          follow: ["Why build the container image once and promote it instead of rebuilding per environment?"] }
      ],
      notes: [
        "Interviewers rarely expect Maven trivia from a new graduate, but SDE-2 and Senior candidates are expected to have fixed a dependency conflict and to know how to keep a large build fast.",
        "For Git questions, name the commands. *I'd use the reflog* is good; *`git reflog`, then `git branch rescue HEAD@{2}`* is better.",
        "The CI design question is a small system-design round: requirements (speed, safety, scale), components and trade-offs. Structure the answer as stages."
      ]
    }
  ],

  quiz: [
    { level: 2, q: "You run `mvn verify` on a plain `jar` project with no extra plugin configuration. What runs?",
      options: ['Resources, main and test compilation, `surefire:test` and `jar:jar` — but not `install`', 'Only `compiler:compile`', 'Every phase up to `deploy`', 'Both surefire (unit) and failsafe (integration) tests, because `verify` binds failsafe by default'], answer: 0,
      why: "`verify` comes after `package` in the default lifecycle, so everything before it runs. Nothing is bound to `verify` by default — failsafe must be configured explicitly — and `install`/`deploy` come later." },
    { level: 2, q: "A dependency is declared with `<scope>provided</scope>`. Where is it available?",
      options: ['On the compile and test classpaths, but expected to be supplied at run time by the environment — for example, not packaged into a WAR', 'Only at run time', 'Only for tests', 'Everywhere, including inside the packaged artifact'], answer: 0,
      why: "`provided` is for APIs the container or platform supplies, such as the Servlet API on an external Tomcat. You compile against it, but you must not ship your own copy." },
    { level: 2, q: "You rebase a feature branch onto `main` and force-push it, but a teammate had already pulled the old branch. What is the problem?",
      options: ['The rebased commits have new ids, so the teammate\'s copy diverges and old commits can be reintroduced when they merge or pull', 'Rebase deletes the teammate\'s branch on the server', 'Nothing — rebase keeps commit ids unchanged', 'Git refuses to rebase commits that were pushed'], answer: 0,
      why: "Rebase rewrites history by creating new commits. Anyone who based work on the old commits now has a diverged history. Only rebase branches nobody else uses — or coordinate explicitly." },
    { level: 3, q: "Kahn's algorithm on a graph of 6 modules outputs only 4 of them. What can you conclude?",
      options: ['The 2 missing modules are on a dependency cycle or depend on a module that is', 'The graph is disconnected', 'The 2 missing modules have no dependencies at all', 'The algorithm needs a second pass to finish'], answer: 0,
      why: "A module is output only once all its dependencies are output. Modules on a cycle never reach zero remaining dependencies, and neither does anything that depends on them." },
    { level: 2, q: "`git bisect` searches 1,000 commits for the first bad one. About how many test runs does it need?",
      options: ['About 10', 'About 100', 'About 500', 'All 1,000'], answer: 0,
      why: "Each step halves the remaining range, so it needs about log₂(1000) ≈ 10 steps — as long as each commit can be built and tested." }
  ]
});
