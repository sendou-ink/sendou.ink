import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { databaseTimestampNow } from "~/utils/dates";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as ArtRepository from "../art/ArtRepository.server";
import * as CalendarRepository from "../calendar/CalendarRepository.server";
import * as TeamRepository from "../team/TeamRepository.server";
import * as TournamentOrganizationRepository from "../tournament-organization/TournamentOrganizationRepository.server";
import * as ImageRepository from "./ImageRepository.server";

let imageCounter = 0;
let teamCounter = 0;
let orgCounter = 0;

const createImage = async ({
	submitterUserId,
	validatedAt = null,
}: {
	submitterUserId: number;
	validatedAt?: number | null;
}) => {
	imageCounter++;
	const url = `image-${submitterUserId}-${imageCounter}.png`;

	return ImageRepository.addNewImage({
		submitterUserId,
		url,
		validatedAt,
		type: "team-pfp",
	});
};

const createTeam = async (ownerUserId: number) => {
	teamCounter++;
	const createdTeam = await TeamRepository.create({
		name: `Team ${teamCounter}`,
		ownerUserId,
		isMainTeam: true,
	});
	const team = await TeamRepository.findByCustomUrl(createdTeam.customUrl);
	if (!team) throw new Error("Team not found after creation");
	return team;
};

const createOrganization = async (ownerId: number) => {
	orgCounter++;
	return TournamentOrganizationRepository.create({
		name: `Org ${orgCounter}`,
		ownerId,
	});
};

const createCalendarEvent = async (authorId: number, avatarImgId?: number) => {
	return CalendarRepository.create({
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
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("finds image by id", async () => {
		const img = await createImage({ submitterUserId: 1 });

		const result = await ImageRepository.findById(img.id);

		expect(result).toBeDefined();
		expect(result?.tournamentId).toBeNull();
	});

	test("finds image with calendar event data", async () => {
		const img = await createImage({ submitterUserId: 1 });
		await createCalendarEvent(1, img.id);

		const result = await ImageRepository.findById(img.id);

		expect(result).toBeDefined();
		expect(result?.tournamentId).toBeDefined();
	});

	test("returns undefined for non-existent image", async () => {
		const result = await ImageRepository.findById(999);

		expect(result).toBeUndefined();
	});
});

describe("deleteImageById", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("deletes image by id", async () => {
		const img = await createImage({ submitterUserId: 1 });

		await ImageRepository.deleteImageById(img.id);

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeUndefined();
	});

	test("deletes associated art when deleting image", async () => {
		imageCounter++;
		const art = await ArtRepository.insert({
			authorId: 1,
			url: `art-${imageCounter}.png`,
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [],
			tags: [],
		});

		const artsBefore = await ArtRepository.findArtsByUserId(1);
		expect(artsBefore).toHaveLength(1);
		expect(artsBefore[0].id).toBe(art.id);

		const imgId = art.imgId;

		await ImageRepository.deleteImageById(imgId);

		const result = await ImageRepository.findById(imgId);
		expect(result).toBeUndefined();

		const artsAfter = await ArtRepository.findArtsByUserId(1);
		expect(artsAfter).toHaveLength(0);
	});
});

describe("countUnvalidatedArt", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("counts unvalidated art by author", async () => {
		imageCounter++;
		await ArtRepository.insert({
			authorId: 1,
			url: `art-${imageCounter}.png`,
			validatedAt: null,
			description: null,
			linkedUsers: [],
			tags: [],
		});

		imageCounter++;
		await ArtRepository.insert({
			authorId: 1,
			url: `art-${imageCounter}.png`,
			validatedAt: null,
			description: null,
			linkedUsers: [],
			tags: [],
		});

		const count = await ImageRepository.countUnvalidatedArt(1);

		expect(count).toBe(2);
	});

	test("does not count validated art", async () => {
		imageCounter++;
		await ArtRepository.insert({
			authorId: 1,
			url: `art-${imageCounter}.png`,
			validatedAt: null,
			description: null,
			linkedUsers: [],
			tags: [],
		});

		imageCounter++;
		await ArtRepository.insert({
			authorId: 1,
			url: `art-${imageCounter}.png`,
			validatedAt: Date.now(),
			description: null,
			linkedUsers: [],
			tags: [],
		});

		const count = await ImageRepository.countUnvalidatedArt(1);

		expect(count).toBe(1);
	});

	test("returns 0 when author has no unvalidated art", async () => {
		const count = await ImageRepository.countUnvalidatedArt(1);

		expect(count).toBe(0);
	});
});

