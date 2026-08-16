import { faker } from "../core/faker";
import * as showcaseNames from "../core/showcaseNames";
import * as TeamFactory from "../factories/TeamFactory";
import type { SeededUsers } from "./users";

const TEAM_COUNT = 40;
const SECONDARY_TEAM_COUNT = 10;

export type SeededTeams = {
	allianceRogueId: number;
	ids: number[];
	/** Four members of a shared team, e.g. a lineup for the SQ team leaderboard. */
	squads: Array<{ teamId: number; name: string; memberUserIds: number[] }>;
};

export async function seedTeams(users: SeededUsers): Promise<SeededTeams> {
	const memberPool = [...users.showcaseIds, ...users.crowdIds];
	let nextMember = 0;
	const takeMembers = (count: number) => {
		const members = memberPool.slice(nextMember, nextMember + count);
		nextMember += count;

		return members;
	};

	const allianceRogue = await TeamFactory.create(
		{
			name: "Alliance Rogue",
			memberUserIds: [users.nzapId, ...takeMembers(4)],
		},
		{ avatarUrl: "alliance-rogue.png" },
	);

	const ids: number[] = [allianceRogue.id];
	const squads: SeededTeams["squads"] = [
		{
			teamId: allianceRogue.id,
			name: allianceRogue.name,
			memberUserIds: allianceRogue.memberUserIds.slice(0, 4),
		},
	];
	for (let i = 1; i < TEAM_COUNT; i++) {
		const memberCount = faker.helpers.arrayElement([
			1, 2, 3, 4, 4, 4, 4, 5, 5, 5, 6, 7, 8,
		]);
		const memberUserIds = takeMembers(memberCount);

		const team = await TeamFactory.create(
			{
				name: i === 1 ? "Team Olive" : showcaseNames.teamName(),
				memberUserIds,
			},
			i === 1 || faker.number.float(1) < 0.3 ? { hasAvatar: true } : undefined,
		);

		ids.push(team.id);
		if (memberCount >= 4) {
			squads.push({
				teamId: team.id,
				name: team.name,
				memberUserIds: memberUserIds.slice(0, 4),
			});
		}
	}

	// showcase users double as members of a secondary team; disjoint chunks so
	// nobody exceeds the two-team limit
	for (let i = 0; i < SECONDARY_TEAM_COUNT; i++) {
		const memberUserIds = users.showcaseIds.slice(i * 4, i * 4 + 4);

		const team = await TeamFactory.create({
			name: showcaseNames.teamName(),
			isMainTeam: false,
			memberUserIds,
		});

		ids.push(team.id);
	}

	return { allianceRogueId: allianceRogue.id, ids, squads };
}
