---
name: commit
description: Type-check, lint, review changes, and commit with a clean message
user-invocable: true
---

## Commit Workflow

1. Run `npx tsc --noEmit` and fix any type errors
2. Run `npm run lint` and fix any lint errors
3. Run `git diff --stat` to review changes
4. Create a concise commit message summarizing the changes
5. Commit and confirm with user before pushing
