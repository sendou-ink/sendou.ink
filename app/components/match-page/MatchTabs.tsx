import { Armchair, DoorOpen, Tally5, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type * as React from "react";
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
}

export function MatchRosterTab({ teams }: MatchRosterTabProps) {
	return (
		<SendouTabPanel id={TAB_KEYS.ROSTERS}>
			<div className={styles.rosters}>
				<TeamRoster team={teams[0]} side="alpha" />
				<TeamRoster team={teams[1]} side="bravo" />
			</div>
		</SendouTabPanel>
	);
}

function TeamRoster({
	team,
	side,
}: {
	team: RosterTabTeam;
	side: "alpha" | "bravo";
}) {
	const dotClassName = side === "alpha" ? styles.teamOneDot : styles.teamTwoDot;
	const label = side === "alpha" ? "Alpha" : "Bravo";

	const subbedOutSet = new Set(team.subbedOut);
	const activeMembers = team.members.filter(
		(member) => !subbedOutSet.has(member.id),
	);
	const subbedOutMembers = team.members.filter((member) =>
		subbedOutSet.has(member.id),
	);

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
					{activeMembers.map((member) => (
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
					{subbedOutMembers.length > 0 ? (
						<li>
							<SubbedOutPopover members={subbedOutMembers} />
						</li>
					) : null}
				</ul>
			) : null}
		</div>
	);
}

function SubbedOutPopover({ members }: { members: Array<CommonUser> }) {
	const { t } = useTranslation(["q"]);

	return (
		<SendouPopover
			trigger={
				<SendouButton variant="minimal" size="small">
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
