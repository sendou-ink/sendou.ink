import type { MainWeaponId } from "@sendou/in-game-lists/types";
import type { LFGType } from "~/features/lfg/lfg-constants";
import type { TierName } from "~/features/mmr/mmr-constants";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";

export interface LFGFilterValues {
	weapons: MainWeaponId[];
	type: LFGType | null;
	timezone: number | null;
	language: UnifiedLanguageCode | null;
	plusTier: number | null;
	minTier: TierName | null;
	maxTier: TierName | null;
}
