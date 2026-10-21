import { type Kysely, sql } from "kysely";

/**
 * Lobbies (8s): the lobby itself, its participants, sets, games and ready checks. Also moves
 * scrim post visibility from the `ScrimPost.visibility` JSON column into the shared `ContentVisibility`
 * table, and lets reported weapons and scanner links point to lobby games.
 */
export async function up(db: Kysely<any>): Promise<void> {
	// a no-op inside a transaction, and needed off so the rebuilt tables can be dropped
	await sql`pragma foreign_keys = off`.execute(db);

	try {
		await db.transaction().execute(async (trx) => {
			await createLobbyTables(trx);
			await createContentVisibility(trx);
			await migrateScrimVisibility(trx);
			await rebuildReportedWeapon(trx);
			await rebuildIngestedMatchLink(trx);

			await trx.schema
				.alterTable("IngestedMatch")
				.addColumn("lobbySetIdHint", "integer", (col) =>
					col.references("LobbySet.id").onDelete("set null"),
				)
				.execute();
			await trx.schema
				.createIndex("ingested_match_lobby_set_id_hint")
				.on("IngestedMatch")
				.column("lobbySetIdHint")
				.execute();

			const violations = await sql`pragma foreign_key_check`.execute(trx);
			if (violations.rows.length > 0) {
				throw new Error(
					`foreign key check failed: ${JSON.stringify(violations.rows.slice(0, 5))}`,
				);
			}
		});
	} finally {
		await sql`pragma foreign_keys = on`.execute(db);
	}
}

