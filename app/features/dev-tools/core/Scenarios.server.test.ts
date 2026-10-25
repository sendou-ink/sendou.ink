import { describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import * as Scenarios from "./Scenarios.server";

const userExists = async (userId: number) =>
	Boolean(
		await db
			.selectFrom("User")
			.select("User.id")
			.where("User.id", "=", userId)
			.executeTakeFirst(),
	);

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

			expect(typeof match.opponentOne?.id).toBe("number");
			expect(typeof match.opponentTwo?.id).toBe("number");
		},
	);

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
