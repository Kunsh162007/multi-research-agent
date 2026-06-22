---
description: Export a saved research thread as a formatted research-paper PDF
argument-hint: <thread_id>
---

Export the research thread **$ARGUMENTS** as a research-paper-styled PDF (abstract,
numbered sections, embedded Mermaid figures, references).

Use the export endpoint / helper:
```
GET /history/$ARGUMENTS/export?format=pdf&style=paper
```
or DOCX with `format=docx`. Confirm the file downloaded and that any Mermaid diagrams
rendered as figures (rendered via kroki.io; falls back to fpdf2 if WeasyPrint's native
libraries are unavailable).
