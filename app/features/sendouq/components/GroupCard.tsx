import clsx from "clsx";
import type { SqlBool } from "kysely";
import { Check, Hourglass, Mic, Volume2, VolumeX } from "lucide-react";
import * as React from "react";
import { Flipped } from "react-flip-toolkit";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Image, ModeImage, TierImage, WeaponImage } from "~/components/Image";
import { NoteAvatar } from "~/components/NoteAvatar";
import { useUser } from "~/features/auth/core/user";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import { ordinalToRoundedSp } from "~/features/mmr/mmr-utils";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import {
	UserCard,
	useUserCardData,
} from "~/features/user-card/components/UserCard";
import { SendouForm } from "~/form/SendouForm";
import { languagesUnified } from "~/modules/i18n/config";
import { SPLATTERCOLOR_SCREEN_ID } from "~/modules/in-game-lists/weapon-ids";
import { nullFilledArray } from "~/utils/arrays";
import { inGameNameWithoutDiscriminator } from "~/utils/strings";
import {
	SENDOUQ_LOOKING_PAGE,
	specialWeaponImageUrl,
	TIERS_PAGE,
	tierImageUrl,
} from "~/utils/urls";
import type {
	SQGroup,
	SQGroupMember,
	SQOwnGroup,
} from "../core/SendouQ.server";
import { lookingSchema } from "../q-action-schemas";
import { FULL_GROUP_SIZE } from "../q-constants";
import { updateGroupNoteSchema } from "../q-schemas";
import { resolveFutureMatchModes } from "../q-utils";
import styles from "./GroupCard.module.css";

/** Who in the viewer's own group acted on the shown group, and how. */
export type GroupCardTrail = {
	type: "INVITED" | "SUGGESTED";
	username: string;
};

