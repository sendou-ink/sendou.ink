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
import { Button, Dialog, DialogTrigger, Popover } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useFetcher, useLocation, useMatches } from "react-router";
import * as R from "remeda";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { toastQueue } from "~/components/elements/Toast";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image, TierImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { NoteAvatar } from "~/components/NoteAvatar";
import { Placement } from "~/components/Placement";
import type { XRankPlacementRegion } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { MutualFriends } from "~/features/user-page/components/MutualFriends";
import { useLayoutSize } from "~/hooks/useMainContentWidth";
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

const TENTATEK_BRAND_ID: BrandId = "B10";

const STAT_ORDER: Record<UserCardStat["type"], number> = {
	XP: 0,
	SEASON: 1,
	PLUS: 2,
	DIV: 3,
};

/**
 * Click-to-open trigger that shows a popover with the user's card. Card data is resolved from the
 * route tree by `userId` (a parent loader spreads `{ userCards }` from `UserCardRepository.userCards`);
 * pass `data` directly to bypass the lookup (e.g. the components showcase). When no card data exists
 * for the user, the `children` are rendered plain without a trigger.
 *
 * Viewer-relative friendship data (`isFriend`) is lazy-loaded from the `/user-card/:id/friendship`
 * route the first time the card opens. Mutual friends are only fetched and shown when
 * `withMutualFriends` is set (e.g. the SendouQ looking page); other views (e.g. match pages) skip
 * both the extra query and the row.
 */
