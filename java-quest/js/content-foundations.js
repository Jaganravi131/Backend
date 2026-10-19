/* ============================================================
   JAVA QUEST — Course content: WORLD 0 (Prologue) + WORLD 1 (Foundations)
   All worlds are collected in the global WORLDS array.
   ============================================================ */
const WORLDS = [];

/* Helpers used by all content files */
const T = (key, label) => '<span class="term" data-term="' + key + '">' + (label || key) + '</span>';
const P = (html) => ({ t: "p", html });
const H = (html, icon) => ({ t: "h", html, icon: icon || "📘" });
const H3 = (html) => ({ t: "h3", html });
const UL = (items) => ({ t: "ul", items });
const OL = (items) => ({ t: "ol", items });
const CODE = (code, title, output) => ({ t: "code", code, title: title || "java", output });
const CO = (kind, title, html) => ({ t: "callout", kind, title, html });
const QUIZ = (questions, title) => ({ t: "quiz", questions, title: title || "Checkpoint" });
const DEMO = (name, title) => ({ t: "demo", name, title });
const TABLE = (head, rows) => ({ t: "table", head, rows });
const DIAG = (html) => ({ t: "diagram", html });
const REF = (html) => ({ t: "reflection", html });
const CHAL = (spec) => ({ t: "challenge", ...spec });

/* ============================================================
   WORLD 0 — PROLOGUE
   ============================================================ */
