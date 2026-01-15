---
# sendou.ink-kecv
title: Add i18n translations
status: todo
type: task
created_at: 2026-01-15T19:23:06Z
updated_at: 2026-01-15T19:23:06Z
parent: sendou.ink-knt5
---

## Description
Create translation file for the composition analyzer feature.

## Tasks
- [ ] Create `locales/en/comp-analyzer.json`
- [ ] Add translations for:
  - Page title
  - Weapon selector labels
  - Categorization options
  - Damage combo section title
  - Filter controls labels
  - Ink time labels
  - Sub defense labels
  - Screenshot labels
- [ ] Run `npm run i18n:sync` to sync with other languages

## Translation Keys
```json
{
  "title": "Composition Analyzer",
  "weaponSelector.title": "Select Weapons",
  "weaponSelector.categorizeBy.category": "By Category",
  "weaponSelector.categorizeBy.sub": "By Sub Weapon",
  "weaponSelector.categorizeBy.special": "By Special Weapon",
  "damageCombos.title": "Damage Combos",
  "damageCombos.100plus": "100+ Damage",
  "damageCombos.80to99": "80-99.9 Damage (+ Ink)",
  "damageCombos.hits": "{{count}} hits",
  "filter.all": "All",
  "filter.inkResistance": "Enemy Ink Resistance",
  "inkTime.seconds": "{{seconds}}s in ink",
  "subDefense.counter": "{{ap}} AP Sub Def to counter",
  "screenshot.title": "Comp Title",
  "screenshot.download": "Download Image"
}
```

## Acceptance Criteria
- All user-facing text uses t() function
- Translation file created and synced