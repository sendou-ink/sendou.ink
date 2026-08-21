import clsx from "clsx";
import styles from "./Label.module.css";

type LabelProps = Pick<
	React.DetailedHTMLProps<
		React.LabelHTMLAttributes<HTMLLabelElement>,
		HTMLLabelElement
	>,
	"children" | "htmlFor"
> & {
	valueLimits?: {
		current: number;
		max: number;
	};
	required?: boolean;
	className?: string;
	labelClassName?: string;
	spaced?: boolean;
};

export function Label({
	valueLimits,
	required,
	children,
	htmlFor,
	className,
	labelClassName,
	spaced = true,
}: LabelProps) {
	return (
		<div className={clsx(styles.container, className, { "mb-0": !spaced })}>
			<label htmlFor={htmlFor} className={labelClassName}>
				{children} {required && <span className="text-error">*</span>}
			</label>
			{valueLimits ? (
				<div
					className={clsx(styles.value, {
						[styles.valueError]: lengthState(valueLimits) === "error",
						[styles.valueWarning]: lengthState(valueLimits) === "warning",
					})}
					data-testid="label-value-counter"
					data-length-state={lengthState(valueLimits)}
				>
					{valueLimits.current}/{valueLimits.max}
				</div>
			) : null}
		</div>
	);
}

function lengthState(valueLimits: NonNullable<LabelProps["valueLimits"]>) {
	if (valueLimits.current > valueLimits.max) return "error";
	if (valueLimits.current / valueLimits.max >= 0.9) return "warning";

	return undefined;
}
