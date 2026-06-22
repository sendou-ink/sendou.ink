import { NotebookPen, UserPlus } from "lucide-react";
import * as React from "react";
import { Popover } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { TierImage } from "~/components/Image";
import { MutualFriends } from "~/features/user-page/components/MutualFriends";
import { assertUnreachable } from "~/utils/types";
import { stageBannerImageUrl, userPage } from "~/utils/urls";
import type { UserCardData } from "../user-card-types";
import styles from "./UserCard.module.css";

// xxx: also secondary action? e.g. "View tournament" from sidebar

const HOVER_OPEN_DELAY_MS = 150;
const HOVER_CLOSE_DELAY_MS = 200;

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
						variant="outlined"
						size="small"
						shape="circle"
						icon={<UserPlus />}
						aria-label={t("user:card.sendFriendRequest")}
					/>
				) : null}
				<SendouButton
					variant="outlined"
					size="small"
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
					) : null}
				</div>
			</div>
			{data.stats.length > 0 ? (
				<div className={styles.stats}>
					{data.stats.map((stat, i) => (
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

	if (data.pronouns) {
		parts.push(`${data.pronouns.subject}/${data.pronouns.object}`);
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
		case "XP":
			return (
				<span className={styles.stat}>
					{stat.values.map((value) => value.points).join(" / ")}
					{t("user:card.xp")}
				</span>
			);
		case "DIV":
			return <span className={styles.stat}>{stat.value}</span>;
		case "PLUS":
			return <span className={styles.stat}>{stat.value}</span>;
		case "SEASON":
			return <TierImage tier={stat.value} width={32} />;
		default:
			assertUnreachable(stat);
	}
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