WORLDS.push({
  id: "w0", num: 0, emoji: "☕", color: "#22d3ee",
  title: "Prologue: The Java Origin",
  subtitle: "Why Java exists · how it really runs · your first program",
  intro: "Every great developer has an origin story. Yours starts here: in 1995, a team at Sun Microsystems asked a wild question — what if code could run anywhere? The answer became Java, and 30 years later it still powers banks, Android phones, rockets, and enterprise systems. Before you write a single line, you deserve to understand the machine you are about to command.",
  badge: { id: "b_w0", name: "Ignition", emoji: "🚀", desc: "Completed the Prologue and understood how Java really works." },
  lessons: [
    /* ---------------- W0L1 ---------------- */
    {
      id: "w0l1", title: "The Origin Story — What Java Is and Why It Conquered", minutes: 10, xp: 60,
      narrative: "It is 1995. The internet is a newborn. A small team at Sun Microsystems, led by James Gosling, wants software for smart TVs and set-top boxes — machines nobody controls. The problem? Every computer chip speaks a different language. Their radical answer: don't compile code for a machine… compile it for a virtual machine. That idea outlived the TVs and took over the world.",
      sections: [
        P("Java is a " + T("class") + "-based, object-oriented programming language with a twist that made history: your code is not compiled for Windows or Mac or Linux — it is compiled for an imaginary computer called the " + T("jvm") + ". Any real computer that runs a JVM can run your program. That promise is called " + T("wora") + " (Write Once, Run Anywhere)."),
        H("The Big Idea: Two-Step Execution", "💡"),
        P("Most languages of the 90s compiled straight to machine code (fast, but tied to one OS). Java inserts a middle layer:"),
        DIAG('<div class="d-node">You write <b>Hello.java</b> <span class="sub">human-readable source code</span></div><div class="d-arrow">⬇ &nbsp;javac (the compiler)</div><div class="d-node">Hello.class — <b>bytecode</b> <span class="sub">instructions for the imaginary JVM computer</span></div><div class="d-arrow">⬇ &nbsp;JVM (per operating system)</div><div class="d-row"><div class="d-node">Windows machine code</div><div class="d-node">Mac machine code</div><div class="d-node">Linux machine code</div></div>'),
        P("The compiled " + T("bytecode") + " is the universal language. Every OS gets its own JVM implementation that translates bytecode into its local dialect. Same jar of jam, different kitchens."),
        CO("analogy", "The Music Album Analogy 🎵", "Think of bytecode like an MP3. The MP3 is not 'Windows music' — any device with a player can play it. Java bytecode is the MP3; the JVM is the player; Windows/Mac/Linux are the speaker systems. <b>You master the music once; every player handles its own hardware.</b>"),
        H("JDK vs JRE vs JVM — The Family Tree", "🌳"),
        P("Developers constantly confuse these three. Here is the truth, cleanly:"),
        TABLE(["Name", "What it is", "Do you need it?"], [
          [T("jvm") + " — Java Virtual Machine", "The engine that EXECUTES bytecode. The 'imaginary computer' made real.", "Comes with every Java install"],
          [T("jre") + " — Java Runtime Environment", "JVM + standard libraries (the built-in classes). Enough to RUN Java.", "Users who only run programs"],
          [T("jdk") + " — Java Development Kit", "JRE + compiler (javac) + debugger + tools. Enough to BUILD Java.", "You — the developer"],
        ]),
        DIAG('<div class="d-node" style="min-width:340px">JDK <span class="sub">for developers</span><div style="margin-top:8px"><div class="d-node" style="min-width:280px">JRE <span class="sub">for running</span><div style="margin-top:8px"><div class="d-node" style="min-width:200px">JVM + libraries <span class="sub">the engine</span></div></div></div></div></div>'),
        CO("jargon", "In plain words", "A <b>library</b> is a collection of ready-made classes you can use (math, files, lists). Java ships with a huge standard library — that is half of Java's power. The <b>compiler</b> (javac) is the translator that checks your source code and emits bytecode. If your code has errors, the compiler refuses to produce anything — a strict but loving teacher."),
        H("Why Java Won (and Keeps Winning)", "🏆"),
        UL([
          "<b>Safety.</b> No pointer arithmetic, no manual memory deletion. " + T("gc") + " cleans up memory automatically — the #1 cause of crashes in C/C++ simply cannot happen the same way.",
          "<b>Portability.</b> Write once, run on servers, phones (Android is Java/Kotlin), smart cards, TVs.",
          "<b>Big standard library.</b> Files, networking, collections, databases, concurrency — batteries included.",
          "<b>Backward compatibility.</b> Code written 20 years ago still runs. Enterprises love that more than anything.",
          "<b>The JVM ecosystem.</b> Kotlin, Scala, and Clojure also run on the JVM. Learn the platform, unlock many languages.",
        ]),
        CO("depth", "For the curious: version numbers & LTS", "Java versions jumped branding: 1.0 (1996) → Java 5 (generics!) → Java 8 (lambdas, streams — a revolution) → yearly releases since 2018. <b>LTS</b> (Long-Term Support) versions — 8, 11, 17, 21 — get years of updates and are what companies deploy. Newer releases are for the curious. You can learn everything in this course on any modern JDK (17+ recommended)."),
        H("Where Java Lives in the Real World", "🌍"),
        UL([
          "<b>Android apps</b> — Java (and Kotlin, its sibling) power billions of phones.",
          "<b>Enterprise backends</b> — banks, insurance, e-commerce (Spring Framework world).",
          "<b>Big data</b> — Hadoop, Elasticsearch, Kafka are built on the JVM.",
          "<b>Scientific & trading systems</b> — predictable performance and rock-solid concurrency.",
        ]),
        QUIZ([
          { type: "mcq", q: "What is the secret behind <i>Write Once, Run Anywhere</i>?", options: ["Java code is compiled directly for every OS at once", "Java compiles to bytecode that any JVM can execute", "Java has no compiler", "Java programs are stored in the cloud"], answer: 1, explain: "Exactly! Source → bytecode (one time) → each OS's JVM translates it to local machine code. The bytecode is the portable middle layer." },
          { type: "tf", q: "You need the JDK to <i>write and compile</i> Java, but a normal user only needs the JRE to run it.", answer: true, explain: "True. JDK = build tools + JRE. JRE = JVM + libraries = just enough to run." },
          { type: "multi", q: "Which of these are genuine reasons Java conquered the industry?", options: ["Automatic garbage collection", "Massive standard library", "It compiles directly into Windows .exe files", "Strong backward compatibility"], answers: [0, 1, 3], explain: "GC, batteries-included libraries, and compatibility are pillars of Java's success. Java compiles to bytecode, NOT to .exe — that is exactly the point of the JVM." },
        ]),
      ],
      outro: "You now know the promise: imaginary computer, universal bytecode, one codebase everywhere. But promises are boring until you see the machine move. Next: you will write your very first program — and dissect it line by line like a surgeon.",
    },
    /* ---------------- W0L2 ---------------- */
    {
      id: "w0l2", title: "Your First Program — Anatomy of Hello World", minutes: 12, xp: 70,
      narrative: "Every programmer's rite of passage. But while others type Hello World and move on, you will do something different — you will understand every single character. Why does it start with public? What is that cryptic main line? Why does the console just… appear? When you can explain Hello World, you can explain anything.",
      sections: [
        P("Here is the smallest complete Java program. Read it first — we will dissect it right after:"),
        CODE("public class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, Java Quest!\");\n    }\n}", "HelloWorld.java", "Hello, Java Quest!"),
        P("Two commands run this. Save the file as <code>HelloWorld.java</code> (the filename MUST match the class name), then:"),
        CODE("# 1) compile: source → bytecode (creates HelloWorld.class)\njavac HelloWorld.java\n\n# 2) run: the JVM executes the bytecode\njava HelloWorld", "terminal"),
        CO("jargon", "Terminal / command line", "The text-based interface where you type commands. <b>javac</b> is the Java compiler; <b>java</b> is the bytecode runner. <code>javac X.java</code> produces X.class; <code>java X</code> runs it (no .class extension!)." ),
        H("Surgical Dissection — Every Word Explained", "🔬"),
        CODE("public class HelloWorld {           // (1) (2) (3)\n    public static void main(String[] args) {  // (4) (5) (6) (7) (8)\n        System.out.println(\"Hello, Java Quest!\"); // (9) (10)\n    }\n}", "anatomy"),
        OL([
          "<b>public</b> — an " + T("access-modifiers") + " meaning 'visible to the whole world'. The JVM must be able to call your class from outside, so it must be public.",
          "<b>class</b> — declares a " + T("class") + ": the blueprint that holds your code. Everything in Java lives inside a class. No class, no program.",
          "<b>HelloWorld</b> — the class name. Must match the filename exactly (case-sensitive!): HelloWorld.java. This trips up 100% of beginners once.",
          "<b>public</b> — so the JVM can invoke the main method.",
          "<b>static</b> — the method belongs to the class itself, not to any object. No object exists yet when the program starts! The JVM calls <code>HelloWorld.main(...)</code> without creating a HelloWorld instance.",
          "<b>void</b> — the method returns nothing. main is a starting pistol, not a factory.",
          "<b>main</b> — the magic entry point name. The JVM looks for exactly this signature to start your program.",
          "<b>String[] args</b> — command-line arguments arrive here. Run <code>java HelloWorld Alice Bob</code> and args = [\"Alice\", \"Bob\"].",
          "<b>System.out</b> — the standard " + T("system-out") + " stream (the console). System.err is its error twin.",
          "<b>println</b> — print a line (with a newline at the end). Its cousin print() stays on the same line.",
        ]),
        CO("depth", "Why is main's signature SO strict?", "The JVM has one hard-coded recipe for starting an app: call <code>public static void main(String[] args)</code>. Get any part wrong — make it non-static, return an int, capitalize Main — and the JVM politely throws <code>Error: Main method not found</code>. There is no magic; the launcher literally searches for that exact method name and shape."),
        CO("pitfall", "The 3 classic beginner errors", "1️⃣ <b>File named helloworld.java but class HelloWorld</b> → compile error (names must match, case included).<br>2️⃣ <b>Missing semicolon</b> → 'reached end of file while parsing' (Java wants ; after every statement).<br>3️⃣ <b>Capital println vs Println</b> → 'cannot find symbol'. Java is case-sensitive: <code>System</code> ≠ <code>system</code>."),
        H("Comments & Style — Code Is Read More Than Written", "✍️"),
        CODE("// single-line comment — ignored by the compiler\n/* multi-line\n   comment */\n/** javadoc comment — used to generate documentation */\n\n// Java naming conventions (not enforced, but expected):\n// class names:     HelloWorld      (PascalCase)\n// variables:       myVariable      (camelCase)\n// constants:       MAX_SIZE        (UPPER_SNAKE)\n// methods:         calculateTotal  (camelCase)", "style"),
        CO("pro", "Pro habit 🌱", "Every time you write a class, ask: 'would a stranger understand this name?' <code>Manager</code> is vague; <code>InvoiceManager</code> is clear. Future-you (at 2am, debugging) will send a thank-you note."),
        QUIZ([
          { type: "fill", q: "Complete the JVM entry point signature: public static void _____(String[] args)", answers: ["main"], explain: "The JVM hunts for exactly <code>main</code>. It is the universal starting pistol of Java programs." },
          { type: "mcq", q: "Why is <code>main</code> declared <code>static</code>?", options: ["So it runs faster", "Because no object exists yet when the JVM starts the program", "Because main cannot use variables", "Static is required for println"], answer: 1, explain: "Spot on. static methods belong to the class itself. The JVM calls HelloWorld.main(...) before any HelloWorld object exists — so it MUST be static." },
          { type: "tf", q: "A file named <code>Hello.java</code> can contain <code>public class HelloWorld</code>.", answer: false, explain: "False! The public class name must exactly match the filename (case-sensitive): HelloWorld.java ↔ public class HelloWorld." },
          { type: "codefix", q: "This program has one bug. Choose the fix:", code: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hi\")\n    }\n}", options: ["Add a semicolon after (\"Hi\")", "Rename println to printline", "Remove the public from class", "Add void after println"], answer: 0, explain: "Statements in Java must end with <code>;</code>. Without it the compiler reports a parse error." },
        ]),
        REF("Before moving on, look away from the screen and say aloud: 'To start, Java needs a public class containing public static void main(String[] args).' Can you explain <code>static</code> to a friend? That tiny word is the door to Chapter 2."),
      ],
      outro: "Hello World ran — but WHY did it run? What actually happened between 'javac' and that text on screen? Time to open the hood and watch the machine think.",
    },
    /* ---------------- W0L3 ---------------- */
    {
      id: "w0l3", title: "Under the Hood — How Java Actually Executes", minutes: 12, xp: 70,
      narrative: "Most courses skip this. You will not. Understanding the machine is the difference between 'tutorials say so' and 'I know why'. Right now, as you read this, your JVM is doing something remarkable — compiling your code WHILE running it. Let us zoom in.",
      sections: [
        H("The Journey of a Java Program", "🛣️"),
        OL([
          "<b>Writing.</b> You type source code — human language for logic. The compiler only cares about correctness.",
          "<b>Compiling (javac).</b> Source → " + T("bytecode") + ". The compiler also catches type errors, missing methods, bad syntax. Compile-time errors are 'before the program even exists'.",
          "<b>Loading.</b> When you run <code>java HelloWorld</code>, the " + T("classloader") + " reads the .class files and puts their structure into the JVM.",
          "<b>Interpreting + JIT.</b> The JVM starts interpreting bytecode line by line… and meanwhile the " + T("jit") + " watches which code runs repeatedly (hot code) and compiles THAT into super-fast machine code. Best of both worlds: instant startup + eventual top speed.",
          "<b>Running & GC.</b> Objects are created on the " + T("heap") + " all the time; " + T("gc") + " quietly sweeps away the ones nobody references anymore.",
        ]),
        CO("depth", "Why the JVM mixes interpreting and compiling", "Pure interpretation is slow (translation every run). Pure compilation is fast but complex to make portable. The JVM starts interpreted (instant launch), profiles which methods are 'hot', then compiles those with aggressive optimizations (inlining, unboxing elimination, even removing objects entirely via " + T("escape-analysis") + "). This is why long-running servers get faster over minutes — the JIT warms up."),
        H("The Two Memory Worlds: Stack & Heap", "🧠"),
        P("This split explains almost every 'weird' Java behavior you will ever meet — including why threads collide. Memorize this picture:"),
        TABLE(["", "STACK", "HEAP"], [
          ["Stores", "method calls + local variables (including primitives and references)", "ALL objects (created with new)"],
          ["Shared between threads?", "❌ No — each thread has its own stack", "✅ Yes — one heap for the whole JVM"],
          ["Lifetime", "gone instantly when the method returns", "until GC proves nothing can reach it"],
          ["Speed", "very fast (LIFO discipline)", "slower, managed by GC"],
          ["Failure mode", "StackOverflowError (infinitely deep calls)", "OutOfMemoryError (heap full)"],
        ]),
        CO("jargon", "LIFO — Last In, First Out", "The stack works like a stack of plates: the last method called is the first to finish. Each method call pushes a <b>stack frame</b> (its variables and bookkeeping); the return pops it off. Local variables vanish with their frame — which is why a variable declared inside a method does not exist outside it."),
        DEMO("memoryModel", "Walk a program through the stack & heap"),
        H("Compile-Time vs Runtime Errors", "⚖️"),
        UL([
          "<b>Compile-time error</b> (caught by javac): typos, wrong types, missing semicolons. The program is never born. Read the message — it names the line.",
          "<b>Runtime error</b> (thrown while running): division by zero (for integers), " + T("npe") + ", array index out of bounds. The program starts, then explodes. You will master handling these in the Exceptions chapter.",
          "<b>Logical error</b> (worst kind): the program runs fine… and produces the wrong answer. No error message! Only tests and careful thinking catch these.",
        ]),
        QUIZ([
          { type: "mcq", q: "Where does a local variable live, and what happens to it when the method returns?", options: ["Heap — it stays until GC runs", "Stack — it disappears with the method's stack frame", "Metaspace — forever", "String pool"], answer: 1, explain: "Locals (primitives AND references) live on the thread's stack frame and vanish the instant the method returns. Objects they pointed to live on — on the heap." },
          { type: "tf", q: "The JIT compiler improves performance of code paths that run frequently.", answer: true, explain: "True — that is its whole job: watch for 'hot' code and compile it to native machine code with heavy optimizations." },
          { type: "order", q: "Put a Java program's journey in order (click from first to last):", items: ["Source code (Hello.java) is written", "javac compiles it to bytecode (Hello.class)", "JVM classloader loads the bytecode", "Interpreter + JIT execute it on the CPU"], explain: "Write → compile → load → execute. Understanding this pipeline means you will never be confused by 'compile error' vs 'runtime error' again." },
        ]),
      ],
      outro: "The machine holds no more secrets: bytecode, JIT, stack, heap, GC. You now understand Java deeper than many working developers. Your foundation is poured. Next world: variables, types, operators — the raw vocabulary of code. We move from theory to pure practical power.",
    },
  ],
});