async function createLobbyTables(trx: Kysely<any>) {
	await trx.schema
		.createTable("Lobby")
		.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
		.addColumn("hostUserId", "integer", (col) =>
			col.notNull().references("User.id").onDelete("cascade"),
		)
		.addColumn("name", "text", (col) => col.notNull())
		.addColumn("label", "text", (col) => col.notNull())
		.addColumn("startsAt", "integer", (col) => col.notNull())
		.addColumn("bestOf", "integer", (col) => col.notNull())
		.addColumn("modes", "text", (col) => col.notNull())
		.addColumn("roomSize", "integer", (col) => col.notNull())
		.addColumn("chatRoomId", "integer", (col) =>
			col.references("ChatRoom.id").onDelete("set null"),
		)
		.addColumn("alphaChatRoomId", "integer", (col) =>
			col.references("ChatRoom.id").onDelete("set null"),
		)
		.addColumn("bravoChatRoomId", "integer", (col) =>
			col.references("ChatRoom.id").onDelete("set null"),
		)
		.addColumn("checkInNotifiedAt", "integer")
		.addColumn("pendingSince", "integer")
		.addColumn("endedAt", "integer")
		.addColumn("createdAt", "integer", (col) =>
			col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
		)
		.modifyEnd(sql`strict`)
		.execute();

	await trx.schema
		.createIndex("lobby_host_user_id")
		.on("Lobby")
		.column("hostUserId")
		.execute();
	// lobbies that ended are only listed by their end, so they stay out of the start index
	await trx.schema
		.createIndex("lobby_unended_starts_at")
		.on("Lobby")
		.column("startsAt")
		.where(sql.ref("endedAt"), "is", null)
		.execute();
	await trx.schema
		.createIndex("lobby_ended_at")
		.on("Lobby")
		.column("endedAt")
		.execute();
	for (const column of ["chatRoomId", "alphaChatRoomId", "bravoChatRoomId"]) {
		await trx.schema
			.createIndex(`lobby_${snakeCase(column)}`)
			.on("Lobby")
			.column(column)
			.unique()
			.where(sql.ref(column), "is not", null)
			.execute();
		await createChatRoomDeleteTrigger(trx, "Lobby", column);
	}

	await trx.schema
		.createTable("LobbyParticipant")
		.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
		.addColumn("lobbyId", "integer", (col) =>
			col.notNull().references("Lobby.id").onDelete("cascade"),
		)
		.addColumn("userId", "integer", (col) =>
			col.notNull().references("User.id").onDelete("cascade"),
		)
		.addColumn("status", "text", (col) => col.notNull())
		.addColumn("isDroppingAfterSet", "integer", (col) =>
			col.notNull().defaultTo(0),
		)
		.addColumn("isSittingOut", "integer", (col) => col.notNull().defaultTo(0))
		.addColumn("joinedAt", "integer", (col) =>
			col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
		)
		.addUniqueConstraint("lobby_participant_lobby_id_user_id", [
			"lobbyId",
			"userId",
		])
		.modifyEnd(sql`strict`)
		.execute();

	await trx.schema
		.createIndex("lobby_participant_user_id")
		.on("LobbyParticipant")
		.column("userId")
		.execute();

	await trx.schema
		.createTable("LobbySet")
		.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
		.addColumn("lobbyId", "integer", (col) =>
			col.notNull().references("Lobby.id").onDelete("cascade"),
		)
		.addColumn("bestOf", "integer", (col) => col.notNull())
		.addColumn("forfeitingSide", "text")
		.addColumn("disputedAt", "integer")
		.addColumn("confirmedAt", "integer")
		.addColumn("confirmedByUserId", "integer", (col) =>
			col.references("User.id").onDelete("set null"),
		)
		.addColumn("createdAt", "integer", (col) =>
			col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
		)
		.modifyEnd(sql`strict`)
		.execute();

	await trx.schema
		.createIndex("lobby_set_lobby_id")
		.on("LobbySet")
		.column("lobbyId")
		.execute();
	await trx.schema
		.createIndex("lobby_set_confirmed_by_user_id")
		.on("LobbySet")
		.column("confirmedByUserId")
		.execute();

	await trx.schema
		.createTable("LobbySetParticipant")
		.addColumn("setId", "integer", (col) =>
			col.notNull().references("LobbySet.id").onDelete("cascade"),
		)
		.addColumn("userId", "integer", (col) =>
			col.notNull().references("User.id").onDelete("cascade"),
		)
		.addColumn("side", "text")
		.addUniqueConstraint("lobby_set_participant_set_id_user_id", [
			"setId",
			"userId",
		])
		.modifyEnd(sql`strict`)
		.execute();

	await trx.schema
		.createIndex("lobby_set_participant_user_id")
		.on("LobbySetParticipant")
		.column("userId")
		.execute();

	await trx.schema
		.createTable("LobbyGame")
		.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
		.addColumn("setId", "integer", (col) =>
			col.notNull().references("LobbySet.id").onDelete("cascade"),
		)
		.addColumn("index", "integer", (col) => col.notNull())
		.addColumn("mode", "text", (col) => col.notNull())
		.addColumn("stageId", "integer", (col) => col.notNull())
		.addColumn("winnerSide", "text")
		.addColumn("reportedAt", "integer")
		.addColumn("reportedByUserId", "integer", (col) =>
			col.references("User.id").onDelete("set null"),
		)
		.addUniqueConstraint("lobby_game_set_id_index", ["setId", "index"])
		.modifyEnd(sql`strict`)
		.execute();

	await trx.schema
		.createIndex("lobby_game_reported_by_user_id")
		.on("LobbyGame")
		.column("reportedByUserId")
		.execute();

	await trx.schema
		.createTable("LobbyReadyCheck")
		.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
		.addColumn("lobbyId", "integer", (col) =>
			col.notNull().references("Lobby.id").onDelete("cascade"),
		)
		.addColumn("expiresAt", "integer", (col) => col.notNull())
		.addColumn("createdAt", "integer", (col) =>
			col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
		)
		.modifyEnd(sql`strict`)
		.execute();

	await trx.schema
		.createIndex("lobby_ready_check_lobby_id")
		.on("LobbyReadyCheck")
		.column("lobbyId")
		.execute();

	await trx.schema
		.createTable("LobbyReadyCheckUser")
		.addColumn("readyCheckId", "integer", (col) =>
			col.notNull().references("LobbyReadyCheck.id").onDelete("cascade"),
		)
		.addColumn("userId", "integer", (col) =>
			col.notNull().references("User.id").onDelete("cascade"),
		)
		.addColumn("confirmedAt", "integer")
		.addUniqueConstraint("lobby_ready_check_user_ready_check_id_user_id", [
			"readyCheckId",
			"userId",
		])
		.modifyEnd(sql`strict`)
		.execute();

	await trx.schema
		.createIndex("lobby_ready_check_user_user_id")
		.on("LobbyReadyCheckUser")
		.column("userId")
		.execute();
}

