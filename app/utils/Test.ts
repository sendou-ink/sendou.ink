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

/** User a wrapped action/loader runs as: a pinned seed user or any user id (e.g. one the test created). */
export type TestUser = "admin" | "regular" | number;

export function arrayContainsSameItems<T>(arr1: T[], arr2: T[]) {
	return (
		arr1.length === arr2.length && arr1.every((item) => arr2.includes(item))
	);
}

/** Runs `fn` with the user as the actor (`actorId()` / `actorIdOrNull()`), for repository tests outside a request. */
export function withUserId<T>(id: number, fn: () => T): T {
	return actAs(id, fn);
}

/** Runs `fn` with no acting user (`actorIdOrNull()` is `null`), like an anonymous visitor's request. */
export function withNoUser<T>(fn: () => T): T {
	return userAsyncLocalStorage.run({ user: undefined }, fn);
}

/**
 * Wraps an action into a typed function for unit tests: takes the schema's output as args and
 * simulates a request authenticated as the given user.
 *
 * @example
 * const someAction = wrappedAction<typeof someActionSchema>({ action });
 */
export function wrappedAction<T extends AnySchema>({
	action,
	/** submitted as json (via SendouForm) */
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
				// vitest only shows logs for failed tests, so this just adds context
				logger.error("Error in wrappedAction:", thrown);

				if (thrown instanceof Response) {
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

/** Asserts the response is an error toast redirect (via `errorToastIfFalsy` etc.), optionally with the given message. */
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
