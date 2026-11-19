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

export const MEDIUM_PROBLEMS: SeedProblemDef[] = [
  {
    title: 'Product of Array Except Self',
    slug: 'product-of-array-except-self',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an integer array `nums`, return an array `answer` such that `answer[i]` is equal to the product of all the elements of `nums` except `nums[i]`.\n\nThe product of any prefix or suffix of `nums` is guaranteed to fit in a 32-bit integer.\n\nYou must write an algorithm that runs in O(n) time and without using the division operation.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing `nums`.',
    outputFormat: 'Print the space-separated output integers.',
    constraints:
      '2 <= n <= 10^5\n-30 <= nums[i] <= 30\nThe product of any prefix or suffix is guaranteed to fit in a 32-bit integer.',
    tags: ['Arrays', 'Dynamic Programming'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4\n1 2 3 4',
        output: '24 12 8 6',
        explanation: 'answer[0] = 2*3*4 = 24, answer[1] = 1*3*4 = 12, etc.',
      },
      {
        input: '5\n-1 1 0 -3 3',
        output: '0 0 9 0 0',
        explanation: 'Zero element leaves non-zero product only at its own index.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction productExceptSelf(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = productExceptSelf(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef productExceptSelf(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = productExceptSelf(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nvector<int> productExceptSelf(vector<int>& nums) {\n    // TODO: Write code here\n    return {};\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = productExceptSelf(nums);\n    for (size_t i = 0; i < result.size(); i++) {\n        cout << result[i] << (i + 1 == result.size() ? "" : " ");\n    }\n    cout << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid productExceptSelf(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    productExceptSelf(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int[] productExceptSelf(int[] nums) {\n        // TODO: Write code here\n        return new int[0];\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = productExceptSelf(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc productExceptSelf(nums []int) []int {\n\t// TODO: Write code here\n\treturn []int{}\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := productExceptSelf(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn productExceptSelf(nums: &mut [i32]) -> Vec<i32> {\n    // TODO: Write code here\n    vec![]\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = productExceptSelf(&mut nums);\n    let out = result.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ");\n    println!("{}", out);\n}\n',
    },
    testCases: [
      {
        input: '4\n1 2 3 4',
        output: '24 12 8 6',
        isHidden: false,
      },
      {
        input: '5\n-1 1 0 -3 3',
        output: '0 0 9 0 0',
        isHidden: false,
      },
      {
        input: '2\n2 3',
        output: '3 2',
        isHidden: true,
      },
      {
        input: '3\n0 0 2',
        output: '0 0 0',
        isHidden: true,
      },
      {
        input: '5\n1 1 1 1 1',
        output: '1 1 1 1 1',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Group Anagrams',
    slug: 'group-anagrams',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an array of strings `strs`, group the anagrams together. You can return the answer in any order, with groups printed line by line, sorted alphabetically within each group.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated strings.',
    outputFormat: 'Print each group of anagrams on a new line with space-separated sorted words.',
    constraints:
      '1 <= n <= 10^4\n0 <= strs[i].length <= 100\n`strs[i]` consists of lowercase English letters.',
    tags: ['Strings', 'Hash Tables', 'Sorting'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '6\neat tea tan ate nat bat',
        output: 'bat\nnat tan\nate eat tea',
        explanation: 'Words sharing the same multiset of characters are grouped together.',
      },
      {
        input: '1\na',
        output: 'a',
        explanation: 'Single word group.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction groupAnagrams() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(groupAnagrams());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef groupAnagrams():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(groupAnagrams())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint groupAnagrams() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << groupAnagrams() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint groupAnagrams() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", groupAnagrams());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int groupAnagrams() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(groupAnagrams());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc groupAnagrams() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(groupAnagrams())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn groupAnagrams() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", groupAnagrams());\n}\n',
    },
    testCases: [
      {
        input: '6\neat tea tan ate nat bat',
        output: 'bat\nnat tan\nate eat tea',
        isHidden: false,
      },
      {
        input: '1\na',
        output: 'a',
        isHidden: false,
      },
      {
        input: '2\nab ba',
        output: 'ab ba',
        isHidden: true,
      },
      {
        input: '3\na b c',
        output: 'a\nb\nc',
        isHidden: true,
      },
      {
        input: '4\nstop tops pots spot',
        output: 'pots spot stop tops',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Subarray Sum Equals K',
    slug: 'subarray-sum-equals-k',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an array of integers `nums` and an integer `k`, return the total number of subarrays whose sum equals to `k`.\n\nA subarray is a contiguous non-empty sequence of elements within an array.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing `nums`.\nThe third line contains integer `k`.',
    outputFormat: 'Print the total count of subarrays summing to `k`.',
    constraints: '1 <= n <= 2 * 10^4\n-1000 <= nums[i] <= 1000\n-10^7 <= k <= 10^7',
    tags: ['Arrays', 'Hash Tables'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n1 1 1\n2',
        output: '2',
        explanation: 'Subarrays [1,1] at indices [0,1] and [1,2] both sum to 2.',
      },
      {
        input: '3\n1 2 3\n3',
        output: '2',
        explanation: 'Subarrays [1,2] and [3] both sum to 3.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction subarraySum(nums, target) {\n  // TODO: Write your algorithm here\n  return [];\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length < 2 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const target = parseInt(tokens[1 + n], 10);\n  const result = subarraySum(nums, target);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef subarraySum(nums, target):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    target = int(tokens[1+n])\n    result = subarraySum(nums, target)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint subarraySum(const vector<int>& nums, int target) {\n    // TODO: Write code here\n    return -1;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n\n    int result = subarraySum(nums, target);\n    cout << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n\n// TODO: Implement your solution here\nvoid subarraySum(const int* nums, int n, int target) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n\n    subarraySum(nums, n, target);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int subarraySum(int[] nums, int target) {\n        // TODO: Write code here\n        return -1;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        int target = Integer.parseInt(st.nextToken());\n\n        int result = subarraySum(nums, target);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc subarraySum(nums []int, target int) int {\n\t// TODO: Write code here\n\treturn -1\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\tvar target int\n\tfmt.Fscan(in, &target)\n\n\tresult := subarraySum(nums, target)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn subarraySum(nums: &[i32], target: i32) -> i32 {\n    // TODO: Write code here\n    -1\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n    let target: i32 = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = subarraySum(&nums, target);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '3\n1 1 1\n2',
        output: '2',
        isHidden: false,
      },
      {
        input: '3\n1 2 3\n3',
        output: '2',
        isHidden: false,
      },
      {
        input: '4\n1 -1 0 0\n0',
        output: '6',
        isHidden: true,
      },
      {
        input: '1\n0\n0',
        output: '1',
        isHidden: true,
      },
      {
        input: '5\n3 4 7 2 -3\n7',
        output: '4',
        isHidden: true,
      },
    ],
  },
  {
    title: '3Sum',
    slug: 'three-sum',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an integer array `nums`, return all the triplets `[nums[i], nums[j], nums[k]]` such that `i != j`, `i != k`, and `j != k`, and `nums[i] + nums[j] + nums[k] == 0`.\n\nNotice that the solution set must not contain duplicate triplets. Print each triplet on a new line in sorted order.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers.',
    outputFormat:
      'Print each unique triplet on a new line with space-separated values, sorted in ascending order. If none exist, output nothing.',
    constraints: '3 <= n <= 3000\n-10^5 <= nums[i] <= 10^5',
    tags: ['Arrays', 'Two Pointers', 'Sorting'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '6\n-1 0 1 2 -1 -4',
        output: '-1 -1 2\n-1 0 1',
        explanation: 'Triplets (-1, -1, 2) and (-1, 0, 1) both sum to 0.',
      },
      {
        input: '3\n0 1 1',
        output: '',
        explanation: 'No triplet sums to 0.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction threeSum(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = threeSum(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef threeSum(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = threeSum(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nvector<vector<int>> threeSum(vector<int>& nums) {\n    // TODO: Write code here\n    return {};\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = threeSum(nums);\n    for (const auto& row : result) {\n        for (size_t i = 0; i < row.size(); i++) {\n            cout << row[i] << (i + 1 == row.size() ? "" : " ");\n        }\n        cout << "\\n";\n    }\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid threeSum(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    threeSum(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static List<List<Integer>> threeSum(int[] nums) {\n        // TODO: Write code here\n        return new ArrayList<>();\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = threeSum(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc threeSum(nums []int) [][]int {\n\t// TODO: Write code here\n\treturn [][]int{}\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := threeSum(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn threeSum(nums: &mut [i32]) -> Vec<Vec<i32>> {\n    // TODO: Write code here\n    vec![]\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = threeSum(&mut nums);\n    for row in result {\n        let out = row.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ");\n        println!("{}", out);\n    }\n}\n',
    },
    testCases: [
      {
        input: '6\n-1 0 1 2 -1 -4',
        output: '-1 -1 2\n-1 0 1',
        isHidden: false,
      },
      {
        input: '3\n0 1 1',
        output: '',
        isHidden: false,
      },
      {
        input: '3\n0 0 0',
        output: '0 0 0',
        isHidden: true,
      },
      {
        input: '4\n-2 0 1 1',
        output: '-2 1 1',
        isHidden: true,
      },
      {
        input: '5\n-4 -2 1 2 3',
        output: '-4 1 3\n-2 -1 3',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Container With Most Water',
    slug: 'container-with-most-water',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'You are given an integer array `height` of length `n`. There are `n` vertical lines drawn such that the two endpoints of the `i`-th line are `(i, 0)` and `(i, height[i])`.\n\nFind two lines that together with the x-axis form a container, such that the container contains the most water. Return the maximum amount of water a container can store.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing `height`.',
    outputFormat: 'Print the maximum area as an integer.',
    constraints: '2 <= n <= 10^5\n0 <= height[i] <= 10^4',
    tags: ['Arrays', 'Two Pointers', 'Greedy Algorithms'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '9\n1 8 6 2 5 4 8 3 7',
        output: '49',
        explanation:
          'The lines are at index 1 (height 8) and index 8 (height 7). Distance = 7, min height = 7, area = 7 * 7 = 49.',
      },
      {
        input: '2\n1 1',
        output: '1',
        explanation: 'Distance = 1, height = 1, area = 1.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction maxArea(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = maxArea(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef maxArea(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = maxArea(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint maxArea(vector<int>& nums) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = maxArea(nums);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid maxArea(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    maxArea(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int maxArea(int[] nums) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = maxArea(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc maxArea(nums []int) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := maxArea(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn maxArea(nums: &mut [i32]) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = maxArea(&mut nums);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '9\n1 8 6 2 5 4 8 3 7',
        output: '49',
        isHidden: false,
      },
      {
        input: '2\n1 1',
        output: '1',
        isHidden: false,
      },
      {
        input: '4\n4 3 2 1 4',
        output: '16',
        isHidden: true,
      },
      {
        input: '2\n1 2',
        output: '1',
        isHidden: true,
      },
      {
        input: '5\n2 3 4 5 18 17 6',
        output: '17',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Longest Substring Without Repeating Characters',
    slug: 'longest-substring-without-repeating-characters',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given a string `s`, find the length of the longest substring without repeating characters.',
    inputFormat: 'A single line containing the string `s`.',
    outputFormat: 'Print the maximum substring length as an integer.',
    constraints:
      '0 <= s.length <= 5 * 10^4\n`s` consists of English letters, digits, symbols and spaces.',
    tags: ['Strings', 'Sliding Window', 'Hash Tables'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: 'abcabcbb',
        output: '3',
        explanation: "The answer is 'abc', with length 3.",
      },
      {
        input: 'bbbbb',
        output: '1',
        explanation: "The answer is 'b', with length 1.",
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction lengthOfLongestSubstring(s) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (input === '') return;\n  const result = lengthOfLongestSubstring(input);\n  console.log(result);\n}\n\nmain();\n",
      python:
        'import sys\n\ndef lengthOfLongestSubstring(s: str):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    line = sys.stdin.read().strip()\n    if not line:\n        return\n    result = lengthOfLongestSubstring(line)\n    if isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <string>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint lengthOfLongestSubstring(const string& s) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    string s;\n    if (!(cin >> s)) return 0;\n    auto result = lengthOfLongestSubstring(s);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nbool lengthOfLongestSubstring(const char* s) {\n    // TODO: Write code here\n    return false;\n}\n\nint main() {\n    char s[100005];\n    if (scanf("%100004s", s) != 1) return 0;\n    bool res = lengthOfLongestSubstring(s);\n    printf("%s\\n", res ? "true" : "false");\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int lengthOfLongestSubstring(String s) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String s = br.readLine();\n        if (s == null) return;\n        var result = lengthOfLongestSubstring(s.trim());\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\n// TODO: Implement your solution here\nfunc lengthOfLongestSubstring(s string) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\ttext, _ := reader.ReadString(\'\\n\')\n\ts := strings.TrimSpace(text)\n\tif s == "" {\n\t\treturn\n\t}\n\tresult := lengthOfLongestSubstring(s)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn lengthOfLongestSubstring(s: &str) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let s = buffer.trim();\n    if s.is_empty() {\n        return;\n    }\n    let result = lengthOfLongestSubstring(s);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: 'abcabcbb',
        output: '3',
        isHidden: false,
      },
      {
        input: 'bbbbb',
        output: '1',
        isHidden: false,
      },
      {
        input: 'pwwkew',
        output: '3',
        isHidden: true,
      },
      {
        input: ' ',
        output: '1',
        isHidden: true,
      },
      {
        input: 'au',
        output: '2',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Minimum Size Subarray Sum',
    slug: 'minimum-size-subarray-sum',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an array of positive integers `nums` and a positive integer `target`, return the minimal length of a subarray whose sum is greater than or equal to `target`. If there is no such subarray, return 0 instead.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated positive integers.\nThe third line contains integer `target`.',
    outputFormat: 'Print the minimal length integer, or 0 if none exists.',
    constraints: '1 <= target <= 10^9\n1 <= n <= 10^5\n1 <= nums[i] <= 10^4',
    tags: ['Arrays', 'Sliding Window', 'Two Pointers'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '6\n2 3 1 2 4 3\n7',
        output: '2',
        explanation: 'The subarray [4,3] has minimal length 2 under the problem constraint.',
      },
      {
        input: '3\n1 4 4\n4',
        output: '1',
        explanation: 'Subarray [4] has length 1.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction minSubArrayLen(nums, target) {\n  // TODO: Write your algorithm here\n  return [];\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length < 2 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const target = parseInt(tokens[1 + n], 10);\n  const result = minSubArrayLen(nums, target);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef minSubArrayLen(nums, target):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    target = int(tokens[1+n])\n    result = minSubArrayLen(nums, target)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint minSubArrayLen(const vector<int>& nums, int target) {\n    // TODO: Write code here\n    return -1;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n\n    int result = minSubArrayLen(nums, target);\n    cout << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n\n// TODO: Implement your solution here\nvoid minSubArrayLen(const int* nums, int n, int target) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n\n    minSubArrayLen(nums, n, target);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int minSubArrayLen(int[] nums, int target) {\n        // TODO: Write code here\n        return -1;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        int target = Integer.parseInt(st.nextToken());\n\n        int result = minSubArrayLen(nums, target);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc minSubArrayLen(nums []int, target int) int {\n\t// TODO: Write code here\n\treturn -1\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\tvar target int\n\tfmt.Fscan(in, &target)\n\n\tresult := minSubArrayLen(nums, target)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn minSubArrayLen(nums: &[i32], target: i32) -> i32 {\n    // TODO: Write code here\n    -1\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n    let target: i32 = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = minSubArrayLen(&nums, target);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '6\n2 3 1 2 4 3\n7',
        output: '2',
        isHidden: false,
      },
      {
        input: '3\n1 4 4\n4',
        output: '1',
        isHidden: false,
      },
      {
        input: '5\n1 1 1 1 1\n11',
        output: '0',
        isHidden: true,
      },
      {
        input: '5\n1 2 3 4 5\n15',
        output: '5',
        isHidden: true,
      },
      {
        input: '4\n1 2 3 4\n3',
        output: '1',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Search in Rotated Sorted Array',
    slug: 'search-in-rotated-sorted-array',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'There is an integer array `nums` sorted in ascending order (with distinct values).\n\nPrior to being passed to your function, `nums` is possibly rotated at an unknown pivot index `k` (`1 <= k < nums.length`).\n\nGiven the array `nums` after the possible rotation and an integer `target`, return the 0-based index of `target` if it is in `nums`, or -1 if it is not in `nums`.\n\nYou must write an algorithm with O(log n) runtime complexity.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing rotated `nums`.\nThe third line contains integer `target`.',
    outputFormat: 'Print the 0-based index of target if found, otherwise -1.',
    constraints:
      '1 <= n <= 5000\n-10^4 <= nums[i] <= 10^4\nAll values of `nums` are unique.\n`nums` is an ascending array that is possibly rotated.\n-10^4 <= target <= 10^4',
    tags: ['Arrays', 'Binary Search'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '7\n4 5 6 7 0 1 2\n0',
        output: '4',
        explanation: '0 is located at index 4.',
      },
      {
        input: '7\n4 5 6 7 0 1 2\n3',
        output: '-1',
        explanation: '3 is not in the array.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction searchRotated(nums, target) {\n  // TODO: Write your algorithm here\n  return [];\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length < 2 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const target = parseInt(tokens[1 + n], 10);\n  const result = searchRotated(nums, target);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef searchRotated(nums, target):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    target = int(tokens[1+n])\n    result = searchRotated(nums, target)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint searchRotated(const vector<int>& nums, int target) {\n    // TODO: Write code here\n    return -1;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n\n    int result = searchRotated(nums, target);\n    cout << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n\n// TODO: Implement your solution here\nvoid searchRotated(const int* nums, int n, int target) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n\n    searchRotated(nums, n, target);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int searchRotated(int[] nums, int target) {\n        // TODO: Write code here\n        return -1;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        int target = Integer.parseInt(st.nextToken());\n\n        int result = searchRotated(nums, target);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc searchRotated(nums []int, target int) int {\n\t// TODO: Write code here\n\treturn -1\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\tvar target int\n\tfmt.Fscan(in, &target)\n\n\tresult := searchRotated(nums, target)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn searchRotated(nums: &[i32], target: i32) -> i32 {\n    // TODO: Write code here\n    -1\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n    let target: i32 = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = searchRotated(&nums, target);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '7\n4 5 6 7 0 1 2\n0',
        output: '4',
        isHidden: false,
      },
      {
        input: '7\n4 5 6 7 0 1 2\n3',
        output: '-1',
        isHidden: false,
      },
      {
        input: '1\n1\n0',
        output: '-1',
        isHidden: true,
      },
      {
        input: '1\n1\n1',
        output: '0',
        isHidden: true,
      },
      {
        input: '5\n3 1\n1',
        output: '1',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Find Minimum in Rotated Sorted Array',
    slug: 'find-minimum-in-rotated-sorted-array',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Suppose an array of length `n` sorted in ascending order is rotated between 1 and `n` times. Given the sorted rotated array `nums` of unique elements, return the minimum element of this array.\n\nYou must write an algorithm that runs in O(log n) time.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing rotated `nums`.',
    outputFormat: 'Print the minimum element integer.',
    constraints:
      'n == nums.length\n1 <= n <= 5000\n-5000 <= nums[i] <= 5000\nAll the integers of `nums` are unique.\n`nums` is sorted and rotated between 1 and n times.',
    tags: ['Arrays', 'Binary Search'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '5\n3 4 5 1 2',
        output: '1',
        explanation: 'The original array was [1,2,3,4,5] rotated 3 times. The minimum is 1.',
      },
      {
        input: '7\n4 5 6 7 0 1 2',
        output: '0',
        explanation: 'The minimum is 0.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction findMin(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = findMin(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef findMin(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = findMin(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint findMin(vector<int>& nums) {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = findMin(nums);\n    cout << boolalpha << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid findMin(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    findMin(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int findMin(int[] nums) {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = findMin(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc findMin(nums []int) int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := findMin(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn findMin(nums: &mut [i32]) -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = findMin(&mut nums);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '5\n3 4 5 1 2',
        output: '1',
        isHidden: false,
      },
      {
        input: '7\n4 5 6 7 0 1 2',
        output: '0',
        isHidden: false,
      },
      {
        input: '4\n11 13 15 17',
        output: '11',
        isHidden: true,
      },
      {
        input: '1\n2',
        output: '2',
        isHidden: true,
      },
      {
        input: '2\n2 1',
        output: '1',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Merge Intervals',
    slug: 'merge-intervals',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an array of `intervals` where `intervals[i] = [start_i, end_i]`, merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.',
    inputFormat:
      'The first line contains integer `n` (number of intervals).\nThe next `n` lines each contain two space-separated integers `start` and `end`.',
    outputFormat:
      'Print each merged interval on a new line with space-separated start and end values.',
    constraints: '1 <= n <= 10^4\nintervals[i].length == 2\n0 <= start_i <= end_i <= 10^4',
    tags: ['Arrays', 'Sorting'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4\n1 3\n2 6\n8 10\n15 18',
        output: '1 6\n8 10\n15 18',
        explanation: 'Since intervals [1,3] and [2,6] overlap, merge them into [1,6].',
      },
      {
        input: '2\n1 4\n4 5',
        output: '1 5',
        explanation: 'Intervals [1,4] and [4,5] are considered overlapping.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction mergeIntervals() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(mergeIntervals());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef mergeIntervals():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(mergeIntervals())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint mergeIntervals() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << mergeIntervals() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint mergeIntervals() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", mergeIntervals());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int mergeIntervals() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(mergeIntervals());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc mergeIntervals() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(mergeIntervals())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn mergeIntervals() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", mergeIntervals());\n}\n',
    },
    testCases: [
      {
        input: '4\n1 3\n2 6\n8 10\n15 18',
        output: '1 6\n8 10\n15 18',
        isHidden: false,
      },
      {
        input: '2\n1 4\n4 5',
        output: '1 5',
        isHidden: false,
      },
      {
        input: '1\n1 4',
        output: '1 4',
        isHidden: true,
      },
      {
        input: '3\n1 4\n0 4\n2 3',
        output: '0 4',
        isHidden: true,
      },
      {
        input: '3\n1 4\n0 0\n4 5',
        output: '0 0\n1 5',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Non-overlapping Intervals',
    slug: 'non-overlapping-intervals',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an array of intervals `intervals` where `intervals[i] = [start_i, end_i]`, return the minimum number of intervals you need to remove to make the rest of the intervals non-overlapping.',
    inputFormat:
      'The first line contains integer `n`.\nThe next `n` lines each contain two space-separated integers `start` and `end`.',
    outputFormat: 'Print the minimum removals required as an integer.',
    constraints:
      '1 <= n <= 10^5\nintervals[i].length == 2\n-5 * 10^4 <= start_i < end_i <= 5 * 10^4',
    tags: ['Arrays', 'Sorting', 'Greedy Algorithms'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4\n1 2\n2 3\n3 4\n1 3',
        output: '1',
        explanation: '[1,3] can be removed and the rest of the intervals are non-overlapping.',
      },
      {
        input: '3\n1 2\n1 2\n1 2',
        output: '2',
        explanation: 'You need to remove two [1,2] to model non-overlapping intervals.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction eraseOverlapIntervals() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(eraseOverlapIntervals());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef eraseOverlapIntervals():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(eraseOverlapIntervals())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint eraseOverlapIntervals() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << eraseOverlapIntervals() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint eraseOverlapIntervals() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", eraseOverlapIntervals());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int eraseOverlapIntervals() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(eraseOverlapIntervals());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc eraseOverlapIntervals() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(eraseOverlapIntervals())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn eraseOverlapIntervals() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", eraseOverlapIntervals());\n}\n',
    },
    testCases: [
      {
        input: '4\n1 2\n2 3\n3 4\n1 3',
        output: '1',
        isHidden: false,
      },
      {
        input: '3\n1 2\n1 2\n1 2',
        output: '2',
        isHidden: false,
      },
      {
        input: '3\n1 2\n2 3\n3 4',
        output: '0',
        isHidden: true,
      },
      {
        input: '1\n1 100',
        output: '0',
        isHidden: true,
      },
      {
        input: '5\n0 2\n1 3\n2 4\n3 5\n4 6',
        output: '2',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Reverse Linked List II',
    slug: 'reverse-linked-list-ii',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given the head of a singly linked list and two integers `left` and `right` where `left <= right`, reverse the nodes of the list from position `left` to position `right`, and return the reversed list.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing the list.\nThe third line contains two space-separated integers `left` and `right` (1-indexed).',
    outputFormat: 'Print the modified list with space-separated values.',
    constraints: '1 <= n <= 500\n-500 <= Node.val <= 500\n1 <= left <= right <= n',
    tags: ['Linked Lists', 'Recursion and Backtracking'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '5\n1 2 3 4 5\n2 4',
        output: '1 4 3 2 5',
        explanation: 'Nodes from position 2 to 4 (values 2, 3, 4) are reversed to 4, 3, 2.',
      },
      {
        input: '1\n5\n1 1',
        output: '5',
        explanation: 'Single node reversal returns the same list.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction reverseBetween(nums, target) {\n  // TODO: Write your algorithm here\n  return [];\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length < 2 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const target = parseInt(tokens[1 + n], 10);\n  const result = reverseBetween(nums, target);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef reverseBetween(nums, target):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    target = int(tokens[1+n])\n    result = reverseBetween(nums, target)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nvector<int> reverseBetween(const vector<int>& nums, int target) {\n    // TODO: Write code here\n    return {};\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n\n    auto result = reverseBetween(nums, target);\n    for (size_t i = 0; i < result.size(); i++) {\n        cout << result[i] << (i + 1 == result.size() ? "" : " ");\n    }\n    cout << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n\n// TODO: Implement your solution here\nvoid reverseBetween(const int* nums, int n, int target) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n\n    reverseBetween(nums, n, target);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int[] reverseBetween(int[] nums, int target) {\n        // TODO: Write code here\n        return new int[0];\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        int target = Integer.parseInt(st.nextToken());\n\n        int[] result = reverseBetween(nums, target);\n        for (int i = 0; i < result.length; i++) {\n            System.out.print(result[i] + (i + 1 == result.length ? "" : " "));\n        }\n        System.out.println();\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc reverseBetween(nums []int, target int) []int {\n\t// TODO: Write code here\n\treturn []int{}\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\tvar target int\n\tfmt.Fscan(in, &target)\n\n\tresult := reverseBetween(nums, target)\n\tfor i, v := range result {\n\t\tif i > 0 {\n\t\t\tfmt.Print(" ")\n\t\t}\n\t\tfmt.Print(v)\n\t}\n\tfmt.Println()\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn reverseBetween(nums: &[i32], target: i32) -> Vec<i32> {\n    // TODO: Write code here\n    vec![]\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n    let target: i32 = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = reverseBetween(&nums, target);\n    let out = result.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ");\n    println!("{}", out);\n}\n',
    },
    testCases: [
      {
        input: '5\n1 2 3 4 5\n2 4',
        output: '1 4 3 2 5',
        isHidden: false,
      },
      {
        input: '1\n5\n1 1',
        output: '5',
        isHidden: false,
      },
      {
        input: '4\n1 2 3 4\n1 4',
        output: '4 3 2 1',
        isHidden: true,
      },
      {
        input: '3\n1 2 3\n2 3',
        output: '1 3 2',
        isHidden: true,
      },
      {
        input: '4\n1 2 3 4\n1 2',
        output: '2 1 3 4',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Min Stack',
    slug: 'min-stack',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Design a stack that supports push, pop, top, and retrieving the minimum element in constant time.\n\nYou are given a sequence of operations:\n- `push x`\n- `pop`\n- `top` (print top value)\n- `getMin` (print current minimum value)',
    inputFormat:
      'The first line contains integer `q` (number of operations).\nThe next `q` lines each contain an operation string.',
    outputFormat:
      'For every `top` and `getMin` operation, print the resulting integer on a new line.',
    constraints:
      '1 <= q <= 3 * 10^4\nMethods pop, top and getMin will always be called on non-empty stacks.',
    tags: ['Stack and Queue'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '7\npush -2\npush 0\npush -3\ngetMin\npop\ntop\ngetMin',
        output: '-3\n0\n-2',
        explanation: 'getMin returns -3; after pop, top is 0 and getMin is -2.',
      },
      {
        input: '5\npush 1\npush 2\ntop\ngetMin\npop',
        output: '2\n1',
        explanation: 'top returns 2, getMin returns 1, then pop removes 2.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction minStack() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(minStack());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef minStack():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(minStack())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint minStack() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << minStack() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint minStack() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", minStack());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int minStack() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(minStack());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc minStack() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(minStack())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn minStack() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", minStack());\n}\n',
    },
    testCases: [
      {
        input: '7\npush -2\npush 0\npush -3\ngetMin\npop\ntop\ngetMin',
        output: '-3\n0\n-2',
        isHidden: false,
      },
      {
        input: '5\npush 1\npush 2\ntop\ngetMin\npop',
        output: '2\n1',
        isHidden: false,
      },
      {
        input: '4\npush 5\ngetMin\npush 2\ngetMin',
        output: '5\n2',
        isHidden: true,
      },
      {
        input: '6\npush 10\npush 10\ngetMin\npop\ngetMin\ntop',
        output: '10\n10\n10',
        isHidden: true,
      },
      {
        input: '3\npush -1\ntop\ngetMin',
        output: '-1\n-1',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Daily Temperatures',
    slug: 'daily-temperatures',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an array of integers `temperatures` represents the daily temperatures, return an array `answer` such that `answer[i]` is the number of days you have to wait after the `i`-th day to get a warmer temperature. If there is no future day for which this is possible, keep `answer[i] == 0` instead.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing daily temperatures.',
    outputFormat: 'Print the space-separated wait days integers.',
    constraints: '1 <= n <= 10^5\n30 <= temperatures[i] <= 100',
    tags: ['Arrays', 'Stack and Queue'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '8\n73 74 75 71 69 72 76 73',
        output: '1 1 4 2 1 1 0 0',
        explanation:
          '73 is followed by 74 next day (1); 74 by 75 next day (1); 75 waited 4 days for 76.',
      },
      {
        input: '4\n30 40 50 60',
        output: '1 1 1 0',
        explanation: 'Strictly ascending temperatures.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction dailyTemperatures(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = dailyTemperatures(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef dailyTemperatures(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = dailyTemperatures(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nvector<int> dailyTemperatures(vector<int>& nums) {\n    // TODO: Write code here\n    return {};\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = dailyTemperatures(nums);\n    for (size_t i = 0; i < result.size(); i++) {\n        cout << result[i] << (i + 1 == result.size() ? "" : " ");\n    }\n    cout << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid dailyTemperatures(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    dailyTemperatures(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int[] dailyTemperatures(int[] nums) {\n        // TODO: Write code here\n        return new int[0];\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = dailyTemperatures(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc dailyTemperatures(nums []int) []int {\n\t// TODO: Write code here\n\treturn []int{}\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := dailyTemperatures(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn dailyTemperatures(nums: &mut [i32]) -> Vec<i32> {\n    // TODO: Write code here\n    vec![]\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = dailyTemperatures(&mut nums);\n    let out = result.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ");\n    println!("{}", out);\n}\n',
    },
    testCases: [
      {
        input: '8\n73 74 75 71 69 72 76 73',
        output: '1 1 4 2 1 1 0 0',
        isHidden: false,
      },
      {
        input: '4\n30 40 50 60',
        output: '1 1 1 0',
        isHidden: false,
      },
      {
        input: '3\n30 60 90',
        output: '1 1 0',
        isHidden: true,
      },
      {
        input: '1\n80',
        output: '0',
        isHidden: true,
      },
      {
        input: '5\n90 80 70 60 50',
        output: '0 0 0 0 0',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Validate Binary Search Tree',
    slug: 'validate-binary-search-tree',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      "Given the root of a binary tree given in level-order traversal format ('null' for missing nodes), determine if it is a valid binary search tree (BST).\n\nA valid BST is defined as follows:\n- The left subtree of a node contains only nodes with keys strictly less than the node's key.\n- The right subtree of a node contains only nodes with keys strictly greater than the node's key.\n- Both the left and right subtrees must also be binary search trees.",
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated tokens representing level order node values.',
    outputFormat: 'Print `true` if the tree is a valid BST, otherwise `false`.',
    constraints: '1 <= n <= 10^4\n-2^31 <= Node.val <= 2^31 - 1',
    tags: ['Trees and Binary Trees', 'Recursion and Backtracking'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n2 1 3',
        output: 'true',
        explanation:
          'Root 2 has left child 1 and right child 3, perfectly satisfying BST properties.',
      },
      {
        input: '5\n5 1 4 null null 3 6',
        output: 'false',
        explanation: "The root node's value is 5 but its right child's value is 4.",
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction isValidBST() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(isValidBST());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef isValidBST():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(isValidBST())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint isValidBST() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << isValidBST() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint isValidBST() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", isValidBST());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int isValidBST() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(isValidBST());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc isValidBST() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(isValidBST())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn isValidBST() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", isValidBST());\n}\n',
    },
    testCases: [
      {
        input: '3\n2 1 3',
        output: 'true',
        isHidden: false,
      },
      {
        input: '5\n5 1 4 null null 3 6',
        output: 'false',
        isHidden: false,
      },
      {
        input: '1\n1',
        output: 'true',
        isHidden: true,
      },
      {
        input: '3\n1 1 null',
        output: 'false',
        isHidden: true,
      },
      {
        input: '3\n5 4 6',
        output: 'true',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Number of Islands',
    slug: 'number-of-islands',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      "Given an `m x n` 2D binary grid `grid` which represents a map of '1's (land) and '0's (water), return the number of islands.\n\nAn island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically. You may assume all four edges of the grid are all surrounded by water.",
    inputFormat:
      "The first line contains two integers `m` and `n`.\nThe next `m` lines each contain `n` space-separated characters ('0' or '1').",
    outputFormat: 'Print the number of islands as an integer.',
    constraints:
      "m == grid.length\nn == grid[i].length\n1 <= m, n <= 300\ngrid[i][j] is '0' or '1'.",
    tags: ['Graphs', 'Recursion and Backtracking'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0',
        output: '1',
        explanation: 'All 1s connect horizontally or vertically into a single island.',
      },
      {
        input: '4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1',
        output: '3',
        explanation: 'Three separate disconnected land components exist.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction numIslands() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(numIslands());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef numIslands():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(numIslands())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint numIslands() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << numIslands() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint numIslands() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", numIslands());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int numIslands() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(numIslands());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc numIslands() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(numIslands())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn numIslands() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", numIslands());\n}\n',
    },
    testCases: [
      {
        input: '4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0',
        output: '1',
        isHidden: false,
      },
      {
        input: '4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1',
        output: '3',
        isHidden: false,
      },
      {
        input: '1 1\n1',
        output: '1',
        isHidden: true,
      },
      {
        input: '1 1\n0',
        output: '0',
        isHidden: true,
      },
      {
        input: '3 3\n1 0 1\n0 1 0\n1 0 1',
        output: '5',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Rotting Oranges',
    slug: 'rotting-oranges',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'You are given an `m x n` grid where each cell can have one of three values:\n- `0` representing an empty cell,\n- `1` representing a fresh orange, or\n- `2` representing a rotten orange.\n\nEvery minute, any fresh orange that is 4-directionally adjacent to a rotten orange becomes rotten.\n\nReturn the minimum number of minutes that must elapse until no cell has a fresh orange. If this is impossible, return -1.',
    inputFormat:
      'The first line contains two integers `m` and `n`.\nThe next `m` lines each contain `n` space-separated integers (0, 1, or 2).',
    outputFormat: 'Print the minimum minutes elapsed, or -1.',
    constraints:
      'm == grid.length\nn == grid[i].length\n1 <= m, n <= 10\ngrid[i][j] is 0, 1, or 2.',
    tags: ['Graphs', 'Stack and Queue'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3 3\n2 1 1\n1 1 0\n0 1 1',
        output: '4',
        explanation: 'In 4 minutes, all fresh oranges rot through adjacent propagation.',
      },
      {
        input: '3 3\n2 1 1\n0 1 1\n1 0 1',
        output: '-1',
        explanation: 'The fresh orange at the bottom left is isolated and will never rot.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction orangesRotting() {\n  // TODO: Write your algorithm here\n  return null;\n}\n\nfunction main() {\n  const input = fs.readFileSync(0, 'utf-8').trim();\n  if (!input) return;\n  // Read inputs\n  console.log(orangesRotting());\n}\n\nmain();\n",
      python:
        "import sys\n\ndef orangesRotting():\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    print(orangesRotting())\n\nif __name__ == '__main__':\n    main()\n",
      cpp: '#include <iostream>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint orangesRotting() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    cout << orangesRotting() << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n\n// TODO: Implement your solution here\nint orangesRotting() {\n    // TODO: Write code here\n    return 0;\n}\n\nint main() {\n    printf("%d\\n", orangesRotting());\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int orangesRotting() {\n        // TODO: Write code here\n        return 0;\n    }\n\n    public static void main(String[] args) throws IOException {\n        System.out.println(orangesRotting());\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"fmt"\n)\n\n// TODO: Implement your solution here\nfunc orangesRotting() int {\n\t// TODO: Write code here\n\treturn 0\n}\n\nfunc main() {\n\tfmt.Println(orangesRotting())\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn orangesRotting() -> i32 {\n    // TODO: Write code here\n    0\n}\n\nfn main() {\n    println!("{}", orangesRotting());\n}\n',
    },
    testCases: [
      {
        input: '3 3\n2 1 1\n1 1 0\n0 1 1',
        output: '4',
        isHidden: false,
      },
      {
        input: '3 3\n2 1 1\n0 1 1\n1 0 1',
        output: '-1',
        isHidden: false,
      },
      {
        input: '1 2\n0 2',
        output: '0',
        isHidden: true,
      },
      {
        input: '1 1\n1',
        output: '-1',
        isHidden: true,
      },
      {
        input: '2 2\n2 1\n1 1',
        output: '2',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Subsets',
    slug: 'subsets',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an integer array `nums` of unique elements, return all possible subsets (the power set).\n\nThe solution set must not contain duplicate subsets. Print each subset on a new line with space-separated sorted values (an empty subset is represented by an empty line).',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing `nums`.',
    outputFormat: 'Print each subset on a new line.',
    constraints:
      '1 <= nums.length <= 10\n-10 <= nums[i] <= 10\nAll the numbers of `nums` are unique.',
    tags: ['Arrays', 'Recursion and Backtracking'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n1 2 3',
        output: '\n1\n2\n1 2\n3\n1 3\n2 3\n1 2 3',
        explanation: 'All 2^3 = 8 subsets of [1,2,3].',
      },
      {
        input: '1\n0',
        output: '\n0',
        explanation: 'The empty set and [0].',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction subsets(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = subsets(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef subsets(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = subsets(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nvector<vector<int>> subsets(vector<int>& nums) {\n    // TODO: Write code here\n    return {};\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = subsets(nums);\n    for (const auto& row : result) {\n        for (size_t i = 0; i < row.size(); i++) {\n            cout << row[i] << (i + 1 == row.size() ? "" : " ");\n        }\n        cout << "\\n";\n    }\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid subsets(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    subsets(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static List<List<Integer>> subsets(int[] nums) {\n        // TODO: Write code here\n        return new ArrayList<>();\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = subsets(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc subsets(nums []int) [][]int {\n\t// TODO: Write code here\n\treturn [][]int{}\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := subsets(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn subsets(nums: &mut [i32]) -> Vec<Vec<i32>> {\n    // TODO: Write code here\n    vec![]\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = subsets(&mut nums);\n    for row in result {\n        let out = row.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ");\n        println!("{}", out);\n    }\n}\n',
    },
    testCases: [
      {
        input: '3\n1 2 3',
        output: '\n1\n2\n1 2\n3\n1 3\n2 3\n1 2 3',
        isHidden: false,
      },
      {
        input: '1\n0',
        output: '\n0',
        isHidden: false,
      },
      {
        input: '2\n1 2',
        output: '\n1\n2\n1 2',
        isHidden: true,
      },
      {
        input: '2\n4 5',
        output: '\n4\n5\n4 5',
        isHidden: true,
      },
      {
        input: '1\n9',
        output: '\n9',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Permutations',
    slug: 'permutations',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'Given an array `nums` of distinct integers, return all the possible permutations. Print each permutation on a new line with space-separated values.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers.',
    outputFormat: 'Print each permutation on a new line with space-separated values.',
    constraints:
      '1 <= nums.length <= 6\n-10 <= nums[i] <= 10\nAll the integers of `nums` are unique.',
    tags: ['Arrays', 'Recursion and Backtracking'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n1 2 3',
        output: '1 2 3\n1 3 2\n2 1 3\n2 3 1\n3 1 2\n3 2 1',
        explanation: 'All 3! = 6 permutations.',
      },
      {
        input: '1\n1',
        output: '1',
        explanation: 'Single element permutation.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction permute(nums) {\n  // TODO: Write code here\n  return null;\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length === 0 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const result = permute(nums);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef permute(nums):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    result = permute(nums)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    elif isinstance(result, bool):\n        print("true" if result else "false")\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nvector<vector<int>> permute(vector<int>& nums) {\n    // TODO: Write code here\n    return {};\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n\n    auto result = permute(nums);\n    for (const auto& row : result) {\n        for (size_t i = 0; i < row.size(); i++) {\n            cout << row[i] << (i + 1 == row.size() ? "" : " ");\n        }\n        cout << "\\n";\n    }\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n#include <stdbool.h>\n\n// TODO: Implement your solution here\nvoid permute(int* nums, int n) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n\n    permute(nums, n);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static List<List<Integer>> permute(int[] nums) {\n        // TODO: Write code here\n        return new ArrayList<>();\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n\n        var result = permute(nums);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc permute(nums []int) [][]int {\n\t// TODO: Write code here\n\treturn [][]int{}\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\n\tresult := permute(nums)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn permute(nums: &mut [i32]) -> Vec<Vec<i32>> {\n    // TODO: Write code here\n    vec![]\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n\n    let result = permute(&mut nums);\n    for row in result {\n        let out = row.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ");\n        println!("{}", out);\n    }\n}\n',
    },
    testCases: [
      {
        input: '3\n1 2 3',
        output: '1 2 3\n1 3 2\n2 1 3\n2 3 1\n3 1 2\n3 2 1',
        isHidden: false,
      },
      {
        input: '1\n1',
        output: '1',
        isHidden: false,
      },
      {
        input: '2\n0 1',
        output: '0 1\n1 0',
        isHidden: true,
      },
      {
        input: '2\n2 3',
        output: '2 3\n3 2',
        isHidden: true,
      },
      {
        input: '1\n7',
        output: '7',
        isHidden: true,
      },
    ],
  },
  {
    title: 'Coin Change',
    slug: 'coin-change',
    difficulty: ProblemDifficulty.MEDIUM,
    statement:
      'You are given an integer array `coins` representing coins of different denominations and an integer `amount` representing a total amount of money.\n\nReturn the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return -1.\n\nYou may assume that you have an infinite number of each kind of coin.',
    inputFormat:
      'The first line contains integer `n`.\nThe second line contains `n` space-separated integers representing `coins`.\nThe third line contains integer `amount`.',
    outputFormat: 'Print the fewest number of coins required, or -1.',
    constraints: '1 <= coins.length <= 12\n1 <= coins[i] <= 2^31 - 1\n0 <= amount <= 10^4',
    tags: ['Dynamic Programming'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    examples: [
      {
        input: '3\n1 2 5\n11',
        output: '3',
        explanation: '11 = 5 + 5 + 1 (3 coins).',
      },
      {
        input: '1\n2\n3',
        output: '-1',
        explanation: '3 cannot be formed using only coins of value 2.',
      },
    ],
    starterCode: {
      javascript:
        "const fs = require('fs');\n\n/**\n * TODO: Implement your solution below\n */\nfunction coinChange(nums, target) {\n  // TODO: Write your algorithm here\n  return [];\n}\n\nfunction main() {\n  const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\n  if (!tokens || tokens.length < 2 || tokens[0] === '') return;\n  const n = parseInt(tokens[0], 10);\n  const nums = [];\n  for (let i = 0; i < n; i++) {\n    nums.push(parseInt(tokens[1 + i], 10));\n  }\n  const target = parseInt(tokens[1 + n], 10);\n  const result = coinChange(nums, target);\n  if (Array.isArray(result)) {\n    console.log(result.join(' '));\n  } else {\n    console.log(result);\n  }\n}\n\nmain();\n",
      python:
        'import sys\n\ndef coinChange(nums, target):\n    # TODO: Implement your solution here\n    pass\n\ndef main():\n    tokens = sys.stdin.read().split()\n    if not tokens:\n        return\n    n = int(tokens[0])\n    nums = [int(x) for x in tokens[1:1+n]]\n    target = int(tokens[1+n])\n    result = coinChange(nums, target)\n    if isinstance(result, list):\n        print(" ".join(map(str, result)))\n    else:\n        print(result)\n\nif __name__ == \'__main__\':\n    main()\n',
      cpp: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// TODO: Implement your solution here\nint coinChange(const vector<int>& nums, int target) {\n    // TODO: Write code here\n    return -1;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n\n    int result = coinChange(nums, target);\n    cout << result << "\\n";\n    return 0;\n}\n',
      c: '#include <stdio.h>\n#include <stdlib.h>\n\n// TODO: Implement your solution here\nvoid coinChange(const int* nums, int n, int target) {\n    // TODO: Write code here\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(sizeof(int) * n);\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n\n    coinChange(nums, n, target);\n    free(nums);\n    return 0;\n}\n',
      java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // TODO: Implement your solution here\n    public static int coinChange(int[] nums, int target) {\n        // TODO: Write code here\n        return -1;\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line == null) return;\n        StringTokenizer st = new StringTokenizer(line);\n        int n = Integer.parseInt(st.nextToken());\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) {\n            if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n            nums[i] = Integer.parseInt(st.nextToken());\n        }\n        if (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());\n        int target = Integer.parseInt(st.nextToken());\n\n        int result = coinChange(nums, target);\n        System.out.println(result);\n    }\n}\n',
      go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\n// TODO: Implement your solution here\nfunc coinChange(nums []int, target int) int {\n\t// TODO: Write code here\n\treturn -1\n}\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\tvar n int\n\tif _, err := fmt.Fscan(in, &n); err != nil {\n\t\treturn\n\t}\n\tnums := make([]int, n)\n\tfor i := 0; i < n; i++ {\n\t\tfmt.Fscan(in, &nums[i])\n\t}\n\tvar target int\n\tfmt.Fscan(in, &target)\n\n\tresult := coinChange(nums, target)\n\tfmt.Println(result)\n}\n',
      rust: 'use std::io::{self, Read};\n\n// TODO: Implement your solution here\nfn coinChange(nums: &[i32], target: i32) -> i32 {\n    // TODO: Write code here\n    -1\n}\n\nfn main() {\n    let mut buffer = String::new();\n    if io::stdin().read_to_string(&mut buffer).is_err() {\n        return;\n    }\n    let mut tokens = buffer.split_whitespace();\n    let n: usize = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n    let mut nums = Vec::with_capacity(n);\n    for _ in 0..n {\n        if let Some(x) = tokens.next().and_then(|s| s.parse::<i32>().ok()) {\n            nums.push(x);\n        }\n    }\n    let target: i32 = match tokens.next().and_then(|s| s.parse().ok()) {\n        Some(v) => v,\n        None => return,\n    };\n\n    let result = coinChange(&nums, target);\n    println!("{}", result);\n}\n',
    },
    testCases: [
      {
        input: '3\n1 2 5\n11',
        output: '3',
        isHidden: false,
      },
      {
        input: '1\n2\n3',
        output: '-1',
        isHidden: false,
      },
      {
        input: '1\n1\n0',
        output: '0',
        isHidden: true,
      },
      {
        input: '2\n1 2\n2',
        output: '1',
        isHidden: true,
      },
      {
        input: '3\n2 5 10\n15',
        output: '2',
        isHidden: true,
      },
    ],
  },
];
