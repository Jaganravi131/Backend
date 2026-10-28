#!/usr/bin/env python3
"""System architecture figure for the carry-forward specification.

Writes: report/assets/figures/Fig_System_Architecture.png
"""
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

plt.rcParams["font.family"] = "serif"

BASE = Path(__file__).resolve().parents[1]
FIGDIR = BASE / "assets" / "figures"
FIGDIR.mkdir(parents=True, exist_ok=True)

NAVY = "#1F3864"
STEEL = "#2E5C8A"
LIGHT = "#EEF1F7"
MID = "#DCE3EE"
ACC = "#F4E6D0"
GREY = "#7F7F7F"

fig, ax = plt.subplots(figsize=(7.0, 5.1), dpi=400)
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")


def box(x, y, w, h, text, fc=LIGHT, ec=NAVY, fs=5.2, bold=False, ls="-", lw=0.7, tc="#111111"):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=1.0",
                                linewidth=lw, edgecolor=ec, facecolor=fc, linestyle=ls, zorder=2))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs,
            color=tc, fontweight=("bold" if bold else "normal"), zorder=3, linespacing=1.4)


def group(x, y, w, h):
    ax.add_patch(Rectangle((x, y), w, h, fill=False, edgecolor=STEEL,
                           linewidth=0.8, linestyle=(0, (3, 2)), zorder=1))


def arrow(x1, y1, x2, y2, ls="-", color=NAVY, lw=0.8):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=6,
                                 linewidth=lw, color=color, linestyle=ls,
                                 shrinkA=0, shrinkB=0, zorder=1.5))


# ------------------------------------------------------------ headers
for x, t in [(1.5, "INPUT & SENSING"), (26.5, "PROCESSING"), (50.5, "ACTUATION"),
             (74.5, "OUTPUT & TELEMETRY")]:
    ax.text(x, 95.2, t, ha="left", va="center", fontsize=6.8, color=NAVY, fontweight="bold")

# ------------------------------------------------------------ sensing
group(1.5, 25.8, 21.0, 64.6)
box(3.0, 82.4, 18.0, 6.4, "Waste inserted →\nproximity / ToF trigger", fc=ACC, fs=5.2, bold=True)
SENS = [("OV5647 camera — CSI", 73.0),
        ("Moisture probe — ADC", 65.4),
        ("Capacitive proximity", 57.8),
        ("Inductive proximity", 50.2),
        ("ToF — VL53L0X", 42.6),
        ("Load cell + HX711", 35.0),
        ("MQ-135 gas / odour", 27.4)]
for t, y in SENS:
    box(3.0, y, 18.0, 5.4, t, fs=5.2)

# sensor bus into the Pi
ax.plot([24.3, 24.3], [30.1, 85.6], color=NAVY, lw=0.8, zorder=1.5)
for t, y in SENS:
    ax.plot([21.0, 24.3], [y + 2.7, y + 2.7], color=NAVY, lw=0.6, zorder=1.5)
arrow(24.3, 85.6, 27.9, 85.6, lw=1.0)

# ------------------------------------------------------------ processing
group(26.5, 40.5, 20.0, 50.0)
box(28.0, 81.5, 17.0, 7.6, "RASPBERRY PI 4\nMODEL B, 4 GB\nRaspberry Pi OS",
    fc=NAVY, ec=NAVY, fs=5.2, bold=True, tc="white")
for t, y in [("1  CNN inference\nEfficientNet-B3, INT8", 70.5),
             ("2  Sensor fusion\nrule table + gating", 60.5),
             ("3  State machine\n6 states, 3.2 s cycle", 50.5),
             ("4  Logging + MQTT\nCSV / SQLite, Wi-Fi", 40.8)]:
    box(28.0, y, 17.0, 7.6, t, fc=MID, fs=5.0)

# ------------------------------------------------------------ actuation
group(50.5, 41.5, 20.0, 49.0)
box(52.0, 81.5, 17.0, 5.8, "DRV8825 driver\nSTEP / DIR / EN", fs=5.0)
box(52.0, 72.5, 17.0, 5.8, "NEMA 17 stepper\n1.8°/step, 1.7 A", fs=5.0)
box(52.0, 63.5, 17.0, 5.8, "Index sensor\nclosed-loop position", fs=5.0)
box(52.0, 50.2, 17.0, 9.5, "DUAL CAROUSEL\nDISC, ABS\n2 × Ø380 × 18 mm", fc=ACC, fs=5.1, bold=True)
box(52.0, 42.2, 17.0, 5.6, "≤ 0.5° repeatability", fs=5.0, ls=":")

