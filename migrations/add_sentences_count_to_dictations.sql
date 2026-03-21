ALTER TABLE dictations ADD COLUMN IF NOT EXISTS sentences_count INTEGER;

UPDATE dictations d
SET sentences_count = sub.cnt
FROM (
  SELECT dictation_id, COUNT(*)::int AS cnt
  FROM dictation_sentences s
  JOIN dictations d2 ON d2.id = s.dictation_id
  WHERE s.language_code = d2.language_code
  GROUP BY dictation_id
) AS sub
WHERE sub.dictation_id = d.id;

UPDATE dictations SET sentences_count = COALESCE(sentences_count, 0);

ALTER TABLE dictations ALTER COLUMN sentences_count SET DEFAULT 0;
