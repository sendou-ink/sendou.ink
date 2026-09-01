import clsx from "clsx";
import { ChevronsUpDown, Search, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouButton } from "~/components/elements/Button";
import { Image } from "../Image";
import { useAnchorSafeId } from "./Popover";
import { useCloseOnScrollClip } from "./popover-scroll-close";
import styles from "./Select.module.css";

export type SelectKey = string | number;

interface RegisteredItem {
	element: HTMLElement;
	textValue: string;
	disabled: boolean;
	getContent: () => React.ReactNode;
}

/** Stable-identity callbacks items use to wire themselves to the select. */
interface SelectRegistry {
	registerItem: (key: SelectKey, item: RegisteredItem) => () => void;
	select: (key: SelectKey) => void;
	setFocusedKey: (key: SelectKey) => void;
	optionIdFor: (key: SelectKey) => string;
}

interface SelectState {
	selectedKey: SelectKey | null;
	focusedKey: SelectKey | null;
	disabledKeys?: SelectKey[];
	matches: (textValue: string) => boolean;
}

const SelectRegistryContext = React.createContext<SelectRegistry | null>(null);
const SelectStateContext = React.createContext<SelectState | null>(null);

export interface SendouSelectProps<T extends object> {
	label?: string;
	/** Renders a required marker next to the label. */
	labelRequired?: boolean;
	placeholder?: string;
	selectedKey?: SelectKey | null;
	defaultSelectedKey?: SelectKey | null;
	onSelectionChange?: (key: SelectKey | null) => void;
	onOpenChange?: (isOpen: boolean) => void;
	clearable?: boolean;
	disabledKeys?: SelectKey[];
	isDisabled?: boolean;
	isRequired?: boolean;
	/** Submits the selected key with the surrounding form. */
	name?: string;
	"data-testid"?: string;
	"aria-label"?: string;
	className?: string;
	popoverClassName?: string;
	search?: { placeholder?: string; testId?: string; inputClassName?: string };
	/** Value of the search input, used for controlled components */
	searchInputValue?: string;
	/** Callback for when the search input value changes. When defined `items` has to be filtered on the caller side (automatic filtering in component disabled). */
	onSearchInputChange?: (value: string) => void;
	/** Custom search matcher, replacing the default textValue "contains" filter. */
	filter?: (textValue: string, searchValue: string) => boolean;
	errorText?: string;
	bottomText?: string;
	onBlur?: () => void;
	triggerRef?: React.Ref<HTMLButtonElement>;
	items?: Iterable<T>;
	children: React.ReactNode | ((item: T) => React.ReactNode);
}

/**
 * A customizable select component with optional search functionality,
 * rendered through the native popover API with CSS anchor positioning.
 *
 * @example
 * ```tsx
 * <SendouSelect items={items} search={{ placeholder: "Search for items..." }}>
 *   {({ key, ...item }) => (
 *     <SendouSelectItem key={key} {...item}>
 *       {item.name}
 *     </SendouSelectItem>
 *   )}
 * </SendouSelect>
 * ```
 */
