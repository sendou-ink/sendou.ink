import { describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserRepository from "./UserRepository.server";

describe("profile bio is always a string", () => {
	test("keeps a JSON-object-shaped bio as text (not a parsed object)", async () => {
		// a bio the user typed that happens to be valid JSON of object shape
		const user = await UserFactory.create({
			profile: { bio: '{"note":"gg"}' },
		});

		const profile = await UserRepository.findProfileByIdentifier(
			String(user.id),
		);

		// the profile page renders bio directly as a React child; an object would 500 the page
		expect(typeof profile?.bio).toBe("string");
	});
});
