---
name: sql
description: Help write, debug, and explore SQLite database queries using Kysely. Use when writing repository code, exploring data, debugging query issues, or understanding the database schema.
---

# SQL Database Helper

## Databases

| File | Purpose | When to use |
|------|---------|-------------|
| `db.sqlite3` | Development database | Writing/testing new features, running the dev server |
| `db-sandbox.sqlite3` | Local, disposable copy of production data | Exploring real data, investigating bugs, verifying assumptions about data shape |
| `db-test.sqlite3` | Unit test database (blank + migrations, created automatically by test runs) | Unit tests only |

`db-sandbox.sqlite3` is not connected to production, modify it freely when the task requires it (`pnpm run sandbox:reset` restores it). **Never modify `db-snapshot.sqlite3`** — it is the pristine source the sandbox is reset from.

## Schema

All table definitions live in `app/db/tables.ts`. Read this file first to understand available tables, columns, and their types. Key conventions:

- Every table has a numeric `id` primary key (type `number`)
- Booleans are stored as `0`/`1` (type `DBBoolean`)

## Exploring data

When the user needs to explore or query existing data, use `sqlite3` CLI commands against the appropriate database.

**Important:** Always quote table and column names with double quotes (`"TableName"`, `"columnName"`) because the schema uses camelCase naming and some names are reserved SQL keywords.

```bash
# Explore real data
sqlite3 db-sandbox.sqlite3 'SELECT * FROM "User" LIMIT 5;'

# Check schema of a table
sqlite3 db-sandbox.sqlite3 '.schema "User"'

# Count rows
sqlite3 db-sandbox.sqlite3 'SELECT COUNT(*) FROM "User";'

# Development database
sqlite3 db.sqlite3 'SELECT * FROM "User" LIMIT 5;'
```
