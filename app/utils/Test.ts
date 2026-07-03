import type {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	Params,
} from "react-router";
import { expect } from "vitest";
import type { z } from "zod";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import { db, sql } from "~/db/sql";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { SESSION_KEY } from "~/features/auth/core/authenticator.server";
import { authSessionStorage } from "~/features/auth/core/session.server";
import {
	type AuthenticatedUser,
	getUserFromRequest,
	userAsyncLocalStorage,
} from "~/features/auth/core/user-context.server";
import { logger } from "./logger";

export function arrayContainsSameItems<T>(arr1: T[], arr2: T[]) {
	return (
		arr1.length === arr2.length && arr1.every((item) => arr2.includes(item))
	);
}

/**
 * Runs `fn` inside the user AsyncLocalStorage store so that repository functions
 * resolving the actor via `actorId()` / `actorIdOrNull()` see `user` as the acting
 * user. Use in direct repository unit tests, which run outside a request.
 */
export function withUser<T>(user: AuthenticatedUser, fn: () => T): T {
	return userAsyncLocalStorage.run({ user }, fn);
}

/**
 * Like {@link withUser} but takes only a user id, building a minimal acting-user
 * context. Convenient for repository data-setup in tests where only the actor's id
 * matters (repositories read the actor solely via `actorId()` / `actorIdOrNull()`).
 */
export function withUserId<T>(id: number, fn: () => T): T {
	return userAsyncLocalStorage.run(
		{ user: { id } as unknown as AuthenticatedUser },
		fn,
	);
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
export function wrappedAction<T extends z.ZodTypeAny>({
	action,
	/** Is this action submitted as json (via SendouForm) */
	isJsonSubmission = false,
}: {
	action: (args: ActionFunctionArgs) => any;
	isJsonSubmission?: boolean;
}) {
	return async (
		args: z.infer<T>,
		{
			user,
			params = {},
		}: { user?: "admin" | "regular"; params?: Params<string> } = {},
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
	}: {
		user?: "admin" | "regular";
		params?: Params<string>;
	} = {}) => {
		const request = new Request("http://app.com/path", {
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

async function authHeader(
	user?: "admin" | "regular",
): Promise<[string, string][]> {
	if (!user) return [];

	const session = await authSessionStorage.getSession();

	session.set(SESSION_KEY, user === "admin" ? ADMIN_ID : REGULAR_USER_TEST_ID);

	return [["Cookie", await authSessionStorage.commitSession(session)]];
}

/**
 * Resets all data in the database by deleting all rows from every table,
 * except for SQLite system tables and the 'migrations' table.
 *
 * @example
 * describe("My integration test", () => {
 *   beforeEach(async () => {
 *     await dbInsertUsers(2);
 *   });
 *
 *   afterEach(() => {
 *     dbReset();
 *   });
 *
 *   // tests go here
 * });
 */
export const dbReset = () => {
	// virtual tables and their shadow tables (e.g. UserSearch_data) can not be
	// deleted from directly; the fts index stays in sync via the User triggers
	const tables = sql
		.prepare(
			`SELECT name FROM sqlite_master
			WHERE type='table'
			AND name NOT LIKE 'sqlite_%'
			AND name NOT LIKE 'migrations'
			AND sql NOT LIKE 'CREATE VIRTUAL TABLE%'
			AND NOT EXISTS (
				SELECT 1 FROM sqlite_master AS vt
				WHERE vt.sql LIKE 'CREATE VIRTUAL TABLE%'
				AND sqlite_master.name LIKE vt.name || '_%'
			);`,
		)
		.all() as { name: string }[];

	sql.prepare("PRAGMA foreign_keys = OFF").run();
	for (const table of tables) {
		sql.prepare(`DELETE FROM "${table.name}"`).run();
	}
	sql.prepare("PRAGMA foreign_keys = ON").run();
};

/**
 * Inserts a specified number of user records into the "User" table in the database for integration testing.
 * 1) id: 1, discordName: "user1", discordId: "0"
 * 2) id: 2, discordName: "user2", discordId: "1"
 * 3) etc.
 *
 * @param count - The number of users to insert. Defaults to 2 if not provided.
 *
 * @example
 * // Inserts 5 users into the database
 * await dbInsertUsers(5);
 *
 * // Inserts 2 users (default)
 * await dbInsertUsers();
 */
export const dbInsertUsers = (count = 2) =>
	db
		.insertInto("User")
		.values(
			Array.from({ length: count }).map((_, i) => ({
				id: i + 1,
				discordName: `user${i + 1}`,
				discordId: String(i),
			})),
		)
		.execute();
