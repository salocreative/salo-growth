const SHEET_ID = "1AlFfgJNvyJEGAJ_-XOY4Qtvq94lnVTcWNsf9bwkD7S0";
const SHEET_GID = "0";

const STEP_TEXT = [
  "Revenue trend",
  "Split view with profit highlighted",
  "Revenue, capacity and profit",
  "Revenue, capacity, profit and target",
  "Profit and target",
  "Profit progress to target by year"
];
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
let ringCharts = [];

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

function fetchSheetRows() {
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
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=${tqx}&gid=${SHEET_GID}`;
    document.head.appendChild(script);
  });
}

function extractSeries(rows) {
  const normalizeLabel = (value) => String(value ?? "").trim().toLowerCase();
  const findRowByLabels = (labels, fallbackIndex) =>
    rows.find((row) => labels.includes(normalizeLabel(row?.[0]))) || rows[fallbackIndex] || [];

  const yearRow = rows.find((row) => String(row?.[0] ?? "").trim() === "") || rows[0] || [];
  const revenueRow = findRowByLabels(["turnover", "revenue"], 1);
  const profitRow =
    rows.find((row) => normalizeLabel(row?.[0]).startsWith("profit")) || rows[2] || [];
  const capacityRow = findRowByLabels(["capacity"], 9);
  const targetRow = findRowByLabels(["target profit", "target"], 10);
  const percentRow = findRowByLabels(["target %", "target percentage", "profit vs target %"], 11);

  const yearCells = yearRow.slice(1).map((cell) => String(cell).trim());
  years = yearCells.filter((cell) => /^\d{4}$/.test(cell));

  const seriesLength = years.length;
  revenue = parseSeries(revenueRow, seriesLength, parseCurrency, 0);
  profit = parseSeries(profitRow, seriesLength, parseCurrency, 0);
  capacity = parseSeries(capacityRow, seriesLength, parseCurrency, 0);
  target = parseSeries(targetRow, seriesLength, parseCurrency, 0);
  targetPercent = parseSeries(percentRow, seriesLength, parsePercent, null);

  targetPercent = targetPercent.map((value, index) => {
    if (value !== null) return value;
    if (!target[index]) return 0;
    return (profit[index] / target[index]) * 100;
  });

  if (!years.length || !revenue.length || !profit.length || !capacity.length || !target.length) {
    throw new Error(
      "Data not found in expected rows: years, revenue/turnover, profit, capacity, target profit."
    );
  }
}

function revenueToCapacity() {
  return years.map((_, i) => Math.min(revenue[i], capacity[i]));
}

/** Floating bar [yMin, yMax] so the segment sits above the capacity line, not from zero. */
function revenueAboveCapacityFloating() {
  return years.map((_, i) => {
    if (revenue[i] <= capacity[i]) return null;
    return [capacity[i], revenue[i]];
  });
}

function profitToTarget() {
  return years.map((_, i) => Math.min(profit[i], target[i]));
}

/** Floating bar [yMin, yMax] from target profit line up to actual profit when profit exceeds target. */
function profitAboveTargetFloating() {
  return years.map((_, i) => {
    if (profit[i] <= target[i]) return null;
    return [target[i], profit[i]];
  });
}

function stepConfig(step) {
  if (step === 0) {
    return {
      datasets: [
        {
          label: "Revenue",
          data: revenue,
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
          data: revenue,
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
          data: profit,
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

  if (step === 2) {
    return {
      datasets: [
        {
          label: "Capacity",
          data: capacity,
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
          data: revenueToCapacity(),
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
          data: revenueAboveCapacityFloating(),
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
          data: profit,
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
          data: capacity,
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
          data: revenueToCapacity(),
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
          data: revenueAboveCapacityFloating(),
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
          data: target,
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
          data: profitToTarget(),
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
          data: profitAboveTargetFloating(),
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

  return {
    datasets: [
      {
        label: "Target profit",
        data: target,
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
        data: profitToTarget(),
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
        data: profitAboveTargetFloating(),
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

function updateUiState() {
  subtitleEl.textContent = STEP_TEXT[currentStep];
  prevBtn.disabled = currentStep === 0;
  nextBtn.disabled = currentStep === STEP_TEXT.length - 1;
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

function renderRingCharts() {
  if (!ringGridEl) return;
  clearRingCharts();
  ringGridEl.innerHTML = "";

  years.forEach((year, index) => {
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
    const percentValue = Number.isFinite(targetPercent[index]) ? targetPercent[index] : 0;
    center.textContent = `${percentValue.toFixed(0)}%`;
    wrap.appendChild(center);
    card.appendChild(wrap);

    const meta = document.createElement("p");
    meta.className = "ring-meta";
    meta.textContent = `Profit £${profit[index].toLocaleString("en-GB")} of target £${target[index].toLocaleString("en-GB")}`;
    card.appendChild(meta);

    ringGridEl.appendChild(card);

    const p = profit[index];
    const t = target[index];
    const profitTowardTarget = Math.min(p, t);
    const aboveTargetAmount = Math.max(0, p - t);
    const gapToTarget = Math.max(0, t - p);

    const ringChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Profit (to target)", "Above target", "Remaining to target"],
        datasets: [
          {
            data: [profitTowardTarget, aboveTargetAmount, gapToTarget],
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
                return `${context.label}: £${value.toLocaleString("en-GB")}`;
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
  const isRingStep = step === STEP_TEXT.length - 1;
  toggleChartMode(isRingStep);

  if (isRingStep) {
    renderRingCharts();
  } else {
    clearRingCharts();
    const data = stepConfig(step);
    chart.data.labels = years;
    chart.data.datasets = data.datasets;
    chart.update();
  }

  updateUiState();
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
      labels: years,
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
    const rows = await fetchSheetRows();
    extractSeries(rows);
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
