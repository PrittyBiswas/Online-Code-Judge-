import type { SupportedLanguage } from '../types/index.js';

export interface LanguageConfig {
  id: SupportedLanguage;
  name: string;
  version: string;
  monacoLanguage: string;
  extension: string;
  sourceFileName: string;
  defaultImage: string;
  isCompiled: boolean;
  starterCode: string;
  compileCommand?: string;
  runCommand?: string;
  timeLimitMultiplier?: number;
  memoryLimitAdditionMb?: number;
}

export const LANGUAGE_CONFIGS: Record<SupportedLanguage, LanguageConfig> = {
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    version: 'Node.js 20',
    monacoLanguage: 'javascript',
    extension: '.js',
    sourceFileName: 'solution.js',
    defaultImage: 'node:20-alpine',
    isCompiled: false,
    starterCode: `const fs = require('fs');

function solve() {
  const input = fs.readFileSync(0, 'utf8').trim();
  if (!input) return;
  // Write your solution here and print output with console.log
  console.log(input);
}

solve();
`,
  },
  python: {
    id: 'python',
    name: 'Python',
    version: 'Python 3.11',
    monacoLanguage: 'python',
    extension: '.py',
    sourceFileName: 'solution.py',
    defaultImage: 'python:3.11-alpine',
    isCompiled: false,
    starterCode: `import sys

def solve():
    data = sys.stdin.read().strip()
    if not data:
        return
    # Write your solution here and print output with print()
    print(data)

if __name__ == '__main__':
    solve()
`,
  },
  c: {
    id: 'c',
    name: 'C',
    version: 'GCC 13',
    monacoLanguage: 'c',
    extension: '.c',
    sourceFileName: 'main.c',
    defaultImage: 'gcc:13-alpine',
    isCompiled: true,
    compileCommand: 'gcc -O2 -std=c11 -Wall -Wextra -static -o /sandbox/prog /sandbox/main.c -lm',
    runCommand: '/sandbox/prog',
    starterCode: `#include <stdio.h>

int main() {
    char buffer[1024];
    while (fgets(buffer, sizeof(buffer), stdin) != NULL) {
        // Write your solution here
        printf("%s", buffer);
    }
    return 0;
}
`,
  },
  cpp: {
    id: 'cpp',
    name: 'C++',
    version: 'G++ 13',
    monacoLanguage: 'cpp',
    extension: '.cpp',
    sourceFileName: 'main.cpp',
    defaultImage: 'gcc:13-alpine',
    isCompiled: true,
    compileCommand: 'g++ -O2 -std=c++17 -Wall -Wextra -static -o /sandbox/prog /sandbox/main.cpp',
    runCommand: '/sandbox/prog',
    starterCode: `#include <iostream>
#include <string>

using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    string line;
    while (getline(cin, line)) {
        // Write your solution here
        cout << line << "\\n";
    }

    return 0;
}
`,
  },
  java: {
    id: 'java',
    name: 'Java',
    version: 'OpenJDK 21',
    monacoLanguage: 'java',
    extension: '.java',
    sourceFileName: 'Main.java',
    defaultImage: 'eclipse-temurin:21-alpine',
    isCompiled: true,
    compileCommand: 'javac -d /sandbox /sandbox/Main.java',
    runCommand: 'java -Xms16m -XX:+UseSerialGC -cp /sandbox Main',
    memoryLimitAdditionMb: 32,
    starterCode: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        while (scanner.hasNextLine()) {
            String line = scanner.nextLine();
            // Write your solution here
            System.out.println(line);
        }
        scanner.close();
    }
}
`,
  },
  go: {
    id: 'go',
    name: 'Go',
    version: 'Go 1.22',
    monacoLanguage: 'go',
    extension: '.go',
    sourceFileName: 'main.go',
    defaultImage: 'golang:1.22-alpine',
    isCompiled: true,
    compileCommand: 'go build -o /sandbox/prog /sandbox/main.go',
    runCommand: '/sandbox/prog',
    starterCode: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		// Write your solution here
		fmt.Println(scanner.Text())
	}
}
`,
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    version: 'Rust 1.77',
    monacoLanguage: 'rust',
    extension: '.rs',
    sourceFileName: 'main.rs',
    defaultImage: 'rust:1.77-alpine',
    isCompiled: true,
    compileCommand: 'rustc -O -o /sandbox/prog /sandbox/main.rs',
    runCommand: '/sandbox/prog',
    starterCode: `use std::io::{self, BufRead};

fn main() {
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        if let Ok(l) = line {
            // Write your solution here
            println!("{}", l);
        }
    }
}
`,
  },
};

export const STARTER_CODE: Record<SupportedLanguage, string> = {
  javascript: LANGUAGE_CONFIGS.javascript.starterCode,
  python: LANGUAGE_CONFIGS.python.starterCode,
  c: LANGUAGE_CONFIGS.c.starterCode,
  cpp: LANGUAGE_CONFIGS.cpp.starterCode,
  java: LANGUAGE_CONFIGS.java.starterCode,
  go: LANGUAGE_CONFIGS.go.starterCode,
  rust: LANGUAGE_CONFIGS.rust.starterCode,
};
