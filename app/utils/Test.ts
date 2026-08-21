import type {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	Params,
} from "react-router";
import type * as v from "valibot";
import { expect } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import { actAs } from "~/db/seed/core/actAs";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { SESSION_KEY } from "~/features/auth/core/authenticator.server";
import { authSessionStorage } from "~/features/auth/core/session.server";
import {
	getUserFromRequest,
	userAsyncLocalStorage,
} from "~/features/auth/core/user-context.server";
import type { AnySchema } from "~/utils/schema";
import { logger } from "./logger";

/**
 * The user a wrapped action/loader call runs as: one of the pinned seed users,
 * or any user's id — scenario tests' users are participants and staff the test
 * itself created, not fixed ids.
 */
export type TestUser = "admin" | "regular" | number;

export function arrayContainsSameItems<T>(arr1: T[], arr2: T[]) {
	return (
		arr1.length === arr2.length && arr1.every((item) => arr2.includes(item))
	);
}

/**
 * Runs `fn` inside the user AsyncLocalStorage store so that repository functions
 * resolving the actor via `actorId()` / `actorIdOrNull()` see the user as the acting
 * one. Use in direct repository unit tests, which run outside a request.
 *
 * An id is all it takes: repositories read the actor solely through `actorId()`.
 */
export function withUserId<T>(id: number, fn: () => T): T {
	return actAs(id, fn);
}

/**
 * Runs `fn` inside a user AsyncLocalStorage store with no acting user, mirroring an
 * anonymous visitor's request. Repository functions resolving the actor via
 * `actorIdOrNull()` then see `null`, as they would inside a real request context.
 */
export function withNoUser<T>(fn: () => T): T {
	return userAsyncLocalStorage.run({ user: undefined }, fn);
}

/**
 * Wraps an action function to provide a strongly-typed, reusable handler for executing actions
 * in unit tests as if it was a normal function. The returned function allows you to pass
 * parameters that match the schema defined by the action, and it simulates a request with
 * authentication headers based on the provided user type.
 *
 * @example
 * import { someAction } from "../actions/some.action.server";
 *
 * const someAction = wrappedAction<typeof someActionSchema>({ action });
 */
export function wrappedAction<T extends AnySchema>({
	action,
	/** Is this action submitted as json (via SendouForm) */
	isJsonSubmission = false,
}: {
	action: (args: ActionFunctionArgs) => any;
	isJsonSubmission?: boolean;
}) {
	return async (
		args: v.InferOutput<T>,
		{ user, params = {} }: { user?: TestUser; params?: Params<string> } = {},
	) => {
		const body = isJsonSubmission
			? JSON.stringify(args)
			: new URLSearchParams(args as any);
		const request = new Request("http://app.com/path", {
			method: "POST",
			body,
			headers: [
				...(await authHeader(user)),
				[
					"Content-Type",
					isJsonSubmission
						? "application/json"
						: "application/x-www-form-urlencoded",
				],
			],
		});

		const userFromRequest = await getUserFromRequest(
			request,
			new URL(request.url),
		);

		return userAsyncLocalStorage.run({ user: userFromRequest }, async () => {
			try {
				const response = await action({
					request,
					context: {} as any,
					params,
					pattern: "",
					url: new URL(request.url),
				});

				return response;
			} catch (thrown) {
				// we only log errors in vitest for failed tests so this is okay (more context)
				logger.error("Error in wrappedAction:", thrown);

				if (thrown instanceof Response) {
					// it was a redirect
					if (thrown.status === 302) return thrown;

					throw new Error(`Response thrown with status code: ${thrown.status}`);
				}

				throw thrown;
			}
		});
	};
}

export function wrappedLoader<T>({
	loader,
}: {
	loader: (args: LoaderFunctionArgs) => any;
}) {
	return async ({
		user,
		params = {},
		url = "/path",
	}: {
		user?: TestUser;
		params?: Params<string>;
		/** Path with its search params, built with the route's search params definition. */
		url?: string;
	} = {}) => {
		const request = new Request(new URL(url, "http://app.com"), {
			method: "GET",
			headers: [
				...(await authHeader(user)),
				["Content-Type", "application/x-www-form-urlencoded"],
			],
		});

		const userFromRequest = await getUserFromRequest(
			request,
			new URL(request.url),
		);

		return userAsyncLocalStorage.run({ user: userFromRequest }, async () => {
			try {
				const data = await loader({
					request,
					params,
					context: {} as any,
					pattern: "",
					url: new URL(request.url),
				});

				return data as T;
			} catch (thrown) {
				if (thrown instanceof Response) {
					throw new Error(`Response thrown with status code: ${thrown.status}`);
				}

				throw thrown;
			}
		});
	};
}

/**
 * Asserts that the given response errored out (with a toast message, via `errorToastIfFalsy(cond)` call)
 *
 * @param response - The HTTP response object to check.
 * @param message - Optional. The expected error toast message shown to the user.
 */
export function assertResponseErrored(response: Response, message?: string) {
	if (!response) {
		throw new Error(`Expected a Response, got: ${response}`);
	}

	expect(response.headers.get("Location")).toContain("?__error=");
	if (message) {
		expect(response.headers.get("Location")).toContain(message);
	}
}

async function authHeader(user?: TestUser): Promise<[string, string][]> {
	if (user === undefined) return [];

	const session = await authSessionStorage.getSession();

	session.set(SESSION_KEY, testUserId(user));

	return [["Cookie", await authSessionStorage.commitSession(session)]];
}

function testUserId(user: Exclude<TestUser, undefined>): number {
	if (typeof user === "number") return user;

	return user === "admin" ? ADMIN_ID : REGULAR_USER_TEST_ID;
}
