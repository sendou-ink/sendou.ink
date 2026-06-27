import clsx from "clsx";
import { BadgeCheck, Megaphone, NotebookPen, UserPlus } from "lucide-react";
import * as React from "react";
import { Popover } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useFetcher, useMatches } from "react-router";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { Image, TierImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import { MutualFriends } from "~/features/user-page/components/MutualFriends";
import type { BrandId } from "~/modules/in-game-lists/types";
import { assertUnreachable } from "~/utils/types";
import {
	brandImageUrl,
	LFG_PAGE,
	navIconUrl,
	stageBannerImageUrl,
	userCardFriendshipPage,
	userPage,
} from "~/utils/urls";
import type { UserCardFriendshipLoaderData } from "../routes/user-card.$id.friendship";
import type {
	UserCardData,
	UserCardFriendship,
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
 * Hover/focus wrapper that opens a popover with the user's card. Card data is resolved from the
 * route tree by `userId` (a parent loader spreads `{ userCards }` from `UserCardRepository.userCards`);
 * pass `data` directly to bypass the lookup (e.g. the components showcase). When no card data exists
 * for the user, the `children` are rendered plain without a popover.
 *
 * Viewer-relative friendship data (`isFriend` + `mutualFriends`) is lazy-loaded from the
 * `/user-card/:id/friendship` route the first time the card opens.
 */
export function UserCard({
	userId,
	data: dataProp,
	children,
}: {
	userId?: number;
	data?: UserCardData;
	// xxx: should this be a button or not?
	children: React.ReactNode;
}) {
	const lookedUpData = useUserCardData(userId);
	const data = dataProp ?? lookedUpData;

	const triggerRef = React.useRef<HTMLSpanElement>(null);
	const popoverRef = React.useRef<HTMLElement>(null);
	const openTimeout = React.useRef<ReturnType<typeof setTimeout>>(undefined);
	const closeTimeout = React.useRef<ReturnType<typeof setTimeout>>(undefined);
	const lastPointerType =
		React.useRef<React.PointerEvent["pointerType"]>("mouse");
	const [isOpen, setIsOpen] = React.useState(false);
	const [openedByTouch, setOpenedByTouch] = React.useState(false);

	const fetcher = useFetcher<UserCardFriendshipLoaderData>();
	const friendshipLoadedRef = React.useRef(false);

	React.useEffect(() => {
		if (!isOpen) return;
		if (friendshipLoadedRef.current) return;
		if (typeof data?.id !== "number") return;

		friendshipLoadedRef.current = true;
		fetcher.load(userCardFriendshipPage(data.id));
	}, [isOpen, data?.id, fetcher.load]);

	const friendship = fetcher.data;

	// xxx: probably not the play
	React.useEffect(
		() => () => {
			clearTimeout(openTimeout.current);
			clearTimeout(closeTimeout.current);
		},
		[],
	);

	// a non-modal popover does not close on interact outside; for touch-opened cards we close it
	// ourselves so the page stays interactive without making the popover modal (which would steal focus)
	React.useEffect(() => {
		if (!isOpen || !openedByTouch) return;

		const onPointerDownOutside = (event: PointerEvent) => {
			const target = event.target as Node;
			if (triggerRef.current?.contains(target)) return;
			if (popoverRef.current?.contains(target)) return;
			setIsOpen(false);
			setOpenedByTouch(false);
		};

		document.addEventListener("pointerdown", onPointerDownOutside);
		return () =>
			document.removeEventListener("pointerdown", onPointerDownOutside);
	}, [isOpen, openedByTouch]);

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

	const onPointerDown = (event: React.PointerEvent) => {
		lastPointerType.current = event.pointerType;
	};

	const onClick = (event: React.MouseEvent) => {
		if (lastPointerType.current === "mouse") return;
		// on touch/pen open the card instead of activating the child (e.g. following a link)
		event.preventDefault();
		setOpenedByTouch(true);
		setIsOpen((prev) => !prev);
	};

	if (!data) return <>{children}</>;

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: hover/focus/tap wrapper delegating to the interactive child trigger; the card opens on hover/focus (mouse) or tap (touch) */}
			<span
				ref={triggerRef}
				className={styles.triggerWrapper}
				onPointerEnter={onPointerEnter}
				onPointerLeave={onPointerLeave}
				onPointerDown={onPointerDown}
				onClick={onClick}
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
				ref={popoverRef}
				triggerRef={triggerRef}
				isOpen={isOpen}
				onOpenChange={(open) => {
					setIsOpen(open);
					if (!open) setOpenedByTouch(false);
				}}
				isNonModal
				placement="bottom"
				className={styles.popover}
			>
				<CardContent
					data={data}
					friendship={friendship}
					onPointerEnter={cancelClose}
					onPointerLeave={onPointerLeave}
				/>
			</Popover>
		</>
	);
}

/**
 * Resolves a user's `UserCardData` from any matched route loader that spread `{ userCards }`
 * (see `UserCardRepository.userCards`). Returns `undefined` when no loader on the current route
 * tree carries data for the given user.
 */
function useUserCardData(userId: number | undefined): UserCardData | undefined {
	const matches = useMatches();

	if (typeof userId !== "number") return undefined;

	for (const match of matches) {
		const data = match.data as
			| { userCards?: Map<number, UserCardData> }
			| undefined;
		const card = data?.userCards?.get(userId);
		if (card) return card;
	}

	return undefined;
}

function CardContent({
	data,
	friendship,
	onPointerEnter,
	onPointerLeave,
}: {
	data: UserCardData;
	/** Lazy-loaded; `undefined` while the friendship fetch is in flight. */
	friendship: UserCardFriendship | undefined;
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
			{data.isFreeAgent ? (
				<LinkButton
					// xxx: make it scroll to the fa post
					to={LFG_PAGE}
					size="miniscule"
					icon={<Megaphone />}
					className={styles.freeAgentBadge}
				>
					{t("user:card.freeAgent")}
				</LinkButton>
			) : null}
			<div className={styles.iconButtons}>
				{friendship && !friendship.isFriend ? (
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
					{data.customUrl ? (
						<div className={styles.subtitle}>{data.customUrl}</div>
					) : null}
					{data.friendCode ? (
						<span className={styles.friendCode}>SW-{data.friendCode}</span>
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
			<CardMutualFriends friendship={friendship} />
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

/**
 * Mutual friends row with reserved height so the card does not shift when the lazy friendship fetch
 * resolves: empty while loading, "No mutual friends" when there are none, the avatar stack otherwise.
 */
function CardMutualFriends({
	friendship,
}: {
	friendship: UserCardFriendship | undefined;
}) {
	const { t } = useTranslation(["user"]);

	return (
		<div className={styles.mutualFriends}>
			{friendship === undefined ? null : friendship.mutualFriends.length ===
				0 ? (
				<span className={styles.noMutualFriends}>
					{t("user:card.noMutualFriends")}
				</span>
			) : (
				<MutualFriends mutualFriends={friendship.mutualFriends} />
			)}
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
			return <span className={styles.stat}>Div {stat.value}</span>;
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
