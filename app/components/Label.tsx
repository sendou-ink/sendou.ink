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
				<div className={clsx(styles.value, lengthWarning(valueLimits, styles))}>
					{valueLimits.current}/{valueLimits.max}
				</div>
			) : null}
		</div>
	);
}

function lengthWarning(
	valueLimits: NonNullable<LabelProps["valueLimits"]>,
	s: typeof styles,
) {
	if (valueLimits.current > valueLimits.max) return s.valueError;
	if (valueLimits.current / valueLimits.max >= 0.9) return s.valueWarning;

	return;
}
