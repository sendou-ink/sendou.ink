import type { ActionFunctionArgs } from "react-router";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { idObject } from "~/utils/schema";
import { defineAction } from "./define-action.server";
import { RENDERS_FIELD_ERRORS_KEY } from "./utils";

const bodySchema = v.object({ name: v.pipe(v.string(), v.minLength(1)) });

const echoAction = defineAction(
	{ params: idObject, body: bodySchema },
	async ({ params, body }) => ({ params, body }),
);

describe("defineAction", () => {
	test("passes parsed params and body to the handler", async () => {
		const result = await echoAction(
			actionArgs({ params: { id: "1" }, body: { name: "Team" } }),
		);

		expect(result).toEqual({ params: { id: 1 }, body: { name: "Team" } });
	});

	test("strips the field errors marker from the body", async () => {
		const result = await echoAction(
			actionArgs({
				params: { id: "1" },
				body: { name: "Team", [RENDERS_FIELD_ERRORS_KEY]: true },
			}),
		);

		expect(result).toEqual({ params: { id: 1 }, body: { name: "Team" } });
	});

	test("throws 404 when params fail their schema", async () => {
		const thrown = await captureThrown(() =>
			echoAction(actionArgs({ params: { id: "x" }, body: { name: "Team" } })),
		);

		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(404);
	});

	test("returns field errors for an invalid body when the submitter renders them", async () => {
		const result = await echoAction(
			actionArgs({
				params: { id: "1" },
				body: { name: "", [RENDERS_FIELD_ERRORS_KEY]: true },
			}),
		);

		expect(result).toEqual({ fieldErrors: { name: expect.any(String) } });
	});

	test("throws an error toast redirect for an invalid body otherwise", async () => {
		const thrown = await captureThrown(() =>
			echoAction(actionArgs({ params: { id: "1" }, body: { name: "" } })),
		);

		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(302);
		expect((thrown as Response).headers.get("Location")).toContain("__error");
	});

	test("throws 400 for an invalid body with onInvalidBody badRequest", async () => {
		const action = defineAction(
			{ body: bodySchema, onInvalidBody: "badRequest" },
			async ({ body }) => body,
		);

		const thrown = await captureThrown(() =>
			action(actionArgs({ params: {}, body: { name: "" } })),
		);

		expect((thrown as Response).status).toBe(400);
	});

	test("throws 400 for a malformed JSON body", async () => {
		const request = new Request("http://app.com/path", {
			method: "POST",
			body: "{",
			headers: { "Content-Type": "application/json" },
		});

		const thrown = await captureThrown(() =>
			echoAction({ ...actionArgs({ params: { id: "1" }, body: {} }), request }),
		);

		expect((thrown as Response).status).toBe(400);
	});

	test("reads an empty body as an empty object", async () => {
		const action = defineAction(
			{ body: v.object({ returnTo: v.optional(v.string()) }) },
			async ({ body }) => body,
		);

		const result = await action(actionArgs({ params: {}, body: "" }));

		expect(result).toEqual({});
	});

	test("reads a JSON body sent without a JSON content type", async () => {
		const result = await echoAction(
			actionArgs({
				params: { id: "1" },
				body: JSON.stringify({ name: "Team" }),
			}),
		);

		expect(result).toEqual({ params: { id: 1 }, body: { name: "Team" } });
	});

	test("reads form data bodies", async () => {
		const result = await echoAction(
			actionArgs({
				params: { id: "1" },
				body: new URLSearchParams({ name: "Team" }),
			}),
		);

		expect(result).toEqual({ params: { id: 1 }, body: { name: "Team" } });
	});

	test("leaves params raw and skips the body without schemas", async () => {
		const action = defineAction(async ({ params }) => params);

		const result = await action(
			actionArgs({ params: { slug: "abc" }, body: "not json" }),
		);

		expect(result).toEqual({ slug: "abc" });
	});
});

function actionArgs({
	params,
	body,
}: {
	params: Record<string, string>;
	body: Record<string, unknown> | URLSearchParams | string;
}): ActionFunctionArgs {
	const isJson = typeof body === "object" && !(body instanceof URLSearchParams);
	const request = new Request("http://app.com/path", {
		method: "POST",
		body: isJson ? JSON.stringify(body) : body,
		headers: isJson ? { "Content-Type": "application/json" } : {},
	});

	return {
		request,
		params,
		context: {} as ActionFunctionArgs["context"],
		pattern: "",
		url: new URL(request.url),
	};
}

async function captureThrown(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (thrown) {
		return thrown;
	}

	throw new Error("Expected to throw");
}
