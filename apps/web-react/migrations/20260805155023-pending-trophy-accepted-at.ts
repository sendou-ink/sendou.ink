import { type Kysely, sql } from "kysely";

const duplicateMapping = sql`
	select
		dup."id" as "dupId",
		(
			select min(kept."id")
			from "Trophy" kept
			where kept."code" is null
				and kept."name" = dup."name"
				and kept."creatorId" is dup."creatorId"
		) as "keepId"
	from "Trophy" dup
	where dup."code" is null
		and exists (
			select 1
			from "Trophy" kept
			where kept."code" is null
				and kept."name" = dup."name"
				and kept."creatorId" is dup."creatorId"
				and kept."id" < dup."id"
		)
`;

/**
 * Persists trophy submission acceptance instead of deriving it from the approval
 * count, so that raising TROPHY_APPROVALS_REQUIRED cannot put already accepted
 * submissions back into the review queue. Also deletes duplicate trophies that
 * re-approving an already accepted submission created, keeping the oldest one.
 */
export async function up(db: Kysely<any>): Promise<void> {
	// kysely does not wrap sqlite migrations in a transaction, so do it here
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("PendingTrophy")
			.addColumn("acceptedAt", "integer")
			.execute();

		// Repoint references at duplicates to the kept trophy before deleting, so
		// the on-delete cascades cannot destroy owner rows or pending submissions.
		// A duplicate is a user-submitted trophy sharing name and creator with an
		// older one, which the review flow cannot legitimately produce.
		await sql`
			update "TrophyOwner"
			set "trophyId" = m."keepId"
			from (${duplicateMapping}) m
			where "TrophyOwner"."trophyId" = m."dupId"
				and not exists (
					select 1
					from "TrophyOwner" existing
					where existing."tournamentId" = "TrophyOwner"."tournamentId"
						and existing."userId" = "TrophyOwner"."userId"
						and existing."trophyId" = m."keepId"
				)
		`.execute(trx);

		await sql`
			update "CalendarEvent"
			set "trophyId" = m."keepId"
			from (${duplicateMapping}) m
			where "CalendarEvent"."trophyId" = m."dupId"
		`.execute(trx);

		await sql`
			update "PendingTrophy"
			set "targetTrophyId" = m."keepId"
			from (${duplicateMapping}) m
			where "PendingTrophy"."targetTrophyId" = m."dupId"
		`.execute(trx);

		await sql`
			delete from "Trophy"
			where "id" in (select "dupId" from (${duplicateMapping}))
		`.execute(trx);

		// Backfill submissions accepted under the old threshold of 2 approvals.
		// A row only counts as accepted if its trophy was actually created.
		await sql`
			update "PendingTrophy"
			set "acceptedAt" = (
				select max("createdAt")
				from "PendingTrophyApproval"
				where "PendingTrophyApproval"."pendingTrophyId" = "PendingTrophy"."id"
			)
			where "declinedAt" is null
				and (
					select count(*)
					from "PendingTrophyApproval"
					where "PendingTrophyApproval"."pendingTrophyId" = "PendingTrophy"."id"
				) >= 2
				and (
					(
						"targetTrophyId" is null
						and exists (
							select 1
							from "Trophy"
							where "Trophy"."name" = "PendingTrophy"."name"
								and "Trophy"."creatorId" = "PendingTrophy"."submitterUserId"
						)
					)
					or (
						"targetTrophyId" is not null
						and exists (
							select 1
							from "Trophy"
							where "Trophy"."id" = "PendingTrophy"."targetTrophyId"
								and "Trophy"."name" = "PendingTrophy"."name"
								and "Trophy"."model" = "PendingTrophy"."model"
						)
					)
				)
		`.execute(trx);
	});
}
