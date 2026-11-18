/**
 * The image operations core/ took over from OpenCV.js, each pinned to the
 * output OpenCV.js 5.0.0 gave on the same input: every case's expected value
 * is the hash of OpenCV's result (shape, then FNV-1a of the samples),
 * recorded before the dependency was dropped. Inputs are seeded noise, every
 * 24-bit color for the color conversions. The RGB sweep and the `convert`
 * cases (odd sizes, so the kernels' scalar tails run) were added after and
 * are pinned to the JS loops, which give OpenCV's output on every color.
 * Shared by the kernel and the plain-JS runs of
 * tests/logic/image-kernels*.test.ts.
 */
import { unionRoi } from "../core/canonical";
import { ROIS as QUICK_BATTLE_LOG_ROIS } from "../core/detectors/quick-scoreboard-battle-log/rois";
import {
	connectedComponents,
	dilate,
	ellipseElement,
	gaussianBlur5,
	laplacianAbs,
	normalizeMinMax,
	rectElement,
} from "../core/filters";
import {
	createImage,
	type Image,
	meanBrightness,
	type Roi,
	rgbToHsv,
	toGray,
	toRgb,
} from "../core/image";
import { homographyFromQuad } from "../core/rectify";
import { type Interpolation, resize, resizeBy } from "../core/resize";
import { rotationMatrix, warpAffine, warpPerspective } from "../core/warp";

export type ImageKernelCase =
	| {
			op: "resize";
			ch: number;
			rows: number;
			cols: number;
			dcols: number;
			drows: number;
			interpolation: Interpolation;
	  }
	| {
			op: "resizeBy";
			ch: number;
			rows: number;
			cols: number;
			fx: number;
			fy: number;
			interpolation: Interpolation;
	  }
	| { op: "gray"; ch: number }
	| { op: "hsv" }
	| { op: "rgb" }
	| {
			op: "convert";
			to: "gray" | "rgb" | "hsv";
			ch: number;
			rows: number;
			cols: number;
	  }
	| {
			op: "warpAffine";
			ch: number;
			rows: number;
			cols: number;
			angle: number;
			interpolation: "linear" | "nearest";
			border: "replicate" | "constant";
	  }
	| { op: "warpPerspective"; region: Roi }
	| {
			op: "laplacian" | "gaussianBlur5" | "normalizeMinMax";
			rows: number;
			cols: number;
	  }
	| { op: "dilateEllipse"; rows: number; cols: number; radius: number }
	| { op: "dilateRect"; rows: number; cols: number; iterations: number }
	| { op: "components"; rows: number; cols: number; connectivity: 4 | 8 }
	| { op: "mean"; ch: number; roi: Roi };

