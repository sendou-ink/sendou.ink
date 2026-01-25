import { href } from "react-router";
import { getLiveTournamentStreams } from "~/features/core/streams/streams.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import {
	navIconUrl,
	sendouQMatchPage,
	tournamentBracketsPage,
	tournamentMatchPage,
	userPage,
} from "~/utils/urls";

export type SidebarEvent = {
	id: number;
	name: string;
	url: string;
	logoUrl: string | null;
	startTime: number;
	type: "tournament" | "scrim";
	scrimStatus?: "booked" | "looking";
};

export type SidebarFriend = {
	id: number;
	name: string;
	discordId: string;
	discordAvatar: string | null;
	url: string;
	subtitle: string;
	badge: string;
};

const MAX_EVENTS_VISIBLE = 8;
const MAX_FRIENDS_VISIBLE = 4;
const SENDOUQ_QUOTA = 2;
const TOURNAMENT_SUB_QUOTA = 2;

export async function resolveSidebarData(userId: number | null) {
	if (!userId) {
		return {
			events: [] as SidebarEvent[],
			matchStatus: null as { matchId: number; url: string } | null,
			tournamentMatchStatus: null as {
				url: string;
				text: string;
				roundName?: string;
				logoUrl: string | null;
			} | null,
			friends: [] as SidebarFriend[],
			streams: await getLiveTournamentStreams(),
		};
	}

	const ownGroup = SendouQ.findOwnGroup(userId);
	const [tournamentsData, scrimsData, friendsWithActivity] = await Promise.all([
		ShowcaseTournaments.frontPageTournamentsByUserId(userId),
		ScrimPostRepository.findUserScrims(userId),
		FriendRepository.findByUserIdWithActivity(userId),
	]);

	const tournamentMatchStatus = resolveTournamentMatchStatus(userId);

	const seenTournamentIds = new Set<number>();
	const tournamentEvents: SidebarEvent[] = [
		...tournamentsData.participatingFor,
		...tournamentsData.organizingFor,
	]
		.filter((t) => {
			if (seenTournamentIds.has(t.id)) return false;
			seenTournamentIds.add(t.id);
			return true;
		})
		.map((t) => ({
			id: t.id,
			name: t.name,
			url: t.url,
			logoUrl: t.logoUrl,
			startTime: t.startTime,
			type: "tournament" as const,
		}));

	const scrimsIconUrl = `${navIconUrl("scrims")}.png`;
	const scrimEvents: SidebarEvent[] = scrimsData.map((s) => ({
		id: s.id,
		name: s.opponentName ?? "Scrim",
		url: s.isAccepted
			? href("/scrims/:id", { id: String(s.id) })
			: href("/scrims"),
		logoUrl: s.opponentAvatarUrl ?? scrimsIconUrl,
		startTime: s.at,
		type: "scrim" as const,
		scrimStatus: s.isAccepted ? ("booked" as const) : ("looking" as const),
	}));

	const events = [...tournamentEvents, ...scrimEvents]
		.sort((a, b) => a.startTime - b.startTime)
		.slice(0, MAX_EVENTS_VISIBLE);

	const friends = resolveFriends(friendsWithActivity);

	return {
		events,
		matchStatus: ownGroup?.matchId
			? { matchId: ownGroup.matchId, url: sendouQMatchPage(ownGroup.matchId) }
			: null,
		tournamentMatchStatus,
		friends,
		streams: await getLiveTournamentStreams(),
	};
}

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

type FriendWithActivity = Awaited<
	ReturnType<typeof FriendRepository.findByUserIdWithActivity>
>[number];

function resolveFriends(friendsWithActivity: FriendWithActivity[]) {
	const sendouqFriends: SidebarFriend[] = [];
	const tournamentSubFriends: SidebarFriend[] = [];

	for (const friend of friendsWithActivity) {
		const ownGroup = SendouQ.findOwnGroup(friend.id);

		const url = userPage({
			discordId: friend.discordId,
			customUrl: friend.customUrl,
		});

		if (ownGroup && ownGroup.members.length < FULL_GROUP_SIZE) {
			sendouqFriends.push({
				id: friend.id,
				name: friend.username,
				discordId: friend.discordId,
				discordAvatar: friend.discordAvatar,
				url,
				subtitle: "SendouQ",
				badge: `${ownGroup.members.length}/${FULL_GROUP_SIZE}`,
			});
		} else if (friend.tournamentName) {
			// this is temporary, will be replaced with "SQified tournament team creator"
			tournamentSubFriends.push({
				id: friend.id,
				name: friend.username,
				discordId: friend.discordId,
				discordAvatar: friend.discordAvatar,
				url,
				subtitle: friend.tournamentName,
				badge: `1/${FULL_GROUP_SIZE}`,
			});
		}
	}

	const result: SidebarFriend[] = [];

	const sendouqToShow = sendouqFriends.slice(0, SENDOUQ_QUOTA);
	const tournamentToShow = tournamentSubFriends.slice(0, TOURNAMENT_SUB_QUOTA);

	result.push(...sendouqToShow, ...tournamentToShow);

	const remaining = MAX_FRIENDS_VISIBLE - result.length;
	if (remaining > 0) {
		const extraSendouq = sendouqFriends.slice(SENDOUQ_QUOTA);
		const extraTournament = tournamentSubFriends.slice(TOURNAMENT_SUB_QUOTA);
		result.push(...[...extraSendouq, ...extraTournament].slice(0, remaining));
	}

	return result;
}
