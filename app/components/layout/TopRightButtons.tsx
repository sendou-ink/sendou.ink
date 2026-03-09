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

	// xxx: anti-pattern? probablty just extract this
	const chatButton = (variant: "outlined" | "primary", onPress: () => void) => (
		<>
			<SendouButton
				size="small"
				icon={<MessageSquare />}
				variant={variant}
				onPress={onPress}
			/>
			{chatUnreadCount ? (
				<span className={styles.chatUnreadBadge}>{chatUnreadCount}</span>
			) : null}
		</>
	);

	return (
		<div className={styles.container}>
			{showSupport ? (
				<LinkButton
					to={SUPPORT_PAGE}
					size="small"
					icon={<Heart />}
					variant="outlined"
				>
					{t("common:pages.support")}
				</LinkButton>
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
					</div>
					{onChatToggle ? (
						<div className={styles.chatButtonWrapperPersistent}>
							{chatButton("outlined", onChatToggle)}
						</div>
					) : null}
					{onChatModalToggle ? (
						<div className={styles.chatButtonWrapperModal}>
							{chatButton("outlined", onChatModalToggle)}
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
