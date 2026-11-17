# Online Code Judge — REST & Real-Time API Reference

This document provides a comprehensive reference for the Online Code Judge REST API and Server-Sent Events (SSE) streaming endpoints.

---

## Base URL & Authentication

- **Base URL:** `http://localhost:4000/api` (or `/api` behind Nginx reverse proxy)
- **Authentication:** HttpOnly, SameSite cookie containing signed JWT token or `Authorization: Bearer <token>` header.
- **Roles:** `user`, `problem_setter`, `admin`.

---

## 1. Authentication (`/api/auth`)

| Method | Endpoint             | Access        | Description                                              |
| :----- | :------------------- | :------------ | :------------------------------------------------------- |
| `POST` | `/api/auth/register` | Public        | Register new user account. Returns `{ data: { user } }`. |
| `POST` | `/api/auth/login`    | Public        | Authenticate user, sets HttpOnly auth cookie.            |
| `POST` | `/api/auth/logout`   | Authenticated | Clears auth cookie and invalidates session.              |
| `GET`  | `/api/auth/me`       | Authenticated | Returns currently authenticated user details.            |

---

## 2. User Profiles & Settings (`/api/users`)

| Method   | Endpoint               | Access        | Description                                         |
| :------- | :--------------------- | :------------ | :-------------------------------------------------- |
| `GET`    | `/api/users/me`        | Authenticated | Fetch complete profile metadata for logged-in user. |
| `PUT`    | `/api/users/me`        | Authenticated | Update user profile (bio, name, links, education).  |
| `POST`   | `/api/users/me/avatar` | Authenticated | Upload base64 encoded user avatar image.            |
| `DELETE` | `/api/users/me/avatar` | Authenticated | Remove avatar image.                                |
| `GET`    | `/api/users/:id`       | Authenticated | View public profile of specified user.              |

---

## 3. Problems (`/api/problems`)

| Method   | Endpoint            | Access         | Description                                                                                   |
| :------- | :------------------ | :------------- | :-------------------------------------------------------------------------------------------- |
| `GET`    | `/api/problems`     | Public         | Paginated list of public problems. Supports `search`, `difficulty`, `tag`, `cursor`, `limit`. |
| `GET`    | `/api/problems/:id` | Public         | Fetch problem details, sample input/output, and constraints.                                  |
| `POST`   | `/api/problems`     | Setter / Admin | Create new coding problem with statement and limits.                                          |
| `PUT`    | `/api/problems/:id` | Setter / Admin | Update problem statement, limits, or visibility.                                              |
| `DELETE` | `/api/problems/:id` | Admin          | Soft-delete / archive problem.                                                                |

---

## 4. Code Execution & Submissions (`/api/submissions`)

Supported Languages: `javascript`, `python`, `c`, `cpp`, `java`, `go`, `rust`.

