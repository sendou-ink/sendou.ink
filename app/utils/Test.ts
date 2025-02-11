import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import type { Params } from "@remix-run/react";
import type { z } from "zod";
import { ADMIN_ID } from "~/constants";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import { db, sql } from "~/db/sql";
import { SESSION_KEY } from "~/features/auth/core/authenticator.server";
import { authSessionStorage } from "~/features/auth/core/session.server";

export function arrayContainsSameItems<T>(arr1: T[], arr2: T[]) {
	return (
		arr1.length === arr2.length && arr1.every((item) => arr2.includes(item))
	);
}

export function wrappedAction<T extends z.ZodTypeAny>({
	action,
}: {
	// TODO: strongly type this
	action: (args: ActionFunctionArgs) => any;
}) {
	return async (
		args: z.infer<T>,
		{
			user,
			params = {},
		}: { user?: "admin" | "regular"; params?: Params<string> } = {},
	) => {
		const body = new URLSearchParams(args);
		const request = new Request("http://app.com/path", {
			method: "POST",
			body,
			headers: await authHeader(user),
		});

		try {
			const response = await action({
				request,
				context: {},
				params,
			});

			return response;
		} catch (thrown) {
			if (thrown instanceof Response) {
				// it was a redirect
				if (thrown.status === 302) return thrown;

				throw new Error(`Response thrown with status code: ${thrown.status}`);
			}

			throw thrown;
		}
	};
}

export function wrappedLoader<T>({
	loader,
}: {
	// TODO: strongly type this
	loader: (args: LoaderFunctionArgs) => any;
}) {
	return async ({
		user,
		params = {},
	}: { user?: "admin" | "regular"; params?: Params<string> } = {}) => {
		const request = new Request("http://app.com/path", {
			method: "GET",
			headers: await authHeader(user),
		});

		try {
			const data = await loader({
				request,
				params,
				context: {},
			});

			return data as T;
		} catch (thrown) {
			if (thrown instanceof Response) {
				throw new Error(`Response thrown with status code: ${thrown.status}`);
			}

			throw thrown;
		}
	};
}

async function authHeader(user?: "admin" | "regular"): Promise<HeadersInit> {
	if (!user) return [];

	const session = await authSessionStorage.getSession();

	session.set(SESSION_KEY, user === "admin" ? ADMIN_ID : REGULAR_USER_TEST_ID);

	return [["Cookie", await authSessionStorage.commitSession(session)]];
}

export const dbReset = () => {
	const tables = sql
		.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'migrations';",
		)
		.all() as { name: string }[];

	sql.prepare("PRAGMA foreign_keys = OFF").run();
	for (const table of tables) {
		sql.prepare(`DELETE FROM "${table.name}"`).run();
	}
	sql.prepare("PRAGMA foreign_keys = ON").run();
};

export const dbInsertUsers = (count?: number) =>
	db
		.insertInto("User")
		.values(
			// defaults to 2 = admin & regular "NZAP"
			Array.from({ length: count ?? 2 }).map((_, i) => ({
				id: i + 1,
				discordName: `user${i + 1}`,
				discordId: String(i),
			})),
		)
		.execute();
