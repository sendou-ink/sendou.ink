FROM mcr.microsoft.com/devcontainers/base:debian

# Install SQLite
RUN apt-get update \
    && apt-get install -y --no-install-recommends sqlite3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

CMD ["/bin/bash"]
