import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { TIERS } from "~/features/mmr/mmr-constants";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import {
	navIconUrl,
	SENDOUQ_LOOKING_PAGE,
	sendouQMatchPage,
} from "~/utils/urls";

/** Error class for SendouQ (expected) errors */
export class SendouQError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SendouQError";
	}
}

const seasonsKnownToHaveSkills = new Set<number>();

/** Whether the season's initial skills were seeded (or there was no previous season's skills to seed them from). */
export async function seasonInitialSkillsExist(season: number) {
	if (seasonsKnownToHaveSkills.has(season)) return true;

	if (await SkillRepository.existsBySeason(season)) {
		seasonsKnownToHaveSkills.add(season);
		return true;
	}

	// if the previous season has no skills either there was nothing to seed the
	// new season's initial skills from (e.g. a fresh development database)
	return !(await SkillRepository.existsBySeason(season - 1));
}

/** Clears the in-process cache backing `seasonInitialSkillsExist`. */
export function clearSeasonSkillsCache() {
	seasonsKnownToHaveSkills.clear();
}

export function setGroupChatMetadata(group: {
	chatCode: string;
	members: { id: number }[];
}) {
	ChatSystemMessage.setMetadata({
		chatCode: group.chatCode,
		header: `Group (${group.members.length}/4)`,
		subtitle: "SendouQ",
		url: SENDOUQ_LOOKING_PAGE,
		imageUrl: `${navIconUrl("sendouq")}.avif`,
		participantUserIds: group.members.map((m) => m.id),
		expiresAfter: { hours: 2 },
	});
}

export function setMatchChatMetadata(match: {
	id: number;
	chatCode: string;
	participantUserIds: number[];
}) {
	ChatSystemMessage.setMetadata({
		chatCode: match.chatCode,
		header: `Match #${match.id}`,
		subtitle: "SendouQ",
		url: sendouQMatchPage(match.id),
		imageUrl: `${navIconUrl("sendouq")}.avif`,
		participantUserIds: match.participantUserIds,
		expiresAfter: { hours: 2 },
	});
}

const allTiersOrdered = TIERS.flatMap((t) => [
	{ name: t.name, isPlus: true },
	{ name: t.name, isPlus: false },
]).reverse();
const allTiersOrderedWithLeviathan = allTiersOrdered.filter(
	(t) => t.name !== "LEVIATHAN",
);

export function getTierIndex(
	tier: TieredSkill["tier"] | null | undefined,
	isAccurateTiers: boolean,
) {
	if (!tier) return null;

	const tiers = isAccurateTiers
		? allTiersOrdered
		: allTiersOrderedWithLeviathan;

	const index = tiers.findIndex(
		(t) => t.name === tier.name && t.isPlus === tier.isPlus,
	);

	return index === -1 ? null : index;
}
