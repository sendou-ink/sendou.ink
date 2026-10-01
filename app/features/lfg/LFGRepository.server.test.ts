import { sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as LFGPostFactory from "~/db/seed/factories/LFGPostFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withNoUser, withUserId } from "~/utils/Test";
import * as LFGRepository from "./LFGRepository.server";
import { LFG } from "./lfg-constants";

const expired = () => sub(new Date(), { days: LFG.POST_FRESHNESS_DAYS + 1 });

const postIdsOf = (rows: Array<{ id: number }>) => rows.map((row) => row.id);

describe("LFGRepository.posts guards", () => {
	test("hides expired and plus tier restricted posts by default", async () => {
		const author = await UserFactory.create(null, { plusTier: 1 });
		const { id: freshPostId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
		});
		await LFGPostFactory.create(
			{ type: "PLAYER_FOR_COACH", authorId: author.id },
			{ updatedAt: expired() },
		);
		await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: (await UserFactory.create()).id,
			plusTierVisibility: 1,
		});

		expect(postIdsOf(await LFGRepository.posts().execute())).toEqual([
			freshPostId,
		]);
	});

	test("visibleToActor shows the author their expired post, which they can still bump", async () => {
		const author = await UserFactory.create();
		const { id: postId } = await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		const rows = await withUserId(author.id, () =>
			LFGRepository.posts().visibleToActor().execute(),
		);

		expect(postIdsOf(rows)).toEqual([postId]);
	});

	test("visibleToActor hides an expired post from other viewers", async () => {
		const author = await UserFactory.create();
		const viewer = await UserFactory.create();
		await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		const rows = await withUserId(viewer.id, () =>
			LFGRepository.posts().visibleToActor().execute(),
		);

		expect(rows).toHaveLength(0);
	});

	test("visibleToActor shows a plus tier restricted post to a viewer with the tier or a better one", async () => {
		const author = await UserFactory.create(null, { plusTier: 2 });
		const viewer = await UserFactory.create(null, { plusTier: 1 });
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
			plusTierVisibility: 2,
		});

		const rows = await withUserId(viewer.id, () =>
			LFGRepository.posts().visibleToActor().execute(),
		);

		expect(postIdsOf(rows)).toEqual([postId]);
	});

	test("visibleToActor hides a plus tier restricted post from a viewer without the tier", async () => {
		const author = await UserFactory.create(null, { plusTier: 1 });
		const viewer = await UserFactory.create(null, { plusTier: 3 });
		await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
			plusTierVisibility: 2,
		});

		const rows = await withUserId(viewer.id, () =>
			LFGRepository.posts().visibleToActor().execute(),
		);

		expect(rows).toHaveLength(0);
	});

	test("visibleToActor still shows the author their restricted post after they lose their plus tier", async () => {
		// the monthly voting can drop the author from the plus server they restricted the post to
		const author = await UserFactory.create();
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
			plusTierVisibility: 2,
		});

		const rows = await withUserId(author.id, () =>
			LFGRepository.posts().visibleToActor().execute(),
		);

		expect(postIdsOf(rows)).toEqual([postId]);
	});

	test("visibleToActor shows logged out visitors fresh unrestricted posts only", async () => {
		const author = await UserFactory.create();
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
		});
		await LFGPostFactory.create(
			{ type: "PLAYER_FOR_COACH", authorId: author.id },
			{ updatedAt: expired() },
		);

		const rows = await withNoUser(() =>
			LFGRepository.posts().visibleToActor().execute(),
		);

		expect(postIdsOf(rows)).toEqual([postId]);
	});

	test("ownedByActor returns only the actor's posts, expired and restricted included", async () => {
		const author = await UserFactory.create();
		const { id: expiredPostId } = await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);
		const { id: restrictedPostId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_COACH",
			authorId: author.id,
			plusTierVisibility: 1,
		});
		await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: (await UserFactory.create()).id,
		});

		const rows = await withUserId(author.id, () =>
			LFGRepository.posts().ownedByActor().execute(),
		);

		expect(new Set(postIdsOf(rows))).toEqual(
			new Set([expiredPostId, restrictedPostId]),
		);
	});
});

