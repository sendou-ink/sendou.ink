import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dbReset, withUserId } from "~/utils/Test";
import * as ArtRepository from "./ArtRepository.server";

let imageCounter = 0;
let users: Array<{ id: number }>;

const userId = (position: number) => users[position - 1].id;

const createArt = async ({ authorId }: { authorId: number }) => {
	imageCounter++;

	const art = await withUserId(authorId, () =>
		ArtRepository.insert({
			url: `https://example.com/image-${authorId}-${imageCounter}.png`,
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [],
			tags: [],
		}),
	);

	return art.id;
};

describe("findShowcaseArts", () => {
	beforeEach(async () => {
		imageCounter = 0;
		users = await UserFactory.createMany(5);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("shows one art per artist", async () => {
		await createArt({ authorId: userId(1) });
		await createArt({ authorId: userId(2) });
		await createArt({ authorId: userId(3) });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(3);
		const authorIds = result.map((art) => art.author?.discordId);
		expect(new Set(authorIds).size).toBe(3);
	});

	test("prioritizes showcase art over regular art for same artist", async () => {
		// first create art should be showcase
		const id = await createArt({ authorId: userId(1) });
		await createArt({ authorId: userId(1) });

		const result = await ArtRepository.findShowcaseArts();

		expect(result[0].id).toBe(id);
	});

	test("shows only one art per artist even with multiple pieces", async () => {
		await createArt({ authorId: userId(1) });
		await createArt({ authorId: userId(1) });
		await createArt({ authorId: userId(1) });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(1);
	});

	test("shows artist even if no showcase art exists", async () => {
		const showcaseArtId = await createArt({ authorId: userId(1) });
		const nonShowcaseArtId = await createArt({ authorId: userId(1) });

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
		users = await UserFactory.createMany(1);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns all art tags", async () => {
		imageCounter++;
		await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: `https://example.com/image-1-${imageCounter}.png`,
				validatedAt: Date.now(),
				description: null,
				linkedUsers: [],
				tags: [
					{ name: "Character" },
					{ name: "Weapon" },
					{ name: "Landscape" },
				],
			}),
		);

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
		users = await UserFactory.createMany(2);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("removes user link from art", async () => {
		const art = await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: Date.now(),
				description: null,
				linkedUsers: [userId(2)],
				tags: [],
			}),
		);

		await withUserId(userId(2), () => ArtRepository.unlinkOwnFromArt(art.id));

		const result = await ArtRepository.findArtsByUserId(userId(2), {
			includeAuthored: false,
		});
		expect(result).toHaveLength(0);
	});
});

describe("findShowcaseArtsByTag", () => {
	beforeEach(async () => {
		imageCounter = 0;
		users = await UserFactory.createMany(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns arts filtered by tag", async () => {
		const art1 = await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: Date.now(),
				description: null,
				linkedUsers: [],
				tags: [{ name: "Character" }],
			}),
		);

		await withUserId(userId(2), () =>
			ArtRepository.insert({
				url: "https://example.com/image-2.png",
				validatedAt: Date.now(),
				description: null,
				linkedUsers: [],
				tags: [{ name: "Weapon" }],
			}),
		);

		const tags = await ArtRepository.findAllTags();
		const characterTag = tags.find((t) => t.name === "Character");

		const result = await ArtRepository.findShowcaseArtsByTag(
			characterTag?.id ?? 0,
		);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(art1.id);
	});

	test("shows only one art per artist", async () => {
		await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: Date.now(),
				description: null,
				linkedUsers: [],
				tags: [{ name: "Character" }],
			}),
		);

		const tags = await ArtRepository.findAllTags();
		const characterTag = tags.find((t) => t.name === "Character");

		await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-2.png",
				validatedAt: Date.now(),
				description: null,
				linkedUsers: [],
				tags: [{ id: characterTag?.id }],
			}),
		);

		const result = await ArtRepository.findShowcaseArtsByTag(
			characterTag?.id ?? 0,
		);

		expect(result).toHaveLength(1);
	});
});

describe("findRecentlyUploadedArts", () => {
	beforeEach(async () => {
		imageCounter = 0;
		users = await UserFactory.createMany(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns recently uploaded arts", async () => {
		const artId = await createArt({ authorId: userId(1) });

		const result = await ArtRepository.findRecentlyUploadedArts();

		expect(result.length).toBeGreaterThan(0);
		expect(result.some((art) => art.id === artId)).toBe(true);
	});
});

describe("findArtsByUserId", () => {
	beforeEach(async () => {
		imageCounter = 0;
		users = await UserFactory.createMany(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns authored art", async () => {
		const artId = await createArt({ authorId: userId(1) });

		const result = await ArtRepository.findArtsByUserId(userId(1));

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(artId);
	});

	test("returns tagged art", async () => {
		const art = await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: Date.now(),
				description: null,
				linkedUsers: [userId(2)],
				tags: [],
			}),
		);

		const result = await ArtRepository.findArtsByUserId(userId(2));

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(art.id);
	});
});

