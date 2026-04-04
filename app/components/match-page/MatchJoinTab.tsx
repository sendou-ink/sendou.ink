import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import type { CommonUser } from "~/utils/kysely.server";
import { SendouTabPanel } from "../elements/Tabs";
import styles from "./MatchJoinTab.module.css";
import { TAB_KEYS } from "./MatchTabs";

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
