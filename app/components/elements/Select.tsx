import clsx from "clsx";
import { ChevronsUpDown, Search, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouButton } from "~/components/elements/Button";
import { Image } from "../Image";
import { useAnchorPositionFallback } from "./anchor-position-fallback";
import { isOwnToggle, useAnchorSafeId } from "./Popover";
import styles from "./Select.module.css";
import { useCloseOnScrollClip } from "./useCloseOnScrollClip";

// xxx: why when weaponselect e.g. going out from the bottom of the screen dont get popover up top? only when we type and clear it goes to the top (as expected)
// xxx: when top one fixed, always keep the selection above/below instead of flip flopping even if the contents height shrinks

export type SelectKey = string | number;

interface RegisteredItem {
	element: HTMLElement;
	textValue: string;
	disabled: boolean;
	getContent: () => React.ReactNode;
}

/**
 * Focused option kept outside React state so hovering across options
 * re-renders only the two options whose focus changed, not the whole list.
 */
interface FocusStore {
	get: () => SelectKey | null;
	set: (key: SelectKey | null) => void;
	subscribe: (listener: () => void) => () => void;
}

/** Stable-identity callbacks items use to wire themselves to the select. */
interface SelectRegistry {
	registerItem: (key: SelectKey, item: RegisteredItem) => () => void;
	select: (key: SelectKey) => void;
	focus: FocusStore;
	optionIdFor: (key: SelectKey) => string;
}

interface SelectState {
	open: boolean;
	selectedKey: SelectKey | null;
	disabledKeys?: Set<SelectKey>;
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
 * Options mount only while the popover is open (plus the selected one, so the
 * trigger can show it); the trigger's content is read straight from the
 * `SendouSelectItem` element matching the selection, so it is server rendered.
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
	const listboxId = `${uid}-select-listbox`;
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
	const [, rerenderWithRegisteredContent] = React.useReducer(
		(count: number) => count + 1,
		0,
	);

	const itemsMapRef = React.useRef(new Map<SelectKey, RegisteredItem>());
	const keyByElementRef = React.useRef(new WeakMap<HTMLElement, SelectKey>());
	/** Persists past unregistration so the trigger can render a filtered-out selection. */
	const contentByKeyRef = React.useRef(
		new Map<
			SelectKey,
			{ textValue: string; getContent: () => React.ReactNode }
		>(),
	);
	/** Selection whose content only a wrapped item's registration can provide. */
	const unresolvedSelectionRef = React.useRef<SelectKey | null>(null);
	const normalizedTextCacheRef = React.useRef(new Map<string, string>());

	const triggerElementRef = React.useRef<HTMLButtonElement | null>(null);
	const popoverRef = React.useRef<HTMLDivElement | null>(null);
	const listboxRef = React.useRef<HTMLDivElement | null>(null);
	const searchInputRef = React.useRef<HTMLInputElement | null>(null);

	useCloseOnScrollClip(open, popoverRef, () => setOpen(false));
	useAnchorPositionFallback({
		isOpen: open,
		popoverRef,
		getAnchor: () => triggerElementRef.current,
		matchAnchorWidth: true,
		constrainHeight: true,
	});

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

	const commitSelectionRef = React.useRef(commitSelection);
	commitSelectionRef.current = commitSelection;

	const [registry] = React.useState<SelectRegistry>(() => ({
		registerItem: (key, item) => {
			itemsMapRef.current.set(key, item);
			keyByElementRef.current.set(item.element, key);
			contentByKeyRef.current.set(key, {
				textValue: item.textValue,
				getContent: item.getContent,
			});
			if (key === unresolvedSelectionRef.current) {
				rerenderWithRegisteredContent();
			}
			return () => {
				itemsMapRef.current.delete(key);
			};
		},
		select: (key) => commitSelectionRef.current(key),
		focus: createFocusStore(),
		optionIdFor: (key) => `${popoverId}-option-${key}`,
	}));
	const focusStore = registry.focus;

	/** Keys of the enabled options in DOM order. */
	const orderedKeys = () => {
		const listbox = listboxRef.current;
		if (!listbox) return [];

		const keys: SelectKey[] = [];
		for (const element of listbox.querySelectorAll<HTMLElement>(
			'[role="option"]',
		)) {
			const key = keyByElementRef.current.get(element);
			if (key === undefined || itemsMapRef.current.get(key)?.disabled) {
				continue;
			}
			keys.push(key);
		}
		return keys;
	};

	const scrollIntoView = (key: SelectKey | null) => {
		if (key === null) return;
		itemsMapRef.current.get(key)?.element.scrollIntoView({ block: "nearest" });
	};

