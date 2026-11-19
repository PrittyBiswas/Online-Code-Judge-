import type { SupportedLanguage } from '@judge/shared';

export interface StarterTemplateGeneratorOptions {
  functionName: string;
  jsInputParse: string;
  jsSolveCall: string;
  jsOutputPrint: string;
  pyInputParse: string;
  pySolveCall: string;
  pyOutputPrint: string;
  cppReturnType: string;
  cppParams: string;
  cppInputParse: string;
  cppSolveCall: string;
  cppOutputPrint: string;
  cInputParse: string;
  cSolveBody: string;
  javaReturnType: string;
  javaParams: string;
  javaInputParse: string;
  javaSolveCall: string;
  javaOutputPrint: string;
  goReturnType: string;
  goParams: string;
  goInputParse: string;
  goSolveCall: string;
  goOutputPrint: string;
  rustReturnType: string;
  rustParams: string;
  rustInputParse: string;
  rustSolveCall: string;
  rustOutputPrint: string;
}

export function generateStarterCode(
  opts: StarterTemplateGeneratorOptions
): Record<SupportedLanguage, string> {
  const js = `const fs = require('fs');

/**
 * @TODO: Implement your solution below
 */
function ${opts.functionName}() {
  // TODO: Add your logic here
  return null;
}

function main() {
  const input = fs.readFileSync(0, 'utf-8').trim();
  if (!input) return;
  ${opts.jsInputParse}
  const result = ${opts.jsSolveCall};
  ${opts.jsOutputPrint}
}

main();
`;

  const py = `import sys

def ${opts.functionName}():
    # TODO: Implement your solution here
    pass

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    ${opts.pyInputParse}
    result = ${opts.pySolveCall}
    ${opts.pyOutputPrint}

if __name__ == '__main__':
    main()
`;

  const cpp = `#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using namespace std;

// TODO: Implement your solution below
${opts.cppReturnType} ${opts.functionName}(${opts.cppParams}) {
    // TODO: Write code here
    return {};
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    ${opts.cppInputParse}
    auto result = ${opts.cppSolveCall};
    ${opts.cppOutputPrint}
    return 0;
}
`;

  const c = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// TODO: Implement your solution here
void solve() {
    ${opts.cInputParse}
    ${opts.cSolveBody}
}

int main() {
    solve();
    return 0;
}
`;

  const java = `import java.util.*;
import java.io.*;

public class Main {
    // TODO: Implement your solution here
    public static ${opts.javaReturnType} ${opts.functionName}(${opts.javaParams}) {
        // TODO: Write code here
        return null;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        ${opts.javaInputParse}
        var result = ${opts.javaSolveCall};
        ${opts.javaOutputPrint}
    }
}
`;

  const go = `package main

import (
	"bufio"
	"fmt"
	"os"
)

// TODO: Implement your solution here
func ${opts.functionName}(${opts.goParams}) ${opts.goReturnType} {
	// TODO: Write code here
	return ${opts.goReturnType === 'int' || opts.goReturnType === 'int64' ? '0' : opts.goReturnType === 'bool' ? 'false' : opts.goReturnType === 'string' ? `""` : 'nil'}
}

func main() {
	in := bufio.NewReader(os.Stdin)
	${opts.goInputParse}
	result := ${opts.goSolveCall}
	${opts.goOutputPrint}
}
`;

  const rust = `use std::io::{self, Read};

// TODO: Implement your solution here
fn ${opts.functionName}(${opts.rustParams}) -> ${opts.rustReturnType} {
    // TODO: Write code here
    ${opts.rustReturnType === 'i32' || opts.rustReturnType === 'i64' || opts.rustReturnType === 'usize' ? '0' : opts.rustReturnType === 'bool' ? 'false' : opts.rustReturnType === 'String' ? '"".to_string()' : 'vec![]'}
}

fn main() {
    let mut buffer = String::new();
    if io::stdin().read_to_string(&mut buffer).is_err() {
        return;
    }
    let mut tokens = buffer.split_whitespace();
    ${opts.rustInputParse}
    let result = ${opts.rustSolveCall};
    ${opts.rustOutputPrint}
}
`;

  return {
    javascript: js,
    python: py,
    cpp: cpp,
    c: c,
    java: java,
    go: go,
    rust: rust,
  };
}
