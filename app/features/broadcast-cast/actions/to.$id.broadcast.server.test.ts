import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentStaffFactory from "~/db/seed/factories/TournamentStaffFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { adminStreamFormSchema } from "~/features/tournament-admin/tournament-admin-staff-schemas";
import { wrappedAction } from "~/utils/Test";
import { action } from "./to.$id.broadcast.server";

const addChannel = wrappedAction<typeof adminStreamFormSchema>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const streamerId = () => users.id(2);

beforeEach(async () => {
	await users.create(2);
});

describe("action", () => {
	test("adds the cast channel to the tournament's ones", async () => {
		const { id } = await TournamentFactory.create(
			{ authorId: organizerId() },
			{
				castAccounts: [
					{ platform: "TWITCH", account: "sendouink", name: "sendouink" },
				],
			},
		);

		const response = await addChannel(
			{ castAccounts: ["SendouInk", "dappleproductions"] },
			{ user: organizerId(), params: { id: String(id) } },
		);

		expect(response.headers.get("Location")).toBe(`/to/${id}/broadcast`);
		const tournament = await TournamentRepository.findById(id);
		expect(
			tournament?.castAccounts?.map((castAccount) => castAccount.account),
		).toEqual(["sendouink", "dappleproductions"]);
	});

	test("is for organizers only, not streamers", async () => {
		const { id } = await TournamentFactory.create({ authorId: organizerId() });
		await TournamentStaffFactory.create({
			tournamentId: id,
			userId: streamerId(),
			role: "STREAMER",
		});

		const response = await addChannel(
			{ castAccounts: ["sendouink"] },
			{ user: streamerId(), params: { id: String(id) } },
		);

		expect(response.headers.get("Location")).toBe(`/to/${id}`);

		const tournament = await TournamentRepository.findById(id);
		expect(tournament?.castAccounts ?? []).toEqual([]);
	});
});
