---
title: "Building an FPGA-Accelerated Regex Engine from Scratch"
description: "A course project where we built a hardware accelerator that runs regular expression matching on an FPGA."
pubDate: "Apr 30 2026"
tags: ["FPGA", "Verilog", "C++", "Hardware", "Regex"]
githubUrl: "https://github.com/maydayv7/XIIRegexBuilder"
---
# Building an FPGA-Accelerated Regex Engine from Scratch

This is a write-up about our team's course project for our hardware lab course. This was a graded group project where the whole team contributed across hardware design, compiler development, and tooling. Together, we built a hardware accelerator that runs regular expression matching on an FPGA instead of a CPU. The short version: we wrote a C++ compiler that reads regex patterns and spits out synthesizable Verilog code, which then runs on a Nexys A7 FPGA board and matches text at one character per clock cycle. We also built a second approach using a custom soft-processor that lets you swap regex patterns at runtime without having to re-synthesize anything. Here is how all of it works.

## Why Put Regex on an FPGA?

Regular expressions are everywhere. Log parsing, network packet filtering, data validation. On a CPU, a regex engine typically steps through text one character at a time, and if you have N patterns to check, it either runs them one after another (slow) or tries to merge them into one big automaton (complex and memory-hungry). The throughput gets worse as you add more patterns.

An FPGA changes the equation. Because you can instantiate dedicated hardware for each regex pattern, all N patterns evaluate in parallel on every clock cycle. There is no instruction fetch, no cache miss, no OS scheduler interrupting you. Each pattern is literally a circuit etched into the FPGA fabric, and they all fire simultaneously. For our design, that means one byte processed per clock cycle across all patterns at once. At 100 MHz, that is 100 MB/s of continuous matching throughput, regardless of how many patterns you have (within resource limits).

This kind of thing is relevant in domains like financial trading, where FIX protocol messages need to be parsed at wire speed, or in network security where you want to scan every packet against thousands of signatures without slowing down the link.

## System Overview

The project has two distinct "modes" of operation, plus some tooling around them:

1. **The Static Engine**: A C++ compiler translates regex patterns into hardcoded Verilog FSMs. This is the primary and more performant path. The downside is that changing your patterns requires a full re-synthesis (which takes minutes on Vivado).

2. **The Processor Engine**: A custom 32-bit soft-processor that lives on the FPGA and runs a tiny instruction set designed specifically for NFA traversal. Patterns get compiled into "microcode" by a Python toolchain and loaded over UART at runtime. Slower than dedicated hardware, but much more flexible.

Both modes talk to the host PC over USB-UART at 115200 baud, and we wrote Python terminal UIs (using the `rich` library) that let you type strings and see match results in real time.

Let us walk through each part.

<br>

---

<br>

## The Static Engine: From Regex String to Silicon

This is the heart of the project, and it is a four-stage compiler pipeline written in C++17.

### Stage 1: The Lexer

The lexer (`src/lexer.cpp`) takes a raw regex string and breaks it into a sequence of tokens. Each character (or special sequence) becomes a typed token. The supported token types are:

- **CHAR**: A literal character (like `a`, `b`, `3`)
- **DOT**: The `.` wildcard (matches any printable ASCII character)
- **STAR, PLUS, QUESTION**: The quantifier operators `*`, `+`, `?`
- **PIPE**: The alternation operator `|`
- **LPAREN, RPAREN**: Grouping parentheses
- **LBRACKET, RBRACKET**: Character class delimiters `[` and `]`
- **DASH**: The `-` inside character classes for ranges like `a-z`
- **CARET**: The `^` for negated character classes like `[^0-9]`
- **BACKSLASH**: Escape sequences like `\d`, `\w`, `\s` and their uppercase negations

The lexer handles escape sequences by recognizing shorthand classes (`\d` for digits, `\w` for word characters, `\s` for whitespace) and converting them into the appropriate representations for downstream stages. It also deals with the implicit concatenation that regex notation relies on. For example, in the pattern `ab`, there is no explicit operator between `a` and `b`, but the lexer understands they should be concatenated.

