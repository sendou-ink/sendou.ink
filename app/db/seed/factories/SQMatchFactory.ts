import { db } from "~/db/sql";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import invariant from "~/utils/invariant";
import { backdate } from "../core/backdate";
import { defineFactory } from "../core/defineFactory";
import * as SplatoonFaker from "../core/SplatoonFaker";
import * as SQGroupFactory from "./SQGroupFactory";

type InsertArgs = Omit<
	Parameters<typeof SQMatchRepository.insert>[0],
	"alphaGroupId" | "bravoGroupId"
> & {
	/** Members of the alpha group, the first of them its owner. */
	alphaUserIds: number[];
	/** Members of the bravo group, the first of them its owner. */
	bravoUserIds: number[];
	/** Were the two groups made in the matchmaking UI, rather than by inviting? */
	isMatchmade?: boolean;
};

type Options = {
	/** Play the match out, alpha winning every map, up to both teams having agreed
	 * on the score. Leaves both groups inactive, as a real concluded match does. */
	isConcluded?: boolean;
	/** Play the match out, alpha winning every map, and report the score as alpha —
	 * leaving bravo still to confirm it. Alpha's group goes inactive, as reporting
	 * makes it, so its members are free to queue again. */
	isReported?: boolean;
	/** When the match was made, for one that should look older than now. */
	createdAt?: Date;
	/** When the two groups had agreed on the score. Needs `isConcluded`. */
	confirmedAt?: Date;
};

/**
 * Creates SendouQ matches together with the two groups playing them: a match is
 * only ever made out of two full groups, the way the matchmaking UI makes one, so
 * the groups are not the caller's to bring. Both are returned with the match.
 */
export const { create } = defineFactory({
	defaults: () => ({
		mapList: SplatoonFaker.mapList(SENDOUQ_BEST_OF).map((map) => ({
			...map,
			source: "BOTH" as const,
		})),
		memento: { users: {}, groups: {}, pools: [] },
	}),
	insert: async ({
		alphaUserIds,
		bravoUserIds,
		isMatchmade,
		...args
	}: InsertArgs) => {
		const alphaGroup = await SQGroupFactory.create(
			{ memberUserIds: alphaUserIds },
			{ isMatchmade },
		);
		const bravoGroup = await SQGroupFactory.create(
			{ memberUserIds: bravoUserIds },
			{ isMatchmade },
		);

		const match = await SQMatchRepository.insert({
			...args,
			alphaGroupId: alphaGroup.id,
			bravoGroupId: bravoGroup.id,
		});

		return { ...match, alphaGroup, bravoGroup };
	},
	applyOptions: async (
		match,
		{ isConcluded, isReported, createdAt, confirmedAt }: Options,
	) => {
		if (isConcluded) {
			await playOutMatch(match.id);
		}

		if (isReported) {
			await reportMatch(match.id);
		}

		await backdate("GroupMatch", match.id, { createdAt, confirmedAt });

		if (createdAt) {
			await backdateSkills(match.id, createdAt);
		}
	},
});

/** Concluding stamps the skill rows *now*; move them to when the match was played
 * so the season progression chart spreads over days. */
async function backdateSkills(matchId: number, createdAt: Date) {
	const skills = await db
		.selectFrom("Skill")
		.select("id")
		.where("groupMatchId", "=", matchId)
		.execute();

	for (const skill of skills) {
		await backdate("Skill", skill.id, { createdAt });
	}
}

async function playOutMatch(matchId: number) {
	const { winnerId, reportedCount } = await reportMatch(matchId);

	const match = await SQMatchRepository.findById(matchId);
	invariant(match, "Match not found");

	const confirmation = await SQMatchRepository.reportMapWinner({
		matchId,
		winnerId,
		reportedByUserId: match.groupBravo.members[0].id,
		reportedCount: reportedCount + 1,
	});

	invariant(
		confirmation.status === "MATCH_FINALIZED",
		`Confirming the score resulted in ${confirmation.status}`,
	);
}

/** Reports every map as alpha, up to the score being in but not yet confirmed. */
async function reportMatch(matchId: number) {
	const match = await SQMatchRepository.findById(matchId);
	invariant(match, "Match not found");

	const winnerId = match.groupAlpha.id;
	const reportedByUserId = match.groupAlpha.members[0].id;

	let reportedCount = 0;
	let result = await SQMatchRepository.reportMapWinner({
		matchId,
		winnerId,
		reportedByUserId,
		reportedCount,
	});

	while (result.status === "MAP_REPORTED") {
		reportedCount++;
		result = await SQMatchRepository.reportMapWinner({
			matchId,
			winnerId,
			reportedByUserId,
			reportedCount,
		});
	}

	invariant(
		result.status === "MATCH_REPORTED",
		`Reporting the deciding map resulted in ${result.status}`,
	);

	return { winnerId, reportedCount };
}