describe("deleteById", () => {
	beforeEach(async () => {
		imageCounter = 0;
		users = await UserFactory.createMany(1);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("deletes art by id", async () => {
		const artId = await createArt({ authorId: userId(1) });

		await ArtRepository.deleteById(artId);

		const result = await ArtRepository.findArtsByUserId(userId(1));
		expect(result).toHaveLength(0);
	});

	test("deletes only the specified art", async () => {
		const firstArtId = await createArt({ authorId: userId(1) });
		const secondArtId = await createArt({ authorId: userId(1) });

		await ArtRepository.deleteById(firstArtId);

		const result = await ArtRepository.findArtsByUserId(userId(1));
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(secondArtId);
	});
});

describe("deleteOrphanTags", () => {
	beforeEach(async () => {
		imageCounter = 0;
		users = await UserFactory.createMany(1);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("deletes tags with no associated art", async () => {
		const art = await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: Date.now(),
				description: null,
				linkedUsers: [],
				tags: [{ name: "Orphan1" }, { name: "Orphan2" }],
			}),
		);

		await ArtRepository.deleteById(art.id);

		const deletedCount = await ArtRepository.deleteOrphanTags();
		expect(deletedCount).toBe(2);

		const tags = await ArtRepository.findAllTags();
		expect(tags).toHaveLength(0);
	});

	test("does not delete tags that are still linked to art", async () => {
		await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: Date.now(),
				description: null,
				linkedUsers: [],
				tags: [{ name: "InUse" }],
			}),
		);

		const deletedCount = await ArtRepository.deleteOrphanTags();
		expect(deletedCount).toBe(0);

		const tags = await ArtRepository.findAllTags();
		expect(tags).toHaveLength(1);
		expect(tags[0].name).toBe("InUse");
	});
});

describe("insert", () => {
	beforeEach(async () => {
		imageCounter = 0;
		users = await UserFactory.createMany(2);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("inserts art with all metadata", async () => {
		const art = await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: Date.now(),
				description: "Test description",
				linkedUsers: [userId(2)],
				tags: [{ name: "Character" }],
			}),
		);

		const result = await ArtRepository.findArtsByUserId(userId(1));

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(art.id);
		expect(result[0].description).toBe("Test description");
		expect(result[0].tags).toHaveLength(1);
		expect(result[0].linkedUsers).toHaveLength(1);
	});

	test("sets first art as showcase", async () => {
		await createArt({ authorId: userId(1) });

		const result = await ArtRepository.findArtsByUserId(userId(1));

		expect(result[0].isShowcase).toBe(true);
	});
});

describe("update", () => {
	beforeEach(async () => {
		imageCounter = 0;
		users = await UserFactory.createMany(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("updates art metadata", async () => {
		const art = await withUserId(userId(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: Date.now(),
				description: "Original",
				linkedUsers: [userId(2)],
				tags: [{ name: "Character" }],
			}),
		);

		await ArtRepository.update(art.id, {
			description: "Updated",
			linkedUsers: [userId(3)],
			tags: [{ name: "Weapon" }],
			isShowcase: 1,
		});

		const result = await ArtRepository.findArtsByUserId(userId(1));

		expect(result[0].description).toBe("Updated");
		expect(result[0].linkedUsers).toHaveLength(1);
		expect(result[0].linkedUsers?.[0].id).toBe(userId(3));
		expect(result[0].tags).toHaveLength(1);
		expect(result[0].tags?.[0].name).toBe("Weapon");
	});

	test("unsets other showcase art when setting new showcase", async () => {
		const firstArtId = await createArt({ authorId: userId(1) });
		const secondArtId = await createArt({ authorId: userId(1) });

		await ArtRepository.update(secondArtId, {
			description: null,
			linkedUsers: [],
			tags: [],
			isShowcase: 1,
		});

		const result = await ArtRepository.findArtsByUserId(userId(1));

		expect(result).toHaveLength(2);
		const showcaseArt = result.find((art) => art.id === secondArtId);
		const nonShowcaseArt = result.find((art) => art.id === firstArtId);
		expect(showcaseArt?.isShowcase).toBe(true);
		expect(nonShowcaseArt?.isShowcase).toBe(false);
	});
});
