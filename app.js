const SHEET_ID = "1AlFfgJNvyJEGAJ_-XOY4Qtvq94lnVTcWNsf9bwkD7S0";
const SHEET_GID = "0";

const STEP_TEXT = [
  "Revenue trend",
  "Split view with profit highlighted",
  "Profit (%) by year",
  "Revenue, capacity and profit",
  "Revenue, capacity, profit and target",
  "Profit and target",
  "Profit progress to target by year",
  "Utilisation"
];
/** Ring slide: profit margin from sheet row 4 (Profit %) — deck slide 3. */
const STEP_PROFIT_MARGIN_RING = 2;
const BRAND = {
  primary: "#6405FF",
  primarySoft: "#9A6DFF",
  primaryMuted: "rgba(154, 109, 255, 0.35)",
  text: "#F5F5F5",
  grid: "rgba(255, 255, 255, 0.12)"
};
const BAR_THICKNESS = 42;
const ABOVE_CAPACITY_GREEN = "#22C55E";
const ABOVE_TARGET_CYAN = "#06B6D4";

const subtitleEl = document.getElementById("subtitle");
const statusEl = document.getElementById("status");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");
const chartCardEl = document.getElementById("barSection");
const ringSectionEl = document.getElementById("ringSection");
const ringGridEl = document.getElementById("ringGrid");

let chart;
let currentStep = 0;
let years = [];
let revenue = [];
let profit = [];
let capacity = [];
let target = [];
let targetPercent = [];
let utilisation = [];
let profitMarginPercent = [];
let fteCalcNotes = [];
let ringCharts = [];
/** When false, chart labels exclude calendar years after the current year. */
let showFutureYears = false;

