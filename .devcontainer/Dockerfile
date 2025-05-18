FROM mcr.microsoft.com/devcontainers/base:debian

# Install Playwright browsers and dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs sqlite3 \
    && npm install -g playwright \
    && playwright install --with-deps \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

CMD ["/bin/bash"]
