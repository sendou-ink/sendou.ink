import { describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import { loader } from "./user.$identifier";
import { loader as idsLoader } from "./user.$identifier.ids";

const userLoader = wrappedLoader<Response>({ loader });
const userIdsLoader = wrappedLoader<Response>({ loader: idsLoader });

describe("GET /api/user/:identifier", () => {
	test("returns a user", async () => {
		const user = await UserFactory.create();

		const response = await userLoader({
			params: { identifier: String(user.id) },
		});

		expect((await response.json()).id).toBe(user.id);
	});

	test("404s for a placeholder player", async () => {
		const placeholder = await UserFactory.createPlaceholder();

		await expect(
			userLoader({ params: { identifier: String(placeholder.id) } }),
		).rejects.toThrow("Response thrown with status code: 404");
	});
});

describe("GET /api/user/:identifier/ids", () => {
	test("404s for a placeholder player", async () => {
		const placeholder = await UserFactory.createPlaceholder();

		await expect(
			userIdsLoader({ params: { identifier: String(placeholder.id) } }),
		).rejects.toThrow("Response thrown with status code: 404");
	});
});
