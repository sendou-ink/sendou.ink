import clsx from "clsx";
import { Languages } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import {
	IN_GAME_NAME_CHARACTER_CATEGORIES,
	IN_GAME_NAME_MAX_LENGTH,
	inGameNameLength,
	sanitizeInGameName,
} from "~/features/user-page/in-game-name";
import styles from "./IngameNameInput.module.css";

interface IngameNameInputProps
	extends Pick<
		React.AriaAttributes,
		"aria-invalid" | "aria-describedby" | "aria-errormessage" | "aria-required"
	> {
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	id?: string;
	name?: string;
	disabled?: boolean;
	placeholder?: string;
}

export function IngameNameInput({
	value,
	onChange,
	onBlur,
	id,
	name,
	disabled,
	placeholder,
	...ariaProps
}: IngameNameInputProps) {
	const { t } = useTranslation(["forms"]);
	const [isPickerOpen, setIsPickerOpen] = React.useState(false);

	const inputRef = React.useRef<HTMLInputElement>(null);
	const selectionRef = React.useRef({ start: value.length, end: value.length });
	const pendingCaretRef = React.useRef<number | null>(null);

	React.useEffect(() => {
		if (pendingCaretRef.current === null) return;

		const caret = pendingCaretRef.current;
		pendingCaretRef.current = null;

		const input = inputRef.current;
		input?.focus();
		input?.setSelectionRange(caret, caret);
	});

	const rememberSelection = () => {
		const input = inputRef.current;
		if (!input) return;

		selectionRef.current = {
			start: input.selectionStart ?? value.length,
			end: input.selectionEnd ?? value.length,
		};
	};

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const raw = event.target.value;
		const cleaned = sanitizeInGameName(raw);

		if (cleaned !== raw) {
			const caret = event.target.selectionStart ?? cleaned.length;
			pendingCaretRef.current = Math.max(
				0,
				Math.min(cleaned.length, caret - (raw.length - cleaned.length)),
			);
		}

		onChange(cleaned);
	};

	const insertCharacter = (character: string) => {
		const { start, end } = selectionRef.current;
		const before = value.slice(0, start);
		const after = value.slice(end);

		if (
			inGameNameLength(before + after) + inGameNameLength(character) >
			IN_GAME_NAME_MAX_LENGTH
		) {
			return;
		}

		const caret = before.length + character.length;
		pendingCaretRef.current = caret;
		selectionRef.current = { start: caret, end: caret };
		onChange(before + character + after);
	};

	return (
		<div className={styles.root}>
			<div className={styles.inputRow}>
				<input
					ref={inputRef}
					id={id}
					name={name}
					type="text"
					value={value}
					disabled={disabled}
					placeholder={placeholder}
					maxLength={IN_GAME_NAME_MAX_LENGTH}
					autoComplete="off"
					spellCheck={false}
					onChange={handleChange}
					onBlur={onBlur}
					onSelect={rememberSelection}
					{...ariaProps}
				/>
				<SendouButton
					variant="minimal"
					size="small"
					shape="square"
					icon={<Languages />}
					isDisabled={disabled}
					aria-label={t("forms:inGameName.addCharacter")}
					aria-expanded={isPickerOpen}
					onPress={() => setIsPickerOpen((open) => !open)}
				/>
			</div>
			{isPickerOpen ? (
				<SendouTabs className={styles.picker}>
					<SendouTabList>
						{IN_GAME_NAME_CHARACTER_CATEGORIES.map((category) => (
							<SendouTab key={category.id} id={category.id}>
								{t(category.label)}
							</SendouTab>
						))}
					</SendouTabList>
					{IN_GAME_NAME_CHARACTER_CATEGORIES.map((category) => (
						<SendouTabPanel key={category.id} id={category.id}>
							<div className={clsx(styles.grid, "scrollbar")}>
								{category.characters.map((character) => (
									<button
										key={character}
										type="button"
										className={styles.glyph}
										onMouseDown={(event) => event.preventDefault()}
										onClick={() => insertCharacter(character)}
									>
										{character}
									</button>
								))}
							</div>
						</SendouTabPanel>
					))}
				</SendouTabs>
			) : null}
		</div>
	);
}
