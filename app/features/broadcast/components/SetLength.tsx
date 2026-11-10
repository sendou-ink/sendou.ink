import { useTranslation } from "react-i18next";
import type { BroadcastMatch } from "../broadcast-types";

/** "Bo5" or "Play all 3". */
export function SetLength({
	match,
}: {
	match: Pick<BroadcastMatch, "countType" | "count">;
}) {
	const { t } = useTranslation(["broadcast"]);

	return match.countType === "BEST_OF"
		? t("broadcast:overlay.bestOf", { count: match.count })
		: t("broadcast:overlay.playAll", { count: match.count });
}