describe("countAllUnvalidated", () => {
	beforeEach(async () => {
		imageCounter = 0;
		teamCounter = 0;
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("counts unvalidated images used in teams", async () => {
		const team = await createTeam(1);
		imageCounter++;
		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt: null,
			teamId: team.id,
			type: "team-pfp",
		});

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(1);
	});

	test("counts unvalidated images used in art", async () => {
		imageCounter++;
		await ArtRepository.insert({
			authorId: 1,
			url: `art-${imageCounter}.png`,
			validatedAt: null,
			description: null,
			linkedUsers: [],
			tags: [],
		});

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(1);
	});

	test("counts unvalidated images used in calendar events", async () => {
		const img = await createImage({ submitterUserId: 1 });
		await createCalendarEvent(1, img.id);

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(1);
	});

	test("does not count validated images", async () => {
		const team = await createTeam(1);
		imageCounter++;
		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt: Date.now(),
			teamId: team.id,
			type: "team-pfp",
		});

		const count = await ImageRepository.countAllUnvalidated();

		expect(count).toBe(0);
	});

	test("counts multiple unvalidated images across different types", async () => {
		const team = await createTeam(1);
		imageCounter++;
		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt: null,
			teamId: team.id,
			type: "team-pfp",
		});

		imageCounter++;
		await ArtRepository.insert({
			authorId: 1,
			url: `art-${imageCounter}.png`,
			validatedAt: null,
			description: null,
			linkedUsers: [],
			tags: [],
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
		imageCounter = 0;
		teamCounter = 0;
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("counts unvalidated team images by submitter", async () => {
		const team = await createTeam(1);
		imageCounter++;
		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt: null,
			teamId: team.id,
			type: "team-pfp",
		});

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(1);

		expect(count).toBe(1);
	});

	test("does not count validated images", async () => {
		const team = await createTeam(1);
		imageCounter++;
		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt: Date.now(),
			teamId: team.id,
			type: "team-pfp",
		});

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(1);

		expect(count).toBe(0);
	});

	test("does not count images from other submitters", async () => {
		const team1 = await createTeam(1);
		const team2 = await createTeam(2);

		imageCounter++;
		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team1-avatar-${imageCounter}.png`,
			validatedAt: null,
			teamId: team1.id,
			type: "team-pfp",
		});

		imageCounter++;
		await ImageRepository.addNewImage({
			submitterUserId: 2,
			url: `team2-avatar-${imageCounter}.png`,
			validatedAt: null,
			teamId: team2.id,
			type: "team-pfp",
		});

		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(1);

		expect(count).toBe(1);
	});

	test("returns 0 when user has no unvalidated team images", async () => {
		const count = await ImageRepository.countUnvalidatedBySubmitterUserId(1);

		expect(count).toBe(0);
	});
});

describe("validateImage", () => {
	beforeEach(async () => {
		imageCounter = 0;
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("marks image as validated", async () => {
		const img = await createImage({ submitterUserId: 1 });

		await ImageRepository.validateImage(img.id);

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeDefined();
	});

	test("validated image is not included in unvalidated count", async () => {
		const team = await createTeam(1);
		imageCounter++;
		const img = await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt: null,
			teamId: team.id,
			type: "team-pfp",
		});

		const countBefore = await ImageRepository.countAllUnvalidated();
		expect(countBefore).toBe(1);

		await ImageRepository.validateImage(img.id);

		const countAfter = await ImageRepository.countAllUnvalidated();
		expect(countAfter).toBe(0);
	});
});

describe("unvalidatedImages", () => {
	beforeEach(async () => {
		imageCounter = 0;
		teamCounter = 0;
		await dbInsertUsers(10);
	});

	afterEach(() => {
		dbReset();
	});

	test("fetches unvalidated images with submitter info", async () => {
		const team = await createTeam(1);
		imageCounter++;
		const filename = `team-avatar-${imageCounter}.png`;
		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: filename,
			validatedAt: null,
			teamId: team.id,
			type: "team-pfp",
		});

		const result = await ImageRepository.unvalidatedImages();

		expect(result).toHaveLength(1);
		expect(result[0].submitterUserId).toBe(1);
		expect(result[0].username).toBe("user1");
		expect(result[0].url).toBe(`http://127.0.0.1:9000/sendou/${filename}`);
	});

	test("does not fetch validated images", async () => {
		const team = await createTeam(1);
		imageCounter++;
		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt: Date.now(),
			teamId: team.id,
			type: "team-pfp",
		});

		const result = await ImageRepository.unvalidatedImages();

		expect(result).toHaveLength(0);
	});

	test("fetches images from teams, art, and calendar events", async () => {
		const team = await createTeam(1);
		imageCounter++;
		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt: null,
			teamId: team.id,
			type: "team-pfp",
		});

		imageCounter++;
		await ArtRepository.insert({
			authorId: 2,
			url: `art-${imageCounter}.png`,
			validatedAt: null,
			description: null,
			linkedUsers: [],
			tags: [],
		});

		const img2 = await createImage({ submitterUserId: 3 });
		await createCalendarEvent(3, img2.id);

		const result = await ImageRepository.unvalidatedImages();

		expect(result).toHaveLength(3);
	});

	test("respects the max unvalidated images to show at once for approval limit constant", async () => {
		for (let i = 0; i < 10; i++) {
			const teamOwnerId = i + 1;
			const team = await createTeam(teamOwnerId);

			await ImageRepository.addNewImage({
				submitterUserId: teamOwnerId,
				url: `team-avatar-${i}.png`,
				validatedAt: null,
				teamId: team.id,
				type: "team-pfp",
			});
		}

		const result = await ImageRepository.unvalidatedImages();

		expect(result.length).toBe(5);
	});

	test("returns empty array when no unvalidated images exist", async () => {
		const result = await ImageRepository.unvalidatedImages();

		expect(result).toHaveLength(0);
	});
});

