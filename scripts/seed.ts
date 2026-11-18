#!/usr/bin/env tsx
/**
 * scripts/seed.ts
 *
 * Seeds the database with production-grade data:
 * - Admin user (admin@judge.local / admin1234)
 * - Problem Setter user (setter@judge.local / setter1234)
 * - 10 real, complete coding problems with:
 *   - Comprehensive problem descriptions
 *   - Input & output formats
 *   - Constraints
 *   - Multiple examples with explanations
 *   - Starter code for all 7 languages (JavaScript, Python, C, C++, Java, Go, Rust)
 *   - Sample & hidden test cases uploaded to MinIO and recorded in PostgreSQL
 * - Purges old test placeholder problems
 * - Invalidates Redis problem caches
 */

import { resolve } from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pg from 'pg';
import Redis from 'ioredis';
import { ProblemDifficulty, ProblemVisibility, REDIS_KEYS, SupportedLanguage } from '@judge/shared';

// Load .env
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../.env') });

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://judge_user:judge_secret_password@localhost:5433/judge_db';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
const minioPort = parseInt(process.env.MINIO_PORT || '9000', 10);
const minioBucket = process.env.MINIO_BUCKET_NAME || 'judge-testcases';
const minioRootUser = process.env.MINIO_ROOT_USER || 'minioadmin';
const minioRootPassword = process.env.MINIO_ROOT_PASSWORD || 'minioadmin';
const minioUseSSL = process.env.MINIO_USE_SSL === 'true';

// S3 V4 signing helpers for MinIO
function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

async function uploadToMinio(key: string, content: string): Promise<void> {
  const protocol = minioUseSSL ? 'https' : 'http';
  const host = `${minioEndpoint}:${minioPort}`;
  const cleanKey = key.replace(/^\/+/, '');
  const encodedPath = cleanKey.split('/').map(encodeURIComponent).join('/');
  const canonicalUri = `/${minioBucket}/${encodedPath}`;
  const url = `${protocol}://${host}${canonicalUri}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'us-east-1';
  const payloadHash = sha256Hex(content);
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmacSha256(`AWS4${minioRootPassword}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const headers = {
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'Content-Type': 'text/plain; charset=utf-8',
    Authorization: `AWS4-HMAC-SHA256 Credential=${minioRootUser}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: content,
  });

  if (!res.ok) {
    throw new Error(`MinIO upload failed (${res.status}): ${await res.text()}`);
  }
}

interface ProblemDefinition {
  title: string;
  slug: string;
  difficulty: ProblemDifficulty;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  starterCode: Record<SupportedLanguage, string>;
  testCases: Array<{ input: string; output: string; isHidden: boolean }>;
}

const SEED_PROBLEMS: ProblemDefinition[] = [
  // 1. Two Sum
  {
    title: 'Two Sum',
    slug: 'two-sum',
    difficulty: ProblemDifficulty.EASY,
    tags: ['Array', 'Hash Table'],
    statement: `Given an array of integers \`nums\` and an integer \`target\`, return the **indices** of the two numbers such that they add up to \`target\`.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice.

You can return the answer in any order. Print the two 0-based indices separated by a single space.`,
    inputFormat: `The first line contains an integer \`n\` (length of the array).
The second line contains \`n\` space-separated integers representing \`nums\`.
The third line contains a single integer representing \`target\`.`,
    outputFormat: `Print the two 0-based space-separated indices of the numbers that add up to target.`,
    constraints: `2 <= nums.length <= 10^4
-10^9 <= nums[i] <= 10^9
-10^9 <= target <= 10^9
Only one valid answer exists.`,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4\n2 7 11 15\n9',
        output: '0 1',
        explanation: 'Because nums[0] + nums[1] == 9, we return 0 1.',
      },
      {
        input: '3\n3 2 4\n6',
        output: '1 2',
        explanation: 'nums[1] + nums[2] == 6, so indices 1 and 2 are returned.',
      },
      {
        input: '2\n3 3\n6',
        output: '0 1',
        explanation: 'nums[0] + nums[1] == 6, returning 0 1.',
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

function solve() {
  const input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);
  if (input.length < 3) return;
  const n = parseInt(input[0], 10);
  const nums = input.slice(1, n + 1).map(Number);
  const target = Number(input[n + 1]);

  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const comp = target - nums[i];
    if (map.has(comp)) {
      console.log(\`\${map.get(comp)} \${i}\`);
      return;
    }
    map.set(nums[i], i);
  }
}

solve();
`,
      python: `import sys

def solve():
    tokens = sys.stdin.read().split()
    if not tokens:
        return
    n = int(tokens[0])
    nums = [int(x) for x in tokens[1:n+1]]
    target = int(tokens[n+1])
    
    seen = {}
    for i, num in enumerate(nums):
        comp = target - num
        if comp in seen:
            print(f"{seen[comp]} {i}")
            return
        seen[num] = i

if __name__ == '__main__':
    solve()
`,
      c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int *nums = (int *)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) {
        scanf("%d", &nums[i]);
    }
    int target;
    scanf("%d", &target);

    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            if (nums[i] + nums[j] == target) {
                printf("%d %d\\n", i, j);
                free(nums);
                return 0;
            }
        }
    }
    free(nums);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <vector>
#include <unordered_map>

using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int n;
    if (!(cin >> n)) return 0;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) {
        cin >> nums[i];
    }
    int target;
    cin >> target;

    unordered_map<int, int> seen;
    for (int i = 0; i < n; i++) {
        int comp = target - nums[i];
        if (seen.find(comp) != seen.end()) {
            cout << seen[comp] << " " << i << "\\n";
            return 0;
        }
        seen[nums[i]] = i;
    }
    return 0;
}
`,
      java: `import java.util.Scanner;
import java.util.HashMap;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[] nums = new int[n];
        for (int i = 0; i < n; i++) {
            nums[i] = sc.nextInt();
        }
        int target = sc.nextInt();

        HashMap<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < n; i++) {
            int comp = target - nums[i];
            if (map.containsKey(comp)) {
                System.out.println(map.get(comp) + " " + i);
                return;
            }
            map.put(nums[i], i);
        }
    }
}
`,
      go: `package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Split(bufio.ScanWords)

	if !scanner.Scan() {
		return
	}
	n, _ := strconv.Atoi(scanner.Text())
	nums := make([]int, n)
	for i := 0; i < n; i++ {
		scanner.Scan()
		nums[i], _ = strconv.Atoi(scanner.Text())
	}
	scanner.Scan()
	target, _ := strconv.Atoi(scanner.Text())

	seen := make(map[int]int)
	for i, num := range nums {
		comp := target - num
		if idx, ok := seen[comp]; ok {
			fmt.Printf("%d %d\\n", idx, i)
			return
		}
		seen[num] = i
	}
}
`,
      rust: `use std::io::{self, Read};
use std::collections::HashMap;