/** Each case with the value OpenCV.js 5.0.0 gave (see the module header). */
export const IMAGE_KERNEL_CASES: [ImageKernelCase, string][] = [
	[
		{
			op: "resize",
			ch: 4,
			rows: 720,
			cols: 1280,
			dcols: 1920,
			drows: 1080,
			interpolation: "cubic",
		},
		"1080x1920x4:63e0e0b9",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 900,
			cols: 1600,
			dcols: 1920,
			drows: 1080,
			interpolation: "cubic",
		},
		"1080x1920x4:ee28c0d5",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 1440,
			cols: 2560,
			dcols: 1920,
			drows: 1080,
			interpolation: "area",
		},
		"1080x1920x4:24927d85",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 2160,
			cols: 3840,
			dcols: 1920,
			drows: 1080,
			interpolation: "area",
		},
		"1080x1920x4:b505db90",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 1200,
			cols: 1920,
			dcols: 1920,
			drows: 1080,
			interpolation: "area",
		},
		"1080x1920x4:c1f553e6",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 319,
			cols: 529,
			drows: 181,
			dcols: 167,
			interpolation: "area",
		},
		"181x167x1:5d00ec1a",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 61,
			cols: 31,
			drows: 63,
			dcols: 35,
			interpolation: "area",
		},
		"63x35x1:458cc072",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 60,
			cols: 90,
			drows: 24,
			dcols: 52,
			interpolation: "area",
		},
		"24x52x1:b60563ef",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "area",
		},
		"20x28x1:b0a7ee92",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "area",
		},
		"14x19x1:82cd5d00",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "area",
		},
		"20x14x1:570730c9",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "area",
		},
		"62x86x1:c06378e4",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "area",
		},
		"123x171x1:ade70787",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 376,
			cols: 316,
			drows: 274,
			dcols: 218,
			interpolation: "cubic",
		},
		"274x218x1:5ad2c62a",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 58,
			cols: 28,
			drows: 16,
			dcols: 86,
			interpolation: "cubic",
		},
		"16x86x1:2e96cbed",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 57,
			cols: 87,
			drows: 47,
			dcols: 3,
			interpolation: "cubic",
		},
		"47x3x1:dc3dfdbd",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "cubic",
		},
		"20x28x1:49721c9f",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "cubic",
		},
		"14x19x1:a44b8419",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "cubic",
		},
		"20x14x1:ebab5e63",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "cubic",
		},
		"62x86x1:7147092e",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "cubic",
		},
		"123x171x1:499a6459",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 433,
			cols: 503,
			drows: 367,
			dcols: 269,
			interpolation: "linear",
		},
		"367x269x1:7d6f2cd1",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 55,
			cols: 25,
			drows: 39,
			dcols: 37,
			interpolation: "linear",
		},
		"39x37x1:a5563cd2",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 54,
			cols: 84,
			drows: 70,
			dcols: 54,
			interpolation: "linear",
		},
		"70x54x1:64c4cf81",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "linear",
		},
		"20x28x1:b0a7ee92",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "linear",
		},
		"14x19x1:a44b8419",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "linear",
		},
		"20x14x1:32c3055a",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "linear",
		},
		"62x86x1:ece73d30",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "linear",
		},
		"123x171x1:c81b7d46",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 490,
			cols: 290,
			drows: 160,
			dcols: 320,
			interpolation: "nearest",
		},
		"160x320x1:17517171",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 52,
			cols: 22,
			drows: 62,
			dcols: 88,
			interpolation: "nearest",
		},
		"62x88x1:8594a3ad",
	],
	[
		{
			op: "resize",
			ch: 1,
			rows: 51,
			cols: 81,
			drows: 23,
			dcols: 5,
			interpolation: "nearest",
		},
		"23x5x1:b3620fa3",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "nearest",
		},
		"20x28x1:c2315c1d",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "nearest",
		},
		"14x19x1:09cbec5d",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "nearest",
		},
		"20x14x1:6c18c937",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "nearest",
		},
		"62x86x1:45361396",
	],
	[
		{
			op: "resizeBy",
			ch: 1,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "nearest",
		},
		"123x171x1:ade70787",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 247,
			cols: 477,
			drows: 253,
			dcols: 371,
			interpolation: "area",
		},
		"253x371x3:b575f78b",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 49,
			cols: 19,
			drows: 15,
			dcols: 39,
			interpolation: "area",
		},
		"15x39x3:714c109e",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 48,
			cols: 78,
			drows: 46,
			dcols: 56,
			interpolation: "area",
		},
		"46x56x3:181f44e7",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "area",
		},
		"20x28x3:2835b624",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "area",
		},
		"14x19x3:88831e34",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "area",
		},
		"20x14x3:67caf01b",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "area",
		},
		"62x86x3:eb4bdd3e",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "area",
		},
		"123x171x3:6ee14e04",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 304,
			cols: 264,
			drows: 346,
			dcols: 422,
			interpolation: "cubic",
		},
		"346x422x3:ec3dadd6",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 46,
			cols: 16,
			drows: 38,
			dcols: 90,
			interpolation: "cubic",
		},
		"38x90x3:5e29c4a8",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 45,
			cols: 75,
			drows: 69,
			dcols: 7,
			interpolation: "cubic",
		},
		"69x7x3:8f39bd44",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "cubic",
		},
		"20x28x3:1822a1a0",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "cubic",
		},
		"14x19x3:ef273256",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "cubic",
		},
		"20x14x3:da288787",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "cubic",
		},
		"62x86x3:99ef231f",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "cubic",
		},
		"123x171x3:77c628f8",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 361,
			cols: 451,
			drows: 439,
			dcols: 473,
			interpolation: "linear",
		},
		"439x473x3:92a98392",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 43,
			cols: 13,
			drows: 61,
			dcols: 41,
			interpolation: "linear",
		},
		"61x41x3:c65ed39e",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 42,
			cols: 72,
			drows: 22,
			dcols: 58,
			interpolation: "linear",
		},
		"22x58x3:e37d4a66",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "linear",
		},
		"20x28x3:2835b624",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "linear",
		},
		"14x19x3:ef273256",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "linear",
		},
		"20x14x3:e921409e",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "linear",
		},
		"62x86x3:0bef14a9",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "linear",
		},
		"123x171x3:c26e0b1d",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 418,
			cols: 238,
			drows: 232,
			dcols: 524,
			interpolation: "nearest",
		},
		"232x524x3:ad828ab2",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 40,
			cols: 10,
			drows: 14,
			dcols: 92,
			interpolation: "nearest",
		},
		"14x92x3:1c3c0929",
	],
	[
		{
			op: "resize",
			ch: 3,
			rows: 39,
			cols: 69,
			drows: 45,
			dcols: 9,
			interpolation: "nearest",
		},
		"45x9x3:9d4511a8",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "nearest",
		},
		"20x28x3:dfe84839",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "nearest",
		},
		"14x19x3:b585bc37",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "nearest",
		},
		"20x14x3:ffa66262",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "nearest",
		},
		"62x86x3:8ba96092",
	],
	[
		{
			op: "resizeBy",
			ch: 3,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "nearest",
		},
		"123x171x3:6ee14e04",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 475,
			cols: 425,
			drows: 325,
			dcols: 175,
			interpolation: "area",
		},
		"325x175x4:299b82db",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 37,
			cols: 7,
			drows: 37,
			dcols: 43,
			interpolation: "area",
		},
		"37x43x4:85cd5808",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 36,
			cols: 66,
			drows: 68,
			dcols: 60,
			interpolation: "area",
		},
		"68x60x4:2872e9de",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "area",
		},
		"20x28x4:4ce9e1bf",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "area",
		},
		"14x19x4:c4e03db5",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "area",
		},
		"20x14x4:449d61d1",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "area",
		},
		"62x86x4:f2a3f052",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "area",
		},
		"123x171x4:236988e9",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 232,
			cols: 212,
			drows: 418,
			dcols: 226,
			interpolation: "cubic",
		},
		"418x226x4:0afd17dc",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 34,
			cols: 4,
			drows: 60,
			dcols: 94,
			interpolation: "cubic",
		},
		"60x94x4:b4bf07b3",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 33,
			cols: 63,
			drows: 21,
			dcols: 11,
			interpolation: "cubic",
		},
		"21x11x4:917e21ca",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "cubic",
		},
		"20x28x4:220d4fa8",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "cubic",
		},
		"14x19x4:7475aa39",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "cubic",
		},
		"20x14x4:7e1d3c52",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "cubic",
		},
		"62x86x4:1f5f772e",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "cubic",
		},
		"123x171x4:478c1a8a",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 289,
			cols: 399,
			drows: 211,
			dcols: 277,
			interpolation: "linear",
		},
		"211x277x4:d72b7a6c",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 31,
			cols: 91,
			drows: 13,
			dcols: 45,
			interpolation: "linear",
		},
		"13x45x4:79871932",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 30,
			cols: 60,
			drows: 44,
			dcols: 62,
			interpolation: "linear",
		},
		"44x62x4:86550c4a",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "linear",
		},
		"20x28x4:4ce9e1bf",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "linear",
		},
		"14x19x4:7475aa39",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "linear",
		},
		"20x14x4:7f146c64",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "linear",
		},
		"62x86x4:2c8f052b",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "linear",
		},
		"123x171x4:06d0a2fa",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 346,
			cols: 586,
			drows: 304,
			dcols: 328,
			interpolation: "nearest",
		},
		"304x328x4:06056f05",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 28,
			cols: 88,
			drows: 36,
			dcols: 96,
			interpolation: "nearest",
		},
		"36x96x4:15cb4a4e",
	],
	[
		{
			op: "resize",
			ch: 4,
			rows: 27,
			cols: 57,
			drows: 67,
			dcols: 13,
			interpolation: "nearest",
		},
		"67x13x4:309d7af8",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.5,
			fy: 0.5,
			interpolation: "nearest",
		},
		"20x28x4:a504d045",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.3333333333333333,
			fy: 0.3333333333333333,
			interpolation: "nearest",
		},
		"14x19x4:b2ceed4f",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 0.25,
			fy: 0.5,
			interpolation: "nearest",
		},
		"20x14x4:0758bb9e",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 1.5,
			fy: 1.5,
			interpolation: "nearest",
		},
		"62x86x4:bb93d205",
	],
	[
		{
			op: "resizeBy",
			ch: 4,
			rows: 41,
			cols: 57,
			fx: 3,
			fy: 3,
			interpolation: "nearest",
		},
		"123x171x4:236988e9",
	],
	[{ op: "gray", ch: 3 }, "4096x4096x1:7babef5d"],
	[{ op: "gray", ch: 4 }, "4096x4096x1:7babef5d"],
	[{ op: "hsv" }, "4096x4096x3:9430f3e8"],
	[{ op: "rgb" }, "4096x4096x3:45292dc5"],
	[{ op: "convert", to: "gray", ch: 4, rows: 1, cols: 1 }, "1x1x1:fc0c4ef4"],
	[{ op: "convert", to: "gray", ch: 4, rows: 1, cols: 5 }, "1x5x1:5a666b48"],
	[{ op: "convert", to: "gray", ch: 4, rows: 3, cols: 7 }, "3x7x1:e0749fac"],
	[{ op: "convert", to: "gray", ch: 4, rows: 2, cols: 17 }, "2x17x1:387b33ef"],
	[{ op: "convert", to: "gray", ch: 4, rows: 37, cols: 3 }, "37x3x1:341f7baa"],
	[
		{ op: "convert", to: "gray", ch: 4, rows: 1080, cols: 1920 },
		"1080x1920x1:73bdb93b",
	],
	[{ op: "convert", to: "gray", ch: 3, rows: 1, cols: 1 }, "1x1x1:430b2bb9"],
	[{ op: "convert", to: "gray", ch: 3, rows: 1, cols: 5 }, "1x5x1:bfbd11aa"],
	[{ op: "convert", to: "gray", ch: 3, rows: 3, cols: 7 }, "3x7x1:45c54531"],
	[{ op: "convert", to: "gray", ch: 3, rows: 2, cols: 17 }, "2x17x1:63f80374"],
	[{ op: "convert", to: "gray", ch: 3, rows: 37, cols: 3 }, "37x3x1:3ad1117a"],
	[
		{ op: "convert", to: "gray", ch: 3, rows: 1080, cols: 1920 },
		"1080x1920x1:14281abe",
	],
	[{ op: "convert", to: "rgb", ch: 4, rows: 1, cols: 1 }, "1x1x3:96df07d5"],
	[{ op: "convert", to: "rgb", ch: 4, rows: 1, cols: 5 }, "1x5x3:758af5bc"],
	[{ op: "convert", to: "rgb", ch: 4, rows: 3, cols: 7 }, "3x7x3:e489d4a1"],
	[{ op: "convert", to: "rgb", ch: 4, rows: 2, cols: 17 }, "2x17x3:85d5aebe"],
	[{ op: "convert", to: "rgb", ch: 4, rows: 37, cols: 3 }, "37x3x3:0cfd5cce"],
	[
		{ op: "convert", to: "rgb", ch: 4, rows: 1080, cols: 1920 },
		"1080x1920x3:349fc83f",
	],
	[{ op: "convert", to: "hsv", ch: 3, rows: 1, cols: 1 }, "1x1x3:9ef3a882"],
	[{ op: "convert", to: "hsv", ch: 3, rows: 1, cols: 5 }, "1x5x3:5ce22029"],
	[{ op: "convert", to: "hsv", ch: 3, rows: 3, cols: 7 }, "3x7x3:9d74aa4c"],
	[{ op: "convert", to: "hsv", ch: 3, rows: 2, cols: 17 }, "2x17x3:336b02f9"],
	[{ op: "convert", to: "hsv", ch: 3, rows: 37, cols: 3 }, "37x3x3:64942f7f"],
	[
		{ op: "convert", to: "hsv", ch: 3, rows: 1080, cols: 1920 },
		"1080x1920x3:41b62509",
	],
	[
		{
			op: "warpAffine",
			ch: 1,
			rows: 43,
			cols: 151,
			angle: -3,
			interpolation: "linear",
			border: "replicate",
		},
		"43x151x1:bff2a57e",
	],
	[
		{
			op: "warpAffine",
			ch: 1,
			rows: 43,
			cols: 151,
			angle: 7.5,
			interpolation: "linear",
			border: "replicate",
		},
		"43x151x1:d626afa5",
	],
	[
		{
			op: "warpAffine",
			ch: 1,
			rows: 43,
			cols: 151,
			angle: -3,
			interpolation: "linear",
			border: "constant",
		},
		"43x151x1:d6eb5222",
	],
	[
		{
			op: "warpAffine",
			ch: 1,
			rows: 43,
			cols: 151,
			angle: 7.5,
			interpolation: "linear",
			border: "constant",
		},
		"43x151x1:d85fa00d",
	],
	[
		{
			op: "warpAffine",
			ch: 1,
			rows: 43,
			cols: 151,
			angle: -3,
			interpolation: "nearest",
			border: "constant",
		},
		"43x151x1:04b73a04",
	],
	[
		{
			op: "warpAffine",
			ch: 1,
			rows: 43,
			cols: 151,
			angle: 7.5,
			interpolation: "nearest",
			border: "constant",
		},
		"43x151x1:3ab2cb04",
	],
	[
		{
			op: "warpAffine",
			ch: 3,
			rows: 43,
			cols: 151,
			angle: -3,
			interpolation: "linear",
			border: "replicate",
		},
		"43x151x3:6f369c19",
	],
	[
		{
			op: "warpAffine",
			ch: 3,
			rows: 43,
			cols: 151,
			angle: 7.5,
			interpolation: "linear",
			border: "replicate",
		},
		"43x151x3:460dd14c",
	],
	[
		{
			op: "warpAffine",
			ch: 3,
			rows: 43,
			cols: 151,
			angle: -3,
			interpolation: "linear",
			border: "constant",
		},
		"43x151x3:04c246a5",
	],
	[
		{
			op: "warpAffine",
			ch: 3,
			rows: 43,
			cols: 151,
			angle: 7.5,
			interpolation: "linear",
			border: "constant",
		},
		"43x151x3:2e526fd0",
	],
	[
		{
			op: "warpAffine",
			ch: 3,
			rows: 43,
			cols: 151,
			angle: -3,
			interpolation: "nearest",
			border: "constant",
		},
		"43x151x3:f4134919",
	],
	[
		{
			op: "warpAffine",
			ch: 3,
			rows: 43,
			cols: 151,
			angle: 7.5,
			interpolation: "nearest",
			border: "constant",
		},
		"43x151x3:8b687d85",
	],
	[
		{
			op: "warpAffine",
			ch: 4,
			rows: 43,
			cols: 151,
			angle: -3,
			interpolation: "linear",
			border: "replicate",
		},
		"43x151x4:f8a1939f",
	],
	[
		{
			op: "warpAffine",
			ch: 4,
			rows: 43,
			cols: 151,
			angle: 7.5,
			interpolation: "linear",
			border: "replicate",
		},
		"43x151x4:6e93ad93",
	],
	[
		{
			op: "warpAffine",
			ch: 4,
			rows: 43,
			cols: 151,
			angle: -3,
			interpolation: "linear",
			border: "constant",
		},
		"43x151x4:2b64aaf1",
	],
	[
		{
			op: "warpAffine",
			ch: 4,
			rows: 43,
			cols: 151,
			angle: 7.5,
			interpolation: "linear",
			border: "constant",
		},
		"43x151x4:199d4511",
	],
	[
		{
			op: "warpAffine",
			ch: 4,
			rows: 43,
			cols: 151,
			angle: -3,
			interpolation: "nearest",
			border: "constant",
		},
		"43x151x4:13733a7a",
	],
	[
		{
			op: "warpAffine",
			ch: 4,
			rows: 43,
			cols: 151,
			angle: 7.5,
			interpolation: "nearest",
			border: "constant",
		},
		"43x151x4:5b6e9812",
	],
	[
		{ op: "warpPerspective", region: { x: 1270, y: 282, w: 146, h: 703 } },
		"703x146x4:d4a86b1a",
	],
	[
		{ op: "warpPerspective", region: { x: -40, y: -30, w: 2000, h: 1150 } },
		"1150x2000x4:9106ce64",
	],
	[{ op: "laplacian", rows: 1, cols: 1 }, "1x1x1:050c5d1f"],
	[{ op: "normalizeMinMax", rows: 1, cols: 1 }, "1x1x1:050c5d1f"],
	[{ op: "dilateEllipse", rows: 1, cols: 1, radius: 1 }, "1x1x1:020c5866"],
	[{ op: "dilateEllipse", rows: 1, cols: 1, radius: 2 }, "1x1x1:020c5866"],
	[{ op: "dilateEllipse", rows: 1, cols: 1, radius: 4 }, "1x1x1:020c5866"],
	[{ op: "dilateRect", rows: 1, cols: 1, iterations: 2 }, "1x1x1:020c5866"],
	[{ op: "components", rows: 1, cols: 1, connectivity: 4 }, "1:811c9dc5"],
	[{ op: "components", rows: 1, cols: 1, connectivity: 8 }, "1:811c9dc5"],
	[{ op: "laplacian", rows: 2, cols: 7 }, "2x7x1:94616749"],
	[{ op: "normalizeMinMax", rows: 2, cols: 7 }, "2x7x1:a9f3065c"],
	[{ op: "dilateEllipse", rows: 2, cols: 7, radius: 1 }, "2x7x1:f4bd3883"],
	[{ op: "dilateEllipse", rows: 2, cols: 7, radius: 2 }, "2x7x1:b6bc204b"],
	[{ op: "dilateEllipse", rows: 2, cols: 7, radius: 4 }, "2x7x1:f8abc3a3"],
	[{ op: "dilateRect", rows: 2, cols: 7, iterations: 2 }, "2x7x1:b6bc204b"],
	[{ op: "components", rows: 2, cols: 7, connectivity: 4 }, "1:811c9dc5"],
	[{ op: "components", rows: 2, cols: 7, connectivity: 8 }, "1:811c9dc5"],
	[{ op: "laplacian", rows: 37, cols: 53 }, "37x53x1:e8f81f7f"],
	[{ op: "normalizeMinMax", rows: 37, cols: 53 }, "37x53x1:62de2d38"],
	[{ op: "gaussianBlur5", rows: 37, cols: 53 }, "37x53x1:f3ba7666"],
	[{ op: "dilateEllipse", rows: 37, cols: 53, radius: 1 }, "37x53x1:f3ba7666"],
	[{ op: "dilateEllipse", rows: 37, cols: 53, radius: 2 }, "37x53x1:f3ba7666"],
	[{ op: "dilateEllipse", rows: 37, cols: 53, radius: 4 }, "37x53x1:f3ba7666"],
	[{ op: "dilateRect", rows: 37, cols: 53, iterations: 2 }, "37x53x1:f3ba7666"],
	[{ op: "components", rows: 37, cols: 53, connectivity: 4 }, "2:6308ddc4"],
	[{ op: "components", rows: 37, cols: 53, connectivity: 8 }, "2:6308ddc4"],
	[{ op: "laplacian", rows: 120, cols: 90 }, "120x90x1:acd68785"],
	[{ op: "normalizeMinMax", rows: 120, cols: 90 }, "120x90x1:2483c15a"],
	[{ op: "gaussianBlur5", rows: 120, cols: 90 }, "120x90x1:b84e9a55"],
	[
		{ op: "dilateEllipse", rows: 120, cols: 90, radius: 1 },
		"120x90x1:b84e9a55",
	],
	[
		{ op: "dilateEllipse", rows: 120, cols: 90, radius: 2 },
		"120x90x1:b84e9a55",
	],
	[
		{ op: "dilateEllipse", rows: 120, cols: 90, radius: 4 },
		"120x90x1:b84e9a55",
	],
	[
		{ op: "dilateRect", rows: 120, cols: 90, iterations: 2 },
		"120x90x1:b84e9a55",
	],
	[{ op: "components", rows: 120, cols: 90, connectivity: 4 }, "2:1db1bb12"],
	[{ op: "components", rows: 120, cols: 90, connectivity: 8 }, "2:1db1bb12"],
	[
		{ op: "mean", ch: 1, roi: { x: 3, y: 5, w: 29, h: 17 } },
		"125.68356997971603",
	],
	[
		{ op: "mean", ch: 3, roi: { x: 3, y: 5, w: 29, h: 17 } },
		"127.93576741041244",
	],
	[
		{ op: "mean", ch: 4, roi: { x: 3, y: 5, w: 29, h: 17 } },
		"128.0338066260987",
	],
];