export function SendouSelect<T extends object>({
	label,
	labelRequired,
	placeholder,
	selectedKey,
	defaultSelectedKey,
	onSelectionChange,
	onOpenChange,
	clearable = false,
	disabledKeys,
	isDisabled,
	isRequired,
	name,
	"data-testid": testId,
	"aria-label": ariaLabel,
	className,
	popoverClassName,
	search,
	searchInputValue,
	onSearchInputChange,
	filter,
	errorText,
	bottomText,
	onBlur,
	triggerRef,
	items,
	children,
}: SendouSelectProps<T>) {
	const { t } = useTranslation(["common"]);
	const uid = useAnchorSafeId();
	const popoverId = `${uid}-select-popover`;
	const anchorName = `--select-anchor-${uid}`;
	const labelId = label ? `${uid}-select-label` : undefined;
	const valueId = `${uid}-select-value`;
	const triggerId = `${uid}-select-trigger`;
	const hiddenAriaLabelId =
		label && ariaLabel ? `${uid}-select-aria-label` : undefined;

	const [isControlled] = React.useState(selectedKey !== undefined);
	const [uncontrolledKey, setUncontrolledKey] =
		React.useState<SelectKey | null>(defaultSelectedKey ?? null);
	const currentKey = isControlled ? (selectedKey ?? null) : uncontrolledKey;

	const isSearchControlled = !!onSearchInputChange;
	const [uncontrolledSearch, setUncontrolledSearch] = React.useState("");
	const searchValue = isSearchControlled
		? (searchInputValue ?? "")
		: uncontrolledSearch;
	const setSearchValue = (value: string) => {
		if (isSearchControlled) {
			onSearchInputChange(value);
		} else {
			setUncontrolledSearch(value);
		}
	};

	const [open, setOpenState] = React.useState(false);
	const [focusedKey, setFocusedKey] = React.useState<SelectKey | null>(null);
	const [registrationVersion, bumpRegistration] = React.useReducer(
		(count) => count + 1,
		0,
	);

	const itemsMapRef = React.useRef(new Map<SelectKey, RegisteredItem>());
	/** Persists past unregistration so the trigger can render a filtered-out selection. */
	const contentByKeyRef = React.useRef(
		new Map<
			SelectKey,
			{ textValue: string; getContent: () => React.ReactNode }
		>(),
	);

	const triggerElementRef = React.useRef<HTMLButtonElement | null>(null);
	const popoverRef = React.useRef<HTMLDivElement | null>(null);
	const searchInputRef = React.useRef<HTMLInputElement | null>(null);

	useCloseOnScrollClip(open, popoverRef, () => setOpen(false));

	const commitSelection = (key: SelectKey | null) => {
		if (!isControlled) {
			setUncontrolledKey(key);
		}
		onSelectionChange?.(key);
		setOpen(false);
		triggerElementRef.current?.focus();
	};

	function setOpen(next: boolean) {
		if (next) {
			popoverRef.current?.showPopover();
		} else {
			popoverRef.current?.hidePopover();
		}
	}

	const orderedKeys = () =>
		[...itemsMapRef.current.entries()]
			.filter(([, item]) => !item.disabled)
			.sort(([, a], [, b]) =>
				a.element.compareDocumentPosition(b.element) &
				Node.DOCUMENT_POSITION_FOLLOWING
					? -1
					: 1,
			)
			.map(([key]) => key);

	const scrollIntoView = (key: SelectKey | null) => {
		if (key === null) return;
		itemsMapRef.current.get(key)?.element.scrollIntoView({ block: "nearest" });
	};

	const moveFocus = (direction: "next" | "previous" | "first" | "last") => {
		const keys = orderedKeys();
		if (keys.length === 0) return;

		const currentIndex = focusedKey === null ? -1 : keys.indexOf(focusedKey);
		const targetIndex =
			direction === "first"
				? 0
				: direction === "last"
					? keys.length - 1
					: direction === "next"
						? Math.min(currentIndex + 1, keys.length - 1)
						: Math.max(currentIndex - 1, 0);

		setFocusedKey(keys[targetIndex]);
		scrollIntoView(keys[targetIndex]);
	};

	const onTriggerKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			setOpen(true);
		}
	};

	const onPopoverKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			setOpen(false);
			triggerElementRef.current?.focus();
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			moveFocus("next");
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			moveFocus("previous");
			return;
		}
		if (event.key === "Home" && !search) {
			event.preventDefault();
			moveFocus("first");
			return;
		}
		if (event.key === "End" && !search) {
			event.preventDefault();
			moveFocus("last");
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			if (
				focusedKey !== null &&
				!itemsMapRef.current.get(focusedKey)?.disabled
			) {
				commitSelection(focusedKey);
			}
		}
	};

	const onPopoverToggle = (event: React.ToggleEvent<HTMLDivElement>) => {
		const next = event.newState === "open";
		if (next === open) return;
		setOpenState(next);
		onOpenChange?.(next);

		if (next) {
			const initialFocused = currentKey;
			setFocusedKey(initialFocused);
			requestAnimationFrame(() => {
				if (search) {
					searchInputRef.current?.focus();
				} else {
					popoverRef.current?.focus();
				}
				scrollIntoView(initialFocused);
			});
		} else {
			setSearchValue("");
			setFocusedKey(null);
		}
	};

	const commitSelectionRef = React.useRef(commitSelection);
	commitSelectionRef.current = commitSelection;

	const [registry] = React.useState<SelectRegistry>(() => ({
		registerItem: (key, item) => {
			itemsMapRef.current.set(key, item);
			contentByKeyRef.current.set(key, {
				textValue: item.textValue,
				getContent: item.getContent,
			});
			bumpRegistration();
			return () => {
				itemsMapRef.current.delete(key);
				bumpRegistration();
			};
		},
		select: (key) => commitSelectionRef.current(key),
		setFocusedKey: (key) => setFocusedKey(key),
		optionIdFor: (key) => `${popoverId}-option-${key}`,
	}));

	const matches = (textValue: string) => {
		if (searchValue === "") return true;
		if (filter) return filter(textValue, searchValue);
		if (isSearchControlled || !search) return true;
		return searchContains(textValue, searchValue);
	};

	// while searching, keep an actionable item focused so Enter commits the top
	// result the moment it appears
	React.useEffect(() => {
		if (!open || !search || searchValue === "") return;

		const keys = orderedKeys();
		if (focusedKey !== null && keys.includes(focusedKey)) return;
		if (keys[0] !== undefined) {
			setFocusedKey(keys[0]);
		}
	}, [searchValue, open, search, registrationVersion]);

	const selectedEntry =
		currentKey !== null ? contentByKeyRef.current.get(currentKey) : undefined;

	const renderedChildren =
		typeof children === "function"
			? Array.from(items ?? []).map(children)
			: children;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: only observes focus leaving the select
		<div
			className={clsx(className, styles.select)}
			data-testid={testId}
			onBlur={(event) => {
				if (
					event.relatedTarget instanceof Node &&
					event.currentTarget.contains(event.relatedTarget)
				) {
					return;
				}
				onBlur?.();
			}}
		>
			{label ? (
				<label className={styles.label} id={labelId} htmlFor={triggerId}>
					{label}
					{labelRequired ? <span className="text-error"> *</span> : null}
				</label>
			) : null}
			{hiddenAriaLabelId ? (
				<span id={hiddenAriaLabelId} hidden>
					{ariaLabel}
				</span>
			) : null}
			<button
				type="button"
				id={triggerId}
				className={styles.button}
				ref={(element) => {
					triggerElementRef.current = element;
					if (typeof triggerRef === "function") {
						triggerRef(element);
					} else if (triggerRef) {
						triggerRef.current = element;
					}
				}}
				disabled={isDisabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={label ? undefined : ariaLabel}
				aria-labelledby={
					labelId
						? hiddenAriaLabelId
							? `${labelId} ${hiddenAriaLabelId} ${valueId}`
							: `${valueId} ${labelId}`
						: undefined
				}
				data-required={isRequired || undefined}
				popoverTarget={popoverId}
				style={{ anchorName } as React.CSSProperties}
				onKeyDown={onTriggerKeyDown}
			>
				<span
					id={valueId}
					className={styles.selectValue}
					data-placeholder={selectedEntry === undefined ? "true" : undefined}
				>
					{selectedEntry !== undefined && currentKey !== null
						? (selectedEntry.getContent() ?? selectedEntry.textValue)
						: placeholder}
				</span>
				<span aria-hidden="true">
					<ChevronsUpDown className={styles.icon} />
				</span>
			</button>
			{clearable && currentKey !== null ? (
				<SendouButton
					variant="minimal-destructive"
					size="miniscule"
					icon={<X />}
					onPress={() => commitSelection(null)}
					className={styles.clearButton}
				>
					Clear
				</SendouButton>
			) : null}
			{name ? (
				<input type="hidden" name={name} value={currentKey ?? ""} />
			) : null}
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			{/* biome-ignore lint/a11y/noStaticElementInteractions: keydown steers the listbox inside */}
			<div
				ref={popoverRef}
				id={popoverId}
				popover="auto"
				className={clsx(styles.popover, popoverClassName)}
				style={{ positionAnchor: anchorName } as React.CSSProperties}
				onToggle={onPopoverToggle}
				onKeyDown={onPopoverKeyDown}
				tabIndex={-1}
			>
				{search && open ? (
					<div
						className={styles.searchField}
						data-empty={searchValue === "" ? "true" : undefined}
					>
						<Search aria-hidden className={styles.icon} />
						<input
							type="search"
							ref={searchInputRef}
							value={searchValue}
							onChange={(event) => setSearchValue(event.target.value)}
							placeholder={search.placeholder}
							aria-label="Search"
							data-testid={search.testId}
							className={clsx(
								search.inputClassName ?? "in-container",
								styles.searchInput,
							)}
						/>
						<button
							type="button"
							className={styles.searchClearButton}
							tabIndex={-1}
							aria-label="Clear"
							onClick={() => {
								setSearchValue("");
								searchInputRef.current?.focus();
							}}
						>
							<X className={styles.icon} />
						</button>
					</div>
				) : null}
				{/* labelled only while open so a closed select exposes exactly one
				    element under its label (the trigger) to queries */}
				<div
					className={clsx(styles.listBox, "scrollbar")}
					role="listbox"
					aria-labelledby={open ? labelId : undefined}
				>
					<SelectRegistryContext value={registry}>
						<SelectStateContext
							value={{
								selectedKey: currentKey,
								focusedKey,
								disabledKeys,
								matches,
							}}
						>
							{renderedChildren}
						</SelectStateContext>
					</SelectRegistryContext>
					<div className={styles.noResults}>{t("common:noResults")}</div>
				</div>
			</div>
		</div>
	);
}

