import { Heart, LogIn, MessageSquare } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { useChatContext } from "~/features/chat/ChatProvider";
import { StatusActivity } from "~/features/global-status/components/StatusActivity";
import { ScannerActivity } from "~/features/scanner/components/ScannerActivity";
import { VoiceActivity } from "~/features/voice/components/VoiceActivity";
import { useLayoutSize } from "~/hooks/useLayoutSize";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import * as Presence from "~/utils/presence";
import { SUPPORT_PAGE } from "~/utils/urls";
import { LinkButton, SendouButton } from "../elements/Button";
import { SendouModal } from "../elements/Dialog";
import { AnythingAdder } from "./AnythingAdder";
import { ChatSidebar } from "./ChatSidebar";
import { GlobalSearch, LoggedOutGlobalSearch } from "./GlobalSearch";
import { LogInButtonContainer } from "./LogInButtonContainer";
import styles from "./TopRightButtons.module.css";

export function TopRightButtons({
	showSupport,
	isLoggedIn,
}: {
	showSupport: boolean;
	isLoggedIn: boolean;
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
							variant="ghost"
						>
							{t("common:pages.support")}
						</LinkButton>
					</div>
					<div className={styles.supportWrapperCompact}>
						<LinkButton
							to={SUPPORT_PAGE}
							size="small"
							icon={<Heart />}
							variant="ghost"
							shape="square"
						/>
					</div>
				</>
			) : null}
			<div className={styles.searchAndAddContainer}>
				<div ref={animateActivities} className={styles.activities}>
					<StatusActivity />
					<VoiceActivity />
					<ScannerActivity />
				</div>
				<div className={styles.searchWrapper}>
					{isLoggedIn ? <GlobalSearch /> : <LoggedOutGlobalSearch />}
				</div>
				{isLoggedIn ? <AnythingAdder /> : null}
			</div>
			{isLoggedIn ? (
				<ChatButtons />
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

function ChatButtons() {
	const { t } = useTranslation(["common"]);
	const chatContext = useChatContext();
	const isTabletLayout = useLayoutSize() === "tablet";
	const [modalOpen, setModalOpen] = useTabletModal(
		isTabletLayout,
		chatContext?.chatOpenRequest ?? 0,
	);

	if (!chatContext) return null;

	const setModalOpenAndSync = (open: boolean) => {
		setModalOpen(open);
		chatContext.setChatOpen(open);
	};

	return (
		<>
			{!chatContext.chatOpen ? (
				<div className={styles.chatButtonWrapperPersistent}>
					<ChatButton
						onClick={() => chatContext.setChatOpen(true)}
						unreadCount={chatContext.totalUnreadCount}
					/>
				</div>
			) : null}
			<div className={styles.chatButtonWrapperModal}>
				<ChatButton
					onClick={() => setModalOpenAndSync(!modalOpen)}
					unreadCount={chatContext.totalUnreadCount}
				/>
			</div>
			{modalOpen ? (
				<SendouModal
					className={styles.chatSidebarModal}
					isDismissable
					aria-label={t("common:chat.sidebar.title")}
					onClose={() => setModalOpenAndSync(false)}
				>
					<ChatSidebar />
				</SendouModal>
			) : null}
		</>
	);
}

/** Open state of a tablet-layout-only modal; leaving that layout or navigating closes it. */
function useTabletModal(isTabletLayout: boolean, openRequest: number) {
	const location = useLocation();
	const [openedOnPathname, setOpenedOnPathname] = React.useState<string | null>(
		null,
	);

	const [handledOpenRequest, setHandledOpenRequest] =
		React.useState(openRequest);
	if (openRequest !== handledOpenRequest) {
		setHandledOpenRequest(openRequest);
		if (isTabletLayout) setOpenedOnPathname(location.pathname);
	}

	const isOpen = isTabletLayout && openedOnPathname === location.pathname;
	const setIsOpen = (open: boolean) =>
		setOpenedOnPathname(open ? location.pathname : null);

	return [isOpen, setIsOpen] as const;
}

function ChatButton({
	onClick,
	unreadCount,
}: {
	onClick: () => void;
	unreadCount?: number;
}) {
	return (
		<>
			<SendouButton
				shape="square"
				size="small"
				icon={<MessageSquare />}
				variant="ghost"
				onClick={onClick}
				testId="chat-toggle-button"
			/>
			{unreadCount ? (
				<span
					className={styles.chatUnreadBadge}
					role="status"
					aria-label={`${unreadCount} unread chat ${unreadCount === 1 ? "message" : "messages"}`}
				>
					{unreadCount}
				</span>
			) : null}
		</>
	);
}

/** Stable ref callback, a new one per render would drop the pending mutation records on reconnect. */
function animateActivities(element: HTMLDivElement) {
	if (IS_E2E_TEST_RUN) return;

	return Presence.observe(element);
}