### Stage 2: The Parser

The parser (`src/parser.cpp`) implements a recursive descent parser that consumes the token stream and builds an Abstract Syntax Tree (AST). The grammar follows standard regex precedence rules:

- Alternation (`|`) has the lowest precedence
- Concatenation (implicit) is next
- Quantifiers (`*`, `+`, `?`) bind tightest

The AST node types are:

| Node Type | What It Represents |
|---|---|
| `LITERAL` | A single character match |
| `DOT` | Match any character |
| `CHAR_CLASS` | A set or range of characters (like `[a-z]` or `[^0-9]`) |
| `CONCAT` | Sequencing two sub-patterns |
| `ALTERNATION` | Choice between two sub-patterns |
| `STAR` | Zero or more repetitions |
| `PLUS` | One or more repetitions |
| `QUESTION` | Zero or one occurrence |

Character classes get special treatment. The parser expands ranges (so `[a-d]` becomes the set `{a, b, c, d}`), handles negation (the `^` prefix inverts the set against all printable ASCII), and processes shorthand escapes inside classes (so `[\d]` becomes `{0, 1, 2, ..., 9}`).

The parser also supports shorthand character classes used directly in patterns: `\d` (digits), `\w` (word characters: alphanumerics plus underscore), `\s` (whitespace), and their uppercase negations `\D`, `\W`, `\S`.

### Stage 3: NFA Construction (Glushkov's Algorithm)

This is where things get interesting. Most textbooks teach Thompson's construction for building NFAs from regex, but we used Glushkov's construction instead. The reason is practical: Glushkov's construction produces an epsilon-free NFA, which maps much more cleanly to hardware.

Here is the core idea. In Glushkov's algorithm, every "position" in the regex (every place where a character is actually matched) becomes a state in the NFA. There is also one extra initial state (state 0), which does not match any character itself. So for a regex with N matchable positions, you get exactly N+1 states.

The algorithm computes three sets for each sub-expression in the AST:

- **First(e)**: The set of positions that can be the first match in expression `e`
- **Last(e)**: The set of positions that can be the last match in expression `e`
- **Follow(p)**: For each position `p`, the set of positions that can immediately follow a match at `p`

These sets are computed recursively over the AST. For example:
- For a concatenation `AB`, `Follow` includes transitions from every position in `Last(A)` to every position in `First(B)`.
- For a star `A*`, `Follow` includes transitions from every position in `Last(A)` back to every position in `First(A)` (creating loops).
- For alternation `A|B`, `First(A|B)` is simply `First(A)` union `First(B)`.

The initial state (state 0) transitions to every position in `First(entire_regex)`. The accepting states are the positions in `Last(entire_regex)`. If the regex is "nullable" (it can match the empty string, like with `a*`), state 0 is also an accepting state.

Each position carries its own match condition: a specific character literal, a dot (any printable ASCII), or a character class (a set of characters). This means the NFA has no epsilon transitions at all. Every transition is triggered by an actual character match.

### Stage 4: Verilog Emission

The emitter (`src/emitter.cpp`) is the biggest file in the project (about 48 KB of C++), and for good reason. It takes the Glushkov NFA and generates multiple Verilog files that form a complete, synthesizable FPGA design. Here is what it produces:

**Per-Regex NFA Modules** (`nfa_0.v`, `nfa_1.v`, ...): Each regex gets its own Verilog module. The state representation uses one-hot encoding, meaning each NFA state is a single flip-flop. For an NFA with N positions, there are N+1 flip-flops (one per state, including the initial state). On every clock cycle, each flip-flop evaluates whether it should be active based on:
1. Which states were active on the previous cycle
2. Whether the current input character satisfies the transition condition

The character matching logic is generated as combinational expressions. A literal like `a` becomes `(char_in == 8'd97)`. A dot becomes a range check for printable ASCII. A character class becomes an OR of individual comparisons or range checks.