/** What core/ gives for `spec`, in the form of the expected values. */
export function imageKernelResult(spec: ImageKernelCase): string {
	switch (spec.op) {
		case "resize":
			return hashOf(
				resize(
					noise(spec.rows, spec.cols, spec.ch, 1),
					spec.dcols,
					spec.drows,
					spec.interpolation,
				),
			);
		case "resizeBy":
			return hashOf(
				resizeBy(
					noise(spec.rows, spec.cols, spec.ch, 1),
					spec.fx,
					spec.fy,
					spec.interpolation,
				),
			);
		case "gray":
			return hashOf(toGray(every24BitColor(spec.ch)));
		case "hsv":
			return hashOf(rgbToHsv(every24BitColor(3)));
		case "rgb":
			return hashOf(toRgb(every24BitColor(4)));
		case "convert": {
			const src = noise(spec.rows, spec.cols, spec.ch, 6);
			const convert = { gray: toGray, rgb: toRgb, hsv: rgbToHsv }[spec.to];
			return hashOf(convert(src));
		}
		case "warpAffine":
			return hashOf(
				warpAffine(
					noise(spec.rows, spec.cols, spec.ch, 2),
					rotationMatrix({ x: spec.cols / 2, y: spec.rows / 2 }, spec.angle, 1),
					spec.cols,
					spec.rows,
					spec.interpolation,
					spec.border === "replicate"
						? "replicate"
						: { constant: [9, 19, 29, 39] },
				),
			);
		case "warpPerspective":
			return hashOf(
				warpPerspective(
					noise(1080, 1920, 4, 3),
					homographyFromQuad(QUICK_BATTLE_LOG_ROIS.RECTIFY!),
					spec.region,
				),
			);
		case "mean":
			return String(meanBrightness(noise(30, 40, spec.ch, 4), spec.roi));
		default: {
			const src = inkNoise(spec.rows, spec.cols, spec.op === "normalizeMinMax");
			switch (spec.op) {
				case "laplacian":
					return hashOf(laplacianAbs(src));
				case "gaussianBlur5":
					return hashOf(gaussianBlur5(src));
				case "normalizeMinMax":
					normalizeMinMax(src);
					return hashOf(src);
				case "dilateEllipse":
					return hashOf(
						dilate(
							src,
							ellipseElement(2 * spec.radius + 1, 2 * spec.radius + 1),
						),
					);
				case "dilateRect":
					return hashOf(dilate(src, rectElement(3, 3), spec.iterations));
				case "components": {
					const binary = {
						...src,
						data: src.data.map((v) => (v > 128 ? 255 : 0)),
					};
					const { count, stats } = connectedComponents(
						binary,
						spec.connectivity,
					);
					const boxes = stats
						.slice(1)
						.map((s) => [s.left, s.top, s.width, s.height, s.area].join(","))
						.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
					return `${count}:${fnv(new TextEncoder().encode(boxes.join(";")))}`;
				}
			}
		}
	}
}

