import { faker } from "../core/faker";
import * as showcaseNames from "../core/showcaseNames";
import * as TeamFactory from "../factories/TeamFactory";
import type { SeededUsers } from "./users";

const TEAM_COUNT = 40;
const SECONDARY_TEAM_COUNT = 10;

export type SeededTeams = {
	allianceRogueId: number;
	/** Alliance Rogue's roster by the part each member plays. The admin and N-ZAP are both on it, so that logging in as either shows a team with a full roster. */
	allianceRogue: {
		playerUserIds: number[];
		subUserId: number;
		coachUserId: number;
	};
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

	const allianceRoguePlayers = [users.nzapId, ...takeMembers(4), users.adminId];
	const [allianceRogueSubId, allianceRogueCoachId] = takeMembers(2);
	const allianceRogue = await TeamFactory.create(
		{
			name: "Alliance Rogue",
			memberUserIds: [
				...allianceRoguePlayers,
				allianceRogueSubId,
				allianceRogueCoachId,
			],
		},
		{
			avatarUrl: "alliance-rogue.png",
			roles: {
				[users.nzapId]: "CAPTAIN",
				[users.adminId]: "FLEX",
				[allianceRogueSubId]: "SUB",
				[allianceRogueCoachId]: "COACH",
			},
		},
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

	// showcase users double as secondary team members; disjoint chunks keep everyone within the two-team limit
	for (let i = 0; i < SECONDARY_TEAM_COUNT; i++) {
		const memberUserIds = users.showcaseIds.slice(i * 4, i * 4 + 4);

		const team = await TeamFactory.create({
			name: showcaseNames.teamName(),
			isMainTeam: false,
			memberUserIds,
		});

		ids.push(team.id);
	}

	return {
		allianceRogueId: allianceRogue.id,
		allianceRogue: {
			playerUserIds: allianceRoguePlayers,
			subUserId: allianceRogueSubId,
			coachUserId: allianceRogueCoachId,
		},
		ids,
		squads,
	};
}
