import * as v from "valibot";
import type { FormObjectSchema } from "~/form/types";
import {
	buildFieldPath,
	getNestedValue,
	issuePathKeys,
	validateField,
} from "~/form/utils";

/**
 * The schema of a `SendouForm` as a remote `form()` validates it, on the server and as the client's preflight:
 * the same checks, with each field's issue worded the way the React forms word it (e.g. an empty required
 * field reads `forms:errors.required` rather than valibot's type error).
 *
 * @example
 * export const createAssociation = form(
 * 	remoteFormSchema(createNewAssociationSchema),
 * 	async (body, issue) => { ... },
 * );
 */
export function remoteFormSchema<TSchema extends FormObjectSchema>(
	schema: TSchema,
): TSchema {
	return {
		...schema,
		"~standard": {
			...schema["~standard"],
			validate: (input: unknown) => {
				const result = v.safeParse(schema, input);
				if (result.success) return { value: result.output };

				return { issues: fieldIssues(schema, input, result.issues) };
			},
		},
	};
}

function fieldIssues(
	schema: FormObjectSchema,
	input: unknown,
	issues: v.BaseIssue<unknown>[],
) {
	const values =
		typeof input === "object" && input !== null
			? (input as Record<string, unknown>)
			: {};
	const result: Array<{ message: string; path?: PropertyKey[] }> = [];
	const seenNames = new Set<string>();

	for (const issue of issues) {
		const keys = issuePathKeys(issue);
		const name = buildFieldPath(keys);
		if (name === null) {
			result.push({ message: issue.message });
			continue;
		}
		if (seenNames.has(name)) continue;
		seenNames.add(name);

		result.push({
			message:
				validateField(schema, name, getNestedValue(values, name)) ??
				issue.message,
			path: keys,
		});
	}

	return result;
}
