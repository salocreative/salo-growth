const SHEET_ID = "1AlFfgJNvyJEGAJ_-XOY4Qtvq94lnVTcWNsf9bwkD7S0";
const SHEET_GID = "0";

const STEP_TEXT = [
  "Turnover trend",
  "Split view with profit highlighted",
  "Turnover, profit and target",
  "Profit and target"
];
const BRAND = {
  primary: "#6405FF",
  primarySoft: "#9A6DFF",
  primaryMuted: "rgba(154, 109, 255, 0.35)",
  text: "#F5F5F5",
  grid: "rgba(255, 255, 255, 0.12)"
};
const BAR_THICKNESS = 42;

const subtitleEl = document.getElementById("subtitle");
const statusEl = document.getElementById("status");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");

let chart;
let currentStep = 0;
let years = [];
let turnover = [];
let profit = [];
let target = [];

function parseCurrency(raw) {
  if (!raw) return 0;
  const normalized = String(raw).replace(/[^0-9.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
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
  const turnoverRow = findRowByLabels(["turnover", "revenue"], 1);
  const profitRow =
    rows.find((row) => normalizeLabel(row?.[0]).startsWith("profit")) || rows[2] || [];
  const targetRow = findRowByLabels(["target profit", "target"], 10);

  const yearCells = yearRow.slice(1).map((cell) => String(cell).trim());
  years = yearCells.filter((cell) => /^\d{4}$/.test(cell));

  const seriesLength = years.length;
  turnover = turnoverRow.slice(1, seriesLength + 1).map(parseCurrency);
  profit = profitRow.slice(1, seriesLength + 1).map(parseCurrency);
  target = targetRow.slice(1, seriesLength + 1).map(parseCurrency);

  if (!years.length || !turnover.length || !profit.length || !target.length) {
    throw new Error("Data not found in expected rows: years, revenue/turnover, profit, target profit.");
  }
}

function stepConfig(step) {
  if (step === 0) {
    return {
      datasets: [
        {
          label: "Turnover",
          data: turnover,
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
          label: "Turnover",
          data: turnover,
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
          label: "Turnover",
          data: turnover,
          type: "bar",
          borderColor: "#FFFFFF",
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          borderWidth: 1,
          grouped: false,
          order: 3,
          barThickness: BAR_THICKNESS,
          maxBarThickness: BAR_THICKNESS
        },
        {
          label: "Target",
          data: target,
          type: "bar",
          borderColor: "#A873FF",
          backgroundColor: "rgba(168, 115, 255, 0.72)",
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

  return {
    datasets: [
      {
        label: "Target",
        data: target,
        type: "bar",
        borderColor: "#A873FF",
        backgroundColor: "rgba(168, 115, 255, 0.72)",
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

function updateUiState() {
  subtitleEl.textContent = STEP_TEXT[currentStep];
  prevBtn.disabled = currentStep === 0;
  nextBtn.disabled = currentStep === STEP_TEXT.length - 1;
}

function renderStep(step) {
  const data = stepConfig(step);
  chart.data.labels = years;
  chart.data.datasets = data.datasets;
  chart.update();
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
              const value = context.parsed.y;
              return `${context.dataset.label}: £${value.toLocaleString("en-GB")}`;
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
