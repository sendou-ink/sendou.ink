import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { databaseTimestampNow } from "~/utils/dates";
import { dbReset, withUserId } from "~/utils/Test";
import * as ArtRepository from "../art/ArtRepository.server";
import * as CalendarRepository from "../calendar/CalendarRepository.server";
import * as ImageRepository from "./ImageRepository.server";

let imageCounter = 0;
let submitter: { id: number };
let otherSubmitter: { id: number };
let thirdSubmitter: { id: number };

const createImage = async ({
	submitterUserId,
	validatedAt = null,
}: {
	submitterUserId: number;
	validatedAt?: number | null;
}) => {
	imageCounter++;
	const url = `image-${submitterUserId}-${imageCounter}.png`;

	return ImageRepository.insert({ submitterUserId, url, validatedAt });
};

const createArtImage = async ({
	authorId,
	validatedAt = null,
}: {
	authorId: number;
	validatedAt?: number | null;
}) => {
	imageCounter++;
	return withUserId(authorId, () =>
		ArtRepository.insert({
			url: `art-${imageCounter}.png`,
			validatedAt,
			description: null,
			linkedUsers: [],
			tags: [],
		}),
	);
};

const createCalendarEvent = async (authorId: number, avatarImgId?: number) => {
	return CalendarRepository.insert({
		isFullTournament: false,
		authorId,
		badges: [],
		bracketUrl: `https://example.com/bracket-${Date.now()}`,
		description: null,
		discordInviteCode: null,
		name: `Event ${Date.now()}`,
		organizationId: null,
		startTimes: [databaseTimestampNow()],
		tags: null,
		mapPickingStyle: "AUTO_SZ",
		bracketProgression: null,
		rules: null,
		avatarImgId,
	});
};

describe("findById", () => {
	beforeEach(async () => {
		imageCounter = 0;
		submitter = await UserFactory.create();
	});

	afterEach(async () => {
		await dbReset();
	});

	test("finds image by id", async () => {
		const img = await createImage({ submitterUserId: submitter.id });

		const result = await ImageRepository.findById(img.id);

		expect(result).toBeDefined();
		expect(result?.tournamentId).toBeNull();
	});

	test("finds image with calendar event data", async () => {
		const img = await createImage({ submitterUserId: submitter.id });
		await createCalendarEvent(submitter.id, img.id);

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
		imageCounter = 0;
		submitter = await UserFactory.create();
	});

	afterEach(async () => {
		await dbReset();
	});

	test("deletes image by id", async () => {
		const img = await createImage({ submitterUserId: submitter.id });

		await ImageRepository.deleteById(img.id);

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeUndefined();
	});

	test("deletes associated art when deleting image", async () => {
		const art = await createArtImage({
			authorId: submitter.id,
			validatedAt: Date.now(),
		});

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
		imageCounter = 0;
		submitter = await UserFactory.create();
	});

	afterEach(async () => {
		await dbReset();
	});

	test("counts unvalidated art by author", async () => {
		await createArtImage({ authorId: submitter.id });
		await createArtImage({ authorId: submitter.id });

		const count = await ImageRepository.countUnvalidatedArt(submitter.id);

		expect(count).toBe(2);
	});

	test("does not count validated art", async () => {
		await createArtImage({ authorId: submitter.id });
		await createArtImage({ authorId: submitter.id, validatedAt: Date.now() });

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
		imageCounter = 0;
		submitter = await UserFactory.create();
	});

	afterEach(async () => {
		await dbReset();
	});

	test("counts unvalidated images used in art", async () => {
		await createArtImage({ authorId: submitter.id });

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(1);
	});

	test("counts unvalidated images used in calendar events", async () => {
		const img = await createImage({ submitterUserId: submitter.id });
		await createCalendarEvent(submitter.id, img.id);

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(1);
	});

	test("does not count validated images", async () => {
		await createArtImage({ authorId: submitter.id, validatedAt: Date.now() });

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(0);
	});

	test("counts multiple unvalidated images across different types", async () => {
		await createArtImage({ authorId: submitter.id });

		const img = await createImage({ submitterUserId: submitter.id });
		await createCalendarEvent(submitter.id, img.id);

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
		imageCounter = 0;
		[submitter, otherSubmitter] = await UserFactory.createMany(2);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("counts unvalidated images connected to art by submitter", async () => {
		await createArtImage({ authorId: submitter.id });
		await createArtImage({ authorId: submitter.id });

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			submitter.id,
		);

		expect(count).toBe(2);
	});

	test("does not count orphan images not connected to anything", async () => {
		await createImage({ submitterUserId: submitter.id });

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			submitter.id,
		);

		expect(count).toBe(0);
	});

	test("does not count validated images", async () => {
		await createArtImage({ authorId: submitter.id, validatedAt: Date.now() });

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(
			submitter.id,
		);

		expect(count).toBe(0);
	});

	test("does not count images from other submitters", async () => {
		await createArtImage({ authorId: submitter.id });
		await createArtImage({ authorId: otherSubmitter.id });

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
		imageCounter = 0;
		submitter = await UserFactory.create();
	});

	afterEach(async () => {
		await dbReset();
	});

	test("marks image as validated", async () => {
		const img = await createImage({ submitterUserId: submitter.id });

		await ImageRepository.validateById(img.id);

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeDefined();
	});

	test("validated image is not included in unvalidated count", async () => {
		const art = await createArtImage({ authorId: submitter.id });

		const countBefore = await ImageRepository.countAllUnvalidated();
		expect(countBefore).toBe(1);

		await ImageRepository.validateById(art.imgId);

		const countAfter = await ImageRepository.countAllUnvalidated();
		expect(countAfter).toBe(0);
	});
});

describe("findAllUnvalidated", () => {
	beforeEach(async () => {
		imageCounter = 0;
		[submitter, otherSubmitter, thirdSubmitter] = await UserFactory.createMany(
			3,
			(index) => ({ discordName: `user${index + 1}` }),
		);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("fetches unvalidated images with submitter info", async () => {
		imageCounter++;
		const filename = `art-${imageCounter}.png`;
		await withUserId(submitter.id, () =>
			ArtRepository.insert({
				url: filename,
				validatedAt: null,
				description: null,
				linkedUsers: [],
				tags: [],
			}),
		);

		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(1);
		expect(result[0].submitterUserId).toBe(submitter.id);
		expect(result[0].username).toBe("user1");
		expect(result[0].url).toBe(`http://127.0.0.1:9000/sendou/${filename}`);
	});

	test("does not fetch validated images", async () => {
		await createArtImage({ authorId: submitter.id, validatedAt: Date.now() });

		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(0);
	});

	test("fetches images from art and calendar events", async () => {
		await createArtImage({ authorId: submitter.id });
		await createArtImage({ authorId: otherSubmitter.id });

		const img = await createImage({ submitterUserId: thirdSubmitter.id });
		await createCalendarEvent(thirdSubmitter.id, img.id);

		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(3);
	});

	test("respects the max unvalidated images to show at once for approval limit constant", async () => {
		for (let i = 0; i < 10; i++) {
			await createArtImage({ authorId: submitter.id });
		}

		const result = await ImageRepository.findAllUnvalidated();

		expect(result.length).toBe(5);
	});

	test("returns empty array when no unvalidated images exist", async () => {
		const result = await ImageRepository.findAllUnvalidated();

		expect(result).toHaveLength(0);
	});
});
