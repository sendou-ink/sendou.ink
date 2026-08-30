import { beforeEach, describe, expect, test } from "vitest";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as TeamEventFactory from "~/db/seed/factories/TeamEventFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { TournamentSettings } from "~/db/tables-json";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { withUserId } from "~/utils/Test";
import * as Commitments from "./Commitments.server";

const users = UserFactory.pool();
const memberId = () => users.id(1);
const teammateId = () => users.id(2);
const outsiderId = () => users.id(3);
const opponentId = () => users.id(4);
const organizerId = () => users.id(5);

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Monday 2027-01-25 00:00 UTC; any fixed point works, the queries take explicit windows. */
const WEEK_STARTS_AT = 1_800_000_000;

const WINDOW = {
	startsAt: WEEK_STARTS_AT,
	endsAt: WEEK_STARTS_AT + 7 * DAY,
};

const DOUBLE_ELIMINATION: TournamentSettings["bracketProgression"] = [
	{
		name: "Bracket",
		type: "double_elimination",
		requiresCheckIn: false,
		settings: {},
	},
];

const blocksOf = async (userId: number, window = WINDOW) =>
	(
		await Commitments.busyBlocksByUserIds({
			userIds: [userId, outsiderId()],
			...window,
		})
	).get(userId);

describe("Commitments.busyBlocksByUserIds", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("a team event blocks every member for its span", async () => {
		const team = await TeamFactory.create({
			memberUserIds: [memberId(), teammateId()],
		});
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: memberId(),
			name: "VoD review",
			startsAt: WEEK_STARTS_AT + DAY,
			endsAt: WEEK_STARTS_AT + DAY + 2 * HOUR,
		});

		const byUserId = await Commitments.busyBlocksByUserIds({
			userIds: [memberId(), teammateId(), outsiderId()],
			...WINDOW,
		});

		for (const userId of [memberId(), teammateId()]) {
			expect(byUserId.get(userId)).toEqual([
				{
					type: "teamEvent",
					name: "VoD review",
					startsAt: WEEK_STARTS_AT + DAY,
					endsAt: WEEK_STARTS_AT + DAY + 2 * HOUR,
				},
			]);
		}
		expect(byUserId.get(outsiderId())).toBeUndefined();
	});

	test("an accepted scrim blocks both sides for the assumed length", async () => {
		await ScrimPostFactory.create(
			{
				startsAt: WEEK_STARTS_AT + 2 * DAY,
				users: [{ userId: memberId(), isOwner: 1 }],
			},
			{
				requests: [
					{ users: [{ userId: opponentId(), isOwner: 1 }], isAccepted: true },
				],
			},
		);

		for (const userId of [memberId(), opponentId()]) {
			expect(await blocksOf(userId)).toEqual([
				{
					type: "scrim",
					name: null,
					startsAt: WEEK_STARTS_AT + 2 * DAY,
					endsAt: WEEK_STARTS_AT + 2 * DAY + 1.5 * HOUR,
				},
			]);
		}
	});

	test("a scrim that is only requested is not a block", async () => {
		await ScrimPostFactory.create(
			{
				startsAt: WEEK_STARTS_AT + 2 * DAY,
				users: [{ userId: memberId(), isOwner: 1 }],
			},
			{ requests: [{ users: [{ userId: opponentId(), isOwner: 1 }] }] },
		);

		expect(await blocksOf(memberId())).toBeUndefined();
		expect(await blocksOf(opponentId())).toBeUndefined();
	});

	test("a range scrim blocks at the accepted request's chosen time", async () => {
		await ScrimPostFactory.create(
			{
				startsAt: WEEK_STARTS_AT + DAY,
				rangeEndsAt: WEEK_STARTS_AT + DAY + 3 * HOUR,
				users: [{ userId: memberId(), isOwner: 1 }],
			},
			{
				requests: [
					{
						users: [{ userId: opponentId(), isOwner: 1 }],
						startsAt: WEEK_STARTS_AT + DAY + HOUR,
						isAccepted: true,
					},
				],
			},
		);

		expect(await blocksOf(memberId())).toEqual([
			{
				type: "scrim",
				name: null,
				startsAt: WEEK_STARTS_AT + DAY + HOUR,
				endsAt: WEEK_STARTS_AT + DAY + 2.5 * HOUR,
			},
		]);
	});

	test("a tournament registration blocks from the event start for the estimated duration", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			name: "In The Zone 42",
			startTimes: [WEEK_STARTS_AT + 3 * DAY],
			bracketProgression: DOUBLE_ELIMINATION,
		});
		await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [memberId(), teammateId()],
		});

		expect(await blocksOf(memberId())).toEqual([
			{
				type: "tournament",
				name: "In The Zone 42",
				startsAt: WEEK_STARTS_AT + 3 * DAY,
				endsAt: WEEK_STARTS_AT + 3 * DAY + 4 * HOUR,
			},
		]);
		expect(await blocksOf(outsiderId())).toBeUndefined();
	});

	test("excludeTournamentId leaves that tournament's registration out, others stay", async () => {
		const excluded = await TournamentFactory.create({
			authorId: organizerId(),
			startTimes: [WEEK_STARTS_AT + 3 * DAY],
		});
		await TournamentTeamFactory.create({
			tournamentId: excluded.id,
			memberUserIds: [memberId()],
		});
		const other = await TournamentFactory.create({
			authorId: organizerId(),
			name: "Elsewhere Open",
			startTimes: [WEEK_STARTS_AT + 4 * DAY],
			bracketProgression: DOUBLE_ELIMINATION,
		});
		await TournamentTeamFactory.create({
			tournamentId: other.id,
			memberUserIds: [memberId()],
		});

		const blocks = (
			await Commitments.busyBlocksByUserIds({
				userIds: [memberId()],
				...WINDOW,
				excludeTournamentId: excluded.id,
			})
		).get(memberId());

		expect(blocks?.map((block) => block.name)).toEqual(["Elsewhere Open"]);
	});

	test("test and league tournaments are not blocks", async () => {
		const testTournament = await TournamentFactory.create({
			authorId: organizerId(),
			startTimes: [WEEK_STARTS_AT + 3 * DAY],
			isTest: true,
		});
		await TournamentTeamFactory.create({
			tournamentId: testTournament.id,
			memberUserIds: [memberId()],
		});

		const leagueTournament = await TournamentFactory.create({
			authorId: organizerId(),
			startTimes: [WEEK_STARTS_AT + 4 * DAY],
		});
		await setTournamentSettings(leagueTournament.id, { isLeague: true });
		await TournamentTeamFactory.create({
			tournamentId: leagueTournament.id,
			memberUserIds: [memberId()],
		});

		expect(await blocksOf(memberId())).toBeUndefined();
	});

	test("a dropped-out team's registration is not a block", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			startTimes: [WEEK_STARTS_AT + 3 * DAY],
		});
		const tournamentTeam = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [memberId()],
		});
		await withUserId(memberId(), () =>
			TournamentTeamRepository.dropOut({
				tournamentTeamId: tournamentTeam.id,
				previewBracketIdxs: [],
			}),
		);

		expect(await blocksOf(memberId())).toBeUndefined();
	});

	test("only blocks overlapping the window are returned, sorted by start", async () => {
		const team = await TeamFactory.create({ memberUserIds: [memberId()] });
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: memberId(),
			name: "Before the window",
			startsAt: WEEK_STARTS_AT - 3 * HOUR,
			endsAt: WEEK_STARTS_AT,
		});
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: memberId(),
			name: "Straddles the start",
			startsAt: WEEK_STARTS_AT - HOUR,
			endsAt: WEEK_STARTS_AT + HOUR,
		});
		await ScrimPostFactory.create(
			{
				startsAt: WEEK_STARTS_AT + 2 * DAY,
				users: [{ userId: memberId(), isOwner: 1 }],
			},
			{
				requests: [
					{ users: [{ userId: opponentId(), isOwner: 1 }], isAccepted: true },
				],
			},
		);
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: memberId(),
			name: "After the window",
			startsAt: WINDOW.endsAt + HOUR,
			endsAt: WINDOW.endsAt + 2 * HOUR,
		});

		expect(
			(await blocksOf(memberId()))?.map((block) => block.startsAt),
		).toEqual([WEEK_STARTS_AT - HOUR, WEEK_STARTS_AT + 2 * DAY]);
	});
});

async function setTournamentSettings(
	tournamentId: number,
	patch: Partial<TournamentSettings>,
) {
	const { settings } = await db
		.selectFrom("Tournament")
		.select("settings")
		.where("id", "=", tournamentId)
		.executeTakeFirstOrThrow();

	// biome-ignore lint/plugin: leagues are not created through app code, so no production write reaches isLeague
	await db
		.updateTable("Tournament")
		.set({ settings: JSON.stringify({ ...settings, ...patch }) })
		.where("id", "=", tournamentId)
		.execute();
}
