import { ProblemDifficulty, SupportedLanguage } from '@judge/shared';

export interface SeedProblemDef {
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

export const HARD_PROBLEMS: SeedProblemDef[] = [
  {
    title: 'Trapping Rain Water',
    slug: 'trapping-rain-water',
    difficulty: ProblemDifficulty.HARD,
    statement:
      'Given `n` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated non-negative integers representing elevation `height`.',
    outputFormat: 'Print the total trapped water units as an integer.',
    constraints: 'n == height.length\n1 <= n <= 2 * 10^4\n0 <= height[i] <= 10^5',
    tags: ['Arrays', 'Two Pointers', 'Dynamic Programming'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '12\n0 1 0 2 1 0 1 3 2 1 2 1',
        output: '6',
        explanation: 'The elevation map traps 6 units of rain water.',
      },
      {
        input: '6\n4 2 0 3 2 5',
        output: '9',
        explanation: '9 units of water are trapped.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction trap(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = trap(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef trap(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = trap(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint trap(vector<int>& nums) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = trap(nums);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid trap(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    trap(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int trap(int[] nums) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = trap(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc trap(nums []int) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := trap(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn trap(nums: &mut [i32]) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = trap(&mut nums);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '12\n0 1 0 2 1 0 1 3 2 1 2 1',
        output: '6',
        isHidden: false,
      },
      {
        input: '6\n4 2 0 3 2 5',
        output: '9',
        isHidden: false,
      },
      {
        input: '3\n2 0 2',
        output: '2',
        isHidden: true,
      },
      {
        input: '1\n3',
        output: '0',
        isHidden: true,
      },
      {
        input: '5\n3 2 1 2 3',
        output: '4',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Longest Valid Parentheses',
    slug: 'longest-valid-parentheses',
    difficulty: ProblemDifficulty.HARD,
    statement:
      "Given a string containing just the characters '(' and ')', return the length of the longest valid (well-formed) parentheses substring.",
    inputFormat: 'A single line containing parentheses string `s`.',
    outputFormat: 'Print the length of the longest valid parentheses substring.',
    constraints: "0 <= s.length <= 3 * 10^4\n`s[i]` is '(' or ')'.",
    tags: ['Strings', 'Dynamic Programming', 'Stack and Queue'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '(()',
        output: '2',
        explanation: "The longest valid parentheses substring is '()' with length 2.",
      },
      {
        input: ')()())',
        output: '4',
        explanation: "The longest valid parentheses substring is '()()' with length 4.",
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction longestValidParentheses(s) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (input === '') return;\n  const result = longestValidParentheses(input);\n  console.log(result);\n}\n\nmain();\n",
      python:
        'import sys\n\ndef longestValidParentheses(s: str):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    line = sys.stdin.read().strip()\n    if not line:\n        return\n    result = longestValidParentheses(line)\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint longestValidParentheses(const string& s) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    string s;\n    if (!(cin >> s)) return 0;\n    auto result = longestValidParentheses(s);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nbool longestValidParentheses(const char* s) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    char s[100005];\n    if (scanf("%100004s", s) != 1) return 0;\n    bool res = longestValidParentheses(s);\n    printf("%s\\n", res ? "true" : "false");\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int longestValidParentheses(String s) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String s = br.readLine();\n        if (s == null) return;\n        var result = longestValidParentheses(s.trim());\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\n// TODO: Implement your solution here\nfunc longestValidParentheses(s string) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\ttext, _ := reader.ReadString(\'\\n\')\n\ts := strings.TrimSpace(text)\n\tif s == "" {\n\t\treturn\n\t}\n\tresult := longestValidParentheses(s)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn longestValidParentheses(s: &str) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let s = buffer.trim();\n    if s.is_empty() {\n        return;\n    }\n    let result = longestValidParentheses(s);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '(()',
        output: '2',
        isHidden: false,
      },
      {
        input: ')()())',
        output: '4',
        isHidden: false,
      },
      {
        input: '',
        output: '0',
        isHidden: true,
      },
      {
        input: '()(()',
        output: '2',
        isHidden: true,
      },
      {
        input: '()(())',
        output: '6',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Sliding Window Maximum',
    slug: 'sliding-window-maximum',
    difficulty: ProblemDifficulty.HARD,
    statement:
      'You are given an array of integers `nums`, there is a sliding window of size `k` which is moving from the very left of the array to the very right. You can only see the `k` numbers in the window. Each time the sliding window moves right by one position.\n\nReturn the max sliding window values as a space-separated string.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing `nums`.\nThe third line contains integer `k`.',
    outputFormat: 'Print the space-separated maximum values for each window position.',
    constraints: '1 <= nums.length <= 10^5\n-10^4 <= nums[i] <= 10^4\n1 <= k <= nums.length',
    tags: ['Arrays', 'Sliding Window', 'Stack and Queue'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '8\n1 3 -1 -3 5 3 6 7\n3',
        output: '3 3 5 5 6 7',
        explanation: 'Windows of size 3 yield maximums [3, 3, 5, 5, 6, 7].',
      },
      {
        input: '1\n1\n1',
        output: '1',
        explanation: 'Single element array with k=1.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction maxSlidingWindow(nums, target) {\n  // TODO: Write your algorithm here\n  return [];\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length < 2 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const target = parseInt(tokens[1 + n], 10);\n  const result = maxSlidingWindow(nums, target);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef maxSlidingWindow(nums, target):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    target = int(tokens[1+n])\n    result = maxSlidingWindow(nums, target)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nvector<int> maxSlidingWindow(const vector<int>& nums, int target) {\n    // TODO: Write code here\n    return {};\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n\n    auto result = maxSlidingWindow(nums, target);\n    for (size_t i = 0; i < result.size(); i++) {\n        cout << result[i] << (i + 1 == result.size() ? "" : " ");\n    }\n    cout << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n\n// TODO: Implement your solution here\nvoid maxSlidingWindow(const int* nums, int n, int target) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n\n    maxSlidingWindow(nums, n, target);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int[] maxSlidingWindow(int[] nums, int target) {\n        // TODO: Write code here\n        return new int[0];\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        int target = Integer.parseInt(st.nextToken());\n\n        int[] result = maxSlidingWindow(nums, target);\n        for (int i = 0; i < result.length; i++) {\n            System.out.print(result[i] + (i + 1 == result.length ? "" : " "));\n        }\n        System.out.println();\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc maxSlidingWindow(nums []int, target int) []int {\n\t// TODO: Write code here\n\treturn []int{}\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\tvar target int\n\tfmt.Fscan(in, &target)\n\n\tresult := maxSlidingWindow(nums, target)\n\tfor i, v := range result {\n\t\tif i > 0 {\n\t\t\tfmt.Print(" ")\n\t\t}\n\t\tfmt.Print(v)\n\t}\n\tfmt.Println()\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn maxSlidingWindow(nums: &[i32], target: i32) -> Vec<i32> {\n    // TODO: Write code here\n    vec![]\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n    let target: i32 = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = maxSlidingWindow(&nums, target);\n    let out = result.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ");\n    println!("{}", out);\n}\n',
    },
    testCases: [
      {
        input: '8\n1 3 -1 -3 5 3 6 7\n3',
        output: '3 3 5 5 6 7',
        isHidden: false,
      },
      {
        input: '1\n1\n1',
        output: '1',
        isHidden: false,
      },
      {
        input: '4\n9 11 8 5\n2',
        output: '11 11 8',
        isHidden: true,
      },
      {
        input: '4\n4 -2 -8 5\n3',
        output: '4 5',
        isHidden: true,
      },
      {
        input: '2\n1 -1\n1',
        output: '1 -1',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Minimum Window Substring',
    slug: 'minimum-window-substring',
    difficulty: ProblemDifficulty.HARD,
    statement:
      'Given two strings `s` and `t` of lengths `m` and `n` respectively, return the minimum window substring of `s` such that every character in `t` (including duplicates) is included in the window. If there is no such substring, return the empty string "".',
    inputFormat: 'A single line containing two space-separated strings `s` and `t`.',
    outputFormat: 'Print the minimum window substring, or empty string if none.',
    constraints:
      'm == s.length\nn == t.length\n1 <= m, n <= 10^5\n`s` and `t` consist of uppercase and lowercase English letters.',
    tags: ['Strings', 'Sliding Window', 'Hash Tables'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: 'ADOBECODEBANC ABC',
        output: 'BANC',
        explanation:
          "The minimum window substring \"BANC\" includes 'A', 'B', and 'C' from string t.",
      },
      {
        input: 'a a',
        output: 'a',
        explanation: 'The entire string s is the minimum window.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction minWindow(s, t) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (tokens.length < 2) return;\n  const result = minWindow(tokens[0], tokens[1]);\n  console.log(result);\n}\n\nmain();\n",
      python:
        'import sys\n\ndef minWindow(s: str, t: str):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if len(tokens) < 2:\n        return\n    result = minWindow(tokens[0], tokens[1])\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nstring minWindow(const string& s, const string& t) {\n    // TODO: Write code here\n    return "";\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    string s, t;\n    if (!(cin >> s >> t)) return 0;\n    auto result = minWindow(s, t);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nbool minWindow(const char* s, const char* t) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    char s[100005], t[100005];\n    if (scanf("%100004s %100004s", s, t) != 2) return 0;\n    bool res = minWindow(s, t);\n    printf("%s\\n", res ? "true" : "false");\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static String minWindow(String s, String t) {\n        // TODO: Write code here\n        return "";\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        if (!st.hasMoreTokens()) return;\n        String s = st.nextToken();\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        String t = st.nextToken();\n        var result = minWindow(s, t);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc minWindow(s, t string) string {\n\t// TODO: Write code here\n\treturn ""\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar s, t string\n\tif _, err := fmt.Fscan(in, &s, &t); err != nil {\n\t\treturn\n\t}\n\tresult := minWindow(s, t)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn minWindow(s: &str, t: &str) -> String {\n    // TODO: Write code here\n    String::new()\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let s = match tokens.next() {\n        Some(v) => v,\n        None => return,\n    };\n    let t = match tokens.next() {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = minWindow(s, t);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: 'ADOBECODEBANC ABC',
        output: 'BANC',
        isHidden: false,
      },
      {
        input: 'a a',
        output: 'a',
        isHidden: false,
      },
      {
        input: 'a aa',
        output: '',
        isHidden: true,
      },
      {
        input: 'ab a',
        output: 'a',
        isHidden: true,
      },
      {
        input: 'cabwefgewcwaefgcf cae',
        output: 'cwae',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Median of Two Sorted Arrays',
    slug: 'median-of-two-sorted-arrays',
    difficulty: ProblemDifficulty.HARD,
    statement:
      'Given two sorted arrays `nums1` and `nums2` of size `m` and `n` respectively, return the median of the two sorted arrays.\n\nThe overall run time complexity should be O(log (m+n)). Format floating point answers to five decimal places.',
    inputFormat:
      'The first line contains integer `m`.\nThe second line contains `m` space-separated integers representing `nums1`.\nThe third line contains integer `n`.\nThe fourth line contains `n` space-separated integers representing `nums2`.',
    outputFormat: 'Print the median formatted to five decimal places.',
    constraints:
      'nums1.length == m\nnums2.length == n\n0 <= m, n <= 1000\n1 <= m + n <= 2000\n-10^6 <= nums1[i], nums2[i] <= 10^6',
    tags: ['Arrays', 'Binary Search'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '2\n1 3\n1\n2',
        output: '2.00000',
        explanation: 'merged array = [1,2,3] and median is 2.0.',
      },
      {
        input: '2\n1 2\n2\n3 4',
        output: '2.50000',
        explanation: 'merged array = [1,2,3,4] and median is (2 + 3) / 2 = 2.5.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction findMedianSortedArrays() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(findMedianSortedArrays());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef findMedianSortedArrays():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(findMedianSortedArrays())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint findMedianSortedArrays() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << findMedianSortedArrays() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint findMedianSortedArrays() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", findMedianSortedArrays());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int findMedianSortedArrays() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(findMedianSortedArrays());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc findMedianSortedArrays() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(findMedianSortedArrays())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn findMedianSortedArrays() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", findMedianSortedArrays());\n}\n',
    },
    testCases: [
      {
        input: '2\n1 3\n1\n2',
        output: '2.00000',
        isHidden: false,
      },
      {
        input: '2\n1 2\n2\n3 4',
        output: '2.50000',
        isHidden: false,
      },
      {
        input: '0\n\n1\n1',
        output: '1.00000',
        isHidden: true,
      },
      {
        input: '2\n0 0\n2\n0 0',
        output: '0.00000',
        isHidden: true,
      },
      {
        input: '2\n1 4\n2\n2 3',
        output: '2.50000',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Merge k Sorted Lists',
    slug: 'merge-k-sorted-lists',
    difficulty: ProblemDifficulty.HARD,
    statement:
      'You are given an array of `k` linked-lists `lists`, each linked-list is sorted in ascending order. Merge all the linked-lists into one sorted linked-list and return it.',
    inputFormat:
      'The first line contains integer `k` (number of lists).\nThe next `k` lines each begin with list length `m`, followed by `m` space-separated integers.',
    outputFormat: 'Print the merged space-separated sorted list values.',
    constraints:
      'k == lists.length\n0 <= k <= 10^4\n0 <= lists[i].length <= 500\n-10^4 <= lists[i][j] <= 10^4\nlists[i] is sorted in ascending order.',
    tags: ['Linked Lists', 'Sorting', 'Stack and Queue'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n3 1 4 5\n3 1 3 4\n2 2 6',
        output: '1 1 2 3 4 4 5 6',
        explanation: 'All 3 sorted lists merged together into one sorted sequence.',
      },
      {
        input: '0',
        output: '',
        explanation: 'Empty list of lists.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction mergeKLists() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(mergeKLists());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef mergeKLists():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(mergeKLists())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint mergeKLists() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << mergeKLists() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint mergeKLists() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", mergeKLists());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int mergeKLists() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(mergeKLists());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc mergeKLists() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(mergeKLists())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn mergeKLists() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", mergeKLists());\n}\n',
    },
    testCases: [
      {
        input: '3\n3 1 4 5\n3 1 3 4\n2 2 6',
        output: '1 1 2 3 4 4 5 6',
        isHidden: false,
      },
      {
        input: '0',
        output: '',
        isHidden: false,
      },
      {
        input: '1\n3 1 2 3',
        output: '1 2 3',
        isHidden: true,
      },
      {
        input: '2\n2 1 5\n2 2 4',
        output: '1 2 4 5',
        isHidden: true,
      },
      {
        input: '3\n1 1\n1 0\n1 2',
        output: '0 1 2',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Largest Rectangle in Histogram',
    slug: 'largest-rectangle-in-histogram',
    difficulty: ProblemDifficulty.HARD,
    statement:
      "Given an array of integers `heights` representing the histogram's bar height where the width of each bar is 1, return the area of the largest rectangle in the histogram.",
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing bar heights.',
    outputFormat: 'Print the maximum rectangle area as an integer.',
    constraints: '1 <= heights.length <= 10^5\n0 <= heights[i] <= 10^4',
    tags: ['Arrays', 'Stack and Queue'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '6\n2 1 5 6 2 3',
        output: '10',
        explanation: 'The largest rectangle has height 5 and width 2 (bars 5 and 6), area = 10.',
      },
      {
        input: '2\n2 4',
        output: '4',
        explanation: 'Area of single bar of height 4 is 4.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction largestRectangleArea(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = largestRectangleArea(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef largestRectangleArea(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = largestRectangleArea(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint largestRectangleArea(vector<int>& nums) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = largestRectangleArea(nums);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid largestRectangleArea(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    largestRectangleArea(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int largestRectangleArea(int[] nums) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = largestRectangleArea(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc largestRectangleArea(nums []int) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := largestRectangleArea(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn largestRectangleArea(nums: &mut [i32]) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = largestRectangleArea(&mut nums);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '6\n2 1 5 6 2 3',
        output: '10',
        isHidden: false,
      },
      {
        input: '2\n2 4',
        output: '4',
        isHidden: false,
      },
      {
        input: '1\n1',
        output: '1',
        isHidden: true,
      },
      {
        input: '5\n1 2 3 4 5',
        output: '9',
        isHidden: true,
      },
      {
        input: '4\n2 1 2 1',
        output: '4',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Binary Tree Maximum Path Sum',
    slug: 'binary-tree-maximum-path-sum',
    difficulty: ProblemDifficulty.HARD,
    statement:
      "A path in a binary tree is a sequence of nodes where each pair of adjacent nodes in the sequence has an edge connecting them. A node can only appear in the sequence at most once. Note that the path does not need to pass through the root.\n\nThe path sum of a path is the sum of the node's values in the path. Given the root of a binary tree in level-order format, return the maximum path sum of any non-empty path.",
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated tokens representing level order node values.',
    outputFormat: 'Print the maximum path sum integer.',
    constraints: '1 <= n <= 3 * 10^4\n-1000 <= Node.val <= 1000',
    tags: ['Trees and Binary Trees', 'Dynamic Programming', 'Recursion and Backtracking'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n1 2 3',
        output: '6',
        explanation: 'The optimal path is 2 -> 1 -> 3 with a path sum of 2 + 1 + 3 = 6.',
      },
      {
        input: '5\n-10 9 20 null null 15 7',
        output: '42',
        explanation: 'The optimal path is 15 -> 20 -> 7 with path sum 15 + 20 + 7 = 42.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction maxPathSum() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(maxPathSum());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef maxPathSum():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(maxPathSum())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint maxPathSum() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << maxPathSum() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint maxPathSum() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", maxPathSum());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int maxPathSum() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(maxPathSum());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc maxPathSum() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(maxPathSum())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn maxPathSum() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", maxPathSum());\n}\n',
    },
    testCases: [
      {
        input: '3\n1 2 3',
        output: '6',
        isHidden: false,
      },
      {
        input: '5\n-10 9 20 null null 15 7',
        output: '42',
        isHidden: false,
      },
      {
        input: '1\n-3',
        output: '-3',
        isHidden: true,
      },
      {
        input: '2\n2 -1',
        output: '2',
        isHidden: true,
      },
      {
        input: '3\n1 -2 3',
        output: '4',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Word Ladder',
    slug: 'word-ladder',
    difficulty: ProblemDifficulty.HARD,
    statement:
      'A transformation sequence from word `beginWord` to word `endWord` using a dictionary `wordList` is a sequence of words `beginWord -> s1 -> s2 -> ... -> sk` such that every adjacent pair differs by a single letter, and all intermediate words are in `wordList`.\n\nGiven two words, `beginWord` and `endWord`, and a dictionary `wordList`, return the number of words in the shortest transformation sequence from `beginWord` to `endWord`, or 0 if no such sequence exists.',
    inputFormat:
      'The first line contains `beginWord` and `endWord` separated by a space.\nThe second line contains integer `k` (dictionary size).\nThe third line contains `k` space-separated words in `wordList`.',
    outputFormat: 'Print the number of words in the shortest sequence, or 0.',
    constraints:
      '1 <= beginWord.length <= 10\nendWord.length == beginWord.length\n1 <= wordList.length <= 5000\nwordList[i].length == beginWord.length\nAll words consist of lowercase English letters.\nAll strings in wordList are unique.',
    tags: ['Strings', 'Graphs', 'Stack and Queue'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: 'hit cog\n6\nhot dot dog lot log cog',
        output: '5',
        explanation: 'One shortest sequence is hit -> hot -> dot -> dog -> cog (5 words).',
      },
      {
        input: 'hit cog\n5\nhot dot dog lot log',
        output: '0',
        explanation: "The endWord 'cog' is not in wordList.",
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction ladderLength() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(ladderLength());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef ladderLength():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(ladderLength())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint ladderLength() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << ladderLength() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint ladderLength() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", ladderLength());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int ladderLength() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(ladderLength());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc ladderLength() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(ladderLength())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn ladderLength() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", ladderLength());\n}\n',
    },
    testCases: [
      {
        input: 'hit cog\n6\nhot dot dog lot log cog',
        output: '5',
        isHidden: false,
      },
      {
        input: 'hit cog\n5\nhot dot dog lot log',
        output: '0',
        isHidden: false,
      },
      {
        input: 'a c\n3\na b c',
        output: '2',
        isHidden: true,
      },
      {
        input: 'hot dog\n2\nhot dog',
        output: '2',
        isHidden: true,
      },
      {
        input: 'qa sq\n4\nqa ca cv sq',
        output: '0',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Edit Distance',
    slug: 'edit-distance',
    difficulty: ProblemDifficulty.HARD,
    statement:
      'Given two strings `word1` and `word2`, return the minimum number of operations required to convert `word1` to `word2`.\n\nYou have the following three operations permitted on a word:\n- Insert a character\n- Delete a character\n- Replace a character',
    inputFormat: 'A single line containing two space-separated strings `word1` and `word2`.',
    outputFormat: 'Print the minimum operations required as an integer.',
    constraints:
      '0 <= word1.length, word2.length <= 500\n`word1` and `word2` consist of lowercase English letters.',
    tags: ['Strings', 'Dynamic Programming'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: 'horse ros',
        output: '3',
        explanation:
          "horse -> rorse (replace 'h' with 'r') -> rose (remove 'r') -> ros (remove 'e').",
      },
      {
        input: 'intention execution',
        output: '5',
        explanation: '5 operations required.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction minDistance(s, t) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (tokens.length < 2) return;\n  const result = minDistance(tokens[0], tokens[1]);\n  console.log(result);\n}\n\nmain();\n",
      python:
        'import sys\n\ndef minDistance(s: str, t: str):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if len(tokens) < 2:\n        return\n    result = minDistance(tokens[0], tokens[1])\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint minDistance(const string& s, const string& t) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    string s, t;\n    if (!(cin >> s >> t)) return 0;\n    auto result = minDistance(s, t);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nbool minDistance(const char* s, const char* t) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    char s[100005], t[100005];\n    if (scanf("%100004s %100004s", s, t) != 2) return 0;\n    bool res = minDistance(s, t);\n    printf("%s\\n", res ? "true" : "false");\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int minDistance(String s, String t) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        if (!st.hasMoreTokens()) return;\n        String s = st.nextToken();\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        String t = st.nextToken();\n        var result = minDistance(s, t);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc minDistance(s, t string) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar s, t string\n\tif _, err := fmt.Fscan(in, &s, &t); err != nil {\n\t\treturn\n\t}\n\tresult := minDistance(s, t)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn minDistance(s: &str, t: &str) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let s = match tokens.next() {\n        Some(v) => v,\n        None => return,\n    };\n    let t = match tokens.next() {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = minDistance(s, t);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: 'horse ros',
        output: '3',
        isHidden: false,
      },
      {
        input: 'intention execution',
        output: '5',
        isHidden: false,
      },
      {
        input: 'a b',
        output: '1',
        isHidden: true,
      },
      {
        input: 'abc abc',
        output: '0',
        isHidden: true,
      },
      {
        input: 'zoologico zoologo',
        output: '2',
        isHidden: true,
      },
    ],
  },
];
