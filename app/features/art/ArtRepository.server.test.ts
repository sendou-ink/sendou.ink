import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as ArtRepository from "./ArtRepository.server";

let imageCounter = 0;

const createArt = async ({ authorId }: { authorId: number }) => {
	imageCounter++;

	return ArtRepository.insert({
		authorId,
		url: `https://example.com/image-${authorId}-${imageCounter}.png`,
		validatedAt: Date.now(),
		description: null,
		linkedUsers: [],
		tags: [],
	});
};

describe("findShowcaseArts", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("shows one art per artist", async () => {
		await createArt({ authorId: 1 });
		await createArt({ authorId: 2 });
		await createArt({ authorId: 3 });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(3);
		const authorIds = result.map((art) => art.author?.discordId);
		expect(new Set(authorIds).size).toBe(3);
	});

	test("prioritizes showcase art over regular art for same artist", async () => {
		// first create art should be showcase
		const id = await createArt({ authorId: 1 });
		await createArt({ authorId: 1 });

		const result = await ArtRepository.findShowcaseArts();

		expect(result[0].id).toBe(id);
	});

	test("shows only one art per artist even with multiple pieces", async () => {
		await createArt({ authorId: 1 });
		await createArt({ authorId: 1 });
		await createArt({ authorId: 1 });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(1);
	});

	test("shows artist even if no showcase art exists", async () => {
		const showcaseArtId = await createArt({ authorId: 1 });
		const nonShowcaseArtId = await createArt({ authorId: 1 });

		await ArtRepository.deleteById(showcaseArtId);

		const result = await ArtRepository.findShowcaseArts();
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(nonShowcaseArtId);
	});

	test("returns empty array when no art exists", async () => {
		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(0);
	});
});

describe("findAllTags", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns all art tags", async () => {
		imageCounter++;
		await ArtRepository.insert({
			authorId: 1,
			url: `https://example.com/image-1-${imageCounter}.png`,
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [],
			tags: [{ name: "Character" }, { name: "Weapon" }, { name: "Landscape" }],
		});

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

describe("unlinkUserFromArt", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("removes user link from art", async () => {
		const artId = await ArtRepository.insert({
			authorId: 1,
			url: "https://example.com/image-1.png",
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [2],
			tags: [],
		});

		await ArtRepository.unlinkUserFromArt({ userId: 2, artId });

		const result = await ArtRepository.findArtsByUserId(2, {
			includeAuthored: false,
		});
		expect(result).toHaveLength(0);
	});
});

describe("findShowcaseArtsByTag", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns arts filtered by tag", async () => {
		const art1Id = await ArtRepository.insert({
			authorId: 1,
			url: "https://example.com/image-1.png",
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [],
			tags: [{ name: "Character" }],
		});

		await ArtRepository.insert({
			authorId: 2,
			url: "https://example.com/image-2.png",
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [],
			tags: [{ name: "Weapon" }],
		});

		const tags = await ArtRepository.findAllTags();
		const characterTag = tags.find((t) => t.name === "Character");

		const result = await ArtRepository.findShowcaseArtsByTag(
			characterTag?.id ?? 0,
		);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(art1Id);
	});

	test("shows only one art per artist", async () => {
		await ArtRepository.insert({
			authorId: 1,
			url: "https://example.com/image-1.png",
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [],
			tags: [{ name: "Character" }],
		});

		const tags = await ArtRepository.findAllTags();
		const characterTag = tags.find((t) => t.name === "Character");

		await ArtRepository.insert({
			authorId: 1,
			url: "https://example.com/image-2.png",
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [],
			tags: [{ id: characterTag?.id }],
		});

		const result = await ArtRepository.findShowcaseArtsByTag(
			characterTag?.id ?? 0,
		);

		expect(result).toHaveLength(1);
	});
});

describe("findRecentlyUploadedArts", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns recently uploaded arts", async () => {
		const artId = await createArt({ authorId: 1 });

		const result = await ArtRepository.findRecentlyUploadedArts();

		expect(result.length).toBeGreaterThan(0);
		expect(result.some((art) => art.id === artId)).toBe(true);
	});
});

describe("findArtsByUserId", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns authored art", async () => {
		const artId = await createArt({ authorId: 1 });

		const result = await ArtRepository.findArtsByUserId(1);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(artId);
	});

	test("returns tagged art", async () => {
		const artId = await ArtRepository.insert({
			authorId: 1,
			url: "https://example.com/image-1.png",
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [2],
			tags: [],
		});

		const result = await ArtRepository.findArtsByUserId(2);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(artId);
	});
});

describe("deleteById", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("deletes art by id", async () => {
		const artId = await createArt({ authorId: 1 });

		await ArtRepository.deleteById(artId);

		const result = await ArtRepository.findArtsByUserId(1);
		expect(result).toHaveLength(0);
	});

	test("deletes only the specified art", async () => {
		const firstArtId = await createArt({ authorId: 1 });
		const secondArtId = await createArt({ authorId: 1 });

		await ArtRepository.deleteById(firstArtId);

		const result = await ArtRepository.findArtsByUserId(1);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(secondArtId);
	});
});

describe("insert", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("inserts art with all metadata", async () => {
		const artId = await ArtRepository.insert({
			authorId: 1,
			url: "https://example.com/image-1.png",
			validatedAt: Date.now(),
			description: "Test description",
			linkedUsers: [2],
			tags: [{ name: "Character" }],
		});

		const result = await ArtRepository.findArtsByUserId(1);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(artId);
		expect(result[0].description).toBe("Test description");
		expect(result[0].tags).toHaveLength(1);
		expect(result[0].linkedUsers).toHaveLength(1);
	});

	test("sets first art as showcase", async () => {
		await createArt({ authorId: 1 });

		const result = await ArtRepository.findArtsByUserId(1);

		expect(result[0].isShowcase).toBe(true);
	});
});

describe("update", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("updates art metadata", async () => {
		const artId = await ArtRepository.insert({
			authorId: 1,
			url: "https://example.com/image-1.png",
			validatedAt: Date.now(),
			description: "Original",
			linkedUsers: [2],
			tags: [{ name: "Character" }],
		});

		await ArtRepository.update(artId, {
			description: "Updated",
			linkedUsers: [3],
			tags: [{ name: "Weapon" }],
			isShowcase: 1,
		});

		const result = await ArtRepository.findArtsByUserId(1);

		expect(result[0].description).toBe("Updated");
		expect(result[0].linkedUsers).toHaveLength(1);
		expect(result[0].linkedUsers?.[0].id).toBe(3);
		expect(result[0].tags).toHaveLength(1);
		expect(result[0].tags?.[0].name).toBe("Weapon");
	});

	test("unsets other showcase art when setting new showcase", async () => {
		const firstArtId = await createArt({ authorId: 1 });
		const secondArtId = await createArt({ authorId: 1 });

		await ArtRepository.update(secondArtId, {
			description: null,
			linkedUsers: [],
			tags: [],
			isShowcase: 1,
		});

		const result = await ArtRepository.findArtsByUserId(1);

		expect(result).toHaveLength(2);
		const showcaseArt = result.find((art) => art.id === secondArtId);
		const nonShowcaseArt = result.find((art) => art.id === firstArtId);
		expect(showcaseArt?.isShowcase).toBe(true);
		expect(nonShowcaseArt?.isShowcase).toBe(false);
	});
});
