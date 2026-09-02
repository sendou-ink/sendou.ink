import { db } from "~/db/sql";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import invariant from "~/utils/invariant";
import { actAs } from "../core/actAs";
import { backdate } from "../core/backdate";
import { defineFactory } from "../core/defineFactory";
import * as SplatoonFaker from "../core/SplatoonFaker";
import * as SQGroupFactory from "./SQGroupFactory";

/** Tier every seeded group and member is stamped with, so match pages have one to show. */
const SEEDED_TIER = { name: "GOLD", isPlus: false } as const;

type InsertArgs = Omit<
	Parameters<typeof SQMatchRepository.insert>[0],
	"alphaGroupId" | "bravoGroupId" | "tiers"
> & {
	/** Members of the alpha group, the first of them its owner. */
	alphaUserIds: number[];
	/** Members of the bravo group, the first of them its owner. */
	bravoUserIds: number[];
	/** Were the two groups made in the matchmaking UI, rather than by inviting? */
	isMatchmade?: boolean;
};

type Group = Awaited<ReturnType<typeof SQGroupFactory.create>>;

/** One team's account of why the match was canceled. */
type CancelReport = {
	reason: string;
	/** Players of either team nominated as a cause of the cancellation. */
	nominatedUserIds: number[];
};

type Options = {
	/** Alpha wins every map and both teams agree on the score. Both groups end up inactive. */
	isConcluded?: boolean;
	/** Alpha's owner requests the cancellation and bravo's accepts, each giving their own account. */
	cancel?: { requested: CancelReport; accepted: CancelReport };
	/** Cancel the match the way staff does, leaving neither team an account of it. */
	canceledByStaffUserId?: number;
	/** Alpha wins every map and reports, bravo still to confirm. Alpha's group goes inactive. */
	isReported?: boolean;
	/** When the match was made, for one that should look older than now. */
	createdAt?: Date;
	/** When the two groups had agreed on the score. Needs `isConcluded`. */
	confirmedAt?: Date;
};

/** Creates the two full groups with the match, like the matchmaking UI does. Both are returned with the match. */
export const { create } = defineFactory({
	defaults: () => ({
		mapList: SplatoonFaker.mapList(SENDOUQ_BEST_OF).map((map) => ({
			...map,
			source: "BOTH" as const,
		})),
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
			tiers: {
				groups: [
					{
						id: alphaGroup.id,
						tier: SEEDED_TIER,
						members: memberTiers(alphaUserIds),
					},
					{
						id: bravoGroup.id,
						tier: SEEDED_TIER,
						members: memberTiers(bravoUserIds),
					},
				],
			},
		});

		return { ...match, alphaGroup, bravoGroup };
	},
	applyOptions: async (
		match,
		{
			isConcluded,
			isReported,
			cancel,
			canceledByStaffUserId,
			createdAt,
			confirmedAt,
		}: Options,
	) => {
		if (isConcluded) {
			await playOutMatch(match.id);
		}

		if (isReported) {
			await reportMatch(match.id);
		}

		if (cancel) {
			await cancelMatch(match, cancel);
		}

		if (canceledByStaffUserId) {
			await cancelMatchAsStaff(match.id, canceledByStaffUserId);
		}

		await backdate("GroupMatch", match.id, { createdAt, confirmedAt });

		if (createdAt) {
			await backdateSkills(match.id, createdAt);
		}
	},
});

function memberTiers(userIds: number[]) {
	return userIds.map((userId) => ({ userId, tier: SEEDED_TIER }));
}

/** Concluding stamps skill rows *now*; backdating spreads the season progression chart over days. */
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

async function cancelMatch(
	match: { id: number; alphaGroup: Group; bravoGroup: Group },
	{ requested, accepted }: { requested: CancelReport; accepted: CancelReport },
) {
	const request = await SQMatchRepository.requestCancelMatch({
		matchId: match.id,
		requestedByUserId: match.alphaGroup.memberUserIds[0],
		...requested,
	});

	invariant(
		request.status === "REQUESTED",
		`Requesting the cancellation resulted in ${request.status}`,
	);

	const acceptance = await SQMatchRepository.acceptCancelMatch({
		matchId: match.id,
		acceptedByUserId: match.bravoGroup.memberUserIds[0],
		...accepted,
	});

	invariant(
		acceptance.status === "ACCEPTED",
		`Accepting the cancellation resulted in ${acceptance.status}`,
	);
}

async function cancelMatchAsStaff(matchId: number, staffUserId: number) {
	const result = await actAs(staffUserId, () =>
		SQMatchRepository.cancelMatch({ matchId, isAdminReport: true }),
	);

	invariant(
		result.status === "CANCEL_CONFIRMED",
		`Canceling the match as staff resulted in ${result.status}`,
	);
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
