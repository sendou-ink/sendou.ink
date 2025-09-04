import { ordinal } from "openskill";
import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { identifierToUserIds } from "~/features/mmr/mmr-utils";
import type { TournamentBadgeReceivers } from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import { databaseTimestampNow } from "~/utils/dates";
import type { TournamentSummary } from "../core/summarizer.server";

const addSkillStm = sql.prepare(/* sql */ `
  insert into "Skill" (
    "tournamentId",
    "mu",
    "sigma",
    "ordinal",
    "userId",
    "identifier",
    "matchesCount",
    "season",
    "createdAt"
  )
  values (
    @tournamentId,
    @mu,
    @sigma,
    @ordinal,
    @userId,
    @identifier,
    @matchesCount + coalesce((select max("matchesCount") from "Skill" where "userId" = @userId or "identifier" = @identifier group by "userId", "identifier"), 0),
    @season,
    @createdAt
  ) returning *
`);

// on conflict it replaces (set in migration)
const addSeedingSkillStm = sql.prepare(/* sql */ `
  insert into "SeedingSkill" (
    "type",
    "mu",
    "sigma",
    "ordinal",
    "userId"
  ) values (
    @type,
    @mu,
    @sigma,
    @ordinal,
    @userId
  )
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

const addMapResultDeltaStm = sql.prepare(/* sql */ `
  insert into "MapResult" (
    "mode",
    "stageId",
    "userId",
    "wins",
    "losses",
    "season"
  ) values (
    @mode,
    @stageId,
    @userId,
    @wins,
    @losses,
    @season
  ) on conflict ("userId", "stageId", "mode", "season") do
  update
  set
    "wins" = "wins" + @wins,
    "losses" = "losses" + @losses
`);

const addPlayerResultDeltaStm = sql.prepare(/* sql */ `
  insert into "PlayerResult" (
    "ownerUserId",
    "otherUserId",
    "mapWins",
    "mapLosses",
    "setWins",
    "setLosses",
    "type",
    "season"
  ) values (
    @ownerUserId,
    @otherUserId,
    @mapWins,
    @mapLosses,
    @setWins,
    @setLosses,
    @type,
    @season
  ) on conflict ("ownerUserId", "otherUserId", "type", "season") do
  update
  set
    "mapWins" = "mapWins" + @mapWins,
    "mapLosses" = "mapLosses" + @mapLosses,
    "setWins" = "setWins" + @setWins,
    "setLosses" = "setLosses" + @setLosses
`);

const addTournamentResultStm = sql.prepare(/* sql */ `
  insert into "TournamentResult" (
    "tournamentId",
    "userId",
    "placement",
    "participantCount",
    "tournamentTeamId",
    "setResults",
    "spDiff"
  ) values (
    @tournamentId,
    @userId,
    @placement,
    @participantCount,
    @tournamentTeamId,
    @setResults,
    @spDiff
  )
`);

const addTournamentBadgeOwnersStm = sql.prepare(/* sql */ `
  insert into "TournamentBadgeOwner" (
    "tournamentId",
    "badgeId",
    "userId"
  ) values (
    @tournamentId,
    @badgeId,
    @userId
  )
`);

const finalizeTournamentStm = sql.prepare(/* sql */ `
  update "Tournament" set
    "isFinalized" = 1
  where "id" = @tournamentId
`);

export const addSummary = sql.transaction(
	({
		tournamentId,
		summary,
		season,
		badgeReceivers = [],
	}: {
		tournamentId: number;
		summary: TournamentSummary;
		season?: number;
		badgeReceivers?: TournamentBadgeReceivers;
	}) => {
		for (const skill of summary.skills) {
			const insertedSkill = addSkillStm.get({
				tournamentId,
				mu: skill.mu,
				sigma: skill.sigma,
				ordinal: ordinal(skill),
				userId: skill.userId ?? null,
				identifier: skill.identifier ?? null,
				matchesCount: skill.matchesCount,
				season: season ?? null,
				createdAt: databaseTimestampNow(),
			}) as Tables["Skill"];

			if (insertedSkill.identifier) {
				for (const userId of identifierToUserIds(insertedSkill.identifier)) {
					addSkillTeamUserStm.run({
						skillId: insertedSkill.id,
						userId,
					});
				}
			}
		}

		for (const seedingSkill of summary.seedingSkills) {
			addSeedingSkillStm.run({
				type: seedingSkill.type,
				mu: seedingSkill.mu,
				sigma: seedingSkill.sigma,
				ordinal: seedingSkill.ordinal,
				userId: seedingSkill.userId,
			});
		}

		for (const mapResultDelta of summary.mapResultDeltas) {
			addMapResultDeltaStm.run({
				mode: mapResultDelta.mode,
				stageId: mapResultDelta.stageId,
				userId: mapResultDelta.userId,
				wins: mapResultDelta.wins,
				losses: mapResultDelta.losses,
				season: season ?? null,
			});
		}

		for (const playerResultDelta of summary.playerResultDeltas) {
			addPlayerResultDeltaStm.run({
				ownerUserId: playerResultDelta.ownerUserId,
				otherUserId: playerResultDelta.otherUserId,
				mapWins: playerResultDelta.mapWins,
				mapLosses: playerResultDelta.mapLosses,
				setWins: playerResultDelta.setWins,
				setLosses: playerResultDelta.setLosses,
				type: playerResultDelta.type,
				season: season ?? null,
			});
		}

		for (const badgeReceiver of badgeReceivers) {
			for (const userId of badgeReceiver.userIds) {
				addTournamentBadgeOwnersStm.run({
					tournamentId,
					badgeId: badgeReceiver.badgeId,
					userId,
				});
			}
		}

		for (const tournamentResult of summary.tournamentResults) {
			const setResults = summary.setResults.get(tournamentResult.userId);

			if (setResults?.every((result) => !result)) {
				continue;
			}

			addTournamentResultStm.run({
				tournamentId,
				userId: tournamentResult.userId,
				placement: tournamentResult.placement,
				participantCount: tournamentResult.participantCount,
				tournamentTeamId: tournamentResult.tournamentTeamId,
				setResults: setResults ? JSON.stringify(setResults) : null,
				spDiff: summary.spDiffs?.get(tournamentResult.userId) ?? null,
			});
		}

		finalizeTournamentStm.run({ tournamentId });
	},
);

export const finalizeTournament = (tournamentId: number) =>
	finalizeTournamentStm.run({ tournamentId });
