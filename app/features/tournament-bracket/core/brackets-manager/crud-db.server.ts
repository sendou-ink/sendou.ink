// this file offers database functions specifically for the crud.server.ts file

import { sql } from "~/db/sql";
import type { Tables, TournamentRoundMaps } from "~/db/tables";
import type {
	Group as GroupType,
	Match as MatchType,
	Round as RoundType,
	Stage as StageType,
} from "~/modules/brackets-model";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";

const stage_getByIdStm = sql.prepare(/*sql*/ `
  select
    *
  from
    "TournamentStage"
  where
    "TournamentStage"."id" = @id
`);

const stage_getByTournamentIdStm = sql.prepare(/*sql*/ `
  select
    *
  from
    "TournamentStage"
  where
    "TournamentStage"."tournamentId" = @tournamentId
`);

const stage_insertStm = sql.prepare(/*sql*/ `
  insert into
    "TournamentStage"
    ("tournamentId", "number", "name", "type", "settings", "createdAt")
  values
    (@tournamentId, @number, @name, @type, @settings, @createdAt)
  returning *
`);

const stage_updateSettingsStm = sql.prepare(/*sql*/ `
  update
    "TournamentStage"
  set
    "settings" = @settings
  where
    "TournamentStage"."id" = @id
`);

export class Stage {
	id?: Tables["TournamentStage"]["id"];
	tournamentId: Tables["TournamentStage"]["tournamentId"];
	number: Tables["TournamentStage"]["number"];
	name: Tables["TournamentStage"]["name"];
	type: StageType["type"];
	settings: Tables["TournamentStage"]["settings"];

	constructor(
		id: Tables["TournamentStage"]["id"] | undefined,
		tournamentId: Tables["TournamentStage"]["tournamentId"],
		number: Tables["TournamentStage"]["number"],
		name: Tables["TournamentStage"]["name"],
		type: StageType["type"],
		settings: Tables["TournamentStage"]["settings"],
	) {
		this.id = id;
		this.tournamentId = tournamentId;
		this.number = number;
		this.name = name;
		this.type = type;
		this.settings = settings;
	}

	insert() {
		const stage = stage_insertStm.get({
			tournamentId: this.tournamentId,
			number: this.number,
			name: this.name,
			type: this.type,
			settings: this.settings,
			createdAt: dateToDatabaseTimestamp(new Date()),
		}) as any;

		this.id = stage.id;

		return true;
	}

	static #convertStage(rawStage: Tables["TournamentStage"]): StageType {
		return {
			id: rawStage.id,
			name: rawStage.name,
			number: rawStage.number,
			settings: JSON.parse(rawStage.settings),
			tournament_id: rawStage.tournamentId,
			type: rawStage.type,
			createdAt: rawStage.createdAt,
		};
	}

	static getById(id: Tables["TournamentStage"]["id"]): StageType {
		const stage = stage_getByIdStm.get({ id }) as any;
		if (!stage) return stage;
		return Stage.#convertStage(stage);
	}

	static getByTournamentId(tournamentId: number): StageType[] {
		return (stage_getByTournamentIdStm.all({ tournamentId }) as any[]).map(
			Stage.#convertStage,
		);
	}

	static updateSettings(
		id: Tables["TournamentStage"]["id"],
		settings: Tables["TournamentStage"]["settings"],
	) {
		stage_updateSettingsStm.run({ id, settings });

		return true;
	}
}

const group_getByIdStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentGroup"
    where "TournamentGroup"."id" = @id
`);

const group_getByStageIdStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentGroup"
    where "TournamentGroup"."stageId" = @stageId
`);

const group_getByStageAndNumberStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentGroup"
    where "TournamentGroup"."stageId" = @stageId
      and "TournamentGroup"."number" = @number
`);

const group_insertStm = sql.prepare(/*sql*/ `
  insert into
    "TournamentGroup"
    ("stageId", "number")
  values
    (@stageId, @number)
  returning *
`);

export class Group {
	id?: Tables["TournamentGroup"]["id"];
	stageId: Tables["TournamentGroup"]["stageId"];
	number: Tables["TournamentGroup"]["number"];

	constructor(
		id: Tables["TournamentGroup"]["id"] | undefined,
		stageId: Tables["TournamentGroup"]["stageId"],
		number: Tables["TournamentGroup"]["number"],
	) {
		this.id = id;
		this.stageId = stageId;
		this.number = number;
	}

	static #convertGroup(rawGroup: Tables["TournamentGroup"]): GroupType {
		return {
			id: rawGroup.id,
			number: rawGroup.number,
			stage_id: rawGroup.stageId,
		};
	}

	static getById(id: Tables["TournamentGroup"]["id"]): GroupType {
		const group = group_getByIdStm.get({ id }) as any;
		if (!group) return group;
		return Group.#convertGroup(group);
	}

	static getByStageId(stageId: Tables["TournamentStage"]["id"]): GroupType[] {
		return (group_getByStageIdStm.all({ stageId }) as any[]).map(
			Group.#convertGroup,
		);
	}

	static getByStageAndNumber(
		stageId: Tables["TournamentStage"]["id"],
		number: Tables["TournamentGroup"]["number"],
	): GroupType {
		const group = group_getByStageAndNumberStm.get({ stageId, number }) as any;
		if (!group) return group;
		return Group.#convertGroup(group_getByStageAndNumberStm.get(group) as any);
	}

	insert() {
		const group = group_insertStm.get({
			stageId: this.stageId,
			number: this.number,
		}) as any;

		this.id = group.id;

		return true;
	}
}

const round_getByIdStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentRound"
    where "TournamentRound"."id" = @id
`);