Each module has a simple interface:
- `clk`, `rst`: clock and reset
- `char_in[7:0]`: the current ASCII character
- `start`: signals the beginning of a new string
- `valid`: indicates a valid character is present
- `match`: output flag, high when the NFA is in an accepting state

**The Top-Level Engine** (`top.v`): This instantiates all N regex modules in parallel and fans out the same `char_in`, `start`, and `valid` signals to all of them. It collects all `match` outputs into an N-bit `match_bus`.

**The Testbench** (`tb_top.v`): An auto-generated Verilog testbench that feeds pre-defined test strings into the engine character by character and checks the match outputs against expected results. The expected results come from a golden reference (more on that below).

**The FPGA Top-Level** (`top_fpga.v`): This is the real deployment module. It integrates:

- A **UART receiver** that reads bytes from the serial port
- A **16-byte circular FIFO** (`uart_rx_fifo.v`) that buffers incoming bytes, decoupling the UART receiver from the NFA engine so bytes are not dropped
- The **NFA engine** (all regex modules running in parallel)
- **Hardware counters**: a 32-bit `byte_count` register tracking total bytes processed, and a 16-bit `match_count` register per regex tracking cumulative matches
- A **TX serializer** state machine that formats results into ASCII packets and transmits them back over UART

The UART transmitter (`uart_tx.v`) is a standard 8-N-1 serial transmitter module.

**How the FIFO Works**: The FIFO uses distributed RAM (a 16-entry register file) with separate read and write pointers. The UART receiver writes incoming bytes at the RX clock rate, and the engine FSM reads them out at its own pace. This is necessary because the NFA engine might be busy serializing a response packet when new bytes arrive. Without the FIFO, those bytes would be lost.

<br>

---

<br>

## The Response Packet Protocol

When the FPGA finishes processing a string (it sees a newline character), it sends back a single ASCII line over UART:

```
MATCH=<N-bit binary> BYTES=<8 hex digits> HITS=<4hex per regex, comma-separated>\r\n
```

For example, with 6 regex patterns where patterns 0 and 2 matched, and 71 total bytes have been processed:

```
MATCH=000101 BYTES=00000047 HITS=0003,0001,0012,0000,0000,0000
```

The `MATCH` field is a bitmask (one bit per regex, LSB = regex 0). `BYTES` is the running total of all characters fed to the engine. `HITS` gives the cumulative match count per regex, each as a 4-digit hex number.

You can also send a `?` character at any time to query the current counters without feeding any data to the NFA engine.

<br>

---

<br>

## The Processor Engine: Dynamic Regex Matching

The static engine is fast but inflexible: every time you change a regex, you need to rerun the C++ compiler and re-synthesize the FPGA bitstream. For situations where patterns change frequently, we built a second approach.

### The Regex CPU

The file `processor/regex_cpu.v` defines a custom 32-bit RISC-style processor with an instruction set designed specifically for NFA simulation. Instead of encoding each regex as a dedicated circuit, this processor runs a program that simulates the NFA using bit-vector operations.

Key architectural features:

- **16 general-purpose 32-bit registers** (R0 through R15), where R0 is hardwired to zero
- **Instruction memory**: 256 entries of 32-bit words, loaded at synthesis time from a hex file or reprogrammed over UART
- **Data memory**: 256 entries of 32-bit words for scratch storage
- **Bit-vector state tracking**: The NFA's active state set is represented as a bit-vector in a register. Transitions update the vector using bitwise OR operations.

The instruction set includes:

| Instruction | What It Does |
|---|---|
| `LUI` | Load upper immediate (sets the top 20 bits of a register) |
| `ORI` | OR immediate (sets the low bits, used with LUI to build 32-bit constants) |
| `AND` | Bitwise AND of two registers |
| `OR` | Bitwise OR of two registers |
| `BEQ` | Branch if equal |
| `BNE` | Branch if not equal |
| `LW` / `SW` | Load/store word from data memory |
| `JAL` | Jump and link (for subroutines) |
| `HALT` | Stop execution |
| `GETC` | Read a character from the UART input buffer |
| `MATCH` | Signal a match result to the output logic |

