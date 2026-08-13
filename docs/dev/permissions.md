# Permissions

How authorization works, and where a new check should go. Two axes exist:

1. **Global roles** (`Role` in `app/modules/permissions/types.ts`): "may this user do this kind of thing at all" — gated with `requireRole()` on the server and `useHasRole()` in components.
2. **Per-object permissions**: "may this user act on _this_ entity" — the subject of this doc.

## Per-object permissions

An entity that can be acted on carries a server-computed `permissions` object: a record from permission name to the list of user ids holding it.

```ts
// in the Repository read function
return {
	...row,
	permissions: {
		EDIT: [row.authorId],
		DELETE: startTimeIsInTheFuture ? [row.authorId] : [],
	},
};
```

Rules:

- **Permissions objects are built in Repositories**, at read time, next to the query that loads the entity. They serialize to the client with the rest of the loader data, so server and client check the same values.
- **Checked only via the central helpers**: `requirePermission(entity, "EDIT")` in actions/loaders (throws 403), `useHasPermission(entity, "EDIT")` in components, and the pure `hasPermission(entity, "EDIT", user)` where a hook doesn't fit (non-throwing server checks, checks inside a render loop).
- **Time and state conditions are baked into the list at read time.** A calendar event that has started gets `DELETE: []`, a scrim without an accepted request gets `MANAGE_TRACKING: []`. Don't add predicates or re-check conditions at the call site.
- **No feature-level admin checks for object authorization.** The admin bypass lives in `hasPermission()` alone (production only, so tests and development exercise the real lists). Feature code calling `isAdmin()`/`useHasRole("ADMIN")` to authorize an action on an object is a bug.

## What stays outside the system

Two documented boundaries:

1. **Non-enumerable grants**: permissions held by an open class of users can't be expressed as an id list. Example: any high-enough plus tier member may comment on a suggestion (`canAddCommentToSuggestion*` in plus-suggestions). These stay as plain helper functions.
2. **State-machine-heavy domain classes**: the `Tournament` class computes its checks (`isOrganizer`, `canFinalize`, ...) from rich runtime state and is already instantiated from one serialized source on both server and client. Leave it as is.

Also not authorization: membership/domain logic like `isTeamMember`, `isTeamFull`, `resolveNewOwner` — these describe domain facts, not grants, and remain ordinary helpers.
