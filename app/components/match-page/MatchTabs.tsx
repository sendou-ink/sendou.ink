import { DoorOpen, Tally5, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Alert } from "~/components/Alert";
import invariant from "~/utils/invariant";
import type { CommonUser } from "~/utils/kysely.server";
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

export function MatchRosterTab() {
	return <SendouTabPanel id={TAB_KEYS.ROSTERS}>Roster content</SendouTabPanel>;
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
