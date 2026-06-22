---
description: Add a topic to the Knowledge Monitor and sync it
argument-hint: <topic>
---

Add **$ARGUMENTS** to the user's Knowledge Monitor so new arXiv papers and web
articles are tracked, then trigger an immediate sync.

```
POST /monitor/topics   {"topic": "$ARGUMENTS"}
POST /monitor/sync/$ARGUMENTS
```

Report how many new knowledge items were discovered.
