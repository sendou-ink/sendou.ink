import { beforeEach, describe, expect, test } from "vitest";
import * as ArtFactory from "~/db/seed/factories/ArtFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { databaseTimestampNow } from "~/utils/dates";
import { withUserId } from "~/utils/Test";
import * as ArtRepository from "./ArtRepository.server";

const users = UserFactory.pool();

describe("findShowcaseArts", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("shows one art per artist", async () => {
		await ArtFactory.create({ authorId: users.id(1) });
		await ArtFactory.create({ authorId: users.id(2) });
		await ArtFactory.create({ authorId: users.id(3) });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(3);
		const authorIds = result.map((art) => art.author?.discordId);
		expect(new Set(authorIds).size).toBe(3);
	});

	test("prioritizes showcase art over regular art for same artist", async () => {
		// first create art should be showcase
		const showcaseArt = await ArtFactory.create({ authorId: users.id(1) });
		await ArtFactory.create({ authorId: users.id(1) });

		const result = await ArtRepository.findShowcaseArts();

		expect(result[0].id).toBe(showcaseArt.id);
	});

	test("shows only one art per artist even with multiple pieces", async () => {
		await ArtFactory.create({ authorId: users.id(1) });
		await ArtFactory.create({ authorId: users.id(1) });
		await ArtFactory.create({ authorId: users.id(1) });

		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(1);
	});

	test("shows artist even if no showcase art exists", async () => {
		const showcaseArt = await ArtFactory.create({ authorId: users.id(1) });
		const nonShowcaseArt = await ArtFactory.create({ authorId: users.id(1) });

		await ArtRepository.deleteById(showcaseArt.id);

		const result = await ArtRepository.findShowcaseArts();
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(nonShowcaseArt.id);
	});

	test("returns empty array when no art exists", async () => {
		const result = await ArtRepository.findShowcaseArts();

		expect(result).toHaveLength(0);
	});
});

describe("findAllTags", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("returns all art tags", async () => {
		await ArtFactory.create({
			authorId: users.id(1),
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
		await users.create(2);
	});

	test("removes user link from art", async () => {
		const art = await ArtFactory.create({
			authorId: users.id(1),
			linkedUsers: [users.id(2)],
		});

		await withUserId(users.id(2), () => ArtRepository.unlinkOwnFromArt(art.id));

		const result = await ArtRepository.findArtsByUserId(users.id(2), {
			includeAuthored: false,
		});
		expect(result).toHaveLength(0);
	});
});

describe("findShowcaseArtsByTag", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("returns arts filtered by tag", async () => {
		const characterArt = await ArtFactory.create({
			authorId: users.id(1),
			tags: [{ name: "Character" }],
		});

		await ArtFactory.create({
			authorId: users.id(2),
			tags: [{ name: "Weapon" }],
		});

		const tags = await ArtRepository.findAllTags();
		const characterTag = tags.find((t) => t.name === "Character");

		const result = await ArtRepository.findShowcaseArtsByTag(
			characterTag?.id ?? 0,
		);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(characterArt.id);
	});

	test("shows only one art per artist", async () => {
		await ArtFactory.create({
			authorId: users.id(1),
			tags: [{ name: "Character" }],
		});

		const tags = await ArtRepository.findAllTags();
		const characterTag = tags.find((t) => t.name === "Character");

		await ArtFactory.create({
			authorId: users.id(1),
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
		await users.create(3);
	});

	test("returns recently uploaded arts", async () => {
		const art = await ArtFactory.create({ authorId: users.id(1) });

		const result = await ArtRepository.findRecentlyUploadedArts();

		expect(result.length).toBeGreaterThan(0);
		expect(result.some((uploaded) => uploaded.id === art.id)).toBe(true);
	});
});

describe("findArtsByUserId", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("returns authored art", async () => {
		const art = await ArtFactory.create({ authorId: users.id(1) });

		const result = await ArtRepository.findArtsByUserId(users.id(1));

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(art.id);
	});

	test("returns tagged art", async () => {
		const art = await ArtFactory.create({
			authorId: users.id(1),
			linkedUsers: [users.id(2)],
		});

		const result = await ArtRepository.findArtsByUserId(users.id(2));

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(art.id);
	});
});

describe("deleteById", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("deletes art by id", async () => {
		const art = await ArtFactory.create({ authorId: users.id(1) });

		await ArtRepository.deleteById(art.id);

		const result = await ArtRepository.findArtsByUserId(users.id(1));
		expect(result).toHaveLength(0);
	});

	test("deletes only the specified art", async () => {
		const [firstArt, secondArt] = await ArtFactory.createMany(2, {
			authorId: users.id(1),
		});

		await ArtRepository.deleteById(firstArt.id);

		const result = await ArtRepository.findArtsByUserId(users.id(1));
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(secondArt.id);
	});
});

