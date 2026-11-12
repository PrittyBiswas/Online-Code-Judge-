# Known Issues & Assumptions

This document tracks known edge cases, temporary limitations, and architectural assumptions made during development.

## Assumptions

1. **Local Host Worker Execution**: The judge worker runs on the developer's host machine to ensure the Docker daemon socket is never exposed or mounted into containers.
2. **Docker Desktop on Windows**: Container sandboxes require Docker Engine running locally with Linux containers enabled (WSL2 backend recommended).
3. **Execution Language**: Node.js / JavaScript (ES2022) is the initial target language inside the `node:20-alpine` sandbox image.

## Open / In-Progress Items

- Docker Desktop must be running on the host machine to execute container sandboxes and `pnpm test:safety` / `pnpm test:integration`.
- **DNS resolution inside `--network none` (`SAFE-04`)**: Asynchronous DNS lookups (such as `http.get('http://google.com')` in `attack-suite/network-attempt/index.js`) may block waiting for DNS timeout rather than failing immediately, resulting in `TIME_LIMIT_EXCEEDED` instead of `RUNTIME_ERROR`. Direct IP socket connections fail immediately with `ENETUNREACH` (`RUNTIME_ERROR`); both completely prevent network access.
- **Disposable `--rm` containers & `OOMKilled` inspection (`SAFE-02`)**: Because sandbox containers run with `--rm` for leak-proof cleanup, Docker deletes container metadata immediately on exit. `classifySandboxOutcome` therefore combines external wall-clock timeout flags (`timedOut` / `execFileTimedOut`), output-limit flags (`outputExceeded` / `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`), runtime OOM messages (`heap out of memory`, `MemoryError`), and an explicit `oomKilled` guard so non-OOM `SIGKILL`/exit `137` conditions are not blindly misclassified as `MEMORY_LIMIT_EXCEEDED`.