fn main() {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_err() {
        return;
    }
    let mut tokens = input.split_whitespace();

    let n: usize = match tokens.next() {
        Some(t) => match t.parse() {
            Ok(val) => val,
            Err(_) => return,
        },
        None => return,
    };

    let mut nums = Vec::with_capacity(n);
    for _ in 0..n {
        if let Some(t) = tokens.next() {
            if let Ok(val) = t.parse::<i32>() {
                nums.push(val);
            }
        }
    }

    let target: i32 = match tokens.next() {
        Some(t) => match t.parse() {
            Ok(val) => val,
            Err(_) => return,
        },
        None => return,
    };

    let mut seen = HashMap::new();
    for (i, &num) in nums.iter().enumerate() {
        let comp = target - num;
        if let Some(&idx) = seen.get(&comp) {
            println!("{} {}", idx, i);
            return;
        }
        seen.insert(num, i);
    }
}
`,
    },
    testCases: [
      { input: '4\n2 7 11 15\n9', output: '0 1', isHidden: false },
      { input: '3\n3 2 4\n6', output: '1 2', isHidden: false },
      { input: '2\n3 3\n6', output: '0 1', isHidden: false },
      { input: '5\n10 20 30 40 50\n70', output: '1 4', isHidden: true },
      { input: '4\n-1 -2 -3 -4\n-7', output: '2 3', isHidden: true },
      { input: '6\n1 5 3 7 9 2\n16', output: '3 4', isHidden: true },
    ],
  },

  // 2. Reverse String
  {
    title: 'Reverse String',
    slug: 'reverse-string',
    difficulty: ProblemDifficulty.EASY,
    tags: ['String', 'Two Pointers'],
    statement: `Given a string \`s\`, reverse the string and print the result.

Your code should read the string from standard input and write the reversed string to standard output.`,
    inputFormat: `A single line containing the string \`s\`.`,
    outputFormat: `Print the reversed string.`,
    constraints: `1 <= s.length <= 10^5
s consists of printable ASCII characters.`,
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    examples: [
      {
        input: 'hello',
        output: 'olleh',
        explanation: "The reversed string of 'hello' is 'olleh'.",
      },
      {
        input: 'racecar',
        output: 'racecar',
        explanation: "'racecar' is a palindrome, so its reverse is identical.",
      },
      {
        input: 'Antigravity',
        output: 'ytivargitnA',
        explanation: "Reversing 'Antigravity' yields 'ytivargitnA'.",
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

const input = fs.readFileSync(0, 'utf-8').trim();
console.log(input.split('').reverse().join(''));
`,
      python: `import sys

s = sys.stdin.read().strip()
print(s[::-1])
`,
      c: `#include <stdio.h>
#include <string.h>

int main() {
    char s[100005];
    if (scanf("%100004s", s) != 1) return 0;
    int len = strlen(s);
    for (int i = 0, j = len - 1; i < j; i++, j--) {
        char temp = s[i];
        s[i] = s[j];
        s[j] = temp;
    }
    printf("%s\\n", s);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>
#include <algorithm>

using namespace std;

int main() {
    string s;
    if (cin >> s) {
        reverse(s.begin(), s.end());
        cout << s << "\\n";
    }
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNext()) {
            String s = sc.next();
            System.out.println(new StringBuilder(s).reverse().toString());
        }
    }
}
`,
      go: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		runes := []rune(scanner.Text())
		for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
			runes[i], runes[j] = runes[j], runes[i]
		}
		fmt.Println(string(runes))
	}
}
`,
      rust: `use std::io::{self, Read};

fn main() {
    let mut s = String::new();
    if io::stdin().read_to_string(&mut s).is_ok() {
        let rev: String = s.trim().chars().rev().collect();
        println!("{}", rev);
    }
}
`,
    },
    testCases: [
      { input: 'hello', output: 'olleh', isHidden: false },
      { input: 'racecar', output: 'racecar', isHidden: false },
      { input: 'Antigravity', output: 'ytivargitnA', isHidden: false },
      { input: 'a', output: 'a', isHidden: true },
      { input: '1234567890', output: '0987654321', isHidden: true },
      { input: 'CodeJudge', output: 'egduJedoc', isHidden: true },
    ],
  },

  // 3. Valid Palindrome
  {
    title: 'Valid Palindrome',
    slug: 'valid-palindrome',
    difficulty: ProblemDifficulty.EASY,
    tags: ['String', 'Two Pointers'],
    statement: `A phrase is a **palindrome** if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Alphanumeric characters include letters and numbers.

Given a string \`s\`, print \`true\` if it is a palindrome, or \`false\` otherwise.`,
    inputFormat: `A single line containing the string \`s\`.`,
    outputFormat: `Print \`true\` or \`false\`.`,
    constraints: `1 <= s.length <= 2 * 10^5
s consists only of printable ASCII characters.`,
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    examples: [
      {
        input: 'A man, a plan, a canal: Panama',
        output: 'true',
        explanation: '"amanaplanacanalpanama" is a palindrome.',
      },
      {
        input: 'race a car',
        output: 'false',
        explanation: '"raceacar" is not a palindrome.',
      },
      {
        input: 'ab_a',
        output: 'true',
        explanation: '"aba" is a palindrome after removing underscore.',
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

function solve() {
  const line = fs.readFileSync(0, 'utf-8').trim();
  const cleaned = line.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rev = cleaned.split('').reverse().join('');
  console.log(cleaned === rev ? 'true' : 'false');
}

solve();
`,
      python: `import sys

line = sys.stdin.read().strip()
cleaned = [c.lower() for c in line if c.isalnum()]
print('true' if cleaned == cleaned[::-1] else 'false')
`,
      c: `#include <stdio.h>
#include <ctype.h>
#include <string.h>

int main() {
    char s[200005];
    if (!fgets(s, sizeof(s), stdin)) return 0;
    int i = 0, j = strlen(s) - 1;
    while (i < j) {
        while (i < j && !isalnum((unsigned char)s[i])) i++;
        while (i < j && !isalnum((unsigned char)s[j])) j--;
        if (tolower((unsigned char)s[i]) != tolower((unsigned char)s[j])) {
            printf("false\\n");
            return 0;
        }
        i++;
        j--;
    }
    printf("true\\n");
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>
#include <cctype>

using namespace std;

int main() {
    string s;
    getline(cin, s);
    int i = 0, j = s.length() - 1;
    while (i < j) {
        while (i < j && !isalnum(s[i])) i++;
        while (i < j && !isalnum(s[j])) j--;
        if (tolower(s[i]) != tolower(s[j])) {
            cout << "false\\n";
            return 0;
        }
        i++;
        j--;
    }
    cout << "true\\n";
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.hasNextLine() ? sc.nextLine() : "";
        int i = 0, j = s.length() - 1;
        boolean ok = true;
        while (i < j) {
            while (i < j && !Character.isLetterOrDigit(s.charAt(i))) i++;
            while (i < j && !Character.isLetterOrDigit(s.charAt(j))) j--;
            if (Character.toLowerCase(s.charAt(i)) != Character.toLowerCase(s.charAt(j))) {
                ok = false;
                break;
            }
            i++;
            j--;
        }
        System.out.println(ok ? "true" : "false");
    }
}
`,
      go: `package main

import (
	"bufio"
	"fmt"
	"os"
	"unicode"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	var s string
	if scanner.Scan() {
		s = scanner.Text()
	}
	runes := []rune(s)
	i, j := 0, len(runes)-1
	ok := true
	for i < j {
		for i < j && !unicode.IsLetter(runes[i]) && !unicode.IsDigit(runes[i]) {
			i++
		}
		for i < j && !unicode.IsLetter(runes[j]) && !unicode.IsDigit(runes[j]) {
			j--
		}
		if unicode.ToLower(runes[i]) != unicode.ToLower(runes[j]) {
			ok = false
			break
		}
		i++
		j--
	}
	if ok {
		fmt.Println("true")
	} else {
		fmt.Println("false")
	}
}
`,
      rust: `use std::io::{self, BufRead};

fn main() {
    let stdin = io::stdin();
    let mut line = String::new();
    stdin.lock().read_line(&mut line).unwrap();
    let cleaned: Vec<char> = line
        .chars()
        .filter(|c| c.is_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    let is_pal = cleaned.iter().eq(cleaned.iter().rev());
    println!("{}", if is_pal { "true" } else { "false" });
}
`,
    },
    testCases: [
      { input: 'A man, a plan, a canal: Panama', output: 'true', isHidden: false },
      { input: 'race a car', output: 'false', isHidden: false },
      { input: 'ab_a', output: 'true', isHidden: false },
      { input: '0P', output: 'false', isHidden: true },
      { input: 'Was it a car or a cat I saw?', output: 'true', isHidden: true },
      { input: 'No lemon, no melon', output: 'true', isHidden: true },
    ],
  },

  // 4. Fizz Buzz
  {
    title: 'Fizz Buzz',
    slug: 'fizz-buzz',
    difficulty: ProblemDifficulty.EASY,
    tags: ['Math', 'Simulation'],
    statement: `Given an integer \`n\`, return a string array \`answer\` (1-indexed) where:
- \`answer[i] == "FizzBuzz"\` if \`i\` is divisible by 3 and 5.
- \`answer[i] == "Fizz"\` if \`i\` is divisible by 3.
- \`answer[i] == "Buzz"\` if \`i\` is divisible by 5.
- \`answer[i] == i\` (as a string) if none of the above conditions are true.

Print each element on a new line.`,
    inputFormat: `A single integer \`n\`.`,
    outputFormat: `Print \`n\` lines representing the FizzBuzz sequence from 1 to n.`,
    constraints: `1 <= n <= 10^4`,
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    examples: [
      {
        input: '3',
        output: '1\n2\nFizz',
        explanation: '1 and 2 are printed as integers; 3 is divisible by 3 so Fizz is printed.',
      },
      {
        input: '5',
        output: '1\n2\nFizz\n4\nBuzz',
        explanation: '5 is divisible by 5 so Buzz is printed.',
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

const n = parseInt(fs.readFileSync(0, 'utf-8').trim(), 10);
for (let i = 1; i <= n; i++) {
  if (i % 15 === 0) console.log('FizzBuzz');
  else if (i % 3 === 0) console.log('Fizz');
  else if (i % 5 === 0) console.log('Buzz');
  else console.log(i);
}
`,
      python: `import sys

n = int(sys.stdin.read().strip())
for i in range(1, n + 1):
    if i % 15 == 0:
        print("FizzBuzz")
    elif i % 3 == 0:
        print("Fizz")
    elif i % 5 == 0:
        print("Buzz")
    else:
        print(i)
`,
      c: `#include <stdio.h>

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    for (int i = 1; i <= n; i++) {
        if (i % 15 == 0) printf("FizzBuzz\\n");
        else if (i % 3 == 0) printf("Fizz\\n");
        else if (i % 5 == 0) printf("Buzz\\n");
        else printf("%d\\n", i);
    }
    return 0;
}
`,
      cpp: `#include <iostream>

using namespace std;

int main() {
    int n;
    if (cin >> n) {
        for (int i = 1; i <= n; i++) {
            if (i % 15 == 0) cout << "FizzBuzz\\n";
            else if (i % 3 == 0) cout << "Fizz\\n";
            else if (i % 5 == 0) cout << "Buzz\\n";
            else cout << i << "\\n";
        }
    }
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            for (int i = 1; i <= n; i++) {
                if (i % 15 == 0) System.out.println("FizzBuzz");
                else if (i % 3 == 0) System.out.println("Fizz");
                else if (i % 5 == 0) System.out.println("Buzz");
                else System.out.println(i);
            }
        }
    }
}
`,
      go: `package main

import (
	"fmt"
	"os"
)

func main() {
	var n int
	if _, err := fmt.Fscan(os.Stdin, &n); err == nil {
		for i := 1; i <= n; i++ {
			if i%15 == 0 {
				fmt.Println("FizzBuzz")
			} else if i%3 == 0 {
				fmt.Println("Fizz")
			} else if i%5 == 0 {
				fmt.Println("Buzz")
			} else {
				fmt.Println(i)
			}
		}
	}
}
`,
      rust: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_ok() {
        if let Ok(n) = input.trim().parse::<i32>() {
            for i in 1..=n {
                if i % 15 == 0 {
                    println!("FizzBuzz");
                } else if i % 3 == 0 {
                    println!("Fizz");
                } else if i % 5 == 0 {
                    println!("Buzz");
                } else {
                    println!("{}", i);
                }
            }
        }
    }
}
`,
    },
    testCases: [
      { input: '3', output: '1\n2\nFizz', isHidden: false },
      { input: '5', output: '1\n2\nFizz\n4\nBuzz', isHidden: false },
      { input: '1', output: '1', isHidden: true },
      {
        input: '15',
        output: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz',
        isHidden: true,
      },
    ],
  },

  // 5. Valid Parentheses
  {
    title: 'Valid Parentheses',
    slug: 'valid-parentheses',
    difficulty: ProblemDifficulty.EASY,
    tags: ['String', 'Stack'],
    statement: `Given a string \`s\` containing just the characters \`'('\`, \`')'\`, \`'{'\`, \`'}'\`, \`'['\` and \`']'\`, determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.

Print \`true\` if the string is valid, or \`false\` otherwise.`,
    inputFormat: `A single line containing string \`s\`.`,
    outputFormat: `Print \`true\` or \`false\`.`,
    constraints: `1 <= s.length <= 10^4
s consists of parentheses only '()[]{}'.`,
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    examples: [
      {
        input: '()',
        output: 'true',
        explanation: 'Simple valid pair of parentheses.',
      },
      {
        input: '()[]{}',
        output: 'true',
        explanation: 'All three bracket types are correctly matched in sequence.',
      },
      {
        input: '(]',
        output: 'false',
        explanation: 'Mismatched closing bracket.',
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

function solve() {
  const s = fs.readFileSync(0, 'utf-8').trim();
  const stack = [];
  const map = { ')': '(', '}': '{', ']': '[' };
  for (const c of s) {
    if (c === '(' || c === '{' || c === '[') {
      stack.push(c);
    } else if (map[c]) {
      if (stack.pop() !== map[c]) {
        console.log('false');
        return;
      }
    }
  }
  console.log(stack.length === 0 ? 'true' : 'false');
}

solve();
`,
      python: `import sys

def solve():
    s = sys.stdin.read().strip()
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    for c in s:
        if c in '({[':
            stack.append(c)
        elif c in pairs:
            if not stack or stack.pop() != pairs[c]:
                print('false')
                return
    print('true' if not stack else 'false')

if __name__ == '__main__':
    solve()
`,
      c: `#include <stdio.h>
#include <string.h>

int main() {
    char s[10005];
    if (scanf("%10004s", s) != 1) return 0;
    char stack[10005];
    int top = -1;
    for (int i = 0; s[i]; i++) {
        char c = s[i];
        if (c == '(' || c == '{' || c == '[') {
            stack[++top] = c;
        } else {
            if (top < 0) { printf("false\\n"); return 0; }
            if (c == ')' && stack[top] != '(') { printf("false\\n"); return 0; }
            if (c == '}' && stack[top] != '{') { printf("false\\n"); return 0; }
            if (c == ']' && stack[top] != '[') { printf("false\\n"); return 0; }
            top--;
        }
    }
    printf("%s\\n", top == -1 ? "true" : "false");
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>
#include <stack>

using namespace std;

int main() {
    string s;
    if (cin >> s) {
        stack<char> st;
        for (char c : s) {
            if (c == '(' || c == '{' || c == '[') {
                st.push(c);
            } else {
                if (st.empty()) { cout << "false\\n"; return 0; }
                if (c == ')' && st.top() != '(') { cout << "false\\n"; return 0; }
                if (c == '}' && st.top() != '{') { cout << "false\\n"; return 0; }
                if (c == ']' && st.top() != '[') { cout << "false\\n"; return 0; }
                st.pop();
            }
        }
        cout << (st.empty() ? "true" : "false") << "\\n";
    }
    return 0;
}
`,
      java: `import java.util.Scanner;
import java.util.Stack;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNext()) {
            String s = sc.next();
            Stack<Character> stack = new Stack<>();
            boolean ok = true;
            for (char c : s.toCharArray()) {
                if (c == '(' || c == '{' || c == '[') {
                    stack.push(c);
                } else {
                    if (stack.isEmpty()) { ok = false; break; }
                    char top = stack.pop();
                    if (c == ')' && top != '(') { ok = false; break; }
                    if (c == '}' && top != '{') { ok = false; break; }
                    if (c == ']' && top != '[') { ok = false; break; }
                }
            }
            System.out.println(ok && stack.isEmpty() ? "true" : "false");
        }
    }
}
`,
      go: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		s := scanner.Text()
		stack := []rune{}
		ok := true
		for _, c := range s {
			if c == '(' || c == '{' || c == '[' {
				stack = append(stack, c)
			} else {
				if len(stack) == 0 {
					ok = false
					break
				}
				top := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				if c == ')' && top != '(' || c == '}' && top != '{' || c == ']' && top != '[' {
					ok = false
					break
				}
			}
		}
		if ok && len(stack) == 0 {
			fmt.Println("true")
		} else {
			fmt.Println("false")
		}
	}
}
`,
      rust: `use std::io::{self, Read};

fn main() {
    let mut s = String::new();
    if io::stdin().read_to_string(&mut s).is_ok() {
        let mut stack = Vec::new();
        let mut ok = true;
        for c in s.trim().chars() {
            match c {
                '(' | '{' | '[' => stack.push(c),
                ')' => if stack.pop() != Some('(') { ok = false; break; },
                '}' => if stack.pop() != Some('{') { ok = false; break; },
                ']' => if stack.pop() != Some('[') { ok = false; break; },
                _ => {}
            }
        }
        println!("{}", if ok && stack.is_empty() { "true" } else { "false" });
    }
}
`,
    },
    testCases: [
      { input: '()', output: 'true', isHidden: false },
      { input: '()[]{}', output: 'true', isHidden: false },
      { input: '(]', output: 'false', isHidden: false },
      { input: '([)]', output: 'false', isHidden: true },
      { input: '{[]}', output: 'true', isHidden: true },
      { input: '(((((((((())))))))))', output: 'true', isHidden: true },
    ],
  },

  // 6. Binary Search
  {
    title: 'Binary Search',
    slug: 'binary-search',
    difficulty: ProblemDifficulty.EASY,
    tags: ['Array', 'Binary Search'],
    statement: `Given an array of integers \`nums\` which is sorted in ascending order, and an integer \`target\`, write a function to search \`target\` in \`nums\`. If \`target\` exists, then print its 0-based index. Otherwise, print \`-1\`.

You must write an algorithm with \`O(log n)\` runtime complexity.`,
    inputFormat: `The first line contains an integer \`n\` (length of the array).
The second line contains \`n\` space-separated integers in ascending order.
The third line contains an integer \`target\`.`,
    outputFormat: `Print the index of target if found, otherwise -1.`,
    constraints: `1 <= nums.length <= 10^4
-10^4 < nums[i], target < 10^4
All the integers in nums are unique and sorted in ascending order.`,
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    examples: [
      {
        input: '6\n-1 0 3 5 9 12\n9',
        output: '4',
        explanation: '9 exists in nums and its index is 4.',
      },
      {
        input: '6\n-1 0 3 5 9 12\n2',
        output: '-1',
        explanation: '2 does not exist in nums so -1 is printed.',
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

function solve() {
  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);
  if (tokens.length < 3) return;
  const n = parseInt(tokens[0], 10);
  const nums = tokens.slice(1, n + 1).map(Number);
  const target = Number(tokens[n + 1]);

  let left = 0, right = n - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (nums[mid] === target) {
      console.log(mid);
      return;
    } else if (nums[mid] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  console.log(-1);
}

solve();
`,
      python: `import sys

def solve():
    tokens = sys.stdin.read().split()
    if not tokens:
        return
    n = int(tokens[0])
    nums = [int(x) for x in tokens[1:n+1]]
    target = int(tokens[n+1])

    left, right = 0, n - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            print(mid)
            return
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    print(-1)

if __name__ == '__main__':
    solve()
`,
      c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int *nums = (int *)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);
    int target;
    scanf("%d", &target);

    int left = 0, right = n - 1, ans = -1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) {
            ans = mid;
            break;
        } else if (nums[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    printf("%d\\n", ans);
    free(nums);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <vector>

using namespace std;

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];
    int target;
    cin >> target;

    int left = 0, right = n - 1, ans = -1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) {
            ans = mid;
            break;
        } else if (nums[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    cout << ans << "\\n";
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[] nums = new int[n];
        for (int i = 0; i < n; i++) nums[i] = sc.nextInt();
        int target = sc.nextInt();

        int left = 0, right = n - 1, ans = -1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] == target) {
                ans = mid;
                break;
            } else if (nums[mid] < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        System.out.println(ans);
    }
}
`,
      go: `package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Split(bufio.ScanWords)
	if !scanner.Scan() {
		return
	}
	n, _ := strconv.Atoi(scanner.Text())
	nums := make([]int, n)
	for i := 0; i < n; i++ {
		scanner.Scan()
		nums[i], _ = strconv.Atoi(scanner.Text())
	}
	scanner.Scan()
	target, _ := strconv.Atoi(scanner.Text())

	left, right := 0, n-1
	ans := -1
	for left <= right {
		mid := left + (right-left)/2
		if nums[mid] == target {
			ans = mid
			break
		} else if nums[mid] < target {
			left = mid + 1
		} else {
			right = mid - 1
		}
	}
	fmt.Println(ans)
}
`,
      rust: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_err() {
        return;
    }
    let mut tokens = input.split_whitespace();
    let n: usize = match tokens.next().and_then(|t| t.parse().ok()) {
        Some(v) => v,
        None => return,
    };
    let mut nums = Vec::with_capacity(n);
    for _ in 0..n {
        nums.push(tokens.next().unwrap().parse::<i32>().unwrap());
    }
    let target: i32 = tokens.next().unwrap().parse().unwrap();

    let mut left = 0;
    let mut right = n as i32 - 1;
    let mut ans = -1;
    while left <= right {
        let mid = left + (right - left) / 2;
        let val = nums[mid as usize];
        if val == target {
            ans = mid;
            break;
        } else if val < target {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    println!("{}", ans);
}
`,
    },
    testCases: [
      { input: '6\n-1 0 3 5 9 12\n9', output: '4', isHidden: false },
      { input: '6\n-1 0 3 5 9 12\n2', output: '-1', isHidden: false },
      { input: '1\n5\n5', output: '0', isHidden: true },
      { input: '1\n5\n-5', output: '-1', isHidden: true },
      { input: '7\n1 3 5 7 9 11 13\n13', output: '6', isHidden: true },
    ],
  },

  // 7. Maximum Subarray
  {
    title: 'Maximum Subarray',
    slug: 'maximum-subarray',
    difficulty: ProblemDifficulty.MEDIUM,
    tags: ['Array', 'Dynamic Programming'],
    statement: `Given an integer array \`nums\`, find the subarray with the largest sum, and print its sum.

A **subarray** is a contiguous non-empty sequence of elements within an array.`,
    inputFormat: `The first line contains an integer \`n\` (length of array).
The second line contains \`n\` space-separated integers.`,
    outputFormat: `Print a single integer representing the maximum subarray sum.`,
    constraints: `1 <= nums.length <= 10^5
-10^4 <= nums[i] <= 10^4`,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '9\n-2 1 -3 4 -1 2 1 -5 4',
        output: '6',
        explanation: 'The subarray [4,-1,2,1] has the largest sum 6.',
      },
      {
        input: '1\n1',
        output: '1',
        explanation: 'Single element array returns its only value.',
      },
      {
        input: '5\n5 4 -1 7 8',
        output: '23',
        explanation: 'The subarray [5,4,-1,7,8] has the largest sum 23.',
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

function solve() {
  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);
  if (!tokens || tokens.length < 2) return;
  const n = parseInt(tokens[0], 10);
  const nums = tokens.slice(1, n + 1).map(Number);

  let currentSum = nums[0];
  let maxSum = nums[0];
  for (let i = 1; i < n; i++) {
    currentSum = Math.max(nums[i], currentSum + nums[i]);
    maxSum = Math.max(maxSum, currentSum);
  }
  console.log(maxSum);
}

solve();
`,
      python: `import sys

def solve():
    tokens = sys.stdin.read().split()
    if not tokens:
        return
    n = int(tokens[0])
    nums = [int(x) for x in tokens[1:n+1]]

    curr = nums[0]
    best = nums[0]
    for x in nums[1:]:
        curr = max(x, curr + x)
        best = max(best, curr)
    print(best)

if __name__ == '__main__':
    solve()
`,
      c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int first;
    scanf("%d", &first);
    long long curr = first, best = first;
    for (int i = 1; i < n; i++) {
        int x;
        scanf("%d", &x);
        curr = (x > curr + x) ? x : curr + x;
        if (curr > best) best = curr;
    }
    printf("%lld\\n", best);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <vector>
#include <algorithm>

using namespace std;

int main() {
    int n;
    if (!(cin >> n)) return 0;
    long long x;
    cin >> x;
    long long curr = x, best = x;
    for (int i = 1; i < n; i++) {
        cin >> x;
        curr = max(x, curr + x);
        best = max(best, curr);
    }
    cout << best << "\\n";
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        long curr = sc.nextLong();
        long best = curr;
        for (int i = 1; i < n; i++) {
            long x = sc.nextLong();
            curr = Math.max(x, curr + x);
            best = Math.max(best, curr);
        }
        System.out.println(best);
    }
}
`,
      go: `package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Split(bufio.ScanWords)
	if !scanner.Scan() {
		return
	}
	n, _ := strconv.Atoi(scanner.Text())
	scanner.Scan()
	first, _ := strconv.Atoi(scanner.Text())
	curr, best := first, first
	for i := 1; i < n; i++ {
		scanner.Scan()
		x, _ := strconv.Atoi(scanner.Text())
		if x > curr+x {
			curr = x
		} else {
			curr = curr + x
		}
		if curr > best {
			best = curr
		}
	}
	fmt.Println(best)
}
`,
      rust: `use std::io::{self, Read};
use std::cmp::max;

fn main() {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_err() {
        return;
    }
    let mut tokens = input.split_whitespace();
    let n: usize = match tokens.next().and_then(|t| t.parse().ok()) {
        Some(v) => v,
        None => return,
    };
    let first: i64 = tokens.next().unwrap().parse().unwrap();
    let mut curr = first;
    let mut best = first;
    for _ in 1..n {
        let x: i64 = tokens.next().unwrap().parse().unwrap();
        curr = max(x, curr + x);
        best = max(best, curr);
    }
    println!("{}", best);
}
`,
    },
    testCases: [
      { input: '9\n-2 1 -3 4 -1 2 1 -5 4', output: '6', isHidden: false },
      { input: '1\n1', output: '1', isHidden: false },
      { input: '5\n5 4 -1 7 8', output: '23', isHidden: false },
      { input: '3\n-3 -2 -1', output: '-1', isHidden: true },
      { input: '8\n1 2 3 -10 4 5 6 -2', output: '15', isHidden: true },
    ],
  },

  // 8. Merge Intervals
  {
    title: 'Merge Intervals',
    slug: 'merge-intervals',
    difficulty: ProblemDifficulty.MEDIUM,
    tags: ['Array', 'Sorting'],
    statement: `Given an array of \`intervals\` where \`intervals[i] = [start_i, end_i]\`, merge all overlapping intervals, and print an array of the non-overlapping intervals that cover all the intervals in the input in ascending order.`,
    inputFormat: `The first line contains an integer \`n\` (number of intervals).
The next \`n\` lines each contain two space-separated integers representing \`start_i\` and \`end_i\`.`,
    outputFormat: `For each merged interval, print its start and end on a new line separated by a space.`,
    constraints: `1 <= intervals.length <= 10^4
0 <= start_i <= end_i <= 10^4`,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4\n1 3\n2 6\n8 10\n15 18',
        output: '1 6\n8 10\n15 18',
        explanation: 'Intervals [1,3] and [2,6] overlap, merging into [1,6].',
      },
      {
        input: '2\n1 4\n4 5',
        output: '1 5',
        explanation: 'Intervals [1,4] and [4,5] are considered overlapping.',
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

function solve() {
  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);
  if (!tokens || tokens.length < 3) return;
  const n = parseInt(tokens[0], 10);
  const intervals = [];
  let idx = 1;
  for (let i = 0; i < n; i++) {
    intervals.push([Number(tokens[idx++]), Number(tokens[idx++])]);
  }

  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    const curr = intervals[i];
    if (curr[0] <= last[1]) {
      last[1] = Math.max(last[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }

  for (const [start, end] of merged) {
    console.log(\`\${start} \${end}\`);
  }
}

solve();
`,
      python: `import sys

def solve():
    tokens = sys.stdin.read().split()
    if not tokens:
        return
    n = int(tokens[0])
    intervals = []
    idx = 1
    for _ in range(n):
        intervals.append((int(tokens[idx]), int(tokens[idx+1])))
        idx += 2
    intervals.sort(key=lambda x: x[0])

    merged = [list(intervals[0])]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    for s, e in merged:
        print(f"{s} {e}")

if __name__ == '__main__':
    solve()
`,
      c: `#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int start;
    int end;
} Interval;

int compare(const void *a, const void *b) {
    return ((Interval *)a)->start - ((Interval *)b)->start;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    Interval *intervals = (Interval *)malloc(n * sizeof(Interval));
    for (int i = 0; i < n; i++) {
        scanf("%d %d", &intervals[i].start, &intervals[i].end);
    }
    qsort(intervals, n, sizeof(Interval), compare);

    Interval *merged = (Interval *)malloc(n * sizeof(Interval));
    int m_idx = 0;
    merged[0] = intervals[0];
    for (int i = 1; i < n; i++) {
        if (intervals[i].start <= merged[m_idx].end) {
            if (intervals[i].end > merged[m_idx].end) {
                merged[m_idx].end = intervals[i].end;
            }
        } else {
            merged[++m_idx] = intervals[i];
        }
    }
    for (int i = 0; i <= m_idx; i++) {
        printf("%d %d\\n", merged[i].start, merged[i].end);
    }
    free(intervals);
    free(merged);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <vector>
#include <algorithm>

using namespace std;

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<pair<int, int>> intervals(n);
    for (int i = 0; i < n; i++) {
        cin >> intervals[i].first >> intervals[i].second;
    }
    sort(intervals.begin(), intervals.end());

    vector<pair<int, int>> merged;
    merged.push_back(intervals[0]);
    for (size_t i = 1; i < intervals.size(); i++) {
        if (intervals[i].first <= merged.back().second) {
            merged.back().second = max(merged.back().second, intervals[i].second);
        } else {
            merged.push_back(intervals[i]);
        }
    }
    for (auto &p : merged) {
        cout << p.first << " " << p.second << "\\n";
    }
    return 0;
}
`,
      java: `import java.util.Scanner;
import java.util.Arrays;
import java.util.ArrayList;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[][] intervals = new int[n][2];
        for (int i = 0; i < n; i++) {
            intervals[i][0] = sc.nextInt();
            intervals[i][1] = sc.nextInt();
        }
        Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0]));

        ArrayList<int[]> merged = new ArrayList<>();
        merged.add(intervals[0]);
        for (int i = 1; i < n; i++) {
            int[] last = merged.get(merged.size() - 1);
            if (intervals[i][0] <= last[1]) {
                last[1] = Math.max(last[1], intervals[i][1]);
            } else {
                merged.add(intervals[i]);
            }
        }
        for (int[] inv : merged) {
            System.out.println(inv[0] + " " + inv[1]);
        }
    }
}
`,
      go: `package main

import (
	"bufio"
	"fmt"
	"os"
	"sort"
	"strconv"
)

type Interval struct {
	start, end int
}

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Split(bufio.ScanWords)
	if !scanner.Scan() {
		return
	}
	n, _ := strconv.Atoi(scanner.Text())
	intervals := make([]Interval, n)
	for i := 0; i < n; i++ {
		scanner.Scan()
		s, _ := strconv.Atoi(scanner.Text())
		scanner.Scan()
		e, _ := strconv.Atoi(scanner.Text())
		intervals[i] = Interval{s, e}
	}
	sort.Slice(intervals, func(i, j int) bool {
		return intervals[i].start < intervals[j].start
	})

	merged := []Interval{intervals[0]}
	for i := 1; i < n; i++ {
		last := &merged[len(merged)-1]
		if intervals[i].start <= last.end {
			if intervals[i].end > last.end {
				last.end = intervals[i].end
			}
		} else {
			merged = append(merged, intervals[i])
		}
	}
	for _, inv := range merged {
		fmt.Printf("%d %d\\n", inv.start, inv.end)
	}
}
`,
      rust: `use std::io::{self, Read};
use std::cmp::max;

fn main() {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_err() {
        return;
    }
    let mut tokens = input.split_whitespace();
    let n: usize = match tokens.next().and_then(|t| t.parse().ok()) {
        Some(v) => v,
        None => return,
    };
    let mut intervals = Vec::with_capacity(n);
    for _ in 0..n {
        let s: i32 = tokens.next().unwrap().parse().unwrap();
        let e: i32 = tokens.next().unwrap().parse().unwrap();
        intervals.push((s, e));
    }
    intervals.sort_by_key(|k| k.0);

    let mut merged = vec![intervals[0]];
    for (s, e) in intervals.into_iter().skip(1) {
        let last = merged.last_mut().unwrap();
        if s <= last.1 {
            last.1 = max(last.1, e);
        } else {
            merged.push((s, e));
        }
    }
    for (s, e) in merged {
        println!("{} {}", s, e);
    }
}
`,
    },
    testCases: [
      { input: '4\n1 3\n2 6\n8 10\n15 18', output: '1 6\n8 10\n15 18', isHidden: false },
      { input: '2\n1 4\n4 5', output: '1 5', isHidden: false },
      { input: '1\n2 3', output: '2 3', isHidden: true },
      { input: '3\n1 4\n0 2\n3 5', output: '0 5', isHidden: true },
    ],
  },

  // 9. Longest Substring Without Repeating Characters
  {
    title: 'Longest Substring Without Repeating Characters',
    slug: 'longest-substring-without-repeating-characters',
    difficulty: ProblemDifficulty.MEDIUM,
    tags: ['Hash Table', 'String', 'Sliding Window'],
    statement: `Given a string \`s\`, find the length of the **longest substring** without duplicate characters.`,
    inputFormat: `A single line containing the string \`s\`.`,
    outputFormat: `Print an integer representing the length of the longest substring without repeating characters.`,
    constraints: `0 <= s.length <= 5 * 10^4
s consists of English letters, digits, symbols and spaces.`,
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    examples: [
      {
        input: 'abcabcbb',
        output: '3',
        explanation: 'The answer is "abc", with the length of 3.',
      },
      {
        input: 'bbbbb',
        output: '1',
        explanation: 'The answer is "b", with the length of 1.',
      },
      {
        input: 'pwwkew',
        output: '3',
        explanation: 'The answer is "wke", with the length of 3.',
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

function solve() {
  const s = fs.readFileSync(0, 'utf-8').replace(/\\r?\\n$/, '');
  if (!s) { console.log(0); return; }
  let maxLen = 0, left = 0;
  const map = new Map();
  for (let right = 0; right < s.length; right++) {
    const c = s[right];
    if (map.has(c) && map.get(c) >= left) {
      left = map.get(c) + 1;
    }
    map.set(c, right);
    maxLen = Math.max(maxLen, right - left + 1);
  }
  console.log(maxLen);
}

solve();
`,
      python: `import sys

def solve():
    s = sys.stdin.read().rstrip('\r\n')
    if not s:
        print(0)
        return
    seen = {}
    left = 0
    max_len = 0
    for right, c in enumerate(s):
        if c in seen and seen[c] >= left:
            left = seen[c] + 1
        seen[c] = right
        max_len = max(max_len, right - left + 1)
    print(max_len)

if __name__ == '__main__':
    solve()
`,
      c: `#include <stdio.h>
#include <string.h>

int main() {
    char s[50005];
    if (!fgets(s, sizeof(s), stdin)) {
        printf("0\\n");
        return 0;
    }
    int len = strlen(s);
    while (len > 0 && (s[len - 1] == '\\n' || s[len - 1] == '\\r')) {
        s[--len] = '\\0';
    }
    int last[256];
    for (int i = 0; i < 256; i++) last[i] = -1;
    int max_len = 0, left = 0;
    for (int right = 0; right < len; right++) {
        unsigned char c = (unsigned char)s[right];
        if (last[c] >= left) {
            left = last[c] + 1;
        }
        last[c] = right;
        int cur_len = right - left + 1;
        if (cur_len > max_len) max_len = cur_len;
    }
    printf("%d\\n", max_len);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>
#include <vector>
#include <algorithm>

using namespace std;

int main() {
    string s;
    if (!getline(cin, s)) {
        cout << 0 << "\\n";
        return 0;
    }
    vector<int> last(256, -1);
    int max_len = 0, left = 0;
    for (int right = 0; right < (int)s.length(); right++) {
        unsigned char c = (unsigned char)s[right];
        if (last[c] >= left) {
            left = last[c] + 1;
        }
        last[c] = right;
        max_len = max(max_len, right - left + 1);
    }
    cout << max_len << "\\n";
    return 0;
}
`,
      java: `import java.util.Scanner;
import java.util.HashMap;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.hasNextLine() ? sc.nextLine() : "";
        HashMap<Character, Integer> map = new HashMap<>();
        int maxLen = 0, left = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (map.containsKey(c) && map.get(c) >= left) {
                left = map.get(c) + 1;
            }
            map.put(c, right);
            maxLen = Math.max(maxLen, right - left + 1);
        }
        System.out.println(maxLen);
    }
}
`,
      go: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	var s string
	if scanner.Scan() {
		s = scanner.Text()
	}
	last := make(map[rune]int)
	maxLen, left := 0, 0
	for right, c := range []rune(s) {
		if prev, ok := last[c]; ok && prev >= left {
			left = prev + 1
		}
		last[c] = right
		cur := right - left + 1
		if cur > maxLen {
			maxLen = cur
		}
	}
	fmt.Println(maxLen)
}
`,
      rust: `use std::io::{self, BufRead};
use std::collections::HashMap;
use std::cmp::max;

fn main() {
    let stdin = io::stdin();
    let mut line = String::new();
    let _ = stdin.lock().read_line(&mut line);
    let s = line.trim_end_matches(['\\r', '\\n']);
    let mut map = HashMap::new();
    let mut max_len = 0;
    let mut left = 0;
    for (right, c) in s.chars().enumerate() {
        if let Some(&prev) = map.get(&c) {
            if prev >= left {
                left = prev + 1;
            }
        }
        map.insert(c, right);
        max_len = max(max_len, right - left + 1);
    }
    println!("{}", max_len);
}
`,
    },
    testCases: [
      { input: 'abcabcbb', output: '3', isHidden: false },
      { input: 'bbbbb', output: '1', isHidden: false },
      { input: 'pwwkew', output: '3', isHidden: false },
      { input: 'dvdf', output: '3', isHidden: true },
      { input: 'anviaj', output: '5', isHidden: true },
      { input: 'tmmzuxt', output: '5', isHidden: true },
    ],
  },

  // 10. Trapping Rain Water
  {
    title: 'Trapping Rain Water',
    slug: 'trapping-rain-water',
    difficulty: ProblemDifficulty.HARD,
    tags: ['Array', 'Two Pointers', 'Dynamic Programming', 'Stack'],
    statement: `Given \`n\` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.`,
    inputFormat: `The first line contains an integer \`n\` (length of the elevation map).
The second line contains \`n\` space-separated non-negative integers representing heights.`,
    outputFormat: `Print a single integer representing the total amount of trapped rain water.`,
    constraints: `1 <= n <= 2 * 10^4
0 <= height[i] <= 10^5`,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '12\n0 1 0 2 1 0 1 3 2 1 2 1',
        output: '6',
        explanation: '6 units of rain water are trapped between elevation bars.',
      },
      {
        input: '6\n4 2 0 3 2 5',
        output: '9',
        explanation: '9 units of water are trapped.',
      },
    ],
    starterCode: {
      javascript: `const fs = require('fs');

function solve() {
  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);
  if (!tokens || tokens.length < 2) return;
  const n = parseInt(tokens[0], 10);
  const height = tokens.slice(1, n + 1).map(Number);

  let left = 0, right = n - 1;
  let leftMax = 0, rightMax = 0;
  let trapped = 0;

  while (left < right) {
    if (height[left] < height[right]) {
      if (height[left] >= leftMax) {
        leftMax = height[left];
      } else {
        trapped += leftMax - height[left];
      }
      left++;
    } else {
      if (height[right] >= rightMax) {
        rightMax = height[right];
      } else {
        trapped += rightMax - height[right];
      }
      right--;
    }
  }
  console.log(trapped);
}

solve();
`,
      python: `import sys

def solve():
    tokens = sys.stdin.read().split()
    if not tokens:
        return
    n = int(tokens[0])
    height = [int(x) for x in tokens[1:n+1]]

    left, right = 0, n - 1
    left_max, right_max = 0, 0
    trapped = 0

    while left < right:
        if height[left] < height[right]:
            if height[left] >= left_max:
                left_max = height[left]
            else:
                trapped += left_max - height[left]
            left += 1
        else:
            if height[right] >= right_max:
                right_max = height[right]
            else:
                trapped += right_max - height[right]
            right -= 1
    print(trapped)

if __name__ == '__main__':
    solve()
`,
      c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int *h = (int *)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) scanf("%d", &h[i]);

    int left = 0, right = n - 1;
    int left_max = 0, right_max = 0;
    long long trapped = 0;

    while (left < right) {
        if (h[left] < h[right]) {
            if (h[left] >= left_max) left_max = h[left];
            else trapped += (left_max - h[left]);
            left++;
        } else {
            if (h[right] >= right_max) right_max = h[right];
            else trapped += (right_max - h[right]);
            right--;
        }
    }
    printf("%lld\\n", trapped);
    free(h);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <vector>

using namespace std;

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> h(n);
    for (int i = 0; i < n; i++) cin >> h[i];

    int left = 0, right = n - 1;
    int left_max = 0, right_max = 0;
    long long trapped = 0;

    while (left < right) {
        if (h[left] < h[right]) {
            if (h[left] >= left_max) left_max = h[left];
            else trapped += (left_max - h[left]);
            left++;
        } else {
            if (h[right] >= right_max) right_max = h[right];
            else trapped += (right_max - h[right]);
            right--;
        }
    }
    cout << trapped << "\\n";
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[] h = new int[n];
        for (int i = 0; i < n; i++) h[i] = sc.nextInt();

        int left = 0, right = n - 1;
        int leftMax = 0, rightMax = 0;
        long trapped = 0;

        while (left < right) {
            if (h[left] < h[right]) {
                if (h[left] >= leftMax) leftMax = h[left];
                else trapped += (leftMax - h[left]);
                left++;
            } else {
                if (h[right] >= rightMax) rightMax = h[right];
                else trapped += (rightMax - h[right]);
                right--;
            }
        }
        System.out.println(trapped);
    }
}
`,
      go: `package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Split(bufio.ScanWords)
	if !scanner.Scan() {
		return
	}
	n, _ := strconv.Atoi(scanner.Text())
	h := make([]int, n)
	for i := 0; i < n; i++ {
		scanner.Scan()
		h[i], _ = strconv.Atoi(scanner.Text())
	}

	left, right := 0, n-1
	leftMax, rightMax := 0, 0
	var trapped int64

	for left < right {
		if h[left] < h[right] {
			if h[left] >= leftMax {
				leftMax = h[left]
			} else {
				trapped += int64(leftMax - h[left])
			}
			left++
		} else {
			if h[right] >= rightMax {
				rightMax = h[right]
			} else {
				trapped += int64(rightMax - h[right])
			}
			right--
		}
	}
	fmt.Println(trapped)
}
`,
      rust: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_err() {
        return;
    }
    let mut tokens = input.split_whitespace();
    let n: usize = match tokens.next().and_then(|t| t.parse().ok()) {
        Some(v) => v,
        None => return,
    };
    let mut h = Vec::with_capacity(n);
    for _ in 0..n {
        h.push(tokens.next().unwrap().parse::<i32>().unwrap());
    }

    let mut left = 0;
    let mut right = n.saturating_sub(1);
    let mut left_max = 0;
    let mut right_max = 0;
    let mut trapped: i64 = 0;

    while left < right {
        if h[left] < h[right] {
            if h[left] >= left_max {
                left_max = h[left];
            } else {
                trapped += (left_max - h[left]) as i64;
            }
            left += 1;
        } else {
            if h[right] >= right_max {
                right_max = h[right];
            } else {
                trapped += (right_max - h[right]) as i64;
            }
            right -= 1;
        }
    }
    println!("{}", trapped);
}
`,
    },
    testCases: [
      { input: '12\n0 1 0 2 1 0 1 3 2 1 2 1', output: '6', isHidden: false },
      { input: '6\n4 2 0 3 2 5', output: '9', isHidden: false },
      { input: '1\n3', output: '0', isHidden: true },
      { input: '3\n2 0 2', output: '2', isHidden: true },
      { input: '7\n3 0 2 0 4 0 1', output: '7', isHidden: true },
    ],
  },
];

