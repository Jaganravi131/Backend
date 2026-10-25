COURSE.session({
  no: 7,
  short: 'Maven plugins, archetypes & setup',
  title: 'Maven Plugins, Archetypes & Project Setup',
  covers: [0],
  extra: ['Spring Initializr & the Spring Boot project layout', 'Git & GitHub workflow (from the brochure tech stack)'],
  objectives: [
    "Configure Maven plugins (compiler, surefire, failsafe, JaCoCo, enforcer, Spring Boot) and bind goals to phases.",
    "Generate projects from archetypes and with Spring Initializr; understand the generated Spring Boot POM.",
    "Structure a multi-module build with a parent POM, `dependencyManagement` and `pluginManagement`.",
    "Version your project with Git and collaborate through GitHub branches and pull requests."
  ],
  prereq: "Session 6: POM basics, GAV coordinates, scopes and the lifecycle.",
  slides: [
    {
      type: 'theory',
      title: 'Plugins do the real work',
      lead: 'Maven core only knows the lifecycle. Every action — compiling, testing, packaging — is a **goal** of a **plugin**, bound to a phase.',
      points: [
        "A plugin is a bundle of goals (*mojos*): `compiler:compile`, `surefire:test`, `jar:jar`.",
        "**Executions** bind extra goals to phases, e.g. JaCoCo's `report` goal to `verify`.",
        "`<pluginManagement>` *declares* versions/config for children; `<plugins>` *activates* plugins in this build.",
        "Run any goal directly with `mvn <prefix>:<goal>` — e.g. `mvn dependency:tree`, `mvn spring-boot:run`."
      ],
      table: { head: ['Plugin', 'Default phase', 'Job'], rows: [
        ['`maven-compiler-plugin`', 'compile / test-compile', 'compile `src/main` and `src/test`'],
        ['`maven-surefire-plugin`', 'test', 'run unit tests (`*Test`)'],
        ['`maven-failsafe-plugin`', 'integration-test / verify', 'run integration tests (`*IT`) after packaging'],
        ['`maven-jar-plugin`', 'package', 'build the JAR'],
        ['`spring-boot-maven-plugin`', 'package (`repackage`)', 'executable *fat* JAR, `spring-boot:run`, `build-image`'],
        ['`jacoco-maven-plugin`', 'initialize + verify', 'test coverage report / thresholds'],
        ['`maven-enforcer-plugin`', 'validate', 'fail fast on wrong Java/Maven versions or banned deps']
      ] },
      notes: [
        "Connect to last session: phases are the *what*, plugins are the *how*. The packaging type decides the default bindings — `jar` packaging binds `jar:jar` to `package`.",
        "Most plugins have sensible defaults; you only add configuration to change behaviour. With Spring Boot's parent POM, versions of the common plugins are already managed for you."
      ]
    },
    {
      type: 'practical',
      title: 'Configuring plugins in the POM',
      lead: 'Coverage, integration tests and build rules — the three plugin setups most backend teams add first.',
      code: { lang: 'xml', file: 'pom.xml (build section)', src: code`
        <build>
          <plugins>
            <!-- Unit tests: *Test.java (phase: test) -->
            <plugin>
              <groupId>org.apache.maven.plugins</groupId>
              <artifactId>maven-surefire-plugin</artifactId>
              <version>3.6.0</version>
            </plugin>

            <!-- Integration tests: *IT.java (phases: integration-test + verify) -->
            <plugin>
              <groupId>org.apache.maven.plugins</groupId>
              <artifactId>maven-failsafe-plugin</artifactId>
              <version>3.6.0</version>
              <executions>
                <execution>
                  <goals><goal>integration-test</goal><goal>verify</goal></goals>
                </execution>
              </executions>
            </plugin>

            <!-- Coverage: agent before tests, HTML report in target/site/jacoco -->
            <plugin>
              <groupId>org.jacoco</groupId>
              <artifactId>jacoco-maven-plugin</artifactId>
              <version>0.8.15</version>
              <executions>
                <execution><id>agent</id><goals><goal>prepare-agent</goal></goals></execution>
                <execution><id>report</id><phase>verify</phase><goals><goal>report</goal></goals></execution>
              </executions>
            </plugin>

            <!-- Build rules: fail fast on the wrong toolchain -->
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
                      <requireJavaVersion><version>[21,)</version></requireJavaVersion>
                      <requireMavenVersion><version>[3.9,)</version></requireMavenVersion>
                      <dependencyConvergence/>
                    </rules>
                  </configuration>
                </execution>
              </executions>
            </plugin>
          </plugins>
        </build>` },
      notes: [
        "Unit tests (fast, no external systems) run in `test`; integration tests (database, HTTP, Kafka) run in `integration-test` *after* `package`, and `verify` fails the build afterwards — so cleanup can still happen if tests fail.",
        "`dependencyConvergence` fails the build when two paths pull different versions of the same library — the cause of many `NoSuchMethodError` surprises.",
        "Run `./mvnw verify`, then open `target/site/jacoco/index.html` to see line and branch coverage. We'll use it on the Splitwise tests in Session 14."
      ]
    },
    {
      type: 'theory',
      title: 'Archetypes: project templates',
      lead: 'An **archetype** is a Maven project template. `archetype:generate` copies it and fills in your coordinates.',
      points: [
        "`maven-archetype-quickstart` — a plain Java app with a test; `maven-archetype-webapp` — a WAR skeleton.",
        "Interactive mode asks for values; batch mode (`-DinteractiveMode=false`) is scriptable.",
        "Teams create their **own** archetypes (`archetype:create-from-project`) to standardise new services: logging, CI, Dockerfile, code style.",
        "For Spring Boot, **Spring Initializr** (start.spring.io) is the modern, always-up-to-date generator — IntelliJ and VS Code use it too."
      ],
      code: { lang: 'bash', label: 'Terminal', src: code`
        $ mvn archetype:generate \
            -DarchetypeGroupId=org.apache.maven.archetypes \
            -DarchetypeArtifactId=maven-archetype-quickstart \
            -DarchetypeVersion=1.5 \
            -DgroupId=com.example.tools -DartifactId=csv-report \
            -DinteractiveMode=false

        $ tree csv-report
        csv-report
        ├── pom.xml
        └── src
            ├── main/java/com/example/tools/App.java
            └── test/java/com/example/tools/AppTest.java

        # Spring Initializr from the command line (same as the web UI)
        $ curl https://start.spring.io/starter.zip \
            -d type=maven-project -d language=java -d javaVersion=21 \
            -d groupId=com.example -d artifactId=splitwise -d name=splitwise \
            -d dependencies=web,validation,data-jpa,mysql,actuator,devtools,lombok \
            -o splitwise.zip` },
      notes: [
        "Pin `archetypeVersion` in scripts so the generated project does not change under you.",
        "Initializr's dependency id `web` maps to `spring-boot-starter-webmvc` in Spring Boot 4 — the old `spring-boot-starter-web` name was renamed.",
        "The quickstart archetype is perfect for small tools and katas; for anything Spring-based, start from Initializr."
      ]
    },
    {
      type: 'practical',
      title: 'The generated Spring Boot project',
      lead: 'Spring Initializr produces a ready-to-run project. The **parent POM** manages hundreds of versions so your dependencies need none.',
      code: [
        { lang: 'xml', file: 'pom.xml', src: code`
          <parent>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-parent</artifactId>
            <version>4.1.2</version>
            <relativePath/>
          </parent>

          <groupId>com.example</groupId>
          <artifactId>splitwise</artifactId>
          <version>0.0.1-SNAPSHOT</version>

          <properties>
            <java.version>21</java.version>
          </properties>

          <dependencies>
            <dependency>
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-starter-webmvc</artifactId>   <!-- REST + embedded Tomcat -->
            </dependency>
            <dependency>
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-starter-validation</artifactId>
            </dependency>
            <dependency>
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-starter-actuator</artifactId>
            </dependency>
            <dependency>
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-devtools</artifactId>
              <scope>runtime</scope>
              <optional>true</optional>
            </dependency>
            <dependency>
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-starter-test</artifactId>
              <scope>test</scope>
            </dependency>
          </dependencies>

          <build>
            <plugins>
              <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>   <!-- fat jar + spring-boot:run -->
              </plugin>
            </plugins>
          </build>` },
        { lang: 'java', file: 'SplitwiseApplication.java', src: code`
          package com.example.splitwise;

          import org.springframework.boot.SpringApplication;
          import org.springframework.boot.autoconfigure.SpringBootApplication;

          @SpringBootApplication           // = @Configuration + @EnableAutoConfiguration + @ComponentScan
          public class SplitwiseApplication {
              public static void main(String[] args) {
                  SpringApplication.run(SplitwiseApplication.class, args);
              }
          }` },
        { lang: 'bash', label: 'Run it', src: code`
          $ ./mvnw spring-boot:run
            .   ____          _            __ _ _
           /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
          ( ( )\___ | '_ | '_| | '_ \/ _\` | \ \ \ \
          ...
          INFO  Starting SplitwiseApplication using Java 21.0.8
          INFO  Tomcat initialized with port 8080 (http)
          INFO  Tomcat started on port 8080 (http) with context path '/'
          INFO  Started SplitwiseApplication in 1.9 seconds

          $ ./mvnw clean package && java -jar target/splitwise-0.0.1-SNAPSHOT.jar` }
      ],
      callout: { kind: 'version', text: "Spring Boot **4.1.x** (Spring Framework 7, Jakarta EE 11) needs Java 17+; we use 21. Boot 4 renamed several starters, e.g. `spring-boot-starter-web` → `spring-boot-starter-webmvc` and `spring-boot-starter-aop` → `spring-boot-starter-aspectj`." },
      notes: [
        "Walk through the generated tree: `src/main/resources/application.properties` (or `.yml`), `static/` and `templates/` folders, the test class with `@SpringBootTest`, and the Maven wrapper.",
        "The fat JAR produced by `spring-boot-maven-plugin:repackage` contains your classes plus all dependency JARs and a launcher — one file to deploy, which is what our Docker images will run in Session 23.",
        "DevTools restarts the app automatically when classes change and is excluded from the packaged JAR."
      ]
    },
    {
      type: 'theory',
      title: 'Multi-module builds',
      lead: 'Large systems split into modules that build together. A **parent POM** centralises versions and plugin configuration.',
      diagram: { kind: 'tree', root: { t: 'splitwise-parent', s: 'packaging pom', tone: 'purple', c: [
        { t: 'splitwise-common', s: 'DTOs, errors, utils', tone: 'gray' },
        { t: 'splitwise-domain', s: 'entities, repositories', tone: 'blue' },
        { t: 'splitwise-api', s: 'Spring Boot app, depends on domain + common', tone: 'green' }
      ] } },
      points: [
        "Parent: `<packaging>pom</packaging>` + `<modules>` list + shared `<dependencyManagement>` / `<pluginManagement>`.",
        "The **reactor** works out the build order from inter-module dependencies.",
        "`./mvnw -pl splitwise-api -am package` builds one module plus everything it needs.",
        "Microservices (Module 4) are usually *separate* repositories or builds; multi-module suits a modular monolith or shared libraries."
      ],
      code: { lang: 'xml', file: 'parent pom.xml (excerpt)', src: code`
        <groupId>com.example</groupId>
        <artifactId>splitwise-parent</artifactId>
        <version>1.0.0-SNAPSHOT</version>
        <packaging>pom</packaging>

        <modules>
          <module>splitwise-common</module>
          <module>splitwise-domain</module>
          <module>splitwise-api</module>
        </modules>

        <dependencyManagement>
          <dependencies>
            <dependency>   <!-- children can use splitwise-common without a version -->
              <groupId>com.example</groupId>
              <artifactId>splitwise-common</artifactId>
              <version>\${project.version}</version>
            </dependency>
          </dependencies>
        </dependencyManagement>` },
      notes: [
        "A module depends on a sibling like any other dependency (`groupId`, `artifactId`); the version comes from the parent's `dependencyManagement`.",
        "`dependencyManagement` never adds a dependency by itself — it only fixes the version if a child declares it. This is the same mechanism the Spring Boot parent uses.",
        "Interview question: *parent POM vs BOM import?* A parent is inherited (one only) and can also configure plugins; a BOM is imported into `dependencyManagement` (many allowed) and only manages versions."
      ]
    },
    {
      type: 'theory',
      title: 'Git & GitHub: the daily workflow',
      lead: 'Git tracks every change locally; GitHub hosts the shared repository, code reviews and CI.',
      diagram: { kind: 'flow', nodes: [
        { t: 'Working tree', s: 'edit files', tone: 'gray' },
        { t: 'Staging area', s: 'git add', tone: 'yellow' },
        { t: 'Local repo', s: 'git commit', tone: 'blue' },
        { t: 'GitHub', s: 'git push', tone: 'purple' },
        { t: 'Pull request', s: 'review + CI → merge', tone: 'green' }
      ] },
      points: [
        "**Feature branches**: never commit straight to `main`; open a pull request (PR) for review.",
        "Small, focused commits with clear messages (`feat: add expense split validation`).",
        "Ignore build output and secrets: `target/`, `.idea/`, `*.iml`, `.env`.",
        "`git pull --rebase` keeps history linear; resolve conflicts locally, then push."
      ],
      code: { lang: 'bash', label: 'Terminal', src: code`
        $ git init && git add . && git commit -m "chore: initial Spring Boot project"
        $ git branch -M main
        $ git remote add origin git@github.com:<you>/splitwise.git
        $ git push -u origin main

        $ git switch -c feature/expense-api          # new branch per feature
        $ git add -p                                  # stage hunks interactively
        $ git commit -m "feat: add POST /api/v1/expenses"
        $ git push -u origin feature/expense-api      # then open a PR on GitHub

        $ cat .gitignore
        target/
        .idea/
        *.iml
        .env
        HELP.md` },
      notes: [
        "Git & GitHub are in the brochure's tech stack and you will use them for every project. A clean GitHub history is also your portfolio for interviews.",
        "Never commit credentials. If a secret is pushed, rotate it immediately — deleting the commit is not enough because forks and caches keep it. From Session 23 secrets come from environment variables or a secret manager.",
        "In Session 23 the same repository gains a GitHub Actions workflow that runs `./mvnw verify` on every pull request."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: set up your course workspace',
      lead: 'Leave this session with a professional project skeleton on GitHub, built by Maven with coverage and rules enforced.',
      steps: [
        "Install JDK 21, IntelliJ IDEA (or VS Code + Java extensions) and Git; verify `java -version`, `git --version`.",
        "Generate a quickstart project with `archetype:generate` (batch mode) and run `mvn test`.",
        "Generate the **splitwise** Spring Boot project on start.spring.io: Maven, Java 21, Spring Boot 4.1.x, dependencies *Spring Web, Validation, Actuator, DevTools*.",
        "Open it in your IDE, run `./mvnw spring-boot:run`, and visit `http://localhost:8080/actuator/health` → `{\"status\":\"UP\"}`.",
        "Add the JaCoCo and enforcer plugins from today's slide; run `./mvnw verify` and open the coverage report.",
        "Build the fat JAR with `./mvnw clean package` and run it with `java -jar`.",
        "Create a GitHub repository, add a `.gitignore`, push `main`, then create `feature/readme`, edit the README and open a pull request.",
        "Stretch: convert the project into a multi-module build with `splitwise-common` and `splitwise-api`."
      ],
      notes: [
        "This workspace becomes the Splitwise project in Session 12, so make sure every student finishes with a green build and a pushed repository.",
        "Typical issues: `JAVA_HOME` pointing to an older JDK (fix your IDE's project SDK), corporate proxies blocking Maven Central (configure `~/.m2/settings.xml`), and port 8080 already in use (`server.port=8081`)."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: plugins, archetypes & setup',
      quiz: [
        { q: "Which plugin should run integration tests named `*IT.java` after packaging?", options: ['maven-surefire-plugin', 'maven-failsafe-plugin', 'maven-jar-plugin', 'maven-enforcer-plugin'], answer: 1,
          why: "Failsafe binds to `integration-test` and `verify`, running after `package` and failing the build in `verify`." },
        { q: "What does `<pluginManagement>` do in a parent POM?", options: ['Runs the plugins in every module', 'Declares versions/config that children use when they activate the plugin', 'Downloads plugins early', 'Disables plugins'], answer: 1,
          why: "Like `dependencyManagement`, it only configures; a module must list the plugin under `<plugins>` to run it." },
        { q: "In Spring Boot 4, which starter gives you Spring MVC with embedded Tomcat?", options: ['spring-boot-starter-web', 'spring-boot-starter-webmvc', 'spring-boot-starter-tomcat-only', 'spring-mvc-starter'], answer: 1,
          why: "Boot 4 renamed `spring-boot-starter-web` to `spring-boot-starter-webmvc`." },
        { q: "Why don't the starters in a Spring Boot POM need `<version>` tags?", options: ['Maven guesses the latest', 'The spring-boot-starter-parent manages their versions', 'Starters have no versions', 'Initializr hard-codes them in the JAR'], answer: 1,
          why: "The parent inherits `spring-boot-dependencies`, a BOM that pins compatible versions of hundreds of libraries." },
        { q: "Which file keeps `target/` and IDE files out of Git?", options: ['pom.xml', '.gitignore', 'settings.xml', 'application.yml'], answer: 1,
          why: "`.gitignore` lists untracked patterns; build output and secrets should never be committed." }
      ],
      notes: [
        "Use Q4 to reinforce the BOM idea from Session 6: the Spring Boot parent is the biggest BOM students will ever use, and overriding a managed version is just a property, e.g. `<mysql.version>`."
      ]
    },
    {
      type: 'summary',
      title: 'Session 7 recap',
      points: [
        "Plugins implement phases: compiler, surefire (unit), failsafe (integration), jar, Spring Boot repackage, JaCoCo, enforcer.",
        "Archetypes template new projects; Spring Initializr is the archetype for Spring Boot.",
        "The Spring Boot parent POM manages versions and plugin config; Boot 4 uses `spring-boot-starter-webmvc`.",
        "Parent POMs + modules + reactor for multi-module builds; `dependencyManagement` pins, it doesn't add.",
        "Git feature branches + GitHub pull requests are the team workflow for every project in this course."
      ],
      cards: [
        ['Mojo', 'A single plugin goal (Maven plain Old Java Object), e.g. surefire:test.'],
        ['Execution', 'Binding of plugin goals to a lifecycle phase with its own configuration.'],
        ['Archetype', 'A Maven project template used by archetype:generate.'],
        ['Fat JAR', 'Executable JAR containing the app and all dependencies (spring-boot-maven-plugin).'],
        ['Reactor', 'Maven component that orders and builds the modules of a multi-module project.'],
        ['Failsafe', 'Plugin for integration tests that still runs post-test cleanup before failing.'],
        ['Feature branch', 'Short-lived Git branch for one change, merged through a pull request.'],
        ['spring-boot-starter-parent', 'Parent POM providing dependency management and plugin defaults for Boot apps.']
      ],
      notes: [
        "Next session: what Spring actually does when that app starts — IoC, dependency injection, auto-configuration — and how Spring MVC handles HTTP requests."
      ]
    }
  ]
});
