"""Postgres embebido para desenvolvimento e testes neste ambiente (sem Docker).
Uso: python scripts/dev-db.py   ->  imprime a DATABASE_URL e mantém o servidor a correr."""
import os
import sys
import pgserver

data = os.environ.get("DEV_DB_DIR", "/tmp/gymapp-pg")
srv = pgserver.get_server(data, cleanup_mode=None)
print(srv.get_uri())
sys.stdout.flush()
