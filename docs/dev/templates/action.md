```ts
// some-feature/actions/route.server.ts
import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { idObject } from "~/utils/schema";

export const action = defineAction(
	{ params: idObject, body: actionSchema },
	async ({ params, body }) => {
		const user = requireUser();

		// check permissions via requirePermission

		// update via Repository

		return null;
	},
);

// some-feature/routes/route.ts
import { action } from "../actions/route.server.ts"
export { action }
```
