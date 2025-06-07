```ts
// some-feature/actions/route.server.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import { parseRequestPayload } from "~/utils/remix.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUserId(request);
	const data = await parseRequestPayload({
		request,
		schema: actionSchema,
	});

	// check permissions via requirePermission

	// update via Repository

	return null;
};

// some-feature/routes/route.ts
import { action } from "../actions/route.server.ts"
export { action }
```
