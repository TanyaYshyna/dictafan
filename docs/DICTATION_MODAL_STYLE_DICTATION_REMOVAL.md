---
description: Remove legacy style_dictation.css from dictation modal
---

- dictation modal should not depend on `/static/css/style_dictation.css`
- `static/css/dictation_modal.css` no longer imports `style_dictation.css`
- required styles for the modal (audio panel layout, record button focus ring, recording indicator, players wrappers, Next button row) were migrated into `static/css/dictation_modal.css`

Notes:
- `static/css/style_dictation.css` stays for the old dictation page and other legacy pages.
- If UI regressions appear in the modal, add missing rules to `static/css/dictation_modal.css` (do not re-enable the import).
