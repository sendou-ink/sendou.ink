import { beforeEach, describe, expect, test } from "vitest";
import * as ArtFactory from "~/db/seed/factories/ArtFactory";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ArtRepository from "../art/ArtRepository.server";
import * as ImageRepository from "./ImageRepository.server";

const users = UserFactory.pool();

const createUnvalidatedArt = (authorId: number) =>
	ArtFactory.create({ authorId, validatedAt: null });

describe("findById", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("finds image by id", async () => {
		const img = await ImageFactory.create({ submitterUserId: users.id(1) });

		const result = await ImageRepository.findById(img.id);

		expect(result).toBeDefined();
		expect(result?.tournamentId).toBeNull();
	});

	test("finds image with calendar event data", async () => {
		const img = await ImageFactory.create({ submitterUserId: users.id(1) });
		await CalendarEventFactory.create({
			authorId: users.id(1),
			avatarImgId: img.id,
		});

		const result = await ImageRepository.findById(img.id);

		expect(result).toBeDefined();
		expect(result?.tournamentId).toBeDefined();
	});

	test("returns undefined for non-existent image", async () => {
		const result = await ImageRepository.findById(999);

		expect(result).toBeUndefined();
	});
});

describe("deleteById", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("deletes image by id", async () => {
		const img = await ImageFactory.create({ submitterUserId: users.id(1) });

		await ImageRepository.deleteById(img.id);

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeUndefined();
	});

	test("deletes associated art when deleting image", async () => {
		const art = await ArtFactory.create({ authorId: users.id(1) });

		const artsBefore = await ArtRepository.findArtsByUserId(users.id(1));
		expect(artsBefore).toHaveLength(1);
		expect(artsBefore[0].id).toBe(art.id);

		await ImageRepository.deleteById(art.imgId);

		const result = await ImageRepository.findById(art.imgId);
		expect(result).toBeUndefined();

		const artsAfter = await ArtRepository.findArtsByUserId(users.id(1));
		expect(artsAfter).toHaveLength(0);
	});
});

describe("countUnvalidatedArt", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("counts unvalidated art by author", async () => {
		await createUnvalidatedArt(users.id(1));
		await createUnvalidatedArt(users.id(1));

		const count = await ImageRepository.countUnvalidatedArt(users.id(1));

		expect(count).toBe(2);
	});

	test("does not count validated art", async () => {
		await createUnvalidatedArt(users.id(1));
		await ArtFactory.create({ authorId: users.id(1) });

		const count = await ImageRepository.countUnvalidatedArt(users.id(1));

		expect(count).toBe(1);
	});

	test("returns 0 when author has no unvalidated art", async () => {
		const count = await ImageRepository.countUnvalidatedArt(users.id(1));

		expect(count).toBe(0);
	});
});

describe("countAllUnvalidated", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("counts unvalidated images used in art", async () => {
		await createUnvalidatedArt(users.id(1));

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(1);
	});

	test("counts unvalidated images used in calendar events", async () => {
		const img = await ImageFactory.create({ submitterUserId: users.id(1) });
		await CalendarEventFactory.create({
			authorId: users.id(1),
			avatarImgId: img.id,
		});

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(1);
	});

	test("does not count validated images", async () => {
		await ArtFactory.create({ authorId: users.id(1) });

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(0);
	});

	test("counts multiple unvalidated images across different types", async () => {
		await createUnvalidatedArt(users.id(1));

		const img = await ImageFactory.create({ submitterUserId: users.id(1) });
		await CalendarEventFactory.create({
			authorId: users.id(1),
			avatarImgId: img.id,
		});

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(2);
	});

	test("returns 0 when no unvalidated images exist", async () => {
		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(0);
	});
});

describe("countUnvalidatedBySubmitterUserId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("counts unvalidated images connected to art by submitter", async () => {
		await createUnvalidatedArt(users.id(1));
		await createUnvalidatedArt(users.id(1));

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			users.id(1),
		);

		expect(count).toBe(2);
	});

	test("does not count orphan images not connected to anything", async () => {
		await ImageFactory.create({ submitterUserId: users.id(1) });

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			users.id(1),
		);

		expect(count).toBe(0);
	});

	test("does not count validated images", async () => {
		await ArtFactory.create({ authorId: users.id(1) });

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			users.id(1),
		);

		expect(count).toBe(0);
	});

	test("does not count images from other submitters", async () => {
		await createUnvalidatedArt(users.id(1));
		await createUnvalidatedArt(users.id(2));

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			users.id(1),
		);

		expect(count).toBe(1);
	});

	test("returns 0 when user has no unvalidated images", async () => {
		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			users.id(1),
		);

		expect(count).toBe(0);
	});
});

describe("validateById", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("marks image as validated", async () => {
		const img = await ImageFactory.create({ submitterUserId: users.id(1) });

		await ImageRepository.validateById(img.id);

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeDefined();
	});

	test("validated image is not included in unvalidated count", async () => {
		const art = await createUnvalidatedArt(users.id(1));

		const countBefore = await ImageRepository.countAllUnvalidated();
		expect(countBefore).toBe(1);

		await ImageRepository.validateById(art.imgId);

		const countAfter = await ImageRepository.countAllUnvalidated();
		expect(countAfter).toBe(0);
	});
});

describe("findAllUnvalidated", () => {
	beforeEach(async () => {
		await users.create(3, (index) => ({ discordName: `user${index + 1}` }));
	});

	test("fetches unvalidated images with submitter info", async () => {
		const filename = "unvalidated-art.png";
		await ArtFactory.create({
			authorId: users.id(1),
			url: filename,
			validatedAt: null,
		});

		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(1);
		expect(result[0].submitterUserId).toBe(users.id(1));
		expect(result[0].username).toBe("user1");
		expect(result[0].url).toBe(`http://127.0.0.1:9000/sendou/${filename}`);
	});

	test("does not fetch validated images", async () => {
		await ArtFactory.create({ authorId: users.id(1) });

		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(0);
	});

	test("fetches images from art and calendar events", async () => {
		await createUnvalidatedArt(users.id(1));
		await createUnvalidatedArt(users.id(2));

		const img = await ImageFactory.create({
			submitterUserId: users.id(3),
		});
		await CalendarEventFactory.create({
			authorId: users.id(3),
			avatarImgId: img.id,
		});

		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(3);
	});

	test("respects the max unvalidated images to show at once for approval limit constant", async () => {
		for (let i = 0; i < 10; i++) {
			await createUnvalidatedArt(users.id(1));
		}

		const result = await ImageRepository.findAllUnvalidated();

		expect(result.length).toBe(5);
	});

	test("returns empty array when no unvalidated images exist", async () => {
		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(0);
	});
});
