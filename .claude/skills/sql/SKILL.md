---
name: sql
description: Help write, debug, and explore SQLite database queries using Kysely. Use when writing repository code, exploring data, debugging query issues, or understanding the database schema.
---

# SQL Database Helper

## Databases

| File | Purpose | When to use |
|------|---------|-------------|
| `db.sqlite3` | Development database | Writing/testing new features, running the dev server |
| `db-prod.sqlite3` | Copy of production database | Exploring real data, investigating bugs, verifying assumptions about data shape |
| `db-test.sqlite3` | Unit test database (blank + migrations) | Unit tests only |

`db-prod.sqlite3` can be modified if the task requires it. **Never modify `db-copy.sqlite3`** — it is the untouched backup.

## Schema

All table definitions live in `app/db/tables.ts`. Read this file first to understand available tables, columns, and their types. Key conventions:

- Every table has a numeric `id` primary key (type `number`)
- Booleans are stored as `0`/`1` (type `DBBoolean`)

## Exploring data

When the user needs to explore or query existing data, use `sqlite3` CLI commands against the appropriate database.

**Important:** Always quote table and column names with double quotes (`"TableName"`, `"columnName"`) because the schema uses camelCase naming and some names are reserved SQL keywords.

```bash
# Explore production data
sqlite3 db-prod.sqlite3 'SELECT * FROM "User" LIMIT 5;'

# Check schema of a table
sqlite3 db-prod.sqlite3 '.schema "User"'

# Count rows
sqlite3 db-prod.sqlite3 'SELECT COUNT(*) FROM "User";'

# Development database
sqlite3 db.sqlite3 'SELECT * FROM "User" LIMIT 5;'
```
