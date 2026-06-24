import clsx from "clsx";
import { BadgeCheck, NotebookPen, UserPlus } from "lucide-react";
import * as React from "react";
import { Popover } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { Image, TierImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import { MutualFriends } from "~/features/user-page/components/MutualFriends";
import type { BrandId } from "~/modules/in-game-lists/types";
import { assertUnreachable } from "~/utils/types";
import {
	brandImageUrl,
	navIconUrl,
	stageBannerImageUrl,
	userPage,
} from "~/utils/urls";
import type {
	UserCardData,
	UserCardStat,
	XPDivision,
} from "../user-card-types";
import styles from "./UserCard.module.css";

// xxx: also secondary action? e.g. "View tournament" from sidebar

const HOVER_OPEN_DELAY_MS = 150;
const HOVER_CLOSE_DELAY_MS = 200;

const TENTATEK_BRAND_ID: BrandId = "B10";

const STAT_ORDER: Record<UserCardStat["type"], number> = {
	XP: 0,
	SEASON: 1,
	PLUS: 2,
	DIV: 3,
};

/**
 * xxx: docs here
 */
export function UserCard({
	data,
	children,
}: {
	data: UserCardData;
	// xxx: should this be a button or not?
	children: React.ReactNode;
}) {
	const triggerRef = React.useRef<HTMLSpanElement>(null);
	const openTimeout = React.useRef<ReturnType<typeof setTimeout>>(undefined);
	const closeTimeout = React.useRef<ReturnType<typeof setTimeout>>(undefined);
	const [isOpen, setIsOpen] = React.useState(false);

	// xxx: probably not the play
	React.useEffect(
		() => () => {
			clearTimeout(openTimeout.current);
			clearTimeout(closeTimeout.current);
		},
		[],
	);

	const scheduleOpen = () => {
		clearTimeout(closeTimeout.current);
		openTimeout.current = setTimeout(
			() => setIsOpen(true),
			HOVER_OPEN_DELAY_MS,
		);
	};

	const scheduleClose = () => {
		clearTimeout(openTimeout.current);
		closeTimeout.current = setTimeout(
			() => setIsOpen(false),
			HOVER_CLOSE_DELAY_MS,
		);
	};

	const cancelClose = () => clearTimeout(closeTimeout.current);

	const onPointerEnter = (event: React.PointerEvent) => {
		if (event.pointerType !== "mouse") return;
		scheduleOpen();
	};

	const onPointerLeave = (event: React.PointerEvent) => {
		if (event.pointerType !== "mouse") return;
		scheduleClose();
	};

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: hover/focus wrapper delegating to the interactive child trigger; the card opens on hover/focus */}
			<span
				ref={triggerRef}
				className={styles.triggerWrapper}
				onPointerEnter={onPointerEnter}
				onPointerLeave={onPointerLeave}
				onFocus={() => setIsOpen(true)}
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget)) {
						setIsOpen(false);
					}
				}}
			>
				{children}
			</span>
			<Popover
				triggerRef={triggerRef}
				isOpen={isOpen}
				onOpenChange={setIsOpen}
				isNonModal
				placement="bottom"
				className={styles.popover}
			>
				<CardContent
					data={data}
					onPointerEnter={cancelClose}
					onPointerLeave={onPointerLeave}
				/>
			</Popover>
		</>
	);
}

