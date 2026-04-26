import type {
	CrudInterface,
	DataTypes,
	OmitId,
	Table,
} from "~/modules/brackets-manager/types";
import { Group, Match, Round, Stage } from "./crud-db.server";

export class SqlDatabase implements CrudInterface {
	insert<T extends Table>(table: T, value: OmitId<DataTypes[T]>): number;
	insert<T extends Table>(table: T, values: OmitId<DataTypes[T]>[]): boolean;
	insert<T extends Table>(
		table: T,
		arg: OmitId<DataTypes[T]> | OmitId<DataTypes[T]>[],
	): number | boolean {
		switch (table) {
			case "stage": {
				const value = arg as OmitId<DataTypes["stage"]>;
				const stage = new Stage(
					undefined,
					value.tournament_id,
					value.number,
					value.name,
					value.type,
					JSON.stringify(value.settings),
				);
				stage.insert();
				return stage.id!;
			}

			case "group": {
				const value = arg as OmitId<DataTypes["group"]>;
				const group = new Group(undefined, value.stage_id, value.number);
				group.insert();
				return group.id!;
			}

			case "round": {
				const value = arg as OmitId<DataTypes["round"]>;
				const round = new Round(
					undefined,
					value.stage_id,
					value.group_id,
					value.number,
				);
				round.insert();
				return round.id!;
			}

			case "match": {
				const value = arg as OmitId<DataTypes["match"]>;
				const match = new Match(
					undefined,
					value.status,
					value.stage_id,
					value.group_id,
					value.round_id,
					value.number,
					JSON.stringify(value.opponent1),
					JSON.stringify(value.opponent2),
				);
				match.insert();
				return match.id!;
			}
		}
	}

	select<T extends Table>(table: T): Array<DataTypes[T]> | null;
	select<T extends Table>(table: T, id: number): DataTypes[T] | null;
	select<T extends Table>(
		table: T,
		filter: Partial<DataTypes[T]>,
	): Array<DataTypes[T]> | null;
	select<T extends Table>(
		table: T,
		arg?: number | Partial<DataTypes[T]>,
	): DataTypes[T] | Array<DataTypes[T]> | null {
		switch (table) {
			case "stage": {
				if (typeof arg === "number") {
					return Stage.getById(arg) as DataTypes[T];
				}

				const filter = arg as Partial<DataTypes["stage"]> | undefined;
				if (filter?.tournament_id) {
					return Stage.getByTournamentId(filter.tournament_id) as Array<
						DataTypes[T]
					>;
				}

				break;
			}

			case "group": {
				if (typeof arg === "number") {
					return Group.getById(arg) as DataTypes[T];
				}

				const filter = arg as Partial<DataTypes["group"]> | undefined;
				if (filter?.stage_id && filter.number) {
					const group = Group.getByStageAndNumber(
						filter.stage_id,
						filter.number,
					);
					return group ? ([group] as Array<DataTypes[T]>) : null;
				}

				if (filter?.stage_id) {
					return Group.getByStageId(filter.stage_id) as Array<DataTypes[T]>;
				}

				break;
			}

			case "round": {
				if (typeof arg === "number") {
					return Round.getById(arg) as DataTypes[T];
				}

				const filter = arg as Partial<DataTypes["round"]> | undefined;
				if (filter?.group_id && filter.number) {
					const round = Round.getByGroupAndNumber(
						filter.group_id,
						filter.number,
					);
					return round ? ([round] as Array<DataTypes[T]>) : null;
				}

				if (filter?.group_id) {
					return Round.getByGroupId(filter.group_id) as Array<DataTypes[T]>;
				}

				if (filter?.stage_id) {
					return Round.getByStageId(filter.stage_id) as Array<DataTypes[T]>;
				}

				break;
			}

			case "match": {
				if (typeof arg === "number") {
					return Match.getById(arg) as DataTypes[T];
				}

				const filter = arg as Partial<DataTypes["match"]> | undefined;
				if (filter?.round_id && filter.number) {
					const match = Match.getByRoundAndNumber(
						filter.round_id,
						filter.number,
					);
					return match ? ([match] as Array<DataTypes[T]>) : null;
				}

				if (filter?.stage_id) {
					return Match.getByStageId(filter.stage_id) as Array<DataTypes[T]>;
				}

				if (filter?.round_id) {
					return Match.getByRoundId(filter.round_id) as Array<DataTypes[T]>;
				}

				break;
			}
		}

		return null;
	}

	update<T extends Table>(table: T, id: number, value: DataTypes[T]): boolean;
	update<T extends Table>(
		table: T,
		filter: Partial<DataTypes[T]>,
		value: Partial<DataTypes[T]>,
	): boolean;
	update<T extends Table>(
		table: T,
		query: number | Partial<DataTypes[T]>,
		value: DataTypes[T] | Partial<DataTypes[T]>,
	): boolean {
		switch (table) {
			case "stage": {
				if (typeof query === "number") {
					const update = value as Partial<DataTypes["stage"]>;
					return Stage.updateSettings(query, JSON.stringify(update.settings));
				}

				break;
			}

			case "match": {
				if (typeof query === "number") {
					const update = value as DataTypes["match"];
					const match = new Match(
						query,
						update.status,
						update.stage_id,
						update.group_id,
						update.round_id,
						update.number,
						JSON.stringify(update.opponent1),
						JSON.stringify(update.opponent2),
					);
					return match.update();
				}

				break;
			}
		}

		return false;
	}

	delete<T extends Table>(table: T): boolean;
	delete<T extends Table>(table: T, filter: Partial<DataTypes[T]>): boolean;
	delete(): boolean {
		throw new Error("not implemented");
	}
}
