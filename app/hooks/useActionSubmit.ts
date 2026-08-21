import { type FetcherWithComponents, useFetcher } from "react-router";
import {
	type ActionsOf,
	type FieldsOf,
	serializeFieldValue,
} from "~/utils/action-schemas";
import type { AnySchema } from "~/utils/schema";

interface UseActionSubmitOptions {
	/** Route to submit to. Defaults to the current route. */
	action?: string;
	/** Defaults to "application/x-www-form-urlencoded". */
	encType?: "application/x-www-form-urlencoded" | "application/json";
	/** Fetcher to submit with, e.g. to share submitting state. Defaults to own fetcher. */
	fetcher?: FetcherWithComponents<unknown>;
}

/**
 * Programmatic counterpart of `<ActionButton>`: submits an `_action` mutation
 * from an event handler, type checked against the route's action schema.
 *
 * @example
 * const { submit } = useActionSubmit(deleteFriendSchema);
 * submit("DELETE_FRIEND", { friendshipId });
 */
export function useActionSubmit<TSchema extends AnySchema>(
	_schema: TSchema,
	opts?: UseActionSubmitOptions,
) {
	const ownFetcher = useFetcher();
	const fetcher = opts?.fetcher ?? ownFetcher;

	const submit = <const TAction extends ActionsOf<TSchema>>(
		action: TAction,
		// biome-ignore lint/complexity/noBannedTypes: {} models "branch with no extra fields"
		...rest: {} extends FieldsOf<TSchema, TAction>
			? [fields?: FieldsOf<TSchema, TAction>]
			: [fields: FieldsOf<TSchema, TAction>]
	) => {
		const fields = (rest[0] ?? {}) as Record<string, unknown>;

		if (opts?.encType === "application/json") {
			fetcher.submit(
				{ _action: action, ...fields } as Parameters<typeof fetcher.submit>[0],
				{ method: "post", action: opts?.action, encType: "application/json" },
			);
			return;
		}

		const payload: Record<string, string> = { _action: action };
		for (const [name, value] of Object.entries(fields)) {
			if (value === undefined || value === null) continue;
			payload[name] = serializeFieldValue(value);
		}
		fetcher.submit(payload, { method: "post", action: opts?.action });
	};

	return { submit, fetcher, state: fetcher.state };
}
