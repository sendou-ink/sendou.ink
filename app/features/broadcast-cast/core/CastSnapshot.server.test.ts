import { addMinutes, subHours } from "date-fns";
import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as DiscordAvatar from "~/features/auth/core/DiscordAvatar.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentBracketChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
import { avatarUrl } from "~/utils/urls";
import { BROADCAST_FINISHED_SET_SHOWN_MS } from "../broadcast-cast-constants";
import * as CastChannel from "./CastChannel";
import * as CastSnapshot from "./CastSnapshot.server";

const CAST_ACCOUNT = {
	platform: "TWITCH" as const,
	account: "sendouink",
	name: "sendouink",
};

const AVATAR_HASH = "a1b2c3d4";

const TEAM_COUNT = 16;
const TEAM_SIZE = 4;
// in a second starting bracket
const EXTRA_TEAM_COUNT = 4;

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const casterId = () => users.id(2);
const teamRosters = () =>
	R.chunk(users.ids().slice(2, 2 + TEAM_COUNT * TEAM_SIZE), TEAM_SIZE);
const extraTeamRosters = () =>
	R.chunk(users.ids().slice(2 + TEAM_COUNT * TEAM_SIZE), TEAM_SIZE);

beforeEach(async () => {
	await users.create(2 + (TEAM_COUNT + EXTRA_TEAM_COUNT) * TEAM_SIZE);
});

