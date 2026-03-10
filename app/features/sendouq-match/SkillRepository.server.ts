import type { Transaction } from "kysely";
import { ordinal } from "openskill";
import { db } from "~/db/sql";
import type { DB, ParsedMemento, Tables } from "~/db/tables";
import { identifierToUserIds } from "~/features/mmr/mmr-utils";
import { databaseTimestampNow } from "~/utils/dates";
import type { MementoSkillDifferences } from "./core/skills.server";

export async function createMatchSkills(
	{
		groupMatchId,
		skills,
		oldMatchMemento,
		differences,
	}: {
		groupMatchId: number;
		skills: Pick<
			Tables["Skill"],
			"groupMatchId" | "identifier" | "mu" | "season" | "sigma" | "userId"
		>[];
		oldMatchMemento: ParsedMemento | null;
		differences: MementoSkillDifferences;
	},
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;
	const createdAt = databaseTimestampNow();

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
				await executor
					.insertInto("SkillTeamUser")
					.values({
						skillId: insertedSkill.id,
						userId,
					})
					.onConflict((oc) => oc.columns(["skillId", "userId"]).doNothing())
					.execute();
			}
		}
	}

	if (!oldMatchMemento) return;

	const newMemento: ParsedMemento = {
		...oldMatchMemento,
		groups: {},
		users: {},
	};

	for (const [key, value] of Object.entries(oldMatchMemento.users)) {
		newMemento.users[key as unknown as number] = {
			...value,
			skillDifference:
				differences.users[key as unknown as number]?.skillDifference,
		};
	}

	for (const [key, value] of Object.entries(oldMatchMemento.groups)) {
		newMemento.groups[key as unknown as number] = {
			...value,
			skillDifference:
				differences.groups[key as unknown as number]?.skillDifference,
		};
	}

	await executor
		.updateTable("GroupMatch")
		.set({ memento: JSON.stringify(newMemento) })
		.where("id", "=", groupMatchId)
		.execute();
}

async function insertSkillWithOrdinal(
	skill: {
		groupMatchId: number | null;
		identifier: string | null;
		mu: number;
		season: number;
		sigma: number;
		userId: number | null;
		createdAt: number;
		ordinal: number;
	},
	executor: Transaction<DB> | typeof db,
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