export function UserCard({
	userId,
	data: dataProp,
	withMutualFriends = false,
	children,
}: {
	userId?: number;
	data?: UserCardData;
	/** Fetch and show the mutual friends row. Off by default. */
	withMutualFriends?: boolean;
	children: React.ReactNode;
}) {
	const { t } = useTranslation(["common", "q"]);
	const lookedUpData = useUserCardData(userId);
	const data = dataProp ?? lookedUpData;

	// beside the trigger there is no room for the card on a narrow viewport, so it is placed
	// vertically instead where React Aria can shift it horizontally to keep it on-screen
	const placement = useLayoutSize() === "mobile" ? "bottom" : "right";

	const user = useUser();
	const isOwnCard = user?.id === data?.id;

	const [isOpen, setIsOpen] = React.useState(false);
	// kept at this level (outside the popover) so the modals survive the popover closing when they
	// take focus; the note view inside the card opens them
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
		fetcher.load(userCardFriendshipPage(data.id, { withMutualFriends }));
	}, [isOpen, isOwnCard, data?.id, withMutualFriends, fetcher.load]);

	const friendship = fetcher.data;

	// close the popover so only the modal is shown
	const openNoteDialog = () => {
		setIsOpen(false);
		setIsNoteDialogOpen(true);
	};

	const openDeleteConfirm = () => {
		setIsOpen(false);
		setIsDeleteConfirmOpen(true);
	};

	if (!data) return <>{children}</>;

	return (
		<>
			<DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
				<Button className={styles.trigger}>{children}</Button>
				<Popover placement={placement} className={styles.popover}>
					<Dialog className={styles.dialog}>
						<CardContent
							data={data}
							friendship={friendship}
							isOwnCard={isOwnCard}
							withMutualFriends={withMutualFriends}
							onEditNote={openNoteDialog}
							onDeleteNote={openDeleteConfirm}
						/>
					</Dialog>
				</Popover>
			</DialogTrigger>
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
		const data = match.loaderData as
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
	withMutualFriends,
	onEditNote,
	onDeleteNote,
}: {
	data: UserCardData;
	/** Lazy-loaded; `undefined` while the friendship fetch is in flight. */
	friendship: UserCardFriendship | undefined;
	isOwnCard: boolean;
	withMutualFriends: boolean;
	onEditNote: () => void;
	onDeleteNote: () => void;
}) {
	const { t } = useTranslation(["common", "user"]);
	const location = useLocation();

	const [isNoteOpen, setIsNoteOpen] = React.useState(false);

	const stats = data.stats.toSorted(
		(a, b) => STAT_ORDER[a.type] - STAT_ORDER[b.type],
	);

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
			data-custom-theme={data.customTheme ? true : undefined}
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
								sentFriendRequest={friendship.sentFriendRequest}
								incomingFriendRequestId={friendship.incomingFriendRequestId}
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
					{isOwnCard || !withMutualFriends ? null : (
						<CardMutualFriends friendship={friendship} />
					)}
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
			<div className={styles.noteHeaderGroup}>
				<span className={styles.noteHeader}>{t("user:card.privateNote")}</span>
				{note ? (
					<LocaleTime
						date={note.updatedAt}
						options={{ day: "numeric", month: "numeric", year: "numeric" }}
						className={styles.noteDate}
						inline
					/>
				) : null}
			</div>
			{note?.text ? <p className={styles.noteText}>{note.text}</p> : null}
			<div className={styles.noteViewActions}>
				<SendouButton
					variant="minimal"
					size="miniscule"
					icon={<Pencil />}
					onPress={onEdit}
				>
					{t("common:actions.edit")}
				</SendouButton>
				<SendouButton
					variant="minimal-destructive"
					size="miniscule"
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
 * Friend request action on the card, submitting to the `/friends` route action. Normally sends a
 * request and shows a checkmark once one is pending (server-known or just sent); when the shown
 * user has already sent the viewer a request, the same add-friend press accepts it instead.
 * Cancelling a pending request is done on the `/friends` page.
 */
function FriendRequestButton({
	targetUserId,
	sentFriendRequest,
	incomingFriendRequestId,
}: {
	targetUserId: number;
	sentFriendRequest: boolean;
	incomingFriendRequestId: number | null;
}) {
	const { t } = useTranslation(["user"]);
	const fetcher = useFetcher();
	const previousStateRef = React.useRef(fetcher.state);
	const acceptsIncomingRequest = incomingFriendRequestId !== null;

	// Sending a request keeps this button mounted (it becomes the pending checkmark), so the
	// success toast can wait for the server round-trip here. The accept path instead unmounts the
	// button as soon as the revalidated friendship data arrives, which can race the toast render,
	// so that toast is fired directly from the press handler below.
	React.useEffect(() => {
		if (
			!acceptsIncomingRequest &&
			previousStateRef.current === "submitting" &&
			fetcher.state !== "submitting" &&
			fetcher.data === null
		) {
			toastQueue.add(
				{ message: t("user:card.friendRequestSent"), variant: "success" },
				{ timeout: 5000 },
			);
		}
		previousStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data, acceptsIncomingRequest, t]);

	if (acceptsIncomingRequest) {
		return (
			<SendouButton
				size="miniscule"
				shape="circle"
				icon={<UserPlus />}
				isDisabled={fetcher.state !== "idle" || fetcher.data === null}
				aria-label="Accept friend request"
				onPress={() => {
					toastQueue.add(
						{
							message: t("user:card.friendRequestAccepted"),
							variant: "success",
						},
						{ timeout: 5000 },
					);
					fetcher.submit(
						{
							_action: "ACCEPT_REQUEST",
							friendRequestId: incomingFriendRequestId,
						},
						{ method: "post", action: FRIENDS_PAGE },
					);
				}}
			/>
		);
	}

	const requestPending =
		sentFriendRequest || fetcher.state !== "idle" || fetcher.data === null;

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
				<MutualFriends
					mutualFriends={friendship.mutualFriends}
					withoutPopover
				/>
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

	return (
		<div
			className={styles.banner}
			style={style}
			data-testid="user-card-banner"
		/>
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

	return R.pickBy(
		customTheme,
		(value, key) =>
			value !== null && !key.includes("--_size") && !key.includes("--_border"),
	) as React.CSSProperties;
}