| Method | Endpoint                             | Access        | Description                                                                                                  |
| :----- | :----------------------------------- | :------------ | :----------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/submissions/run-sample`        | Authenticated | Execute custom input or sample test cases via ephemeral sample queue. Returns `{ runId, status }`.           |
| `GET`  | `/api/submissions/run-sample/:runId` | Authenticated | Poll outcome of sample execution run.                                                                        |
| `POST` | `/api/submissions`                   | Authenticated | Submit code for official evaluation against full test suite. Returns `202 Accepted` with submission record.  |
| `GET`  | `/api/submissions`                   | Authenticated | Query submission history. Supports `search`, `verdict`, `language`, `startDate`, `endDate`, `page`, `limit`. |
| `GET`  | `/api/submissions/:id`               | Authenticated | Fetch submission details including sanitized test case results and source code.                              |
| `GET`  | `/api/submissions/:id/live`          | Authenticated | Server-Sent Events (SSE) real-time streaming endpoint for live judging progress and verdicts.                |

### Test Case Sanitization Policy

For official submissions, only sample (unhidden) test cases expose full standard input and expected output payloads. Hidden test cases only reveal execution time, memory usage, and per-test verdict (`ACCEPTED`, `WRONG_ANSWER`, `TIME_LIMIT_EXCEEDED`, `NOT_EXECUTED`).

---

## 5. Performance Analytics (`/api/analytics`)

| Method | Endpoint            | Access        | Description                                                              |
| :----- | :------------------ | :------------ | :----------------------------------------------------------------------- |
| `GET`  | `/api/analytics/me` | Authenticated | Retrieve comprehensive performance analytics for the authenticated user. |

### Analytics Response Structure:

```json
{
  "data": {
    "overview": {
      "totalSubmissions": 42,
      "totalAccepted": 28,
      "acceptanceRate": 66.7,
      "totalSolvedProblems": 24,
      "totalAttemptedProblems": 30,
      "globalRank": 5
    },
    "difficultyBreakdown": {
      "easy": { "solved": 15, "total": 20 },
      "medium": { "solved": 7, "total": 15 },
      "hard": { "solved": 2, "total": 10 }
    },
    "verdictDistribution": [
      { "verdict": "ACCEPTED", "count": 28, "percentage": 66.7 },
      { "verdict": "WRONG_ANSWER", "count": 8, "percentage": 19.0 }
    ],
    "languageUsage": [
      { "language": "rust", "count": 20, "percentage": 47.6 },
      { "language": "javascript", "count": 12, "percentage": 28.6 }
    ],
    "activityHeatmap": [{ "date": "2026-03-01", "count": 5, "acceptedCount": 4 }],
    "performanceTrends": [
      {
        "submissionId": "uuid",
        "problemId": "uuid",
        "problemTitle": "Two Sum",
        "language": "rust",
        "verdict": "ACCEPTED",
        "executionTimeMs": 14,
        "memoryUsedKb": 4096,
        "createdAt": "2026-03-01T10:00:00Z"
      }
    ]
  }
}
```

---

## 6. Leaderboard (`/api/leaderboard`)

| Method | Endpoint                   | Access | Description                                                                    |
| :----- | :------------------------- | :----- | :----------------------------------------------------------------------------- |
| `GET`  | `/api/leaderboard`         | Public | Paginated global leaderboard ordered by solved problem score and penalty time. |
| `POST` | `/api/leaderboard/rebuild` | Admin  | Atomic reconciliation of Redis leaderboard against PostgreSQL records.         |

---

## 7. Contests (`/api/contests`)

| Method   | Endpoint                        | Access        | Description                                                      |
| :------- | :------------------------------ | :------------ | :--------------------------------------------------------------- |
| `GET`    | `/api/contests`                 | Public        | List scheduled, active, and past contests.                       |
| `GET`    | `/api/contests/:id`             | Public        | Contest details and problem list (during active contest).        |
| `POST`   | `/api/contests/:id/register`    | Authenticated | Register user for upcoming contest.                              |
| `DELETE` | `/api/contests/:id/register`    | Authenticated | Unregister from contest.                                         |
| `GET`    | `/api/contests/:id/leaderboard` | Public        | Live scoreboard for specific contest with freeze window support. |

---

## 8. Notifications (`/api/notifications`)

| Method  | Endpoint                      | Access        | Description                                      |
| :------ | :---------------------------- | :------------ | :----------------------------------------------- |
| `GET`   | `/api/notifications`          | Authenticated | Paginated user notifications with unread counts. |
| `PATCH` | `/api/notifications/:id/read` | Authenticated | Mark single notification as read.                |
| `POST`  | `/api/notifications/read-all` | Authenticated | Mark all notifications as read.                  |
| `GET`   | `/api/notifications/activity` | Authenticated | Recent activity timeline.                        |

---

## 9. Health & System Monitoring (`/health`)

| Method | Endpoint          | Access | Description                                                          |
| :----- | :---------------- | :----- | :------------------------------------------------------------------- |
| `GET`  | `/health/live`    | Public | Liveness probe: verifies process is alive.                           |
| `GET`  | `/health/ready`   | Public | Readiness probe: verifies PostgreSQL, Redis, and MinIO connectivity. |
| `GET`  | `/health/metrics` | Admin  | Prometheus metrics export (requests, latency, error rates).          |
