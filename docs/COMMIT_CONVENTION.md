## Conventional Commits Guide

All commits in this project **must** follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Formatting, no logic change |
| `refactor` | Code change that is neither fix nor feature |
| `perf` | Performance improvement |
| `test` | Adding/fixing tests |
| `chore` | Build system, CI, dependency updates |
| `security` | Security-related changes |

### Scopes (use the app/package name)

`api`, `worker`, `cron`, `stub-mail`, `frontend`, `shared`, `infra`, `docs`, `sandbox`

### Examples

```bash
feat(api): add JWT refresh token endpoint
fix(worker): kill container on SIGTERM during active evaluation  
docs(safety): document container lockdown flags
test(shared): add output comparator edge case tests
chore(infra): upgrade postgres image to 16-alpine
security(api): enforce rate limit on login endpoint
refactor(worker): extract evaluator from queue processor
```

### Breaking Changes

Add `BREAKING CHANGE:` in the footer:

```
feat(api)!: replace BullMQ with Kafka for job routing

BREAKING CHANGE: Requires KAFKA_BROKER env variable; BullMQ queue removed.
```

### Rules

- Use present tense: "add feature" not "added feature"  
- Keep the subject line under 72 characters  
- Do not capitalize the first word after the type/scope  
- Do not end the subject line with a period

