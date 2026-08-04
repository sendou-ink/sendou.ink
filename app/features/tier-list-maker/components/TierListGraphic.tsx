import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { GraphicContainer } from "~/features/img-export/components/Graphic";
import type {
	TierListItem,
	TierListMakerTier,
} from "../tier-list-maker-schemas";
import { tierListItemId, tierNameFontSize } from "../tier-list-maker-utils";
import styles from "./TierListGraphic.module.css";
import { TierListItemImage } from "./TierListItemImage";

export interface TierListGraphicAuthor {
	username: string;
	discordId: string;
	discordAvatar: string | null;
}

export function TierListGraphic({
	title,
	author,
	tiers,
	showTierHeaders,
}: {
	title: string;
	author?: TierListGraphicAuthor;
	tiers: Array<TierListMakerTier & { items: TierListItem[] }>;
	showTierHeaders: boolean;
}) {
	const { t } = useTranslation(["tier-list-maker"]);

	return (
		<GraphicContainer>
			{title ? <div className={styles.title}>{title}</div> : null}
			{author ? (
				<div className={styles.author}>
					<span className={styles.authorBy}>{t("tier-list-maker:by")}</span>
					<Avatar user={author} size="xxxs" alt="" />
					<span className={styles.authorName}>{author.username}</span>
				</div>
			) : null}
			<div className={styles.tiers}>
				{tiers.map((tier) => (
					<div key={tier.id} className={styles.tierRow}>
						{showTierHeaders ? (
							<div
								className={styles.tierLabel}
								style={{ backgroundColor: tier.color }}
							>
								<span style={{ fontSize: tierNameFontSize(tier.name) }}>
									{tier.name}
								</span>
							</div>
						) : null}
						<div className={styles.tierItems}>
							{tier.items.map((item) => (
								<TierListItemImage key={tierListItemId(item)} item={item} />
							))}
						</div>
					</div>
				))}
			</div>
		</GraphicContainer>
	);
}
