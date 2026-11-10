# Known Issues & Assumptions

This document tracks known edge cases, temporary limitations, and architectural assumptions made during development.

## Assumptions

1. **Local Host Worker Execution**: The judge worker runs on the developer's host machine to ensure the Docker daemon socket is never exposed or mounted into containers.
2. **Docker Desktop on Windows**: Container sandboxes require Docker Engine running locally with Linux containers enabled (WSL2 backend recommended).
3. **Execution Language**: Node.js / JavaScript (ES2022) is the initial target language inside the `node:20-alpine` sandbox image.

## Open / In-Progress Items

- Docker Desktop must be running on the host machine to execute container sandboxes.
