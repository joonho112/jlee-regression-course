/**
 * BER 640 Regression Lecture Notes — Shared OJS Utilities
 *
 * Shared JavaScript module for Observable JS interactive apps across
 * all 13 chapters of the BER 640 Quarto book.
 *
 * Import in OJS cells via:
 *   import { ber640, themeColors, plotDefaults, ... } from "../ojs/shared.js"
 *
 * @module shared
 * @version 1.0.0
 * @license MIT
 */

// ============================================================================
// 1. COLOR PALETTE
// ============================================================================

/**
 * Core BER 640 color palette — mirrors `_common.R` ber640_colors.
 * @type {Object}
 */
export const ber640 = Object.freeze({
  // Cividis Ink palette (values migrated; KEYS unchanged to mirror _common.R)
  primary:   "#0B3D66",  // navy
  secondary: "#A8431E",  // rust
  accent:    "#2C6E91",  // slate
  success:   "#3E8E8A",  // teal
  warning:   "#C9A227",  // gold
  info:      "#6B3E7A"   // plum
});

/**
 * Ordered categorical color set (up to 6 categories).
 * Use `categorical[i]` or `categorical.slice(0, n)` for n categories.
 * @type {string[]}
 */
export const categorical = Object.freeze([
  ber640.accent,     // #2C6E91 — slate
  ber640.secondary,  // #A8431E — rust
  ber640.success,    // #3E8E8A — teal
  ber640.warning,    // #C9A227 — gold
  ber640.info,       // #6B3E7A — plum
  ber640.primary     // #0B3D66 — navy
]);

/**
 * Apply alpha/opacity to a hex color string.
 * Returns an rgba() CSS string.
 *
 * @param {string} hex - 6-digit hex color (e.g. "#0B3D66")
 * @param {number} alpha - Opacity from 0 to 1
 * @returns {string} CSS rgba() string
 */