export function GroupCard({
	group,
	action,
	suggestable = false,
	trail,
	isSuggested = false,
	displayOnly = false,
	hideVc = false,
	hideWeapons = false,
	hideNote: _hidenote = false,
	ownGroup,
	readyUserIds,
	kickableUserIds,
	layout = "desktop",
}: {
	group: SQGroup | SQOwnGroup;
	action?: "LIKE" | "UNLIKE" | "GROUP_UP" | "MATCH_UP" | "MATCH_UP_RECHALLENGE";
	/** Can the viewer point their own teammates at this group? */
	suggestable?: boolean;
	trail?: GroupCardTrail;
	/** Has someone in the viewer's own group pointed this group out? */
	isSuggested?: boolean;
	displayOnly?: boolean;
	hideVc?: SqlBool;
	hideWeapons?: SqlBool;
	hideNote?: boolean;
	ownGroup?: SQOwnGroup;
	/** Members who have confirmed they are ready to play, shown during a ready check. */
	readyUserIds?: number[];
	/** Members the viewer can kick out of the group. */
	kickableUserIds?: number[];
	layout?: "mobile" | "desktop";
}) {
	const { t } = useTranslation(["q"]);

	const hideNote =
		displayOnly ||
		!group.members ||
		group.members.length === FULL_GROUP_SIZE ||
		_hidenote;

	const isOwnGroup = group.id === ownGroup?.id;

	const futureMatchModes = ownGroup
		? resolveFutureMatchModes(ownGroup, group)
		: null;

	// while previewing the queue the viewer has no group of their own to act with
	const actionToShow = ownGroup ? action : undefined;

	return (
		<GroupCardContainer
			groupId={group.id}
			isOwnGroup={isOwnGroup}
			layout={layout}
		>
			<section
				className={clsx(styles.group, { [styles.suggested]: isSuggested })}
				data-testid="sendouq-group-card"
			>
				{group.members ? (
					<div className="stack md">
						{group.members.map((member) => {
							return (
								<GroupMember
									member={member}
									key={member.discordId}
									hideVc={hideVc}
									hideWeapons={hideWeapons}
									hideNote={hideNote}
									isReady={readyUserIds?.includes(member.id)}
									isKickable={kickableUserIds?.includes(member.id)}
								/>
							);
						})}
					</div>
				) : null}
				{futureMatchModes && !group.members ? (
					<div
						className={clsx("stack horizontal", {
							"justify-between": group.noScreen,
							"justify-center": !group.noScreen,
						})}
					>
						<div className="stack horizontal sm justify-center">
							{futureMatchModes.map((mode) => {
								return (
									<div
										key={mode}
										className={styles.futureMatchMode}
										data-testid={`group-card-mode-${mode}`}
									>
										<ModeImage mode={mode} />
									</div>
								);
							})}
						</div>
						{group.noScreen ? (
							<div className={styles.noScreen}>
								<Image
									path={specialWeaponImageUrl(SPLATTERCOLOR_SCREEN_ID)}
									width={22}
									height={22}
									alt={`weapons:SPECIAL_${SPLATTERCOLOR_SCREEN_ID}`}
								/>
							</div>
						) : null}
					</div>
				) : null}
				{group.tier &&
				(!group.members || group.members.length === FULL_GROUP_SIZE) ? (
					<div className="stack xs text-lighter font-bold items-center justify-center text-xs">
						<TierImage tier={group.tier} width={100} />
						<div>
							{group.tier.name}
							{group.tier.isPlus ? "+" : ""}{" "}
							{group.isReplay ? (
								<>
									/{" "}
									<span className="text-theme-secondary text-uppercase">
										{t("q:looking.replay")}
									</span>
								</>
							) : null}
						</div>
					</div>
				) : null}
				{group.tier && displayOnly && !group.members ? (
					<div className={styles.displayTier}>
						<TierImage tier={group.tier} width={38} />
						{group.tier.name}
						{group.tier.isPlus ? "+" : ""}
					</div>
				) : null}
				{group.tierRange ? (
					<div className="stack md items-center">
						<div className="stack sm horizontal items-center justify-center">
							<div className="stack xs items-center">
								<TierImage tier={group.tierRange.range[0]} width={80} />
								{group.tierRange.diff[0] ? (
									<div className="text-lighter text-sm font-bold">
										({group.tierRange.diff[0]})
									</div>
								) : null}
							</div>
							{/** in preview mode they don't see full group tiers (because they don't have a group to compare against) so it is a "true range" */}
							{group.tierRange.diff[0] ? (
								<SendouPopover
									popoverClassName="text-main-forced"
									trigger={
										<SendouButton className={styles.popoverButton}>
											{t("q:looking.range.or")}
										</SendouButton>
									}
								>
									{t("q:looking.range.or.explanation")}
								</SendouPopover>
							) : (
								"—"
							)}
							<div className="stack xs items-center">
								<TierImage tier={group.tierRange.range[1]} width={80} />
								{group.tierRange.diff[1] ? (
									<div className="text-lighter text-sm font-bold">
										(+{group.tierRange.diff[1]})
									</div>
								) : null}
							</div>
						</div>
						{group.isReplay ? (
							<div className="text-theme-secondary text-uppercase text-xs font-bold">
								{t("q:looking.replay")}
							</div>
						) : null}
					</div>
				) : null}
				{actionToShow || suggestable || trail ? (
					<div className="stack xs items-center">
						<div className="stack sm horizontal items-center justify-center">
							{actionToShow ? (
								<ActionButton
									schema={lookingSchema}
									action={
										actionToShow === "MATCH_UP_RECHALLENGE"
											? "MATCH_UP"
											: actionToShow
									}
									fields={{ targetGroupId: group.id }}
									size="small"
									variant={
										actionToShow === "UNLIKE" ? "destructive" : undefined
									}
									testId="group-card-action-button"
								>
									{actionToShow === "MATCH_UP" ||
									actionToShow === "MATCH_UP_RECHALLENGE"
										? t("q:looking.groups.actions.startMatch")
										: actionToShow === "LIKE" && !group.members
											? t("q:looking.groups.actions.challenge")
											: actionToShow === "LIKE"
												? t("q:looking.groups.actions.invite")
												: actionToShow === "GROUP_UP"
													? t("q:looking.groups.actions.groupUp")
													: t("q:looking.groups.actions.undo")}
								</ActionButton>
							) : null}
							{suggestable ? (
								<ActionButton
									schema={lookingSchema}
									action="SUGGEST"
									fields={{ targetGroupId: group.id }}
									size="small"
									variant="outlined"
									testId="group-card-suggest-button"
								>
									{t("q:looking.groups.actions.suggest")}
								</ActionButton>
							) : null}
						</div>
						{trail ? (
							<GroupCardTrailText trail={trail} isFullGroup={!group.members} />
						) : null}
					</div>
				) : null}
			</section>
		</GroupCardContainer>
	);
}

function GroupCardTrailText({
	trail,
	isFullGroup,
}: {
	trail: GroupCardTrail;
	isFullGroup: boolean;
}) {
	const { t } = useTranslation(["q"]);

	const i18nKey = () => {
		if (trail.type === "SUGGESTED") return "q:looking.groups.trail.suggested";

		return isFullGroup
			? "q:looking.groups.trail.challenged"
			: "q:looking.groups.trail.invited";
	};

	return (
		<div className="text-xxs text-lighter mt-1" data-testid="group-card-trail">
			<Trans
				t={t}
				i18nKey={i18nKey()}
				values={{ username: trail.username }}
				components={[<span key="username" className="font-bold" />]}
			/>
		</div>
	);
}

