import os, json
import psycopg2

dsn = os.environ["DATABASE_URL"]

with open("static/data/languages.json", "r", encoding="utf-8") as f:
    data = json.load(f)

rows = []
for code, info in data.items():
    if not isinstance(info, dict):
        continue
    code = (code or "").lower().strip()
    if not code:
        continue

    code_url = (info.get("country_cod_url") or "").strip() or None
    name_native = (info.get("language_ru") or "").strip() or code.upper()
    name_en = (info.get("language_en") or "").strip() or code.upper()

    rows.append((code, code_url, name_native, name_en, True))

if not rows:
    raise SystemExit("No language rows found in JSON")

conn = psycopg2.connect(dsn)
cur = conn.cursor()

cur.executemany("""
INSERT INTO languages (code, code_url, name_native, name_en, is_active)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (code) DO UPDATE
SET code_url = EXCLUDED.code_url,
    name_native = EXCLUDED.name_native,
    name_en = EXCLUDED.name_en,
    is_active = EXCLUDED.is_active;
""", rows)

conn.commit()
cur.close()
conn.close()

print("OK: seeded languages:", len(rows))