The processor reads one character at a time with `GETC`, then executes a sequence of instructions that check whether that character triggers any NFA transitions, updating the active state bit-vector accordingly. When it finishes processing a string, it uses `MATCH` to report the result.

### The Python Toolchain

The "assembler" for this CPU is a two-stage Python pipeline:

1. **`compile_regex.py`**: Takes regex patterns from a text file, parses them using Glushkov's algorithm (re-implemented in Python), and generates a custom assembly language file (`.rasm`). Each regex becomes a sequence of instructions that builds character-match masks and state-transition vectors.

2. **`asm.py`**: Takes the `.rasm` assembly file and encodes each instruction into a 32-bit binary word, outputting a `.hex` file (one hex word per line) that the FPGA can load into instruction memory.

3. **`prog_fpga.py`**: A UART programmer that sends the `.hex` file to the FPGA over serial, writing it directly into the CPU's instruction memory. This is what enables runtime regex updates: you edit `regex.txt`, rerun the Python pipeline, and the new program gets beamed to the FPGA in seconds, no Vivado involved.

### The Processor Top-Level

`processor/top_level.v` integrates the regex CPU with a UART transceiver and programming logic. It has two operational modes:

- **Program Mode**: The host sends new instruction memory contents over UART. The top-level logic detects a special "program mode" command and routes incoming bytes into the CPU's instruction memory.
- **Run Mode**: Normal operation. Characters arrive over UART, the CPU processes them against the loaded regex program, and match results are sent back.

The top-level also drives on-board LEDs to show match status and the current mode, which is helpful for debugging on the actual hardware.

<br>

---

<br>

## The Terminal UIs

We wrote three Python TUI scripts using the `rich` library for live terminal rendering:

### engine.py (Static Engine TUI)

This is the main interactive interface. It connects to the FPGA over a serial port and provides:

- A text input where you type strings to match
- A live-updating table showing each regex pattern, whether it matched (color-coded green/red), the cumulative hit count, and the total bytes processed
- Automatic detection of available USB-serial ports
- Command-line arguments for specifying the port and the regex file (so it knows what patterns to label in the table)

The TUI reads the `MATCH=... BYTES=... HITS=...` response packets, parses them, and updates the display. It handles the serial communication in a background thread so the UI stays responsive.

### processor.py (Processor Engine TUI)

Similar to `engine.py` but tailored for the processor-based engine. The protocol is slightly different (the processor sends simpler match/no-match responses), but the basic flow is the same: type a string, see results.

### pii_demo.py (PII Guard Demo)

A specialized TUI for the PII (Personally Identifiable Information) detection use case. It reads lines from a demo input file containing fake personal data and feeds them to the FPGA, showing which PII patterns (SSN, email, credit card, phone number, date of birth, IP address) were detected in each line.

<br>

---

<br>

## The PII Guard Use Case

The `pii/` directory contains a practical application of the engine: detecting sensitive data patterns in text streams. The file `pii/pii_regexes.txt` defines patterns for:

- Social Security Numbers (XXX-XX-XXXX format)
- Email addresses
- Credit card numbers (various formats: Visa, MasterCard, Amex)
- US phone numbers
- Dates of birth
- IP addresses (IPv4)

The idea is that you could deploy this on an FPGA sitting on a network tap, scanning all traffic at wire speed for any of these patterns. If a match is found, the system could flag or redact the data before it leaves the network. The `pii_demo.py` TUI demonstrates this by feeding sample records and highlighting which fields contain PII.

<br>

---

<br>

## Testing and Verification

The project has a multi-layered testing approach:

### Golden Reference Testing

The file `src/golden.cpp` is a standalone C++ program that uses the standard library's `std::regex` to match every test string against every regex pattern. It outputs an "expected matches" file that records which patterns should match which strings. The auto-generated Verilog testbench (`tb_top.v`) uses these expected results to verify that the hardware produces identical results, character by character.

