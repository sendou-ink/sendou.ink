import type { MapResult, PlayerResult } from "~/db/types";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import invariant from "~/utils/invariant";
import { winnersArrayToWinner } from "../q-utils";
import type { MatchById } from "../queries/findMatchById.server";

export function summarizeMaps({
	match,
	winners,
	members,
}: {
	match: MatchById;
	winners: ("ALPHA" | "BRAVO")[];
	members: { id: number; groupId: number }[];
}) {
	const season = currentOrPreviousSeason(new Date())?.nth;
	invariant(typeof season === "number", "No ranked season for skills");

	const result: Array<MapResult> = [];

	const playedMaps = match.mapList.slice(0, winners.length);

	for (const [i, map] of playedMaps.entries()) {
		const winnerSide = winners[i];
		const winnerGroupId =
			winnerSide === "ALPHA" ? match.alphaGroupId : match.bravoGroupId;

		const winnerPlayers = members.filter((p) => p.groupId === winnerGroupId);
		const loserPlayers = members.filter((p) => p.groupId !== winnerGroupId);

		for (const winner of winnerPlayers) {
			result.push({
				userId: winner.id,
				wins: 1,
				losses: 0,
				mode: map.mode,
				stageId: map.stageId,
				season,
			});
		}

		for (const loser of loserPlayers) {
			result.push({
				userId: loser.id,
				wins: 0,
				losses: 1,
				mode: map.mode,
				stageId: map.stageId,
				season,
			});
		}
	}

	return result;
}

export function summarizePlayerResults({
	match,
	winners,
	members,
}: {
	match: MatchById;
	winners: ("ALPHA" | "BRAVO")[];
	members: { id: number; groupId: number }[];
}) {
	const season = currentOrPreviousSeason(new Date())?.nth;
	invariant(typeof season === "number", "No ranked season for skills");

	const result: Array<PlayerResult> = [];

	const addMapResult = ({
		outcome,
		type,
		ownerUserId,
		otherUserId,
	}: {
		outcome: "win" | "loss";
		type: "MATE" | "ENEMY";
		ownerUserId: number;
		otherUserId: number;
	}) => {
		const existing = result.find(
			(r) => r.ownerUserId === ownerUserId && r.otherUserId === otherUserId,
		);
		if (existing) {
			if (outcome === "win") {
				existing.mapWins++;
			} else existing.mapLosses++;
		} else {
			result.push({
				ownerUserId,
				otherUserId,
				type,
				mapWins: outcome === "win" ? 1 : 0,
				mapLosses: outcome === "win" ? 0 : 1,
				season,
				setLosses: 0,
				setWins: 0,
			});
		}
	};

	for (const winner of winners) {
		for (const member of members) {
			for (const member2 of members) {
				if (member.id === member2.id) continue;

				const type = member.groupId === member2.groupId ? "MATE" : "ENEMY";
				const won =
					winner === "ALPHA"
						? member.groupId === match.alphaGroupId
						: member.groupId === match.bravoGroupId;

				addMapResult({
					ownerUserId: member.id,
					otherUserId: member2.id,
					type,
					outcome: won ? "win" : "loss",
				});
			}
		}
	}

	const winner = winnersArrayToWinner(winners);

	for (const member of members) {
		for (const member2 of members) {
			if (member.id === member2.id) continue;

			const type = member.groupId === member2.groupId ? "MATE" : "ENEMY";
			const won =
				winner === "ALPHA"
					? member.groupId === match.alphaGroupId
					: member.groupId === match.bravoGroupId;

			result.push({
				ownerUserId: member.id,
				otherUserId: member2.id,
				type,
				mapWins: 0,
				mapLosses: 0,
				season,
				setWins: won ? 1 : 0,
				setLosses: won ? 0 : 1,
			});
		}
	}

	return result;
}
