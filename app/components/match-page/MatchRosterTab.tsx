import clsx from "clsx";
import { Armchair, Edit, User } from "lucide-react";
import { useState } from "react";
import { Button as ReactAriaButton } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouMenu,
	SendouMenuItem,
	SendouMenuSection,
} from "~/components/elements/Menu";
import { SendouPopover } from "~/components/elements/Popover";
import { Image, TierImage } from "~/components/Image";
import type { TierName } from "~/features/mmr/mmr-constants";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import type { CommonUser } from "~/utils/kysely.server";
import { navIconUrl, tierImageUrl, userPage } from "~/utils/urls";
import { SendouTabPanel } from "../elements/Tabs";
import styles from "./MatchRosterTab.module.css";
import { TAB_KEYS } from "./MatchTabs";
import { WeaponPool } from "./WeaponPool";

type RosterTabMember = CommonUser & {
	tier?: { name: TierName; isPlus: boolean } | "CALCULATING";
	plusTier?: number | null;
	weaponPool?: Array<MainWeaponId>;
	friendCode?: string | null;
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

	const dotClassName = side === "alpha" ? styles.teamOneDot : styles.teamTwoDot;
	const label = side === "alpha" ? "Alpha" : "Bravo";

	const subbedOutSet = new Set(team.subbedOut);
	const activeMembers = team.members.filter(
		(member) => !subbedOutSet.has(member.id),
	);
	const subbedOutMembers = team.members.filter((member) =>
		subbedOutSet.has(member.id),
	);

	const showEditButton = canEditSubbedOut && team.team && !isEditing;

	return (
		<div className="stack xxs">
			<TeamHeader
				team={team}
				side={side}
				label={label}
				dotClassName={dotClassName}
			/>
			{team.members.length > 0 ? (
				<ul className={styles.rosterMembers}>
					{isEditing
						? team.members.map((member) => (
								<li key={member.id}>
									<label className="stack horizontal sm items-center cursor-pointer">
										<input
											type="checkbox"
											checked={selectedMemberIds.includes(member.id)}
											onChange={() => handleToggleMember(member.id)}
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
									<div className={styles.memberTier}>
										<MemberTierPopover tier={member.tier} />
									</div>
									<div className={styles.memberMetaArea}>
										<MemberMeta
											plusTier={member.plusTier}
											weaponPool={member.weaponPool}
										/>
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
						>
							{t("common:actions.submit")}
						</SendouButton>
						<SendouButton
							variant="outlined"
							size="small"
							onPress={handleCancel}
						>
							{t("common:actions.cancel")}
						</SendouButton>
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

function TeamHeader({
	team,
	side,
	label,
	dotClassName,
}: {
	team: RosterTabTeam;
	side: "alpha" | "bravo";
	label: string;
	dotClassName: string;
}) {
	const tierText = team.tier
		? `${team.tier.name.toLowerCase()}${team.tier.isPlus ? "+" : ""}`
		: undefined;

	if (team.team) {
		return (
			<Link to={team.team.url} className="stack horizontal sm">
				<Avatar
					url={team.team.avatar}
					identiconInput={team.team.name}
					size="sm"
				/>
				<div className="stack justify-center line-height-tight">
					<h2 className="text-main-forced font-bold">{team.team.name}</h2>
					<div className="stack xs horizontal items-center text-lighter">
						<div className={dotClassName} />
						{label}
						{tierText ? (
							<>
								<span>•</span>
								<span className="text-capitalize">{tierText}</span>
							</>
						) : null}
					</div>
				</div>
			</Link>
		);
	}

	invariant(team.defaultName, "team or defaultName must be provided");

	return (
		<div className="stack horizontal sm">
			<div className={styles.teamAvatar} data-side={side} />
			<div className="stack justify-center line-height-tight">
				<h2 className="text-main-forced font-bold">{team.defaultName}</h2>
				<div className="stack xs horizontal items-center text-lighter">
					<div className={dotClassName} />
					{label}
					{tierText ? (
						<>
							<span>•</span>
							<span className="text-capitalize">{tierText}</span>
						</>
					) : null}
				</div>
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
				<SendouButton variant="minimal" className={styles.tierBadge}>
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

function MemberMeta({
	plusTier,
	weaponPool,
}: {
	plusTier?: number | null;
	weaponPool?: Array<MainWeaponId>;
}) {
	const hasPlusTier = typeof plusTier === "number";
	const hasWeapons = weaponPool && weaponPool.length > 0;

	if (!hasPlusTier && !hasWeapons) return null;

	return (
		<div className={styles.memberMeta}>
			{hasPlusTier ? (
				<div className={styles.plusTier}>
					<Image path={navIconUrl("plus")} width={16} height={16} alt="" />
					<span>{plusTier}</span>
				</div>
			) : null}
			{hasWeapons ? <WeaponPool weapons={weaponPool} size={18} /> : null}
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
	const { t } = useTranslation(["friends"]);

	if (!member.friendCode) {
		return (
			<Link to={userPage(member)} className={className}>
				<Avatar user={member} size="xxs" />
				<span>{member.username}</span>
			</Link>
		);
	}

	return (
		<SendouMenu
			trigger={
				<ReactAriaButton className={clsx(className, styles.memberMenuTrigger)}>
					<Avatar user={member} size="xxs" />
					<span>{member.username}</span>
				</ReactAriaButton>
			}
		>
			<SendouMenuSection
				headerText={`SW-${member.friendCode}`}
				headerClassName={styles.friendCodeHeader}
			>
				<SendouMenuItem href={userPage(member)} icon={<User />}>
					{t("friends:friendsList.viewUserPage")}
				</SendouMenuItem>
			</SendouMenuSection>
		</SendouMenu>
	);
}
