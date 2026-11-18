import { describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { withUserId } from "~/utils/Test";
import * as PrivateUserNoteRepository from "./PrivateUserNoteRepository.server";

const authorAndTarget = async () => {
	const [author, target] = await UserFactory.createMany(2);

	return { authorId: author.id, targetId: target.id };
};

const privateNoteSeenBy = async (authorId: number, targetId: number) => {
	const { userCards } = await withUserId(authorId, () =>
		UserCardRepository.findAllByUserIds({ userIds: [targetId] }),
	);

	return userCards[targetId]?.privateNote;
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

			expect(await privateNoteSeenBy(authorId, targetId)).toMatchObject({
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

			expect(await privateNoteSeenBy(authorId, targetId)).toMatchObject({
				sentiment: "NEGATIVE",
				text: "second",
			});
		});

		test("throws when called without an acting user", () => {
			expect(() =>
				PrivateUserNoteRepository.upsertOwnNote({
					targetId: 1,
					sentiment: "NEUTRAL",
					text: "note",
				}),
			).toThrow();
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

			expect(await privateNoteSeenBy(authorId, targetId)).toBeNull();
		});
	});
});
