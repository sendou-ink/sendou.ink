import clsx from "clsx";
import {
	BadgeCheck,
	Megaphone,
	NotebookPen,
	NotebookText,
	Pencil,
	Trash2,
	UserPlus,
	UserRoundCheck,
} from "lucide-react";
import * as React from "react";
import { Popover } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useFetcher, useLocation, useMatches } from "react-router";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { toastQueue } from "~/components/elements/Toast";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image, TierImage } from "~/components/Image";
import { NoteAvatar } from "~/components/NoteAvatar";
import { Placement } from "~/components/Placement";
import type { XRankPlacementRegion } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { MutualFriends } from "~/features/user-page/components/MutualFriends";
import type { BrandId } from "~/modules/in-game-lists/types";
import { assertUnreachable } from "~/utils/types";
import {
	brandImageUrl,
	FRIENDS_PAGE,
	LFG_PAGE,
	navIconUrl,
	stageBannerImageUrl,
	userCardEditPage,
	userCardFriendshipPage,
	userCardNotePage,
	userPage,
} from "~/utils/urls";
import type { UserCardFriendshipLoaderData } from "../routes/user-card.$id.friendship";
import type {
	UserCardData,
	UserCardFriendship,
	UserCardStat,
} from "../user-card-types";
import { AddPrivateNoteDialog } from "./AddPrivateNoteDialog";
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
	const { t } = useTranslation(["common", "q"]);
	const lookedUpData = useUserCardData(userId);
	const data = dataProp ?? lookedUpData;

	const user = useUser();
	const isOwnCard = user?.id === data?.id;

	const triggerRef = React.useRef<HTMLSpanElement>(null);
	const popoverRef = React.useRef<HTMLElement>(null);
	const openTimeout = React.useRef<ReturnType<typeof setTimeout>>(undefined);
	const closeTimeout = React.useRef<ReturnType<typeof setTimeout>>(undefined);
	const lastPointerType =
		React.useRef<React.PointerEvent["pointerType"]>("mouse");
	const [isOpen, setIsOpen] = React.useState(false);
	const [openedByTouch, setOpenedByTouch] = React.useState(false);
	// kept at this level (outside the hover popover) so the modals survive the popover closing
	// when they take focus; the note view inside the card opens them
	const [isNoteDialogOpen, setIsNoteDialogOpen] = React.useState(false);
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

	const fetcher = useFetcher<UserCardFriendshipLoaderData>();
	const friendshipLoadedRef = React.useRef(false);

	React.useEffect(() => {
		if (!isOpen) return;
		if (friendshipLoadedRef.current) return;
		if (isOwnCard) return;
		if (typeof data?.id !== "number") return;

		friendshipLoadedRef.current = true;
		fetcher.load(userCardFriendshipPage(data.id));
	}, [isOpen, isOwnCard, data?.id, fetcher.load]);

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
		// A full-page view transition (e.g. a toast animating in) momentarily swaps the
		// live DOM for snapshot pseudo-elements, firing a spurious pointerleave even though
		// the cursor never moved. Ignore leaves whose coordinates are still over the trigger
		// or popover so the card does not close itself when a toast appears.
		if (
			pointerWithin(triggerRef.current, event) ||
			pointerWithin(popoverRef.current, event)
		) {
			return;
		}
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

	// close the hover popover so only the modal is shown
	const closePopover = () => {
		clearTimeout(openTimeout.current);
		clearTimeout(closeTimeout.current);
		setIsOpen(false);
		setOpenedByTouch(false);
	};

	const openNoteDialog = () => {
		closePopover();
		setIsNoteDialogOpen(true);
	};

	const openDeleteConfirm = () => {
		closePopover();
		setIsDeleteConfirmOpen(true);
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
					isOwnCard={isOwnCard}
					onEditNote={openNoteDialog}
					onDeleteNote={openDeleteConfirm}
					onPointerEnter={cancelClose}
					onPointerLeave={onPointerLeave}
				/>
			</Popover>
			{isNoteDialogOpen ? (
				<AddPrivateNoteDialog
					userId={data.id}
					username={data.username}
					note={data.privateNote}
					onClose={() => setIsNoteDialogOpen(false)}
				/>
			) : null}
			<FormWithConfirm
				isOpen={isDeleteConfirmOpen}
				onOpenChange={setIsDeleteConfirmOpen}
				action={userCardNotePage(data.id)}
				fields={[["_action", "DELETE"]]}
				dialogHeading={t("q:privateNote.delete.header", {
					name: data.username,
				})}
				submitButtonText={t("common:actions.delete")}
			/>
		</>
	);
}

function pointerWithin(
	element: HTMLElement | null,
	event: React.PointerEvent,
): boolean {
	if (!element) return false;
	const rect = element.getBoundingClientRect();
	return (
		event.clientX >= rect.left &&
		event.clientX <= rect.right &&
		event.clientY >= rect.top &&
		event.clientY <= rect.bottom
	);
}

/**
 * Resolves a user's `UserCardData` from any matched route loader that spread `{ userCards }`
 * (see `UserCardRepository.userCards`). Returns `undefined` when no loader on the current route
 * tree carries data for the given user.
 */
