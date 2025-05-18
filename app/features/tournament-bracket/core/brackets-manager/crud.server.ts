// @ts-nocheck TODO

import { Group, Match, Round, Stage } from "./crud-db.server";

export class SqlDatabase {
	insert(table, arg) {
		switch (table) {
			case "participant":
				throw new Error("not implemented");
			// return Team.insertMissing(arg);

			case "stage": {
				const stage = new Stage(
					undefined,
					arg.tournament_id,
					arg.number,
					arg.name,
					arg.type,
					JSON.stringify(arg.settings),
				);
				return stage.insert() && stage.id;
			}

			case "group": {
				const group = new Group(undefined, arg.stage_id, arg.number);
				return group.insert() && group.id;
			}

			case "round": {
				const round = new Round(
					undefined,
					arg.stage_id,
					arg.group_id,
					arg.number,
				);
				return round.insert() && round.id;
			}

			case "match": {
				const match = new Match(
					undefined,
					arg.status,
					arg.stage_id,
					arg.group_id,
					arg.round_id,
					arg.number,
					null,
					null,
					null,
					JSON.stringify(arg.opponent1),
					JSON.stringify(arg.opponent2),
				);
				return match.insert() && match.id;
			}
		}
	}

	select(table, arg) {
		switch (table) {
			case "participant":
				if (typeof arg === "number") {
					throw new Error("not implemented");
					// const team = Team.getById(arg);
					// return team && convertTeam(team);
				}

				if (arg.tournament_id) {
					return Team.getByTournamentId(arg.tournament_id);
				}

				break;

			case "stage":
				if (typeof arg === "number") {
					return Stage.getById(arg);
				}

				if (arg.tournament_id && arg.number) {
					throw new Error("not implemented");
					// const stage = Stage.getByTournamentAndNumber(
					// 	arg.tournament_id,
					// 	arg.number,
					// );
					// return stage && [convertStage(stage)];
				}

				if (arg.tournament_id) {
					return Stage.getByTournamentId(arg.tournament_id);
				}

				break;

			case "group":
				if (!arg) {
					throw new Error("not implemented");
					// const groups = Group.getAll();
					// return groups?.map(convertGroup);
				}

				if (typeof arg === "number") {
					return Group.getById(arg);
				}

				if (arg.stage_id && arg.number) {
					const group = Group.getByStageAndNumber(arg.stage_id, arg.number);
					return group && [group];
				}

				if (arg.stage_id) {
					return Group.getByStageId(arg.stage_id);
				}

				break;

			case "round":
				if (!arg) {
					throw new Error("not implemented");
					// const rounds = Round.getAll();
					// return rounds?.map(convertRound);
				}

				if (typeof arg === "number") {
					return Round.getById(arg);
				}

				if (arg.group_id && arg.number) {
					const round = Round.getByGroupAndNumber(arg.group_id, arg.number);
					return round && [round];
				}

				if (arg.group_id) {
					return Round.getByGroupId(arg.group_id);
				}

				if (arg.stage_id) {
					return Round.getByStageId(arg.stage_id);
				}

				break;

			case "match":
				if (!arg) {
					throw new Error("not implemented");
					// const matches = Match.getAll();
					// return matches?.map(convertMatch);
				}

				if (typeof arg === "number") {
					return Match.getById(arg);
				}

				if (arg.round_id && arg.number) {
					const match = Match.getByRoundAndNumber(arg.round_id, arg.number);
					return match && [match];
				}

				if (arg.stage_id) {
					return Match.getByStageId(arg.stage_id);
				}

				if (arg.group_id) {
					throw new Error("not implemented");
					// const matches = Match.getByGroupId(arg.group_id);
					// return matches?.map(convertMatch);
				}

				if (arg.round_id) {
					return Match.getByRoundId(arg.round_id);
				}

				break;
			// throw new Error("not implemented");
			// if (typeof arg === "number") {
			// 	const game = MatchGame.getById(arg);
			// 	return game && convertMatchGame(game);
			// }

			// if (arg.parent_id && arg.number) {
			// 	const game = MatchGame.getByParentAndNumber(
			// 		arg.parent_id,
			// 		arg.number,
			// 	);
			// 	return game && [convertMatchGame(game)];
			// }

			// if (arg.parent_id) {
			// 	const games = MatchGame.getByParentId(arg.parent_id);
			// 	return games?.map(convertMatchGame);
			// }

			// break;
		}

		return null;
	}

	update(table, query, update) {
		switch (table) {
			case "stage":
				if (typeof query === "number") {
					return Stage.updateSettings(query, JSON.stringify(update.settings));
				}

				break;

			case "match":
				if (typeof query === "number") {
					const match = new Match(
						query,
						update.status,
						update.stage_id,
						update.group_id,
						update.round_id,
						update.number,
						null,
						null,
						null,
						JSON.stringify(update.opponent1),
						JSON.stringify(update.opponent2),
					);

					return match.update();
				}

				break;
			// throw new Error("not implemented");
			// if (typeof query === "number") {
			// 	const game = new MatchGame(
			// 		query,
			// 		update.stage_id,
			// 		update.parent_id,
			// 		update.status,
			// 		update.number,
			// 		null,
			// 		null,
			// 		null,
			// 		JSON.stringify(update.opponent1),
			// 		JSON.stringify(update.opponent2),
			// 	);

			// 	return game.update();
			// }

			// if (query.parent_id) {
			// 	const game = new MatchGame(
			// 		undefined,
			// 		update.stage_id,
			// 		query.parent_id,
			// 		update.status,
			// 		update.number,
			// 		null,
			// 		null,
			// 		null,
			// 		JSON.stringify(update.opponent1),
			// 		JSON.stringify(update.opponent2),
			// 	);

			// 	return game.updateByParentId();
			// }

			// break;
		}

		return false;
	}

	delete(table, filter) {
		throw new Error("not implemented");
		// switch (table) {
		// 	case "stage":
		// 		return Number.isInteger(filter.id) && Stage.deleteById(filter.id);

		// 	case "group":
		// 		return (
		// 			Number.isInteger(filter.stage_id) &&
		// 			Group.deleteByStageId(filter.stage_id)
		// 		);

		// 	case "round":
		// 		return (
		// 			Number.isInteger(filter.stage_id) &&
		// 			Round.deleteByStageId(filter.stage_id)
		// 		);

		// 	case "match":
		// 		return (
		// 			Number.isInteger(filter.stage_id) &&
		// 			Match.deleteByStageId(filter.stage_id)
		// 		);
		// 		if (Number.isInteger(filter.stage_id))
		// 			return MatchGame.deleteByStageId(filter.stage_id);
		// 		if (
		// 			Number.isInteger(filter.parent_id) &&
		// 			Number.isInteger(filter.number)
		// 		)
		// 			return MatchGame.deleteByParentAndNumber(
		// 				filter.parent_id,
		// 				filter.number,
		// 			);
		// 		return false;

		// 	default:
		// 		return false;
		// }
	}
}
