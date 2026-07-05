import clsx from "clsx";
import { Armchair, Edit } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Image, TierImage } from "~/components/Image";
import { NoteAvatar } from "~/components/NoteAvatar";
import type { TierName } from "~/features/mmr/mmr-constants";
import {
	UserCard,
	useUserCardData,
} from "~/features/user-card/components/UserCard";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import type { CommonUser } from "~/utils/kysely.server";
import { tierImageUrl } from "~/utils/urls";
import { SendouTabPanel } from "../elements/Tabs";
import styles from "./MatchRosterTab.module.css";
import { TAB_KEYS } from "./MatchTabs";
import { WeaponPool } from "./WeaponPool";

type RosterTabMember = CommonUser & {
	tier?: { name: TierName; isPlus: boolean } | "CALCULATING";
	weaponPool?: Array<MainWeaponId>;
	inGameName?: string | null;
};

interface RosterTabTeam {
	team?: {
		id: number;
		name: string;
		url: string;
		avatar?: string;
	};
	defaultName?: string;
	members: Array<RosterTabMember>;
	/** Sub user ids i.e. those who are not the current active roster */
	subbedOut?: Array<number>;
	tier?: { name: TierName; isPlus: boolean };
	/** Tournament seed of the team (tournament only). */
	seed?: number | null;
}

interface MatchRosterTabProps {
	teams: [RosterTabTeam, RosterTabTeam];
	minMembersPerTeam: number;
	canEditSubbedOut?: [boolean, boolean];
	defaultIsEditing?: [boolean, boolean];
	onSubbedOutChange?: (teamId: number, subbedOut: number[]) => void;
	isSubmitting?: boolean;
}

export function MatchRosterTab({
	teams,
	minMembersPerTeam,
	canEditSubbedOut,
	defaultIsEditing,
	onSubbedOutChange,
	isSubmitting,
}: MatchRosterTabProps) {
	return (
		<SendouTabPanel id={TAB_KEYS.ROSTERS}>
			<div className={styles.rosters}>
				<TeamRoster
					team={teams[0]}
					side="alpha"
					canEditSubbedOut={canEditSubbedOut?.[0] ?? false}
					defaultIsEditing={defaultIsEditing?.[0] ?? false}
					minMembersPerTeam={minMembersPerTeam}
					onSubbedOutChange={onSubbedOutChange}
					isSubmitting={isSubmitting}
				/>
				<div className={styles.rostersDivider} />
				<TeamRoster
					team={teams[1]}
					side="bravo"
					canEditSubbedOut={canEditSubbedOut?.[1] ?? false}
					defaultIsEditing={defaultIsEditing?.[1] ?? false}
					minMembersPerTeam={minMembersPerTeam}
					onSubbedOutChange={onSubbedOutChange}
					isSubmitting={isSubmitting}
				/>
			</div>
		</SendouTabPanel>
	);
}

