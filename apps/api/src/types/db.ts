export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProblemRow {
  id: string;
  title: string;
  slug: string;
  statement: string;
  difficulty: string;
  tags: string[];
  time_limit_ms: number;
  memory_limit_mb: number;
  sample_input: string;
  sample_expected_output: string;
  setter_id: string;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TestCaseRow {
  id: string;
  problem_id: string;
  index: number;
  input_key: string;
  expected_output_key: string;
  is_hidden: boolean;
  created_at: Date;
}

export interface SubmissionRow {
  id: string;
  problem_id: string;
  user_id: string;
  code: string;
  language: string;
  status: string;
  verdict: string | null;
  execution_time_ms: number | null;
  memory_used_kb: number | null;
  failed_test_index: number | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface ContestRow {
  id: string;
  title: string;
  description: string;
  start_time: Date;
  end_time: Date;
  freeze_minutes: number;
  created_by: string;
  created_at: Date;
}
