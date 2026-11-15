import type { TFunction } from "i18next";
import { ChevronsLeft, ListOrdered, ListPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatClock } from "~/features/broadcast/broadcast-utils";
import type * as StreamDeck from "~/modules/stream-deck/stream-deck";
import { ADVANCE_ICONS, SCENE_ICONS } from "./broadcast-cast-icons";
import type * as CastStreamDeck from "./core/CastStreamDeck";

/**
 * What the dashboard's Stream Deck keys look like: the scene on air red, the scene edited and the queue item key
 * (with the item's scene) bordered, the advance key blue while the item goes on air by itself, Take green (orange in
 * its last seconds) with its countdown or game cue.
 */
export function useStreamDeckFaces(
	keys: CastStreamDeck.Key[],
): StreamDeck.KeyFace[] {
	const { t } = useTranslation(["broadcast"]);

	return keys.map((key) => keyFace(key, t));
}

function keyFace(
	key: CastStreamDeck.Key,
	t: TFunction<["broadcast"]>,
): StreamDeck.KeyFace {
	switch (key.type) {
		case "scene":
			return {
				icon: SCENE_ICONS[key.scene],
				label: t(`broadcast:scene.${key.scene}`),
				detail: key.isLive ? t("broadcast:dashboard.live") : null,
				color: key.isLive ? "red" : "neutral",
				isSelected: key.isSelected,
				isDisabled: key.isDisabled,
			};
		case "take":
			return {
				icon: ChevronsLeft,
				label: t("broadcast:dashboard.take"),
				detail:
					key.remainingMs !== null
						? formatClock(key.remainingMs)
						: key.gameCue === "start"
							? t("broadcast:dashboard.streamDeck.onGameStart")
							: key.gameCue === "end"
								? t("broadcast:dashboard.streamDeck.onGameEnd")
								: null,
				color: key.isImminent ? "orange" : "green",
				isDisabled: key.isDisabled,
			};
		case "queueItem":
			return {
				icon: key.nextItemId === null ? ListPlus : ListOrdered,
				label:
					key.position === 0
						? t("broadcast:dashboard.next")
						: t("broadcast:dashboard.streamDeck.queueItem", {
								position: key.position + 1,
							}),
				detail: t(`broadcast:scene.${key.scene}`),
				isSelected: true,
			};
		case "advance":
			return {
				icon: ADVANCE_ICONS[key.advance],
				label:
					key.advance === "take"
						? t("broadcast:dashboard.queue.onTake")
						: key.advance === "timer"
							? t("broadcast:dashboard.queue.auto")
							: key.gameCue === "end"
								? t("broadcast:dashboard.streamDeck.onGameEnd")
								: t("broadcast:dashboard.streamDeck.onGameStart"),
				color: key.advance === "take" ? "neutral" : "blue",
				isDisabled: key.isDisabled,
			};
	}
}
