import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { runInSandbox } from '../src/sandbox/runner.js';
import { workerLifecycle } from '../src/recovery/shutdown.js';
import { Verdict } from '@judge/shared';

const execFileAsync = promisify(execFile);

describe(
  'Phase 6 — Real Docker Container Integration Tests (All 7 Languages)',
  { retry: 1 },
  () => {
    afterEach(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    afterAll(async () => {
      await workerLifecycle.cleanupActiveContainers();
    }, 30000);

    // =========================================================================
    // 1. JavaScript (node:20-alpine)
    // =========================================================================
    describe('1. JavaScript (node:20-alpine in live Docker)', () => {
      it('executes successful stdin/stdout and custom input in real container', async () => {
        const res = await runInSandbox({
          language: 'javascript',
          code: `
          const fs = require('fs');
          const input = fs.readFileSync(0, 'utf8').trim();
          console.log("HELLO:" + input);
        `,
          input: 'custom_input_42\nsecond_line',
          timeLimitMs: 3000,
          memoryLimitMb: 128,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('HELLO:custom_input_42\nsecond_line');
        expect(res.executionTimeMs).toBeGreaterThan(0);
        expect(res.memoryUsedKb).toBeGreaterThan(0);
      });

      it('captures runtime error (RE) in real container', async () => {
        const res = await runInSandbox({
          language: 'javascript',
          code: `
          const x = null;
          x.doSomethingNonExistent();
        `,
          input: '',
          timeLimitMs: 3000,
          memoryLimitMb: 128,
        });

        expect(res.verdict).toBe(Verdict.RUNTIME_ERROR);
        expect(res.stderr).toContain('TypeError');
      });

      it('enforces timeout (TLE) in real container', async () => {
        const res = await runInSandbox({
          language: 'javascript',
          code: 'while (true) {}',
          input: '',
          timeLimitMs: 600,
          memoryLimitMb: 128,
        });

        expect(res.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
        expect(res.executionTimeMs).toBeGreaterThanOrEqual(550);
      });
    });

    // =========================================================================
    // 2. Python (python:3.11-alpine)
    // =========================================================================
    describe('2. Python (python:3.11-alpine in live Docker)', () => {
      it('executes successful stdin/stdout and custom input in real container', async () => {
        const res = await runInSandbox({
          language: 'python',
          code: `
import sys
data = sys.stdin.read().strip()
print(f"PY_OK:{data}")
`,
          input: 'multi\nline\ncustom\ninput',
          timeLimitMs: 3000,
          memoryLimitMb: 128,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('PY_OK:multi\nline\ncustom\ninput');
        expect(res.executionTimeMs).toBeGreaterThan(0);
        expect(res.memoryUsedKb).toBeGreaterThan(0);
      });

      it('captures syntax / compilation error in real container', async () => {
        const res = await runInSandbox({
          language: 'python',
          code: 'def syntax error here:',
          input: '',
          timeLimitMs: 3000,
          memoryLimitMb: 128,
        });

        expect(res.verdict).toBe(Verdict.COMPILATION_ERROR);
        expect(res.stderr).toContain('SyntaxError');
      });

      it('captures runtime error (ZeroDivisionError) in real container', async () => {
        const res = await runInSandbox({
          language: 'python',
          code: 'print(1 / 0)',
          input: '',
          timeLimitMs: 5000,
          memoryLimitMb: 128,
        });

        expect(res.verdict).toBe(Verdict.RUNTIME_ERROR);
        expect(res.stderr).toContain('ZeroDivisionError');
      }, 15000);

      it('enforces timeout (TLE) in real container', async () => {
        const res = await runInSandbox({
          language: 'python',
          code: 'while True: pass',
          input: '',
          timeLimitMs: 600,
          memoryLimitMb: 128,
        });

        expect(res.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
        expect(res.executionTimeMs).toBeGreaterThanOrEqual(550);
      });
    });

    // =========================================================================
    // 3. C (GCC 13 — gcc:13-alpine)
    // =========================================================================
    describe('3. C (gcc:13-alpine in live Docker)', () => {
      it('executes basic program reading stdin and printing sum (AC)', async () => {
        const res = await runInSandbox({
          language: 'c',
          code: `
#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}
`,
          input: '17 25',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('42');
        expect(res.exitCode).toBe(0);
        expect(res.memoryUsedKb).toBeGreaterThan(0);
      }, 15000);

      it('handles multiple lines of input in C', async () => {
        const res = await runInSandbox({
          language: 'c',
          code: `
#include <stdio.h>
#include <string.h>
int main() {
    char l1[64], l2[64];
    if (fgets(l1, sizeof(l1), stdin) && fgets(l2, sizeof(l2), stdin)) {
        l1[strcspn(l1, "\\r\\n")] = 0;
        l2[strcspn(l2, "\\r\\n")] = 0;
        printf("%s::%s\\n", l1, l2);
    }
    return 0;
}
`,
          input: 'first_line\nsecond_line',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('first_line::second_line');
      }, 15000);

      it('distinguishes incorrect output (WA behavior)', async () => {
        const res = await runInSandbox({
          language: 'c',
          code: `
#include <stdio.h>
int main() {
    printf("wrong_answer\\n");
    return 0;
}
`,
          input: '42',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).not.toBe('42');
      }, 15000);

      it('captures compilation error (CE) without mistaking it for RE', async () => {
        const res = await runInSandbox({
          language: 'c',
          code: `
#include <stdio.h>
int main() {
    this_is_an_invalid_c_syntax_error_token !!
    return 0;
}
`,
          input: '',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        expect(res.verdict).toBe(Verdict.COMPILATION_ERROR);
        expect(res.exitCode).toBe(65);
        expect(res.stderr.toLowerCase()).toContain('error:');
      }, 15000);

      it('captures runtime error (RE) from abort() / segfault', async () => {
        const res = await runInSandbox({
          language: 'c',
          code: `
#include <stdlib.h>
int main() {
    abort();
    return 0;
}
`,
          input: '',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        expect(res.verdict).toBe(Verdict.RUNTIME_ERROR);
        expect(res.exitCode).not.toBe(0);
      }, 15000);

      it('enforces execution timeout (TLE) for infinite loops', async () => {
        const res = await runInSandbox({
          language: 'c',
          code: `
int main() {
    volatile int x = 0;
    while (1) { x++; }
    return 0;
}
`,
          input: '',
          timeLimitMs: 1000,
          memoryLimitMb: 256,
        });

        expect(res.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
        expect(res.stderr).toContain('Time Limit Exceeded');
      }, 15000);
    });

    // =========================================================================
    // 4. C++ (G++ 13 — gcc:13-alpine)
    // =========================================================================
    describe('4. C++ (gcc:13-alpine in live Docker)', () => {
      it('executes basic program reading cin and printing cout (AC)', async () => {
        const res = await runInSandbox({
          language: 'cpp',
          code: `
#include <iostream>
int main() {
    int a, b;
    if (std::cin >> a >> b) {
        std::cout << (a + b) << std::endl;
    }
    return 0;
}
`,
          input: '18 24',
          timeLimitMs: 12000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('42');
        expect(res.memoryUsedKb).toBeGreaterThan(0);
      }, 20000);

      it('handles multiple lines with std::getline in C++', async () => {
        const res = await runInSandbox({
          language: 'cpp',
          code: `
#include <iostream>
#include <string>
int main() {
    std::string line1, line2;
    if (std::getline(std::cin, line1) && std::getline(std::cin, line2)) {
        std::cout << line1 << " -> " << line2 << std::endl;
    }
    return 0;
}
`,
          input: 'alpha\nbeta',
          timeLimitMs: 12000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('alpha -> beta');
      }, 20000);

      it('captures C++ compilation error (CE) gracefully', async () => {
        const res = await runInSandbox({
          language: 'cpp',
          code: `
#include <iostream>
int main() {
    std::cout << undeclared_cpp_symbol << std::endl;
    return 0;
}
`,
          input: '',
          timeLimitMs: 12000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.COMPILATION_ERROR);
        expect(res.exitCode).toBe(65);
        expect(res.stderr.toLowerCase()).toContain('error:');
      }, 20000);

      it('captures C++ runtime exception as RUNTIME_ERROR', async () => {
        const res = await runInSandbox({
          language: 'cpp',
          code: `
#include <stdexcept>
int main() {
    throw std::runtime_error("Simulated unhandled exception");
    return 0;
}
`,
          input: '',
          timeLimitMs: 12000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.RUNTIME_ERROR);
        expect(res.stderr).toContain('std::runtime_error');
      }, 15000);

      it('enforces timeout (TLE) for C++ infinite loops', async () => {
        const res = await runInSandbox({
          language: 'cpp',
          code: `
int main() {
    volatile int counter = 0;
    while (true) { counter++; }
    return 0;
}
`,
          input: '',
          timeLimitMs: 1200,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
      }, 15000);
    });

    // =========================================================================
    // 5. Java (OpenJDK 21 — eclipse-temurin:21-alpine)
    // =========================================================================
    describe('5. Java (eclipse-temurin:21-alpine in live Docker)', () => {
      it('executes basic program with Scanner and System.out.println (AC)', async () => {
        const res = await runInSandbox({
          language: 'java',
          code: `
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int a = sc.nextInt();
            int b = sc.nextInt();
            System.out.println(a + b);
        }
    }
}
`,
          input: '19 23',
          timeLimitMs: 15000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('42');
        expect(res.memoryUsedKb).toBeGreaterThan(0);
      }, 25000);

      it('handles multiple lines and detects custom class name (Solution.java)', async () => {
        const res = await runInSandbox({
          language: 'java',
          code: `
import java.util.Scanner;
public class CustomSolution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String l1 = sc.nextLine();
        String l2 = sc.nextLine();
        System.out.println(l1 + "::" + l2);
    }
}
`,
          input: 'java_line_one\njava_line_two',
          timeLimitMs: 15000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('java_line_one::java_line_two');
      }, 25000);

      it('captures Java compilation error (CE) without classifying as RE', async () => {
        const res = await runInSandbox({
          language: 'java',
          code: `
public class Main {
    public static void main(String[] args) {
        int x = "incompatible types error";
    }
}
`,
          input: '',
          timeLimitMs: 15000,
          memoryLimitMb: 768,
        });

        expect(res.verdict).toBe(Verdict.COMPILATION_ERROR);
        expect(res.exitCode).toBe(65);
        expect(res.stderr).toContain('error:');
      }, 25000);

      it('captures Java NullPointerException as RUNTIME_ERROR', async () => {
        const res = await runInSandbox({
          language: 'java',
          code: `
public class Main {
    public static void main(String[] args) {
        String s = null;
        System.out.println(s.length());
    }
}
`,
          input: '',
          timeLimitMs: 15000,
          memoryLimitMb: 768,
        });

        expect(res.verdict).toBe(Verdict.RUNTIME_ERROR);
        expect(res.stderr).toContain('NullPointerException');
      }, 25000);

      it('enforces timeout (TLE) for Java infinite loop', async () => {
        const res = await runInSandbox({
          language: 'java',
          code: `
public class Main {
    public static void main(String[] args) {
        while (true) {}
    }
}
`,
          input: '',
          timeLimitMs: 1500,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
      }, 25000);
    });

    // =========================================================================
    // 6. Go (1.22 — golang:1.22-alpine)
    // =========================================================================
    describe('6. Go (golang:1.22-alpine in live Docker)', () => {
      it('executes basic program reading fmt.Scan and printing sum (AC)', async () => {
        const res = await runInSandbox({
          language: 'go',
          code: `
package main
import "fmt"
func main() {
    var a, b int
    fmt.Scan(&a, &b)
    fmt.Println(a + b)
}
`,
          input: '14 28',
          timeLimitMs: 25000,
          memoryLimitMb: 768,
          cpus: '1.5',
          pidsLimit: 128,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('42');
        expect(res.memoryUsedKb).toBeGreaterThan(0);
      }, 35000);

      it('handles multiple lines of input in Go', async () => {
        const res = await runInSandbox({
          language: 'go',
          code: `
package main
import "fmt"
func main() {
    var l1, l2 string
    if _, err := fmt.Scan(&l1, &l2); err == nil {
        fmt.Printf("%s::%s\\n", l1, l2);
    }
}
`,
          input: 'go_line_alpha\ngo_line_beta',
          timeLimitMs: 25000,
          memoryLimitMb: 768,
          cpus: '1.5',
          pidsLimit: 128,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('go_line_alpha::go_line_beta');
      }, 35000);

      it('captures Go compilation error (CE) without classifying as RE', async () => {
        const res = await runInSandbox({
          language: 'go',
          code: `
package main
func main() {
    syntax error token here !!!
}
`,
          input: '',
          timeLimitMs: 15000,
          memoryLimitMb: 768,
          cpus: '1.5',
          pidsLimit: 128,
        });

        expect(res.verdict).toBe(Verdict.COMPILATION_ERROR);
        expect(res.exitCode).toBe(65);
        expect(res.stderr).toContain('syntax error');
      }, 30000);

      it('captures Go panic as RUNTIME_ERROR', async () => {
        const res = await runInSandbox({
          language: 'go',
          code: `
package main
func main() {
    panic("intentional go runtime panic")
}
`,
          input: '',
          timeLimitMs: 25000,
          memoryLimitMb: 768,
          cpus: '1.5',
          pidsLimit: 128,
        });

        expect(res.verdict).toBe(Verdict.RUNTIME_ERROR);
        expect(res.stderr).toContain('panic: intentional go runtime panic');
      }, 35000);

      it('enforces timeout (TLE) for Go infinite loop', async () => {
        const res = await runInSandbox({
          language: 'go',
          code: `
package main
func main() {
    for {}
}
`,
          input: '',
          timeLimitMs: 15000,
          memoryLimitMb: 768,
          cpus: '1.5',
          pidsLimit: 128,
        });

        expect(res.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
      }, 40000);
    });

    // =========================================================================
    // 7. Rust (1.77 — rust:1.77-alpine)
    // =========================================================================
    describe('7. Rust (rust:1.77-alpine in live Docker)', () => {
      it('executes basic program reading stdin and printing sum (AC)', async () => {
        const res = await runInSandbox({
          language: 'rust',
          code: `
use std::io::{self, Read};
fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let nums: Vec<i32> = input.split_whitespace().filter_map(|s| s.parse().ok()).collect();
    if nums.len() >= 2 {
        println!("{}", nums[0] + nums[1]);
    }
}
`,
          input: '11 31',
          timeLimitMs: 15000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('42');
        expect(res.memoryUsedKb).toBeGreaterThan(0);
      }, 25000);

      it('handles multiple lines in Rust', async () => {
        const res = await runInSandbox({
          language: 'rust',
          code: `
use std::io::{self, BufRead};
fn main() {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    let l1 = lines.next().unwrap().unwrap();
    let l2 = lines.next().unwrap().unwrap();
    println!("{}::{}", l1, l2);
}
`,
          input: 'rust_alpha\nrust_beta',
          timeLimitMs: 15000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('rust_alpha::rust_beta');
      }, 25000);

      it('captures Rust compilation error (CE) without classifying as RE', async () => {
        const res = await runInSandbox({
          language: 'rust',
          code: `
fn main() {
    let x: i32 = "invalid type assignment";
}
`,
          input: '',
          timeLimitMs: 15000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.COMPILATION_ERROR);
        expect(res.exitCode).toBe(65);
        expect(res.stderr).toContain('mismatched types');
      }, 25000);

      it('captures Rust panic as RUNTIME_ERROR', async () => {
        const res = await runInSandbox({
          language: 'rust',
          code: `
fn main() {
    panic!("intentional rust runtime panic");
}
`,
          input: '',
          timeLimitMs: 15000,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.RUNTIME_ERROR);
        expect(res.stderr).toContain('panicked at');
      }, 25000);

      it('enforces timeout (TLE) for Rust infinite loop', async () => {
        const res = await runInSandbox({
          language: 'rust',
          code: `
fn main() {
    loop {}
}
`,
          input: '',
          timeLimitMs: 1500,
          memoryLimitMb: 512,
        });

        expect(res.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
      }, 20000);
    });

    // =========================================================================
    // 8. Sandbox Security & Container Isolation
    // =========================================================================
    describe('8. Sandbox Security & Container Lifecycle in Live Docker', () => {
      it('verifies non-root UID 1000 execution in C container', async () => {
        const res = await runInSandbox({
          language: 'c',
          code: `
#include <stdio.h>
#include <unistd.h>
int main() {
    printf("UID:%d GID:%d\\n", getuid(), getgid());
    return 0;
}
`,
          input: '',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('UID:1000 GID:1000');
      }, 15000);

      it('verifies read-only root filesystem prevents writing outside sandbox', async () => {
        const res = await runInSandbox({
          language: 'c',
          code: `
#include <stdio.h>
int main() {
    FILE *f = fopen("/etc/forbidden_file", "w");
    if (f == NULL) {
        printf("WRITE_BLOCKED\\n");
    } else {
        fclose(f);
        printf("SECURITY_BREACH\\n");
    }
    return 0;
}
`,
          input: '',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('WRITE_BLOCKED');
      }, 15000);

      it('verifies no host environment variables or secrets leaked to container', async () => {
        const res = await runInSandbox({
          language: 'c',
          code: `
#include <stdio.h>
#include <stdlib.h>
int main() {
    char *db = getenv("DATABASE_URL");
    char *jwt = getenv("JWT_SECRET");
    char *cookie = getenv("COOKIE_SECRET");
    if (!db && !jwt && !cookie) {
        printf("ENV_ISOLATED\\n");
    } else {
        printf("ENV_LEAKED\\n");
    }
    return 0;
}
`,
          input: '',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        expect(res.verdict).toBe(Verdict.ACCEPTED);
        expect(res.stdout.trim()).toBe('ENV_ISOLATED');
      }, 15000);

      it('verifies all execution containers are removed after execution (no container leak)', async () => {
        // Execute a quick program
        await runInSandbox({
          language: 'c',
          code: '#include <stdio.h>\nint main() { printf("CLEANUP_CHECK\\n"); return 0; }',
          input: '',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        // Query docker daemon for any running sandbox containers
        const { stdout } = await execFileAsync('docker', [
          'ps',
          '-q',
          '--filter',
          'name=judge-sandbox-',
        ]);

        expect(stdout.trim()).toBe('');
      }, 15000);
    });
  }
);