This is a solid validation strategy because `std::regex` is a well-tested implementation. If the hardware output matches the software output for the same inputs, you have reasonable confidence that the Verilog FSMs are correct.

### Parser Tester

`src/parser_tester.cpp` is a diagnostic tool that dumps the AST for each regex pattern. It prints the tree structure so you can manually verify that the parser is interpreting patterns correctly. This was probably most useful during development when debugging the recursive descent parser.

### Vivado Simulation

The Makefile includes a `sim` target that runs the generated testbench through Vivado's simulator (xvlog, xelab, xsim). This lets you verify the design in simulation before burning it onto the FPGA, which is standard practice in hardware development.

<br>

---

<br>

## How It All Fits Together

Here is the end-to-end flow for the static engine:

1. You write regex patterns in `inputs/regexes.txt` (one per line)
2. `make run` compiles and runs the C++ tool, which reads the patterns, runs them through the lexer, parser, and Glushkov NFA builder, then emits a complete set of Verilog files into `output/`
3. `make synth` runs Vivado synthesis on those Verilog files, producing a bitstream
4. `make program` flashes the bitstream onto the Nexys A7
5. You launch `python tui/engine.py`, type a string, and watch the FPGA match it against all your patterns in a single clock cycle per character

For the processor engine, the flow is:

1. You write patterns in `processor/regex.txt`
2. `make proc_asm` runs the Python toolchain to compile them into instruction memory
3. `make proc_synth` and `make proc_program` get the processor onto the FPGA
4. `make proc_update_regex` lets you change patterns and reload them over UART without touching Vivado
5. You launch `python tui/processor.py` and interact the same way

<br>

---

<br>

## Some Thoughts on the Design

Looking back at the project, there are a few design decisions worth noting.

Using Glushkov's construction over Thompson's was the right call for hardware. Thompson's construction produces NFAs with epsilon transitions, which would require extra logic to "skip" states without consuming an input character. Glushkov's epsilon-free NFAs map directly to hardware: every state transition is driven by an actual character match, so there is no need for epsilon-closure circuits. Each state is a flip-flop, and each transition is a combinational gate. Clean and simple.

The one-hot encoding is also well-suited to FPGAs. In software, you would represent the state set as a dense bit-vector and update it with bitwise operations. In hardware, one-hot means each state is independent, and all transition logic evaluates in parallel. The cost is that you use one flip-flop per state (so an NFA with 20 states uses 21 flip-flops), but flip-flops are abundant on modern FPGAs, and the parallelism you get in return is worth it.

The dual-mode architecture (static engine plus soft-processor) is a nice tradeoff. The static engine gives you maximum performance (pure combinational matching, one cycle per character, all patterns in parallel) but requires re-synthesis for any pattern change. The processor trades some performance for flexibility. In a real deployment, you might use the static engine for well-known, stable patterns (like protocol headers) and the processor for patterns that change frequently (like ad-hoc search filters).

The FIFO between the UART receiver and the NFA engine is a small but important detail. Without it, if the engine is busy serializing a response packet back to the host while new characters arrive on the serial port, those characters would be silently dropped. The 16-byte buffer gives the engine enough headroom to finish its transmission before the next batch of input overflows.

<br>

---

<br>

## Build and Dependencies

The project requires:

- **g++** with C++17 support (for the regex compiler)
- **Xilinx Vivado** (for Verilog simulation, synthesis, and FPGA programming)
- **Python 3** with `pyserial` and `rich` (for the TUI applications)
- A **Nexys A7 FPGA board** connected over USB (for actual hardware deployment)

The Makefile handles cross-platform path differences between Windows and Unix, so it should work on both. All the Vivado-specific targets call Vivado in batch mode through TCL scripts in the `scripts/` directory.

<br>

---

<br>

This project was a significant learning experience for the whole team. Going from a regex string all the way down to flip-flops on an FPGA, through a custom compiler pipeline, taught us a lot about the boundary between software abstractions and hardware reality. The fact that a regular expression, which most people think of as a software concept, maps so naturally onto digital logic is something that still feels a bit wild to all of us.

