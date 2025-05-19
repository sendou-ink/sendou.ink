SHELL := bash

setup:
	npm install
	cp .env.example .env
	npm run migrate up


dev:
	npm run dev

test:
	npm run test:unit
	npm run test:e2e

lint:
	npm run lint:ts
	npm run lint:css
