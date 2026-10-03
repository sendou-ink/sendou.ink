import type * as v from "valibot";
import { beforeEach, describe, expect, test } from "vitest";
import { DEV_TEST_ID } from "~/db/seed/constants";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentOrganizationSeriesRepository from "~/features/tournament-organization/TournamentOrganizationSeriesRepository.server";
import { decompressFromBase64 } from "~/utils/compression";
import {
	assertResponseErrored,
	type TestUser,
	wrappedAction,
	wrappedLoader,
} from "~/utils/Test";
import {
	loader as backfillLoader,
	type TrophyBackfillLoaderData,
} from "../routes/trophies.$id.backfill.$seriesId";
import * as TrophyRepository from "../TrophyRepository.server";
import type { trophyFormSchema } from "../trophies-schemas";
import { action } from "./trophies.new.server";

type BackfillFormFields = {
	_action: "BACKFILL";
	trophyId: number;
	seriesId: number;
	awards: string;
};

const submitAction = wrappedAction<typeof trophyFormSchema>({
	action,
	isJsonSubmission: true,
});
const backfillAction = wrappedAction<v.GenericSchema<BackfillFormFields>>({
	action,
});
const loadBackfillable = wrappedLoader<TrophyBackfillLoaderData>({
	loader: backfillLoader,
});

const users = UserFactory.pool();
const managerId = () => users.id(1);
const winnerIds = () => users.ids(5).slice(1, 5);
const loserIds = () => users.ids(9).slice(5, 9);

describe("trophy submissions", () => {
	const submitterId = () => users.id(1);
	const artistId = () => users.id(2);

	let organizationId: number;

	beforeEach(async () => {
		await users.create(2);
		organizationId = (
			await TournamentOrganizationFactory.create({ ownerId: submitterId() })
		).id;
	});

	const submit = (overrides: { name: string; creatorId?: number }) =>
		submitAction(
			{
				_action: "CREATE",
				model: decompressFromBase64(TrophyFactory.MODELS[0]) ?? "",
				organizationId,
				description: null,
				...overrides,
			},
			{ user: submitterId() },
		);

	test("a submission awaits review with the submitter as its creator", async () => {
		expect(await submit({ name: "Regular Trophy" })).toBe(null);

		const pending = await submissionsOf(submitterId()).execute();
		expect(pending.map((trophy) => trophy.name)).toEqual(["Regular Trophy"]);
		expect(pending[0].creatorId).toBe(submitterId());
	});

	test("a submission can name someone else as the creator", async () => {
		expect(
			await submit({ name: "Commissioned Trophy", creatorId: artistId() }),
		).toBe(null);

		const [pending] = await submissionsOf(submitterId()).execute();
		expect(pending.creatorId).toBe(artistId());
		expect(pending.creator?.id).toBe(artistId());
	});
});

describe("trophy backfill", () => {
	let trophyId: number;
	let seriesId: number;
	let tournamentId: number;

	beforeEach(async () => {
		await UserFactory.createAdmin();
		await users.create(9);
		await UserFactory.createDev();

		const organization = await TournamentOrganizationFactory.create(
			{ ownerId: managerId() },
			{
				series: [
					{ name: "Weekly Cup", description: null, showLeaderboard: false },
				],
			},
		);
		const [series] = await TournamentOrganizationSeriesRepository.series()
			.where({ organizationId: organization.id })
			.execute();
		seriesId = series.id;

		trophyId = (
			await TrophyFactory.create({
				organizationId: organization.id,
				managerId: managerId(),
			})
		).id;

		tournamentId = (
			await TournamentFactory.createPlayed(
				{
					authorId: managerId(),
					name: "Weekly Cup #1",
					organizationId: organization.id,
				},
				{ teamRosters: [winnerIds(), loserIds()], playedOut: "all" },
			)
		).id;
	});

	const backfill = (userIds: number[], user: TestUser = "admin") =>
		backfillAction(
			{
				_action: "BACKFILL",
				trophyId,
				seriesId,
				awards: JSON.stringify([{ tournamentId, userIds }]),
			},
			{ user },
		);

	const awardedTournamentIds = async () =>
		(await TrophyRepository.findTournamentsByTrophyId(trophyId)).map(
			(tournament) => tournament.tournamentId,
		);

	test("an admin lists the series' tournaments with their winners", async () => {
		const data = await loadBackfillable({
			user: "admin",
			params: { id: String(trophyId), seriesId: String(seriesId) },
		});

		expect(
			data.tournaments.map((tournament) => tournament.tournamentId),
		).toEqual([tournamentId]);
		expect(data.tournaments[0].winners.map((winner) => winner.id)).toEqual(
			winnerIds(),
		);
	});

	test("the trophy's manager can't list the tournaments", async () => {
		await expect(
			loadBackfillable({
				user: managerId(),
				params: { id: String(trophyId), seriesId: String(seriesId) },
			}),
		).rejects.toThrow("403");
	});

	test("an admin awards the trophy to the chosen winners", async () => {
		await backfill(winnerIds().slice(0, 3));

		expect(await awardedTournamentIds()).toEqual([tournamentId]);

		const ownerIds = (
			await TrophyRepository.trophies()
				.where({ id: trophyId })
				.withOwners()
				.executeTakeFirst()
		)?.owners.map((owner) => owner.id);
		expect(ownerIds?.toSorted((a, b) => a - b)).toEqual(
			winnerIds().slice(0, 3),
		);
	});

	test("a dev awards the trophy", async () => {
		await backfill(winnerIds(), DEV_TEST_ID);

		expect(await awardedTournamentIds()).toEqual([tournamentId]);
	});

	test("the trophy's manager can't award it", async () => {
		const response = await backfill(winnerIds(), managerId());

		assertResponseErrored(response, "Not allowed");
		expect(await awardedTournamentIds()).toEqual([]);
	});

	test("a player who didn't win the tournament can't receive the trophy", async () => {
		const response = await backfill([winnerIds()[0], loserIds()[0]]);

		assertResponseErrored(response, "Only the winners");
		expect(await awardedTournamentIds()).toEqual([]);
	});

	test("a tournament can't be awarded twice", async () => {
		await backfill(winnerIds());

		const response = await backfill(winnerIds());

		assertResponseErrored(response, "can't be backfilled");
	});
});

function submissionsOf(submitterUserId: number) {
	return TrophyRepository.submissions()
		.where({ submitterUserId })
		.withCreator();
}
