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

		// `User.bio` is a text column; the loader types it as `string | null` and the
		// profile page renders it directly as a React child. If it comes back as an
		// object, `<article>{data.user.bio}</article>` throws "Objects are not valid
		// as a React child" and the whole profile page 500s.
		expect(typeof profile?.bio).toBe("string");
	});
});
