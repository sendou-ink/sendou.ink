SHELL := bash

setup:
	if ! command -v nvm >/dev/null; then \
	curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash; \
	fi; \
	source $$HOME/.nvm/nvm.sh; \
	if ! node -v 2>/dev/null | grep -q '^v18'; then \
	nvm install 18; \
	fi; \
	nvm use 18; \
	npm install; \
	cp .env.example .env; \
	npm run migrate up


dev:
	npm run dev

test:
	npm run test:unit
	npm run test:e2e

lint:
	npm run lint:ts
	npm run lint:css
