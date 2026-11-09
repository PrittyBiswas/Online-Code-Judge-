FROM node:20-alpine

# Security: Drop to non-root user (UID 1000)
RUN addgroup -g 1000 sandbox && adduser -D -u 1000 -G sandbox sandbox

USER sandbox
WORKDIR /sandbox

# No ENTRYPOINT — command is specified per-container by the judge worker