/* ============================================================
   WORLD 1 — FOUNDATIONS
   ============================================================ */
WORLDS.push({
  id: "w1", num: 1, emoji: "🧱", color: "#8b5cf6",
  title: "Foundations of Code",
  subtitle: "variables · types · operators · control flow · loops · arrays · strings",
  intro: "This is your bootcamp. Every elegant system ever built — every game, bank, rocket — is made of these atoms: values in boxes, decisions, repetition, and collections of data. Master these and code stops being magic. You will write real logic in this world, not just read it.",
  badge: { id: "b_w1", name: "Foundation Forged", emoji: "🧱", desc: "Mastered variables, loops, arrays and strings — the atoms of code." },
  lessons: [
    /* ---------------- W1L1 ---------------- */
    {
      id: "w1l1", title: "Variables & Data Types — Boxes of Memory", minutes: 14, xp: 80,
      narrative: "A program that cannot remember anything is just a calculator. Variables are memory — named boxes that hold values while your program thinks. But Java is picky about its boxes: every box has a type, and the type decides how big the box is and what can live inside. Let us learn the language of boxes.",
      sections: [
        P("A " + T("variable") + " is a named box in memory holding a value of one specific " + T("type") + ". In Java you must declare the type before you use it:"),
        CODE("int age = 25;          // box named 'age', type int, value 25\ndouble price = 99.5;   // decimal number\nboolean isReady = true; // true or false\nchar grade = 'A';      // ONE character, in single quotes\nString name = \"Ava\";   // text (String is a CLASS, not a primitive!)", "declaring variables"),
        H("The 8 Primitive Types — Java's Atoms", "⚛️"),
        P(T("primitive") + " types store raw values directly on the " + T("stack") + " (no object overhead). Know their sizes and ranges — interviewers adore this table:"),
        TABLE(["Type", "Size", "Range / Notes", "Use for"], [
          ["byte", "8 bits", "-128 … 127", "tiny numbers, raw network bytes"],
          ["short", "16 bits", "-32,768 … 32,767", "rarely used; compact integers"],
          ["int", "32 bits", "±2.1 billion", "DEFAULT for whole numbers"],
          ["long", "64 bits", "±9.2 × 10¹⁸", "huge numbers (use suffix L)"],
          ["float", "32 bits", "~7 decimal digits precision", "decimals when memory matters (suffix f)"],
          ["double", "64 bits", "~15 digits precision", "DEFAULT for decimals"],
          ["char", "16 bits", "0 … 65,535 (Unicode!)", "one character: 'A', '9', '₹'"],
          ["boolean", "1 bit (practically)", "true / false", "flags and conditions"],
        ]),
        CO("jargon", "Bits, bytes, and why ranges exist", "A <b>bit</b> is one 0/1 switch. 8 bits = 1 <b>byte</b> = 256 possible values. An <b>int</b> uses 4 bytes (32 bits) → 2³² possible values split between negatives and positives (that is the ±2.1 billion range). Types are just agreements about how many switches to use." ),
        CODE("int big = 2_000_000_000;   // underscores are allowed for readability (Java 7+)\nlong population = 7_900_000_000L;  // MUST add L — 7.9 billion overflows int!\ndouble pi = 3.141592653589793;\nfloat rough = 3.14f;                 // MUST add f for float literals\nchar letter = 'A';                   // single quotes\nchar hindi = 'क';                    // char is Unicode — every language's characters!\nboolean flag = false;", "literals"),
        H("Overflow — When Numbers Wrap Around", "🎢"),
        P("An int has a hard ceiling. Push past it and Java silently wraps around like an odometer — no error, no warning, just wrong answers. Watch:"),
        CODE("int max = Integer.MAX_VALUE;    // 2147483647\nSystem.out.println(max);         // 2147483647\nSystem.out.println(max + 1);     // -2147483648  😱 wrapped to the minimum!\nSystem.out.println(max + 2);     // -2147483647", "overflow demo", "2147483647\n-2147483648\n-2147483647"),
        CO("pitfall", "Real-world disaster 💣", "In 2015, a bug where a millisecond counter overflowed an int grounded Boeing 787s (they needed a reboot every 248 days!). Numbers are not innocent. When values might grow, choose long — or better, do bounds-checked arithmetic."),
        H("Casting — Converting Between Types", "🔄"),
        P(T("casting") + " converts a value from one type to another. Two flavors:"),
        UL([
          "<b>Widening</b> (automatic, safe): small box → big box. <code>int → long → double</code>. No data lost.",
          "<b>Narrowing</b> (manual, risky): big box → small box. You must ask explicitly: <code>int x = (int) 9.99;</code> — the .99 is chopped off (x becomes 9).",
        ]),
        CODE("int small = 42;\ndouble d = small;          // widening: 42.0 (automatic)\n\nint back = (int) d;        // narrowing: explicit cast\n\ndouble price = 99.99;\nint cents = (int) price;   // 99 — decimals are TRUNCATED (not rounded!)\n\nint a = 5, b = 2;\ndouble frac = a / b;       // 2.0  😱 integer division happened FIRST!\ndouble ok = (double) a / b; // 2.5 ✅ cast one side to break integer division", "casting", "42.0\n99\n2.0\n2.5"),
        CO("pitfall", "The integer-division trap", "<code>5 / 2</code> is <b>2</b>, not 2.5 — both operands are ints, so Java does integer division and drops the remainder. To get decimals, cast first: <code>(double) a / b</code>, or write one operand as a decimal: <code>5.0 / 2</code>."),
        H("Variable Rules & Scope", "📏"),
        UL([
          "<b>Declare before use.</b> Java checks everything at compile time.",
          "<b>Names:</b> letters, digits, _ and $ (start with a letter/_, not a digit). <code>myName2</code> ✅ <code>2name</code> ❌",
          "<b>Keywords reserved:</b> class, int, new, return, static… cannot be used as names.",
          "<b>Scope:</b> a variable exists only inside its { braces }. Declared inside an if-block? It dies at the closing brace.",
          "<b>final:</b> <code>final double TAX = 0.18;</code> makes it a constant — reassignment is a compile error.",
        ]),
        CO("pro", "Style that scales", "Declare variables where you first need them (not all at the top), name them for meaning not letters (<code>totalPrice</code>, not <code>tp</code>), and mark true constants <code>final</code>. Also: <code>var list = new ArrayList&lt;String&gt;();</code> (Java 10+) lets the compiler infer the type — used wisely, it removes noise; the type is still fixed at compile time (no dynamic typing!)."),
        QUIZ([
          { type: "output", q: "What does this print?", code: "int a = 5, b = 2;\nSystem.out.println(a / b);\nSystem.out.println((double) a / b);", options: ["2 and 2.5", "2.5 and 2.5", "2 and 2.0", "Error: cannot cast int"], answer: 0, explain: "5/2 is integer division → 2. Casting one side to double promotes the whole division → 2.5. The classic division trap!" },
          { type: "mcq", q: "Which literal correctly stores 3 billion people in a variable?", options: ["int p = 3000000000;", "long p = 3000000000L;", "short p = 3000000000;", "byte p = 3000000000;"], answer: 1, explain: "3 billion overflows int's ±2.1 billion limit. long with the L suffix handles it (the L is required because 3 billion is too big to be an int literal)." },
          { type: "tf", q: "Narrowing casts (e.g. double → int) happen automatically without writing anything.", answer: false, explain: "False — narrowing must be explicit: (int) myDouble. And it truncates: 9.99 becomes 9." },
          { type: "fill", q: "Which keyword makes a variable a constant that cannot be reassigned?", answers: ["final"], explain: "<code>final</code> freezes a variable after its first assignment — the proper Java 'constant'." },
        ]),
      ],
      outro: "You can now store anything: people counts, prices, letters, flags. But values sitting in boxes are just inventory. Next: operators — the verbs that make values move, compare, combine, and decide.",
    },
    /* ---------------- W1L2 ---------------- */
    {
      id: "w1l2", title: "Operators & Expressions — Making Values Move", minutes: 13, xp: 75,
      narrative: "If variables are nouns, operators are verbs. Addition, comparison, logic, decisions — every calculation your program will ever perform is written with these symbols. There are traps here too: a mysterious && that refuses to evaluate, and a == that compares something unexpected. By the end, expressions will read like English to you.",
      sections: [
        H("The Operator Toolkit", "🧰"),
        TABLE(["Category", "Symbols", "Example", "Result"], [
          ["Arithmetic", "+ - * / %", "7 % 3", "1 (remainder!)"],
          ["Unary", "++ -- + - !", "int a=5; a++", "a becomes 6"],
          ["Relational", "== != > < >= <=", "5 > 3", "true"],
          ["Logical", "&& || !", "true && false", "false"],
          ["Assignment", "= += -= *= /=", "x += 5", "x = x + 5"],
          ["Ternary", "cond ? a : b", "x = 5>3 ? 10 : 20", "x = 10"],
          ["Bitwise", "& | ^ ~ << >>", "1 << 3", "8 (shift bits!)"],
        ]),
        CODE("int r = 7 % 3;       // remainder = 1  (great for 'is even?' → n % 2 == 0)\nint x = 5;\nx++;                  // 6 (post-increment: use THEN add)\nint y = ++x;          // y=7, x=7 (pre-increment: add THEN use)\nboolean big = 10 >= 10; // true (greater-or-equal)\nboolean no = !(5 == 5); // false (negation)", "operators in action", "1\n7\ntrue\nfalse"),
        H("Short-Circuit Logic — The Smart Stop", "⚡"),
        P("Logical operators " + T("short-circuit") + ": the moment the answer is certain, Java stops evaluating. <code>false && anything</code> is false — so <code>anything</code> is never executed. This is not just speed; it is a safety device:"),
        CODE("// SAFE: if x is null, the right side is never evaluated\nif (x != null && x.length() > 3) {\n    System.out.println(\"long enough\");\n}\n\n// DANGEROUS without short-circuit thinking:\nif (x.length() > 3 && x != null) {\n    // 💥 NPE! length() runs FIRST when x is null\n}", "short-circuit"),
        CO("pitfall", "The order of && matters", "Always put the <b>cheap null-guard first</b>: <code>x != null && x.isReady()</code>. The same applies to division: <code>b != 0 && a / b > 2</code>. This one habit prevents a whole class of NullPointerException bugs."),
        H("== vs equals() — The Classic Interview Trap", "🎭"),
        P("For primitives, <code>==</code> compares values. For objects, <code>==</code> compares " + T("reference") + "s — 'are these the SAME object?' — not their content! Text comparison needs .equals():"),
        CODE("String a = \"hello\";\nString b = \"hello\";\nString c = new String(\"hello\");\n\nSystem.out.println(a == b);        // true  (same pooled literal!)\nSystem.out.println(a == c);        // false (c is a different heap object)\nSystem.out.println(a.equals(c));   // true  (same characters — what you want)\n\nInteger x = 127, y = 127;\nInteger p = 128, q = 128;\nSystem.out.println(x == y);        // true  (small integers are cached!)\nSystem.out.println(p == q);        // false (not cached — separate objects)", "== vs equals", "true\nfalse\ntrue\ntrue\nfalse"),
        CO("depth", "Why are 127 and 128 treated differently?", "The " + T("wrapper") + " class Integer keeps a tiny cache (−128…127). Literals in that range reuse ONE shared object each, so == accidentally works. Above 127 (or with new Integer(...)) each value is a fresh object and == breaks. This is why the rule is absolute: <b>compare objects with equals(), never ==</b>."),
        H("Operator Precedence — Who Goes First?", "🥇"),
        P(T("precedence") + " decides evaluation order. The essentials, high → low: <code>()</code> → unary (!, ++, --) → * / % → + - → relational (<, >) → equality (==, !=) → && → || → ternary → assignment. When in doubt, parenthesize — clarity beats cleverness:"),
        CODE("int result = 2 + 3 * 4;      // 14, NOT 20 (* before +)\nint clear = 2 + (3 * 4);     // 14 — parentheses make it obvious\nint trick = (2 + 3) * 4;     // 20 — different formula entirely", "precedence", "14\n14\n20"),
        H("The Ternary Operator — Mini if-else", "🔀"),
        P(T("ternary") + " is a one-line decision that RETURNS a value: <code>condition ? valueIfTrue : valueIfFalse</code>"),
        CODE("int age = 20;\nString access = age >= 18 ? \"allowed\" : \"denied\";\nSystem.out.println(access);\n\n// nest sparingly — readability first:\nString tier = score > 90 ? \"gold\" : score > 60 ? \"silver\" : \"bronze\";", "ternary", "allowed"),
        QUIZ([
          { type: "output", q: "Predict the output:", code: "int a = 10;\nint b = 4;\nSystem.out.println(a / b + \" \" + a % b);", options: ["2.5 2", "2 2", "2 1", "3 2"], answer: 1, explain: "10/4 = 2 (integer division truncates) and 10%4 = 2 (remainder). So: '2 2'." },
          { type: "mcq", q: "Why does <code>if (list != null && list.size() > 0)</code> never throw NullPointerException?", options: ["Java skips null checks automatically", "Short-circuit && never calls size() when list is null", "size() catches its own exceptions", "null is treated as 0"], answer: 1, explain: "Short-circuit evaluation! When the left side is false (list is null), && stops immediately and size() never runs." },
          { type: "output", q: "What prints?", code: "Integer a = 127, b = 127;\nInteger c = 128, d = 128;\nSystem.out.println(a == b);\nSystem.out.println(c == d);", options: ["true true", "false false", "true false", "false true"], answer: 2, explain: "Integer caches −128..127 — so 127 == 127 is the same cached object (true), while 128 creates two objects (false). The reason .equals() is mandatory for objects." },
          { type: "multi", q: "Which expressions evaluate to 3?", options: ["7 % 4", "10 / 3", "(2 + 4) / 2", "1 << 1 + 1"], answers: [0, 1, 2], explain: "7 % 4 = 3 (remainder) ✅, 10 / 3 = 3 (integer division truncates) ✅, (2+4)/2 = 3 ✅, and 1 &lt;&lt; 1 + 1 = 1 &lt;&lt; 2 = 4 ❌ — because + binds tighter than &lt;&lt; ! A precedence trap hiding in bit-shift clothing." },
        ], "Logic Gym 💪"),
      ],
      outro: "Values flow, compare, and decide. You have arithmetic for money, logic for safety checks, ternary for quick choices. But real programs branch — they choose paths. Next up: if, switch, and the art of decision-making.",
    },
    /* ---------------- W1L3 ---------------- */
    {
      id: "w1l3", title: "Control Flow — Teaching Code to Decide", minutes: 12, xp: 75,
      narrative: "A calculator computes; a program decides. Everything intelligent about software — recommendations, access control, game AI, fraud detection — is an if statement at heart. Learn to make code branch cleanly and your programs start to feel alive.",
      sections: [
        H("if / else if / else", "🔀"),
        CODE("int score = 84;\n\nif (score >= 90) {\n    System.out.println(\"A grade\");\n} else if (score >= 80) {\n    System.out.println(\"B grade\");   // ✅ this runs\n} else if (score >= 70) {\n    System.out.println(\"C grade\");\n} else {\n    System.out.println(\"Needs work\");\n}", "grading logic", "B grade"),
        UL([
          "Conditions must be <b>boolean</b>. No <code>if (x = 5)</code> (that is assignment — compile error in Java, unlike C!).",
          "Braces <code>{}</code> are optional for one statement — but ALWAYS use them. Missing braces cause famous bugs.",
          "Order matters: the first true branch wins and the rest are skipped.",
        ]),
        H("switch — Modern Arrow Style (Java 14+)", "🗡️"),
        P("Classic switch had 'fall-through' bugs (forgetting break). The modern " + T("switch-expression") + " is safe, concise, and even returns values:"),
        CODE("String day = \"SAT\";\n\n// modern switch expression — no fall-through, returns a value!\nString mood = switch (day) {\n    case \"MON\", \"TUE\", \"WED\", \"THU\" -> \"grind\";\n    case \"FRI\" -> \"almost there\";\n    case \"SAT\", \"SUN\" -> \"weekend! 🎉\";\n    default -> \"unknown day\";\n};\nSystem.out.println(mood);", "switch expression", "weekend! 🎉"),
        CO("jargon", "Fall-through (the old switch disease)", "In old-style switch, cases 'fall through' to the next one unless you write <b>break</b>. Forget it once and two cases execute — a classic bug. The new <code>case X -></code> syntax simply cannot fall through. Prefer it whenever you can."),
        H("Nested Conditions — Readability Rules", "🧅"),
        CODE("// Deep nesting is a code smell. Refactor with early returns:\n\n// ❌ pyramid of doom\nif (user != null) {\n    if (user.isActive()) {\n        if (user.getBalance() > 0) {\n            // do the real thing, 3 levels deep...\n        }\n    }\n}\n\n// ✅ flatten with guard clauses\nif (user == null)          return;\nif (!user.isActive())      return;\nif (user.getBalance() <= 0) return;\n// do the real thing — at the top level, clean", "guard clauses"),
        CO("pro", "Guard clause philosophy", "Handle the abnormal cases first and return early. The 'happy path' then reads top-to-bottom like a story. This style is used in nearly all professional Java codebases."),
        QUIZ([
          { type: "output", q: "What does the modern switch return?", code: "String day = \"SAT\";\nString mood = switch (day) {\n    case \"MON\" -> \"grind\";\n    case \"SAT\" -> \"weekend\";\n    default -> \"other\";\n};\nSystem.out.println(mood);", options: ["grind", "weekend", "other", "Compile error"], answer: 1, explain: "day is \"SAT\" so the matching arrow branch returns \"weekend\". Arrow cases never fall through." },
          { type: "tf", q: "In Java, <code>if (x = 5)</code> compiles fine and checks if x is 5.", answer: false, explain: "False — = is assignment, and Java requires a boolean in if(...). The compiler rejects this. (This is a real safety feature over C/C++.)" },
          { type: "mcq", q: "What is a 'guard clause'?", options: ["A security check for passwords", "An early return that handles edge cases first, flattening nesting", "A special Java keyword", "A try-catch block"], answer: 1, explain: "A guard clause checks a failure condition up front and returns early — so the main logic stays flat and readable." },
        ]),
        CHAL({
          title: "Implement: Grade Classifier 🎯",
          q: "Write a method <code>String grade(int score)</code> that returns \"A\" (90+), \"B\" (80–89), \"C\" (70–79), \"D\" (60–69), \"F\" (below 60). Use if / else-if.",
          starter: "public class Grader {\n    // return \"A\", \"B\", \"C\", \"D\" or \"F\" based on score\n    public String grade(int score) {\n        // your code here\n        return \"\";\n    }\n}",
          checks: [
            { re: "public\\s+String\\s+grade\\s*\\(\\s*int\\s+score\\s*\\)", msg: "Method grade(int score) exists with the right signature" },
            { re: "if\\s*\\(", msg: "Uses an if statement to branch" },
            { re: "(else\\s*if|else)", msg: "Handles multiple ranges with else-if or else" },
            { re: "(90|>=\\s*90)", msg: "Checks the 90+ boundary for grade A" },
            { re: "return\\s+\"A\"", msg: "Returns \"A\" for high scores" },
            { re: "return\\s+\"F\"", msg: "Returns \"F\" for failing scores" },
          ],
          hints: ["Structure: if (score >= 90) return \"A\"; else if (score >= 80) return \"B\"; …", "Start checking from the HIGHEST range downward — order matters!"],
          solution: "public String grade(int score) {\n    if (score >= 90) return \"A\";\n    else if (score >= 80) return \"B\";\n    else if (score >= 70) return \"C\";\n    else if (score >= 60) return \"D\";\n    else return \"F\";\n}",
        }),
      ],
      outro: "Your programs now think. But one decision per run is not enough — real software repeats: scoring 1000 students, serving 10000 requests. Next: loops — the power of doing it again, and again, and again…",
    },
    /* ---------------- W1L4 ---------------- */
    {
      id: "w1l4", title: "Loops — The Power of Repetition", minutes: 13, xp: 80,
      narrative: "Legend says a programmer was asked to write 'I will not talk in class' 100 times on the blackboard. She wrote a loop. Loops are how software scales one instruction into a million. But with great power comes the infinite loop — the bug that freezes computers and teaches humility. Master both sides.",
      sections: [
        H("The Three Loop Flavors", "🔁"),
        CODE("// FOR — when you know HOW MANY times\nfor (int i = 0; i < 5; i++) {\n    System.out.print(i + \" \");\n}\n// 0 1 2 3 4\n\n// WHILE — repeat while a condition holds (0+ times)\nint count = 0;\nwhile (count < 3) {\n    System.out.print(count + \" \");\n    count++;\n}\n// 0 1 2\n\n// DO-WHILE — runs AT LEAST once (1+ times)\nint n = 0;\ndo {\n    System.out.print(n + \" \");\n    n++;\n} while (n < 3);\n// 0 1 2", "three loops", "0 1 2 3 4\n0 1 2\n0 1 2"),
        TABLE(["Loop", "Use when", "Runs at minimum"], [
          ["for", "count is known (indexes, fixed rounds)", "0 times"],
          ["while", "condition-driven, count unknown", "0 times"],
          ["do-while", "must run once first (menus, input prompts)", "1 time"],
        ]),
        H("Loop Anatomy & The Classic Bugs", "🐛"),
        UL([
          "<b>Off-by-one.</b> <code>for (int i = 0; i &lt;= 5; i++)</code> runs SIX times (0..5). For 5 rounds use <code>i &lt; 5</code>. Arrays (next lesson) taught this pain to everyone.",
          "<b>Infinite loop.</b> Forget the increment and the condition never becomes false: the program spins forever at 100% CPU. Emergency brake: Ctrl+C in the terminal.",
          "<b>Update inside the body.</b> The <code>i++</code> must actually run — never continue past it by accident.",
        ]),
        CODE("for (int i = 1; i <= 100; i++) {\n    if (i % 15 == 0)      System.out.print(\"FizzBuzz \");\n    else if (i % 3 == 0)  System.out.print(\"Fizz \");\n    else if (i % 5 == 0)  System.out.print(\"Buzz \");\n    else                  System.out.print(i + \" \");\n}", "FizzBuzz — the programmer's anthem", "1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz 16 …"),
        H("break, continue & Nested Loops", "🎮"),
        CODE("// break: exit the loop entirely\nfor (int i = 0; i < 10; i++) {\n    if (i == 3) break;      // stops at 3\n    System.out.print(i);    // prints 012\n}\n\n// continue: skip to the next iteration\nfor (int i = 0; i < 5; i++) {\n    if (i % 2 == 0) continue; // skip evens\n    System.out.print(i);      // prints 13\n}\n\n// nested loops — the multiplication table\nfor (int row = 1; row <= 3; row++) {\n    for (int col = 1; col <= 3; col++) {\n        System.out.print(row * col + \"\\t\");\n    }\n    System.out.println();\n}", "loop control", "012\n13\n1\t2\t3\t\n2\t4\t6\t\n3\t6\t9\t"),
        CO("depth", "Labeled breaks (rare but real)", "From a nested loop, plain break only exits the INNER loop. To escape a specific outer loop: <code>outer: for (...) { for (...) { break outer; } }</code>. The label names which loop to break. Used in matrix searches and parsing — now you know it exists."),
        CO("analogy", "Loop as a washing machine 🧺", "for = 'wash exactly 5 times'. while = 'keep washing while the water is dirty'. do-while = 'wash once, then check if the water is still dirty'. Programming is just domestic chores with better syntax."),
        QUIZ([
          { type: "output", q: "How many times does this loop body run?", code: "for (int i = 2; i < 7; i++) {\n    System.out.print(i);\n}", options: ["4 times (2 3 4 5)", "5 times (2 3 4 5 6)", "6 times (1 2 3 4 5 6)", "5 times (3 4 5 6 7)"], answer: 1, explain: "i starts at 2 and stops when i reaches 7 (since i < 7). So: 2,3,4,5,6 — five iterations." },
          { type: "mcq", q: "Which loop guarantees its body runs at least once?", options: ["for", "while", "do-while", "nested for"], answer: 2, explain: "do-while checks the condition AFTER the body runs — so the body always executes at least once. Perfect for input prompts that must appear before validation." },
          { type: "tf", q: "<code>continue</code> exits the entire loop immediately.", answer: false, explain: "False — continue skips just the CURRENT iteration and jumps to the next one. break is what exits the whole loop." },
        ]),
        CHAL({
          title: "Implement: Sum of Evens + FizzBuzz Challenger 🏋️",
          q: "Write <code>int sumEvens(int n)</code> that returns the sum of ALL EVEN numbers from 1 to n (inclusive). Example: sumEvens(10) → 2+4+6+8+10 = 30. Then think: how would you print FizzBuzz for 1..100?",
          starter: "public class Summer {\n    // sum of even numbers from 1 to n\n    public int sumEvens(int n) {\n        int sum = 0;\n        // your loop here\n        return sum;\n    }\n}",
          checks: [
            { re: "public\\s+int\\s+sumEvens\\s*\\(\\s*int\\s+n\\s*\\)", msg: "Method sumEvens(int n) exists" },
            { re: "(for|while)\\s*\\(", msg: "Uses a loop to iterate" },
            { re: "%\\s*2", msg: "Checks evenness with % 2 (or increments by 2)" },
            { re: "sum\\s*\\+=", msg: "Accumulates into sum with +=" },
          ],
          hints: ["for (int i = 2; i <= n; i += 2) sum += i; — step by 2 to hit only evens!", "Alternative: loop all i, use if (i % 2 == 0) sum += i;"],
          solution: "public int sumEvens(int n) {\n    int sum = 0;\n    for (int i = 2; i <= n; i += 2) {\n        sum += i;\n    }\n    return sum;\n}",
        }),
      ],
      outro: "One instruction, a million executions. Your code can now work harder than any human. But loops crunch ONE value at a time — what about a hundred students, a thousand pixels? Collections of data deserve a container built for purpose. Enter: arrays.",
    },
    /* ---------------- W1L5 ---------------- */
    {
      id: "w1l5", title: "Arrays & Basic Algorithms — Collections of Data", minutes: 14, xp: 85,
      narrative: "A single variable is a sticky note. An array is a filing cabinet — one name, many drawers, each with a number. Arrays are the ancestor of every collection in Java and the training ground for the algorithms that make software smart: searching, sorting, aggregating. Open the cabinet.",
      sections: [
        P("An " + T("array") + " holds a fixed number of values of the SAME type, indexed from 0. It is an object in Java — even for primitives — and lives on the " + T("heap") + ":"),
        CODE("int[] scores = new int[5];        // 5 zeros: [0,0,0,0,0]\nscores[0] = 95;                   // fill drawer #0\nscores[1] = 87;\n\nint[] more = {88, 92, 77};        // shorthand: create + fill\n\nSystem.out.println(scores.length); // 5 — note: .length, NOT .length()\nSystem.out.println(scores[0]);     // 95\nSystem.out.println(more[2]);       // 77", "arrays basics", "5\n95\n77"),
        CO("pitfall", "The two array laws", "1️⃣ Indexes start at <b>0</b> — the last valid index is <code>length - 1</code>. Touch index 5 in a size-5 array and the JVM throws ArrayIndexOutOfBoundsException at runtime.<br>2️⃣ Length is fixed forever. To grow, you create a bigger array (or use ArrayList — coming soon)."),
        H("The Traversal Pattern — For-Each", "🚶"),
        CODE("int[] nums = {4, 8, 15, 16, 23, 42};\n\n// classic indexed loop (use when you need the index)\nfor (int i = 0; i < nums.length; i++) {\n    System.out.print(nums[i] + \" \");\n}\n\n// for-each loop (use when you just need values)\nint sum = 0;\nfor (int n : nums) {\n    sum += n;\n}\nSystem.out.println(\"\\nsum = \" + sum);", "traversal", "4 8 15 16 23 42 \nsum = 108"),
        H("Essential Algorithms You Must Know", "⚙️"),
        CODE("// 1) FIND MAXIMUM\nint max = nums[0];\nfor (int n : nums) {\n    if (n > max) max = n;\n}\n\n// 2) LINEAR SEARCH — O(n): check one by one\nint target = 15, found = -1;\nfor (int i = 0; i < nums.length; i++) {\n    if (nums[i] == target) { found = i; break; }\n}\n\n// 3) BUBBLE SORT — O(n²): repeatedly swap neighbors\nfor (int i = 0; i < nums.length - 1; i++) {\n    for (int j = 0; j < nums.length - 1 - i; j++) {\n        if (nums[j] > nums[j + 1]) {\n            int tmp = nums[j];\n            nums[j] = nums[j + 1];\n            nums[j + 1] = tmp;   // classic swap dance\n        }\n    }\n}", "algorithms"),
        CO("jargon", "What does O(n) mean?", "<b>Big-O notation</b> describes how an algorithm's cost grows as data grows. O(n) = linear (double the data → double the work). O(n²) = quadratic (double data → 4× work — painful at scale). O(1) = constant (instant regardless of size). You will meet this vocabulary constantly; now it holds no fear."),
        H("Arrays Utility Class — Your Toolkit", "🧰"),
        CODE("import java.util.Arrays;\n\nint[] a = {5, 2, 9, 1};\nArrays.sort(a);                     // [1, 2, 5, 9]\nSystem.out.println(Arrays.toString(a)); // pretty printing: [1, 2, 5, 9]\nint idx = Arrays.binarySearch(a, 5); // 2 (binarySearch needs SORTED array)\nint[] copy = Arrays.copyOf(a, 6);   // [1, 2, 5, 9, 0, 0]", "Arrays class", "[1, 2, 5, 9]"),
        H("2D Arrays — Grids & Matrices", "▦"),
        CODE("int[][] grid = {\n    {1, 2, 3},\n    {4, 5, 6},\n    {7, 8, 9}\n};\nSystem.out.println(grid[1][2]); // 6  (row 1, column 2 — zero-based!)\n\n// traverse a grid\nfor (int[] row : grid) {\n    for (int cell : row) {\n        System.out.print(cell + \" \");\n    }\n    System.out.println();\n}", "2D arrays", "6\n1 2 3 \n4 5 6 \n7 8 9 "),
        QUIZ([
          { type: "output", q: "What happens?", code: "int[] a = {1, 2, 3};\nSystem.out.println(a[3]);", options: ["Prints 0", "Prints 3", "ArrayIndexOutOfBoundsException", "Compile error"], answer: 2, explain: "Valid indexes for a size-3 array are 0,1,2. Index 3 is one past the end → runtime exception (not a compile error — Java checks array bounds at runtime)." },
          { type: "mcq", q: "To store 5 names in an array, which declaration is correct?", options: ["String names = new String[5];", "String[] names = new String[5];", "String[5] names = new String[];", "names[5] = String;"], answer: 1, explain: "Type[] name = new Type[size]. Note String array elements start as null (objects don't get default zeros — they get null)." },
          { type: "order", q: "Put bubble sort's swap logic in order (click first → last):", items: ["Compare neighbors nums[j] and nums[j+1]", "If out of order, save nums[j] into a temp variable", "Move nums[j+1] into nums[j]", "Write temp into nums[j+1]"], explain: "The classic three-step swap: compare → save first → shift second → deposit saved. Memorize it; you will write swaps for the rest of your career." },
        ]),
        CHAL({
          title: "Implement: Array Toolkit 🔧",
          q: "Write <code>int findMax(int[] arr)</code> that returns the largest value in the array (you may assume arr is non-empty).",
          starter: "public class ArrayKit {\n    public int findMax(int[] arr) {\n        // your code here\n        return 0;\n    }\n}",
          checks: [
            { re: "public\\s+int\\s+findMax\\s*\\(\\s*int\\[\\]\\s+\\w+\\s*\\)", msg: "Method findMax(int[] arr) exists" },
            { re: "(for|while)\\s*\\(", msg: "Loops through the array" },
            { re: "if\\s*\\(", msg: "Compares elements to track the maximum" },
            { re: "arr\\[", msg: "Accesses array elements with arr[i]" },
          ],
          hints: ["Start with int max = arr[0]; then compare every element.", "Any element bigger than max becomes the new max."],
          solution: "public int findMax(int[] arr) {\n    int max = arr[0];\n    for (int i = 1; i < arr.length; i++) {\n        if (arr[i] > max) max = arr[i];\n    }\n    return max;\n}",
        }),
      ],
      outro: "Arrays gave your programs memory — many values, one name, and your first real algorithms. But there is one 'array' you use more than any other: text. Names, messages, JSON, URLs — all strings. And Java's String is full of secrets. Next lesson: the most used class in the entire language.",
    },
    /* ---------------- W1L6 ---------------- */
    {
      id: "w1l6", title: "Strings & User Input — Text Unleashed", minutes: 14, xp: 85,
      narrative: "Every login form, every chat message, every URL your code will ever touch is text. String is the most-used class in Java — and the most misunderstood. Why does == sometimes work on strings? Why is text 'immutable' — and why is that a feature, not a bug? What is the legendary String Pool? This lesson answers questions most graduates never even ask.",
      sections: [
        P(T("string") + " is a class representing text. A String object is " + T("immutable") + " — once created, its characters NEVER change. Every method that 'changes' text actually builds a NEW String:"),
        CODE("String s = \"hello\";\nString up = s.toUpperCase();\nSystem.out.println(s);    // hello  (unchanged!)\nSystem.out.println(up);   // HELLO  (a brand-new string)\n\nString name = \"  Ava  \";\nSystem.out.println(name.trim());          // \"Ava\" — new string\nSystem.out.println(name.replace('A', 'a')); // \"  ava  \" — new string", "immutability", "hello\nHELLO\nAva\n  ava  "),
        CO("analogy", "Strings are like tattoos ✍️", "You cannot edit a tattoo — you can only add a new one. Same with strings: s = s + \"!\" does not modify the old string; it creates a new one and points s at it. In loops that build text, this creates thousands of corpses — which is exactly why StringBuilder exists (hold that thought)."),
        H("The String Pool — Java's Memory Trick", "🫧"),
        P("String literals (text in double quotes) live in a shared " + T("string-pool") + ". Identical literals share ONE object — that is why == sometimes works… and why it is still a trap:"),
        DEMO("stringPool", "See literal sharing vs new String()"),
        H("The String Methods You Will Use Daily", "🛠️"),
        TABLE(["Method", "Does", "Example"], [
          ["length()", "number of characters", "\"java\".length() → 4"],
          ["charAt(i)", "one character at index i", "\"java\".charAt(0) → 'j'"],
          ["substring(a, b)", "slice from a (inclusive) to b (exclusive)", "\"java\".substring(1,3) → \"av\""],
          ["equals(other) / equalsIgnoreCase", "content comparison (case rules)", "\"Java\".equalsIgnoreCase(\"JAVA\") → true"],
          ["indexOf(str) / contains", "find position / check presence", "\"java\".indexOf(\"va\") → 2"],
          ["trim() / strip()", "remove leading/trailing spaces", "\" x \".trim() → \"x\""],
          ["toUpperCase() / toLowerCase()", "case conversion (new string!)", "\"java\".toUpperCase() → \"JAVA\""],
          ["split(regex)", "break into a String[] by a separator", "\"a,b\".split(\",\") → [a, b]"],
          ["replace(old, new)", "replace all occurrences", "\"aa\".replace(\"a\",\"b\") → \"bb\""],
          ["format(template, args)", "printf-style text building", "String.format(\"%s is %d\", \"Ava\", 21)"],
        ]),
        CODE("// parsing text to numbers — common in real apps\nint n = Integer.parseInt(\"42\");        // 42\ndouble d = Double.parseDouble(\"3.14\"); // 3.14\n// Integer.parseInt(\"42x\") → NumberFormatException at runtime!\n\n// building text efficiently\nStringBuilder sb = new StringBuilder();\nfor (int i = 1; i <= 3; i++) {\n    sb.append(i).append(\" \");\n}\nString result = sb.toString(); // \"1 2 3 \"", "parsing & building", "1 2 3"),
        CO("depth", "StringBuilder vs StringBuffer vs concatenation", "<code>a + b</code> in ONE statement is fine — the compiler uses StringBuilder behind the scenes. But inside a LOOP, string concatenation creates one throwaway object per iteration (O(n²) cost). Use StringBuilder (fast, not thread-safe) or StringBuffer (synchronized, slower) for heavy building. Rule: <b>concatenate casually; build in loops with StringBuilder.</b>"),
        H("Reading User Input", "⌨️"),
        CODE("import java.util.Scanner;\n\nScanner sc = new Scanner(System.in);\nSystem.out.print(\"Your name: \");\nString name = sc.nextLine();      // whole line (spaces included)\n\nSystem.out.print(\"Your age: \");\nint age = sc.nextInt();           // one integer token\n\nSystem.out.println(\"Welcome, \" + name + \" (\" + age + \")\");", "scanner"),
        CO("pitfall", "The Scanner newline ghost", "<code>nextInt()</code> leaves the Enter key's newline in the buffer. A following <code>nextLine()</code> reads that empty line instead of waiting! Fix: call <code>sc.nextLine()</code> once to swallow the newline before reading a line. Every beginner hits this once — now you won't be confused when it happens."),
        QUIZ([
          { type: "mcq", q: "What is the result of <code>\"hello\".substring(1, 3)</code>?", options: ["\"he\"", "\"el\"", "\"ell\"", "\"llo\""], answer: 1, explain: "substring(start, end) includes start but EXCLUDES end: indexes 1 and 2 → \"el\". Remember: start inclusive, end exclusive." },
          { type: "tf", q: "After <code>s.toUpperCase()</code>, the original string s is modified in place.", answer: false, explain: "False — strings are immutable! toUpperCase() returns a NEW string and leaves s untouched." },
          { type: "mcq", q: "Which is the correct way to compare two strings for equal content?", options: ["s1 == s2", "s1.equals(s2)", "s1.compareTo(s2) == 0 only", "s1.isEqual(s2)"], answer: 1, explain: "equals() compares characters — the right tool. (compareTo(s2) == 0 also works but equals() is clearer.) == compares object identity — a classic bug source." },
          { type: "fill", q: "Which class should you use to build long text inside a loop without wasting memory?", answers: ["stringbuilder"], explain: "StringBuilder — mutable, fast, and the standard cure for loop concatenation. (StringBuffer is its synchronized older sibling.)" },
        ]),
        REF("Think of one place in your daily life where you use text — a form, a chat, a search bar. Mentally trace how Java would parse it: which string methods would you call? This habit of 'thinking in code' while living in the world is how developers are born."),
      ],
      outro: "Text is tamed: immutable strings, the pool, builders, and scanners. That closes the foundations world — you now speak fluent Java syntax. Prepare yourself. Next world is the crown jewel of the language, the reason Java is called object-oriented: welcome… to the OOP Palace.",
    },
  ],
});