	const moveFocus = (direction: "next" | "previous" | "first" | "last") => {
		const keys = orderedKeys();
		if (keys.length === 0) return;

		const focusedKey = focusStore.get();
		const currentIndex = focusedKey === null ? -1 : keys.indexOf(focusedKey);
		const targetIndex =
			direction === "first"
				? 0
				: direction === "last"
					? keys.length - 1
					: direction === "next"
						? Math.min(currentIndex + 1, keys.length - 1)
						: Math.max(currentIndex - 1, 0);

		focusStore.set(keys[targetIndex]);
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
		if (event.key === "Tab") {
			triggerElementRef.current?.focus();
			setOpen(false);
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
			const focusedKey = focusStore.get();
			if (
				focusedKey !== null &&
				!itemsMapRef.current.get(focusedKey)?.disabled
			) {
				commitSelection(focusedKey);
			}
		}
	};

	const onPopoverToggle = (event: React.ToggleEvent<HTMLDivElement>) => {
		if (!isOwnToggle(event)) return;

		const next = event.newState === "open";
		if (next === open) return;
		setOpenState(next);
		onOpenChange?.(next);

		if (next) {
			focusStore.set(currentKey);
			// the toggle event's render mounts the options synchronously, so they
			// are registered by the time this runs
			requestAnimationFrame(() => {
				if (search) {
					searchInputRef.current?.focus();
				} else {
					listboxRef.current?.focus();
				}
				scrollIntoView(currentKey);
			});
		} else {
			setSearchValue("");
			focusStore.set(null);
		}
	};

	const normalizedSearchValue = normalizeForSearch(searchValue);
	const normalizedTextValue = (textValue: string) => {
		const cache = normalizedTextCacheRef.current;
		let normalized = cache.get(textValue);
		if (normalized === undefined) {
			normalized = normalizeForSearch(textValue);
			cache.set(textValue, normalized);
		}
		return normalized;
	};

	const matches = (textValue: string) => {
		if (searchValue === "") return true;
		if (filter) return filter(textValue, searchValue);
		if (isSearchControlled || !search) return true;
		return normalizedTextValue(textValue).includes(normalizedSearchValue);
	};

	// while searching, keep an actionable item focused so Enter commits the top
	// result the moment it appears; deliberately runs after every render since
	// controlled results can arrive without the search value changing
	React.useEffect(() => {
		if (!open || !search || searchValue === "") return;

		const focusedKey = focusStore.get();
		if (
			focusedKey !== null &&
			itemsMapRef.current.get(focusedKey)?.disabled === false
		) {
			return;
		}
		const firstKey = orderedKeys()[0];
		if (firstKey !== undefined) {
			focusStore.set(firstKey);
		}
	});

	const state: SelectState = {
		open,
		selectedKey: currentKey,
		disabledKeys: disabledKeys ? new Set(disabledKeys) : undefined,
		matches,
	};

	const renderedChildren =
		typeof children === "function"
			? Array.from(items ?? []).map(children)
			: children;

	let selectedItemContent: React.ReactNode | undefined;
	let visibleItemCount = 0;
	forEachItemElement(
		renderedChildren,
		(itemProps) => {
			if (itemProps.id === currentKey) {
				selectedItemContent = itemProps.children;
			}
			if (isItemVisible(state, itemProps.id, resolveTextValue(itemProps))) {
				visibleItemCount++;
			}
		},
		() => {
			visibleItemCount++;
		},
	);

	const registeredSelection =
		selectedItemContent === undefined && currentKey !== null
			? contentByKeyRef.current.get(currentKey)
			: undefined;
	const selectedContent =
		selectedItemContent !== undefined
			? selectedItemContent
			: registeredSelection
				? (registeredSelection.getContent() ?? registeredSelection.textValue)
				: undefined;
	unresolvedSelectionRef.current =
		selectedContent === undefined ? currentKey : null;

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
				if (event.relatedTarget instanceof Node) {
					setOpen(false);
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
					data-placeholder={selectedContent === undefined ? "true" : undefined}
				>
					{selectedContent !== undefined ? selectedContent : placeholder}
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
					onClick={() => commitSelection(null)}
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
					<SearchField
						registry={registry}
						inputRef={searchInputRef}
						value={searchValue}
						onChange={setSearchValue}
						placeholder={search.placeholder}
						listboxId={listboxId}
						testId={search.testId}
						className={clsx(
							search.inputClassName ?? "in-container",
							styles.searchInput,
						)}
					/>
				) : null}
				<Listbox
					registry={registry}
					open={open}
					listboxRef={listboxRef}
					id={listboxId}
					labelId={labelId}
				>
					<SelectRegistryContext value={registry}>
						<SelectStateContext value={state}>
							{renderedChildren}
						</SelectStateContext>
					</SelectRegistryContext>
					{open && visibleItemCount === 0 ? (
						<div className={styles.noResults}>{t("common:noResults")}</div>
					) : null}
				</Listbox>
			</div>
		</div>
	);
}

