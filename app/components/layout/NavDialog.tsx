import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { navItems } from "~/components/layout/nav-items";
import { useUser } from "~/features/auth/core/user";
import { LOG_OUT_URL, navIconUrl, userPage } from "~/utils/urls";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Dialog } from "../Dialog";
import { Image } from "../Image";
import { CrossIcon } from "../icons/Cross";
import { LogOutIcon } from "../icons/LogOut";
import { LogInButtonContainer } from "./LogInButtonContainer";

export function NavDialog({
	isOpen,
	close,
}: { isOpen: boolean; close: () => void }) {
	const user = useUser();
	const { t } = useTranslation(["common"]);

	if (!isOpen) {
		return null;
	}

	return (
		<Dialog isOpen className="layout__overlay-nav__dialog">
			<Button
				icon={<CrossIcon />}
				variant="minimal-destructive"
				className="layout__overlay-nav__close-button"
				onClick={close}
				aria-label="Close navigation dialog"
			/>
			<div className="layout__overlay-nav__nav-items-container">
				<LogInButton close={close} />
				{navItems.map((item) => (
					<Link
						to={`/${item.url}`}
						className="layout__overlay-nav__nav-item"
						key={item.name}
						prefetch={item.prefetch ? "render" : undefined}
						onClick={close}
					>
						<div className="layout__overlay-nav__nav-image-container">
							<Image
								path={navIconUrl(item.name)}
								height={48}
								width={48}
								alt=""
							/>
						</div>
						<div>{t(`common:pages.${item.name}` as any)}</div>
					</Link>
				))}
			</div>
			{user ? (
				<div className="mt-6 w-max mx-auto">
					<form method="post" action={LOG_OUT_URL}>
						<Button
							size="tiny"
							variant="outlined"
							icon={<LogOutIcon />}
							type="submit"
						>
							{t("common:header.logout")}
						</Button>
					</form>
				</div>
			) : null}
		</Dialog>
	);
}

function LogInButton({ close }: { close: () => void }) {
	const { t } = useTranslation(["common"]);
	const user = useUser();

	if (user) {
		return (
			<Link
				to={userPage(user)}
				className="layout__overlay-nav__nav-item"
				onClick={close}
			>
				<div className="layout__overlay-nav__nav-image-container">
					<Avatar
						user={user}
						alt={t("common:header.loggedInAs", {
							userName: `${user.username}`,
						})}
						className="layout__overlay-nav__avatar"
						size="sm"
					/>
				</div>
				{t("common:pages.myPage")}
			</Link>
		);
	}

	return (
		<div className="layout__overlay-nav__nav-item">
			<LogInButtonContainer>
				<button
					className="layout__overlay-nav__log-in-button layout__overlay-nav__nav-image-container"
					type="submit"
				>
					<Image path={navIconUrl("log_in")} height={48} width={48} alt="" />
				</button>
			</LogInButtonContainer>
			{t("common:header.login")}
		</div>
	);
}