/** The regions a quick battle log gate rectifies: its probes' union, and one reaching past the frame. */
export const PROBE_REGION = unionRoi([
	...QUICK_BATTLE_LOG_ROIS.PANEL_DYS.flatMap((dy) =>
		QUICK_BATTLE_LOG_ROIS.ROW_CENTERS.flatMap((base) => [
			QUICK_BATTLE_LOG_ROIS.gateDarkProbe(base + dy),
			QUICK_BATTLE_LOG_ROIS.paintSuffixRoi(base + dy),
		]),
	),
	...QUICK_BATTLE_LOG_ROIS.GATE_COLOR_PROBES,
]);

/** Deterministic pseudo-random samples, distinct per size, channel count and `salt`. */
export function noise(
	rows: number,
	cols: number,
	channels: number,
	salt: number,
): Image {
	const image = createImage(rows, cols, channels);
	let state =
		(rows * 73856093) ^ (cols * 19349663) ^ (channels * 83492791) ^ salt;
	for (let i = 0; i < image.data.length; i++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		image.data[i] = state >>> 24;
	}
	return image;
}

/** Blocky ink for the binary operations; `squeezed`: a narrowed value range for normalize. */
function inkNoise(rows: number, cols: number, squeezed: boolean): Image {
	const image = noise(rows, cols, 1, 5);
	const { data } = image;
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const i = y * cols + x;
			data[i] = squeezed
				? 37 + (data[i]! % 151)
				: data[(y >> 2) * cols + (x >> 1)]! > 150
					? 255
					: data[i]! >> 2;
		}
	}
	return image;
}

function every24BitColor(channels: number): Image {
	const image = createImage(4096, 4096, channels);
	const { data } = image;
	for (let color = 0; color < 1 << 24; color++) {
		data[color * channels] = color & 255;
		data[color * channels + 1] = (color >> 8) & 255;
		data[color * channels + 2] = color >> 16;
		if (channels === 4) data[color * 4 + 3] = Math.imul(color, 7919) & 255;
	}
	return image;
}

function hashOf(image: Image): string {
	return `${image.rows}x${image.cols}x${image.channels}:${fnv(image.data)}`;
}

function fnv(data: Uint8Array): string {
	let hash = 0x811c9dc5;
	for (const v of data) {
		hash ^= v;
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