function createFocusStore(): FocusStore {
	let focusedKey: SelectKey | null = null;
	const listeners = new Set<() => void>();

	return {
		get: () => focusedKey,
		set: (key) => {
			if (key === focusedKey) return;
			focusedKey = key;
			for (const listener of listeners) {
				listener();
			}
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

/** Subscribes only this component to focus changes, keeping the select root out of hover re-renders. */
function useActiveDescendant(registry: SelectRegistry, open: boolean) {
	const focusedKey = React.useSyncExternalStore(
		registry.focus.subscribe,
		registry.focus.get,
		() => null,
	);
	return open && focusedKey !== null
		? registry.optionIdFor(focusedKey)
		: undefined;
}

function SearchField({
	registry,
	inputRef,
	value,
	onChange,
	placeholder,
	listboxId,
	testId,
	className,
}: {
	registry: SelectRegistry;
	inputRef: React.RefObject<HTMLInputElement | null>;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	listboxId: string;
	testId?: string;
	className: string;
}) {
	const activeDescendant = useActiveDescendant(registry, true);

	return (
		<div
			className={styles.searchField}
			data-empty={value === "" ? "true" : undefined}
		>
			<Search aria-hidden className={styles.icon} />
			<input
				type="search"
				ref={inputRef}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				role="combobox"
				aria-label="Search"
				aria-controls={listboxId}
				aria-expanded
				aria-autocomplete="list"
				aria-activedescendant={activeDescendant}
				data-testid={testId}
				className={className}
			/>
			<button
				type="button"
				className={styles.searchClearButton}
				tabIndex={-1}
				aria-label="Clear"
				onClick={() => {
					onChange("");
					inputRef.current?.focus();
				}}
			>
				<X className={styles.icon} />
			</button>
		</div>
	);
}

function Listbox({
	registry,
	open,
	listboxRef,
	id,
	labelId,
	children,
}: {
	registry: SelectRegistry;
	open: boolean;
	listboxRef: React.RefObject<HTMLDivElement | null>;
	id: string;
	labelId?: string;
	children: React.ReactNode;
}) {
	const activeDescendant = useActiveDescendant(registry, open);

	return (
		// labelled only while open so a closed select exposes exactly one
		// element under its label (the trigger) to queries
		<div
			ref={listboxRef}
			id={id}
			className={clsx(styles.listBox, "scrollbar")}
			role="listbox"
			tabIndex={-1}
			aria-labelledby={open ? labelId : undefined}
			aria-activedescendant={activeDescendant}
		>
			{children}
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

function resolveTextValue({ textValue, children }: SendouSelectItemProps) {
	return textValue ?? (typeof children === "string" ? children : "");
}

/** Closed selects keep only the selected option mounted, open ones the search matches. */
function isItemVisible(state: SelectState, id: SelectKey, textValue: string) {
	if (!state.open) return state.selectedKey === id;
	return state.matches(textValue);
}

/**
 * Visits the `SendouSelectItem` elements reachable through arrays, fragments
 * and sections. Items hidden behind other components are opaque: `onOpaque`
 * lets callers treat them as present.
 */
function forEachItemElement(
	node: React.ReactNode,
	visit: (props: SendouSelectItemProps) => void,
	onOpaque: () => void,
) {
	if (Array.isArray(node)) {
		for (const child of node) {
			forEachItemElement(child, visit, onOpaque);
		}
		return;
	}
	if (!React.isValidElement(node)) return;

	if (node.type === SendouSelectItem) {
		visit(node.props as SendouSelectItemProps);
	} else if (
		node.type === React.Fragment ||
		node.type === SendouSelectItemSection
	) {
		forEachItemElement(
			(node.props as { children?: React.ReactNode }).children,
			visit,
			onOpaque,
		);
	} else {
		onOpaque();
	}
}

function hasVisibleItems(state: SelectState, node: React.ReactNode) {
	let found = false;
	forEachItemElement(
		node,
		(itemProps) => {
			if (isItemVisible(state, itemProps.id, resolveTextValue(itemProps))) {
				found = true;
			}
		},
		() => {
			found = true;
		},
	);
	return found;
}

export function SendouSelectItem(props: SendouSelectItemProps) {
	const {
		id,
		isDisabled: isDisabledProp = false,
		className,
		"data-testid": testId,
		"data-status": dataStatus,
		children,
	} = props;
	const registry = React.use(SelectRegistryContext);
	const state = React.use(SelectStateContext);
	if (!registry || !state) {
		throw new Error("SendouSelectItem must be inside SendouSelect");
	}

	const isDisabled = isDisabledProp || !!state.disabledKeys?.has(id);
	const resolvedText = resolveTextValue(props);
	const visible = isItemVisible(state, id, resolvedText);
	const isFocused = React.useSyncExternalStore(
		registry.focus.subscribe,
		() => registry.focus.get() === id,
		() => false,
	);

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
				if (!isDisabled) registry.focus.set(id);
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
	const state = React.use(SelectStateContext);
	if (!state) {
		throw new Error("SendouSelectItemSection must be inside SendouSelect");
	}
	if (!hasVisibleItems(state, children)) return null;

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
