import { Mic, Pencil } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/elements/Button";
import { WeaponImage } from "~/components/Image";
import type { UserVoiceChat } from "~/db/tables";
import { MATCH_PROFILE_WEAPON_POOL_ID } from "~/features/settings/settings-constants";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { MATCH_PROFILE_PAGE } from "~/utils/urls";
import styles from "./MatchProfileSummary.module.css";

/** Read-only line of the user's match profile values with a link to edit them. Omitted values are not shown. */
export function MatchProfileSummary({
	vc,
	languages,
	weaponPool,
}: {
	vc?: UserVoiceChat;
	languages?: string[];
	weaponPool: Array<{
		weaponSplId: MainWeaponId;
		isFavorite: boolean | number;
		isTenStar: boolean | number;
	}>;
}) {
	const { t } = useTranslation(["common"]);

	const items: Array<{ key: string; element: React.ReactNode }> = [];
	if (vc) {
		items.push({ key: "vc", element: <VcStatus vc={vc} /> });
	}
	if (languages && languages.length > 0) {
		items.push({
			key: "languages",
			element: <div>{languages.join(" / ").toUpperCase()}</div>,
		});
	}
	if (weaponPool.length > 0) {
		items.push({
			key: "weapons",
			element: (
				<div className="stack horizontal xxs">
					{weaponPool.map((weapon) => (
						<WeaponImage key={weapon.weaponSplId} weapon={weapon} size={26} />
					))}
				</div>
			),
		});
	}

	return (
		<div className="stack xs" data-testid="match-profile-summary">
			{items.length > 0 ? (
				<div className={styles.values}>
					{items.map(({ key, element }, i) => (
						<React.Fragment key={key}>
							{i > 0 ? "·" : null}
							{element}
						</React.Fragment>
					))}
				</div>
			) : null}
			<div className="stack horizontal sm items-center text-xs text-lighter">
				{t("common:matchProfile.from")}
				<LinkButton
					to={`${MATCH_PROFILE_PAGE}#${MATCH_PROFILE_WEAPON_POOL_ID}`}
					size="miniscule"
					icon={<Pencil />}
				>
					{t("common:actions.edit")}
				</LinkButton>
			</div>
		</div>
	);
}

export function VcStatus({ vc }: { vc: UserVoiceChat }) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={styles.vc}>
			<Mic
				className={
					vc === "YES"
						? "text-success"
						: vc === "LISTEN_ONLY"
							? "text-warning"
							: "text-error"
				}
			/>
			{t(`common:vc.${vc}`)}
		</div>
	);
}
