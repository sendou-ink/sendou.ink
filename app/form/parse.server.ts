import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { imageFieldValueToImgId } from "~/features/img-upload/image-field.server";
import { formDataToObject } from "~/utils/remix.server";
import type { AnySchema } from "~/utils/schema";
import { formRegistry } from "./fields";
import type { ImageFieldValue } from "./image-field";
import { buildFieldPath, issuePathKeys } from "./utils";

export type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; fieldErrors: Record<string, string> };

/**
 * Ceiling for a request body, in bytes. Sized to fit a form with a couple of `image()` fields (each
 * capped at ~3M base64 characters) plus its other fields. Forms that legitimately submit more (e.g.
 * art) pass their own `maxBodyBytes`.
 */
const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Maps validation issues to field-level errors keyed by form field name
 * (e.g. `members[0].userId`), keeping the first error per field.
 */
function fieldErrorsFromIssues(
	issues: v.BaseIssue<unknown>[],
): Record<string, string> {
	const fieldErrors: Record<string, string> = {};
	for (const issue of issues) {
		const path = buildFieldPath(issuePathKeys(issue));
		if (path && !fieldErrors[path]) {
			fieldErrors[path] = issue.message;
		}
	}

	return fieldErrors;
}

/**
 * Parses request body against a schema.
 * Handles both JSON (SendouForm) and form data (FormWithConfirm) based on Content-Type.
 * Returns parsed data on success, or field-level errors on validation failure.
 */
export async function parseFormData<T extends AnySchema>({
	request,
	schema,
	maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
}: {
	request: Request;
	schema: T;
	/** Overrides {@link DEFAULT_MAX_BODY_BYTES} for forms that legitimately submit a bigger body. */
	maxBodyBytes?: number;
}): Promise<ParseResult<v.InferOutput<T>>> {
	const data = await requestBodyToObject(request, maxBodyBytes);

	const result = await v.safeParseAsync(schema, data);

	if (result.success) {
		return { success: true, data: result.output };
	}

	return {
		success: false,
		fieldErrors: fieldErrorsFromIssues([...result.issues]),
	};
}

/** Image field values collapse to their stored id; everything else passes through. */
type ResolvedImages<T> = T extends unknown
	? { [K in keyof T]: T[K] extends ImageFieldValue ? number | null : T[K] }
	: never;

/**
 * Like {@link parseFormData}, but additionally resolves every `image()` field in the schema to the
 * image id to store on the consuming FK column (`number | null`) via {@link imageFieldValueToImgId}
 * — uploading newly picked images, keeping unchanged ones, and clearing removed ones. The schema
 * may be a single object or a union of objects (e.g. an `_action` discriminated form). The
 * consuming action receives a plain id per image field and only writes it to its own entity.
 */
export async function parseFormDataWithImages<T extends AnySchema>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<ParseResult<ResolvedImages<v.InferOutput<T>>>> {
	const result = await parseFormData({ request, schema });
	if (!result.success) return result;

	const user = requireUser();
	const data = { ...(result.data as Record<string, unknown>) };

	for (const { key, autoValidate } of imageFields(schema)) {
		if (key in data) {
			data[key] = await imageFieldValueToImgId({
				value: data[key] as ImageFieldValue,
				user,
				autoValidate,
			});
		}
	}

	return { success: true, data: data as ResolvedImages<v.InferOutput<T>> };
}

/**
 * Collects every `image()` field across a schema object or union/variant of objects, along with each
 * field's `autoValidate` flag (whether its uploads bypass the moderator queue).
 */
function imageFields(
	schema: AnySchema,
): Array<{ key: string; autoValidate: boolean }> {
	const objects =
		schema.type === "union" || schema.type === "variant"
			? ((schema as unknown as { options: AnySchema[] }).options.filter(
					(option) => option.type === "object",
				) as unknown as Array<{ entries: Record<string, AnySchema> }>)
			: schema.type === "object"
				? [schema as unknown as { entries: Record<string, AnySchema> }]
				: [];

	const fields = new Map<string, boolean>();
	for (const object of objects) {
		for (const [key, fieldSchema] of Object.entries(object.entries)) {
			const meta = formRegistry.get(fieldSchema);
			if (meta?.type === "image") {
				fields.set(key, meta.autoValidate ?? false);
			}
		}
	}

	return [...fields].map(([key, autoValidate]) => ({ key, autoValidate }));
}

/**
 * Reads the request body into the plain object the schema parses, refusing anything over
 * `maxBytes`. `Content-Length` is checked up front so an oversized body is rejected before a byte
 * of it is read.
 */
async function requestBodyToObject(request: Request, maxBytes: number) {
	if (Number(request.headers.get("Content-Length")) > maxBytes) {
		throw payloadTooLarge();
	}

	if (request.headers.get("Content-Type") === "application/json") {
		return JSON.parse(await readBodyText(request, maxBytes));
	}

	return formDataToObject(await request.formData());
}

/**
 * Reads the body as text, aborting the stream as soon as `maxBytes` is exceeded. The running total
 * is enforced (rather than trusting `Content-Length`) so a chunked body that omits or understates
 * the header can't be buffered in full either.
 */
async function readBodyText(request: Request, maxBytes: number) {
	const reader = request.body?.getReader();
	if (!reader) return "";

	const decoder = new TextDecoder();
	let bytesRead = 0;
	let text = "";

	let chunk = await reader.read();
	while (!chunk.done) {
		bytesRead += chunk.value.byteLength;
		if (bytesRead > maxBytes) {
			await reader.cancel();
			throw payloadTooLarge();
		}

		text += decoder.decode(chunk.value, { stream: true });
		chunk = await reader.read();
	}

	return text + decoder.decode();
}

function payloadTooLarge() {
	return new Response(null, { status: 413 });
}
