import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
	type SelectFieldAriaProps,
	type SelectKey,
	SendouSelect,
	SendouSelectItem,
} from "~/components/elements/Select";
import { StageImage } from "~/components/Image";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { StageId } from "~/modules/in-game-lists/types";
import styles from "./StageSelect.module.css";

interface StageSelectProps<Clearable extends boolean | undefined = undefined>
	extends SelectFieldAriaProps {
	label?: string;
	value?: StageId | null;
	initialValue?: StageId;
	onChange?: (
		stageId: StageId | (Clearable extends true ? null : never),
	) => void;
	clearable?: Clearable;
	testId?: string;
	isRequired?: boolean;
	isDisabled?: boolean;
}

export function StageSelect<Clearable extends boolean | undefined = undefined>({
	label,
	value,
	initialValue,
	onChange,
	clearable,
	testId = "stage-select",
	isRequired,
	isDisabled,
	...triggerProps
}: StageSelectProps<Clearable>) {
	const { t } = useTranslation(["common", "game-misc"]);
	const items = useStageItems();

	const isControlled = value !== undefined;

	const handleOnChange = (key: SelectKey | null) => {
		if (key === null) return onChange?.(null as any);
		onChange?.(Number(key) as any);
	};

	return (
		<SendouSelect
			aria-label={
				!label && !triggerProps["aria-labelledby"]
					? t("common:forms.stageSearch.placeholder")
					: undefined
			}
			{...triggerProps}
			items={items}
			label={label}
			placeholder={t("common:forms.stageSearch.placeholder")}
			search={{
				placeholder: t("common:forms.stageSearch.search.placeholder"),
			}}
			selectedKey={isControlled ? value : undefined}
			defaultSelectedKey={
				isControlled ? undefined : (initialValue as SelectKey)
			}
			onSelectionChange={handleOnChange}
			clearable={clearable}
			data-testid={testId}
			isRequired={isRequired}
			isDisabled={isDisabled}
		>
			{({ id, name }) => (
				<SendouSelectItem key={id} id={id} textValue={name}>
					<div className={styles.item}>
						<StageImage
							stageId={id as StageId}
							width={42}
							className={styles.stageImg}
							alt=""
						/>
						<span
							className={clsx(styles.stageLabel, "truncate")}
							data-testid={`stage-select-option-${name}`}
						>
							{name}
						</span>
					</div>
				</SendouSelectItem>
			)}
		</SendouSelect>
	);
}

function useStageItems() {
	const { t } = useTranslation(["game-misc"]);

	return stageIds.map((id) => ({
		id,
		name: t(`game-misc:STAGE_${id}`),
	}));
}
