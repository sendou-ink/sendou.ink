import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import {
	sendouQMatchPage,
	tournamentBracketsPage,
	tournamentMatchPage,
} from "~/utils/urls";

export const loader = async (_args: LoaderFunctionArgs) => {
	const user = getUser();

	if (!user) {
		return {
			tournaments: [] as Array<{
				id: number;
				name: string;
				url: string;
				logoUrl: string | null;
				startTime: number;
			}>,
			matchStatus: null as { matchId: number; url: string } | null,
			tournamentMatchStatus: null as {
				url: string;
				text: string;
				roundName?: string;
				logoUrl: string | null;
			} | null,
			friends: getMockFriends(),
			streams: getMockStreams(),
		};
	}

	const [tournamentsData, ownGroup] = await Promise.all([
		ShowcaseTournaments.frontPageTournamentsByUserId(user.id),
		Promise.resolve(SendouQ.findOwnGroup(user.id)),
	]);

	const tournamentMatchStatus = resolveTournamentMatchStatus(user.id);

	return {
		// xxx: cache the right shape
		tournaments: [
			...tournamentsData.participatingFor,
			...tournamentsData.organizingFor,
		]
			.sort((a, b) => a.startTime - b.startTime)
			.slice(0, 4)
			.map((t) => ({
				id: t.id,
				name: t.name,
				url: t.url,
				logoUrl: t.logoUrl,
				startTime: t.startTime,
			})),
		matchStatus: ownGroup?.matchId
			? { matchId: ownGroup.matchId, url: sendouQMatchPage(ownGroup.matchId) }
			: null,
		tournamentMatchStatus,
		friends: getMockFriends(),
		streams: getMockStreams(),
	};
};

function resolveTournamentMatchStatus(userId: number) {
	const tournament = RunningTournaments.getUserTournament(userId);
	if (!tournament) return null;

	const status = tournament.teamMemberOfProgressStatus({ id: userId });
	if (!status) return null;

	const tournamentId = tournament.ctx.id;
	const logoUrl = tournament.ctx.logoUrl;

	if (status.type === "MATCH") {
		const roundInfo = tournament.matchContextNamesById(status.matchId);
		const roundNameWithoutNumbers = (roundInfo?.roundName ?? "Match").replace(
			/\.\d+$/,
			"",
		);
		return {
			url: tournamentMatchPage({ tournamentId, matchId: status.matchId }),
			text: "MATCH",
			roundName: roundNameWithoutNumbers,
			logoUrl,
		};
	}

	if (status.type === "CHECKIN") {
		return {
			url: tournamentBracketsPage({ tournamentId }),
			text: "CHECKIN",
			logoUrl,
		};
	}

	if (
		status.type === "WAITING_FOR_MATCH" ||
		status.type === "WAITING_FOR_CAST" ||
		status.type === "WAITING_FOR_ROUND" ||
		status.type === "WAITING_FOR_BRACKET"
	) {
		return {
			url: tournamentBracketsPage({ tournamentId }),
			text: "WAITING",
			logoUrl,
		};
	}

	return null;
}

function getMockFriends() {
	return [
		{
			id: 1,
			name: "Splat_Master",
			avatarUrl: "https://i.pravatar.cc/150?u=friend1",
			subtitle: "SendouQ",
			badge: "2/4",
		},
		{
			id: 2,
			name: "InklingPro",
			avatarUrl: "https://i.pravatar.cc/150?u=friend2",
			subtitle: "Lobby",
			badge: "2/8",
		},
		{
			id: 3,
			name: "OctoKing",
			avatarUrl: "https://i.pravatar.cc/150?u=friend3",
			subtitle: "In The Zone 22",
			badge: "3/4",
		},
		{
			id: 4,
			name: "TurfWarrior",
			avatarUrl: "https://i.pravatar.cc/150?u=friend4",
			subtitle: "SendouQ",
			badge: "1/4",
		},
		{
			id: 5,
			name: "RankedGrinder",
			avatarUrl: "https://i.pravatar.cc/150?u=friend5",
			subtitle: "Lobby",
			badge: "5/8",
		},
	];
}

function getMockStreams() {
	return [
		{
			id: 3,
			name: "Paddling Pool 252",
			imageUrl: "https://i.pravatar.cc/150?u=stream1",
			subtitle: "Losers Finals",
			badge: "LIVE",
		},
		{
			id: 1,
			name: "Splash Go!",
			imageUrl:
				"https://liquipedia.net/commons/images/7/73/Splash_Go_allmode.png",
			subtitle: "Tomorrow, 9:00 AM",
		},
		{
			id: 2,
			name: "Area Cup",
			imageUrl:
				"https://pbs.twimg.com/profile_images/1830601967821017088/4SDZVKdj_400x400.jpg",
			subtitle: "Saturday, 10 AM",
		},
	];
}