const round_getByGroupIdStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentRound"
    where "TournamentRound"."groupId" = @groupId
`);

const round_getByStageIdStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentRound"
    where "TournamentRound"."stageId" = @stageId
`);

const round_getByGroupAndNumberStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentRound"
    where "TournamentRound"."groupId" = @groupId
      and "TournamentRound"."number" = @number
`);

const round_insertStm = sql.prepare(/*sql*/ `
  insert into
    "TournamentRound"
    ("stageId", "groupId", "number")
  values
    (@stageId, @groupId, @number)
  returning *
`);

export class Round {
	id?: Tables["TournamentRound"]["id"];
	stageId: Tables["TournamentRound"]["stageId"];
	groupId: Tables["TournamentRound"]["groupId"];
	number: Tables["TournamentRound"]["number"];
	maps: Pick<TournamentRoundMaps, "count" | "type">;

	constructor(
		id: Tables["TournamentRound"]["id"] | undefined,
		stageId: Tables["TournamentRound"]["stageId"],
		groupId: Tables["TournamentRound"]["groupId"],
		number: Tables["TournamentRound"]["number"],
		maps: Pick<TournamentRoundMaps, "count" | "type">,
	) {
		this.id = id;
		this.stageId = stageId;
		this.groupId = groupId;
		this.number = number;
		this.maps = maps;
	}

	insert() {
		const round = round_insertStm.get({
			stageId: this.stageId,
			groupId: this.groupId,
			number: this.number,
		}) as any;

		this.id = round.id;

		return true;
	}

	static #convertRound(
		rawRound: Tables["TournamentRound"] & { maps?: string | null },
	): RoundType {
		const parsedMaps = rawRound.maps ? JSON.parse(rawRound.maps) : null;

		return {
			id: rawRound.id,
			group_id: rawRound.groupId,
			number: rawRound.number,
			stage_id: rawRound.stageId,
			maps: parsedMaps
				? {
						count: parsedMaps.count,
						type: parsedMaps.type,
						pickBan: parsedMaps.pickBan,
					}
				: null,
		};
	}

	static getByStageId(stageId: Tables["TournamentStage"]["id"]): RoundType[] {
		return (round_getByStageIdStm.all({ stageId }) as any[]).map(
			Round.#convertRound,
		);
	}

	static getByGroupId(groupId: Tables["TournamentGroup"]["id"]): RoundType[] {
		return (round_getByGroupIdStm.all({ groupId }) as any[]).map(
			Round.#convertRound,
		);
	}

	static getByGroupAndNumber(
		groupId: Tables["TournamentGroup"]["id"],
		number: Tables["TournamentRound"]["number"],
	): RoundType {
		const round = round_getByGroupAndNumberStm.get({ groupId, number }) as any;
		if (!round) return round;
		return Round.#convertRound(round);
	}

	static getById(id: Tables["TournamentRound"]["id"]): RoundType {
		const round = round_getByIdStm.get({ id }) as any;
		if (!round) return round;
		return Round.#convertRound(round);
	}
}

const match_getByIdStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentMatch"
    where "TournamentMatch"."id" = @id
`);

const match_getByRoundIdStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentMatch"
    where "TournamentMatch"."roundId" = @roundId
`);

const match_getByStageIdStm = sql.prepare(/*sql*/ `
  select 
    "TournamentMatch".*, 
    sum("TournamentMatchGameResult"."opponentOnePoints") as "opponentOnePointsTotal",
    sum("TournamentMatchGameResult"."opponentTwoPoints") as "opponentTwoPointsTotal",
    max("TournamentMatchGameResult"."createdAt") as "lastGameFinishedAt"
  from "TournamentMatch"
  left join "TournamentMatchGameResult" on "TournamentMatch"."id" = "TournamentMatchGameResult"."matchId"
  where "TournamentMatch"."stageId" = @stageId
  group by "TournamentMatch"."id"
`);

const match_getByRoundAndNumberStm = sql.prepare(/*sql*/ `
  select *
    from "TournamentMatch"
    where "TournamentMatch"."roundId" = @roundId
      and "TournamentMatch"."number" = @number
