import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentLFGTeamFactory from "~/db/seed/factories/TournamentLFGTeamFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentRepository from "./TournamentRepository.server";

const users = UserFactory.pool();

const authorId = () => users.id(1);
const registeredUserId = () => users.id(2);
const lookingForTeamUserId = () => users.id(3);

describe("TournamentRepository.findRelatedUsersByTournamentIds", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("leaves out members of a placeholder LFG team", async () => {
		const { id: tournamentId } = await TournamentFactory.create({
			authorId: authorId(),
		});
		await TournamentTeamFactory.create({
			tournamentId,
			memberUserIds: [registeredUserId()],
		});
		await TournamentLFGTeamFactory.create({
			tournamentId,
			userId: lookingForTeamUserId(),
			isStayAsSub: false,
		});

		const [related] =
			await TournamentRepository.findRelatedUsersByTournamentIds([
				tournamentId,
			]);

		expect(related.teamMembers.map((member) => member.userId)).toEqual([
			registeredUserId(),
		]);
	});
});