async function createContentVisibility(trx: Kysely<any>) {
	await trx.schema
		.createTable("ContentVisibility")
		.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
		.addColumn("scrimPostId", "integer", (col) =>
			col.references("ScrimPost.id").onDelete("cascade"),
		)
		.addColumn("lobbyId", "integer", (col) =>
			col.references("Lobby.id").onDelete("cascade"),
		)
		.addColumn("visibleFrom", "integer", (col) => col.notNull())
		.addColumn("associationId", "integer", (col) =>
			col.references("Association.id").onDelete("cascade"),
		)
		.addColumn("plusTier", "integer")
		.addColumn("friendsOfUserId", "integer", (col) =>
			col.references("User.id").onDelete("cascade"),
		)
		.addColumn("isPublic", "integer", (col) => col.notNull().defaultTo(0))
		.addCheckConstraint(
			"content_visibility_one_entity",
			sql`("scrimPostId" is not null) + ("lobbyId" is not null) = 1`,
		)
		.addCheckConstraint(
			"content_visibility_one_audience",
			sql`("associationId" is not null) + ("plusTier" is not null) + ("friendsOfUserId" is not null) + ("isPublic" = 1) = 1`,
		)
		.modifyEnd(sql`strict`)
		.execute();

	await trx.schema
		.createIndex("content_visibility_scrim_post_id_visible_from")
		.on("ContentVisibility")
		.columns(["scrimPostId", "visibleFrom"])
		.execute();
	await trx.schema
		.createIndex("content_visibility_lobby_id_visible_from")
		.on("ContentVisibility")
		.columns(["lobbyId", "visibleFrom"])
		.execute();
	await trx.schema
		.createIndex("content_visibility_association_id")
		.on("ContentVisibility")
		.column("associationId")
		.execute();
	await trx.schema
		.createIndex("content_visibility_friends_of_user_id")
		.on("ContentVisibility")
		.column("friendsOfUserId")
		.execute();
}

type LegacyAssociationIdentifier = number | "+1" | "+2" | "+3" | "FRIENDS";

interface LegacyVisibility {
	forAssociation: LegacyAssociationIdentifier;
	notFoundInstructions?: Array<{
		at: number;
		forAssociation: LegacyAssociationIdentifier | null;
	}>;
}

async function migrateScrimVisibility(trx: Kysely<any>) {
	const posts: Array<{
		id: number;
		visibility: string | null;
		createdAt: number;
		ownerId: number | null;
	}> = await trx
		.selectFrom("ScrimPost")
		.select([
			"ScrimPost.id",
			"ScrimPost.visibility",
			"ScrimPost.createdAt",
			sql<
				number | null
			>`(select "ScrimPostUser"."userId" from "ScrimPostUser" where "ScrimPostUser"."scrimPostId" = "ScrimPost"."id" and "ScrimPostUser"."isOwner" = 1 limit 1)`.as(
				"ownerId",
			),
		])
		.execute();

	const rows = posts.flatMap((post) => {
		const visibility: LegacyVisibility | null = post.visibility
			? JSON.parse(post.visibility)
			: null;

		if (!visibility) {
			return [
				audienceRow({
					scrimPostId: post.id,
					identifier: null,
					visibleFrom: post.createdAt,
					ownerId: post.ownerId,
				}),
			];
		}

		return [
			audienceRow({
				scrimPostId: post.id,
				identifier: visibility.forAssociation,
				visibleFrom: post.createdAt,
				ownerId: post.ownerId,
			}),
			...(visibility.notFoundInstructions ?? []).map((instruction) =>
				audienceRow({
					scrimPostId: post.id,
					identifier: instruction.forAssociation,
					visibleFrom: instruction.at,
					ownerId: post.ownerId,
				}),
			),
		];
	});

	const existingAssociationIds = new Set(
		(await trx.selectFrom("Association").select("id").execute()).map(
			(row: { id: number }) => row.id,
		),
	);
	const validRows = rows.filter(
		(row) =>
			row !== null &&
			(row.associationId === null ||
				existingAssociationIds.has(row.associationId)),
	);

	for (const chunk of chunks(validRows, 500)) {
		await trx.insertInto("ContentVisibility").values(chunk).execute();
	}

	await trx.schema.alterTable("ScrimPost").dropColumn("visibility").execute();
}

function audienceRow({
	scrimPostId,
	identifier,
	visibleFrom,
	ownerId,
}: {
	scrimPostId: number;
	identifier: LegacyAssociationIdentifier | null;
	visibleFrom: number;
	ownerId: number | null;
}) {
	const row = {
		scrimPostId,
		visibleFrom,
		associationId: null as number | null,
		plusTier: null as number | null,
		friendsOfUserId: null as number | null,
		isPublic: 0,
	};

	if (identifier === null) return { ...row, isPublic: 1 };
	if (identifier === "FRIENDS") {
		// a post without an owner has nobody whose friends could see it
		return ownerId === null ? null : { ...row, friendsOfUserId: ownerId };
	}
	if (identifier === "+1") return { ...row, plusTier: 1 };
	if (identifier === "+2") return { ...row, plusTier: 2 };
	if (identifier === "+3") return { ...row, plusTier: 3 };

	return { ...row, associationId: identifier };
}

