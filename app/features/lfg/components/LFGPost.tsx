import clsx from "clsx";
import { HardDriveDownload, SquarePen, Trash } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { Flag } from "~/components/Flag";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { WeaponImage } from "~/components/Image";
import {
	LFGPostGraphic,
	lfgPostGraphicPath,
} from "~/components/LFGPostGraphic";
import { LocaleTime } from "~/components/LocaleTime";
import { NoteAvatar } from "~/components/NoteAvatar";
import { ImageExportDialog } from "~/features/img-export/components/ImageExportDialog";
import { lfgNewPostPage } from "~/features/lfg/lfg-urls";
import {
	UserCard,
	useUserCardData,
} from "~/features/user-card/components/UserCard";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { useHydrated } from "~/hooks/useHydrated";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import { useHasPermission } from "~/modules/permissions/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { hourDifferenceBetweenTimezones } from "../core/timezone";
import type { LFGLoaderData } from "../routes/lfg";

import styles from "./LFGPost.module.css";

type Post = LFGLoaderData["posts"][number];

/** Keep in sync with `.textCollapsed` max-height */
const COLLAPSED_TEXT_HEIGHT = 150;
/** Server-side guess of whether the text gets clipped, corrected by measuring once mounted */
const CLIPPED_TEXT_GUESS = { length: 300, lines: 6 };

export function LFGPost({ post }: { post: Post }) {
	if (post.team) {
		return <TeamLFGPost post={{ ...post, team: post.team }} />;
	}

	return <UserLFGPost post={post} />;
}

function UserLFGPost({ post }: { post: Post }) {
	const canEdit = useHasPermission(post, "EDIT");
	const canDelete = useHasPermission(post, "DELETE");
	const [isExpanded, setIsExpanded] = React.useState(false);

	return (
		<div className={styles.wideLayout}>
			<div className={styles.leftRow}>
				<PostUserHeader
					author={post.author}
					includeWeapons={post.type !== "COACH_FOR_TEAM"}
				/>
				<PostTime createdAt={post.createdAt} updatedAt={post.updatedAt} />
				<PostPills
					languages={post.languages}
					timezone={post.timezone}
					canEdit={canEdit}
					post={post}
				/>
			</div>
			<div>
				<div className="stack horizontal justify-between items-center">
					<PostTextTypeHeader type={post.type} />
					{canDelete ? (
						<PostDeleteButton id={post.id} type={post.type} />
					) : null}
				</div>
				<PostExpandableText
					text={post.text}
					isExpanded={isExpanded}
					setIsExpanded={setIsExpanded}
				/>
			</div>
		</div>
	);
}

function TeamLFGPost({
	post,
}: {
	post: Post & { team: NonNullable<Post["team"]> };
}) {
	const isHydrated = useHydrated();
	const canEdit = useHasPermission(post, "EDIT");
	const canDelete = useHasPermission(post, "DELETE");
	const [isExpanded, setIsExpanded] = React.useState(false);

	return (
		<div className={styles.wideLayout}>
			<div className="stack md">
				<div className="stack xs">
					<div className="stack horizontal sm items-center justify-between flex-wrap">
						<PostTeamLogoHeader team={post.team} />
						<div className="stack horizontal items-center sm flex-wrap">
							{isHydrated ? (
								<PostTimezonePill timezone={post.timezone} />
							) : null}
							{post.languages ? (
								<PostLanguagePill languages={post.languages} />
							) : null}
						</div>
					</div>
					<Divider />
					<div className="stack horizontal sm justify-between items-center flex-wrap">
						<PostTime createdAt={post.createdAt} updatedAt={post.updatedAt} />
						{canEdit ? (
							<div className="stack horizontal sm items-center flex-wrap justify-end">
								<PostImageExportDialog post={post} />
								<PostEditButton id={post.id} />
							</div>
						) : null}
					</div>
				</div>
				{isExpanded ? (
					<PostTeamMembersFull team={post.team} />
				) : (
					<PostTeamMembersPeek team={post.team} />
				)}
			</div>
			<div>
				<div className="stack horizontal justify-between">
					<PostTextTypeHeader type={post.type} />
					{canDelete ? (
						<PostDeleteButton id={post.id} type={post.type} />
					) : null}
				</div>
				<PostExpandableText
					text={post.text}
					isExpanded={isExpanded}
					setIsExpanded={setIsExpanded}
					alwaysExpandable
				/>
			</div>
		</div>
	);
}

