import clsx from "clsx";
import { ChevronDown, Plus, RotateCcw, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import { SendouButton } from "../elements/Button";
import { SendouMenu, SendouMenuItem } from "../elements/Menu";
import { SendouPopover } from "../elements/Popover";
import { LogInPopover } from "../LogInPopover";
import styles from "./FilterBar.module.css";

export interface FilterBarPill {
	key: string;
	/** Translated filter name shown on the pill and in the add filter menu. */
	name: string;
	/** Translated current value shown on the pill. Null when the filter is at its default. */
	formattedValue: React.ReactNode | null;
	/** Popover content. Inputs inside write search params directly (instant apply). */
	popover: React.ReactNode;
	/** Resets the pill's param(s) to defaults. Renders the remove button. */
	onRemove?: () => void;
	/** Writes a starting value when the pill is added from the menu. */
	onAdd?: () => void;
	/** Usable logged out, where every other pill prompts to log in instead. */
	usableLoggedOut?: boolean;
	icon?: React.ReactNode;
	popoverClassName?: string;
	testId?: string;
}

export function FilterBar({
	pills,
	onReset,
	actions,
}: {
	pills: FilterBarPill[];
	/** Resets every pill's param(s) to defaults. Renders the reset button. */
	onReset?: () => void;
	actions?: React.ReactNode;
}) {
	const isLoggedIn = Boolean(useUser());
	const { t } = useTranslation();
	const [justAddedKeys, setJustAddedKeys] = React.useState<ReadonlySet<string>>(
		new Set(),
	);
	const [openPillKey, setOpenPillKey] = React.useState<string | null>(null);

	/** A logged out visitor has no add filter menu to bring a pill back with. */
	const isPinned = (pill: FilterBarPill) =>
		!isLoggedIn && Boolean(pill.usableLoggedOut);

	const isVisible = (pill: FilterBarPill) =>
		pill.formattedValue !== null ||
		justAddedKeys.has(pill.key) ||
		isPinned(pill);

	const isRemovable = (pill: FilterBarPill) =>
		Boolean(pill.onRemove) && (pill.formattedValue !== null || !isPinned(pill));

	const hiddenPills = pills.filter((pill) => !isVisible(pill));

	const addPill = (pill: FilterBarPill) => {
		setJustAddedKeys((prev) => new Set(prev).add(pill.key));
		setOpenPillKey(pill.key);
		pill.onAdd?.();
	};

	const removePill = (pill: FilterBarPill) => {
		setJustAddedKeys((prev) => {
			const next = new Set(prev);
			next.delete(pill.key);
			return next;
		});
		if (openPillKey === pill.key) {
			setOpenPillKey(null);
		}
		pill.onRemove?.();
	};

	const resetPills = () => {
		setJustAddedKeys(new Set());
		setOpenPillKey(null);
		onReset?.();
	};

	return (
		<div className={styles.bar}>
			{pills.filter(isVisible).map((pill) => (
				<FilterPill
					key={pill.key}
					pill={pill}
					showLogInPrompt={!isLoggedIn && !pill.usableLoggedOut}
					isOpen={openPillKey === pill.key}
					onOpenChange={(isOpen) => setOpenPillKey(isOpen ? pill.key : null)}
					onRemove={isRemovable(pill) ? () => removePill(pill) : undefined}
				/>
			))}
			{hiddenPills.length > 0 ? (
				<AddFilterMenu
					pills={hiddenPills}
					isLoggedIn={isLoggedIn}
					onAdd={addPill}
				/>
			) : null}
			{onReset || actions ? (
				<div className={styles.actions}>
					{onReset ? (
						<SendouButton icon={<RotateCcw />} onClick={resetPills}>
							{t("actions.reset")}
						</SendouButton>
					) : null}
					{actions}
				</div>
			) : null}
		</div>
	);
}

function FilterPill({
	pill,
	showLogInPrompt,
	isOpen,
	onOpenChange,
	onRemove,
}: {
	pill: FilterBarPill;
	showLogInPrompt: boolean;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onRemove?: () => void;
}) {
	const trigger = (
		<button
			type="button"
			className={styles.trigger}
			data-active={pill.formattedValue !== null}
			data-testid={pill.testId}
		>
			{pill.icon ? <span className={styles.icon}>{pill.icon}</span> : null}
			<span>{pill.name}</span>
			{pill.formattedValue !== null ? (
				<span className={styles.value}>{pill.formattedValue}</span>
			) : null}
			<ChevronDown className={styles.chevron} />
		</button>
	);

	return (
		<div className={styles.pill}>
			{showLogInPrompt ? (
				<LogInPopover>{trigger}</LogInPopover>
			) : (
				<SendouPopover
					isOpen={isOpen}
					onOpenChange={onOpenChange}
					popoverClassName={clsx(styles.popover, pill.popoverClassName)}
					trigger={trigger}
				>
					{pill.popover}
				</SendouPopover>
			)}
			{onRemove ? (
				<button
					type="button"
					className={styles.removeButton}
					aria-label={`Remove ${pill.name} filter`}
					onClick={onRemove}
					data-testid={pill.testId ? `${pill.testId}-remove` : undefined}
				>
					<X />
				</button>
			) : null}
		</div>
	);
}

function AddFilterMenu({
	pills,
	isLoggedIn,
	onAdd,
}: {
	pills: FilterBarPill[];
	isLoggedIn: boolean;
	onAdd: (pill: FilterBarPill) => void;
}) {
	const { t } = useTranslation();

	const trigger = (
		<button
			type="button"
			className={styles.trigger}
			data-testid="add-filter-button"
		>
			<Plus className={styles.plus} />
			<span>{t("filterBar.addFilter")}</span>
		</button>
	);

	if (!isLoggedIn) {
		return (
			<div className={styles.pill}>
				<LogInPopover>{trigger}</LogInPopover>
			</div>
		);
	}

	return (
		<div className={styles.pill}>
			<SendouMenu trigger={trigger}>
				{pills.map((pill) => (
					<SendouMenuItem
						key={pill.key}
						icon={pill.icon}
						onAction={() => onAdd(pill)}
						data-testid={pill.testId ? `menu-item-${pill.testId}` : undefined}
					>
						{pill.name}
					</SendouMenuItem>
				))}
			</SendouMenu>
		</div>
	);
}
