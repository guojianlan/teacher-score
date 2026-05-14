# Accuracy Baselines

`scripts/accuracy-test.ts` writes the current objective-accuracy baseline per subject here, e.g.:

```json
{
  "subject": "math",
  "objectiveAccuracy": 0.86,
  "capturedAt": "2026-06-01T10:00:00.000Z"
}
```

Per checklist §六.5 / §七.3: accuracy regression > 5% blocks publish.

Update with: `pnpm tsx scripts/accuracy-test.ts --subject <s> --update-baseline`.