function parseCurrency(raw) {
  if (!raw) return 0;
  const normalized = String(raw).replace(/[^0-9.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parsePercent(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const normalized = String(raw).replace(/[^0-9.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseSeries(row, length, parser, emptyFallback) {
  const cells = (row || []).slice(1, length + 1);
  const parsed = Array.from({ length }, (_, index) => {
    const value = cells[index];
    return value === undefined || value === "" ? emptyFallback : parser(value);
  });
  return parsed;
}

function parseTextSeries(row, length) {
  const cells = (row || []).slice(1, length + 1);
  return Array.from({ length }, (_, index) => {
    const value = cells[index];
    if (value === undefined || value === null) return "";
    return String(value).trim();
  });
}

function parseFteRangeRow(row, length) {
  const cells = row || [];
  if (!cells.length) return Array.from({ length }, () => "");
  const first = String(cells[0] ?? "").trim().toLowerCase();
  const startsWithLabel =
    first === "fte calc" || first === "fte calculation" || first === "fte notes";
  const startIndex = startsWithLabel ? 1 : 0;
  return Array.from({ length }, (_, i) => {
    const value = cells[startIndex + i];
    if (value === undefined || value === null) return "";
    return String(value).trim();
  });
}

function fetchSheetRows(range) {
  // JSONP avoids browser CORS errors from direct cross-origin fetches.
  return new Promise((resolve, reject) => {
    const cbName = `sheetCb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Timed out reading Google Sheet. Ensure the sheet is viewable by link or published to web."
        )
      );
    }, 10000);

    function cleanup() {
      clearTimeout(timeoutId);
      if (window[cbName]) {
        delete window[cbName];
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[cbName] = (response) => {
      try {
        const gvizRows = response?.table?.rows || [];
        if (!gvizRows.length) {
          throw new Error("No rows returned from Google Sheets.");
        }

        const pivoted = gvizRows.map((row) =>
          (row.c || []).map((cell) => {
            if (!cell) return "";
            return cell.f ?? cell.v ?? "";
          })
        );
        cleanup();
        resolve(pivoted);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Failed to load Google Sheets endpoint. Ensure network access and sharing settings are correct."
        )
      );
    };

    const tqx = encodeURIComponent(`responseHandler:${cbName}`);
    const rangeParam = range ? `&range=${encodeURIComponent(range)}` : "";
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=${tqx}&gid=${SHEET_GID}${rangeParam}`;
    document.head.appendChild(script);
  });
}

function extractSeries(rows, fteRangeRow) {
  const normalizeLabel = (value) => String(value ?? "").trim().toLowerCase();
  const findRowByLabels = (labels, fallbackIndex) =>
    rows.find((row) => labels.includes(normalizeLabel(row?.[0]))) || rows[fallbackIndex] || [];

  const yearRow = rows.find((row) => String(row?.[0] ?? "").trim() === "") || rows[0] || [];
  const revenueRow = findRowByLabels(["turnover", "revenue"], 1);
  /** Prefer £ profit row; do not match "Profit (%)" or other profit-derived rows. */
  const profitRow =
    rows.find((row) => {
      const lab = normalizeLabel(row?.[0]);
      if (!lab.startsWith("profit")) return false;
      if (lab.includes("%")) return false;
      return true;
    }) || rows[2] || [];
  /** Row 4: Profit (%) — margin as % of revenue. */
  const profitPctRow =
    rows.find((row) => {
      const lab = normalizeLabel(row?.[0]);
      return lab.startsWith("profit") && lab.includes("%");
    }) || rows[3] || [];
  const capacityRow = findRowByLabels(["capacity"], 9);
  const targetRow = findRowByLabels(["target profit", "target"], 10);
  /** Row 12 in current sheet: "Profit vs Target" (may exceed 100%). */
  const percentRow =
    rows.find((row) => {
      const lab = normalizeLabel(row?.[0]);
      return (
        lab === "profit vs target" ||
        lab === "profit vs target %" ||
        ["target %", "target percentage", "profit vs target %"].includes(lab) ||
        (lab.includes("profit") && lab.includes("target") && lab.includes("vs"))
      );
    }) || rows[11] || [];
  /** Row 17: "Capacity % Achieved" — can exceed 100%; also match legacy "Utilisation" labels. */
  const utilisationRow =
    rows.find((row) => {
      const lab = normalizeLabel(row?.[0]);
      return (
        (lab.includes("capacity") && lab.includes("achieved")) ||
        lab.includes("capacity % achieved") ||
        lab === "utilisation" ||
        lab === "utilization" ||
        lab.includes("utilisation") ||
        lab.includes("utilization")
      );
    }) ||
    rows[16] ||
    [];
  const fteCalcRow = findRowByLabels(["fte calc", "fte calculation", "fte notes"], 22);

  const yearCells = yearRow.slice(1).map((cell) => String(cell).trim());
  years = yearCells.filter((cell) => /^\d{4}$/.test(cell));

  const seriesLength = years.length;
  revenue = parseSeries(revenueRow, seriesLength, parseCurrency, 0);
  profit = parseSeries(profitRow, seriesLength, parseCurrency, 0);
  capacity = parseSeries(capacityRow, seriesLength, parseCurrency, 0);
  target = parseSeries(targetRow, seriesLength, parseCurrency, 0);
  targetPercent = parseSeries(percentRow, seriesLength, parsePercent, null);

  targetPercent = targetPercent.map((value, index) => {
    if (value !== null && value !== undefined && Number.isFinite(Number(value))) return Number(value);
    if (!target[index]) return 0;
    return (profit[index] / target[index]) * 100;
  });

  function normaliseUtilisationPct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
    let n = Number(value);
    if (n > 0 && n <= 1) n *= 100;
    return Math.max(0, n);
  }

  utilisation = parseSeries(utilisationRow, seriesLength, parsePercent, null).map(normaliseUtilisationPct);
  if (utilisation.length && utilisation.every((v) => v === 0) && rows[16]) {
    utilisation = parseSeries(rows[16], seriesLength, parsePercent, null).map(normaliseUtilisationPct);
  }

  function normaliseMarginPct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
    let n = Number(value);
    if (n > 0 && n <= 1) n *= 100;
    return Math.max(0, Math.min(100, n));
  }

  profitMarginPercent = parseSeries(profitPctRow, seriesLength, parsePercent, null).map(normaliseMarginPct);
  fteCalcNotes = parseTextSeries(fteCalcRow, seriesLength);
  if (fteRangeRow && fteCalcNotes.every((s) => !String(s).trim())) {
    fteCalcNotes = parseFteRangeRow(fteRangeRow, seriesLength);
  }

  if (!years.length || !revenue.length || !profit.length || !capacity.length || !target.length) {
    throw new Error(
      "Data not found in expected rows: years, revenue/turnover, profit, capacity, target profit."
    );
  }
}

function getCalendarYear() {
  return new Date().getFullYear();
}

/** Indices into full `years` / series arrays for the current view. */
function displayYearIndices() {
  const cy = getCalendarYear();
  return years.map((_, i) => i).filter((i) => {
    const y = parseInt(String(years[i]).trim(), 10);
    if (!Number.isFinite(y)) return false;
    return showFutureYears || y <= cy;
  });
}

function getDisplay() {
  const ix = displayYearIndices();
  const pick = (arr) => ix.map((i) => arr[i]);
  return {
    indices: ix,
    years: pick(years),
    revenue: pick(revenue),
    profit: pick(profit),
    capacity: pick(capacity),
    target: pick(target),
    targetPercent: pick(targetPercent),
    utilisation: pick(utilisation),
    profitMarginPercent: pick(profitMarginPercent),
    fteCalcNotes: pick(fteCalcNotes)
  };
}

function isCapacityStep(step) {
  return step === 3 || step === 4 || step === STEP_TEXT.length - 1;
}

function revenueToCapacityFrom(d) {
  return d.years.map((_, i) => Math.min(d.revenue[i], d.capacity[i]));
}

/** Floating bar [yMin, yMax] so the segment sits above the capacity line, not from zero. */
function revenueAboveCapacityFloatingFrom(d) {
  return d.years.map((_, i) => {
    if (d.revenue[i] <= d.capacity[i]) return null;
    return [d.capacity[i], d.revenue[i]];
  });
}

function profitToTargetFrom(d) {
  return d.years.map((_, i) => Math.min(d.profit[i], d.target[i]));
}

/** Floating bar [yMin, yMax] from target profit line up to actual profit when profit exceeds target. */
function profitAboveTargetFloatingFrom(d) {
  return d.years.map((_, i) => {
    if (d.profit[i] <= d.target[i]) return null;
    return [d.target[i], d.profit[i]];
  });
}

function stepConfig(step, d) {
  if (!d.years.length) {
    return { datasets: [] };
  }

  if (step === 0) {
    return {
      datasets: [
        {
          label: "Revenue",
          data: d.revenue,
          type: "bar",
          borderColor: "#FFFFFF",
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          borderWidth: 1,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        }
      ]
    };
  }

  if (step === 1) {
    return {
      datasets: [
        {
          label: "Revenue",
          data: d.revenue,
          type: "bar",
          borderColor: "#FFFFFF",
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          borderWidth: 1,
          grouped: false,
          order: 2,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Profit",
          data: d.profit,
          type: "bar",
          borderColor: BRAND.primary,
          backgroundColor: "rgba(100, 5, 255, 0.95)",
          borderWidth: 1,
          grouped: false,
          order: 1,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        }
      ]
    };
  }

  if (step === 3) {
    return {
      datasets: [
        {
          label: "Capacity",
          data: d.capacity,
          type: "bar",
          borderColor: "rgba(255, 255, 255, 0.7)",
          backgroundColor: "rgba(255, 255, 255, 0.5)",
          borderWidth: 1,
          grouped: false,
          order: 5,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Revenue (to capacity)",
          data: revenueToCapacityFrom(d),
          type: "bar",
          borderColor: "#FFFFFF",
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          borderWidth: 1,
          grouped: false,
          order: 4,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Above capacity",
          data: revenueAboveCapacityFloatingFrom(d),
          type: "bar",
          borderColor: ABOVE_CAPACITY_GREEN,
          backgroundColor: "rgba(34, 197, 94, 0.85)",
          borderWidth: 1,
          grouped: false,
          order: 3,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Profit",
          data: d.profit,
          type: "bar",
          borderColor: BRAND.primary,
          backgroundColor: "rgba(100, 5, 255, 0.95)",
          borderWidth: 1,
          grouped: false,
          order: 1,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        }
      ]
    };
  }

  if (step === 4) {
    return {
      datasets: [
        {
          label: "Capacity",
          data: d.capacity,
          type: "bar",
          borderColor: "rgba(255, 255, 255, 0.7)",
          backgroundColor: "rgba(255, 255, 255, 0.5)",
          borderWidth: 1,
          grouped: false,
          order: 6,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Revenue (to capacity)",
          data: revenueToCapacityFrom(d),
          type: "bar",
          borderColor: "#FFFFFF",
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          borderWidth: 1,
          grouped: false,
          order: 5,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Above capacity",
          data: revenueAboveCapacityFloatingFrom(d),
          type: "bar",
          borderColor: ABOVE_CAPACITY_GREEN,
          backgroundColor: "rgba(34, 197, 94, 0.85)",
          borderWidth: 1,
          grouped: false,
          order: 4,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Target profit",
          data: d.target,
          type: "bar",
          borderColor: "#A873FF",
          backgroundColor: "rgba(168, 115, 255, 0.72)",
          borderWidth: 1,
          grouped: false,
          order: 3,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Profit (to target)",
          data: profitToTargetFrom(d),
          type: "bar",
          borderColor: BRAND.primary,
          backgroundColor: "rgba(100, 5, 255, 0.95)",
          borderWidth: 1,
          grouped: false,
          order: 2,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Above target",
          data: profitAboveTargetFloatingFrom(d),
          type: "bar",
          borderColor: ABOVE_TARGET_CYAN,
          backgroundColor: "rgba(6, 182, 212, 0.88)",
          borderWidth: 1,
          grouped: false,
          order: 1,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        }
      ]
    };
  }

  if (step === 5) {
    return {
      datasets: [
        {
          label: "Target profit",
          data: d.target,
          type: "bar",
          borderColor: "#A873FF",
          backgroundColor: "rgba(168, 115, 255, 0.72)",
          borderWidth: 1,
          grouped: false,
          order: 3,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Profit (to target)",
          data: profitToTargetFrom(d),
          type: "bar",
          borderColor: BRAND.primary,
          backgroundColor: "rgba(100, 5, 255, 0.95)",
          borderWidth: 1,
          grouped: false,
          order: 2,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Above target",
          data: profitAboveTargetFloatingFrom(d),
          type: "bar",
          borderColor: ABOVE_TARGET_CYAN,
          backgroundColor: "rgba(6, 182, 212, 0.88)",
          borderWidth: 1,
          grouped: false,
          order: 1,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        }
      ]
    };
  }

  return { datasets: [] };
}

function updateUiState() {
  subtitleEl.textContent = STEP_TEXT[currentStep];
  prevBtn.disabled = currentStep === 0;
  nextBtn.disabled = currentStep === STEP_TEXT.length - 1;
}

function updateYearRangeHint() {
  const el = document.getElementById("yearRangeHint");
  if (!el) return;
  if (!years.length) {
    el.textContent = "";
    return;
  }
  const cy = getCalendarYear();
  const d = getDisplay();
  if (!showFutureYears && d.years.length === 0) {
    el.textContent = `Every year in the sheet is after ${cy}. Turn on “Show future” to see data.`;
    return;
  }
  const hasFuture = years.some((y) => {
    const n = parseInt(String(y).trim(), 10);
    return Number.isFinite(n) && n > cy;
  });
  if (!hasFuture) {
    el.textContent = "";
    return;
  }
  el.textContent = showFutureYears ? `Including years after ${cy}` : "";
}

function toggleChartMode(isRingMode) {
  if (!chartCardEl || !ringSectionEl) return;
  chartCardEl.classList.toggle("hidden", isRingMode);
  ringSectionEl.classList.toggle("hidden", !isRingMode);
}

function clearRingCharts() {
  ringCharts.forEach((instance) => instance.destroy());
  ringCharts = [];
}

function renderProfitMarginRings() {
  if (!ringGridEl) return;
  clearRingCharts();
  ringGridEl.innerHTML = "";

  const d = getDisplay();
  d.years.forEach((year, index) => {
    const card = document.createElement("article");
    card.className = "ring-card";

    const title = document.createElement("h3");
    title.textContent = year;
    card.appendChild(title);

    const wrap = document.createElement("div");
    wrap.className = "ring-chart-wrap";

    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 120;
    wrap.appendChild(canvas);

    const m = d.profitMarginPercent[index];
    const remainder = Math.max(0, 100 - m);

    const center = document.createElement("div");
    center.className = "ring-center";
    center.textContent = `${m.toFixed(0)}%`;
    wrap.appendChild(center);
    card.appendChild(wrap);

    const meta = document.createElement("p");
    meta.className = "ring-meta";
    meta.textContent = "Profit as % of revenue";
    card.appendChild(meta);

    ringGridEl.appendChild(card);

    const ringChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Profit margin", "Remainder to 100%"],
        datasets: [
          {
            data: [m, remainder],
            backgroundColor: ["rgba(100, 5, 255, 0.95)", "rgba(255, 255, 255, 0.18)"],
            borderColor: ["#6405FF", "rgba(255, 255, 255, 0.28)"],
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            filter: (item) => Number(item.raw) > 0,
            callbacks: {
              label(context) {
                const value = context.parsed;
                return `${context.label}: ${Number(value).toFixed(0)}%`;
              }
            }
          }
        }
      }
    });

    ringCharts.push(ringChart);
  });
}

function renderProfitProgressRings() {
  if (!ringGridEl) return;
  clearRingCharts();
  ringGridEl.innerHTML = "";

  const d = getDisplay();
  d.years.forEach((year, index) => {
    const card = document.createElement("article");
    card.className = "ring-card";

    const title = document.createElement("h3");
    title.textContent = year;
    card.appendChild(title);

    const wrap = document.createElement("div");
    wrap.className = "ring-chart-wrap";

    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 120;
    wrap.appendChild(canvas);

    const center = document.createElement("div");
    center.className = "ring-center";
    const pctRaw = d.targetPercent[index];
    const percentValue = Number.isFinite(pctRaw) ? pctRaw : 0;
    center.textContent = `${percentValue.toFixed(0)}%`;
    wrap.appendChild(center);
    card.appendChild(wrap);

    const meta = document.createElement("p");
    meta.className = "ring-meta";
    const p = d.profit[index];
    const t = d.target[index];
    meta.textContent =
      p >= t
        ? `Profit £${p.toLocaleString("en-GB")} vs target £${t.toLocaleString("en-GB")}`
        : `Profit £${p.toLocaleString("en-GB")} of target £${t.toLocaleString("en-GB")}`;
    card.appendChild(meta);

    ringGridEl.appendChild(card);

    /** Slices sum to max(profit, target) so over-performance shows as an extra cyan arc. */
    const towardTarget = Math.min(p, t);
    const aboveTarget = Math.max(0, p - t);
    const gapToTarget = Math.max(0, t - p);

    const ringChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Profit toward target", "Above target", "Remaining to target"],
        datasets: [
          {
            data: [towardTarget, aboveTarget, gapToTarget],
            backgroundColor: [
              "rgba(100, 5, 255, 0.95)",
              "rgba(6, 182, 212, 0.9)",
              "rgba(255, 255, 255, 0.22)"
            ],
            borderColor: ["#6405FF", ABOVE_TARGET_CYAN, "rgba(255, 255, 255, 0.32)"],
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            filter: (item) => Number(item.raw) > 0,
            callbacks: {
              label(context) {
                const value = context.parsed;
                return `${context.label}: £${Number(value).toLocaleString("en-GB")}`;
              }
            }
          }
        }
      }
    });

    ringCharts.push(ringChart);
  });
}

