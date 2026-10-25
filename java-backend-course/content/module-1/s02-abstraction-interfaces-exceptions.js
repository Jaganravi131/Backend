COURSE.session({
  no: 2,
  short: 'Abstract classes, interfaces & exceptions',
  title: 'Abstract Classes, Interfaces & the Exception Hierarchy',
  covers: [1],
  objectives: [
    "Design with abstract classes (template method) and interfaces (contracts, default methods).",
    "Choose between an abstract class and an interface, and resolve the default-method diamond.",
    "Navigate Java's exception hierarchy and explain checked vs unchecked exceptions.",
    "Handle errors with try/catch/finally, multi-catch and try-with-resources, and create custom exceptions."
  ],
  prereq: "Session 1: classes, inheritance, overriding and polymorphism.",
  slides: [
    {
      type: 'theory',
      title: 'Abstract classes: partially built blueprints',
      lead: 'An `abstract` class captures what related classes **share** and forces subclasses to fill in what **varies**.',
      points: [
        "Cannot be instantiated — `new Payment()` is a compile error.",
        "Can hold **state** (fields), **constructors**, concrete methods *and* `abstract` methods (no body).",
        "A concrete subclass must implement every abstract method (or be abstract itself).",
        "Classic use: the **Template Method** pattern — a `final` algorithm with overridable steps."
      ],
      diagram: { kind: 'tree', layout: 'org', root: { t: 'PaymentProcessor', s: 'abstract', tone: 'purple', c: [
        { t: 'UpiProcessor', s: 'fee = 0', tone: 'green' },
        { t: 'CardProcessor', s: 'fee = 1.8%', tone: 'blue' },
        { t: 'WalletProcessor', s: 'fee = 1%', tone: 'orange' }
      ] } },
      notes: [
        "Start from the end of the Session 1 lab: a plain `LibraryItem` could be instantiated even though a 'generic item' makes no sense. Marking it `abstract` fixes the model.",
        "An abstract class is still a class: it has constructors (called via `super(...)`), can keep `private` state and can enforce invariants. That is the main thing interfaces cannot do.",
        "Real frameworks use this everywhere: Spring's `OncePerRequestFilter` (Session 16) is an abstract class whose `doFilter` template calls your `doFilterInternal` step."
      ]
    },
    {
      type: 'practical',
      title: 'Template method with an abstract class',
      lead: '`process()` fixes the algorithm; each subclass only supplies the steps that differ.',
      code: { lang: 'java', file: 'TemplateDemo.java', src: code`
        import java.util.List;

        abstract class PaymentProcessor {
            private static int counter = 1000;

            // Template method: fixed algorithm, customisable steps. final = cannot be overridden.
            public final String process(double amount) {
                if (amount <= 0) throw new IllegalArgumentException("Amount must be positive");
                double fee = fee(amount);
                String ref = prefix() + "-" + (++counter);
                return String.format("%s | %-6s | amount=%.2f fee=%.2f total=%.2f",
                        ref, name(), amount, fee, amount + fee);
            }

            protected abstract double fee(double amount);   // step each subclass must provide
            protected abstract String prefix();

            protected String name() {                        // hook with a default implementation
                return getClass().getSimpleName().replace("Processor", "");
            }
        }

        class UpiProcessor extends PaymentProcessor {
            @Override protected double fee(double amount) { return 0; }
            @Override protected String prefix() { return "UPI"; }
        }

        class CardProcessor extends PaymentProcessor {
            @Override protected double fee(double amount) { return amount * 0.018; }
            @Override protected String prefix() { return "CRD"; }
        }

        public class TemplateDemo {
            public static void main(String[] args) {
                List<PaymentProcessor> processors = List.of(new UpiProcessor(), new CardProcessor());
                for (PaymentProcessor p : processors) {
                    System.out.println(p.process(2500));
                }
                // new PaymentProcessor();   // compile error: PaymentProcessor is abstract
            }
        }`, out: code`
        UPI-1001 | Upi    | amount=2500.00 fee=0.00 total=2500.00
        CRD-1002 | Card   | amount=2500.00 fee=45.00 total=2545.00` },
      notes: [
        "Point out the three kinds of methods: the `final` template (`process`), the `abstract` steps (`fee`, `prefix`) and an optional *hook* with a default (`name`).",
        "Making the template `final` protects the algorithm: no subclass can skip validation or reference generation. This is the Open/Closed principle — open for extension (new processors), closed for modification (the flow).",
        "Ask students to add a `WalletProcessor` with a 1% fee: they only write two small methods and never touch `PaymentProcessor`."
      ]
    },
    {
      type: 'theory',
      title: 'Interfaces: contracts a class promises to fulfil',
      lead: 'An interface says **what** a type can do. A class can implement **many** interfaces, which gives Java a safe form of multiple inheritance.',
      points: [
        "Methods are `public abstract` by default; fields are `public static final` constants.",
        "**default** methods (Java 8) add behaviour without breaking existing implementations.",
        "**static** methods (Java 8) and **private** helper methods (Java 9) keep utilities next to the contract.",
        "A **functional interface** has exactly one abstract method — the target type of lambdas (Session 3).",
        "**sealed** interfaces (Java 17) restrict which classes may implement them: `sealed interface Shape permits Circle, Square`."
      ],
      diagram: { kind: 'tree', layout: 'org', root: { t: 'Parcel', s: 'record', tone: 'green', c: [
        { t: 'Trackable', s: 'interface', tone: 'blue' },
        { t: 'Insurable', s: 'interface', tone: 'purple' }
      ] }, caption: 'One class, two contracts: `record Parcel(...) implements Trackable, Insurable`' },
      notes: [
        "Interfaces model *capabilities* (Comparable, Runnable, AutoCloseable) or *roles* (PaymentGateway, NotificationSender). Abstract classes model *a family of related things* that share code and state.",
        "Default methods were added so the JDK could evolve old interfaces — `Collection.stream()` and `Iterable.forEach()` are defaults added in Java 8 without breaking millions of existing implementations.",
        "Spring is built on interfaces: `JpaRepository`, `UserDetailsService`, `HandlerInterceptor` … your code depends on the contract, and Spring supplies or discovers the implementation."
      ]
    },
    {
      type: 'practical',
      title: 'Default methods & the diamond problem',
      lead: 'If two interfaces provide the same default method, the class **must** override it and may pick one with `Interface.super.method()`.',
      code: { lang: 'java', file: 'InterfaceDemo.java', src: code`
        interface Trackable {
            String id();
            default String track() { return "Tracking " + id() + " via GPS"; }
            static String carrier() { return "IndiaPost"; }
        }

        interface Insurable {
            double value();
            default double premium() { return value() * 0.02; }
            default String track() { return "Insured item worth " + value(); }   // same signature!
        }

        // Record accessors id() and value() implement the abstract methods automatically
        record Parcel(String id, double value) implements Trackable, Insurable {
            @Override
            public String track() {                     // required: resolve the conflict
                return Trackable.super.track() + " (insured)";
            }
        }

        public class InterfaceDemo {
            public static void main(String[] args) {
                Parcel p = new Parcel("PCL-77", 12_000);
                System.out.println(p.track());
                System.out.printf("premium = %.1f%n", p.premium());
                System.out.println("carrier = " + Trackable.carrier());
                Trackable t = p;                            // program to the interface
                System.out.println(t instanceof Insurable);
            }
        }`, out: code`
        Tracking PCL-77 via GPS (insured)
        premium = 240.0
        carrier = IndiaPost
        true` },
      callout: { kind: 'tip', text: "Resolution rules: (1) a class method always wins over an interface default; (2) a more specific interface wins over its parent; (3) otherwise the class must override explicitly." },
      notes: [
        "Remove the `track()` override live and show the compile error: *types Trackable and Insurable are incompatible; class Parcel inherits unrelated defaults for track()*. This is Java's answer to the C++ diamond problem — ambiguity is never resolved silently.",
        "Static interface methods are **not** inherited: you call `Trackable.carrier()`, never `p.carrier()`.",
        "Records can implement interfaces, which makes them great DTOs that still participate in polymorphism."
      ]
    },
    {
      type: 'theory',
      title: 'Abstract class vs interface — when to use which?',
      lead: 'Default to interfaces for contracts; reach for an abstract class when subclasses must share state or a fixed algorithm.',
      table: { head: ['', 'Abstract class', 'Interface'], rows: [
        ['Instantiate?', 'No', 'No'],
        ['State (instance fields)', '✅ Yes', '❌ Only `static final` constants'],
        ['Constructors', '✅ Yes', '❌ No'],
        ['Method kinds', 'abstract + concrete (any access)', 'abstract, `default`, `static`, `private`'],
        ['Inheritance', 'A class extends **one**', 'A class implements **many**'],
        ['Relationship', '*is-a* (family of types)', '*can-do* / role (capability)'],
        ['Typical example', '`AbstractList`, `OncePerRequestFilter`', '`Comparable`, `Runnable`, `JpaRepository`']
      ] },
      points: [
        "Common combo: an interface for the contract **plus** an abstract base class with shared code (`List` + `AbstractList`).",
        "Use `sealed` to model a closed set of alternatives (payment results, shapes, events)."
      ],
      callout: { kind: 'interview', text: "*Since Java 8 interfaces can have method bodies — why keep abstract classes?* Because interfaces still cannot hold per-object state or constructors, and cannot have `protected` or package-private members." },
      notes: [
        "Rule of thumb for design discussions: start with an interface. If you notice several implementations duplicating the same fields and logic, extract an abstract base class that implements the interface.",
        "Interfaces are also what makes testing easy: in Session 14 Mockito will create fake implementations of interfaces (and classes) so we can test services in isolation."
      ]
    },
    {
      type: 'practical',
      title: 'Program to an interface (a preview of Spring DI)',
      lead: 'High-level code should depend on **abstractions**, not concrete classes — the Dependency Inversion Principle.',
      code: [
        { lang: 'java', file: 'DipDemo.java', src: code`
          import java.util.List;

          interface NotificationSender {                         // the contract
              void send(String to, String message);
          }

          class EmailSender implements NotificationSender {
              public void send(String to, String message) { System.out.println("EMAIL -> " + to + ": " + message); }
          }

          class SmsSender implements NotificationSender {
              public void send(String to, String message) { System.out.println("SMS   -> " + to + ": " + message); }
          }

          class OrderService {
              private final List<NotificationSender> senders;       // depends on the abstraction only

              OrderService(List<NotificationSender> senders) {       // constructor injection
                  this.senders = senders;
              }

              void placeOrder(String customer) {
                  System.out.println("Order placed for " + customer);
                  senders.forEach(s -> s.send(customer, "Your order is confirmed"));
              }
          }

          public class DipDemo {
              public static void main(String[] args) {
                  // We wire objects by hand today; from Session 8 Spring's IoC container does it for us.
                  OrderService service = new OrderService(List.of(new EmailSender(), new SmsSender()));
                  service.placeOrder("ravi");
              }
          }`, out: code`
          Order placed for ravi
          EMAIL -> ravi: Your order is confirmed
          SMS   -> ravi: Your order is confirmed` },
        { lang: 'java', file: 'SealedDemo.java', label: 'Bonus: sealed + switch', src: code`
          import java.util.List;

          sealed interface PaymentResult permits Paid, Declined, Pending {}
          record Paid(String txnId, double amount) implements PaymentResult {}
          record Declined(String reason) implements PaymentResult {}
          record Pending(int retryAfterSeconds) implements PaymentResult {}

          public class SealedDemo {
              static String message(PaymentResult r) {
                  return switch (r) {                        // exhaustive: compiler knows all cases
                      case Paid p -> "Paid " + p.amount() + " (txn " + p.txnId() + ")";
                      case Declined d -> "Declined: " + d.reason();
                      case Pending p when p.retryAfterSeconds() > 60 -> "Pending, check back later";
                      case Pending p -> "Pending, retry in " + p.retryAfterSeconds() + "s";
                  };
              }

              public static void main(String[] args) {
                  List.of(new Paid("T-9", 799.0), new Declined("Insufficient funds"),
                          new Pending(30), new Pending(300))
                      .forEach(r -> System.out.println(message(r)));
              }
          }`, out: code`
          Paid 799.0 (txn T-9)
          Declined: Insufficient funds
          Pending, retry in 30s
          Pending, check back later` }
      ],
      notes: [
        "`OrderService` never mentions `EmailSender` or `SmsSender`. Adding WhatsApp notifications means writing one new class — zero changes to `OrderService`. This is exactly how Spring applications are structured.",
        "Constructor injection makes dependencies explicit and lets fields be `final`. In Session 8 Spring will find all `NotificationSender` beans and inject them as a `List` automatically.",
        "The bonus tab shows a *sealed* hierarchy with *pattern matching for switch* (Java 21): because the compiler knows every permitted subtype, it rejects a switch that forgets a case — no `default` branch needed."
      ]
    },
    {
      type: 'theory',
      title: 'The exception hierarchy',
      lead: 'Everything that can be thrown extends `Throwable`. The branch an exception sits on decides how the compiler treats it.',
      diagram: { kind: 'tree', root: { t: 'Throwable', tone: 'purple', c: [
        { t: 'Error', s: 'JVM problems — don\'t catch', tone: 'red', c: [{ t: 'OutOfMemoryError', tone: 'red' }, { t: 'StackOverflowError', tone: 'red' }] },
        { t: 'Exception', s: 'checked', tone: 'blue', c: [
          { t: 'IOException', s: 'checked', tone: 'blue', c: [{ t: 'FileNotFoundException', tone: 'blue' }] },
          { t: 'SQLException', s: 'checked', tone: 'blue' },
          { t: 'InterruptedException', s: 'checked', tone: 'blue' },
          { t: 'RuntimeException', s: 'unchecked', tone: 'orange', c: [
            { t: 'NullPointerException', tone: 'orange' },
            { t: 'IllegalArgumentException', tone: 'orange', c: [{ t: 'NumberFormatException', tone: 'orange' }] },
            { t: 'IllegalStateException', tone: 'orange' },
            { t: 'ArithmeticException', tone: 'orange' },
            { t: 'IndexOutOfBoundsException', tone: 'orange' }
          ] }
        ] }
      ] } },
      points: [
        "**Error** — serious JVM/system failures; applications should not try to recover.",
        "**Checked exceptions** (`Exception` but not `RuntimeException`) — the compiler forces you to catch or declare them with `throws`.",
        "**Unchecked exceptions** (`RuntimeException` and its subclasses) — usually programming bugs or business-rule violations; not enforced by the compiler."
      ],
      notes: [
        "Draw the tree from the top and colour the branches as on the slide. Students should be able to place any common exception on it.",
        "Checked exceptions represent *recoverable conditions outside the program's control* (file missing, network down, DB unavailable). Unchecked exceptions represent *bugs or invalid input* (null where it should not be, negative quantity).",
        "Modern frameworks lean towards unchecked exceptions: Spring wraps checked `SQLException` into its unchecked `DataAccessException` hierarchy (Session 10), so your service code is not littered with `throws SQLException`."
      ]
    },
    {
      type: 'practical',
      title: 'try / catch / finally & try-with-resources',
      lead: 'Resources declared in `try (...)` are closed automatically, in **reverse** order, before any `catch` runs.',
      points: [
        "Any class implementing `AutoCloseable` can be used in try-with-resources.",
        "**Multi-catch** `catch (A | B e)` handles several unrelated exceptions in one block.",
        "`finally` runs whether or not an exception occurred — even after a `return`.",
        "Catch the most **specific** exceptions first; never swallow exceptions silently."
      ],
      code: { lang: 'java', file: 'ResourceDemo.java', src: code`
        public class ResourceDemo {

            static class DbConnection implements AutoCloseable {
                private final String name;
                DbConnection(String name) { this.name = name; System.out.println("open  " + name); }

                void query(String sql) {
                    if (sql.isBlank()) throw new IllegalArgumentException("empty SQL");
                    System.out.println("query " + name + ": " + sql);
                }
                @Override public void close() { System.out.println("close " + name); }
            }

            public static void main(String[] args) {
                try (DbConnection a = new DbConnection("A");
                     DbConnection b = new DbConnection("B")) {
                    a.query("SELECT 1");
                    b.query(" ");
                } catch (IllegalArgumentException | IllegalStateException e) {   // multi-catch
                    System.out.println("caught " + e.getMessage());
                } finally {
                    System.out.println("finally always runs");
                }
                System.out.println(parse("42") + parse("4x2"));
            }

            static int parse(String s) {
                try {
                    return Integer.parseInt(s);
                } catch (NumberFormatException e) {
                    System.out.println("bad number: " + s);
                    return 0;
                } finally {
                    System.out.println("parsed " + s);                 // runs even after return
                }
            }
        }`, out: code`
        open  A
        open  B
        query A: SELECT 1
        close B
        close A
        caught empty SQL
        finally always runs
        parsed 42
        bad number: 4x2
        parsed 4x2
        42` },
      notes: [
        "Ask students to *predict the output* before clicking **Show output** — the order `close B, close A, caught …` surprises most people.",
        "Before Java 7 we closed JDBC connections manually in `finally` blocks with nested try/catch — verbose and error-prone. Try-with-resources is the standard today: you will use it for JDBC in Session 10.",
        "If both the body and `close()` throw, the body's exception is propagated and the close exception is attached as a *suppressed* exception (`e.getSuppressed()`), so nothing is lost.",
        "Never `return` from a `finally` block: it silently discards any exception thrown in the `try`."
      ]
    },
    {
      type: 'practical',
      title: 'Custom exceptions for your domain',
      lead: 'Meaningful exception types make failures self-explanatory and let higher layers handle them precisely.',
      code: [
        { lang: 'java', file: 'CustomExceptionDemo.java', src: code`
          import java.util.HashMap;
          import java.util.Map;

          class WalletException extends RuntimeException {           // base type for the domain
              WalletException(String msg) { super(msg); }
              WalletException(String msg, Throwable cause) { super(msg, cause); }
          }

          class InsufficientBalanceException extends WalletException {
              private final long shortfall;
              InsufficientBalanceException(long shortfall) {
                  super("Insufficient balance, short by " + shortfall + " paise");
                  this.shortfall = shortfall;
              }
              long shortfall() { return shortfall; }
          }

          class WalletNotFoundException extends WalletException {
              WalletNotFoundException(String id) { super("Wallet not found: " + id); }
          }

          class WalletService {
              private final Map<String, Long> balances = new HashMap<>(Map.of("w1", 50_000L));

              void debit(String walletId, long paise) {
                  Long balance = balances.get(walletId);
                  if (balance == null) throw new WalletNotFoundException(walletId);
                  if (balance < paise) throw new InsufficientBalanceException(paise - balance);
                  balances.put(walletId, balance - paise);
              }
          }

          public class CustomExceptionDemo {
              public static void main(String[] args) {
                  WalletService service = new WalletService();
                  String[][] requests = {{"w1", "20000"}, {"w1", "40000"}, {"w9", "100"}};
                  for (String[] r : requests) {
                      try {
                          service.debit(r[0], Long.parseLong(r[1]));
                          System.out.println("OK    " + r[0] + " -" + r[1]);
                      } catch (InsufficientBalanceException e) {           // most specific first
                          System.out.println("FAIL  " + e.getMessage() + " (shortfall=" + e.shortfall() + ")");
                      } catch (WalletException e) {
                          System.out.println("FAIL  " + e.getClass().getSimpleName() + ": " + e.getMessage());
                      }
                  }
              }
          }`, out: code`
          OK    w1 -20000
          FAIL  Insufficient balance, short by 10000 paise (shortfall=10000)
          FAIL  WalletNotFoundException: Wallet not found: w9` },
        { lang: 'java', file: 'WalletLoader.java', label: 'Wrapping a checked exception', verify: false, src: code`
          // Translate a low-level checked exception into a domain exception, keeping the cause
          public Map<String, Long> loadWallets(Path file) {
              try {
                  return parse(Files.readString(file));
              } catch (IOException e) {
                  throw new WalletException("Cannot load wallets from " + file, e);   // cause preserved
              }
          }` }
      ],
      callout: { kind: 'best', text: "In the REST APIs of Module 2, a `@RestControllerAdvice` will translate `WalletNotFoundException` → **404** and `InsufficientBalanceException` → **422** in one central place (Session 9)." },
      notes: [
        "Naming: end with `Exception`, describe the *problem* (`InsufficientBalanceException`), and carry useful data (`shortfall`) rather than only a string.",
        "A small hierarchy (`WalletException` as base) lets callers catch broadly or precisely. Always pass the original exception as the *cause* when wrapping — losing the stack trace makes production debugging miserable.",
        "Checked or unchecked? For business-rule violations in Spring applications, unchecked is the norm. Use checked exceptions when the caller can realistically recover and you want the compiler to remind them."
      ]
    },
    {
      type: 'lab',
      title: 'Lab: banking core with abstraction & robust error handling',
      lead: 'Combine an abstract class, an interface with a default method, and a custom exception hierarchy.',
      steps: [
        "Create an `abstract class Account` with a private `long balance` (paise), a constructor and an abstract `long withdrawLimit()`.",
        "Add `SavingsAccount` (limit ₹25,000) and `CurrentAccount` (limit ₹2,00,000) that implement `withdrawLimit()`.",
        "Create `interface Auditable` with a `default void audit(String event)` that prints `AUDIT: <event>`; make `Account` implement it.",
        "Create `BankingException` (extends `RuntimeException`) with subclasses `LimitExceededException` and `InsufficientFundsException`.",
        "Implement `withdraw(long amount)` that checks the limit first, then the balance, then calls `audit(...)`.",
        "In `main`, process a list of withdrawals; catch the specific exceptions first and print a clear message for each.",
        "Wrap the run in a try-with-resources `AuditLog implements AutoCloseable` that prints `audit log flushed` on close.",
        "Stretch: make `Account` a `sealed` class that permits only your two subclasses and compute interest with a `switch` pattern."
      ],
      code: { lang: 'java', file: 'BankLab.java', label: 'Reference solution', src: code`
        abstract class Account implements Auditable {
            private long balance;
            Account(long balance) { this.balance = balance; }
            abstract long withdrawLimit();

            void withdraw(long amount) {
                if (amount > withdrawLimit()) throw new LimitExceededException(amount, withdrawLimit());
                if (amount > balance) throw new InsufficientFundsException(amount - balance);
                balance -= amount;
                audit(getClass().getSimpleName() + " withdrew " + amount + ", balance " + balance);
            }
        }

        interface Auditable {
            default void audit(String event) { System.out.println("AUDIT: " + event); }
        }

        class SavingsAccount extends Account {
            SavingsAccount(long b) { super(b); }
            long withdrawLimit() { return 25_000; }
        }

        class CurrentAccount extends Account {
            CurrentAccount(long b) { super(b); }
            long withdrawLimit() { return 200_000; }
        }

        class BankingException extends RuntimeException { BankingException(String m) { super(m); } }
        class LimitExceededException extends BankingException {
            LimitExceededException(long amt, long limit) { super("limit exceeded: " + amt + " > " + limit); }
        }
        class InsufficientFundsException extends BankingException {
            InsufficientFundsException(long shortBy) { super("insufficient funds, short by " + shortBy); }
        }

        class AuditLog implements AutoCloseable {
            public void close() { System.out.println("audit log flushed"); }
        }

        public class BankLab {
            public static void main(String[] args) {
                Account savings = new SavingsAccount(40_000), current = new CurrentAccount(10_000);
                try (AuditLog log = new AuditLog()) {
                    Object[][] ops = {{savings, 20_000L}, {savings, 30_000L}, {current, 15_000L}, {savings, 20_000L}};
                    for (Object[] op : ops) {
                        try {
                            ((Account) op[0]).withdraw((Long) op[1]);
                        } catch (LimitExceededException | InsufficientFundsException e) {
                            System.out.println("REJECTED: " + e.getMessage());
                        }
                    }
                }
            }
        }`, out: code`
        AUDIT: SavingsAccount withdrew 20000, balance 20000
        REJECTED: limit exceeded: 30000 > 25000
        REJECTED: insufficient funds, short by 5000
        AUDIT: SavingsAccount withdrew 20000, balance 0
        audit log flushed` },
      notes: [
        "Ask students to trace the four operations on paper before running: the second fails the *limit* check (30,000 > 25,000) before the balance is even looked at, the third fails the *balance* check, and the fourth succeeds exactly at the boundary (20,000 is not greater than 20,000). Boundary values like this are where real bugs hide — they become unit tests in Session 14.",
        "Notice the order of the checks inside `withdraw()`: validation first, state change last, audit after success. If an exception is thrown, the balance is never touched — the object stays consistent.",
        "Encourage students to print `e.getClass().getName()` while experimenting, and to deliberately remove a `catch` block to see the full stack trace and how an exception propagates up to `main` — the topic of Session 3."
      ]
    },
    {
      type: 'quiz',
      title: 'Quiz: abstraction & exceptions',
      quiz: [
        { q: "What can an abstract class have that an interface cannot?", options: ['Abstract methods', 'Constructors and instance fields', 'Default methods', 'Static methods'], answer: 1,
          why: "Interfaces cannot have constructors or per-instance state. Since Java 8/9 they can have default, static and private methods." },
        { q: "A class implements interfaces A and B, both declaring `default void log()`. What happens?", options: ['A\'s version wins', 'The last interface listed wins', 'Compile error unless the class overrides log()', 'Runtime exception'], answer: 2,
          why: "Java never resolves the diamond silently. The class must override `log()` and can delegate with `A.super.log()`." },
        { q: "Which one is a *checked* exception?", options: ['NullPointerException', 'IOException', 'IllegalArgumentException', 'ArithmeticException'], answer: 1,
          why: "`IOException` extends `Exception` but not `RuntimeException`, so callers must catch it or declare `throws IOException`." },
        { q: "Resources A then B are opened in a try-with-resources and the body throws. What is the order?", options: ['catch, close A, close B', 'close A, close B, catch', 'close B, close A, catch', 'catch, close B, close A'], answer: 2,
          why: "Resources are closed in reverse order of declaration, and this happens before the catch block executes." },
        { q: "Best way to signal 'wallet not found' from a service in a Spring REST app?", options: ['Return null', 'Throw a custom unchecked `WalletNotFoundException` and map it to 404 centrally', 'Catch Exception and log it', 'Throw an Error'], answer: 1,
          why: "A domain-specific unchecked exception keeps the service clean; a `@RestControllerAdvice` translates it to an HTTP status in one place." }
      ],
      notes: [
        "Q2 and Q4 are favourites in interviews. For Q4 ask a student to explain *why* resources close before catch: the catch block may need to report the failure, and holding a DB connection open while doing so would be wasteful."
      ]
    },
    {
      type: 'summary',
      title: 'Session 2 recap',
      points: [
        "**Abstract class** = shared state + code + abstract steps (template method). **Interface** = contract/capability; a class can implement many.",
        "Default-method conflicts must be resolved explicitly with `X.super.method()`.",
        "Program to interfaces; inject dependencies through constructors — the foundation of Spring.",
        "`Throwable` → `Error` (don't catch) and `Exception` → checked; `RuntimeException` → unchecked.",
        "Use try-with-resources, multi-catch, specific catches first, custom domain exceptions with a cause."
      ],
      cards: [
        ['Template method', 'A final method defines an algorithm; subclasses implement its abstract steps.'],
        ['Default method', 'Interface method with a body (Java 8) — evolves APIs without breaking implementers.'],
        ['Sealed type', 'A class/interface that lists exactly which subtypes are permitted (Java 17).'],
        ['Checked exception', 'Must be caught or declared; extends Exception but not RuntimeException.'],
        ['Unchecked exception', 'RuntimeException subclasses — bugs or rule violations; not compiler-enforced.'],
        ['try-with-resources', 'Auto-closes AutoCloseable resources in reverse order, before catch.'],
        ['Suppressed exception', 'An exception thrown by close() attached to the primary exception.'],
        ['DIP', 'Depend on abstractions, not concretions — high-level code knows only interfaces.']
      ],
      notes: [
        "Preview Session 3: how an exception travels up the call stack (propagation), the Singleton pattern, and lambdas — which work only because of the *functional interfaces* we just met."
      ]
    }
  ]
});