describe("deleteOrphanTags", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("deletes tags with no associated art", async () => {
		const art = await ArtFactory.create({
			authorId: users.id(1),
			tags: [{ name: "Orphan1" }, { name: "Orphan2" }],
		});

		await ArtRepository.deleteById(art.id);

		const deletedCount = await ArtRepository.deleteOrphanTags();
		expect(deletedCount).toBe(2);

		const tags = await ArtRepository.findAllTags();
		expect(tags).toHaveLength(0);
	});

	test("does not delete tags that are still linked to art", async () => {
		await ArtFactory.create({
			authorId: users.id(1),
			tags: [{ name: "InUse" }],
		});

		const deletedCount = await ArtRepository.deleteOrphanTags();
		expect(deletedCount).toBe(0);

		const tags = await ArtRepository.findAllTags();
		expect(tags).toHaveLength(1);
		expect(tags[0].name).toBe("InUse");
	});
});

describe("insert", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("inserts art with all metadata", async () => {
		const art = await withUserId(users.id(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: databaseTimestampNow(),
				description: "Test description",
				linkedUsers: [users.id(2)],
				tags: [{ name: "Character" }],
			}),
		);

		const result = await ArtRepository.findArtsByUserId(users.id(1));

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(art.id);
		expect(result[0].description).toBe("Test description");
		expect(result[0].tags).toHaveLength(1);
		expect(result[0].linkedUsers).toHaveLength(1);
	});

	test("sets first art as showcase", async () => {
		await withUserId(users.id(1), () =>
			ArtRepository.insert({
				url: "https://example.com/image-1.png",
				validatedAt: databaseTimestampNow(),
				description: null,
				linkedUsers: [],
				tags: [],
			}),
		);

		const result = await ArtRepository.findArtsByUserId(users.id(1));

		expect(result[0].isShowcase).toBe(true);
	});
});

describe("update", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("updates art metadata", async () => {
		const art = await ArtFactory.create({
			authorId: users.id(1),
			description: "Original",
			linkedUsers: [users.id(2)],
			tags: [{ name: "Character" }],
		});

		await ArtRepository.update(art.id, {
			description: "Updated",
			linkedUsers: [users.id(3)],
			tags: [{ name: "Weapon" }],
			isShowcase: 1,
		});

		const result = await ArtRepository.findArtsByUserId(users.id(1));

		expect(result[0].description).toBe("Updated");
		expect(result[0].linkedUsers).toHaveLength(1);
		expect(result[0].linkedUsers?.[0].id).toBe(users.id(3));
		expect(result[0].tags).toHaveLength(1);
		expect(result[0].tags?.[0].name).toBe("Weapon");
	});

	test("unsets other showcase art when setting new showcase", async () => {
		const [firstArt, secondArt] = await ArtFactory.createMany(2, {
			authorId: users.id(1),
		});

		await ArtRepository.update(secondArt.id, {
			description: null,
			linkedUsers: [],
			tags: [],
			isShowcase: 1,
		});

		const result = await ArtRepository.findArtsByUserId(users.id(1));

		expect(result).toHaveLength(2);
		const showcaseArt = result.find((art) => art.id === secondArt.id);
		const nonShowcaseArt = result.find((art) => art.id === firstArt.id);
		expect(showcaseArt?.isShowcase).toBe(true);
		expect(nonShowcaseArt?.isShowcase).toBe(false);
	});
});
