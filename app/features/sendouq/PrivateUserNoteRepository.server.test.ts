import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { dbInsertUsers, dbReset, withUser } from "~/utils/Test";
import * as PrivateUserNoteRepository from "./PrivateUserNoteRepository.server";

const authorAndTarget = async () => {
	await dbInsertUsers(2);
	const author = (await UserRepository.findLeanById(1))!;
	return { author };
};

describe("PrivateUserNoteRepository", () => {
	afterEach(() => {
		dbReset();
	});

	describe("upsertOwnNote", () => {
		beforeEach(async () => {
			await authorAndTarget();
		});

		test("stamps the acting user as the author", async () => {
			const author = (await UserRepository.findLeanById(1))!;

			await withUser(author, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId: 2,
					sentiment: "POSITIVE",
					text: "good teammate",
				}),
			);

			const notes = await withUser(author, () =>
				PrivateUserNoteRepository.ownNotes(),
			);

			expect(notes).toHaveLength(1);
			expect(notes[0]).toMatchObject({
				targetUserId: 2,
				sentiment: "POSITIVE",
				text: "good teammate",
			});
		});

		test("updates an existing note on conflict", async () => {
			const author = (await UserRepository.findLeanById(1))!;

			await withUser(author, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId: 2,
					sentiment: "POSITIVE",
					text: "first",
				}),
			);
			await withUser(author, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId: 2,
					sentiment: "NEGATIVE",
					text: "second",
				}),
			);

			const notes = await withUser(author, () =>
				PrivateUserNoteRepository.ownNotes(),
			);

			expect(notes).toHaveLength(1);
			expect(notes[0].sentiment).toBe("NEGATIVE");
			expect(notes[0].text).toBe("second");
		});
	});

	describe("deleteOwnNote", () => {
		beforeEach(async () => {
			await authorAndTarget();
		});

		test("deletes the acting user's note", async () => {
			const author = (await UserRepository.findLeanById(1))!;

			await withUser(author, () =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId: 2,
					sentiment: "NEUTRAL",
					text: "note",
				}),
			);
			await withUser(author, () =>
				PrivateUserNoteRepository.deleteOwnNoteById(2),
			);

			const notes = await withUser(author, () =>
				PrivateUserNoteRepository.ownNotes(),
			);

			expect(notes).toHaveLength(0);
		});
	});

	test("ownNotes throws when called without an acting user", () => {
		expect(() => PrivateUserNoteRepository.ownNotes()).toThrow();
	});
});
