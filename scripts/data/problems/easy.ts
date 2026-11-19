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

export const EASY_PROBLEMS: SeedProblemDef[] = [
  {
    title: 'Two Sum',
    slug: 'two-sum',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Given an array of integers `nums` and an integer `target`, return the 0-based indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice. Return the indices separated by a space in ascending order.',
    inputFormat:
      'The first line contains an integer `n` denoting the number of elements in `nums`.\nThe second line contains `n` space-separated integers representing `nums`.\nThe third line contains a single integer `target`.',
    outputFormat: 'Print the two 0-based indices separated by a single space.',
    constraints:
      '2 <= n <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9\nExactly one valid answer exists.',
    tags: ['Arrays', 'Hash Tables'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4\n2 7 11 15\n9',
        output: '0 1',
        explanation: 'nums[0] + nums[1] == 2 + 7 == 9, so indices 0 and 1 are returned.',
      },
      {
        input: '3\n3 2 4\n6',
        output: '1 2',
        explanation: 'nums[1] + nums[2] == 2 + 4 == 6, so indices 1 and 2 are returned.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction twoSum(nums, target) {\n  // TODO: Write your algorithm here\n  return [];\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length < 2 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const target = parseInt(tokens[1 + n], 10);\n  const result = twoSum(nums, target);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef twoSum(nums, target):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    target = int(tokens[1+n])\n    result = twoSum(nums, target)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nvector<int> twoSum(const vector<int>& nums, int target) {\n    // TODO: Write code here\n    return {};\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n\n    auto result = twoSum(nums, target);\n    for (size_t i = 0; i < result.size(); i++) {\n        cout << result[i] << (i + 1 == result.size() ? "" : " ");\n    }\n    cout << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n\n// TODO: Implement your solution here\nvoid twoSum(const int* nums, int n, int target) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n\n    twoSum(nums, n, target);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int[] twoSum(int[] nums, int target) {\n        // TODO: Write code here\n        return new int[0];\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        int target = Integer.parseInt(st.nextToken());\n\n        int[] result = twoSum(nums, target);\n        for (int i = 0; i < result.length; i++) {\n            System.out.print(result[i] + (i + 1 == result.length ? "" : " "));\n        }\n        System.out.println();\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc twoSum(nums []int, target int) []int {\n\t// TODO: Write code here\n\treturn []int{}\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\tvar target int\n\tfmt.Fscan(in, &target)\n\n\tresult := twoSum(nums, target)\n\tfor i, v := range result {\n\t\tif i > 0 {\n\t\t\tfmt.Print(" ")\n\t\t}\n\t\tfmt.Print(v)\n\t}\n\tfmt.Println()\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn twoSum(nums: &[i32], target: i32) -> Vec<i32> {\n    // TODO: Write code here\n    vec![]\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n    let target: i32 = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = twoSum(&nums, target);\n    let out = result.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ");\n    println!("{}", out);\n}\n',
    },
    testCases: [
      {
        input: '4\n2 7 11 15\n9',
        output: '0 1',
        isHidden: false,
      },
      {
        input: '3\n3 2 4\n6',
        output: '1 2',
        isHidden: false,
      },
      {
        input: '2\n3 3\n6',
        output: '0 1',
        isHidden: true,
      },
      {
        input: '5\n-1 -2 -3 -4 -5\n-8',
        output: '2 4',
        isHidden: true,
      },
      {
        input: '4\n0 4 3 0\n0',
        output: '0 3',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Contains Duplicate',
    slug: 'contains-duplicate',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Given an integer array `nums`, return `true` if any value appears at least twice in the array, and return `false` if every element is distinct.',
    inputFormat:
      'The first line contains an integer `n`.\nThe second line contains `n` space-separated integers representing `nums`.',
    outputFormat: 'Print `true` if the array contains duplicate elements, otherwise print `false`.',
    constraints: '1 <= n <= 10^5\n-10^9 <= nums[i] <= 10^9',
    tags: ['Arrays', 'Hash Tables'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4\n1 2 3 1',
        output: 'true',
        explanation: '1 appears twice in the array.',
      },
      {
        input: '4\n1 2 3 4',
        output: 'false',
        explanation: 'All elements are distinct.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction containsDuplicate(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = containsDuplicate(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef containsDuplicate(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = containsDuplicate(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nbool containsDuplicate(vector<int>& nums) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = containsDuplicate(nums);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid containsDuplicate(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    containsDuplicate(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static boolean containsDuplicate(int[] nums) {\n        // TODO: Write code here\n        return false;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = containsDuplicate(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc containsDuplicate(nums []int) bool {\n\t// TODO: Write code here\n\treturn false\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := containsDuplicate(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn containsDuplicate(nums: &mut [i32]) -> bool {\n    // TODO: Write code here\n    false\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = containsDuplicate(&mut nums);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '4\n1 2 3 1',
        output: 'true',
        isHidden: false,
      },
      {
        input: '4\n1 2 3 4',
        output: 'false',
        isHidden: false,
      },
      {
        input: '10\n1 1 1 3 3 4 3 2 4 2',
        output: 'true',
        isHidden: true,
      },
      {
        input: '1\n99',
        output: 'false',
        isHidden: true,
      },
      {
        input: '5\n10 20 30 40 50',
        output: 'false',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Valid Palindrome',
    slug: 'valid-palindrome',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward.\n\nGiven a string `s`, return `true` if it is a palindrome, or `false` otherwise.',
    inputFormat: 'A single line containing the string `s`.',
    outputFormat: 'Print `true` if `s` is a palindrome, otherwise print `false`.',
    constraints: '1 <= s.length <= 2 * 10^5\n`s` consists only of printable ASCII characters.',
    tags: ['Strings', 'Two Pointers'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
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
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction isPalindrome(s) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (input === '') return;\n  const result = isPalindrome(input);\n  console.log(result);\n}\n\nmain();\n",
      python:
        'import sys\n\ndef isPalindrome(s: str):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    line = sys.stdin.read().strip()\n    if not line:\n        return\n    result = isPalindrome(line)\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nbool isPalindrome(const string& s) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    string s;\n    if (!(cin >> s)) return 0;\n    auto result = isPalindrome(s);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nbool isPalindrome(const char* s) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    char s[100005];\n    if (scanf("%100004s", s) != 1) return 0;\n    bool res = isPalindrome(s);\n    printf("%s\\n", res ? "true" : "false");\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static boolean isPalindrome(String s) {\n        // TODO: Write code here\n        return false;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String s = br.readLine();\n        if (s == null) return;\n        var result = isPalindrome(s.trim());\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\n// TODO: Implement your solution here\nfunc isPalindrome(s string) bool {\n\t// TODO: Write code here\n\treturn false\n}\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\ttext, _ := reader.ReadString(\'\\n\')\n\ts := strings.TrimSpace(text)\n\tif s == "" {\n\t\treturn\n\t}\n\tresult := isPalindrome(s)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn isPalindrome(s: &str) -> bool {\n    // TODO: Write code here\n    false\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let s = buffer.trim();\n    if s.is_empty() {\n        return;\n    }\n    let result = isPalindrome(s);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: 'A man, a plan, a canal: Panama',
        output: 'true',
        isHidden: false,
      },
      {
        input: 'race a car',
        output: 'false',
        isHidden: false,
      },
      {
        input: ' ',
        output: 'true',
        isHidden: true,
      },
      {
        input: '0P',
        output: 'false',
        isHidden: true,
      },
      {
        input: 'ab_a',
        output: 'true',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Reverse String',
    slug: 'reverse-string',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Write a function that reverses a string. The input string is given as an array of characters or single token.',
    inputFormat: 'A single line containing string `s`.',
    outputFormat: 'Print the reversed string.',
    constraints:
      '1 <= s.length <= 10^5\n`s` consists of printable ASCII characters without whitespace.',
    tags: ['Strings', 'Two Pointers'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: 'hello',
        output: 'olleh',
        explanation: "The reverse of 'hello' is 'olleh'.",
      },
      {
        input: 'Hannah',
        output: 'hannaH',
        explanation: "The reverse of 'Hannah' is 'hannaH'.",
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction reverseString(s) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (input === '') return;\n  const result = reverseString(input);\n  console.log(result);\n}\n\nmain();\n",
      python:
        'import sys\n\ndef reverseString(s: str):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    line = sys.stdin.read().strip()\n    if not line:\n        return\n    result = reverseString(line)\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nstring reverseString(const string& s) {\n    // TODO: Write code here\n    return "";\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    string s;\n    if (!(cin >> s)) return 0;\n    auto result = reverseString(s);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nbool reverseString(const char* s) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    char s[100005];\n    if (scanf("%100004s", s) != 1) return 0;\n    bool res = reverseString(s);\n    printf("%s\\n", res ? "true" : "false");\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static String reverseString(String s) {\n        // TODO: Write code here\n        return "";\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String s = br.readLine();\n        if (s == null) return;\n        var result = reverseString(s.trim());\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\n// TODO: Implement your solution here\nfunc reverseString(s string) string {\n\t// TODO: Write code here\n\treturn ""\n}\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\ttext, _ := reader.ReadString(\'\\n\')\n\ts := strings.TrimSpace(text)\n\tif s == "" {\n\t\treturn\n\t}\n\tresult := reverseString(s)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn reverseString(s: &str) -> String {\n    // TODO: Write code here\n    String::new()\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let s = buffer.trim();\n    if s.is_empty() {\n        return;\n    }\n    let result = reverseString(s);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: 'hello',
        output: 'olleh',
        isHidden: false,
      },
      {
        input: 'Hannah',
        output: 'hannaH',
        isHidden: false,
      },
      {
        input: 'a',
        output: 'a',
        isHidden: true,
      },
      {
        input: 'racecar',
        output: 'racecar',
        isHidden: true,
      },
      {
        input: '1234567890',
        output: '0987654321',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Valid Anagram',
    slug: 'valid-anagram',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Given two strings `s` and `t`, return `true` if `t` is an anagram of `s`, and `false` otherwise.\n\nAn anagram is a word formed by rearranging the letters of a different word, typically using all the original letters exactly once.',
    inputFormat: 'A single line with two space-separated lowercase strings `s` and `t`.',
    outputFormat: 'Print `true` if `t` is an anagram of `s`, otherwise `false`.',
    constraints:
      '1 <= s.length, t.length <= 5 * 10^4\n`s` and `t` consist of lowercase English letters.',
    tags: ['Strings', 'Hash Tables'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: 'anagram nagaram',
        output: 'true',
        explanation: "'nagaram' is a permutation of letters in 'anagram'.",
      },
      {
        input: 'rat car',
        output: 'false',
        explanation: "'car' cannot be formed from 'rat'.",
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction isAnagram(s, t) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (tokens.length < 2) return;\n  const result = isAnagram(tokens[0], tokens[1]);\n  console.log(result);\n}\n\nmain();\n",
      python:
        'import sys\n\ndef isAnagram(s: str, t: str):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if len(tokens) < 2:\n        return\n    result = isAnagram(tokens[0], tokens[1])\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nbool isAnagram(const string& s, const string& t) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    string s, t;\n    if (!(cin >> s >> t)) return 0;\n    auto result = isAnagram(s, t);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nbool isAnagram(const char* s, const char* t) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    char s[100005], t[100005];\n    if (scanf("%100004s %100004s", s, t) != 2) return 0;\n    bool res = isAnagram(s, t);\n    printf("%s\\n", res ? "true" : "false");\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static boolean isAnagram(String s, String t) {\n        // TODO: Write code here\n        return false;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        if (!st.hasMoreTokens()) return;\n        String s = st.nextToken();\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        String t = st.nextToken();\n        var result = isAnagram(s, t);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc isAnagram(s, t string) bool {\n\t// TODO: Write code here\n\treturn false\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar s, t string\n\tif _, err := fmt.Fscan(in, &s, &t); err != nil {\n\t\treturn\n\t}\n\tresult := isAnagram(s, t)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn isAnagram(s: &str, t: &str) -> bool {\n    // TODO: Write code here\n    false\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let s = match tokens.next() {\n        Some(v) => v,\n        None => return,\n    };\n    let t = match tokens.next() {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = isAnagram(s, t);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: 'anagram nagaram',
        output: 'true',
        isHidden: false,
      },
      {
        input: 'rat car',
        output: 'false',
        isHidden: false,
      },
      {
        input: 'a a',
        output: 'true',
        isHidden: true,
      },
      {
        input: 'ab a',
        output: 'false',
        isHidden: true,
      },
      {
        input: 'listen silent',
        output: 'true',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Roman to Integer',
    slug: 'roman-to-integer',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Roman numerals are represented by seven different symbols: I (1), V (5), X (10), L (50), C (100), D (500) and M (1000).\n\nGiven a roman numeral `s`, convert it to an integer.',
    inputFormat: 'A single line containing the Roman numeral string `s`.',
    outputFormat: 'Print the integer value of the Roman numeral.',
    constraints:
      "1 <= s.length <= 15\n`s` contains only the characters ('I', 'V', 'X', 'L', 'C', 'D', 'M').\nIt is guaranteed that `s` is a valid roman numeral in the range [1, 3999].",
    tags: ['Strings', 'Hash Tables', 'Mathematics'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: 'III',
        output: '3',
        explanation: 'III = 3.',
      },
      {
        input: 'LVIII',
        output: '58',
        explanation: 'L = 50, V = 5, III = 3.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction romanToInt(s) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (input === '') return;\n  const result = romanToInt(input);\n  console.log(result);\n}\n\nmain();\n",
      python:
        'import sys\n\ndef romanToInt(s: str):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    line = sys.stdin.read().strip()\n    if not line:\n        return\n    result = romanToInt(line)\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint romanToInt(const string& s) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    string s;\n    if (!(cin >> s)) return 0;\n    auto result = romanToInt(s);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nbool romanToInt(const char* s) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    char s[100005];\n    if (scanf("%100004s", s) != 1) return 0;\n    bool res = romanToInt(s);\n    printf("%s\\n", res ? "true" : "false");\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int romanToInt(String s) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String s = br.readLine();\n        if (s == null) return;\n        var result = romanToInt(s.trim());\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\n// TODO: Implement your solution here\nfunc romanToInt(s string) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\ttext, _ := reader.ReadString(\'\\n\')\n\ts := strings.TrimSpace(text)\n\tif s == "" {\n\t\treturn\n\t}\n\tresult := romanToInt(s)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn romanToInt(s: &str) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let s = buffer.trim();\n    if s.is_empty() {\n        return;\n    }\n    let result = romanToInt(s);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: 'III',
        output: '3',
        isHidden: false,
      },
      {
        input: 'LVIII',
        output: '58',
        isHidden: false,
      },
      {
        input: 'MCMXCIV',
        output: '1994',
        isHidden: true,
      },
      {
        input: 'IV',
        output: '4',
        isHidden: true,
      },
      {
        input: 'IX',
        output: '9',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Move Zeroes',
    slug: 'move-zeroes',
    difficulty: ProblemDifficulty.EASY,
    statement:
      "Given an integer array `nums`, move all 0's to the end of it while maintaining the relative order of the non-zero elements.\n\nNote that you must do this in-place without making a copy of the array.",
    inputFormat:
      'The first line contains an integer `n`.\nThe second line contains `n` space-separated integers representing `nums`.',
    outputFormat: 'Print the array after moving zeroes, with space-separated values.',
    constraints: '1 <= n <= 10^4\n-2^31 <= nums[i] <= 2^31 - 1',
    tags: ['Arrays', 'Two Pointers'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '5\n0 1 0 3 12',
        output: '1 3 12 0 0',
        explanation: 'Non-zero elements retain order 1, 3, 12 followed by the two zeroes.',
      },
      {
        input: '1\n0',
        output: '0',
        explanation: 'Single zero stays in place.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction moveZeroes(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = moveZeroes(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef moveZeroes(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = moveZeroes(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nvector<int> moveZeroes(vector<int>& nums) {\n    // TODO: Write code here\n    return {};\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = moveZeroes(nums);\n    for (size_t i = 0; i < result.size(); i++) {\n        cout << result[i] << (i + 1 == result.size() ? "" : " ");\n    }\n    cout << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid moveZeroes(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    moveZeroes(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int[] moveZeroes(int[] nums) {\n        // TODO: Write code here\n        return new int[0];\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = moveZeroes(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc moveZeroes(nums []int) []int {\n\t// TODO: Write code here\n\treturn []int{}\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := moveZeroes(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn moveZeroes(nums: &mut [i32]) -> Vec<i32> {\n    // TODO: Write code here\n    vec![]\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = moveZeroes(&mut nums);\n    let out = result.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ");\n    println!("{}", out);\n}\n',
    },
    testCases: [
      {
        input: '5\n0 1 0 3 12',
        output: '1 3 12 0 0',
        isHidden: false,
      },
      {
        input: '1\n0',
        output: '0',
        isHidden: false,
      },
      {
        input: '3\n0 0 1',
        output: '1 0 0',
        isHidden: true,
      },
      {
        input: '4\n4 2 4 0',
        output: '4 2 4 0',
        isHidden: true,
      },
      {
        input: '6\n1 0 2 0 3 0',
        output: '1 2 3 0 0 0',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Maximum Average Subarray I',
    slug: 'maximum-average-subarray',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'You are given an integer array `nums` consisting of `n` elements, and an integer `k`.\n\nFind a contiguous subarray whose length is equal to `k` that has the maximum average value and return this value formatted to five decimal places.',
    inputFormat:
      'The first line contains two integers `n` and `k`.\nThe second line contains `n` space-separated integers representing `nums`.',
    outputFormat: 'Print the maximum average value rounded to five decimal places.',
    constraints: '1 <= k <= n <= 10^5\n-10^4 <= nums[i] <= 10^4',
    tags: ['Arrays', 'Sliding Window'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '6\n1 12 -5 -6 50 3\n4',
        output: '12.75000',
        explanation: 'Maximum average is (12 - 5 - 6 + 50) / 4 = 51 / 4 = 12.75.',
      },
      {
        input: '1\n5\n1',
        output: '5.00000',
        explanation: 'Single element average is 5.0.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction findMaxAverage(nums, target) {\n  // TODO: Write your algorithm here\n  return [];\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length < 2 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const target = parseInt(tokens[1 + n], 10);\n  const result = findMaxAverage(nums, target);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef findMaxAverage(nums, target):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    target = int(tokens[1+n])\n    result = findMaxAverage(nums, target)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n#include <iomanip>\n\nusing namespace std;\n\n// TODO: Implement your solution here\ndouble findMaxAverage(const vector<int>& nums, int target) {\n    // TODO: Write code here\n    return 0.0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n\n    double result = findMaxAverage(nums, target);\n    cout << fixed << setprecision(5) << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n\n// TODO: Implement your solution here\nvoid findMaxAverage(const int* nums, int n, int target) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n\n    findMaxAverage(nums, n, target);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static double findMaxAverage(int[] nums, int target) {\n        // TODO: Write code here\n        return 0.0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        int target = Integer.parseInt(st.nextToken());\n\n        double result = findMaxAverage(nums, target);\n        System.out.printf(Locale.US, "%.5f\\n", result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc findMaxAverage(nums []int, target int) float64 {\n\t// TODO: Write code here\n\treturn 0.0\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\tvar target int\n\tfmt.Fscan(in, &target)\n\n\tresult := findMaxAverage(nums, target)\n\tfmt.Printf("%.5f\\n", result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn findMaxAverage(nums: &[i32], target: i32) -> f64 {\n    // TODO: Write code here\n    0.0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n    let target: i32 = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = findMaxAverage(&nums, target);\n    println!("{:.5}", result);\n}\n',
    },
    testCases: [
      {
        input: '6\n1 12 -5 -6 50 3\n4',
        output: '12.75000',
        isHidden: false,
      },
      {
        input: '1\n5\n1',
        output: '5.00000',
        isHidden: false,
      },
      {
        input: '4\n0 4 0 3\n1',
        output: '4.00000',
        isHidden: true,
      },
      {
        input: '5\n-1 -2 -3 -4 -5\n2',
        output: '-1.50000',
        isHidden: true,
      },
      {
        input: '3\n10 20 30\n3',
        output: '20.00000',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Binary Search',
    slug: 'binary-search',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Given an array of integers `nums` which is sorted in ascending order, and an integer `target`, write a function to search `target` in `nums`. If `target` exists, then return its index. Otherwise, return -1.\n\nYou must write an algorithm with O(log n) runtime complexity.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing sorted `nums`.\nThe third line contains integer `target`.',
    outputFormat: 'Print the 0-based index of target if found, otherwise -1.',
    constraints:
      '1 <= n <= 10^4\n-10^4 < nums[i], target < 10^4\nAll the integers in `nums` are unique.\n`nums` is sorted in ascending order.',
    tags: ['Arrays', 'Binary Search'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '6\n-1 0 3 5 9 12\n9',
        output: '4',
        explanation: '9 exists in nums and its index is 4.',
      },
      {
        input: '6\n-1 0 3 5 9 12\n2',
        output: '-1',
        explanation: '2 does not exist in nums so return -1.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction search(nums, target) {\n  // TODO: Write your algorithm here\n  return [];\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length < 2 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const target = parseInt(tokens[1 + n], 10);\n  const result = search(nums, target);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef search(nums, target):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    target = int(tokens[1+n])\n    result = search(nums, target)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint search(const vector<int>& nums, int target) {\n    // TODO: Write code here\n    return -1;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n\n    int result = search(nums, target);\n    cout << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n\n// TODO: Implement your solution here\nvoid search(const int* nums, int n, int target) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n\n    search(nums, n, target);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int search(int[] nums, int target) {\n        // TODO: Write code here\n        return -1;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        int target = Integer.parseInt(st.nextToken());\n\n        int result = search(nums, target);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc search(nums []int, target int) int {\n\t// TODO: Write code here\n\treturn -1\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\tvar target int\n\tfmt.Fscan(in, &target)\n\n\tresult := search(nums, target)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn search(nums: &[i32], target: i32) -> i32 {\n    // TODO: Write code here\n    -1\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n    let target: i32 = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = search(&nums, target);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '6\n-1 0 3 5 9 12\n9',
        output: '4',
        isHidden: false,
      },
      {
        input: '6\n-1 0 3 5 9 12\n2',
        output: '-1',
        isHidden: false,
      },
      {
        input: '1\n5\n5',
        output: '0',
        isHidden: true,
      },
      {
        input: '2\n2 5\n2',
        output: '0',
        isHidden: true,
      },
      {
        input: '5\n1 3 5 7 9\n8',
        output: '-1',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Sqrt(x)',
    slug: 'sqrt-x',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Given a non-negative integer `x`, return the square root of `x` rounded down to the nearest integer. The returned integer should be non-negative as well.\n\nYou must not use any built-in exponent function or operator (such as pow(x, 0.5) or x ** 0.5).',
    inputFormat: 'A single line containing the integer `x`.',
    outputFormat: 'Print the integer square root of `x`.',
    constraints: '0 <= x <= 2^31 - 1',
    tags: ['Mathematics', 'Binary Search'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4',
        output: '2',
        explanation: 'The square root of 4 is 2.',
      },
      {
        input: '8',
        output: '2',
        explanation: 'The square root of 8 is 2.82842..., and rounded down to integer is 2.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction mySqrt(n) {\n  // TODO: Write code here\n  return 0;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  const n = parseInt(input, 10);\n  console.log(mySqrt(n));\n}\n\nmain();\n",
      python:
        'import sys\n\ndef mySqrt(n: int):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    line = sys.stdin.read().strip()\n    if not line:\n        return\n    n = int(line)\n    result = mySqrt(n)\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint mySqrt(int n) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    auto result = mySqrt(n);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nint mySqrt(int n) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    printf("%d\\n", mySqrt(n));\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int mySqrt(int n) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        int n = Integer.parseInt(line.trim());\n        System.out.println(mySqrt(n));\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc mySqrt(n int) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tvar n int\n\tif _, err := fmt.Scan(&n); err != nil {\n\t\treturn\n\t}\n\tfmt.Println(mySqrt(n))\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn mySqrt(n: i32) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let n: i32 = match buffer.trim().parse() {\n        Ok(v) => v,\n        Err(_) => return,\n    };\n    println!("{}", mySqrt(n));\n}\n',
    },
    testCases: [
      {
        input: '4',
        output: '2',
        isHidden: false,
      },
      {
        input: '8',
        output: '2',
        isHidden: false,
      },
      {
        input: '0',
        output: '0',
        isHidden: true,
      },
      {
        input: '1',
        output: '1',
        isHidden: true,
      },
      {
        input: '2147395599',
        output: '46339',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Merge Sorted Array',
    slug: 'merge-sorted-array',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'You are given two integer arrays `nums1` and `nums2`, sorted in non-decreasing order. Merge `nums1` and `nums2` into a single array sorted in non-decreasing order.',
    inputFormat:
      'The first line contains integer `m` (length of nums1).\nThe second line contains `m` space-separated integers representing `nums1`.\nThe third line contains integer `n` (length of nums2).\nThe fourth line contains `n` space-separated integers representing `nums2`.',
    outputFormat: 'Print the merged space-separated sorted array.',
    constraints: '0 <= m, n <= 200\n1 <= m + n <= 200\n-10^9 <= nums1[i], nums2[j] <= 10^9',
    tags: ['Arrays', 'Sorting', 'Two Pointers'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n1 2 3\n3\n2 5 6',
        output: '1 2 2 3 5 6',
        explanation: 'Merging [1,2,3] and [2,5,6] yields [1,2,2,3,5,6].',
      },
      {
        input: '1\n1\n0\n',
        output: '1',
        explanation: 'Merging [1] and [] yields [1].',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction mergeSortedArrays() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(mergeSortedArrays());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef mergeSortedArrays():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(mergeSortedArrays())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint mergeSortedArrays() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << mergeSortedArrays() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint mergeSortedArrays() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", mergeSortedArrays());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int mergeSortedArrays() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(mergeSortedArrays());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc mergeSortedArrays() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(mergeSortedArrays())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn mergeSortedArrays() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", mergeSortedArrays());\n}\n',
    },
    testCases: [
      {
        input: '3\n1 2 3\n3\n2 5 6',
        output: '1 2 2 3 5 6',
        isHidden: false,
      },
      {
        input: '1\n1\n0\n',
        output: '1',
        isHidden: false,
      },
      {
        input: '0\n\n1\n1',
        output: '1',
        isHidden: true,
      },
      {
        input: '2\n2 0\n1\n1',
        output: '0 1 2',
        isHidden: true,
      },
      {
        input: '3\n4 5 6\n3\n1 2 3',
        output: '1 2 3 4 5 6',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Palindrome Linked List',
    slug: 'palindrome-linked-list',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Given the head of a singly linked list represented as an array of node values, return `true` if it is a palindrome or `false` otherwise.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing the node values of the linked list.',
    outputFormat: 'Print `true` if the list is a palindrome, otherwise `false`.',
    constraints: '1 <= n <= 10^5\n0 <= Node.val <= 9',
    tags: ['Linked Lists', 'Two Pointers'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4\n1 2 2 1',
        output: 'true',
        explanation: '1 -> 2 -> 2 -> 1 reads the same in both directions.',
      },
      {
        input: '2\n1 2',
        output: 'false',
        explanation: '1 -> 2 is not a palindrome.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction isPalindromeList(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = isPalindromeList(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef isPalindromeList(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = isPalindromeList(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nbool isPalindromeList(vector<int>& nums) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = isPalindromeList(nums);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid isPalindromeList(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    isPalindromeList(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static boolean isPalindromeList(int[] nums) {\n        // TODO: Write code here\n        return false;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = isPalindromeList(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc isPalindromeList(nums []int) bool {\n\t// TODO: Write code here\n\treturn false\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := isPalindromeList(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn isPalindromeList(nums: &mut [i32]) -> bool {\n    // TODO: Write code here\n    false\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = isPalindromeList(&mut nums);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '4\n1 2 2 1',
        output: 'true',
        isHidden: false,
      },
      {
        input: '2\n1 2',
        output: 'false',
        isHidden: false,
      },
      {
        input: '1\n1',
        output: 'true',
        isHidden: true,
      },
      {
        input: '5\n1 2 3 2 1',
        output: 'true',
        isHidden: true,
      },
      {
        input: '3\n1 2 3',
        output: 'false',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Valid Parentheses',
    slug: 'valid-parentheses',
    difficulty: ProblemDifficulty.EASY,
    statement:
      "Given a string `s` containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.",
    inputFormat: 'A single line containing the bracket string `s`.',
    outputFormat: 'Print `true` if valid, otherwise `false`.',
    constraints: "1 <= s.length <= 10^4\n`s` consists of parentheses only '()[]{}'.",
    tags: ['Strings', 'Stack and Queue'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '()',
        output: 'true',
        explanation: 'A single pair of matching parentheses is valid.',
      },
      {
        input: '()[]{}',
        output: 'true',
        explanation: 'Multiple valid sequential matching pairs.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction isValid(s) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (input === '') return;\n  const result = isValid(input);\n  console.log(result);\n}\n\nmain();\n",
      python:
        'import sys\n\ndef isValid(s: str):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    line = sys.stdin.read().strip()\n    if not line:\n        return\n    result = isValid(line)\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nbool isValid(const string& s) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    string s;\n    if (!(cin >> s)) return 0;\n    auto result = isValid(s);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nbool isValid(const char* s) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    char s[100005];\n    if (scanf("%100004s", s) != 1) return 0;\n    bool res = isValid(s);\n    printf("%s\\n", res ? "true" : "false");\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static boolean isValid(String s) {\n        // TODO: Write code here\n        return false;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String s = br.readLine();\n        if (s == null) return;\n        var result = isValid(s.trim());\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\n// TODO: Implement your solution here\nfunc isValid(s string) bool {\n\t// TODO: Write code here\n\treturn false\n}\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\ttext, _ := reader.ReadString(\'\\n\')\n\ts := strings.TrimSpace(text)\n\tif s == "" {\n\t\treturn\n\t}\n\tresult := isValid(s)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn isValid(s: &str) -> bool {\n    // TODO: Write code here\n    false\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let s = buffer.trim();\n    if s.is_empty() {\n        return;\n    }\n    let result = isValid(s);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '()',
        output: 'true',
        isHidden: false,
      },
      {
        input: '()[]{}',
        output: 'true',
        isHidden: false,
      },
      {
        input: '(]',
        output: 'false',
        isHidden: true,
      },
      {
        input: '([)]',
        output: 'false',
        isHidden: true,
      },
      {
        input: '{[]}',
        output: 'true',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Maximum Depth of Binary Tree',
    slug: 'maximum-depth-of-binary-tree',
    difficulty: ProblemDifficulty.EASY,
    statement:
      "Given the root of a binary tree given in level-order traversal format ('null' for missing nodes), return its maximum depth.\n\nA binary tree's maximum depth is the number of nodes along the longest path from the root node down to the farthest leaf node.",
    inputFormat:
      "The first line contains integer `n`.\nThe second line contains `n` space-separated tokens representing the level order traversal values (integers or 'null').",
    outputFormat: 'Print the maximum depth as a single integer.',
    constraints: '0 <= n <= 10^4\n-100 <= Node.val <= 100',
    tags: ['Trees and Binary Trees', 'Recursion and Backtracking'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '5\n3 9 20 null 15',
        output: '3',
        explanation:
          'Root 3 has left child 9 and right child 20 (which has child 15), yielding depth 3.',
      },
      {
        input: '2\n1 null',
        output: '1',
        explanation: 'Only root exists, depth is 1.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction maxDepth() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(maxDepth());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef maxDepth():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(maxDepth())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint maxDepth() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << maxDepth() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint maxDepth() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", maxDepth());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int maxDepth() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(maxDepth());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc maxDepth() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(maxDepth())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn maxDepth() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", maxDepth());\n}\n',
    },
    testCases: [
      {
        input: '5\n3 9 20 null 15',
        output: '3',
        isHidden: false,
      },
      {
        input: '2\n1 null',
        output: '1',
        isHidden: false,
      },
      {
        input: '0\n',
        output: '0',
        isHidden: true,
      },
      {
        input: '1\n1',
        output: '1',
        isHidden: true,
      },
      {
        input: '7\n1 2 3 4 5 6 7',
        output: '3',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Find Center of Star Graph',
    slug: 'find-center-of-star-graph',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'There is an undirected star graph consisting of `n` nodes labeled from 1 to `n`. A star graph is a graph where there is one center node and exactly `n - 1` edges that connect the center node with every other node.\n\nYou are given a 2D integer array `edges` where each `edges[i] = [u, v]` indicates that there is an edge between the nodes `u` and `v`. Return the center of the given star graph.',
    inputFormat:
      'The first line contains integer `m` (number of edges).\nThe next `m` lines each contain two integers `u` and `v`.',
    outputFormat: 'Print the center node integer.',
    constraints:
      '3 <= n <= 10^5\nedges.length == n - 1\nedges[i].length == 2\n1 <= ui, vi <= n\nui != vi',
    tags: ['Graphs'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n1 2\n2 3\n4 2',
        output: '2',
        explanation: 'Node 2 is connected to every other node, so 2 is the center.',
      },
      {
        input: '4\n1 2\n5 1\n1 3\n1 4',
        output: '1',
        explanation: 'Node 1 is connected to all other nodes.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction findCenter() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(findCenter());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef findCenter():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(findCenter())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint findCenter() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << findCenter() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint findCenter() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", findCenter());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int findCenter() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(findCenter());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc findCenter() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(findCenter())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn findCenter() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", findCenter());\n}\n',
    },
    testCases: [
      {
        input: '3\n1 2\n2 3\n4 2',
        output: '2',
        isHidden: false,
      },
      {
        input: '4\n1 2\n5 1\n1 3\n1 4',
        output: '1',
        isHidden: false,
      },
      {
        input: '3\n1 3\n2 3\n4 3',
        output: '3',
        isHidden: true,
      },
      {
        input: '3\n4 1\n4 2\n4 3',
        output: '4',
        isHidden: true,
      },
      {
        input: '5\n6 1\n6 2\n6 3\n6 4\n6 5',
        output: '6',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Power of Two',
    slug: 'power-of-two',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Given an integer `n`, return `true` if it is a power of two. Otherwise, return `false`.\n\nAn integer `n` is a power of two, if there exists an integer `x` such that n == 2^x.',
    inputFormat: 'A single line containing the integer `n`.',
    outputFormat: 'Print `true` if `n` is a power of two, otherwise `false`.',
    constraints: '-2^31 <= n <= 2^31 - 1',
    tags: ['Mathematics', 'Recursion and Backtracking'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '1',
        output: 'true',
        explanation: '2^0 = 1.',
      },
      {
        input: '16',
        output: 'true',
        explanation: '2^4 = 16.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction isPowerOfTwo(n) {\n  // TODO: Write code here\n  return 0;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  const n = parseInt(input, 10);\n  console.log(isPowerOfTwo(n));\n}\n\nmain();\n",
      python:
        'import sys\n\ndef isPowerOfTwo(n: int):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    line = sys.stdin.read().strip()\n    if not line:\n        return\n    n = int(line)\n    result = isPowerOfTwo(n)\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nbool isPowerOfTwo(int n) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    auto result = isPowerOfTwo(n);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nint isPowerOfTwo(int n) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    printf("%d\\n", isPowerOfTwo(n));\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static boolean isPowerOfTwo(int n) {\n        // TODO: Write code here\n        return false;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        int n = Integer.parseInt(line.trim());\n        System.out.println(isPowerOfTwo(n));\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc isPowerOfTwo(n int) bool {\n\t// TODO: Write code here\n\treturn false\n}\n\nfunc main() {\n\tvar n int\n\tif _, err := fmt.Scan(&n); err != nil {\n\t\treturn\n\t}\n\tfmt.Println(isPowerOfTwo(n))\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn isPowerOfTwo(n: i32) -> bool {\n    // TODO: Write code here\n    false\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let n: i32 = match buffer.trim().parse() {\n        Ok(v) => v,\n        Err(_) => return,\n    };\n    println!("{}", isPowerOfTwo(n));\n}\n',
    },
    testCases: [
      {
        input: '1',
        output: 'true',
        isHidden: false,
      },
      {
        input: '16',
        output: 'true',
        isHidden: false,
      },
      {
        input: '3',
        output: 'false',
        isHidden: true,
      },
      {
        input: '0',
        output: 'false',
        isHidden: true,
      },
      {
        input: '-16',
        output: 'false',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Best Time to Buy and Sell Stock',
    slug: 'best-time-to-buy-and-sell-stock',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'You are given an array `prices` where `prices[i]` is the price of a given stock on the `i`-th day.\n\nYou want to maximize your profit by choosing a single day to buy one stock and choosing a different day in the future to sell that stock.\n\nReturn the maximum profit you can achieve from this transaction. If you cannot achieve any profit, return 0.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing daily prices.',
    outputFormat: 'Print the maximum profit integer.',
    constraints: '1 <= n <= 10^5\n0 <= prices[i] <= 10^4',
    tags: ['Arrays', 'Greedy Algorithms'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '6\n7 1 5 3 6 4',
        output: '5',
        explanation: 'Buy on day 2 (price = 1) and sell on day 5 (price = 6), profit = 6 - 1 = 5.',
      },
      {
        input: '5\n7 6 4 3 1',
        output: '0',
        explanation: 'In this case, no transactions are done and the max profit = 0.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction maxProfit(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = maxProfit(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef maxProfit(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = maxProfit(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint maxProfit(vector<int>& nums) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = maxProfit(nums);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid maxProfit(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    maxProfit(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int maxProfit(int[] nums) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = maxProfit(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc maxProfit(nums []int) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := maxProfit(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn maxProfit(nums: &mut [i32]) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = maxProfit(&mut nums);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '6\n7 1 5 3 6 4',
        output: '5',
        isHidden: false,
      },
      {
        input: '5\n7 6 4 3 1',
        output: '0',
        isHidden: false,
      },
      {
        input: '2\n2 4',
        output: '2',
        isHidden: true,
      },
      {
        input: '1\n10',
        output: '0',
        isHidden: true,
      },
      {
        input: '5\n1 2 3 4 5',
        output: '4',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Climbing Stairs',
    slug: 'climbing-stairs',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'You are climbing a staircase. It takes `n` steps to reach the top.\n\nEach time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?',
    inputFormat: 'A single line containing the integer `n`.',
    outputFormat: 'Print the number of distinct ways to reach the top.',
    constraints: '1 <= n <= 45',
    tags: ['Dynamic Programming', 'Mathematics'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '2',
        output: '2',
        explanation: 'There are two ways: 1 step + 1 step, or 2 steps.',
      },
      {
        input: '3',
        output: '3',
        explanation: 'Three ways: (1+1+1), (1+2), (2+1).',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction climbStairs(n) {\n  // TODO: Write code here\n  return 0;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  const n = parseInt(input, 10);\n  console.log(climbStairs(n));\n}\n\nmain();\n",
      python:
        'import sys\n\ndef climbStairs(n: int):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    line = sys.stdin.read().strip()\n    if not line:\n        return\n    n = int(line)\n    result = climbStairs(n)\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint climbStairs(int n) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    auto result = climbStairs(n);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nint climbStairs(int n) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    printf("%d\\n", climbStairs(n));\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int climbStairs(int n) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        int n = Integer.parseInt(line.trim());\n        System.out.println(climbStairs(n));\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc climbStairs(n int) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tvar n int\n\tif _, err := fmt.Scan(&n); err != nil {\n\t\treturn\n\t}\n\tfmt.Println(climbStairs(n))\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn climbStairs(n: i32) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let n: i32 = match buffer.trim().parse() {\n        Ok(v) => v,\n        Err(_) => return,\n    };\n    println!("{}", climbStairs(n));\n}\n',
    },
    testCases: [
      {
        input: '2',
        output: '2',
        isHidden: false,
      },
      {
        input: '3',
        output: '3',
        isHidden: false,
      },
      {
        input: '1',
        output: '1',
        isHidden: true,
      },
      {
        input: '4',
        output: '5',
        isHidden: true,
      },
      {
        input: '5',
        output: '8',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Missing Number',
    slug: 'missing-number',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Given an array `nums` containing `n` distinct numbers in the range `[0, n]`, return the only number in the range that is missing from the array.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers.',
    outputFormat: 'Print the missing number.',
    constraints:
      'n == nums.length\n1 <= n <= 10^4\n0 <= nums[i] <= n\nAll the numbers of `nums` are unique.',
    tags: ['Arrays', 'Hash Tables', 'Mathematics'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n3 0 1',
        output: '2',
        explanation:
          'n = 3 since there are 3 numbers, so all numbers are in the range [0,3]. 2 is the missing number.',
      },
      {
        input: '2\n0 1',
        output: '2',
        explanation: 'n = 2, [0,2] range is missing 2.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction missingNumber(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = missingNumber(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef missingNumber(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = missingNumber(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint missingNumber(vector<int>& nums) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = missingNumber(nums);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid missingNumber(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    missingNumber(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int missingNumber(int[] nums) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = missingNumber(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc missingNumber(nums []int) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := missingNumber(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn missingNumber(nums: &mut [i32]) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = missingNumber(&mut nums);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '3\n3 0 1',
        output: '2',
        isHidden: false,
      },
      {
        input: '2\n0 1',
        output: '2',
        isHidden: false,
      },
      {
        input: '9\n9 6 4 2 3 5 7 0 1',
        output: '8',
        isHidden: true,
      },
      {
        input: '1\n0',
        output: '1',
        isHidden: true,
      },
      {
        input: '1\n1',
        output: '0',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Single Number',
    slug: 'single-number',
    difficulty: ProblemDifficulty.EASY,
    statement:
      'Given a non-empty array of integers `nums`, every element appears twice except for one. Find that single one.\n\nYou must implement a solution with a linear runtime complexity and use only constant extra space.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers.',
    outputFormat: 'Print the single number that appears only once.',
    constraints:
      '1 <= n <= 3 * 10^4\n-3 * 10^4 <= nums[i] <= 3 * 10^4\nEach element in the array appears twice except for one element which appears only once.',
    tags: ['Arrays', 'Mathematics'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n2 2 1',
        output: '1',
        explanation: '1 appears only once.',
      },
      {
        input: '5\n4 1 2 1 2',
        output: '4',
        explanation: '4 appears once, 1 and 2 appear twice.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction singleNumber(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = singleNumber(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef singleNumber(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = singleNumber(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint singleNumber(vector<int>& nums) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = singleNumber(nums);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid singleNumber(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    singleNumber(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int singleNumber(int[] nums) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = singleNumber(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc singleNumber(nums []int) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := singleNumber(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn singleNumber(nums: &mut [i32]) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = singleNumber(&mut nums);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '3\n2 2 1',
        output: '1',
        isHidden: false,
      },
      {
        input: '5\n4 1 2 1 2',
        output: '4',
        isHidden: false,
      },
      {
        input: '1\n1',
        output: '1',
        isHidden: true,
      },
      {
        input: '3\n-1 -1 -2',
        output: '-2',
        isHidden: true,
      },
      {
        input: '7\n10 20 30 10 30 20 5',
        output: '5',
        isHidden: true,
      },
    ],
  },
];