function renderUtilisationRings() {
  if (!ringGridEl) return;
  clearRingCharts();
  ringGridEl.innerHTML = "";

  const d = getDisplay();
  d.years.forEach((year, index) => {
    const card = document.createElement("article");
    card.className = "ring-card";

    const title = document.createElement("h3");
    title.textContent = year;
    card.appendChild(title);

    const wrap = document.createElement("div");
    wrap.className = "ring-chart-wrap";

    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 120;
    wrap.appendChild(canvas);

    const u = d.utilisation[index];
    /** Baseline ring = 100%; values over 100% split into full baseline + overflow. */
    const toBaseline = Math.min(u, 100);
    const overBaseline = Math.max(0, u - 100);
    const headroom = u <= 100 ? Math.max(0, 100 - u) : 0;

    const center = document.createElement("div");
    center.className = "ring-center";
    center.textContent = `${u.toFixed(0)}%`;
    wrap.appendChild(center);
    card.appendChild(wrap);

    const meta = document.createElement("p");
    meta.className = "ring-meta";
    meta.textContent =
      u > 100 ? "Capacity % achieved (over 80%)" : "Capacity % achieved (of 80%)";
    card.appendChild(meta);

    const fteNote = String(d.fteCalcNotes[index] || "").trim();
    if (fteNote) {
      const details = document.createElement("details");
      details.className = "fte-details";
      const summary = document.createElement("summary");
      summary.textContent = "FTE calc";
      const body = document.createElement("p");
      body.className = "fte-details-body";
      body.textContent = fteNote;
      details.appendChild(summary);
      details.appendChild(body);
      card.appendChild(details);
    }

    ringGridEl.appendChild(card);

    const ringChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["To 100%", "Above 100%", "Below 100%"],
        datasets: [
          {
            data: [toBaseline, overBaseline, headroom],
            backgroundColor: [
              "rgba(100, 5, 255, 0.95)",
              "rgba(6, 182, 212, 0.88)",
              "rgba(255, 255, 255, 0.18)"
            ],
            borderColor: ["#6405FF", ABOVE_TARGET_CYAN, "rgba(255, 255, 255, 0.28)"],
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            filter: (item) => Number(item.raw) > 0,
            callbacks: {
              label(context) {
                const value = context.parsed;
                return `${context.label}: ${Number(value).toFixed(0)}%`;
              }
            }
          }
        }
      }
    });

    ringCharts.push(ringChart);
  });
}

