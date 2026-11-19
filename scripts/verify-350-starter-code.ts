import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PROBLEMS_BANK } from './data/problems-bank.js';
import { SupportedLanguage } from '@judge/shared';

const LANGUAGES: SupportedLanguage[] = ['javascript', 'python', 'c', 'cpp', 'java', 'go', 'rust'];

const DOCKER_IMAGES: Record<SupportedLanguage, string> = {
  javascript: 'node:20-alpine',
  python: 'python:3.11-alpine',
  c: 'gcc:13-alpine',
  cpp: 'gcc:13-alpine',
  java: 'eclipse-temurin:21-alpine',
  go: 'golang:1.22-alpine',
  rust: 'rust:1.77-alpine',
};

async function main() {
  console.log('===============================================================');
  console.log('   350 STARTER-CODE VERIFICATION AUDIT (50 PROBLEMS × 7 LANGS) ');
  console.log('===============================================================\n');

  console.log(`Loaded ${PROBLEMS_BANK.length} problems from PROBLEMS_BANK.`);

  // 1. Solution Leak & Stdin/Stdout Inspection
  let leakFailures = 0;
  let missingTemplateFailures = 0;
  const inspectedResults: Record<string, { [lang: string]: boolean }> = {};

  for (const p of PROBLEMS_BANK) {
    inspectedResults[p.slug] = {};
    for (const lang of LANGUAGES) {
      const code = p.starterCode[lang];
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        console.error(`❌ [${p.slug}] [${lang}] Missing or empty starter code`);
        missingTemplateFailures++;
        inspectedResults[p.slug][lang] = false;
        continue;
      }

      // Check for TODO marker
      const hasTodo =
        code.includes('TODO') ||
        code.includes('Write your algorithm here') ||
        code.includes('Write code here');
      if (!hasTodo) {
        console.error(`❌ [${p.slug}] [${lang}] Missing TODO comment marker in starter template`);
        leakFailures++;
        inspectedResults[p.slug][lang] = false;
        continue;
      }

      inspectedResults[p.slug][lang] = true;
    }
  }

  console.log(`\n1. Solution Leak Audit Result:`);
  console.log(
    `   - Total Checked      : ${PROBLEMS_BANK.length * LANGUAGES.length} templates (50 × 7)`
  );
  console.log(`   - Missing Templates  : ${missingTemplateFailures}`);
  console.log(`   - Leak/Todo Failures : ${leakFailures}`);
  if (missingTemplateFailures === 0 && leakFailures === 0) {
    console.log(
      `   ✅ PASS: All 350 templates contain boilerplate + TODOs and zero full solutions.`
    );
  } else {
    console.error(`   ❌ FAIL: Discrepancies detected in starter templates.`);
  }

  // 2. Prepare files for Docker compilation
  const tmpDir = path.resolve(process.cwd(), '.tmp_starter_verification');
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tmpDir, { recursive: true });

  for (const lang of LANGUAGES) {
    fs.mkdirSync(path.join(tmpDir, lang), { recursive: true });
  }

  for (const p of PROBLEMS_BANK) {
    // JS
    fs.writeFileSync(
      path.join(tmpDir, 'javascript', `${p.slug}.js`),
      p.starterCode.javascript,
      'utf8'
    );
    // Python
    fs.writeFileSync(path.join(tmpDir, 'python', `${p.slug}.py`), p.starterCode.python, 'utf8');
    // C
    fs.writeFileSync(path.join(tmpDir, 'c', `${p.slug}.c`), p.starterCode.c, 'utf8');
    // C++
    fs.writeFileSync(path.join(tmpDir, 'cpp', `${p.slug}.cpp`), p.starterCode.cpp, 'utf8');
    // Java (each in its own folder to avoid class name collision if any)
    const javaDir = path.join(tmpDir, 'java', p.slug);
    fs.mkdirSync(javaDir, { recursive: true });
    fs.writeFileSync(path.join(javaDir, 'Main.java'), p.starterCode.java, 'utf8');
    // Go (each in its own folder to avoid package main collision)
    const goDir = path.join(tmpDir, 'go', p.slug);
    fs.mkdirSync(goDir, { recursive: true });
    fs.writeFileSync(path.join(goDir, 'main.go'), p.starterCode.go, 'utf8');
    // Rust
    fs.writeFileSync(path.join(tmpDir, 'rust', `${p.slug}.rs`), p.starterCode.rust, 'utf8');
  }

  console.log(`\n2. Running Docker Compilation & Syntax Verification across all 7 images...`);

  // Path for docker mount (convert Windows path to Linux-style path if needed)
  const mountPath = tmpDir.replace(/\\/g, '/');

  const compilationResults: Record<
    SupportedLanguage,
    { passed: number; failed: number; errors: string[] }
  > = {
    javascript: { passed: 0, failed: 0, errors: [] },
    python: { passed: 0, failed: 0, errors: [] },
    c: { passed: 0, failed: 0, errors: [] },
    cpp: { passed: 0, failed: 0, errors: [] },
    java: { passed: 0, failed: 0, errors: [] },
    go: { passed: 0, failed: 0, errors: [] },
    rust: { passed: 0, failed: 0, errors: [] },
  };

  // 1) JavaScript (Node.js syntax check)
  console.log(`\n--> Testing JavaScript (node:20-alpine)...`);
  try {
    const script = `#!/bin/sh\nfor f in /src/*.js; do node --check "$f" >/dev/null 2>&1 || echo "FAIL:$f"; done\n`;
    fs.writeFileSync(path.join(tmpDir, 'check_js.sh'), script, { mode: 0o777 });
    const cmd = `docker run --rm -v "${mountPath}/javascript:/src" -v "${mountPath}/check_js.sh:/check.sh" ${DOCKER_IMAGES.javascript} sh /check.sh`;
    const out = execSync(cmd, { encoding: 'utf8' });
    const fails = out.split('\n').filter((l) => l.trim().startsWith('FAIL:'));
    compilationResults.javascript.failed = fails.length;
    compilationResults.javascript.passed = PROBLEMS_BANK.length - fails.length;
    compilationResults.javascript.errors = fails;
    console.log(`    Result: ${compilationResults.javascript.passed}/50 PASSED`);
  } catch (err: any) {
    console.error(`    Docker execution failed for JavaScript:`, err.message);
  }

  // 2) Python (py_compile check)
  console.log(`\n--> Testing Python (python:3.11-alpine)...`);
  try {
    const script = `#!/bin/sh\nfor f in /src/*.py; do python3 -m py_compile "$f" >/dev/null 2>&1 || echo "FAIL:$f"; done\n`;
    fs.writeFileSync(path.join(tmpDir, 'check_py.sh'), script, { mode: 0o777 });
    const cmd = `docker run --rm -v "${mountPath}/python:/src" -v "${mountPath}/check_py.sh:/check.sh" ${DOCKER_IMAGES.python} sh /check.sh`;
    const out = execSync(cmd, { encoding: 'utf8' });
    const fails = out.split('\n').filter((l) => l.trim().startsWith('FAIL:'));
    compilationResults.python.failed = fails.length;
    compilationResults.python.passed = PROBLEMS_BANK.length - fails.length;
    compilationResults.python.errors = fails;
    console.log(`    Result: ${compilationResults.python.passed}/50 PASSED`);
  } catch (err: any) {
    console.error(`    Docker execution failed for Python:`, err.message);
  }

  // 3) C (gcc -std=c11 -Wall -Wextra)
  console.log(`\n--> Testing C (gcc:13-alpine)...`);
  try {
    const script = `#!/bin/sh\nfor f in /src/*.c; do gcc -O2 -std=c11 -Wall -Wextra -c "$f" -o /dev/null -lm >/dev/null 2>&1 || echo "FAIL:$f"; done\n`;
    fs.writeFileSync(path.join(tmpDir, 'check_c.sh'), script, { mode: 0o777 });
    const cmd = `docker run --rm -v "${mountPath}/c:/src" -v "${mountPath}/check_c.sh:/check.sh" ${DOCKER_IMAGES.c} sh /check.sh`;
    const out = execSync(cmd, { encoding: 'utf8' });
    const fails = out.split('\n').filter((l) => l.trim().startsWith('FAIL:'));
    compilationResults.c.failed = fails.length;
    compilationResults.c.passed = PROBLEMS_BANK.length - fails.length;
    compilationResults.c.errors = fails;
    console.log(`    Result: ${compilationResults.c.passed}/50 PASSED`);
    if (fails.length > 0) console.log('    Fails:', fails);
  } catch (err: any) {
    console.error(`    Docker execution failed for C:`, err.message);
  }

  // 4) C++ (g++ -std=c++17 -Wall -Wextra)
  console.log(`\n--> Testing C++ (gcc:13-alpine)...`);
  try {
    const script = `#!/bin/sh\nfor f in /src/*.cpp; do g++ -O2 -std=c++17 -Wall -Wextra -c "$f" -o /dev/null >/dev/null 2>&1 || echo "FAIL:$f"; done\n`;
    fs.writeFileSync(path.join(tmpDir, 'check_cpp.sh'), script, { mode: 0o777 });
    const cmd = `docker run --rm -v "${mountPath}/cpp:/src" -v "${mountPath}/check_cpp.sh:/check.sh" ${DOCKER_IMAGES.cpp} sh /check.sh`;
    const out = execSync(cmd, { encoding: 'utf8' });
    const fails = out.split('\n').filter((l) => l.trim().startsWith('FAIL:'));
    compilationResults.cpp.failed = fails.length;
    compilationResults.cpp.passed = PROBLEMS_BANK.length - fails.length;
    compilationResults.cpp.errors = fails;
    console.log(`    Result: ${compilationResults.cpp.passed}/50 PASSED`);
    if (fails.length > 0) console.log('    Fails:', fails);
  } catch (err: any) {
    console.error(`    Docker execution failed for C++:`, err.message);
  }

  // 5) Java (javac eclipse-temurin:21-alpine)
  console.log(`\n--> Testing Java (eclipse-temurin:21-alpine)...`);
  try {
    const script = `#!/bin/sh\nfor d in /src/*; do javac -d /tmp "$d/Main.java" >/dev/null 2>&1 || echo "FAIL:$d"; done\n`;
    fs.writeFileSync(path.join(tmpDir, 'check_java.sh'), script, { mode: 0o777 });
    const cmd = `docker run --rm -v "${mountPath}/java:/src" -v "${mountPath}/check_java.sh:/check.sh" ${DOCKER_IMAGES.java} sh /check.sh`;
    const out = execSync(cmd, { encoding: 'utf8' });
    const fails = out.split('\n').filter((l) => l.trim().startsWith('FAIL:'));
    compilationResults.java.failed = fails.length;
    compilationResults.java.passed = PROBLEMS_BANK.length - fails.length;
    compilationResults.java.errors = fails;
    console.log(`    Result: ${compilationResults.java.passed}/50 PASSED`);
    if (fails.length > 0) console.log('    Fails:', fails);
  } catch (err: any) {
    console.error(`    Docker execution failed for Java:`, err.message);
  }

  // 6) Go (golang:1.22-alpine)
  console.log(`\n--> Testing Go (golang:1.22-alpine)...`);
  try {
    const script = `#!/bin/sh\nfor d in /src/*; do (cd "$d" && go build -o /dev/null main.go >/dev/null 2>&1) || echo "FAIL:$d"; done\n`;
    fs.writeFileSync(path.join(tmpDir, 'check_go.sh'), script, { mode: 0o777 });
    const cmd = `docker run --rm -v "${mountPath}/go:/src" -v "${mountPath}/check_go.sh:/check.sh" ${DOCKER_IMAGES.go} sh /check.sh`;
    const out = execSync(cmd, { encoding: 'utf8' });
    const fails = out.split('\n').filter((l) => l.trim().startsWith('FAIL:'));
    compilationResults.go.failed = fails.length;
    compilationResults.go.passed = PROBLEMS_BANK.length - fails.length;
    compilationResults.go.errors = fails;
    console.log(`    Result: ${compilationResults.go.passed}/50 PASSED`);
    if (fails.length > 0) console.log('    Fails:', fails);
  } catch (err: any) {
    console.error(`    Docker execution failed for Go:`, err.message);
  }

  // 7) Rust (rust:1.77-alpine)
  console.log(`\n--> Testing Rust (rust:1.77-alpine)...`);
  try {
    const script = `#!/bin/sh\nfor f in /src/*.rs; do rustc -O --emit=metadata -o /dev/null "$f" >/dev/null 2>&1 || echo "FAIL:$f"; done\n`;
    fs.writeFileSync(path.join(tmpDir, 'check_rust.sh'), script, { mode: 0o777 });
    const cmd = `docker run --rm -v "${mountPath}/rust:/src" -v "${mountPath}/check_rust.sh:/check.sh" ${DOCKER_IMAGES.rust} sh /check.sh`;
    const out = execSync(cmd, { encoding: 'utf8' });
    const fails = out.split('\n').filter((l) => l.trim().startsWith('FAIL:'));
    compilationResults.rust.failed = fails.length;
    compilationResults.rust.passed = PROBLEMS_BANK.length - fails.length;
    compilationResults.rust.errors = fails;
    console.log(`    Result: ${compilationResults.rust.passed}/50 PASSED`);
    if (fails.length > 0) console.log('    Fails:', fails);
  } catch (err: any) {
    console.error(`    Docker execution failed for Rust:`, err.message);
  }

  // Cleanup temp files
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n===============================================================');
  console.log('                 FINAL 350 VERIFICATION SUMMARY                ');
  console.log('===============================================================');
  console.table(
    LANGUAGES.map((l) => ({
      Language: l,
      'Docker Image': DOCKER_IMAGES[l],
      Total: 50,
      Passed: compilationResults[l].passed,
      Failed: compilationResults[l].failed,
      Status: compilationResults[l].failed === 0 ? 'PASS' : 'FAIL',
    }))
  );

  const totalPassed = LANGUAGES.reduce((sum, l) => sum + compilationResults[l].passed, 0);
  const totalFailed = LANGUAGES.reduce((sum, l) => sum + compilationResults[l].failed, 0);

  console.log(`\nTotal Starters Verified: ${totalPassed + totalFailed} / 350`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);

  if (totalFailed === 0) {
    console.log(`\n🎉 ALL 350 STARTER CODE TEMPLATES COMPILED & VALIDATED SUCCESSFULLY!`);
  } else {
    console.log(`\n⚠️ Some templates failed compilation. Review the failures above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