async function seed() {
  console.log('[seed] Connecting to PostgreSQL at:', databaseUrl.replace(/:[^:@]+@/, ':***@'));
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const redis = new Redis(redisUrl);

  try {
    // 1. Ensure admin and setter users exist
    console.log('[seed] Ensuring Admin and Problem Setter accounts...');
    const adminPasswordHash = await bcrypt.hash('admin1234', 10);
    const setterPasswordHash = await bcrypt.hash('setter1234', 10);

    const adminRes = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET role = $4, password_hash = $3
       RETURNING id`,
      ['admin', 'admin@judge.local', adminPasswordHash, 'admin']
    );
    const adminId = adminRes.rows[0].id;

    const setterRes = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET role = $4, password_hash = $3
       RETURNING id`,
      ['setter', 'setter@judge.local', setterPasswordHash, 'problem_setter']
    );
    const setterId = setterRes.rows[0].id;

    console.log(`[seed] Admin ID: ${adminId}`);
    console.log(`[seed] Setter ID: ${setterId}`);

    // 2. Clean up test placeholder problems (e.g. Day8 MultiTest, Worker E2E, Verification Problem)
    console.log('[seed] Purging legacy test placeholder problems...');
    await pool.query(
      `DELETE FROM problems 
       WHERE title LIKE 'Day8 MultiTest%' 
          OR title LIKE 'Worker E2E%' 
          OR title LIKE 'Verification Problem%'
          OR title LIKE 'Stress test%'`
    );

    // 3. Seed the 10 real problems
    console.log(`[seed] Seeding ${SEED_PROBLEMS.length} real coding problems...`);

    for (const prob of SEED_PROBLEMS) {
      console.log(`[seed] Processing problem: "${prob.title}" (${prob.slug})...`);

      // Check if problem already exists
      const existing = await pool.query('SELECT id FROM problems WHERE slug = $1', [prob.slug]);

      let problemId: string;
      if (existing.rows.length > 0) {
        problemId = existing.rows[0].id;
        // Update problem definition
        await pool.query(
          `UPDATE problems
           SET title = $1, statement = $2, difficulty = $3, tags = $4,
               time_limit_ms = $5, memory_limit_mb = $6, sample_input = $7,
               sample_expected_output = $8, visibility = $9, input_format = $10,
               output_format = $11, constraints = $12, examples = $13,
               starter_code = $14, is_published = true, is_archived = false, updated_at = NOW()
           WHERE id = $15`,
          [
            prob.title,
            prob.statement,
            prob.difficulty,
            prob.tags,
            prob.timeLimitMs,
            prob.memoryLimitMb,
            prob.examples[0]?.input || '',
            prob.examples[0]?.output || '',
            ProblemVisibility.PUBLIC,
            prob.inputFormat,
            prob.outputFormat,
            prob.constraints,
            JSON.stringify(prob.examples),
            JSON.stringify(prob.starterCode),
            problemId,
          ]
        );
        // Delete old test cases for this problem so we upload fresh ones
        await pool.query('DELETE FROM test_cases WHERE problem_id = $1', [problemId]);
      } else {
        const insertRes = await pool.query(
          `INSERT INTO problems (
             title, slug, statement, difficulty, tags, time_limit_ms, memory_limit_mb,
             sample_input, sample_expected_output, visibility, input_format, output_format,
             constraints, examples, starter_code, is_published, setter_id, is_archived
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, false
           ) RETURNING id`,
          [
            prob.title,
            prob.slug,
            prob.statement,
            prob.difficulty,
            prob.tags,
            prob.timeLimitMs,
            prob.memoryLimitMb,
            prob.examples[0]?.input || '',
            prob.examples[0]?.output || '',
            ProblemVisibility.PUBLIC,
            prob.inputFormat,
            prob.outputFormat,
            prob.constraints,
            JSON.stringify(prob.examples),
            JSON.stringify(prob.starterCode),
            true,
            setterId,
          ]
        );
        problemId = insertRes.rows[0].id;
      }

      // Upload test cases to MinIO and insert into test_cases table
      for (let i = 0; i < prob.testCases.length; i++) {
        const tc = prob.testCases[i];
        const inputKey = `${problemId}/${i}/input.txt`;
        const outputKey = `${problemId}/${i}/output.txt`;

        await uploadToMinio(inputKey, tc.input);
        await uploadToMinio(outputKey, tc.output);

        await pool.query(
          `INSERT INTO test_cases (problem_id, index, input_key, expected_output_key, is_hidden)
           VALUES ($1, $2, $3, $4, $5)`,
          [problemId, i, inputKey, outputKey, tc.isHidden]
        );
      }
      console.log(`[seed]   → Uploaded ${prob.testCases.length} test cases (sample & hidden)`);
    }

    // Invalidate Redis caches
    console.log('[seed] Invalidating Redis caches...');
    try {
      await redis.incr(REDIS_KEYS.PROBLEMS_LIST_VERSION);
      const keys = await redis.keys('judge:problem:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      console.log('[seed] Redis cache invalidated successfully.');
    } catch (e) {
      console.warn('[seed] Warning: Failed to invalidate Redis cache:', e);
    }

    console.log('\n[seed] ✅ Seeding completed successfully!');
    console.log('[seed] Accounts:');
    console.log('  → Admin:   admin@judge.local / admin1234');
    console.log('  → Setter:  setter@judge.local / setter1234');
    console.log(
      `[seed] ${SEED_PROBLEMS.length} real coding problems loaded with live MinIO test cases.`
    );
  } finally {
    await pool.end();
    await redis.quit();
  }
}

seed().catch((err) => {
  console.error('[seed] ❌ Seeding failed:', err);
  process.exit(1);
});