function PostTeamLogoHeader({ team }: { team: NonNullable<Post["team"]> }) {
	return (
		<div className="stack horizontal sm items-center font-bold">
			{team.avatarUrl ? <Avatar size="xs" url={team.avatarUrl} /> : null}
			{team.name}
		</div>
	);
}

function PostTeamMembersPeek({ team }: { team: NonNullable<Post["team"]> }) {
	return (
		<div className="stack sm xs-row horizontal flex-wrap">
			{team.members.map((member) => (
				<PostTeamMember key={member.id} member={member} />
			))}
		</div>
	);
}

function PostTeamMembersFull({ team }: { team: NonNullable<Post["team"]> }) {
	return (
		<div className="stack lg">
			{team.members.map((member) => (
				<PostUserHeader key={member.id} author={member} includeWeapons />
			))}
		</div>
	);
}

function PostTeamMember({
	member,
}: {
	member: NonNullable<Post["team"]>["members"][number];
}) {
	const cardData = useUserCardData(member.id);

	return (
		<div className={clsx("stack sm items-center", styles.teamMember)}>
			<UserCard userId={member.id} withMutualFriends>
				<span className="stack sm items-center">
					<NoteAvatar sentiment={cardData?.privateNote?.sentiment} size="sm">
						<Avatar size="xs" user={member} />
					</NoteAvatar>
					<span className={styles.teamMemberName}>{member.username}</span>
				</span>
			</UserCard>
		</div>
	);
}

function PostUserHeader({
	author,
	includeWeapons,
}: {
	author: Post["author"];
	includeWeapons: boolean;
}) {
	const cardData = useUserCardData(author.id);

	return (
		<div className="stack sm">
			<div className="stack sm horizontal items-center">
				<div className="stack horizontal sm items-center text-md font-bold">
					<UserCard userId={author.id} withMutualFriends>
						<span className="stack sm horizontal items-center">
							<NoteAvatar
								sentiment={cardData?.privateNote?.sentiment}
								size="md"
							>
								<Avatar size="xsm" user={author} />
							</NoteAvatar>
							<span className={styles.userName}>{author.username}</span>
						</span>
					</UserCard>{" "}
					{author.country ? <Flag countryCode={author.country} tiny /> : null}
				</div>
			</div>
			{includeWeapons ? (
				<div className="stack horizontal sm">
					{author.weaponPool.map((weapon) => (
						<WeaponImage key={weapon.weaponSplId} weapon={weapon} size={32} />
					))}
				</div>
			) : null}
		</div>
	);
}

function PostTime({
	createdAt,
	updatedAt,
}: {
	createdAt: number;
	updatedAt: number;
}) {
	const { t } = useTranslation(["lfg"]);
	const formatDistanceToNow = useFormatDistanceToNow();

	const createdAtDate = databaseTimestampToDate(createdAt);
	const updatedAtDate = databaseTimestampToDate(updatedAt);
	const overDayDifferenceBetween =
		updatedAtDate.getTime() - createdAtDate.getTime() > 1000 * 60 * 60 * 24;

	return (
		<div className="text-lighter text-xs font-bold">
			<LocaleTime
				date={createdAtDate}
				options={{
					month: "numeric",
					day: "numeric",
				}}
			/>{" "}
			{overDayDifferenceBetween ? (
				<div className="text-xxs">
					<i>
						({t("lfg:post.lastActive")}{" "}
						{formatDistanceToNow(updatedAtDate, {
							addSuffix: true,
						})}
						)
					</i>
				</div>
			) : null}
		</div>
	);
}

function PostPills({
	timezone,
	languages,
	canEdit,
	post,
}: {
	timezone?: string | null;
	languages?: UnifiedLanguageCode[] | null;
	canEdit?: boolean;
	post: Post;
}) {
	const isHydrated = useHydrated();

	return (
		<div
			className={clsx("stack sm xs-row horizontal flex-wrap", {
				invisible: !isHydrated,
			})}
		>
			{typeof timezone === "string" && isHydrated ? (
				<PostTimezonePill timezone={timezone} />
			) : null}
			{!isHydrated ? <PostTimezonePillPlaceholder /> : null}
			{languages ? <PostLanguagePill languages={languages} /> : null}
			{canEdit ? <PostImageExportDialog post={post} /> : null}
			{canEdit ? <PostEditButton id={post.id} /> : null}
		</div>
	);
}

