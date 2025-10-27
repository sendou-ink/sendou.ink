import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as ArtRepository from "./ArtRepository.server";

let imageCounter = 0;

const createUserSubmittedImage = async (userId: number) => {
	imageCounter++;

	// TODO: instead of using db, use ArtRepository's insert when implemented
	const result = await db
		.insertInto("UnvalidatedUserSubmittedImage")
		.values({
			url: `https://example.com/image-${userId}-${imageCounter}.png`,
			submitterUserId: userId,
			validatedAt: Date.now(),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	return result.id;
};

const createArt = async ({
	authorId,
	isShowcase = 0,
	createdAt,
}: {
	authorId: number;
	isShowcase?: 0 | 1;
	createdAt?: number;
}) => {
	const imgId = await createUserSubmittedImage(authorId);

	await db
		.insertInto("Art")
		.values({
			authorId,
			imgId,
			isShowcase,
			description: null,
			createdAt: createdAt ?? Date.now(),
		})
		.execute();
};

describe("findShowcaseArts", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("shows one art per artist when all have showcase art", async () => {
		await createArt({ authorId: 1, isShowcase: 1 });
		await createArt({ authorId: 2, isShowcase: 1 });
		await createArt({ authorId: 3, isShowcase: 1 });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(3);
		const authorIds = result.map((art) => art.author?.discordId);
		expect(new Set(authorIds).size).toBe(3);
	});

	test("prioritizes showcase art over regular art for same artist", async () => {
		const now = Date.now();

		await createArt({ authorId: 1, isShowcase: 0, createdAt: now + 1000 });
		await createArt({ authorId: 1, isShowcase: 1, createdAt: now });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(1);
		expect(result[0].createdAt).toBe(now);
	});

	test("shows most recent art for artist without showcase art", async () => {
		const now = Date.now();

		await createArt({ authorId: 1, isShowcase: 0, createdAt: now });
		await createArt({ authorId: 1, isShowcase: 0, createdAt: now + 1000 });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(1);
		expect(result[0].createdAt).toBe(now + 1000);
	});

	test("shows only one art per artist even with multiple showcase pieces", async () => {
		const now = Date.now();

		await createArt({ authorId: 1, isShowcase: 1, createdAt: now });
		await createArt({ authorId: 1, isShowcase: 1, createdAt: now + 1000 });
		await createArt({ authorId: 1, isShowcase: 1, createdAt: now + 2000 });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(1);
		expect(result[0].createdAt).toBe(now + 2000);
	});

	test("handles mix of artists with and without showcase art", async () => {
		const now = Date.now();

		await createArt({ authorId: 1, isShowcase: 1, createdAt: now });
		await createArt({ authorId: 2, isShowcase: 0, createdAt: now + 1000 });
		await createArt({ authorId: 2, isShowcase: 0, createdAt: now + 2000 });
		await createArt({ authorId: 3, isShowcase: 1, createdAt: now + 3000 });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(3);

		const author1Art = result.find((art) => art.author?.discordId === "0");
		const author2Art = result.find((art) => art.author?.discordId === "1");

		expect(author1Art?.createdAt).toBe(now);
		expect(author2Art?.createdAt).toBe(now + 2000);
	});

	test("returns empty array when no art exists", async () => {
		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(0);
	});
});

describe("findAllTags", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns all art tags", async () => {
		await db
			.insertInto("ArtTag")
			.values([
				{ authorId: 1, name: "Character" },
				{ authorId: 1, name: "Weapon" },
				{ authorId: 1, name: "Landscape" },
			])
			.execute();

		const result = await ArtRepository.findAllTags();

		expect(result).toHaveLength(3);
		expect(result.map((t) => t.name).sort()).toEqual([
			"Character",
			"Landscape",
			"Weapon",
		]);
	});

	test("returns empty array when no tags exist", async () => {
		const result = await ArtRepository.findAllTags();

		expect(result).toHaveLength(0);
	});
});
