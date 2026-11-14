/*
 * Color conversions for core/frame-kernels.ts, bit-identical to
 * OpenCV's 8-bit cvtColor: RGBA2GRAY is its 15-bit fixed point
 * (R·9798 + G·19235 + B·3735 + 2^14) >> 15, RGBA2RGB drops alpha. The
 * module imports its memory; frame-kernels.ts copies frames in and out.
 *
 * Regenerate FRAME_KERNELS_WASM in frame-kernels.ts after an edit (Apple
 * clang ships the wasm32 target; no linker is needed):
 *   clang --target=wasm32 -O3 -msimd128 -nostdlib -c frame-kernels.c -o frame-kernels.o
 *   base64 -i frame-kernels.o | tr -d '\n'
 * The object is instantiated as is: it imports only its memory (and an unused
 * table), so keep the functions free of stack use, data and calls.
 */
#include <wasm_simd128.h>

typedef unsigned char u8;
typedef unsigned int u32;

static inline v128_t grayOf4(const u8* p, v128_t coef, v128_t half) {
  v128_t px = wasm_v128_load(p);
  v128_t lo = wasm_i32x4_dot_i16x8(wasm_u16x8_extend_low_u8x16(px), coef);
  v128_t hi = wasm_i32x4_dot_i16x8(wasm_u16x8_extend_high_u8x16(px), coef);
  v128_t sum = wasm_i32x4_add(wasm_i32x4_shuffle(lo, hi, 0, 2, 4, 6),
                              wasm_i32x4_shuffle(lo, hi, 1, 3, 5, 7));
  return wasm_u32x4_shr(wasm_i32x4_add(sum, half), 15);
}

__attribute__((export_name("rgbaToGray")))
void rgbaToGray(const u8* src, u8* dst, u32 n) {
  const v128_t coef = wasm_i16x8_make(9798, 19235, 3735, 0, 9798, 19235, 3735, 0);
  const v128_t half = wasm_i32x4_splat(1 << 14);
  u32 i = 0;
  for (; i + 16 <= n; i += 16) {
    const u8* p = src + i * 4;
    v128_t w01 = wasm_u16x8_narrow_i32x4(grayOf4(p, coef, half), grayOf4(p + 16, coef, half));
    v128_t w23 = wasm_u16x8_narrow_i32x4(grayOf4(p + 32, coef, half), grayOf4(p + 48, coef, half));
    wasm_v128_store(dst + i, wasm_u8x16_narrow_i16x8(w01, w23));
  }
  for (; i < n; i++) {
    const u8* p = src + i * 4;
    dst[i] = (u8)((p[0] * 9798 + p[1] * 19235 + p[2] * 3735 + (1 << 14)) >> 15);
  }
}

__attribute__((export_name("rgbaToRgb")))
void rgbaToRgb(const u8* src, u8* dst, u32 n) {
  u32 i = 0;
  // 16-byte stores of 12 valid bytes; the next group overwrites the rest, so
  // stop while a whole store still fits inside dst
  for (; i + 6 <= n; i += 4) {
    v128_t px = wasm_v128_load(src + i * 4);
    wasm_v128_store(dst + i * 3, wasm_i8x16_shuffle(px, px, 0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 0, 0, 0, 0));
  }
  for (; i < n; i++) {
    dst[i * 3] = src[i * 4];
    dst[i * 3 + 1] = src[i * 4 + 1];
    dst[i * 3 + 2] = src[i * 4 + 2];
  }
}

/*
 * Frame resizes for core/resize.ts, which computes OpenCV's coefficient
 * tables and checks the result against its own loops; these run the same
 * arithmetic (f32 sums for INTER_AREA, fixed point for the separable
 * filters), so no float expression may be contracted into a fused op.
 */
#pragma clang fp contract(off)

typedef int i32;

static inline u8 saturateRound(float v) {
  v = __builtin_rintf(v);
  return v <= 0.f ? 0 : v >= 255.f ? 255 : (u8)(i32)v;
}