function PostTimezonePillPlaceholder() {
	return <div className={clsx(styles.pill, styles.pillPlaceholder)} />;
}

function PostTimezonePill({ timezone }: { timezone: string }) {
	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const diff = hourDifferenceBetweenTimezones(userTimezone, timezone);

	const textColorClass = () => {
		const absDiff = Math.abs(diff);

		if (absDiff <= 3) {
			return "text-success";
		}
		if (absDiff <= 6) {
			return "text-warning";
		}
		return "text-error";
	};

	return (
		<div title={timezone} className={clsx(styles.pill, textColorClass())}>
			{diff === 0 ? "±" : ""}
			{diff > 0 ? "+" : ""}
			{diff}h
		</div>
	);
}

function PostLanguagePill({ languages }: { languages: UnifiedLanguageCode[] }) {
	return (
		<div className={styles.pill}>{languages.join(" / ").toUpperCase()}</div>
	);
}

function PostTextTypeHeader({ type }: { type: Post["type"] }) {
	const { t } = useTranslation(["lfg"]);

	return (
		<div className="text-xs text-lighter font-bold">
			{t(`lfg:types.${type}`)}
		</div>
	);
}

function PostEditButton({ id }: { id: number }) {
	const { t } = useTranslation(["common"]);

	return (
		<Link className={styles.editButton} to={lfgNewPostPage(id)}>
			<SquarePen />
			{t("common:actions.edit")}
		</Link>
	);
}

function PostImageExportDialog({ post }: { post: Post }) {
	const { t } = useTranslation(["common"]);

	return (
		<ImageExportDialog
			trigger={
				<button type="button" className={styles.editButton}>
					<HardDriveDownload />
					{t("common:imageExport.export")}
				</button>
			}
			heading={t("common:imageExport.export")}
			filename={`lfg-post-${post.id}`}
			qrCodePath={lfgPostGraphicPath(post.id)}
		>
			<LFGPostGraphic post={post} />
		</ImageExportDialog>
	);
}

function PostDeleteButton({ id, type }: { id: number; type: Post["type"] }) {
	const fetcher = useFetcher();
	const { t } = useTranslation(["common", "lfg"]);

	return (
		<FormWithConfirm
			dialogHeading={`Delete post (${(t(`lfg:types.${type}`) as any).toLowerCase()})?`}
			fields={[
				["id", id],
				["_action", "DELETE_POST"],
			]}
			fetcher={fetcher}
		>
			<SendouButton
				className="small-text"
				variant="minimal-destructive"
				size="small"
				type="submit"
				icon={<Trash />}
			>
				{t("common:actions.delete")}
			</SendouButton>
		</FormWithConfirm>
	);
}

function PostExpandableText({
	text,
	isExpanded,
	setIsExpanded,
	alwaysExpandable = false,
}: {
	text: string;
	isExpanded: boolean;
	setIsExpanded: (isExpanded: boolean) => void;
	/** Keeps the button even when the text fits, for expanding content outside the text (team roster) */
	alwaysExpandable?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const [isClipped, setIsClipped] = React.useState(
		() =>
			text.length > CLIPPED_TEXT_GUESS.length ||
			text.split("\n").length > CLIPPED_TEXT_GUESS.lines,
	);

	const measureText = (element: HTMLDivElement | null) => {
		if (!element) return;

		const observer = new ResizeObserver(() => {
			setIsClipped(element.offsetHeight > COLLAPSED_TEXT_HEIGHT);
		});
		observer.observe(element);

		return () => observer.disconnect();
	};

	const showButton = isClipped || alwaysExpandable;
	const isTextCollapsed = isClipped && !isExpanded;

	return (
		<div
			className={clsx(styles.textContainer, {
				[styles.textCollapsed]: isTextCollapsed,
				[styles.textWithButtonBelow]: showButton && !isTextCollapsed,
			})}
		>
			<div ref={measureText} className={styles.text}>
				{text}
			</div>
			{showButton ? (
				<SendouButton
					onClick={() => setIsExpanded(!isExpanded)}
					className={clsx(styles.showAllButton, {
						[styles.showAllButtonBelow]: !isTextCollapsed,
					})}
					variant="outlined"
					size="small"
				>
					{isExpanded
						? t("common:actions.showLess")
						: t("common:actions.showMore")}
				</SendouButton>
			) : null}
			{isTextCollapsed ? <div className={styles.textCut} /> : null}
		</div>
	);
}
