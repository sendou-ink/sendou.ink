import { beforeEach, describe, expect, test } from "vitest";
import * as ArtFactory from "~/db/seed/factories/ArtFactory";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ArtRepository from "../art/ArtRepository.server";
import * as ImageRepository from "./ImageRepository.server";

let submitter: { id: number };
let otherSubmitter: { id: number };
let thirdSubmitter: { id: number };

const createUnvalidatedArt = (authorId: number) =>
	ArtFactory.create({ authorId, validatedAt: null });

describe("findById", () => {
	beforeEach(async () => {
		submitter = await UserFactory.create();
	});

	test("finds image by id", async () => {
		const img = await ImageFactory.create({ submitterUserId: submitter.id });

		const result = await ImageRepository.findById(img.id);

		expect(result).toBeDefined();
		expect(result?.tournamentId).toBeNull();
	});

	test("finds image with calendar event data", async () => {
		const img = await ImageFactory.create({ submitterUserId: submitter.id });
		await CalendarEventFactory.create({
			authorId: submitter.id,
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
		submitter = await UserFactory.create();
	});

	test("deletes image by id", async () => {
		const img = await ImageFactory.create({ submitterUserId: submitter.id });

		await ImageRepository.deleteById(img.id);

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeUndefined();
	});

	test("deletes associated art when deleting image", async () => {
		const art = await ArtFactory.create({ authorId: submitter.id });

		const artsBefore = await ArtRepository.findArtsByUserId(submitter.id);
		expect(artsBefore).toHaveLength(1);
		expect(artsBefore[0].id).toBe(art.id);

		await ImageRepository.deleteById(art.imgId);

		const result = await ImageRepository.findById(art.imgId);
		expect(result).toBeUndefined();

		const artsAfter = await ArtRepository.findArtsByUserId(submitter.id);
		expect(artsAfter).toHaveLength(0);
	});
});

describe("countUnvalidatedArt", () => {
	beforeEach(async () => {
		submitter = await UserFactory.create();
	});

	test("counts unvalidated art by author", async () => {
		await createUnvalidatedArt(submitter.id);
		await createUnvalidatedArt(submitter.id);

		const count = await ImageRepository.countUnvalidatedArt(submitter.id);

		expect(count).toBe(2);
	});

	test("does not count validated art", async () => {
		await createUnvalidatedArt(submitter.id);
		await ArtFactory.create({ authorId: submitter.id });

		const count = await ImageRepository.countUnvalidatedArt(submitter.id);

		expect(count).toBe(1);
	});

	test("returns 0 when author has no unvalidated art", async () => {
		const count = await ImageRepository.countUnvalidatedArt(submitter.id);

		expect(count).toBe(0);
	});
});

describe("countAllUnvalidated", () => {
	beforeEach(async () => {
		submitter = await UserFactory.create();
	});

	test("counts unvalidated images used in art", async () => {
		await createUnvalidatedArt(submitter.id);

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(1);
	});

	test("counts unvalidated images used in calendar events", async () => {
		const img = await ImageFactory.create({ submitterUserId: submitter.id });
		await CalendarEventFactory.create({
			authorId: submitter.id,
			avatarImgId: img.id,
		});

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(1);
	});

	test("does not count validated images", async () => {
		await ArtFactory.create({ authorId: submitter.id });

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(0);
	});

	test("counts multiple unvalidated images across different types", async () => {
		await createUnvalidatedArt(submitter.id);

		const img = await ImageFactory.create({ submitterUserId: submitter.id });
		await CalendarEventFactory.create({
			authorId: submitter.id,
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
		[submitter, otherSubmitter] = await UserFactory.createMany(2);
	});

	test("counts unvalidated images connected to art by submitter", async () => {
		await createUnvalidatedArt(submitter.id);
		await createUnvalidatedArt(submitter.id);

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			submitter.id,
		);

		expect(count).toBe(2);
	});

	test("does not count orphan images not connected to anything", async () => {
		await ImageFactory.create({ submitterUserId: submitter.id });

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			submitter.id,
		);

		expect(count).toBe(0);
	});

	test("does not count validated images", async () => {
		await ArtFactory.create({ authorId: submitter.id });

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			submitter.id,
		);

		expect(count).toBe(0);
	});

	test("does not count images from other submitters", async () => {
		await createUnvalidatedArt(submitter.id);
		await createUnvalidatedArt(otherSubmitter.id);

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			submitter.id,
		);

		expect(count).toBe(1);
	});

	test("returns 0 when user has no unvalidated images", async () => {
		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			submitter.id,
		);

		expect(count).toBe(0);
	});
});

describe("validateById", () => {
	beforeEach(async () => {
		submitter = await UserFactory.create();
	});

	test("marks image as validated", async () => {
		const img = await ImageFactory.create({ submitterUserId: submitter.id });

		await ImageRepository.validateById(img.id);

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeDefined();
	});

	test("validated image is not included in unvalidated count", async () => {
		const art = await createUnvalidatedArt(submitter.id);

		const countBefore = await ImageRepository.countAllUnvalidated();
		expect(countBefore).toBe(1);

		await ImageRepository.validateById(art.imgId);

		const countAfter = await ImageRepository.countAllUnvalidated();
		expect(countAfter).toBe(0);
	});
});

describe("findAllUnvalidated", () => {
	beforeEach(async () => {
		[submitter, otherSubmitter, thirdSubmitter] = await UserFactory.createMany(
			3,
			(index) => ({ discordName: `user${index + 1}` }),
		);
	});

	test("fetches unvalidated images with submitter info", async () => {
		const filename = "unvalidated-art.png";
		await ArtFactory.create({
			authorId: submitter.id,
			url: filename,
			validatedAt: null,
		});

		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(1);
		expect(result[0].submitterUserId).toBe(submitter.id);
		expect(result[0].username).toBe("user1");
		expect(result[0].url).toBe(`http://127.0.0.1:9000/sendou/${filename}`);
	});

	test("does not fetch validated images", async () => {
		await ArtFactory.create({ authorId: submitter.id });

		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(0);
	});

	test("fetches images from art and calendar events", async () => {
		await createUnvalidatedArt(submitter.id);
		await createUnvalidatedArt(otherSubmitter.id);

		const img = await ImageFactory.create({
			submitterUserId: thirdSubmitter.id,
		});
		await CalendarEventFactory.create({
			authorId: thirdSubmitter.id,
			avatarImgId: img.id,
		});

		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(3);
	});

	test("respects the max unvalidated images to show at once for approval limit constant", async () => {
		for (let i = 0; i < 10; i++) {
			await createUnvalidatedArt(submitter.id);
		}

		const result = await ImageRepository.findAllUnvalidated();

		expect(result.length).toBe(5);
	});

	test("returns empty array when no unvalidated images exist", async () => {
		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(0);
	});
});
