# Bundled PostgreSQL staging

This directory is the Tauri resource staging location for desktop managed
PostgreSQL binaries.

Do not commit PostgreSQL binary files here. Stage them locally or in CI with:

```sh
pnpm desktop:postgres:bundle -- --source /path/to/postgresql-dist
pnpm desktop:postgres:verify
```

The staging script copies a full source distribution into `resources/postgres`
when the source contains a `bin` directory. For local development it can also
accept a direct `bin` directory and copy it into `resources/postgres/bin`.
Runtime discovery then checks `resource_dir/postgres/bin` and
`resource_dir/postgres`.