function GroupCardContainer({
	isOwnGroup,
	groupId,
	layout,
	children,
}: {
	isOwnGroup: boolean;
	groupId: number;
	layout: "mobile" | "desktop";
	children: React.ReactNode;
}) {
	if (isOwnGroup) return <>{children}</>;

	return <Flipped flipId={`${layout}-${groupId}`}>{children}</Flipped>;
}

function GroupMember({
	member,
	hideVc,
	hideWeapons,
	hideNote,
	isReady,
	isKickable,
}: {
	member: SQGroupMember;
	hideVc?: SqlBool;
	hideWeapons?: SqlBool;
	hideNote?: boolean;
	isReady?: boolean;
	isKickable?: boolean;
}) {
	const { t } = useTranslation(["q", "user"]);
	const user = useUser();
	const cardData = useUserCardData(member.id);

	return (
		<div className="stack xxs" data-testid="sendouq-group-card-member">
			<div className={styles.member}>
				<div className="text-main-forced stack xs horizontal items-center">
					<UserCard userId={member.id} withMutualFriends>
						<span className="stack xs horizontal items-center">
							<NoteAvatar
								sentiment={cardData?.privateNote?.sentiment}
								size="sm"
							>
								<Avatar user={member} size="xs" />
							</NoteAvatar>
							<span className={styles.name}>
								{member.inGameName ? (
									<>
										<span className="text-lighter font-bold text-xxs">
											{t("user:ign.short")}:
										</span>{" "}
										{inGameNameWithoutDiscriminator(member.inGameName)}
									</>
								) : (
									member.username
								)}
							</span>
						</span>
					</UserCard>
				</div>
				<div
					className={clsx(
						"ml-auto stack horizontal sm items-center",
						styles.memberActions,
					)}
				>
					{typeof isReady === "boolean" ? (
						<ReadyIndicator isReady={isReady} />
					) : null}
					{member.skill ? <TierInfo skill={member.skill} /> : null}
				</div>
			</div>
			{isKickable ? (
				<MemberKicker member={member} />
			) : (
				<div className="stack horizontal justify-between">
					<div className="stack horizontal items-center xxs">
						{member.vc && !hideVc ? (
							<div className={styles.extraInfo}>
								<VoiceChatInfo member={member} />
							</div>
						) : null}
						{member.friendCode ? (
							<SendouPopover
								trigger={
									<SendouButton className={styles.extraInfoButton}>
										FC
									</SendouButton>
								}
							>
								SW-{member.friendCode}
							</SendouPopover>
						) : null}
					</div>
					{member.weapons && member.weapons.length > 0 && !hideWeapons ? (
						<div className={styles.extraInfo}>
							{member.weapons?.map((weapon) => {
								return (
									<WeaponImage
										key={weapon.weaponSplId}
										weapon={weapon}
										size={26}
									/>
								);
							})}
						</div>
					) : null}
				</div>
			)}
			{!hideNote ? (
				<MemberNote note={member.note} editable={user?.id === member.id} />
			) : null}
		</div>
	);
}

