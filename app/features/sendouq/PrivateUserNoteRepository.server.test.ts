import { describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { withUser } from "~/utils/Test";
import * as PrivateUserNoteRepository from "./PrivateUserNoteRepository.server";

const authorAndTarget = async () => {
	const { id: authorId } = await UserFactory.create();
	const target = await UserFactory.create();

	return {
		// xxx: why needed, is create not returning it?
		author: (await UserRepository.findLeanById(authorId))!,
		targetId: target.id,
	};
};

describe("PrivateUserNoteRepository", () => {
	describe("upsertOwnNote", () => {
		test("stamps the acting user as the author", async () => {
			const { author, targetId } = await authorAndTarget();

			await withUser(author, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId,
					sentiment: "POSITIVE",
					text: "good teammate",
				}),
			);

			const notes = await withUser(author, () =>
				PrivateUserNoteRepository.findAllOwn(),
			);

			expect(notes).toHaveLength(1);
			expect(notes[0]).toMatchObject({
				targetUserId: targetId,
				sentiment: "POSITIVE",
				text: "good teammate",
			});
		});

		test("updates an existing note on conflict", async () => {
			const { author, targetId } = await authorAndTarget();

			await withUser(author, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId,
					sentiment: "POSITIVE",
					text: "first",
				}),
			);
			await withUser(author, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId,
					sentiment: "NEGATIVE",
					text: "second",
				}),
			);

			const notes = await withUser(author, () =>
				PrivateUserNoteRepository.findAllOwn(),
			);

			expect(notes).toHaveLength(1);
			expect(notes[0].sentiment).toBe("NEGATIVE");
			expect(notes[0].text).toBe("second");
		});
	});

	describe("deleteOwnNote", () => {
		test("deletes the acting user's note", async () => {
			const { author, targetId } = await authorAndTarget();

			await withUser(author, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId,
					sentiment: "NEUTRAL",
					text: "note",
				}),
			);
			await withUser(author, () =>
				PrivateUserNoteRepository.deleteOwnNoteById(targetId),
			);

			const notes = await withUser(author, () =>
				PrivateUserNoteRepository.findAllOwn(),
			);

			expect(notes).toHaveLength(0);
		});
	});

	test("findAllOwn throws when called without an acting user", () => {
		expect(() => PrivateUserNoteRepository.findAllOwn()).toThrow();
	});
});
