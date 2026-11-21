import type { CastAccount, CastedMatchesInfo } from "~/db/tables-json";
import type { BroadcastChannel } from "~/features/broadcast/broadcast-types";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import type { StreamAccount } from "~/features/live-streams/live-streams-constants";
import { mySlugify } from "~/utils/urls";

/** The tournament's broadcast channels, one per cast account, each with a slug no other channel of the tournament has. */
export function list(castAccounts: CastAccount[] | null): BroadcastChannel[] {
	const accounts = castAccounts ?? [];
	const takenSlugs = new Set(
		accounts
			.filter((castAccount) => castAccount.platform === "TWITCH")
			.map(twitchSlug),
	);

	return accounts.map((castAccount) => ({
		platform: castAccount.platform,
		account: castAccount.account,
		name: castAccount.name,
		slug:
			castAccount.platform === "TWITCH"
				? twitchSlug(castAccount)
				: claimYouTubeSlug(castAccount, takenSlugs),
	}));
}

/** The broadcast channel the URL key points to, `undefined` when the tournament has no such cast account. */
export function findBySlug(
	castAccounts: CastAccount[] | null,
	channelSlug: string,
): BroadcastChannel | undefined {
	return list(castAccounts).find((channel) => channel.slug === channelSlug);
}

// xxx: adding a proper stream queue (an ordered list of upcoming matches per channel) might make sense instead of casted/locked matches
/** Id of the match the channel features: the one being cast on it, or else the first one locked to be cast on it next. */
export function featuredMatchId({
	castedMatchesInfo,
	channel,
}: {
	castedMatchesInfo: CastedMatchesInfo | null;
	channel: Pick<BroadcastChannel, "platform" | "account">;
}): number | null {
	const isOfChannel = (match: StreamAccount) =>
		LiveStream.isSameAccount(match, channel);

	return (
		castedMatchesInfo?.castedMatches.find(isOfChannel)?.matchId ??
		castedMatchesInfo?.lockedMatches.find(isOfChannel)?.matchId ??
		null
	);
}

/** Twitch logins are readable URL keys as is and unique among the cast accounts. */
function twitchSlug(castAccount: CastAccount) {
	return castAccount.account.toLowerCase();
}

/** YouTube's account is an opaque channel id so its name is used instead, unless another channel already has that slug. */
function claimYouTubeSlug(castAccount: CastAccount, takenSlugs: Set<string>) {
	const nameSlug = mySlugify(castAccount.name);
	const slug =
		nameSlug && !takenSlugs.has(nameSlug)
			? nameSlug
			: castAccount.account.toLowerCase();

	takenSlugs.add(slug);
	return slug;
}
