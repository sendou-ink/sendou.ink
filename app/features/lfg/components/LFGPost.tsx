import { Link, useFetcher } from "@remix-run/react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { Flag } from "~/components/Flag";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image, TierImage, WeaponImage } from "~/components/Image";
import { EditIcon } from "~/components/icons/Edit";
import { TrashIcon } from "~/components/icons/Trash";
import { useUser } from "~/features/auth/core/user";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useHasRole } from "~/modules/permissions/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { lfgNewPostPage, navIconUrl, userPage } from "~/utils/urls";
import { userSubmittedImage } from "~/utils/urls-img";
import { hourDifferenceBetweenTimezones } from "../core/timezone";
import type { LFGLoaderData, TiersMap } from "../routes/lfg";

import styles from "./LFGPost.module.css";

type Post = LFGLoaderData["posts"][number];

export function LFGPost({
	post,
	tiersMap,
}: {
	post: Post;
	tiersMap: TiersMap;
}) {
	if (post.team) {
		return (
			<TeamLFGPost post={{ ...post, team: post.team }} tiersMap={tiersMap} />
		);
	}

	return <UserLFGPost post={post} tiersMap={tiersMap} />;
}

const USER_POST_EXPANDABLE_CRITERIA = 300;
function UserLFGPost({ post, tiersMap }: { post: Post; tiersMap: TiersMap }) {
	const user = useUser();
	const isAdmin = useHasRole("ADMIN");
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
					languages={post.author.languages}
					plusTier={post.author.plusTier}
					timezone={post.timezone}
					tiers={
						post.type !== "COACH_FOR_TEAM"
							? tiersMap.get(post.author.id)
							: undefined
					}
					canEdit={post.author.id === user?.id}
					postId={post.id}
				/>
			</div>
			<div>
				<div className="stack horizontal justify-between">
					<PostTextTypeHeader type={post.type} />
					{post.author.id === user?.id || isAdmin ? (
						<PostDeleteButton id={post.id} type={post.type} />
					) : null}
				</div>
				<PostExpandableText
					text={post.text}
					isExpanded={isExpanded}
					setIsExpanded={setIsExpanded}
					expandableCriteria={USER_POST_EXPANDABLE_CRITERIA}
				/>
			</div>
		</div>
	);
}

