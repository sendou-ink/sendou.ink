import { type Kysely, sql } from "kysely";

/** Foreign keys without an index leading with their column, each delete of a parent row scanned the table. */
const FOREIGN_KEYS = [
	// partial: the NULLs of non-lobby rows skew the stats so that the planner skips a full index
	{ table: "ReportedWeapon", column: "lobbySetId", isNullable: true },
	// the primary key leads with "userId"
	{ table: "ChatMessageReadIndicator", column: "roomId", isNullable: false },
	{ table: "GroupMatchCancelReport", column: "groupId", isNullable: false },
	{
		table: "TournamentBracketProgressionOverride",
		column: "tournamentTeamId",
		isNullable: false,
	},
	{
		table: "TournamentAuditLog",
		column: "tournamentTeamHistoryId",
		isNullable: true,
	},
	{
		table: "TournamentTeam",
		column: "tournamentTeamHistoryId",
		isNullable: true,
	},
	{ table: "ScrimMapList", column: "tournamentId", isNullable: true },
	{ table: "ExternalStream", column: "avatarImgId", isNullable: true },
	{ table: "TournamentOrganization", column: "avatarImgId", isNullable: true },
	{ table: "PendingTrophy", column: "organizationId", isNullable: true },
	{ table: "Trophy", column: "organizationId", isNullable: true },
] as const;

/** Full indexes the stats deem useless, as nearly every row is NULL. */
const MADE_PARTIAL = [
	{ table: "IngestedMatch", column: "lobbySetIdHint" },
	{ table: "IngestedMatchLink", column: "lobbyGameId" },
] as const;

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		for (const { table, column } of MADE_PARTIAL) {
			await trx.schema.dropIndex(indexName(table, column)).execute();
		}

		for (const { table, column, isNullable } of [
			...FOREIGN_KEYS,
			...MADE_PARTIAL.map((index) => ({ ...index, isNullable: true })),
		]) {
			const builder = trx.schema
				.createIndex(indexName(table, column))
				.on(table)
				.column(column);

			await (isNullable
				? builder.where(sql.ref(column), "is not", null)
				: builder
			).execute();
		}
	});
}

function indexName(table: string, column: string) {
	return `${snakeCase(table)}_${snakeCase(column)}`;
}

function snakeCase(value: string) {
	return value.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