export function useUserCardData(
	userId: number | undefined,
): UserCardData | undefined {
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
	isOwnCard,
	onEditNote,
	onDeleteNote,
	onPointerEnter,
	onPointerLeave,
}: {
	data: UserCardData;
	/** Lazy-loaded; `undefined` while the friendship fetch is in flight. */
	friendship: UserCardFriendship | undefined;
	isOwnCard: boolean;
	onEditNote: () => void;
	onDeleteNote: () => void;
	onPointerEnter: () => void;
	onPointerLeave: (event: React.PointerEvent) => void;
}) {
	const { t } = useTranslation(["common", "user"]);
	const location = useLocation();

	const [isNoteOpen, setIsNoteOpen] = React.useState(false);

	const stats = data.stats
		.filter((stat) => !data.hiddenStats.includes(stat.type))
		.toSorted((a, b) => STAT_ORDER[a.type] - STAT_ORDER[b.type]);

	const editPageUrl = userCardEditPage({
		returnTo: `${location.pathname}${location.search}`,
	});

	// an existing note shows in-place (toggled); with no note the button opens the add modal directly
	const showNoteView = isNoteOpen && data.privateNote !== null;
	const onNoteButtonPress = () => {
		if (data.privateNote === null) {
			onEditNote();
			return;
		}
		setIsNoteOpen((prev) => !prev);
	};

	return (
		<div
			className={styles.card}
			style={customThemeStyle(data.customTheme)}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
		>
			<Banner banner={data.banner} />
			{data.freeAgentPostId !== null ? (
				<LinkButton
					to={`${LFG_PAGE}#${data.freeAgentPostId}`}
					size="miniscule"
					icon={<Megaphone />}
					className={styles.freeAgentBadge}
				>
					{t("user:card.freeAgent")}
				</LinkButton>
			) : null}
			<div className={styles.iconButtons}>
				{isOwnCard ? (
					<LinkButton to={editPageUrl} size="miniscule" icon={<Pencil />}>
						{t("common:actions.edit")}
					</LinkButton>
				) : (
					<>
						{friendship && !friendship.isFriend ? (
							<FriendRequestButton
								targetUserId={data.id}
								hasPendingFriendRequest={friendship.hasPendingFriendRequest}
							/>
						) : null}
						<SendouButton
							size="miniscule"
							shape="circle"
							icon={
								data.privateNote !== null ? <NotebookText /> : <NotebookPen />
							}
							onPress={onNoteButtonPress}
							aria-label={t("user:card.editPrivateNote")}
						/>
					</>
				)}
			</div>
			<div className={styles.identity}>
				<NoteAvatar sentiment={data.privateNote?.sentiment}>
					<Avatar user={data} size="md" className={styles.avatar} />
				</NoteAvatar>
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
			{showNoteView ? (
				<NoteView
					note={data.privateNote}
					onEdit={onEditNote}
					onDelete={onDeleteNote}
				/>
			) : (
				<>
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
					{isOwnCard ? null : <CardMutualFriends friendship={friendship} />}
					{data.shortBio ? <p className={styles.bio}>{data.shortBio}</p> : null}
					<LinkButton
						to={userPage(data)}
						variant="outlined"
						size="small"
						className={styles.viewUserPage}
					>
						{t("user:card.viewUserPage")}
					</LinkButton>
				</>
			)}
		</div>
	);
}

function NoteView({
	note,
	onEdit,
	onDelete,
}: {
	note: UserCardData["privateNote"];
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation(["common", "user"]);

	return (
		<div className={styles.noteView}>
			<span className={styles.noteHeader}>{t("user:card.privateNote")}</span>
			{note?.text ? <p className={styles.noteText}>{note.text}</p> : null}
			<div className={styles.noteViewActions}>
				<SendouButton
					variant="minimal"
					size="small"
					icon={<Pencil />}
					onPress={onEdit}
				>
					{t("common:actions.edit")}
				</SendouButton>
				<SendouButton
					variant="minimal-destructive"
					size="small"
					icon={<Trash2 />}
					onPress={onDelete}
				>
					{t("common:actions.delete")}
				</SendouButton>
			</div>
		</div>
	);
}

/**
 * Send friend request action on the card. Submits to the `/friends` route action and shows a
 * checkmark once a request is pending (server-known or just sent). Cancelling a pending request
 * is done on the `/friends` page.
 */
// xxx: better pending
function FriendRequestButton({
	targetUserId,
	hasPendingFriendRequest,
}: {
	targetUserId: number;
	hasPendingFriendRequest: boolean;
}) {
	const { t } = useTranslation(["user"]);
	const fetcher = useFetcher();
	const previousStateRef = React.useRef(fetcher.state);

	React.useEffect(() => {
		if (
			previousStateRef.current !== "idle" &&
			fetcher.state === "idle" &&
			fetcher.data === null
		) {
			toastQueue.add(
				{
					message: t("user:card.friendRequestSent"),
					variant: "success",
				},
				{ timeout: 5000 },
			);
		}
		previousStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data, t]);

	const requestPending =
		hasPendingFriendRequest ||
		fetcher.state !== "idle" ||
		fetcher.data === null;

	if (requestPending) {
		return (
			<SendouButton
				size="miniscule"
				shape="circle"
				icon={<UserRoundCheck />}
				isDisabled
				aria-label={t("user:card.friendRequestPending")}
			/>
		);
	}

	return (
		<SendouButton
			size="miniscule"
			shape="circle"
			icon={<UserPlus />}
			aria-label={t("user:card.sendFriendRequest")}
			onPress={() =>
				fetcher.submit(
					{ _action: "SEND_REQUEST", userId: targetUserId },
					{ method: "post", action: FRIENDS_PAGE },
				)
			}
		/>
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
							<DivImage region={primary.region} />
							{primary.points}
							{t("user:card.xp")}
						</span>
					) : null}
					{secondary ? (
						<span className={styles.xpVerified}>
							<BadgeCheck className={styles.xpVerifiedIconSmall} />
							<DivImage region={secondary.region} />
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

function DivImage({ region }: { region: XRankPlacementRegion }) {
	const { t } = useTranslation(["common"]);

	if (region !== "WEST") return null;

	return (
		<Image
			path={brandImageUrl(TENTATEK_BRAND_ID)}
			alt={t("common:divisions.WEST")}
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