`);

const match_insertStm = sql.prepare(/*sql*/ `
  insert into
    "TournamentMatch"
    ("roundId", "stageId", "groupId", "number", "opponentOne", "opponentTwo", "status", "chatCode")
  values
    (@roundId, @stageId, @groupId, @number, @opponentOne, @opponentTwo, @status, @chatCode)
  returning *
`);

const match_updateStm = sql.prepare(/*sql*/ `
  update "TournamentMatch"
    set
      "roundId" = @roundId,
      "stageId" = @stageId,
      "groupId" = @groupId,
      "number" = @number,
      "opponentOne" = @opponentOne,
      "opponentTwo" = @opponentTwo,
      "status" = @status
    where
      "TournamentMatch"."id" = @id
`);

export class Match {
	id?: Tables["TournamentMatch"]["id"];
	roundId: Tables["TournamentMatch"]["roundId"];
	stageId: Tables["TournamentMatch"]["stageId"];
	groupId: Tables["TournamentMatch"]["groupId"];
	number: Tables["TournamentMatch"]["number"];
	opponentOne: string;
	opponentTwo: string;
	status: Tables["TournamentMatch"]["status"];

	constructor(
		id: Tables["TournamentMatch"]["id"] | undefined,
		status: Tables["TournamentMatch"]["status"],
		stageId: Tables["TournamentMatch"]["stageId"],
		groupId: Tables["TournamentMatch"]["groupId"],
		roundId: Tables["TournamentMatch"]["roundId"],
		number: Tables["TournamentMatch"]["number"],
		_unknown1: null,
		_unknown2: null,
		_unknown3: null,
		opponentOne: string,
		opponentTwo: string,
	) {
		this.id = id;
		this.roundId = roundId;
		this.stageId = stageId;
		this.groupId = groupId;
		this.number = number;
		this.opponentOne = opponentOne;
		this.opponentTwo = opponentTwo;
		this.status = status;
	}

	static #convertMatch(
		rawMatch: Tables["TournamentMatch"] & {
			opponentOne: string;
			opponentTwo: string;
			opponentOnePointsTotal: number | null;
			opponentTwoPointsTotal: number | null;
			lastGameFinishedAt: number | null;
			createdAt: number | null;
		},
	): MatchType {
		return {
			id: rawMatch.id,
			group_id: rawMatch.groupId,
			number: rawMatch.number,
			opponent1:
				rawMatch.opponentOne === "null"
					? null
					: {
							...JSON.parse(rawMatch.opponentOne),
							totalPoints: rawMatch.opponentOnePointsTotal ?? undefined,
						},
			opponent2:
				rawMatch.opponentTwo === "null"
					? null
					: {
							...JSON.parse(rawMatch.opponentTwo),
							totalPoints: rawMatch.opponentTwoPointsTotal ?? undefined,
						},
			round_id: rawMatch.roundId,
			stage_id: rawMatch.stageId,
			status: rawMatch.status,
			lastGameFinishedAt: rawMatch.lastGameFinishedAt,
			createdAt: rawMatch.createdAt,
		};
	}

	static getById(id: Tables["TournamentMatch"]["id"]): MatchType {
		const match = match_getByIdStm.get({ id }) as any;
		if (!match) return match;
		return Match.#convertMatch(match);
	}

	static getByRoundId(roundId: Tables["TournamentRound"]["id"]): MatchType[] {
		return (match_getByRoundIdStm.all({ roundId }) as any[]).map(
			Match.#convertMatch,
		);
	}

	static getByStageId(stageId: Tables["TournamentStage"]["id"]): MatchType[] {
		return (match_getByStageIdStm.all({ stageId }) as any[]).map(
			Match.#convertMatch,
		);
	}

	static getByRoundAndNumber(
		roundId: Tables["TournamentRound"]["id"],
		number: Tables["TournamentMatch"]["number"],
	): MatchType {
		const match = match_getByRoundAndNumberStm.get({ roundId, number }) as any;
		if (!match) return match;
		return Match.#convertMatch(match);
	}

	insert() {
		const match = match_insertStm.get({
			roundId: this.roundId,
			stageId: this.stageId,
			groupId: this.groupId,
			number: this.number,
			opponentOne: this.opponentOne ?? "null",
			opponentTwo: this.opponentTwo ?? "null",
			status: this.status,
			chatCode: shortNanoid(),
		}) as any;

		this.id = match.id;

		return true;
	}

	update() {
		match_updateStm.run({
			id: this.id ?? null,
			roundId: this.roundId,
			stageId: this.stageId,
			groupId: this.groupId,
			number: this.number,
			opponentOne: this.opponentOne ?? "null",
			opponentTwo: this.opponentTwo ?? "null",
			status: this.status,
		});

		return true;
	}
}