function renderStep(step) {
  const profitProgressRingStep = STEP_TEXT.length - 2;
  const utilRingStep = STEP_TEXT.length - 1;
  const isRingMode =
    step === STEP_PROFIT_MARGIN_RING || step === profitProgressRingStep || step === utilRingStep;
  toggleChartMode(isRingMode);

  const d = getDisplay();
  const emptyFiltered = years.length > 0 && !showFutureYears && d.years.length === 0;
  if (emptyFiltered) {
    clearRingCharts();
    if (isRingMode && ringGridEl) {
      ringGridEl.innerHTML = "";
      const p = document.createElement("p");
      p.className = "empty-filter-msg";
      p.textContent = `No years in view. Turn on “Show future” to include years after ${getCalendarYear()}.`;
      ringGridEl.appendChild(p);
    } else if (!isRingMode && chart) {
      if (ringGridEl) ringGridEl.innerHTML = "";
      chart.data.labels = [];
      chart.data.datasets = [];
      chart.update();
    }
    updateUiState();
    updateYearRangeHint();
    return;
  }

  if (step === STEP_PROFIT_MARGIN_RING) {
    renderProfitMarginRings();
  } else if (step === profitProgressRingStep) {
    renderProfitProgressRings();
  } else if (step === utilRingStep) {
    renderUtilisationRings();
  } else {
    clearRingCharts();
    const data = stepConfig(step, d);
    chart.data.labels = d.years;
    chart.data.datasets = data.datasets;
    chart.update();
  }

  updateUiState();
  updateYearRangeHint();
}

