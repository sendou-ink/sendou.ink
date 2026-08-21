import type { Transaction } from "kysely";
import { ordinal } from "openskill";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import {
	identifierToUserIds,
	type SkillTeamIdentifier,
} from "~/features/mmr/mmr-utils";
import { databaseTimestampNow } from "~/utils/dates";

type InsertMatchSkills = Pick<
	Tables["Skill"],
	"groupMatchId" | "identifier" | "mu" | "season" | "sigma" | "userId"
>[];

/**
 * Inserts the new skill rows resulting from a match and their team memberships.
 */
export async function insertMatchSkills(
	skills: InsertMatchSkills,
	trx?: Transaction<DB>,
) {
	if (trx) return insertMatchSkillsInTransaction(skills, trx);

	return db
		.transaction()
		.execute((newTrx) => insertMatchSkillsInTransaction(skills, newTrx));
}

async function insertMatchSkillsInTransaction(
	skills: InsertMatchSkills,
	executor: Transaction<DB>,
) {
	const createdAt = databaseTimestampNow();

	const teamUsers: Array<{ skillId: number; userId: number }> = [];
	for (const skill of skills) {
		const insertedSkill = await insertSkillWithOrdinal(
			{
				...skill,
				createdAt,
				ordinal: ordinal(skill),
			},
			executor,
		);

		if (insertedSkill.identifier) {
			for (const userId of identifierToUserIds(insertedSkill.identifier)) {
				teamUsers.push({ skillId: insertedSkill.id, userId });
			}
		}
	}

	await executor
		.insertInto("SkillTeamUser")
		.values(teamUsers)
		.onConflict((oc) => oc.columns(["skillId", "userId"]).doNothing())
		.execute();
}

async function insertSkillWithOrdinal(
	skill: {
		groupMatchId: number | null;
		identifier: SkillTeamIdentifier | null;
		mu: number;
		season: number;
		sigma: number;
		userId: number | null;
		createdAt: number;
		ordinal: number;
	},
	executor: Transaction<DB>,
) {
	const isUserSkill = skill.userId !== null;
	const isTeamSkill = skill.identifier !== null;

	let previousMatchesCount = 0;

	if (isUserSkill) {
		const previousSkill = await executor
			.selectFrom("Skill")
			.select(({ fn }) => fn.max("matchesCount").as("maxMatchesCount"))
			.where("userId", "=", skill.userId)
			.where("season", "=", skill.season)
			.executeTakeFirst();

		previousMatchesCount = previousSkill?.maxMatchesCount ?? 0;
	} else if (isTeamSkill) {
		const previousSkill = await executor
			.selectFrom("Skill")
			.select(({ fn }) => fn.max("matchesCount").as("maxMatchesCount"))
			.where("identifier", "=", skill.identifier)
			.where("season", "=", skill.season)
			.executeTakeFirst();

		previousMatchesCount = previousSkill?.maxMatchesCount ?? 0;
	}

	const insertedSkill = await executor
		.insertInto("Skill")
		.values({
			groupMatchId: skill.groupMatchId,
			identifier: skill.identifier,
			mu: skill.mu,
			season: skill.season,
			sigma: skill.sigma,
			ordinal: skill.ordinal,
			userId: skill.userId,
			createdAt: skill.createdAt,
			matchesCount: previousMatchesCount + 1,
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	return insertedSkill;
}
