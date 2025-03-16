import { ordinal } from "openskill";
import { sql } from "~/db/sql";
import type { ParsedMemento, Skill } from "~/db/types";
import { identifierToUserIds } from "~/features/mmr/mmr-utils";
import type { MementoSkillDifferences } from "../core/skills.server";

const getStm = (type: "user" | "team") =>
	sql.prepare(/* sql */ `
  insert into "Skill" ("groupMatchId", "identifier", "mu", "season", "sigma", "ordinal", "userId", "matchesCount")
  values (
    @groupMatchId, 
    @identifier, 
    @mu, 
    @season, 
    @sigma, 
    @ordinal,
    @userId,
    1 + coalesce((
      select max("matchesCount") from "Skill" 
      where 
        ${type === "user" ? /* sql */ `"userId" = @userId` : ""}
        ${type === "team" ? /* sql */ `"identifier" = @identifier` : ""}
        and "season" = @season
      group by ${
				type === "user" ? /* sql */ `"userId"` : /* sql */ `"identifier"`
			}
    ), 0)
  ) returning *
`);

const addSkillTeamUserStm = sql.prepare(/* sql */ `
  insert into "SkillTeamUser" (
    "skillId",
    "userId"
  ) values (
    @skillId,
    @userId
  ) on conflict("skillId", "userId") do nothing
`);

const userStm = getStm("user");
const teamStm = getStm("team");

const updateMatchMementoStm = sql.prepare(/* sql */ `
  update "GroupMatch"
  set "memento" = @memento
  where "id" = @id
`);

export function addSkills({
	groupMatchId,
	skills,
	oldMatchMemento,
	differences,
}: {
	groupMatchId: number;
	skills: Pick<
		Skill,
		"groupMatchId" | "identifier" | "mu" | "season" | "sigma" | "userId"
	>[];
	oldMatchMemento: ParsedMemento;
	differences: MementoSkillDifferences;
}) {
	for (const skill of skills) {
		const stm = skill.userId ? userStm : teamStm;
		const insertedSkill = stm.get({
			...skill,
			ordinal: ordinal(skill),
		}) as Skill;

		if (insertedSkill.identifier) {
			for (const userId of identifierToUserIds(insertedSkill.identifier)) {
				addSkillTeamUserStm.run({
					skillId: insertedSkill.id,
					userId,
				});
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
		newMemento.users[key as any] = {
			...value,
			skillDifference: differences.users[key as any]?.skillDifference,
		};
	}

	for (const [key, value] of Object.entries(oldMatchMemento.groups)) {
		newMemento.groups[key as any] = {
			...value,
			skillDifference: differences.groups[key as any]?.skillDifference,
		};
	}

	updateMatchMementoStm.run({
		id: groupMatchId,
		memento: JSON.stringify(newMemento),
	});
}