describe("CastSnapshot.build", () => {
	test("gives the casters in their saved order with their settings and avatars, leaving out users no longer there", async () => {
		const { id: tournamentId } = await TournamentFactory.create(
			{ authorId: organizerId() },
			{ castAccounts: [CAST_ACCOUNT] },
		);
		const casterWithAvatar = await UserFactory.create({
			discordAvatar: AVATAR_HASH,
		});
		await TournamentBroadcastFactory.setCasters({
			tournamentId,
			channel: CAST_ACCOUNT,
			casters: [
				{
					userId: casterWithAvatar.id,
					vdoNinjaUrl: "https://vdo.ninja/?view=abc123",
					isAudioOnly: true,
					volume: 40,
				},
				{ userId: 999_999, vdoNinjaUrl: null, isAudioOnly: false, volume: 100 },
				{
					userId: casterId(),
					vdoNinjaUrl: null,
					isAudioOnly: false,
					volume: 100,
				},
			],
		});

		const built = await CastSnapshot.build({
			tournamentId,
			slug: CastChannel.list([CAST_ACCOUNT])[0].slug,
		});

		expect(
			built?.snapshot.casters.map((caster) => ({
				userId: caster.userId,
				vdoNinjaUrl: caster.vdoNinjaUrl,
				isAudioOnly: caster.isAudioOnly,
				volume: caster.volume,
				avatarUrl: caster.avatarUrl,
			})),
		).toEqual([
			{
				userId: casterWithAvatar.id,
				vdoNinjaUrl: "https://vdo.ninja/?view=abc123",
				isAudioOnly: true,
				volume: 40,
				avatarUrl: avatarUrl(
					DiscordAvatar.fileNameOf({
						userId: casterWithAvatar.id,
						hash: AVATAR_HASH,
					}),
					"lg",
				),
			},
			{
				userId: casterId(),
				vdoNinjaUrl: null,
				isAudioOnly: false,
				volume: 100,
				avatarUrl: null,
			},
		]);
	});

	test("gives the casters' user page custom URLs, null for those without one", async () => {
		const { id: tournamentId } = await TournamentFactory.create(
			{ authorId: organizerId() },
			{ castAccounts: [CAST_ACCOUNT] },
		);
		const withCustomUrl = await UserFactory.create({
			profile: { customUrl: "bee" },
		});
		await TournamentBroadcastFactory.setCasters({
			tournamentId,
			channel: CAST_ACCOUNT,
			casters: [withCustomUrl.id, casterId()].map((userId) => ({
				userId,
				vdoNinjaUrl: null,
				isAudioOnly: false,
				volume: 100,
			})),
		});

		const built = await CastSnapshot.build({
			tournamentId,
			slug: CastChannel.list([CAST_ACCOUNT])[0].slug,
		});

		expect(built?.snapshot.casters.map((caster) => caster.customUrl)).toEqual([
			"bee",
			null,
		]);
	});

	describe("otherMatches", () => {
		/** A started 16 team single elimination with its first round match 1 cast on the channel, the rest of the first round (7 sets) still to play. */
		const broadcasting = async () => {
			const tournament = await TournamentFactory.createBroadcasting(
				{ authorId: organizerId() },
				{ teamRosters: teamRosters(), twitchAccount: CAST_ACCOUNT.account },
			);
			const firstRound = (await tournamentFromDB(tournament.id))
				.bracketByIdx(0)!
				.data.match.filter(
					(match) =>
						typeof match.opponent1?.id === "number" &&
						typeof match.opponent2?.id === "number",
				);

			return {
				tournamentId: tournament.id,
				otherMatchIds: firstRound
					.map((match) => match.id)
					.filter((id) => id !== tournament.matchId),
			};
		};
		const buildCast = (tournamentId: number) =>
			CastSnapshot.build({
				tournamentId,
				slug: CastChannel.list([CAST_ACCOUNT])[0].slug,
			});
		const buildOtherMatches = async (tournamentId: number) =>
			(await buildCast(tournamentId))?.snapshot.otherMatches;

		test("lists the sets being played, 0-0 ones too, in bracket order with their scores", async () => {
			const { tournamentId, otherMatchIds } = await broadcasting();
			await TournamentFactory.playMatches(tournamentId, {
				matchIds: [otherMatchIds[1]],
				mapCount: 1,
			});

			const otherMatches = await buildOtherMatches(tournamentId);

			expect(
				otherMatches?.map((match) => ({ id: match.id, scores: match.scores })),
			).toEqual(
				otherMatchIds.map((id) => ({
					id,
					scores: id === otherMatchIds[1] ? [1, 0] : [0, 0],
				})),
			);
			expect(otherMatches?.[0]).toMatchObject({
				// one bracket only: no bracket name in front
				roundName: expect.not.stringContaining("·"),
				teams: [
					{ name: expect.stringMatching(/^Team /), seed: expect.any(Number) },
					{ name: expect.stringMatching(/^Team /), seed: expect.any(Number) },
				],
				winner: null,
			});
		});

		test("leaves out sets cast on another channel", async () => {
			const { tournamentId, otherMatchIds } = await broadcasting();
			await TournamentFactory.castMatch({
				tournamentId,
				matchId: otherMatchIds[1],
				twitchAccount: "othercaster",
			});

			const otherMatches = await buildOtherMatches(tournamentId);

			expect(otherMatches?.map((match) => match.id)).toEqual(
				otherMatchIds.filter((id) => id !== otherMatchIds[1]),
			);
		});

		test("leaves out sets held back for a cast", async () => {
			const { tournamentId, otherMatchIds } = await broadcasting();
			await TournamentFactory.lockMatch({
				tournamentId,
				matchId: otherMatchIds[1],
				twitchAccount: "othercaster",
			});

			const otherMatches = await buildOtherMatches(tournamentId);

			expect(otherMatches?.map((match) => match.id)).toEqual(
				otherMatchIds.filter((id) => id !== otherMatchIds[1]),
			);
		});

		test("leaves out a bracket not started yet", async () => {
			const division = (name: string) => ({
				name,
				type: "single_elimination" as const,
				requiresCheckIn: false,
				settings: { skippedRounds: ["THIRD_PLACE_MATCH" as const] },
			});
			const tournament = await TournamentFactory.createBroadcasting(
				{
					authorId: organizerId(),
					bracketProgression: [division("Alpha"), division("Beta")],
				},
				{ teamRosters: teamRosters(), twitchAccount: CAST_ACCOUNT.account },
			);
			// the second division's teams are known, so its preview has sets ready to play
			for (const memberUserIds of extraTeamRosters()) {
				await TournamentTeamFactory.create(
					{ tournamentId: tournament.id, memberUserIds },
					{ isCheckedIn: true, startingBracketIdx: 1 },
				);
			}

			const otherMatches = await buildOtherMatches(tournament.id);

			// the first division's first round but the cast set
			expect(otherMatches).toHaveLength(7);
			expect(otherMatches?.[0]?.roundName).not.toContain("·");
		});

		test("subscribes to the channels of the groups the sets being played are in", async () => {
			const tournament = await TournamentFactory.createBroadcasting(
				{
					authorId: organizerId(),
					bracketProgression: [
						{
							name: "Swiss",
							type: "swiss",
							requiresCheckIn: false,
							settings: { groupCount: 2, roundCount: 3 },
						},
					],
				},
				{ teamRosters: teamRosters(), twitchAccount: CAST_ACCOUNT.account },
			);
			const bracket = (await tournamentFromDB(tournament.id)).bracketByIdx(0)!;
			const featuredGroupId = bracket.data.match.find(
				(match) => match.id === tournament.matchId,
			)!.groupId;
			const otherGroupId = bracket.data.group.find(
				(group) => group.id !== featuredGroupId,
			)!.id;

			const built = await buildCast(tournament.id);

			expect(built?.eventChannels).toContain(
				tournamentBracketChannel({
					tournamentId: tournament.id,
					bracketIdx: 0,
					groupId: otherGroupId,
				}),
			);
		});

		test("names the bracket in front of the round when the sets are of more than one", async () => {
			const tournament = await TournamentFactory.createBroadcasting(
				{
					authorId: organizerId(),
					bracketProgression: [
						{
							name: "Pools",
							type: "round_robin",
							requiresCheckIn: false,
							settings: { teamsPerGroup: 4 },
						},
						{
							name: "Final",
							type: "single_elimination",
							requiresCheckIn: false,
							settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
							sources: [{ bracketIdx: 0, placements: [1] }],
						},
					],
				},
				{ teamRosters: teamRosters(), twitchAccount: CAST_ACCOUNT.account },
			);
			while ((await TournamentFactory.playMatches(tournament.id)).length > 0) {}
			const poolMatchIds = (await tournamentFromDB(tournament.id))
				.bracketByIdx(0)!
				.data.match.map((match) => match.id);
			for (const matchId of poolMatchIds) {
				await TournamentFactory.backdateMatch({
					matchId,
					playedAt: subHours(new Date(), 3),
				});
			}
			await TournamentFactory.startBracket(tournament.id, { bracketIdx: 1 });

			const otherMatches = await buildOtherMatches(tournament.id);

			// the final's 2 semis being played, topped up with finished pool sets
			expect(
				otherMatches?.map((match) => match.roundName?.split(" · ")[0]),
			).toEqual(["Pools", "Pools", "Pools", "Final", "Final"]);
		});

		test("keeps a finished set with its winner until 10 minutes after its last game, rebuilding then", async () => {
			const { tournamentId, otherMatchIds } = await broadcasting();
			await TournamentFactory.playMatches(tournamentId, {
				matchIds: [otherMatchIds[0]],
			});

			const built = await buildCast(tournamentId);

			expect(built?.snapshot.otherMatches[0]).toMatchObject({
				id: otherMatchIds[0],
				winner: expect.any(Number),
			});
			expect(built?.staleAt).toBeGreaterThan(Date.now());
			expect(built?.staleAt).toBeLessThanOrEqual(
				Date.now() + BROADCAST_FINISHED_SET_SHOWN_MS,
			);
		});

		test("leaves out a set finished more than 10 minutes ago when enough other sets are shown", async () => {
			const { tournamentId, otherMatchIds } = await broadcasting();
			await TournamentFactory.playMatches(tournamentId, {
				matchIds: [otherMatchIds[0]],
			});
			await TournamentFactory.backdateMatch({
				matchId: otherMatchIds[0],
				playedAt: subHours(new Date(), 1),
			});

			const built = await buildCast(tournamentId);

			expect(built?.snapshot.otherMatches.map((match) => match.id)).toEqual(
				otherMatchIds.slice(1),
			);
			expect(built?.staleAt).toBeNull();
		});

		test("tops the sets up to 5 with the most recently finished ones, however long ago", async () => {
			const { tournamentId, otherMatchIds } = await broadcasting();
			await TournamentFactory.playMatches(tournamentId, {
				matchIds: otherMatchIds,
			});
			// the later in the bracket, the more recently played
			for (const [index, matchId] of otherMatchIds.entries()) {
				await TournamentFactory.backdateMatch({
					matchId,
					playedAt: addMinutes(subHours(new Date(), 3), index * 10),
				});
			}

			const otherMatches = await buildOtherMatches(tournamentId);

			// the 3 second round sets whose teams are known are being played
			expect(otherMatches).toHaveLength(5);
			expect(
				otherMatches
					?.filter((match) => match.winner !== null)
					.map((match) => match.id),
			).toEqual(otherMatchIds.slice(-2));
		});
	});
});