async function rebuildReportedWeapon(trx: Kysely<any>) {
	await sql`
		create table "ReportedWeapon__rebuild" (
			"groupMatchId" integer,
			"tournamentMatchId" integer,
			"lobbySetId" integer,
			"mapIndex" integer not null,
			"weaponSplId" integer not null,
			"userId" integer not null,
			"createdAt" integer default (strftime('%s', 'now')) not null,
			"ingestedMatchId" integer references "IngestedMatch" ("id") on delete cascade,
			foreign key ("groupMatchId") references "GroupMatch" ("id") on delete cascade,
			foreign key ("tournamentMatchId") references "TournamentMatch" ("id") on delete cascade,
			foreign key ("lobbySetId") references "LobbySet" ("id") on delete cascade,
			foreign key ("userId") references "User" ("id") on delete restrict,
			unique ("groupMatchId", "mapIndex", "userId") on conflict rollback,
			unique ("tournamentMatchId", "mapIndex", "userId") on conflict rollback,
			unique ("lobbySetId", "mapIndex", "userId") on conflict rollback,
			check (
				("groupMatchId" is not null) + ("tournamentMatchId" is not null) + ("lobbySetId" is not null) = 1
			)
		) strict
	`.execute(trx);

	await rebuild(trx, "ReportedWeapon", [
		"groupMatchId",
		"tournamentMatchId",
		"mapIndex",
		"weaponSplId",
		"userId",
		"createdAt",
		"ingestedMatchId",
	]);
}

async function rebuildIngestedMatchLink(trx: Kysely<any>) {
	await sql`
		create table "IngestedMatchLink__rebuild" (
			"id" integer primary key autoincrement,
			"ingestedMatchId" integer not null unique references "IngestedMatch" ("id") on delete cascade,
			"tournamentMatchGameResultId" integer references "TournamentMatchGameResult" ("id") on delete cascade,
			"groupMatchMapId" integer references "GroupMatchMap" ("id") on delete cascade,
			"lobbyGameId" integer references "LobbyGame" ("id") on delete cascade,
			"createdAt" integer default (strftime('%s', 'now')) not null,
			constraint "ingested_match_link_one_target" check (
				("tournamentMatchGameResultId" is not null) + ("groupMatchMapId" is not null) + ("lobbyGameId" is not null) = 1
			)
		) strict
	`.execute(trx);

	await rebuild(trx, "IngestedMatchLink", [
		"id",
		"ingestedMatchId",
		"tournamentMatchGameResultId",
		"groupMatchMapId",
		"createdAt",
	]);

	await trx.schema
		.createIndex("ingested_match_link_lobby_game_id")
		.on("IngestedMatchLink")
		.column("lobbyGameId")
		.execute();
}

/** Copies the rows into the already created `<table>__rebuild`, swaps it in and recreates the indexes. */
async function rebuild(trx: Kysely<any>, table: string, columns: string[]) {
	const { rows: indexes } = await sql<{ sql: string }>`
		select "sql" from "sqlite_master"
		where "type" = 'index' and "tbl_name" = ${table} and "sql" is not null
	`.execute(trx);
	const columnList = columns.map((column) => `"${column}"`).join(", ");

	await sql
		.raw(
			`insert into "${table}__rebuild" (${columnList}) select ${columnList} from "${table}"`,
		)
		.execute(trx);
	await sql.raw(`drop table "${table}"`).execute(trx);
	await sql
		.raw(`alter table "${table}__rebuild" rename to "${table}"`)
		.execute(trx);

	for (const index of indexes) {
		await sql.raw(index.sql).execute(trx);
	}
}

async function createChatRoomDeleteTrigger(
	trx: Kysely<any>,
	table: string,
	column: string,
) {
	await sql
		.raw(
			`create trigger "${snakeCase(table)}_${snakeCase(column)}_deletes_chat_room" after delete on "${table}"
			when old."${column}" is not null
			begin delete from "ChatRoom" where "id" = old."${column}"; end`,
		)
		.execute(trx);
}

function snakeCase(value: string) {
	return value.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function chunks<T>(items: T[], size: number) {
	const result: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		result.push(items.slice(i, i + size));
	}
	return result;
}
