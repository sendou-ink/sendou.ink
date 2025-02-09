import { useUser } from "~/features/auth/core/user";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { BellIcon } from "../icons/Bell";

// xxx: add refresh button
export function NotificationPopover() {
	const user = useUser();

	if (!user) {
		return null;
	}

	return (
		<SendouPopover
			trigger={
				<SendouButton icon={<BellIcon />} className="layout__header__button" />
			}
			popoverClassName="layout__notifications__container"
		>
			<h2 className="layout__notifications__header">
				<BellIcon /> Notifications
			</h2>
			<hr className="layout__notifications__divider" />
			<div className="layout__notifications__no-notifications">
				None yet, check back later
			</div>
		</SendouPopover>
	);
}