describe("LFGRepository.posts filters", () => {
	const users = UserFactory.pool();
	const authorId = () => users.id(1);
	const teammateId = () => users.id(2);

	beforeEach(async () => {
		await users.create(2);
	});

	const teamPost = async () => {
		const team = await TeamFactory.create({
			memberUserIds: [authorId(), teammateId()],
		});

		return LFGPostFactory.create({
			type: "TEAM_FOR_PLAYER",
			authorId: authorId(),
			teamId: team.id,
		});
	};

	test("withParticipantPlaying matches a team member playing a kit of the weapon", async () => {
		const tentatekPlayer = await UserFactory.create(null, {
			matchProfile: { weaponPool: [{ id: 41, isFavorite: false }] },
		});
		const team = await TeamFactory.create({
			memberUserIds: [authorId(), tentatekPlayer.id],
		});
		await LFGPostFactory.create({
			type: "TEAM_FOR_PLAYER",
			authorId: authorId(),
			teamId: team.id,
		});

		const [matching, notMatching] = await Promise.all([
			LFGRepository.posts().withParticipantPlaying([40]).execute(),
			LFGRepository.posts().withParticipantPlaying([1000]).execute(),
		]);

		expect(matching).toHaveLength(1);
		expect(notMatching).toHaveLength(0);
	});

	test("withParticipantPlaying never matches a coach post", async () => {
		const coach = await UserFactory.create(null, {
			matchProfile: { weaponPool: [{ id: 40, isFavorite: false }] },
		});
		await LFGPostFactory.create({ type: "COACH_FOR_TEAM", authorId: coach.id });

		const rows = await LFGRepository.posts()
			.withParticipantPlaying([40])
			.execute();

		expect(rows).toHaveLength(0);
	});

	test("withParticipantInPlusTier matches a post whose team member is in a better plus server", async () => {
		const plusMember = await UserFactory.create(null, { plusTier: 1 });
		const team = await TeamFactory.create({
			memberUserIds: [authorId(), plusMember.id],
		});
		const { id: postId } = await LFGPostFactory.create({
			type: "TEAM_FOR_SCRIM",
			authorId: authorId(),
			teamId: team.id,
		});

		const [plusTwo, withoutFilter] = await Promise.all([
			LFGRepository.posts().withParticipantInPlusTier(2).execute(),
			LFGRepository.posts().withParticipantInPlusTier(null).execute(),
		]);

		expect(postIdsOf(plusTwo)).toEqual([postId]);
		expect(withoutFilter).toHaveLength(1);
	});

	test("withParticipantAmong matches by author or team member", async () => {
		const { id: postId } = await teamPost();

		const [byTeammate, byNobody] = await Promise.all([
			LFGRepository.posts().withParticipantAmong([teammateId()]).execute(),
			LFGRepository.posts().withParticipantAmong([]).execute(),
		]);

		expect(postIdsOf(byTeammate)).toEqual([postId]);
		expect(byNobody).toHaveLength(0);
	});

	test("inLanguage matches posts listing the language", async () => {
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: authorId(),
			languages: ["de", "en"],
		});
		await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: teammateId(),
		});

		const rows = await LFGRepository.posts().inLanguage("en").execute();

		expect(postIdsOf(rows)).toEqual([postId]);
	});

	test("inTimezoneWithin is skipped while the viewer's timezone is unknown", async () => {
		await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: authorId(),
			timezone: "Asia/Tokyo",
		});

		const [unknownViewer, farViewer] = await Promise.all([
			LFGRepository.posts().inTimezoneWithin(0, null).execute(),
			LFGRepository.posts().inTimezoneWithin(1, "Europe/Helsinki").execute(),
		]);

		expect(unknownViewer).toHaveLength(1);
		expect(farViewer).toHaveLength(0);
	});

	test("withTeam adds the team's members with their cards", async () => {
		await teamPost();

		const [row] = await withNoUser(() =>
			LFGRepository.posts().withTeam().execute(),
		);

		expect(new Set(row.team?.members.map((member) => member.card?.id))).toEqual(
			new Set([authorId(), teammateId()]),
		);
	});
});
