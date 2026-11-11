-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Problems Table
CREATE TABLE IF NOT EXISTS problems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    statement TEXT NOT NULL,
    difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
    tags TEXT[] NOT NULL DEFAULT '{}',
    time_limit_ms INTEGER NOT NULL DEFAULT 2000,
    memory_limit_mb INTEGER NOT NULL DEFAULT 128,
    sample_input TEXT NOT NULL DEFAULT '',
    sample_expected_output TEXT NOT NULL DEFAULT '',
    setter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_problems_slug ON problems(slug);
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_problems_created_at_id ON problems(created_at DESC, id DESC);
-- Full text search GIN index (AC-PR-03)
CREATE INDEX IF NOT EXISTS idx_problems_fts ON problems USING gin (to_tsvector('english', title || ' ' || statement));

-- 3. Test Cases Table (Keys in MinIO, never stored in DB - AC-PR-01)
CREATE TABLE IF NOT EXISTS test_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    index INTEGER NOT NULL,
    input_key VARCHAR(255) NOT NULL,
    expected_output_key VARCHAR(255) NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_problem_test_index UNIQUE(problem_id, index)
);

CREATE INDEX IF NOT EXISTS idx_test_cases_problem_id ON test_cases(problem_id, index);

-- 4. Submissions Table
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    language VARCHAR(20) NOT NULL DEFAULT 'javascript',
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    verdict VARCHAR(30),
    execution_time_ms INTEGER,
    memory_used_kb INTEGER,
    failed_test_index INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_user_cursor ON submissions(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_problem_status ON submissions(problem_id, status);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

-- 5. Submission Results Table (Per-test case outputs)
CREATE TABLE IF NOT EXISTS submission_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    test_case_index INTEGER NOT NULL,
    verdict VARCHAR(30) NOT NULL,
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    memory_used_kb INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sub_test_index UNIQUE(submission_id, test_case_index)
);

-- 6. Contests Table (Tier 2 / M6)
CREATE TABLE IF NOT EXISTS contests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    freeze_minutes INTEGER NOT NULL DEFAULT 60,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contests_times ON contests(start_time, end_time);

-- 7. Contest Problems
CREATE TABLE IF NOT EXISTS contest_problems (
    contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    problem_order INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(contest_id, problem_id)
);

-- 8. Contest Participants
CREATE TABLE IF NOT EXISTS contest_participants (
    contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(contest_id, user_id)
);

