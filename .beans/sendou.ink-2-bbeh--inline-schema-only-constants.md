---
# sendou.ink-2-bbeh
title: Inline schema-only constants
status: scrapped
type: task
created_at: 2026-01-17T14:15:38Z
updated_at: 2026-01-17T14:15:38Z
---

Audit all constants used in SendouForm schema definitions. If a constant key is used only in that one place (the schema), inline the value directly and remove the key from the constant object.

## Results

Most constants listed in the plan are used in BOTH schemas AND components (for input `maxLength` props), so they cannot be inlined without creating duplicate magic numbers.

### Constants Inlined (5 total)
- [x] SCRIM.CANCEL_REASON_MAX_LENGTH (500) → scrims-schemas.ts
- [x] SCRIM.REQUEST_MESSAGE_MAX_LENGTH (200) → scrims-schemas.ts
- [x] TOURNAMENT_ORGANIZATION.DESCRIPTION_MAX_LENGTH (1_000) → tournament-organization-schemas.ts
- [x] TOURNAMENT_ORGANIZATION.BAN_REASON_MAX_LENGTH (200) → tournament-organization-schemas.ts
- [x] LFG.MIN_TEXT_LENGTH (1) → lfg.new.server.ts

### Constants NOT Inlined (used in both schemas AND components)
- TEAM: NAME_MAX_LENGTH, NAME_MIN_LENGTH, BIO_MAX_LENGTH, BSKY_MAX_LENGTH, TAG_MAX_LENGTH - all used in t.$customUrl.edit.tsx
- USER: All constants - used in u.$identifier.edit.tsx
- CALENDAR_EVENT: All constants - used in calendar.new.tsx
- TOURNAMENT: BRACKET_NAME_MAX_LENGTH - used in BracketProgressionSelector.tsx
- ART: All constants - used in art.new.tsx
- LFG: MAX_TEXT_LENGTH - used in lfg.new.tsx
- TOURNAMENT_SUB: All constants - used in to.$id.subs.new.tsx
- SENDOUQ: OWN_PUBLIC_NOTE_MAX_LENGTH - used in GroupCard.tsx
- PLUS_SUGGESTION: Both constants - used in component files

## Checklist
- [x] TEAM constants - SKIPPED: all used in components
- [x] USER constants - SKIPPED: all used in components
- [x] CALENDAR_EVENT constants - SKIPPED: all used in components
- [x] TOURNAMENT constants - SKIPPED: used in components
- [x] SCRIM constants - DONE: inlined CANCEL_REASON_MAX_LENGTH, REQUEST_MESSAGE_MAX_LENGTH
- [x] ART constants - SKIPPED: all used in components
- [x] LFG constants - DONE: inlined MIN_TEXT_LENGTH
- [x] TOURNAMENT_ORGANIZATION constants - DONE: inlined DESCRIPTION_MAX_LENGTH, BAN_REASON_MAX_LENGTH
- [x] TOURNAMENT_SUB constants - SKIPPED: all used in components
- [x] SENDOUQ constants - SKIPPED: used in components
- [x] PLUS_SUGGESTION constants - SKIPPED: used in components
- [x] Run npm run checks - PASSED
