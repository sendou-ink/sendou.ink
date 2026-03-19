import { Heart, LogIn, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORT_PAGE } from "~/utils/urls";
import { LinkButton, SendouButton } from "../elements/Button";
import { AnythingAdder } from "./AnythingAdder";
import { GlobalSearch } from "./GlobalSearch";
import { LogInButtonContainer } from "./LogInButtonContainer";
import styles from "./TopRightButtons.module.css";

export function TopRightButtons({
	showSupport,
	showSearch,
	isLoggedIn,
	onChatToggle,
	onChatModalToggle,
	chatUnreadCount,
}: {
	showSupport: boolean;
	showSearch: boolean;
	isLoggedIn: boolean;
	onChatToggle?: () => void;
	onChatModalToggle?: () => void;
	chatUnreadCount?: number;
}) {
	const { t } = useTranslation(["common", "front"]);

	return (
		<div className={styles.container}>
			{showSupport ? (
				<>
					<div className={styles.supportWrapper}>
						<LinkButton
							to={SUPPORT_PAGE}
							size="small"
							icon={<Heart />}
							variant="outlined"
						>
							{t("common:pages.support")}
						</LinkButton>
					</div>
					<div className={styles.supportWrapperCompact}>
						<LinkButton
							to={SUPPORT_PAGE}
							size="small"
							icon={<Heart />}
							variant="outlined"
							shape="square"
						/>
					</div>
				</>
			) : null}
			{isLoggedIn ? (
				<>
					<div className={styles.searchAndAddContainer}>
						{showSearch ? (
							<div className={styles.searchWrapper}>
								<GlobalSearch />
							</div>
						) : null}
						<div className={styles.addNewWrapper}>
							<AnythingAdder />
						</div>
						<div className={styles.addNewWrapperCompact}>
							<AnythingAdder compact />
						</div>
					</div>
					{onChatToggle ? (
						<div className={styles.chatButtonWrapperPersistent}>
							<ChatButton
								variant="outlined"
								onPress={onChatToggle}
								unreadCount={chatUnreadCount}
							/>
						</div>
					) : null}
					{onChatModalToggle ? (
						<div className={styles.chatButtonWrapperModal}>
							<ChatButton
								variant="outlined"
								onPress={onChatModalToggle}
								unreadCount={chatUnreadCount}
							/>
						</div>
					) : null}
				</>
			) : (
				<LogInButtonContainer>
					<SendouButton type="submit" size="small" icon={<LogIn />}>
						{t("front:mobileNav.login")}
					</SendouButton>
				</LogInButtonContainer>
			)}
		</div>
	);
}

function ChatButton({
	variant,
	onPress,
	unreadCount,
}: {
	variant: "outlined" | "primary";
	onPress: () => void;
	unreadCount?: number;
}) {
	return (
		<>
			<SendouButton
				shape="square"
				size="small"
				icon={<MessageSquare />}
				variant={variant}
				onPress={onPress}
			/>
			{unreadCount ? (
				<span className={styles.chatUnreadBadge}>{unreadCount}</span>
			) : null}
		</>
	);
}
