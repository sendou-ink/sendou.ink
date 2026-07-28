import { describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withUserId } from "~/utils/Test";
import * as PrivateUserNoteRepository from "./PrivateUserNoteRepository.server";

const authorAndTarget = async () => {
	const [author, target] = await UserFactory.createMany(2);

	return { authorId: author.id, targetId: target.id };
};

describe("PrivateUserNoteRepository", () => {
	describe("upsertOwnNote", () => {
		test("stamps the acting user as the author", async () => {
			const { authorId, targetId } = await authorAndTarget();

			await withUserId(authorId, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId,
					sentiment: "POSITIVE",
					text: "good teammate",
				}),
			);

			const notes = await withUserId(authorId, () =>
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
			const { authorId, targetId } = await authorAndTarget();

			await withUserId(authorId, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId,
					sentiment: "POSITIVE",
					text: "first",
				}),
			);
			await withUserId(authorId, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId,
					sentiment: "NEGATIVE",
					text: "second",
				}),
			);

			const notes = await withUserId(authorId, () =>
				PrivateUserNoteRepository.findAllOwn(),
			);

			expect(notes).toHaveLength(1);
			expect(notes[0].sentiment).toBe("NEGATIVE");
			expect(notes[0].text).toBe("second");
		});
	});

	describe("deleteOwnNote", () => {
		test("deletes the acting user's note", async () => {
			const { authorId, targetId } = await authorAndTarget();

			await withUserId(authorId, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId,
					sentiment: "NEUTRAL",
					text: "note",
				}),
			);
			await withUserId(authorId, () =>
				PrivateUserNoteRepository.deleteOwnNoteById(targetId),
			);

			const notes = await withUserId(authorId, () =>
				PrivateUserNoteRepository.findAllOwn(),
			);

			expect(notes).toHaveLength(0);
		});
	});

	test("findAllOwn throws when called without an acting user", () => {
		expect(() => PrivateUserNoteRepository.findAllOwn()).toThrow();
	});
});
