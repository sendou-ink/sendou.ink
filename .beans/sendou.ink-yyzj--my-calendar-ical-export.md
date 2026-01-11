---
# sendou.ink-yyzj
title: My Events iCal export
status: todo
type: task
priority: normal
created_at: 2026-01-11T11:45:35Z
updated_at: 2026-01-11T12:51:39Z
parent: sendou.ink-om3i
---

## Summary

Add .ics file export for the user's personal events, allowing subscription in external calendar apps.

## Details

**Feature:**
- Generate .ics file containing user's tournaments and scrims
- Similar to existing /calendar iCal feature but personalized
- Users can subscribe in Google Calendar, Apple Calendar, etc.

**Events to include:**
- Tournaments user is registered for
- Tournaments user is organizing  
- Scheduled scrims
- Looking-for-match scrims (optional - may not make sense)

## Checklist

- [ ] Research existing /calendar iCal implementation
- [ ] Create endpoint for personal events .ics
- [ ] Generate iCal events from user's tournaments
- [ ] Generate iCal events from user's scrims
- [ ] Add subscription URL/button to My Events page
- [ ] Test subscription in external calendar app