/** Stand-in for a group whose members are not revealed yet, showing only how many of them are ready to play. */
export function HiddenGroupCard({
	memberCount,
	readyCount,
}: {
	memberCount: number;
	readyCount: number;
}) {
	return (
		<section className={styles.group} data-testid="sendouq-hidden-group-card">
			<div className="stack md">
				{nullFilledArray(memberCount).map((_, i) => (
					<div className={clsx(styles.member, styles.hiddenMember)} key={i}>
						<span className={styles.hiddenMemberName}>???</span>
						<div className={clsx("ml-auto", styles.memberActions)}>
							<ReadyIndicator isReady={i < readyCount} />
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function ReadyIndicator({ isReady }: { isReady: boolean }) {
	const { t } = useTranslation(["q"]);

	const Icon = isReady ? Check : Hourglass;

	return (
		<Icon
			className={clsx(styles.readyIcon, {
				[styles.readyIconConfirmed]: isReady,
			})}
			aria-label={t(
				isReady ? "q:ready.member.ready" : "q:ready.member.waiting",
			)}
			data-testid={isReady ? "member-ready" : "member-not-ready"}
		/>
	);
}

function MemberKicker({ member }: { member: SQGroupMember }) {
	const { t } = useTranslation(["common", "q"]);

	return (
		<div className="stack horizontal sm items-center justify-between text-xxs text-warning">
			{t("q:looking.groups.missedReadyCheck")}
			<ActionButton
				schema={lookingSchema}
				action="KICK_FROM_GROUP"
				fields={{ userId: member.id }}
				formAction={SENDOUQ_LOOKING_PAGE}
				variant="minimal-destructive"
				size="miniscule"
				testId="group-card-kick-button"
				confirm={{
					dialogHeading: t("q:looking.groups.actions.kick.confirm", {
						name: member.username,
					}),
					submitButtonText: t("q:looking.groups.actions.kick"),
				}}
			>
				{t("q:looking.groups.actions.kick")}
			</ActionButton>
		</div>
	);
}

function MemberNote({
	note,
	editable,
}: {
	note?: string | null;
	editable: boolean;
}) {
	const { t } = useTranslation(["common", "q"]);
	const [editing, setEditing] = React.useState(false);

	const startEditing = () => {
		setEditing(true);
	};

	if (editing) {
		return (
			<AddPrivateNoteForm note={note} stopEditing={() => setEditing(false)} />
		);
	}

	if (note) {
		return (
			<div className="text-lighter text-center text-xs mt-1">
				{note}{" "}
				{editable ? (
					<SendouButton
						size="miniscule"
						variant="minimal"
						onPress={startEditing}
						className="mt-2 ml-auto"
					>
						{t("q:looking.groups.editNote")}
					</SendouButton>
				) : null}
			</div>
		);
	}

	if (!editable) return null;

	return (
		<SendouButton variant="minimal" size="miniscule" onPress={startEditing}>
			{t("q:looking.groups.addNote")}
		</SendouButton>
	);
}

function AddPrivateNoteForm({
	note,
	stopEditing,
}: {
	note?: string | null;
	stopEditing: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouForm
			schema={updateGroupNoteSchema}
			action={SENDOUQ_LOOKING_PAGE}
			defaultValues={{ value: note ?? "" }}
			className="stack sm mt-1"
			submitButtonText={t("common:actions.save")}
			submitButtonVariant="minimal"
			submitButtonSize="miniscule"
			secondarySubmit={
				<SendouButton
					variant="minimal-destructive"
					size="miniscule"
					onPress={stopEditing}
				>
					{t("common:actions.cancel")}
				</SendouButton>
			}
			onSuccess={stopEditing}
		>
			{({ FormField }) => <FormField name="value" autoFocus />}
		</SendouForm>
	);
}

function TierInfo({ skill }: { skill: TieredSkill | "CALCULATING" }) {
	const { t } = useTranslation(["q"]);

	if (skill === "CALCULATING") {
		return (
			<div className={styles.tier}>
				<SendouPopover
					trigger={
						<SendouButton variant="minimal">
							<Image
								path={tierImageUrl("CALCULATING")}
								alt=""
								height={32.965}
								className={styles.tierPlaceholder}
							/>
						</SendouButton>
					}
				>
					{t("q:looking.rankCalculating", {
						count: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
					})}
				</SendouPopover>
			</div>
		);
	}

	return (
		<div className={styles.tier}>
			<SendouPopover
				trigger={
					<SendouButton variant="minimal">
						<TierImage tier={skill.tier} width={38} />
					</SendouButton>
				}
			>
				<div className="stack sm items-center">
					<div className="stack items-center">
						<TierImage tier={skill.tier} width={80} />
						<div className="text-lighter text-xxs">
							{skill.tier.name}
							{skill.tier.isPlus ? "+" : ""}
						</div>
						<Link to={TIERS_PAGE} className="text-xxs">
							{t("q:looking.allTiers")}
						</Link>
					</div>
					{!skill.approximate ? (
						<div className="text-lg">
							{" "}
							{ordinalToRoundedSp(skill.ordinal)}
							<span className="text-lighter">SP</span>
						</div>
					) : null}
				</div>
			</SendouPopover>
		</div>
	);
}

function VoiceChatInfo({
	member,
}: {
	member: Pick<SQGroupMember, "id" | "vc" | "languages">;
}) {
	const user = useUser();
	const { t } = useTranslation(["q"]);

	if (!member.languages || !member.vc) return null;

	const Icon =
		member.vc === "YES" ? Mic : member.vc === "LISTEN_ONLY" ? Volume2 : VolumeX;

	const iconTestId =
		member.vc === "YES"
			? "microphone-icon"
			: member.vc === "LISTEN_ONLY"
				? "speaker-icon"
				: "speaker-x-icon";

	const color = () => {
		const languagesMatch =
			// always green for yourself: root loaders don't reload until a full
			// page refresh, so it could otherwise show red
			member.id === user?.id ||
			member.languages?.some((l) => user?.languages.includes(l));

		if (!languagesMatch) return "text-error";

		return member.vc === "YES"
			? "text-success"
			: member.vc === "LISTEN_ONLY"
				? "text-warning"
				: "text-error";
	};

	const languageToFull = (code: string) =>
		languagesUnified.find((l) => l.code === code)?.name ?? "";

	const languagesString =
		member.languages.length > 0
			? `(${member.languages.map(languageToFull).join(", ")})`
			: null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					size="miniscule"
					icon={
						<Icon
							className={clsx(styles.vcIcon, color())}
							data-testid={iconTestId}
						/>
					}
				/>
			}
		>
			{t(`q:vc.${member.vc}`)} {languagesString}
		</SendouPopover>
	);
}