export function withAlpha(hex, alpha) {
  if (typeof hex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return `rgba(0,0,0,${alpha})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * Pre-built alpha variants for common overlay use cases.
 * @type {Object}
 */
export const alphaColors = Object.freeze({
  /** Confidence band fill (20% opacity) */
  ciBand:   withAlpha(ber640.accent, 0.20),
  /** Prediction interval fill (12% opacity) */
  piBand:   withAlpha(ber640.accent, 0.12),
  /** Residual highlight (30% opacity) */
  residual: withAlpha(ber640.secondary, 0.30),
  /** Scatter point fill (60% opacity) */
  point:    withAlpha(ber640.primary, 0.60),
  /** Light overlay for regions (15% opacity) */
  region:   withAlpha(ber640.success, 0.15),
  /** Hover/selection highlight (40% opacity) */
  hover:    withAlpha(ber640.warning, 0.40)
});


// ============================================================================
// 2. THEME DETECTION & REACTIVITY
// ============================================================================

/**
 * Detect the current Quarto Bootstrap theme and return derived colors.
 *
 * Uses both Bootstrap's `data-bs-theme` path and Quarto's rendered
 * `body.quarto-dark` path. Falls back to light theme if both are absent.
 *
 * @returns {{ isDark: boolean, text: string, bg: string, grid: string, muted: string, axis: string }}
 */
export function themeColors() {
  const isDark = isQuartoDark();

  if (isDark) {
    return {
      isDark:  true,
      text:    "#dee2e6",
      bg:      "#111827",
      grid:    "#444444",
      muted:   "#888888",
      axis:    "#adb5bd"
    };
  }
  return {
    isDark:  false,
    text:    "#1f2937",
    bg:      "#FBFAF7",
    grid:    "#e0e0e0",
    muted:   "#999999",
    axis:    "#495057"
  };
}

function isQuartoDark() {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.bsTheme === "dark" ||
    document.body?.classList.contains("quarto-dark") ||
    !!document.querySelector('link#quarto-bootstrap[data-mode="dark"]:not([rel="disabled-stylesheet"])');
}

/**
 * Create a reactive MutationObserver that fires a callback whenever
 * the Quarto theme changes (light <-> dark toggle).
 *
 * Usage in an OJS cell:
 *   const theme = Mutable("light");
 *   onThemeChange(isDark => theme.value = isDark ? "dark" : "light");
 *
 * @param {function(boolean): void} callback - Called with `true` for dark, `false` for light
 * @returns {{ disconnect: function(): void }} Handle to stop observing
 */
export function onThemeChange(callback) {
  if (typeof document === "undefined") {
    return { disconnect() {} };
  }

  let last = isQuartoDark();
  const notify = () => {
    const current = isQuartoDark();
    if (current !== last) {
      last = current;
      callback(current);
    }
  };

  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-bs-theme", "class"]
  });
  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  return { disconnect: () => observer.disconnect() };
}


// ============================================================================
// 3. PLOT CONFIGURATION
// ============================================================================

/**
 * Generate Observable Plot option defaults that match the R ggplot2 aesthetic
 * (theme_minimal, base_size=14, ber640_colors palette).
 *
 * Adapts to the current light/dark theme automatically.
 *
 * @param {Object} [overrides] - Any Observable Plot options to merge/override
 * @returns {Object} Observable Plot options object
 */
export function plotDefaults(overrides = {}) {
  const t = themeColors();

  const defaults = {
    width: 640,
    height: 400,
    marginTop: 30,
    marginRight: 20,
    marginBottom: 45,
    marginLeft: 55,
    style: {
      background: "transparent",
      color: t.text,
      fontSize: "14px",
      fontFamily: "system-ui, -apple-system, sans-serif"
    },
    x: { grid: true, labelAnchor: "center", labelOffset: 38 },
    y: { grid: true, labelAnchor: "center", labelOffset: 45 },
    color: { range: categorical }
  };

  // Deep-merge overrides (one level for style, x, y, color)
  const merged = { ...defaults, ...overrides };
  for (const key of ["style", "x", "y", "color"]) {
    if (overrides[key] && defaults[key]) {
      merged[key] = { ...defaults[key], ...overrides[key] };
    }
  }
  return merged;
}

/**
 * Return theme-aware styling values for Observable Plot marks.
 *
 * Useful for setting grid color, axis color, etc. on individual marks.
 *
 * @returns {{ gridColor: string, axisColor: string, textColor: string, mutedColor: string }}
 */
export function themeMarks() {
  const t = themeColors();
  return {
    gridColor:  t.grid,
    axisColor:  t.axis,
    textColor:  t.text,
    mutedColor: t.muted
  };
}


// ============================================================================
// 4. STATISTICAL FUNCTIONS
// ============================================================================

/**
 * Ordinary least squares regression for simple linear model (y = a + bx).
 *
 * @param {Array<Object>} data - Array of data objects
 * @param {string} xVar - Property name for the x variable
 * @param {string} yVar - Property name for the y variable
 * @returns {{ intercept: number, slope: number, rSquared: number, n: number,
 *             seBeta0: number, seBeta1: number, residualSE: number,
 *             meanX: number, ssX: number }}
 */
export function olsRegression(data, xVar, yVar) {
  const valid = data.filter(d =>
    d != null && isFinite(d[xVar]) && isFinite(d[yVar])
  );
  const n = valid.length;

  if (n < 2) {
    return {
      intercept: NaN, slope: NaN, rSquared: NaN, n,
      seBeta0: NaN, seBeta1: NaN, residualSE: NaN,
      meanX: NaN, ssX: NaN
    };
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (const d of valid) {
    const x = d[xVar], y = d[yVar];
    sumX  += x;
    sumY  += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const ssX   = sumXX - n * meanX * meanX;
  const ssY   = sumYY - n * meanY * meanY;
  const ssXY  = sumXY - n * meanX * meanY;

  if (ssX === 0) {
    return {
      intercept: NaN, slope: NaN, rSquared: NaN, n,
      seBeta0: NaN, seBeta1: NaN, residualSE: NaN,
      meanX, ssX
    };
  }

  const slope     = ssXY / ssX;
  const intercept = meanY - slope * meanX;

  // Residual standard error
  let sseVal = 0;
  for (const d of valid) {
    const resid = d[yVar] - (intercept + slope * d[xVar]);
    sseVal += resid * resid;
  }
  const residualSE = Math.sqrt(sseVal / (n - 2));

  const rSquared = ssY === 0 ? NaN : 1 - sseVal / ssY;
  const seBeta1  = residualSE / Math.sqrt(ssX);
  const seBeta0  = residualSE * Math.sqrt(sumXX / (n * ssX));

  return { intercept, slope, rSquared, n, seBeta0, seBeta1, residualSE, meanX, ssX };
}

/**
 * Compute residuals for each observation.
 *
 * @param {Array<Object>} data - Array of data objects
 * @param {string} xVar - Property name for x
 * @param {string} yVar - Property name for y
 * @param {number} intercept - Regression intercept
 * @param {number} slope - Regression slope
 * @returns {Array<{ x: number, y: number, fitted: number, residual: number }>}
 */
export function residuals(data, xVar, yVar, intercept, slope) {
  return data
    .filter(d => d != null && isFinite(d[xVar]) && isFinite(d[yVar]))
    .map(d => {
      const x = d[xVar];
      const y = d[yVar];
      const fitted = intercept + slope * x;
      return { x, y, fitted, residual: y - fitted };
    });
}

/**
 * Sum of squared errors (SSE) for a given line through data.
 *
 * @param {Array<Object>} data - Array of data objects
 * @param {string} xVar - Property name for x
 * @param {string} yVar - Property name for y
 * @param {number} intercept
 * @param {number} slope
 * @returns {number}
 */
export function sse(data, xVar, yVar, intercept, slope) {
  let total = 0;
  for (const d of data) {
    if (d == null || !isFinite(d[xVar]) || !isFinite(d[yVar])) continue;
    const r = d[yVar] - (intercept + slope * d[xVar]);
    total += r * r;
  }
  return total;
}

/**
 * Logistic (sigmoid) function: 1 / (1 + exp(-x)).
 *
 * @param {number} x
 * @returns {number} Value in (0, 1)
 */
export function sigmoid(x) {
  if (!isFinite(x)) return NaN;
  // Numerically stable version
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const ex = Math.exp(x);
  return ex / (1 + ex);
}

/**
 * Normal probability density function.
 *
 * @param {number} x
 * @param {number} [mean=0]
 * @param {number} [sd=1]
 * @returns {number}
 */
export function normalPdf(x, mean = 0, sd = 1) {
  if (sd <= 0 || !isFinite(x)) return NaN;
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

/**
 * Normal cumulative distribution function (Abramowitz & Stegun approximation).
 * Maximum error < 1.5e-7.
 *
 * @param {number} x
 * @param {number} [mean=0]
 * @param {number} [sd=1]
 * @returns {number} Probability P(X <= x)
 */
export function normalCdf(x, mean = 0, sd = 1) {
  if (sd <= 0 || !isFinite(x)) return NaN;
  const z = (x - mean) / sd;
  return _stdNormalCdf(z);
}

/**
 * Standard normal CDF (internal helper).
 * Uses Abramowitz & Stegun formula 26.2.17 via erfc.
 * The A&S approximation is for erfc(x) = polynomial(t) * exp(-x²),
 * where x = |z|/√2 (NOT |z| directly). The previous implementation
 * incorrectly applied exp(-z²/2) to z rather than exp(-x²) to x = z/√2,
 * producing errors of ~0.03 at z=1 (0.870 instead of 0.841).
 * Fixed in v1.4.0. Maximum error < 1.5e-7.
 * @private
 */
function _stdNormalCdf(z) {
  if (z === Infinity)  return 1;
  if (z === -Infinity) return 0;

  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  // Transform: x = |z| / sqrt(2) for the erfc approximation
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const erfc = (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return z >= 0 ? 1 - 0.5 * erfc : 0.5 * erfc;
}

/**
 * Inverse normal CDF (quantile function) using rational approximation.
 * Peter Acklam's algorithm — accurate to approximately 1.15e-9.
 *
 * @param {number} p - Probability in (0, 1)
 * @param {number} [mean=0]
 * @param {number} [sd=1]
 * @returns {number} The value x such that P(X <= x) = p
 */
export function normalQuantile(p, mean = 0, sd = 1) {
  if (p <= 0 || p >= 1 || sd <= 0) return NaN;

  const a = [
    -3.969683028665376e+01,  2.209460984245205e+02,
    -2.759285104469687e+02,  1.383577518672690e+02,
    -3.066479806614716e+01,  2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,  1.615858368580409e+02,
    -1.556989798598866e+02,  6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
     4.374664141464968e+00,  2.938163982698783e+00
  ];
  const d = [
     7.784695709041462e-03,  3.224671290700398e-01,
     2.445134137142996e+00,  3.754408661907416e+00
  ];

  const pLow  = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    r = (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
        ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    r = (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q /
        (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    r = -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
         ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }

  return mean + sd * r;
}

/**
 * Confidence interval for the regression line E[Y|X=x].
 *
 * @param {number} x - The x value at which to compute the interval
 * @param {Object} reg - Output from olsRegression()
 * @param {number} [alpha=0.05] - Significance level (0.05 for 95% CI)
 * @returns {{ lower: number, upper: number, fitted: number, se: number }}
 */
export function confidenceInterval(x, reg, alpha = 0.05) {
  const { intercept, slope, residualSE, n, meanX, ssX } = reg;
  if (!isFinite(intercept) || n < 3) {
    return { lower: NaN, upper: NaN, fitted: NaN, se: NaN };
  }

  const fitted = intercept + slope * x;
  const se = residualSE * Math.sqrt(1 / n + (x - meanX) ** 2 / ssX);
  const tCrit = _tQuantile(1 - alpha / 2, n - 2);

  return {
    lower:  fitted - tCrit * se,
    upper:  fitted + tCrit * se,
    fitted,
    se
  };
}

/**
 * Prediction interval for a new observation Y at X=x.
 *
 * @param {number} x - The x value
 * @param {Object} reg - Output from olsRegression()
 * @param {number} [alpha=0.05] - Significance level
 * @returns {{ lower: number, upper: number, fitted: number, se: number }}
 */
export function predictionInterval(x, reg, alpha = 0.05) {
  const { intercept, slope, residualSE, n, meanX, ssX } = reg;
  if (!isFinite(intercept) || n < 3) {
    return { lower: NaN, upper: NaN, fitted: NaN, se: NaN };
  }

  const fitted = intercept + slope * x;
  const se = residualSE * Math.sqrt(1 + 1 / n + (x - meanX) ** 2 / ssX);
  const tCrit = _tQuantile(1 - alpha / 2, n - 2);

  return {
    lower:  fitted - tCrit * se,
    upper:  fitted + tCrit * se,
    fitted,
    se
  };
}

/**
 * Approximate t-distribution quantile using the normal approximation
 * with Cornish-Fisher expansion (adequate for df >= 6; the expansion is
 * off by about -0.7% at df = 3, so prefer df >= 6 for critical values).
 *
 * @private
 * @param {number} p - Upper-tail probability (e.g. 0.975 for 95% CI)
 * @param {number} df - Degrees of freedom
 * @returns {number} t critical value
 */
function _tQuantile(p, df) {
  if (df <= 0 || p <= 0 || p >= 1) return NaN;
  if (df >= 300) return normalQuantile(p);

  // Cornish-Fisher expansion for t from z
  const z = normalQuantile(p);
  const z2 = z * z;
  const z3 = z2 * z;
  const z5 = z3 * z2;
  const z7 = z5 * z2;

  const g1 = (z3 + z) / (4 * df);
  const g2 = (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df);
  const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df * df * df);

  return z + g1 + g2 + g3;
}


// ── Exact distribution tails (incomplete beta) ──────────────────────────────
//
// These give machine-precision F- and t-distribution tail probabilities for
// regression inference (overall F-test, coefficient t-tests). All are pure
// functions verified against R's pf()/pt()/pbeta() to < 1e-13 max abs error.

/**
 * Natural logarithm of the gamma function, ln Γ(x).
 *
 * Lanczos approximation (g = 7, 9 coefficients), with the reflection formula
 * for x < 1/2. Accurate to ~1e-13 relative to R's lgamma() across x in
 * [0.1, 100]. Underpins the incomplete-beta prefactor in {@link regBetaI}.
 *
 * @param {number} x - Argument (x != 0, -1, -2, ... where Γ has poles)
 * @returns {number} ln Γ(x)
 */
export function lgamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  // Reflection: Γ(x)Γ(1-x) = π / sin(πx)  ->  lnΓ(x) = ln(π/sin(πx)) - lnΓ(1-x)
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }

  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Lentz's continued-fraction evaluation for the incomplete beta function
 * (Numerical Recipes `betacf`). Converges rapidly only for
 * x < (a+1)/(a+b+2); callers must apply the symmetry reflection otherwise.
 *
 * @private
 * @param {number} x
 * @param {number} a
 * @param {number} b
 * @returns {number} The continued-fraction value used by {@link regBetaI}
 */
function _betacf(x, a, b) {
  const FPMIN = 1e-300;   // guards against division by zero
  const EPS = 3e-16;      // ~machine epsilon for convergence
  const MAXIT = 300;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    // even step
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    // odd step
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/**
 * Regularized incomplete beta function I_x(a, b).
 *
 * Numerical Recipes algorithm: prefactor times the {@link _betacf}
 * continued fraction, with the mandatory symmetry reflection
 *   I_x(a,b) = 1 - I_{1-x}(b,a)  for  x > (a+1)/(a+b+2)
 * to keep the continued fraction in its fast-converging regime.
 *
 * @param {number} x - Upper limit in [0, 1]
 * @param {number} a - First shape parameter (> 0)
 * @param {number} b - Second shape parameter (> 0)
 * @returns {number} I_x(a, b) in [0, 1]; matches R's pbeta(x, a, b)
 */
export function regBetaI(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Symmetry reflection (mandatory for convergence near x = 1).
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regBetaI(1 - x, b, a);
  }

  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );
  return (bt * _betacf(x, a, b)) / a;
}

/**
 * Cumulative distribution function of the F distribution, P(F <= f).
 *
 * Uses the identity  F_CDF(f; d1, d2) = I_{d1 f / (d1 f + d2)}(d1/2, d2/2).
 *
 * @param {number} F - F statistic (>= 0)
 * @param {number} df1 - Numerator degrees of freedom
 * @param {number} df2 - Denominator degrees of freedom
 * @returns {number} P(F <= f); matches R's pf(f, df1, df2)
 */
export function fCdf(F, df1, df2) {
  if (F <= 0) return 0;
  return regBetaI((df1 * F) / (df1 * F + df2), df1 / 2, df2 / 2);
}

/**
 * Upper-tail (one-sided) p-value for an F statistic: P(F >= f).
 *
 * This is the p-value for a regression overall-F or model-comparison test.
 *
 * @param {number} F - Observed F statistic (>= 0)
 * @param {number} df1 - Numerator degrees of freedom
 * @param {number} df2 - Denominator degrees of freedom
 * @returns {number} Upper-tail probability; matches pf(f, df1, df2, lower.tail=FALSE)
 */
export function fPValue(F, df1, df2) {
  if (F <= 0) return 1;
  if (F === Infinity) return 0;
  // Direct complementary incomplete beta: P(F >= f) = I_{df2/(df2+df1 f)}(df2/2, df1/2).
  // NOT 1 - fCdf, which collapses to 0 once fCdf rounds to 1 (e.g. F=1221, df=(2,87):
  // true p ~ 2.19e-64). The direct form stays accurate to ~3e-14 relative even at p~1e-64.
  return regBetaI(df2 / (df2 + df1 * F), df2 / 2, df1 / 2);
}

/**
 * Cumulative distribution function of Student's t, P(T <= t).
 *
 * Built on the incomplete beta via  I_{df/(df+t²)}(df/2, 1/2), reflected by
 * the sign of t. Symmetric and numerically stable for all df > 0.
 *
 * @param {number} t - t statistic
 * @param {number} df - Degrees of freedom (> 0)
 * @returns {number} P(T <= t); matches R's pt(t, df)
 */
export function tCdf(t, df) {
  const p = regBetaI(df / (df + t * t), df / 2, 0.5);
  // p = P(T <= -|t|) + P(T >= |t|) = 2 * P(T >= |t|); split by sign of t.
  return t >= 0 ? 1 - 0.5 * p : 0.5 * p;
}

/**
 * Two-sided tail p-value for a t statistic: P(|T| >= |t|).
 *
 * Uses the exact identity  2·P(T >= |t|) = I_{df/(df+t²)}(df/2, 1/2)
 * directly, which avoids the catastrophic cancellation of computing
 * 1 - tCdf for large |t| (where tCdf rounds to 1). This is the p-value
 * for a regression coefficient t-test.
 *
 * @param {number} t - Observed t statistic
 * @param {number} df - Degrees of freedom (> 0)
 * @returns {number} Two-sided probability; matches R's 2*pt(-abs(t), df)
 */
export function tTailP(t, df) {
  return regBetaI(df / (df + t * t), df / 2, 0.5);
}


// ============================================================================
// 5. RANDOM NUMBER GENERATION
// ============================================================================

/**
 * Create a seeded pseudo-random number generator (Mulberry32 algorithm).
 * Deterministic: same seed always produces the same sequence.
 *
 * @param {number} seed - Integer seed
 * @returns {{ random: function(): number }} Object with .random() returning [0, 1)
 */
export function seededRng(seed) {
  let s = seed | 0;

  function mulberry32() {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return { random: mulberry32 };
}

/**
 * Generate an array of normal random variates using Box-Muller transform.
 *
 * @param {number} n - Number of samples
 * @param {number} [mean=0]
 * @param {number} [sd=1]
 * @param {number} [seed=42] - PRNG seed for reproducibility
 * @returns {number[]}
 */
export function normalRandom(n, mean = 0, sd = 1, seed = 42) {
  const rng = seededRng(seed);
  const result = [];

  for (let i = 0; i < n; i += 2) {
    let u1, u2;
    do { u1 = rng.random(); } while (u1 === 0);
    u2 = rng.random();

    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;

    result.push(mean + sd * r * Math.cos(theta));
    if (i + 1 < n) {
      result.push(mean + sd * r * Math.sin(theta));
    }
  }

  return result;
}

/**
 * Generate bivariate normal samples with a specified correlation.
 *
 * Uses the Cholesky decomposition method:
 *   X = Z1
 *   Y = r * Z1 + sqrt(1 - r^2) * Z2
 *
 * Z1 and Z2 are taken as the two disjoint halves of a SINGLE length-2n
 * standard-normal stream rather than two separately seeded streams. The
 * old `seed + 9999` second seed could alias the first stream for nearby
 * seeds (and produced an identical stream at seed 0), inducing large spurious
 * correlation; splitting one stream removes all seed-coupling.
 *
 * Even with decoupled streams, the *in-sample* corr(Z1, Z2) of two finite
 * independent normal columns is pure sampling noise of order 1/sqrt(n)
 * (~0.07 at n = 200) and is therefore irreducible below that floor by any
 * choice of seed. To make the realized correlation of (X, Y) reflect `r`
 * alone — independent of seed — Z2 is orthogonalized against Z1 by one
 * Gram-Schmidt step and rescaled to unit sample variance. This drives
 * corr(Z1, Z2) to ~1e-16 (machine zero) for every seed, so the Cholesky mix
 * y = r·Z1 + sqrt(1 - r²)·Z2 yields a realized corr(X, Y) ≈ r that is
 * seed-independent and free of the old ~0.07 bias (a small residual deviation
 * remains because only Z2 — not Z1 — is normalized to unit sample variance).
 *
 * @param {number} n - Number of (x, y) pairs
 * @param {number} r - Desired Pearson correlation in [-1, 1]
 * @param {number} [seed=42] - PRNG seed
 * @param {{ meanX?: number, meanY?: number, sdX?: number, sdY?: number }} [params]
 * @returns {Array<{ x: number, y: number }>}
 */
export function bivariateNormal(n, r, seed = 42, params = {}) {
  const { meanX = 0, meanY = 0, sdX = 1, sdY = 1 } = params;
  const clampedR = Math.max(-1, Math.min(1, r));

  const pool = normalRandom(2 * n, 0, 1, seed);
  const z1 = pool.slice(0, n);
  const z2raw = pool.slice(n);

  // Gram-Schmidt: strip the in-sample component of Z2 along Z1, then rescale
  // to unit sample variance. Makes corr(Z1, Z2) ~= 0 to machine precision.
  let m1 = 0, m2 = 0;
  for (let i = 0; i < n; i++) { m1 += z1[i]; m2 += z2raw[i]; }
  m1 /= n; m2 /= n;
  let dot = 0, nrm = 0;
  for (let i = 0; i < n; i++) {
    const c1 = z1[i] - m1;
    dot += c1 * (z2raw[i] - m2);
    nrm += c1 * c1;
  }
  const beta = nrm > 0 ? dot / nrm : 0;
  const resid = z2raw.map((v, i) => (v - m2) - beta * (z1[i] - m1));
  let ss = 0;
  for (let i = 0; i < n; i++) ss += resid[i] * resid[i];
  const scale = ss > 0 ? Math.sqrt((n - 1) / ss) : 1;
  const z2 = resid.map(v => v * scale);

  return z1.map((z1i, i) => {
    const x = meanX + sdX * z1i;
    const y = meanY + sdY * (clampedR * z1i + Math.sqrt(1 - clampedR * clampedR) * z2[i]);
    return { x, y };
  });
}

/**
 * Generate Bernoulli (0/1) samples.
 *
 * @param {number} n - Number of samples
 * @param {number} p - Success probability in [0, 1]
 * @param {number} [seed=42]
 * @returns {number[]} Array of 0s and 1s
 */
export function bernoulliRandom(n, p, seed = 42) {
  const rng = seededRng(seed);
  const clampedP = Math.max(0, Math.min(1, p));
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(rng.random() < clampedP ? 1 : 0);
  }
  return result;
}

/**
 * Generate uniform random samples in [min, max).
 *
 * @param {number} n - Number of samples
 * @param {number} [min=0]
 * @param {number} [max=1]
 * @param {number} [seed=42]
 * @returns {number[]}
 */
export function uniformRandom(n, min = 0, max = 1, seed = 42) {
  const rng = seededRng(seed);
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(min + (max - min) * rng.random());
  }
  return result;
}


// ============================================================================
// 6. FORMATTING
// ============================================================================

/**
 * Format a regression coefficient to a fixed number of decimal places.
 * Handles NaN and Infinity gracefully.
 *
 * @param {number} x - The value to format
 * @param {number} [digits=3] - Number of decimal places
 * @returns {string}
 */
export function formatCoef(x, digits = 3) {
  if (!isFinite(x)) return "\u2014";
  return x.toFixed(digits);
}

/**
 * Format a p-value with conventional thresholds.
 * Very small p-values use "< .001"; moderate values drop the leading zero.
 *
 * @param {number} p - The p-value
 * @param {number} [digits=4] - Decimal places for moderate p-values
 * @returns {string}
 */
export function formatPValue(p, digits = 4) {
  if (!isFinite(p) || p < 0) return "\u2014";
  if (p < 0.001) return "< .001";
  // Drop leading zero: ".0234" instead of "0.0234"
  const str = p.toFixed(digits);
  return str.startsWith("0") ? str.slice(1) : str;
}

/**
 * Format a number as a percentage.
 *
 * @param {number} x - Value to format (0.5 -> "50.0%")
 * @param {number} [digits=1] - Decimal places
 * @returns {string}
 */
export function formatPercent(x, digits = 1) {
  if (!isFinite(x)) return "\u2014";
  return (x * 100).toFixed(digits) + "%";
}

/**
 * Format a number with a sign prefix ("+2.34" or "-1.56").
 * Useful for displaying coefficient changes or deviations.
 *
 * @param {number} x
 * @param {number} [digits=2]
 * @returns {string}
 */
export function formatSigned(x, digits = 2) {
  if (!isFinite(x)) return "\u2014";
  const prefix = x >= 0 ? "+" : "";
  return prefix + x.toFixed(digits);
}


// ============================================================================
// 7. INTERACTIVE HELPERS
// ============================================================================

/**
 * Create a standard "Interactive Exploration" container layout.
 * Returns an HTML element with consistent styling for all OJS apps.
 *
 * @param {{ title?: string, width?: number }} [options]
 * @returns {HTMLDivElement}
 */
export function createContainer(options = {}) {
  const { title = "", width = 700 } = options;

  const container = document.createElement("div");
  container.className = "ber640-interactive";
  container.style.cssText = `
    max-width: ${width}px;
    margin: 1rem auto;
    padding: 0;
  `;

  if (title) {
    const header = document.createElement("div");
    header.className = "ber640-interactive-header";
    header.style.cssText = `
      font-size: 15px;
      font-weight: 600;
      color: ${themeColors().text};
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid ${themeColors().grid};
    `;
    header.textContent = title;
    container.appendChild(header);
  }

  return container;
}

/**
 * Create a controls row - a flexbox container for sliders and inputs.
 *
 * @returns {HTMLDivElement}
 */
export function createControlsRow() {
  const row = document.createElement("div");
  row.className = "ber640-controls";
  row.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: flex-end;
    margin-bottom: 0.75rem;
  `;
  return row;
}

/**
 * Create a real-time value display / readout element.
 * Shows a label and a dynamically updated value.
 *
 * @param {string} label - Display label (e.g. "SSE")
 * @param {string|number} initialValue - Starting value
 * @param {{ color?: string, fontSize?: string }} [options]
 * @returns {{ element: HTMLDivElement, update: function(string|number): void }}
 */
export function createReadout(label, initialValue = "", options = {}) {
  const { color = ber640.primary, fontSize = "16px" } = options;
  const t = themeColors();

  const wrapper = document.createElement("div");
  wrapper.className = "ber640-readout";
  wrapper.style.cssText = `
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  const labelEl = document.createElement("span");
  labelEl.style.cssText = `
    font-size: 13px;
    font-weight: 600;
    color: ${t.muted};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  `;
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.style.cssText = `
    font-size: ${fontSize};
    font-weight: 700;
    color: ${t.isDark ? "#dee2e6" : color};
    font-variant-numeric: tabular-nums;
  `;
  valueEl.textContent = String(initialValue);

  wrapper.appendChild(labelEl);
  wrapper.appendChild(valueEl);

  return {
    element: wrapper,
    update(val) { valueEl.textContent = String(val); }
  };
}

/**
 * Format data for a tooltip display.
 * Returns an HTML string with key-value pairs.
 *
 * @param {Object} data - Key-value pairs to display
 * @param {{ title?: string }} [options]
 * @returns {string} HTML string
 */
export function formatTooltip(data, options = {}) {
  const { title = "" } = options;
  const t = themeColors();
  let html = "";

  if (title) {
    html += `<div style="font-weight:700;margin-bottom:4px;color:${t.text}">${title}</div>`;
  }

  for (const [key, value] of Object.entries(data)) {
    html += `<div style="font-size:12px;color:${t.text}">`;
    html += `<span style="color:${t.muted}">${key}:</span> `;
    html += `<strong>${value}</strong></div>`;
  }

  return html;
}

// ── Reset-to-defaults (Step 1.3) ────────────────────────────

/**
 * Build a "Reset" button that restores a set of Observable Inputs controls to
 * their default values and fires the reactivity Observable listens for.
 *
 * Observable's `viewof` machinery works like this: `viewof x = Inputs.range(...)`
 * binds `x` to `view.value`, and the runtime recomputes every cell that
 * references `x` whenever the view element dispatches an "input" event. So to
 * programmatically change a control we must (1) write the new value onto the
 * element using the property that *that* input type reads back, and then
 * (2) dispatch `new Event("input", { bubbles: true })` from the element that
 * `viewof` is bound to. Just setting `.value` is NOT enough — without the event
 * the runtime never recomputes.
 *
 * The catch is that "the element viewof produced" is a different DOM shape per
 * Inputs constructor:
 *   - Inputs.range  -> the bare <input type="range">           (el IS the input)
 *   - Inputs.toggle -> a <form> wrapping one <input type=checkbox>
 *   - Inputs.radio  -> a <form> (fieldset-like) of <input type=radio> name-grouped
 *   - Inputs.select -> a <select> (or a <form> wrapping it, version-dependent)
 *   - Inputs.checkbox (multi) -> a <form> whose .value is an array
 * For every form-based input, Observable defines a settable `.value` getter/
 * setter on the FORM that does the right internal bookkeeping (checks the right
 * radio, syncs the output label, etc.). We therefore prefer "assign to el.value
 * on the viewof element, then dispatch input on that same element", and only
 * fall back to type-specific DOM poking when the element is a raw <input> that
 * has no Observable value-setter (the range case).
 *
 * @param {Array<{input: HTMLElement, value: *}>} specs
 *        Each `input` is the element a `viewof` produced (pass the viewof
 *        binding directly, e.g. `{ input: viewof poly_degree, value: 2 }`).
 *        `value` is the default to restore (number for range, boolean for
 *        toggle, the option's value for radio/select, array for multi-checkbox).
 * @param {{label?: string, onReset?: function(): void}} [opts]
 *        label   - button text (default "Reset").
 *        onReset - optional callback fired AFTER all controls are reset and
 *                  their events dispatched (e.g. to reset non-Inputs state).
 * @returns {HTMLButtonElement} a styled <button class="ojs-btn ojs-btn-outline">.
 *
 * @example  // in an OJS cell, AFTER the viewof cells exist:
 *   resetBtn = S.resetControls([
 *     { input: viewof poly_degree,        value: 2     },  // range
 *     { input: viewof poly_showResiduals, value: false },  // toggle
 *     { input: viewof logtx_modelType,    value: "Level–Level" } // radio
 *   ])
 */
export function resetControls(specs, opts = {}) {
  const { label = "Reset", onReset } = opts;

  const btn = document.createElement("button");
  btn.type = "button";                       // never submit a surrounding form
  btn.className = "ojs-btn ojs-btn-outline";  // themed in interactive.css (light+dark)
  btn.textContent = label;
  btn.setAttribute("aria-label", label + " controls to defaults");

  btn.addEventListener("click", () => {
    for (const spec of (specs || [])) {
      if (!spec || !spec.input) continue;
      resetOneControl(spec.input, spec.value);
    }
    if (typeof onReset === "function") onReset();
  });

  return btn;
}

/**
 * Restore a single Observable Inputs control to `value` and dispatch the
 * "input" event the runtime needs. Detects the DOM shape rather than trusting
 * the caller, so it is robust to every Inputs constructor used in the book
 * (range, toggle, radio, select, multi-checkbox).
 * @private
 */
function resetOneControl(el, value) {
  if (!el || typeof el.dispatchEvent !== "function") return;

  const tag = el.tagName;  // "INPUT" | "FORM" | "SELECT" | ...

  // ---- Case A: a raw <input> IS the viewof element (Inputs.range, and any
  // bare single input). There is no Observable value-setter here, so write the
  // property the element actually reads back, then dispatch from the input. ----
  if (tag === "INPUT") {
    const type = (el.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") {
      // A lone checkbox/radio bound directly: boolean-ish -> .checked
      el.checked = !!value;
    } else {
      // range / number / text / etc. — the value is read from .value as a string
      el.value = String(value);
    }
    fireInput(el);
    return;
  }

  // ---- Case B: a <select> bound directly (some Inputs.select builds). ----
  if (tag === "SELECT") {
    el.value = String(value);
    fireInput(el);
    return;
  }

  // ---- Case C: a <form> wrapper (Inputs.toggle, Inputs.radio, Inputs.select
  // in current builds, Inputs.checkbox multi). Observable installs a settable
  // `.value` on the form that performs the correct internal bookkeeping
  // (checking the right radio, syncing the <output>, coercing types). Prefer it. ----
  if ("value" in el) {
    try {
      el.value = value;          // Observable's setter: handles bool/string/array
      fireInput(el);             // recompute cells bound to this viewof
      return;
    } catch (_) {
      /* fall through to manual DOM handling below */
    }
  }

  // ---- Case D (defensive fallback): a <form>/fieldset with no usable value
  // setter — set the underlying inputs by hand, then dispatch on the wrapper. ----
  const inputs = el.querySelectorAll
    ? el.querySelectorAll('input, select, textarea')
    : [];

  if (inputs.length === 0) {
    // Nothing to set; still try to nudge reactivity.
    fireInput(el);
    return;
  }

  // Radio group: check the input whose value matches; uncheck the rest.
  const radios = Array.from(inputs).filter(i => i.type === "radio");
  if (radios.length > 0) {
    const target = String(value);
    let matched = false;
    for (const r of radios) {
      const on = r.value === target;
      r.checked = on;
      if (on) matched = true;
    }
    // Fire on a checked member if present (radios report via the group), else form.
    fireInput(matched ? radios.find(r => r.checked) : el);
    return;
  }

  // Single checkbox inside a form (toggle-like fallback).
  const checks = Array.from(inputs).filter(i => i.type === "checkbox");
  if (checks.length === 1) {
    checks[0].checked = !!value;
    fireInput(checks[0]);
    return;
  }
  // Multi-checkbox group: `value` expected to be an array of checked values.
  if (checks.length > 1) {
    const wanted = new Set((Array.isArray(value) ? value : [value]).map(String));
    for (const c of checks) c.checked = wanted.has(c.value);
    fireInput(checks[0]);
    return;
  }

  // Any other single control (range/number/select) living inside the form.
  const first = inputs[0];
  first.value = String(value);
  fireInput(first);
}

/**
 * Dispatch the bubbling "input" event Observable's runtime listens for.
 * `bubbles: true` lets the event reach the viewof <form> when we fired it from
 * a child <input> (radio/checkbox case). We also fire "change" for the benefit
 * of any select/radio listeners that key on change rather than input.
 * @private
 */
function fireInput(el) {
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}


/**
 * Create a styled equation display element.
 * Useful for showing the regression equation or model formula dynamically.
 *
 * @param {string} equationText - Plain text or simple HTML equation
 * @returns {HTMLDivElement}
 */
export function createEquationDisplay(equationText = "") {
  const t = themeColors();
  const el = document.createElement("div");
  el.className = "ber640-equation";
  el.style.cssText = `
    font-family: "Cambria Math", "STIX Two Math", Georgia, serif;
    font-size: 16px;
    text-align: center;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    background: ${t.isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"};
    border-radius: 6px;
    color: ${t.text};
    font-style: italic;
    overflow-x: auto;
  `;
  el.innerHTML = equationText;
  return el;
}


// ============================================================================
// 8. DATA UTILITIES
// ============================================================================

/**
 * Generate an evenly spaced sequence of numbers (like R's seq()).
 *
 * @param {number} from - Start value (inclusive)
 * @param {number} to - End value (inclusive)
 * @param {number} [length=50] - Number of points
 * @returns {number[]}
 */
export function seq(from, to, length = 50) {
  if (length < 1) return [];
  if (length === 1) return [from];
  const step = (to - from) / (length - 1);
  return Array.from({ length }, (_, i) => from + i * step);
}

/**
 * Compute basic descriptive statistics for a numeric array.
 *
 * @param {number[]} arr
 * @returns {{ mean: number, sd: number, min: number, max: number, median: number, n: number }}
 */
export function describe(arr) {
  const valid = arr.filter(isFinite);
  const n = valid.length;
  if (n === 0) return { mean: NaN, sd: NaN, min: NaN, max: NaN, median: NaN, n: 0 };

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  let ssq = 0;
  for (const v of valid) ssq += (v - mean) ** 2;
  const sd = n > 1 ? Math.sqrt(ssq / (n - 1)) : 0;

  const median = n % 2 === 1
    ? sorted[(n - 1) / 2]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  return { mean, sd, min: sorted[0], max: sorted[n - 1], median, n };
}

/**
 * Compute the Pearson correlation coefficient between two arrays.
 *
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number} r in [-1, 1], or NaN if undefined
 */
export function correlation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return NaN;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (!isFinite(x[i]) || !isFinite(y[i])) continue;
    sumX  += x[i];
    sumY  += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
    sumYY += y[i] * y[i];
    count++;
  }

  if (count < 2) return NaN;
  const denom = Math.sqrt(
    (count * sumXX - sumX * sumX) * (count * sumYY - sumY * sumY)
  );
  if (denom === 0) return NaN;

  return (count * sumXY - sumX * sumY) / denom;
}

// ── Accessibility Helpers ──────────────────────────────────────────────────

/**
 * Create a screen-reader-only summary element for an OJS app.
 * Updates reactively when the text changes.
 *
 * @param {string} id - Unique ID for the summary element
 * @param {string} text - Summary text to display
 * @returns {HTMLElement} A visually-hidden div with aria-live
 *
 * @example
 * srSummary("app-1-1", `Regression: y = ${ols.intercept.toFixed(2)} + ${ols.slope.toFixed(2)}x, R² = ${ols.r2.toFixed(3)}`)
 */
export function srSummary(id, text) {
  const el = document.createElement("div");
  el.id = id;
  el.className = "sr-only";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("role", "status");
  el.textContent = text;
  return el;
}

/**
 * Add low-risk shared accessibility attributes to generated OJS controls.
 * Observable Inputs.range renders a named number input plus an unnamed range
 * input; this copies the visible number label onto the actual slider.
 *
 * @param {ParentNode} [root=document] - DOM root to enhance
 * @returns {{ ranges: number, svgs: number }} Counts of enhanced elements
 */
export function enhanceOjsAccessibility(root = document) {
  if (!root || !root.querySelectorAll) return { ranges: 0, svgs: 0 };
  let ranges = 0;
  let svgs = 0;

  for (const input of root.querySelectorAll('input[type="range"]')) {
    if (input.hasAttribute("aria-label") ||
        input.hasAttribute("aria-labelledby") ||
        input.hasAttribute("title") ||
        (input.labels && input.labels.length > 0)) {
      continue;
    }
    const label = rangeLabelText(input);
    if (label) {
      input.setAttribute("aria-label", label);
      input.dataset.ojsA11yEnhanced = "range";
      ranges++;
    }
  }

  for (const svg of root.querySelectorAll(".ojs-app svg")) {
    if (svg.hasAttribute("aria-hidden") ||
        svg.hasAttribute("aria-label") ||
        svg.hasAttribute("aria-labelledby") ||
        svg.querySelector("title")) {
      continue;
    }
    const app = svg.closest(".ojs-app");
    const summary = app?.querySelector(".sr-only, [role='status']");
    if (summary) {
      svg.setAttribute("aria-hidden", "true");
    } else {
      const appLabel = app?.getAttribute("aria-label") || "Interactive statistical graphic";
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `${appLabel} plot`);
    }
    svg.dataset.ojsA11yEnhanced = "svg";
    svgs++;
  }

  return { ranges, svgs };
}

function rangeLabelText(input) {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const parent = input.parentElement;
  const numberInput = parent?.querySelector('input[type="number"][id]');
  if (numberInput?.id) {
    const label = document.querySelector(`label[for="${cssEscape(numberInput.id)}"]`);
    const text = clean(label?.textContent);
    if (text) return `${text} slider`;
  }
  const formLabel = input.closest("form")?.querySelector("label");
  const formText = clean(formLabel?.textContent);
  if (formText) return `${formText} slider`;
  const groupLabel = input.closest(".ojs-control-group")?.querySelector("label");
  const groupText = clean(groupLabel?.textContent);
  if (groupText) return `${groupText} slider`;
  const appLabel = clean(input.closest(".ojs-app")?.getAttribute("aria-label"));
  return appLabel ? `${appLabel} slider` : "Interactive slider";
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

let ojsEnhancementsInstalled = false;

/**
 * Install a MutationObserver that keeps shared OJS accessibility attributes
 * present as Observable cells hydrate and update.
 *
 * @returns {{ disconnect: function(): void }}
 */
export function installOjsEnhancements() {
  if (typeof document === "undefined" || ojsEnhancementsInstalled) {
    return { disconnect() {} };
  }
  ojsEnhancementsInstalled = true;

  let pending = false;
  const runSoon = () => {
    if (pending) return;
    pending = true;
    const run = () => {
      pending = false;
      enhanceOjsAccessibility(document);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  };

  runSoon();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runSoon, { once: true });
  }
  setTimeout(runSoon, 300);
  setTimeout(runSoon, 1200);

  const observer = new MutationObserver(runSoon);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  return { disconnect: () => observer.disconnect() };
}

if (typeof window !== "undefined") {
  installOjsEnhancements();
}