function CardContent({
	data,
	onPointerEnter,
	onPointerLeave,
}: {
	data: UserCardData;
	onPointerEnter: () => void;
	onPointerLeave: (event: React.PointerEvent) => void;
}) {
	const { t } = useTranslation(["user"]);

	const stats = data.stats.toSorted(
		(a, b) => STAT_ORDER[a.type] - STAT_ORDER[b.type],
	);

	return (
		<div
			className={styles.card}
			style={customThemeStyle(data.customTheme)}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
		>
			<Banner banner={data.banner} />
			<div className={styles.iconButtons}>
				{!data.isFriend ? (
					<SendouButton
						size="miniscule"
						shape="circle"
						icon={<UserPlus />}
						aria-label={t("user:card.sendFriendRequest")}
					/>
				) : null}
				<SendouButton
					size="miniscule"
					shape="circle"
					icon={<NotebookPen />}
					aria-label={t("user:card.editPrivateNote")}
				/>
			</div>
			<div className={styles.identity}>
				<Avatar user={data} size="md" className={styles.avatar} />
				<div className={styles.nameGroup}>
					<h2 className={styles.username}>{data.username}</h2>
					<Subtitle data={data} />
					{data.friendCode ? (
						<span className={styles.friendCode}>{data.friendCode}</span>
					) : (
						/** reserve space */
						<span className={styles.friendCode}>{"\u200b"}</span>
					)}
				</div>
			</div>
			{stats.length > 0 ? (
				<div className={styles.stats}>
					{stats.map((stat, i) => (
						<React.Fragment key={stat.type}>
							{i > 0 ? <span className={styles.statDivider} /> : null}
							<Stat stat={stat} />
						</React.Fragment>
					))}
				</div>
			) : null}
			<MutualFriends mutualFriends={data.mutualFriends} />
			{data.shortBio ? <p className={styles.bio}>{data.shortBio}</p> : null}
			<LinkButton
				to={userPage(data)}
				variant="outlined"
				size="small"
				className={styles.viewUserPage}
			>
				{t("user:card.viewUserPage")}
			</LinkButton>
		</div>
	);
}

function Banner({ banner }: { banner: UserCardData["banner"] }) {
	const style = (() => {
		switch (banner.type) {
			case "STAGE":
				return {
					backgroundImage: `url(${stageBannerImageUrl(banner.stageId)})`,
				};
			case "URL":
				return { backgroundImage: `url(${banner.url})` };
			case "COLOR":
				return { backgroundColor: banner.hexCode };
			default:
				assertUnreachable(banner);
		}
	})();

	return <div className={styles.banner} style={style} />;
}

function Subtitle({ data }: { data: UserCardData }) {
	const parts: Array<string> = [];

	if (data.customUrl) {
		parts.push(data.customUrl);
	}

	if (parts.length === 0) return null;

	return (
		<div className={styles.subtitle}>
			{parts.map((part, i) => (
				<span key={part} className="stack horizontal xs items-center">
					{i > 0 ? <span>·</span> : null}
					{part}
				</span>
			))}
		</div>
	);
}

function Stat({ stat }: { stat: UserCardData["stats"][number] }) {
	const { t } = useTranslation(["user"]);

	switch (stat.type) {
		case "XP": {
			const unverified = stat.values.find((value) => !value.isVerified);
			const verified = stat.values.find((value) => value.isVerified);
			const primary = unverified ?? verified;
			const secondary = unverified ? verified : undefined;

			return (
				<span className={clsx(styles.stat, styles.xpStat)}>
					{primary ? (
						<span className={styles.xpPrimary}>
							{primary.isVerified ? (
								<BadgeCheck className={styles.xpVerifiedIconLarge} />
							) : null}
							<DivImage div={primary.div} />
							{primary.points}
							{t("user:card.xp")}
						</span>
					) : null}
					{secondary ? (
						<span className={styles.xpVerified}>
							<BadgeCheck className={styles.xpVerifiedIconSmall} />
							<DivImage div={secondary.div} />
							{secondary.points}
							{t("user:card.xp")}
						</span>
					) : null}
				</span>
			);
		}
		case "DIV":
			return <span className={styles.stat}>{stat.value}</span>;
		case "PLUS":
			return (
				<span className={clsx(styles.stat, styles.plusStat)}>
					<Image path={navIconUrl("plus")} alt="+" size={24} />
					{stat.value}
				</span>
			);
		case "SEASON":
			return (
				<span className={styles.seasonStat}>
					<TierImage tier={stat.value} width={32} />
					{typeof stat.top === "number" ? (
						<span className={styles.seasonTop}>
							<Placement
								placement={stat.top}
								size={14}
								showAsSuperscript={false}
							/>
						</span>
					) : null}
				</span>
			);
		default:
			assertUnreachable(stat);
	}
}

function DivImage({ div }: { div: XPDivision }) {
	if (div !== "TENTATEK") return null;

	return (
		<Image
			path={brandImageUrl(TENTATEK_BRAND_ID)}
			alt={div}
			width={18}
			height={18}
		/>
	);
}

function customThemeStyle(
	customTheme: UserCardData["customTheme"],
): React.CSSProperties {
	if (!customTheme) return {};

	const style: Record<string, number> = {};
	for (const [key, value] of Object.entries(customTheme)) {
		if (value === null) continue;
		style[key] = value;
	}

	return style as React.CSSProperties;
}
