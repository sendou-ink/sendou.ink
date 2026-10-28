import { describe, expect, test } from "bun:test";
import { db } from "~/db/sql";
import * as LobbySet from "~/features/lobbies/core/LobbySet";
import * as LobbyMatchRepository from "~/features/lobbies/LobbyMatchRepository.server";
import * as Scenarios from "./Scenarios.server";

const userExists = async (userId: number) =>
	Boolean(
		await db
			.selectFrom("User")
			.select("User.id")
			.where("User.id", "=", userId)
			.executeTakeFirst(),
	);

const lobbyIdOf = (path: string) => Number(path.split("/").at(-1));

const paramVariants = Scenarios.list().flatMap((scenario) =>
	scenario.params.flatMap((param) =>
		param.kind === "select"
			? param.options.map((option) => ({
					scenarioId: scenario.id,
					params: { [param.key]: option.value },
				}))
			: [],
	),
);

describe("Scenarios.run", () => {
	test.each(Scenarios.list().map((scenario) => scenario.id))(
		"%s with default params lands an existing user on a page",
		async (scenarioId) => {
			const outcome = await Scenarios.run(scenarioId);
			if (outcome.status !== "ok") throw new Error(outcome.status);

			expect(outcome.result.path).toMatch(/^\//);
			expect(outcome.result.path).not.toMatch(/undefined|null|NaN/);
			expect(await userExists(outcome.result.userId)).toBe(true);
		},
	);

	test.each(paramVariants)(
		"$scenarioId runs with $params",
		async ({ scenarioId, params }) => {
			const outcome = await Scenarios.run(scenarioId, params);

			expect(outcome.status).toBe("ok");
		},
	);

	test.each(["single_elimination", "round_robin"])(
		"tournament-player lands on a match with an opponent when the team count leaves BYEs (%s)",
		async (format) => {
			const outcome = await Scenarios.run("tournament-player", {
				teams: 5,
				format,
			});
			if (outcome.status !== "ok") throw new Error(outcome.status);

			const matchId = Number(outcome.result.path.split("/").at(-1));
			const match = await db
				.selectFrom("TournamentMatch")
				.select(["opponentOne", "opponentTwo"])
				.where("id", "=", matchId)
				.executeTakeFirstOrThrow();

			expect(match.opponentOne?.id).toBeTypeOf("number");
			expect(match.opponentTwo?.id).toBeTypeOf("number");
		},
	);

	test.each([
		{ state: "reporting", can: LobbySet.canReport },
		{ state: "awaiting-confirmation", can: LobbySet.canConfirm },
		{ state: "disputed", can: LobbySet.canUndo },
	])(
		"lobby-set lands a player on the side the set waits on ($state)",
		async ({ state, can }) => {
			const outcome = await Scenarios.run("lobby-set", { state });
			if (outcome.status !== "ok") throw new Error(outcome.status);

			const set = (
				await LobbyMatchRepository.findAllSetsByLobbyId(
					lobbyIdOf(outcome.result.path),
				)
			).at(-1)!;

			expect(can(set, outcome.result.userId)).toBe(true);
		},
	);

	test("lobby-set sitting out lands a room member without a side", async () => {
		const outcome = await Scenarios.run("lobby-set", { you: "sitting-out" });
		if (outcome.status !== "ok") throw new Error(outcome.status);

		const set = (
			await LobbyMatchRepository.findAllSetsByLobbyId(
				lobbyIdOf(outcome.result.path),
			)
		).at(-1)!;

		expect(LobbySet.sideOf(set, outcome.result.userId)).toBeNull();
	});

	test("lobby-open-spot asks the viewer whether they are ready", async () => {
		const outcome = await Scenarios.run("lobby-open-spot", { position: 2 });
		if (outcome.status !== "ok") throw new Error(outcome.status);

		const readyCheckUser = await db
			.selectFrom("LobbyReadyCheckUser")
			.innerJoin(
				"LobbyReadyCheck",
				"LobbyReadyCheck.id",
				"LobbyReadyCheckUser.readyCheckId",
			)
			.select("LobbyReadyCheckUser.confirmedAt")
			.where("LobbyReadyCheck.lobbyId", "=", lobbyIdOf(outcome.result.path))
			.where("LobbyReadyCheckUser.userId", "=", outcome.result.userId)
			.executeTakeFirst();

		expect(readyCheckUser).toEqual({ confirmedAt: null });
	});

	test("accepts numbers given as strings, like the CLI sends them", async () => {
		const outcome = await Scenarios.run("tournament-registration", {
			registeredTeams: "2",
		});

		expect(outcome.status).toBe("ok");
	});

	test.each([
		{ why: "unknown param", params: { nope: 1 } },
		{ why: "number out of range", params: { teams: 1000 } },
		{ why: "not a whole number", params: { teams: "8.5" } },
		{ why: "unknown option", params: { format: "ladder" } },
	])("rejects $why", async ({ params }) => {
		const outcome = await Scenarios.run("tournament-organizer", params);

		expect(outcome.status).toBe("invalid-params");
	});

	test("returns unknown-scenario for an unknown id", async () => {
		expect(await Scenarios.run("no-such-scenario")).toEqual({
			status: "unknown-scenario",
		});
	});

	test("records the run as the most recent one", async () => {
		const outcome = await Scenarios.run("new-user");
		if (outcome.status !== "ok") throw new Error(outcome.status);

		expect(Scenarios.recentRuns()[0]).toMatchObject({
			scenarioId: "new-user",
			userId: outcome.result.userId,
		});
	});
});
