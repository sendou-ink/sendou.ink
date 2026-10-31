import type { CastAccount, CastedMatchesInfo } from "~/db/tables-json";
import { mySlugify } from "~/utils/urls";
import type { BroadcastChannel } from "../broadcast-types";

/** The tournament's broadcast channels, one per cast account. */
export function list(castAccounts: CastAccount[] | null): BroadcastChannel[] {
	return (castAccounts ?? []).map((castAccount) => ({
		platform: castAccount.platform,
		account: castAccount.account,
		name: castAccount.name,
		slug: slug(castAccount),
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
	const isOfChannel = (match: { platform: string; account: string }) =>
		match.platform === channel.platform && match.account === channel.account;

	return (
		castedMatchesInfo?.castedMatches.find(isOfChannel)?.matchId ??
		castedMatchesInfo?.lockedMatches.find(isOfChannel)?.matchId ??
		null
	);
}

/** Twitch logins are readable URL keys as is, YouTube's account is an opaque channel id so its name is used instead. */
function slug(castAccount: CastAccount) {
	if (castAccount.platform === "TWITCH")
		return castAccount.account.toLowerCase();

	return mySlugify(castAccount.name) || castAccount.account.toLowerCase();
}