function TeamRoster({
	team,
	side,
	canEditSubbedOut,
	defaultIsEditing,
	minMembersPerTeam,
	onSubbedOutChange,
	isSubmitting,
}: {
	team: RosterTabTeam;
	side: "alpha" | "bravo";
	canEditSubbedOut: boolean;
	defaultIsEditing: boolean;
	minMembersPerTeam: number;
	onSubbedOutChange?: (teamId: number, subbedOut: number[]) => void;
	isSubmitting?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const [isEditing, setIsEditing] = useState(defaultIsEditing);
	const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

	const rosterIdentity = rosterIdentityKey(team);
	const [prevRosterIdentity, setPrevRosterIdentity] = useState(rosterIdentity);
	if (rosterIdentity !== prevRosterIdentity) {
		setPrevRosterIdentity(rosterIdentity);
		setIsEditing(defaultIsEditing);
		setSelectedMemberIds([]);
	}

	const subbedOutSet = new Set(team.subbedOut);
	const activeMembers = team.members.filter(
		(member) => !subbedOutSet.has(member.id),
	);
	const subbedOutMembers = team.members.filter((member) =>
		subbedOutSet.has(member.id),
	);

	const showEditButton = canEditSubbedOut && team.team && !isEditing;

	return (
		<div className={clsx("stack xxs", styles.rosterColumn)}>
			<TeamHeader team={team} side={side} />
			{team.members.length > 0 ? (
				<ul className={styles.rosterMembers}>
					{isEditing
						? team.members.map((member, index) => (
								<li key={member.id}>
									<label className="stack horizontal sm items-center cursor-pointer">
										<input
											type="checkbox"
											checked={selectedMemberIds.includes(member.id)}
											onChange={() => handleToggleMember(member.id)}
											data-testid={`player-checkbox-${side}-${index}`}
										/>
										<Avatar user={member} size="xxs" />
										<span>{member.username}</span>
									</label>
								</li>
							))
						: activeMembers.map((member) => (
								<li key={member.id} className={styles.memberGrid}>
									<RosterMemberLink
										member={member}
										className={styles.memberLink}
									/>
									<div className={styles.memberSecondRow}>
										<div className={styles.memberTier}>
											<MemberTierPopover tier={member.tier} />
										</div>
										<MemberMeta weaponPool={member.weaponPool} />
									</div>
								</li>
							))}
					{!isEditing && subbedOutMembers.length > 0 ? (
						<li>
							<SubbedOutPopover members={subbedOutMembers} />
						</li>
					) : null}
				</ul>
			) : null}
			{isEditing ? (
				<div>
					<div className={styles.rosterEditCount}>
						{selectedMemberIds.length}/{minMembersPerTeam}
					</div>
					<div className={styles.rosterEditButtons}>
						<SendouButton
							variant="primary"
							size="small"
							isDisabled={
								isSubmitting || selectedMemberIds.length !== minMembersPerTeam
							}
							onPress={handleSubmit}
							testId={`save-active-roster-button-${side}`}
						>
							{t("common:actions.submit")}
						</SendouButton>
						{defaultIsEditing ? null : (
							<SendouButton
								variant="outlined"
								size="small"
								onPress={handleCancel}
							>
								{t("common:actions.cancel")}
							</SendouButton>
						)}
					</div>
				</div>
			) : null}
			{showEditButton ? (
				<SendouButton
					icon={<Edit />}
					className="mt-4 mx-auto"
					size="small"
					onPress={() => {
						setSelectedMemberIds(activeMembers.map((m) => m.id));
						setIsEditing(true);
					}}
					testId={`edit-active-roster-button-${side}`}
				>
					{t("common:actions.edit")}
				</SendouButton>
			) : null}
		</div>
	);

	function handleToggleMember(memberId: number) {
		setSelectedMemberIds((prev) =>
			prev.includes(memberId)
				? prev.filter((id) => id !== memberId)
				: [...prev, memberId],
		);
	}

	function handleSubmit() {
		if (!team.team || !onSubbedOutChange) return;

		const subbedOutIds = team.members
			.filter((m) => !selectedMemberIds.includes(m.id))
			.map((m) => m.id);
		onSubbedOutChange(team.team.id, subbedOutIds);
		setIsEditing(false);
	}

	function handleCancel() {
		setSelectedMemberIds(activeMembers.map((m) => m.id));
		setIsEditing(false);
	}
}

function rosterIdentityKey(team: RosterTabTeam) {
	return [
		team.members.map((member) => member.id).join("-"),
		(team.subbedOut ?? []).join("-"),
	].join("_");
}

function TeamHeader({
	team,
	side,
}: {
	team: RosterTabTeam;
	side: "alpha" | "bravo";
}) {
	const { t } = useTranslation(["common"]);

	const tierText = team.tier
		? `${team.tier.name.toLowerCase()}${team.tier.isPlus ? "+" : ""}`
		: undefined;

	const meta = (
		<div className="stack xs horizontal items-center text-lighter">
			{typeof team.seed === "number" ? (
				<span>{t("common:seed", { number: team.seed })}</span>
			) : null}
			{team.tier && tierText ? (
				<div className="stack xxs horizontal items-center">
					<TierImage tier={team.tier} width={20} />
					<span className="text-capitalize">{tierText}</span>
				</div>
			) : null}
		</div>
	);

	if (team.team) {
		return (
			<Link to={team.team.url} className="stack horizontal sm">
				<Avatar
					url={team.team.avatar}
					identiconInput={team.team.name}
					size="sm"
				/>
				<div
					className={clsx(
						"stack justify-center line-height-tight",
						styles.teamHeaderText,
					)}
				>
					<h2
						className={clsx(
							"text-main-forced font-bold",
							styles.teamNameHeading,
						)}
						title={team.team.name}
					>
						{team.team.name}
					</h2>
					{meta}
				</div>
			</Link>
		);
	}

	invariant(team.defaultName, "team or defaultName must be provided");

	return (
		<div className="stack horizontal sm">
			<div className={styles.teamAvatar} data-side={side} />
			<div
				className={clsx(
					"stack justify-center line-height-tight",
					styles.teamHeaderText,
				)}
			>
				<h2
					className={clsx("text-main-forced font-bold", styles.teamNameHeading)}
					title={team.defaultName}
				>
					{team.defaultName}
				</h2>
				{meta}
			</div>
		</div>
	);
}

function MemberTierPopover({
	tier,
}: {
	tier?: { name: TierName; isPlus: boolean } | "CALCULATING";
}) {
	if (!tier) return null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					className={styles.tierBadge}
					aria-label="Tier"
				>
					{tier === "CALCULATING" ? (
						<Image
							path={tierImageUrl("CALCULATING")}
							alt=""
							width={22}
							height={22 * 0.8675}
						/>
					) : (
						<TierImage tier={tier} width={22} />
					)}
				</SendouButton>
			}
		>
			<MemberTierPopoverContent tier={tier} />
		</SendouPopover>
	);
}

