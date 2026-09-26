import { userSkills } from "~/features/mmr/tiered.server";

/** The user's tier, SP and leaderboard placement of a season. */
export async function seasonStanding({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	const { isAccurateTiers, userSkills: skills } = await userSkills(season);
	const { tier, ordinal, approximate } = skills[userId] ?? {
		approximate: false,
		ordinal: 0,
		tier: { isPlus: false, name: "IRON" as const },
	};
	const hasRank = Boolean(skills[userId]) && !approximate;

	return {
		tier,
		currentOrdinal: hasRank ? ordinal : undefined,
		isAccurateTiers,
		leaderboardPlacement: hasRank
			? leaderboardPlacement(skills, ordinal)
			: null,
	};
}

function leaderboardPlacement(
	skills: Awaited<ReturnType<typeof userSkills>>["userSkills"],
	ordinal: number,
) {
	return (
		Object.values(skills).filter(
			(skill) => !skill.approximate && skill.ordinal > ordinal,
		).length + 1
	);
}
