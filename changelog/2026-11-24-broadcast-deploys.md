---
navItem: medal
type: bug
---
Broadcast overlays and the dashboard ride out sendou.ink updates and dropped connections

- The dashboard no longer turns into an error page when a button is pressed while sendou.ink can't be reached, it says the action wasn't done instead
- A banner tells when the dashboard is disconnected or sendou.ink is restarting for an update, and Take is off until it's back
- Overlays and the dashboard reconnect within seconds of an update instead of up to half a minute
- A Take that failed to reach the overlays is retried instead of being stuck until the next change
