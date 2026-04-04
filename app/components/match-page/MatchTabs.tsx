import { Armchair, DoorOpen, Edit, Tally5, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import invariant from "~/utils/invariant";
import type { CommonUser } from "~/utils/kysely.server";
import { userPage } from "~/utils/urls";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "../elements/Tabs";
import styles from "./MatchTabs.module.css";

type MatchTabsKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];
interface MatchTabsProps {
	children: React.ReactNode;
	tabs: Array<MatchTabsKey>;
}

const TAB_KEY = "tab";

const TAB_KEYS = {
	ROSTERS: "rosters",
	ACTION: "action",
	JOIN: "join",
} as const;

const TAB_ICONS: Record<MatchTabsKey, React.ReactNode> = {
	rosters: <Users />,
	action: <Tally5 />,
	join: <DoorOpen />,
};

const TAB_LABELS: Record<MatchTabsKey, string> = {
	rosters: "Rosters",
	action: "Action",
	join: "Join",
};

export function MatchTabs({ children, tabs }: MatchTabsProps) {
	const [searchParams, setSearchParams] = useSearchParams();

	const currentTab =
		tabs.find((tab) => searchParams.get(TAB_KEY) === tab) ?? tabs.at(0);
	invariant(currentTab);

	return (
		<div className={styles.root}>
			<SendouTabs
				selectedKey={currentTab}
				onSelectionChange={(key) =>
					setSearchParams({ [TAB_KEY]: key as string })
				}
			>
				<SendouTabList>
					{tabs.map((tab) => (
						<SendouTab key={tab} id={tab} icon={TAB_ICONS[tab]}>
							{TAB_LABELS[tab]}
						</SendouTab>
					))}
				</SendouTabList>

				{children}
			</SendouTabs>
		</div>
	);
}

// xxx: extract tabs to different components

interface RosterTabTeam {
	team?: {
		id: number;
		name: string;
		url: string;
		avatar?: string;
	};
	members: Array<CommonUser>;
	/** Sub user ids i.e. those who are not the current active roster */
	subbedOut?: Array<number>;
}

interface MatchRosterTabProps {
	teams: [RosterTabTeam, RosterTabTeam];
	minMembersPerTeam: number;
	canEditSubbedOut?: [boolean, boolean];
	onSubbedOutChange?: (teamId: number, subbedOut: number[]) => void;
	isSubmitting?: boolean;
}

export function MatchRosterTab({
	teams,
	minMembersPerTeam,
	canEditSubbedOut,
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
					minMembersPerTeam={minMembersPerTeam}
					onSubbedOutChange={onSubbedOutChange}
					isSubmitting={isSubmitting}
				/>
				<TeamRoster
					team={teams[1]}
					side="bravo"
					canEditSubbedOut={canEditSubbedOut?.[1] ?? false}
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
	minMembersPerTeam,
	onSubbedOutChange,
	isSubmitting,
}: {
	team: RosterTabTeam;
	side: "alpha" | "bravo";
	canEditSubbedOut: boolean;
	minMembersPerTeam: number;
	onSubbedOutChange?: (teamId: number, subbedOut: number[]) => void;
	isSubmitting?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const [isEditing, setIsEditing] = useState(false);
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
			{team.team ? (
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
						</div>
					</div>
				</Link>
			) : null}
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
								<li key={member.id}>
									<Link
										to={userPage(member)}
										className="stack horizontal sm items-center"
									>
										<Avatar user={member} size="xxs" />
										<span>{member.username}</span>
									</Link>
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

function SubbedOutPopover({ members }: { members: Array<CommonUser> }) {
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
					<Link
						key={member.id}
						to={userPage(member)}
						className="stack horizontal sm items-center"
					>
						<Avatar user={member} size="xxs" />
						<span>{member.username}</span>
					</Link>
				))}
			</div>
		</SendouPopover>
	);
}

export function MatchActionTab() {
	return <SendouTabPanel id={TAB_KEYS.ACTION}>Report content</SendouTabPanel>;
}

interface MatchJoinTabProps {
	joinLink?: string;
	hostedBy?: CommonUser;
	pool: string;
	pass: string;
	showNoSplatnetAlert: boolean;
}

export function MatchJoinTab({
	joinLink,
	hostedBy,
	pool,
	pass,
	showNoSplatnetAlert,
}: MatchJoinTabProps) {
	const { t } = useTranslation(["q"]);

	return (
		<SendouTabPanel id={TAB_KEYS.JOIN}>
			<div className="stack lg">
				{showNoSplatnetAlert ? (
					<Alert variation="WARNING" tiny>
						{t("q:match.noSplatnetWarning")}
					</Alert>
				) : null}
				<div className={styles.joinContent}>
					{joinLink ? (
						<div className={styles.qrCodeContainer}>
							<QRCodeSVG
								value={joinLink}
								size={140}
								className={styles.qrCode}
							/>
							<a
								href={joinLink}
								target="_blank"
								rel="noopener noreferrer"
								className={styles.joinLink}
							>
								{joinLink}
							</a>
						</div>
					) : null}
					<div className={styles.joinInfo}>
						{hostedBy ? (
							<InfoWithHeader
								header={t("q:match.hostedBy")}
								value={hostedBy.username}
							/>
						) : null}
						<InfoWithHeader header={t("q:match.pool")} value={pool} />
						<InfoWithHeader header={t("q:match.password.short")} value={pass} />
					</div>
				</div>
			</div>
		</SendouTabPanel>
	);
}

function InfoWithHeader({ header, value }: { header: string; value: string }) {
	return (
		<div>
			<div className={styles.infoHeader}>{header}</div>
			<div className={styles.infoValue}>{value}</div>
		</div>
	);
}