arrow(45.3, 85.6, 51.8, 84.4, lw=1.0)
for y1, y2 in [(81.4, 78.4), (72.4, 69.4), (63.4, 59.8)]:
    arrow(60.5, y1, 60.5, y2, lw=0.8)
arrow(69.2, 63.0, 75.6, 59.6, lw=0.9)

# ------------------------------------------------------------ output
group(74.5, 41.5, 24.0, 49.0)
for t, y, c in [("Biodegradable / wet", 82.0, "#E2EFDA"),
                ("Dry", 73.6, "#FFF2CC"),
                ("Electronic", 65.2, "#FCE4D6"),
                ("Residual / unsorted", 56.8, "#E7E6E6")]:
    box(76.0, y, 21.0, 6.8, t, fc=c, fs=5.5)
ax.text(86.3, 54.8, "4 × detachable HDPE bin\nØ156 × 370 mm each", ha="center", va="top",
        fontsize=4.9, color="#333333", linespacing=1.4, zorder=3)
box(76.0, 42.6, 21.0, 7.6, "IoT dashboard / cloud\nfill level, gas, status, log", fc=MID, fs=5.0)

# ------------------------------------------------------------ power
box(1.5, 14.5, 97.0, 9.2, "", fc="#F7F7F7", lw=0.7)
ax.text(3.0, 22.2, "POWER", ha="left", va="center", fontsize=6.0, color=NAVY, fontweight="bold")
box(11.0, 15.6, 21.0, 5.8, "12 V, 7 Ah Li-ion (3S)\n+ BMS protection", fs=4.9)
box(35.0, 15.6, 20.0, 5.8, "Buck 12 V → 5 V\n5 A, ≈ 90% eff.", fs=4.9)
box(58.5, 15.6, 18.0, 5.8, "12 V rail — motor", fs=4.9)
box(79.5, 15.6, 17.5, 5.8, "3.3 V logic rail", fs=4.9)

# power risers
for x, ytop in [(14.0, 25.7), (36.0, 40.4), (61.5, 41.4), (80.0, 41.4)]:
    arrow(x, 23.8, x, ytop, ls=(0, (2, 2)), color=GREY, lw=0.7)

# telemetry route: logging block -> cloud
ax.plot([36.5, 36.5, 93.0, 93.0], [40.8, 33.4, 33.4, 42.5], color=NAVY, lw=0.8,
        linestyle=(0, (4, 2)), zorder=1.5)
arrow(93.0, 34.4, 93.0, 42.5, ls=(0, (4, 2)))

# ------------------------------------------------------------ legend
ax.add_patch(Rectangle((1.5, 1.5), 97.0, 11.0, fill=True, facecolor="#FBFBFB",
                       edgecolor="#C9C9C9", linewidth=0.6, zorder=0))
ax.text(3.0, 10.6, "INTERFACES", fontsize=5.6, color=NAVY, fontweight="bold",
        ha="left", va="center")
ax.text(3.0, 8.0, "camera → MIPI-CSI        sensors → I²C + ADC        driver → GPIO (STEP / DIR / EN)   "
                  "     index → GPIO        uplink → Wi-Fi (MQTT)",
        fontsize=4.8, color="#222222", ha="left", va="center")
ax.text(3.0, 5.4, "solid = control and data        dashed = power        dotted = sensing edge / optional",
        fontsize=4.8, color="#222222", ha="left", va="center")
ax.text(3.0, 2.9, "Cycle: trigger → capture → infer → fuse → index (≤ 0.5°) → gravity drop → log → standby.   "
                  "Stated average cycle 3.2 s.",
        fontsize=4.8, color=STEEL, ha="left", va="center", style="italic")

plt.subplots_adjust(left=0.004, right=0.996, top=0.996, bottom=0.004)
out = FIGDIR / "Fig_System_Architecture.png"
fig.savefig(out, dpi=400, facecolor="white")
print("saved:", out)
