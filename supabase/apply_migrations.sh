#!/bin/bash
# Apply all migrations to self-hosted Supabase
# Usage: ./apply_migrations.sh <POSTGRES_CONNECTION_STRING>
# Example: ./apply_migrations.sh "postgresql://postgres:your-password@your-host:5432/postgres"

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <POSTGRES_CONNECTION_STRING>"
  echo "Example: $0 'postgresql://postgres:password@localhost:5432/postgres'"
  exit 1
fi

CONN_STRING="$1"
MIGRATIONS_DIR="$(dirname "$0")/migrations"

for migration in "$MIGRATIONS_DIR"/*.sql; do
  echo "Applying $(basename "$migration")..."
  psql "$CONN_STRING" -f "$migration"
  echo "  Done."
done

echo ""
echo "All migrations applied successfully."
echo ""
echo "IMPORTANT: You also need to:"
echo "  1. Add 'ninja' to PGRST_DB_SCHEMAS in your docker-compose.yml:"
echo "     PGRST_DB_SCHEMAS=public,ninja"
echo "  2. Restart the PostgREST container:"
echo "     docker compose restart rest"