function MemberTierPopoverContent({
	tier,
}: {
	tier: { name: TierName; isPlus: boolean } | "CALCULATING";
}) {
	const { t } = useTranslation(["q"]);

	if (tier === "CALCULATING") {
		return (
			<div className={styles.tierPopover}>
				<Image
					path={tierImageUrl("CALCULATING")}
					alt=""
					width={80}
					height={80 * 0.8675}
				/>
				<span className={styles.tierPopoverName}>
					{t("q:looking.sp.calculating")}
				</span>
			</div>
		);
	}

	return (
		<div className={styles.tierPopover}>
			<TierImage tier={tier} width={80} />
			<span className={styles.tierPopoverName}>
				{tier.name.toLowerCase()}
				{tier.isPlus ? "+" : ""}
			</span>
		</div>
	);
}

function MemberMeta({ weaponPool }: { weaponPool?: Array<MainWeaponId> }) {
	const hasWeapons = weaponPool && weaponPool.length > 0;

	if (!hasWeapons) return null;

	return (
		<div className={styles.memberMeta}>
			<WeaponPool weapons={weaponPool} size={18} />
		</div>
	);
}

function SubbedOutPopover({ members }: { members: Array<RosterTabMember> }) {
	const { t } = useTranslation(["q"]);

	return (
		<SendouPopover
			trigger={
				<SendouButton variant="minimal" size="small" className="h-max">
					<div className={styles.subbedOutTrigger}>
						<div className={styles.subbedOutIcon}>
							<Armchair size={16} />
						</div>
						+{members.length}
					</div>
				</SendouButton>
			}
		>
			<div className={styles.subbedOutPopover}>
				<div className={styles.subbedOutHeader}>{t("q:match.subbedOut")}</div>
				{members.map((member) => (
					<RosterMemberLink
						key={member.id}
						member={member}
						className="stack horizontal sm items-center"
					/>
				))}
			</div>
		</SendouPopover>
	);
}

function RosterMemberLink({
	member,
	className,
}: {
	member: RosterTabMember;
	className?: string;
}) {
	const cardData = useUserCardData(member.id);

	return (
		<UserCard userId={member.id}>
			<span className={className}>
				<NoteAvatar sentiment={cardData?.privateNote?.sentiment} size="xs">
					<Avatar user={member} size="xxs" />
				</NoteAvatar>
				<div className={styles.memberNameStack}>
					<span>{member.username}</span>
					{member.inGameName ? (
						<span className={styles.memberInGameName}>{member.inGameName}</span>
					) : null}
				</div>
			</span>
		</UserCard>
	);
}
