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
  visibility: string;
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
  contest_id?: string | null;
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

export interface SubmissionResultRow {
  id: string;
  submission_id: string;
  test_case_index: number;
  verdict: string;
  execution_time_ms: number;
  memory_used_kb: number;
  created_at: Date;
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
  updated_at: Date;
}

export interface ContestProblemRow {
  contest_id: string;
  problem_id: string;
  problem_order: number;
}

export interface ContestParticipantRow {
  contest_id: string;
  user_id: string;
  registered_at: Date;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, any> | null;
  idempotency_key: string | null;
  is_read: boolean;
  created_at: Date;
  read_at: Date | null;
}

export interface UserProfileRow {
  id: string;
  user_id: string;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  avatar_key: string | null;
  bio: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  education: string | null;
  college: string | null;
  degree: string | null;
  skills: string[];
  github_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  created_at: Date;
  updated_at: Date;
}