describe("addNewImage", () => {
	beforeEach(async () => {
		imageCounter = 0;
		teamCounter = 0;
		orgCounter = 0;
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("creates image for team avatar", async () => {
		const team = await createTeam(1);
		imageCounter++;
		const filename = `team-avatar-${imageCounter}.png`;

		const img = await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: filename,
			validatedAt: null,
			teamId: team.id,
			type: "team-pfp",
		});

		expect(img.url).toBe(filename);
		expect(img.submitterUserId).toBe(1);
		expect(img.validatedAt).toBeNull();

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeDefined();
	});

	test("creates image for team banner", async () => {
		const team = await createTeam(1);
		imageCounter++;
		const filename = `team-banner-${imageCounter}.png`;

		const img = await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: filename,
			validatedAt: null,
			teamId: team.id,
			type: "team-banner",
		});

		expect(img.url).toBe(filename);
		expect(img.submitterUserId).toBe(1);
		expect(img.validatedAt).toBeNull();

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeDefined();
	});

	test("creates image for organization avatar", async () => {
		const org = await createOrganization(1);
		imageCounter++;
		const filename = `org-avatar-${imageCounter}.png`;

		const img = await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: filename,
			validatedAt: null,
			organizationId: org.id,
			type: "org-pfp",
		});

		expect(img.url).toBe(filename);
		expect(img.submitterUserId).toBe(1);
		expect(img.validatedAt).toBeNull();

		const result = await ImageRepository.findById(img.id);
		expect(result).toBeDefined();
	});

	test("creates validated image when validatedAt is provided", async () => {
		const team = await createTeam(1);
		const validatedAt = Date.now();
		imageCounter++;

		const img = await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt,
			teamId: team.id,
			type: "team-pfp",
		});

		expect(img.validatedAt).toBe(validatedAt);

		const count = await ImageRepository.countAllUnvalidated();
		expect(count).toBe(0);
	});

	test("creates unvalidated image when validatedAt is null", async () => {
		const team = await createTeam(1);
		imageCounter++;

		await ImageRepository.addNewImage({
			submitterUserId: 1,
			url: `team-avatar-${imageCounter}.png`,
			validatedAt: null,
			teamId: team.id,
			type: "team-pfp",
		});

		const count = await ImageRepository.countAllUnvalidated();
		expect(count).toBe(1);
	});
});
