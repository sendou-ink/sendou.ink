// calculates org stats for the last 6 finished months
// used to decide which orgs are considered "established"
// you need at least 150 average monthly active players to be considered established
// if you drop below 100 you lose it

import "dotenv/config";
import { db } from "~/db/sql";
import { logger } from "~/utils/logger";

interface MonthData {
	year: number;
	month: number;
	label: string;
	startTimestamp: number;
	endTimestamp: number;
}

interface OrgMonthlyData {
	orgId: number;
	orgName: string;
	monthlyParticipants: number[];
	totalUniqueParticipants: number;
	averageMonthlyParticipants: number;
}

function getLastSixFinishedMonths(): MonthData[] {
	const now = new Date();
	const currentYear = now.getFullYear();
	const currentMonth = now.getMonth();

	const months: MonthData[] = [];

	for (let i = 1; i <= 6; i++) {
		const date = new Date(currentYear, currentMonth - i, 1);
		const year = date.getFullYear();
		const month = date.getMonth();

		const startTimestamp = Math.floor(
			new Date(year, month, 1).getTime() / 1000,
		);
		const endTimestamp = Math.floor(
			new Date(year, month + 1, 1).getTime() / 1000,
		);

		months.push({
			year,
			month,
			label: date.toLocaleDateString("en-US", {
				year: "numeric",
				month: "short",
			}),
			startTimestamp,
			endTimestamp,
		});
	}

	return months;
}

async function getParticipantsForOrgInMonth(
	organizationId: number,
	startTimestamp: number,
	endTimestamp: number,
): Promise<number> {
	const result = await db
		.selectFrom("CalendarEvent as ce")
		.innerJoin("CalendarEventDate as ced", "ced.eventId", "ce.id")
		.innerJoin("Tournament as t", "t.id", "ce.tournamentId")
		.innerJoin("TournamentTeam as tt", "tt.tournamentId", "t.id")
		.innerJoin(
			"TournamentTeamCheckIn as ttci",
			"ttci.tournamentTeamId",
			"tt.id",
		)
		.innerJoin(
			"TournamentMatchGameResultParticipant as tmgrp",
			"tmgrp.tournamentTeamId",
			"tt.id",
		)
		.select(({ fn }) => fn.count<number>("tmgrp.userId").distinct().as("count"))
		.where("ce.organizationId", "=", organizationId)
		.where("ced.startTime", ">=", startTimestamp)
		.where("ced.startTime", "<", endTimestamp)
		.where("ttci.checkedInAt", "is not", null)
		.where("ttci.isCheckOut", "=", 0)
		.executeTakeFirst();

	return result?.count ?? 0;
}

async function getOrgsWithRecentTournaments(
	months: MonthData[],
): Promise<number[]> {
	const earliestTimestamp = months[months.length - 1].startTimestamp;

	const orgs = await db
		.selectFrom("CalendarEvent as ce")
		.innerJoin("CalendarEventDate as ced", "ced.eventId", "ce.id")
		.select("ce.organizationId")
		.distinct()
		.where("ce.organizationId", "is not", null)
		.where("ced.startTime", ">=", earliestTimestamp)
		.execute();

	return orgs.map((org) => org.organizationId!);
}

async function main() {
	const months = getLastSixFinishedMonths();
	logger.info(
		`Analyzing last 6 finished months: ${months.map((m) => m.label).join(", ")}\n`,
	);

	const orgIds = await getOrgsWithRecentTournaments(months);
	logger.info(
		`Found ${orgIds.length} organizations with tournaments in this period\n`,
	);

	const orgData: OrgMonthlyData[] = [];

	for (const orgId of orgIds) {
		const org = await db
			.selectFrom("TournamentOrganization")
			.select(["id", "name"])
			.where("id", "=", orgId)
			.executeTakeFirst();

		if (!org) continue;

		const monthlyParticipants: number[] = [];

		for (const month of months) {
			const count = await getParticipantsForOrgInMonth(
				orgId,
				month.startTimestamp,
				month.endTimestamp,
			);
			monthlyParticipants.push(count);
		}

		const totalUniqueParticipants = monthlyParticipants.reduce(
			(sum, count) => sum + count,
			0,
		);
		const averageMonthlyParticipants = totalUniqueParticipants / 6;

		orgData.push({
			orgId: org.id,
			orgName: org.name,
			monthlyParticipants,
			totalUniqueParticipants,
			averageMonthlyParticipants,
		});
	}

	orgData.sort((a, b) => {
		if (b.averageMonthlyParticipants !== a.averageMonthlyParticipants) {
			return b.averageMonthlyParticipants - a.averageMonthlyParticipants;
		}
		return b.totalUniqueParticipants - a.totalUniqueParticipants;
	});

	logger.info("=".repeat(80));
	logger.info("ORGANIZATION MONTHLY ACTIVE PLAYERS REPORT");
	logger.info("=".repeat(80));
	logger.info();

	const headers = ["Org", "Avg", ...months.map((m) => m.label)];
	logger.info(headers.join(" | "));
	logger.info("-".repeat(80));

	for (const org of orgData) {
		const monthValues = org.monthlyParticipants.map((count) =>
			count === 0 ? "-" : count.toString(),
		);
		const row = [
			org.orgName,
			org.averageMonthlyParticipants.toFixed(1),
			...monthValues,
		];
		logger.info(row.join(" | "));
	}

	logger.info();
	logger.info(`Total organizations: ${orgData.length}`);
}

main().catch((err) => {
	logger.error("Error in org-monthly-active-players.ts", err);
	process.exit(1);
});
