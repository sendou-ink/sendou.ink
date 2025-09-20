import type { ChartConfiguration } from 'chart.js';

interface DataTypes {
	line: {
		x: string;
		y: string;
	};
}

type ChartType = keyof DataTypes;

export type Data<T extends ChartType> = DataTypes[T];

export interface DataSet<T extends ChartType, M = undefined> {
	label: string;
	data: Data<T>[];
	metadata?: M;
}

export type ChartConfig<T extends ChartType> = ChartConfiguration<T, Array<Data<T>>, string> & {
	options: {
		animations?: never;
		animation?: never;
	};
};

export interface TooltipDataset<T extends ChartType, M = undefined> {
	parsed: { x: number; y: number };
	raw: Data<T>;
	metadata?: M;
	itemStyles: {
		style: string;
	};
	pointStyles: {
		style: string;
	};
}

export interface TooltipData<T extends ChartType, M = undefined> {
	datasets: TooltipDataset<T, M>[];
	titleStyles: {
		style: string;
	};
}

export type TooltipAlign = 'left' | 'center' | 'right';