function TeamLFGPost({
	post,
	tiersMap,
}: {
	post: Post & { team: NonNullable<Post["team"]> };
	tiersMap: TiersMap;
}) {
	const isMounted = useIsMounted();
	const user = useUser();
	const isAdmin = useHasRole("ADMIN");
	const [isExpanded, setIsExpanded] = React.useState(false);

	return (
		<div className={styles.wideLayout}>
			<div className="stack md">
				<div className="stack xs">
					<div className="stack horizontal items-center justify-between">
						<PostTeamLogoHeader team={post.team} />
						{isMounted && <PostTimezonePill timezone={post.timezone} />}
					</div>
					<Divider />
					<div className="stack horizontal justify-between">
						<PostTime createdAt={post.createdAt} updatedAt={post.updatedAt} />
						{post.author.id === user?.id ? (
							<PostEditButton id={post.id} />
						) : null}
					</div>
				</div>
				{isExpanded ? (
					<PostTeamMembersFull
						team={post.team}
						tiersMap={tiersMap}
						postId={post.id}
					/>
				) : (
					<PostTeamMembersPeek team={post.team} tiersMap={tiersMap} />
				)}
			</div>
			<div>
				<div className="stack horizontal justify-between">
					<PostTextTypeHeader type={post.type} />
					{post.author.id === user?.id || isAdmin ? (
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

function PostTeamLogoHeader({ team }: { team: NonNullable<Post["team"]> }) {
	return (
		<div className="stack horizontal sm items-center font-bold">
			{team.avatarUrl ? (
				<Avatar size="xs" url={userSubmittedImage(team.avatarUrl)} />
			) : null}
			{team.name}
		</div>
	);
}

function PostTeamMembersPeek({
	team,
	tiersMap,
}: {
	team: NonNullable<Post["team"]>;
	tiersMap: TiersMap;
}) {
	return (
		<div className="stack sm xs-row horizontal flex-wrap">
			{team.members.map((member) => (
				<PostTeamMember key={member.id} member={member} tiersMap={tiersMap} />
			))}
		</div>
	);
}

function PostTeamMembersFull({
	team,
	tiersMap,
	postId,
}: {
	team: NonNullable<Post["team"]>;
	tiersMap: TiersMap;
	postId: number;
}) {
	return (
		<div className="stack lg">
			{team.members.map((member) => (
				<div key={member.id} className="stack sm">
					<PostUserHeader author={member} includeWeapons />
					<PostPills
						languages={member.languages}
						plusTier={member.plusTier}
						tiers={tiersMap.get(member.id)}
						postId={postId}
					/>
				</div>
			))}
		</div>
	);
}

function PostTeamMember({
	member,
	tiersMap,
}: {
	member: NonNullable<Post["team"]>["members"][number];
	tiersMap: TiersMap;
}) {
	const tiers = tiersMap.get(member.id);
	const tier = tiers?.latest ?? tiers?.previous;

	return (
		<div className="stack sm items-center flex-same-size">
			<div className="stack sm items-center">
				<Avatar size="xs" user={member} />
				<Link to={userPage(member)} className={styles.teamMemberName}>
					{member.username}
				</Link>
				{tier ? <TierImage tier={tier} width={32} /> : null}
			</div>
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
	return (
		<div className="stack sm">
			<div className="stack sm horizontal items-center">
				<Avatar size="xsm" user={author} />
				<div>
					<div className="stack horizontal sm items-center text-md font-bold">
						<Link to={userPage(author)} className={styles.userName}>
							{author.username}
						</Link>{" "}
						{author.country ? <Flag countryCode={author.country} tiny /> : null}
					</div>
				</div>
			</div>
			{includeWeapons ? (
				<div className="stack horizontal sm">
					{author.weaponPool.map(({ weaponSplId, isFavorite }) => (
						<WeaponImage
							key={weaponSplId}
							weaponSplId={weaponSplId}
							size={32}
							variant={isFavorite ? "badge-5-star" : "badge"}
						/>
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
	const { t, i18n } = useTranslation(["lfg"]);

	const createdAtDate = databaseTimestampToDate(createdAt);
	const updatedAtDate = databaseTimestampToDate(updatedAt);
	const overDayDifferenceBetween =
		updatedAtDate.getTime() - createdAtDate.getTime() > 1000 * 60 * 60 * 24;

	return (
		<div className="text-lighter text-xs font-bold">
			{createdAtDate.toLocaleString(i18n.language, {
				month: "long",
				day: "numeric",
			})}{" "}
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
	plusTier,
	languages,
	tiers,
	canEdit,
	postId,
}: {
	timezone?: string | null;
	plusTier?: number | null;
	languages?: string | null;
	tiers?: NonNullable<ReturnType<TiersMap["get"]>>;
	canEdit?: boolean;
	postId: number;
}) {
	const isMounted = useIsMounted();

	return (
		<div
			className={clsx("stack sm xs-row horizontal flex-wrap", {
				invisible: !isMounted,
			})}
		>
			{typeof timezone === "string" && isMounted && (
				<PostTimezonePill timezone={timezone} />
			)}
			{!isMounted && <PostTimezonePillPlaceholder />}
			{typeof plusTier === "number" && (
				<PostPlusServerPill plusTier={plusTier} />
			)}
			{tiers && <PostSkillPills tiers={tiers} />}
			{typeof languages === "string" && (
				<PostLanguagePill languages={languages} />
			)}
			{canEdit && <PostEditButton id={postId} />}
		</div>
	);
}

function PostTimezonePillPlaceholder() {
	return <div className={clsx(styles.pill, styles.pillPlaceholder)} />;
}

const currentSeasonNth = Seasons.currentOrPrevious()!.nth;

function PostSkillPills({
	tiers,
}: {
	tiers: NonNullable<ReturnType<TiersMap["get"]>>;
}) {
	const hasBoth = tiers.latest && tiers.previous;

	return (
		<div className="stack xxxs horizontal">
			{tiers.latest ? (
				<PostSkillPill
					seasonNth={currentSeasonNth}
					tier={tiers.latest}
					cut={hasBoth ? "END" : undefined}
				/>
			) : null}
			{tiers.previous ? (
				<PostSkillPill
					seasonNth={currentSeasonNth - 1}
					tier={tiers.previous}
					cut={hasBoth ? "START" : undefined}
				/>
			) : null}
		</div>
	);
}

function PostSkillPill({
	seasonNth,
	tier,
	cut,
}: {
	seasonNth: number;
	tier: TieredSkill["tier"];
	cut?: "START" | "END";
}) {
	return (
		<div
			className={clsx(styles.pill, styles.tierPill, {
				[styles.tierPillStart]: cut === "START",
				[styles.tierPillEnd]: cut === "END",
			})}
		>
			S{seasonNth}
			<TierImage tier={tier} width={32} className={styles.tier} />
		</div>
	);
}

function PostPlusServerPill({ plusTier }: { plusTier: number }) {
	return (
		<div className={styles.pill}>
			<Image alt="" path={navIconUrl("plus")} size={18} />
			{plusTier}
		</div>
	);
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

function PostLanguagePill({ languages }: { languages: string }) {
	return (
		<div className={styles.pill}>
			{languages.replace(/,/g, " / ").toUpperCase()}
		</div>
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
			<EditIcon />
			{t("common:actions.edit")}
		</Link>
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
				icon={<TrashIcon className="small-icon" />}
			>
				{t("common:actions.delete")}
			</SendouButton>
		</FormWithConfirm>
	);
}

function PostExpandableText({
	text,
	isExpanded: _isExpanded,
	setIsExpanded,
	expandableCriteria,
}: {
	text: string;
	isExpanded: boolean;
	setIsExpanded: (isExpanded: boolean) => void;
	expandableCriteria?: number;
}) {
	const { t } = useTranslation(["common"]);
	const isExpandable = !expandableCriteria || text.length > expandableCriteria;

	const isExpanded = !isExpandable ? true : _isExpanded;

	return (
		<div
			className={clsx({
				[styles.textContainer]: !isExpanded,
				[styles.textContainerExpanded]: isExpanded,
			})}
		>
			<div className={styles.text}>{text}</div>
			{isExpandable ? (
				<SendouButton
					onPress={() => setIsExpanded(!isExpanded)}
					className={clsx([styles.showAllButton], {
						[styles.showAllButtonExpanded]: isExpanded,
					})}
					variant="outlined"
					size="small"
				>
					{isExpanded
						? t("common:actions.showLess")
						: t("common:actions.showMore")}
				</SendouButton>
			) : null}
			{!isExpanded ? <div className={styles.textCut} /> : null}
		</div>
	);
}