function nextStep() {
  if (currentStep >= STEP_TEXT.length - 1) return;
  currentStep += 1;
  renderStep(currentStep);
}

function prevStep() {
  if (currentStep <= 0) return;
  currentStep -= 1;
  renderStep(currentStep);
}

function attachControls() {
  nextBtn.addEventListener("click", nextStep);
  prevBtn.addEventListener("click", prevStep);

  const futureToggle = document.getElementById("showFutureYears");
  if (futureToggle) {
    futureToggle.checked = showFutureYears;
    futureToggle.addEventListener("change", () => {
      showFutureYears = futureToggle.checked;
      renderStep(currentStep);
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      nextStep();
    } else if (event.key === "ArrowLeft") {
      prevStep();
    }
  });
}

function createChart() {
  const ctx = document.getElementById("growthChart");
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: []
    },
    options: {
      indexAxis: "x",
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: "index",
        intersect: false
      },
      animation: {
        duration: 800,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
            color: BRAND.text
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const raw = context.raw;
              if (Array.isArray(raw) && raw.length === 2) {
                const span = Number(raw[1]) - Number(raw[0]);
                return `${context.dataset.label}: £${span.toLocaleString("en-GB")}`;
              }
              const value = context.parsed.y;
              if (value === null || value === undefined || Number.isNaN(Number(value))) {
                return context.dataset.label;
              }
              return `${context.dataset.label}: £${Number(value).toLocaleString("en-GB")}`;
            },
            afterTitle(context) {
              if (!context || !context.length) return "";
              if (!isCapacityStep(currentStep)) return "";
              const point = context[0];
              const idx = point?.dataIndex;
              if (!Number.isFinite(idx)) return "";
              const d = getDisplay();
              const note = String(d.fteCalcNotes[idx] || "").trim();
              if (!note) return "";
              return ["FTE calc:", ...note.split(/\r?\n/)];
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: BRAND.grid
          },
          border: {
            color: BRAND.grid
          },
          ticks: {
            color: BRAND.text,
            callback(value) {
              return `£${Number(value).toLocaleString("en-GB")}`;
            }
          }
        },
        x: {
          grid: {
            color: BRAND.grid
          },
          border: {
            color: BRAND.grid
          },
          ticks: {
            color: BRAND.text,
            font: {
              family: "Fustat"
            }
          },
          title: {
            display: true,
            text: "Year",
            color: BRAND.text
          }
        }
      }
    }
  });
}

async function init() {
  try {
    const [rows, fteRangeRows] = await Promise.all([
      fetchSheetRows(),
      fetchSheetRows("A23:ZZ23")
    ]);
    extractSeries(rows, fteRangeRows?.[0] || []);
    createChart();
    renderStep(currentStep);
    attachControls();
    statusEl.textContent = "Data loaded from Google Sheets.";
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
    nextBtn.disabled = true;
    prevBtn.disabled = true;
  }
}

init();