/* resizeArea_: every source row adds its taps into `buf`, rows of one
   destination row sum into `sum` (both `width` floats) */
__attribute__((export_name("resizeArea")))
void resizeArea(const u8* src, u32 srcStep, u8* dst, u32 width, u32 cn,
                const i32* xdi, const i32* xsi, const float* xalpha, u32 xn,
                const i32* ydi, const i32* ysi, const float* yalpha, u32 yn,
                float* buf, float* sum) {
  i32 prev = ydi[0];
  for (u32 i = 0; i < width; i++) sum[i] = 0.f;
  for (u32 j = 0; j < yn; j++) {
    const u8* S = src + ysi[j] * srcStep;
    const float beta = yalpha[j];
    for (u32 i = 0; i < width; i++) buf[i] = 0.f;
    if (cn == 4) {
      for (u32 k = 0; k < xn; k++) {
        const u8* p = S + xsi[k];
        float* b = buf + xdi[k];
        const v128_t px = wasm_f32x4_convert_u32x4(wasm_u32x4_make(p[0], p[1], p[2], p[3]));
        wasm_v128_store(b, wasm_f32x4_add(wasm_v128_load(b), wasm_f32x4_mul(px, wasm_f32x4_splat(xalpha[k]))));
      }
    } else {
      for (u32 k = 0; k < xn; k++) {
        const u8* p = S + xsi[k];
        float* b = buf + xdi[k];
        const float a = xalpha[k];
        for (u32 c = 0; c < cn; c++) b[c] = b[c] + (float)p[c] * a;
      }
    }
    if (ydi[j] != prev) {
      u8* D = dst + prev * width;
      for (u32 i = 0; i < width; i++) {
        D[i] = saturateRound(sum[i]);
        sum[i] = beta * buf[i];
      }
      prev = ydi[j];
    } else {
      for (u32 i = 0; i < width; i++) sum[i] = sum[i] + beta * buf[i];
    }
  }
  u8* D = dst + prev * width;
  for (u32 i = 0; i < width; i++) D[i] = saturateRound(sum[i]);
}

/* the row slot holding source row `sy`'s horizontal sums, computed into a
   free slot (rows above the current window were freed) when missing */
static inline i32* sourceRow(const u8* src, u32 srcStep, u32 width, u32 ksize,
                             const i32* tapAt, const i32* tapWeight,
                             i32* rowBuffers, i32* slotRow, i32 sy) {
  const u32 slots = 2 * ksize;
  for (u32 s = 0; s < slots; s++) {
    if (slotRow[s] == sy) return rowBuffers + s * width;
  }
  u32 slot = 0;
  while (slotRow[slot] != -1) slot++;
  slotRow[slot] = sy;
  i32* out = rowBuffers + slot * width;
  const u8* S = src + sy * srcStep;
  if (ksize == 4) {
    for (u32 i = 0; i < width; i++) {
      const i32* at = tapAt + i * 4;
      const i32* w = tapWeight + i * 4;
      out[i] = S[at[0]] * w[0] + S[at[1]] * w[1] + S[at[2]] * w[2] + S[at[3]] * w[3];
    }
  } else {
    for (u32 i = 0; i < width; i++) {
      const i32* at = tapAt + i * 2;
      const i32* w = tapWeight + i * 2;
      out[i] = S[at[0]] * w[0] + S[at[1]] * w[1];
    }
  }
  return out;
}

/* resizeGeneric_ for 8 bits: per source row the integer sums of every
   destination element's `ksize` (2 or 4) taps (`tapAt`/`tapWeight`), then
   per destination row the fixed-point combine of `ksize` such rows (`rowsOf`,
   clipped; `yWeight`). `rowBuffers` holds 2·ksize rows. */
