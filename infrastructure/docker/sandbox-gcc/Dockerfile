FROM alpine:3.19

RUN apk add --no-cache gcc g++ musl-dev libstdc++-dev

# Security: Ensure UID 1000 exists if needed
RUN addgroup -g 1000 sandbox 2>/dev/null || true && \
    adduser -D -u 1000 -G sandbox sandbox 2>/dev/null || true
