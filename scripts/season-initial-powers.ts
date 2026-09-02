import { ordinal } from "openskill";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { TIERS, type TierName } from "~/features/mmr/mmr-constants";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import { freshUserSkills } from "~/features/mmr/tiered.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const rawNth = process.argv[2]?.trim();

invariant(rawNth, "nth of new season needed (argument 1)");

const nth = Number(rawNth);
invariant(!Number.isNaN(nth), "nth of new season must be a number");

invariant(
	await SkillRepository.existsBySeason(nth - 1),
	`No skills for season ${nth - 1}`,
);
invariant(
	!(await SkillRepository.existsBySeason(nth)),
	`Skills for season ${nth} already exist`,
);

const idsOfActiveMatches = (
	await db
		.selectFrom("GroupMatch")
		.leftJoin("Skill", "Skill.groupMatchId", "GroupMatch.id")
		.select("GroupMatch.id")
		.where("Skill.id", "is", null)
		.execute()
).map((row) => row.id);

invariant(
	idsOfActiveMatches.length === 0,
	`There are active matches: (ids: ${idsOfActiveMatches.join(", ")})`,
);

// from prod database:
// sqlite> select avg(sigma) from skill where matchesCount > 10 and matchesCount < 20;
// 6.63571559436444
// sqlite> select avg(sigma) from skill where matchesCount > 15 and matchesCount < 25;
// 6.4242759350389
const DEFAULT_NEW_SIGMA = 6.5;

const TIER_TO_NEW_TIER: Record<TierName, TierName> = {
	IRON: "BRONZE",
	BRONZE: "BRONZE",
	SILVER: "SILVER",
	GOLD: "GOLD",
	PLATINUM: "PLATINUM",
	DIAMOND: "DIAMOND",
	LEVIATHAN: "DIAMOND",
};

// - For +1 & +2 members, consider the last 3 seasons
// - For +3 members, consider the last 2 seasons
// - For non-plus members, consider the last season only
const getAllSkills = async () => {
	const skills = (
		await Promise.all([
			freshUserSkills(nth - 1),
			freshUserSkills(nth - 2),
			freshUserSkills(nth - 3),
		])
	).map((seasonSkills) => seasonSkills.userSkills);

	const plusServerMembers = await db
		.selectFrom("PlusTier")
		.select(["PlusTier.userId", "PlusTier.tier as plusTier"])
		.execute();

	const result: (typeof skills)[number] = {};

	for (const member of plusServerMembers) {
		const toConsider =
			member.plusTier === 1 || member.plusTier === 2
				? skills
				: skills.slice(0, 2);

		const bestTier = toConsider.reduce(
			(acc, cur, idx) => {
				const seasonsSkill = cur[member.userId!];
				if (!seasonsSkill || seasonsSkill.approximate) {
					return acc;
				}

				const newIdx = TIERS.findIndex(
					(t) => t.name === seasonsSkill.tier.name,
				);
				const oldIdx = TIERS.findIndex((t) => t.name === acc?.name);

				return oldIdx === -1 || newIdx < oldIdx
					? { name: seasonsSkill.tier.name, idx }
					: acc;
			},
			null as null | { name: TierName; idx: number },
		);

		if (bestTier) {
			result[member.userId] = toConsider[bestTier.idx][member.userId!];
		}
	}

	return Object.entries({ ...skills[0], ...result })
		.map(([userId, skill]) => ({ userId: Number(userId), ...skill }))
		.filter((s) => !s.approximate)
		.sort((a, b) => b.ordinal - a.ordinal);
};
const allSkills = await getAllSkills();

const skillsToConsider = allSkills.filter((s) =>
	Object.values(TIER_TO_NEW_TIER).includes(s.tier.name),
);

const groupedSkills = skillsToConsider.reduce(
	(acc, skill) => {
		const { tier } = skill;
		if (!acc[tier.name]) {
			acc[tier.name] = [];
		}
		acc[tier.name].push(skill);
		return acc;
	},
	{} as Record<TierName, typeof skillsToConsider>,
);

const midPoints = {} as Record<TierName, Tables["Skill"]>;
for (const [tier, skills] of Object.entries(groupedSkills)) {
	const midPoint = skills[Math.floor(skills.length / 2)];
	const midPointSkill = await db
		.selectFrom("Skill")
		.selectAll()
		.where("userId", "=", midPoint.userId)
		.where("ordinal", "=", midPoint.ordinal)
		.executeTakeFirst();
	invariant(midPointSkill, "midPointSkill not found");

	midPoints[tier as TierName] = midPointSkill;
}

const newSkills = allSkills.map((s) => {
	const newTier = TIER_TO_NEW_TIER[s.tier.name];
	const mu = midPoints[newTier].mu;
	const sigma = DEFAULT_NEW_SIGMA;

	return {
		userId: s.userId,
		sigma,
		mu,
		ordinal: ordinal({ sigma, mu }),
		season: nth,
	};
});

await db.transaction().execute(async (trx) => {
	for (const skill of newSkills) {
		await SkillRepository.addInitialSkill(skill, trx);
	}
	await trx.updateTable("Group").set({ status: "INACTIVE" }).execute();
});

logger.info(
	`Done adding new skills for season ${nth} (${newSkills.length} added)`,
);