__attribute__((export_name("resizeSeparable")))
void resizeSeparable(const u8* src, u32 srcStep, u8* dst, u32 width, u32 rows,
                     u32 ksize, const i32* tapAt, const i32* tapWeight,
                     const i32* rowsOf, const i32* yWeight, i32* rowBuffers,
                     i32* slotRow) {
  for (u32 s = 0; s < 2 * ksize; s++) slotRow[s] = -1;
  for (u32 dy = 0; dy < rows; dy++) {
    const i32* need = rowsOf + dy * ksize;
    for (u32 s = 0; s < 2 * ksize; s++) {
      if (slotRow[s] < need[0]) slotRow[s] = -1;
    }
    const i32* b = yWeight + dy * ksize;
    u8* D = dst + dy * width;
    const i32* R0 = sourceRow(src, srcStep, width, ksize, tapAt, tapWeight, rowBuffers, slotRow, need[0]);
    const i32* R1 = sourceRow(src, srcStep, width, ksize, tapAt, tapWeight, rowBuffers, slotRow, need[1]);
    if (ksize == 4) {
      const i32* R2 = sourceRow(src, srcStep, width, ksize, tapAt, tapWeight, rowBuffers, slotRow, need[2]);
      const i32* R3 = sourceRow(src, srcStep, width, ksize, tapAt, tapWeight, rowBuffers, slotRow, need[3]);
      for (u32 i = 0; i < width; i++) {
        i32 v = (R0[i] * b[0] + R1[i] * b[1] + R2[i] * b[2] + R3[i] * b[3] + (1 << 21)) >> 22;
        D[i] = v < 0 ? 0 : v > 255 ? 255 : (u8)v;
      }
    } else {
      for (u32 i = 0; i < width; i++) {
        D[i] = (u8)((((b[0] * (R0[i] >> 4)) >> 16) + ((b[1] * (R1[i] >> 4)) >> 16) + 2) >> 2);
      }
    }
  }
}

/* resizeAreaFast_ at 2x2: the half-up mean of each block, for the `whole`
   elements per row whose blocks lie inside the frame (the caller finishes
   the rest) */
__attribute__((export_name("resizeHalf")))
void resizeHalf(const u8* src, u32 srcStep, u8* dst, u32 width, u32 rows,
                u32 whole, u32 cn) {
  for (u32 dy = 0; dy < rows; dy++) {
    const u8* S0 = src + 2 * dy * srcStep;
    const u8* S1 = S0 + srcStep;
    u8* D = dst + dy * width;
    for (u32 i = 0; i < whole; i += cn) {
      const u8* p0 = S0 + 2 * i;
      const u8* p1 = S1 + 2 * i;
      for (u32 c = 0; c < cn; c++) {
        D[i + c] = (u8)((p0[c] + p0[cn + c] + p1[c] + p1[cn + c] + 2) >> 2);
      }
    }
  }
}

/* COLOR_RGB2HSV for core/image.ts's rgbToHsv, with its 12-bit tables
   (branch-free selects: the hue's case depends on the pixel) */
__attribute__((export_name("rgbToHsv")))
void rgbToHsv(const u8* src, u8* dst, u32 n, const i32* sdiv, const i32* hdiv) {
  for (u32 i = 0; i < n; i++) {
    const i32 r = src[i * 3], g = src[i * 3 + 1], b = src[i * 3 + 2];
    const i32 vg = r > g ? r : g;
    const i32 v = b > vg ? b : vg;
    const i32 ng = r < g ? r : g;
    const i32 vmin = b < ng ? b : ng;
    const i32 diff = v - vmin;
    const i32 s = (diff * sdiv[v] + (1 << 11)) >> 12;
    const i32 isR = -(v == r);
    const i32 isG = -(v == g);
    i32 h = (isR & (g - b)) + (~isR & ((isG & (b - r + 2 * diff)) + (~isG & (r - g + 4 * diff))));
    h = (h * hdiv[diff] + (1 << 11)) >> 12;
    h += (h >> 31) & 180;
    dst[i * 3] = (u8)h;
    dst[i * 3 + 1] = (u8)s;
    dst[i * 3 + 2] = (u8)v;
  }
}