function normalizeForSearch(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();
}

/** Case- and diacritic-insensitive "contains" matcher, the select's default search filter. */
export function searchContains(value: string, substring: string) {
	return normalizeForSearch(value).includes(normalizeForSearch(substring));
}

export interface SendouSelectItemProps {
	id: SelectKey;
	textValue?: string;
	isDisabled?: boolean;
	className?: string;
	"data-testid"?: string;
	"data-status"?: string;
	children: React.ReactNode;
}

export function SendouSelectItem({
	id,
	textValue,
	isDisabled: isDisabledProp = false,
	className,
	"data-testid": testId,
	"data-status": dataStatus,
	children,
}: SendouSelectItemProps) {
	const registry = React.use(SelectRegistryContext);
	const state = React.use(SelectStateContext);
	if (!registry || !state) {
		throw new Error("SendouSelectItem must be inside SendouSelect");
	}

	const isDisabled = isDisabledProp || !!state.disabledKeys?.includes(id);
	const resolvedText =
		textValue ?? (typeof children === "string" ? children : "");
	const visible = state.matches(resolvedText);

	const childrenRef = React.useRef(children);
	childrenRef.current = children;
	const elementRef = React.useRef<HTMLDivElement | null>(null);

	React.useEffect(() => {
		if (!visible) return;
		const element = elementRef.current;
		if (!element) return;
		return registry.registerItem(id, {
			element,
			textValue: resolvedText,
			disabled: isDisabled,
			getContent: () => childrenRef.current,
		});
	}, [visible, id, resolvedText, isDisabled, registry]);

	if (!visible) return null;

	const isSelected = state.selectedKey === id;
	const isFocused = state.focusedKey === id;

	return (
		<div
			ref={elementRef}
			id={registry.optionIdFor(id)}
			role="option"
			tabIndex={-1}
			aria-selected={isSelected}
			aria-disabled={isDisabled || undefined}
			data-disabled={isDisabled ? "true" : undefined}
			data-testid={testId}
			data-status={dataStatus}
			className={clsx(styles.item, className, {
				[styles.itemFocused]: isFocused,
				[styles.itemSelected]: isSelected,
			})}
			onClick={() => {
				if (!isDisabled) registry.select(id);
			}}
			onPointerMove={() => {
				if (!isDisabled) registry.setFocusedKey(id);
			}}
		>
			{children}
		</div>
	);
}

interface SendouSelectItemSectionProps {
	heading: string;
	headingImgPath?: string;
	children: React.ReactNode;
	className?: string;
}

export function SendouSelectItemSection({
	heading,
	headingImgPath,
	children,
	className,
}: SendouSelectItemSectionProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset would carry form semantics this listbox section does not have
		<div role="group" aria-label={heading} className={styles.section}>
			<div className={clsx(className, styles.categoryHeading)}>
				{headingImgPath ? (
					<Image path={headingImgPath} size={28} alt="" />
				) : null}
				{heading}
				<div className={styles.categoryDivider} />
			</div>
			{children}
		</div>
	);
}
