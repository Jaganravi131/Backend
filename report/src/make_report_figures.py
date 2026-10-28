#!/usr/bin/env python3
"""
Generates every figure used in the semester report.
Writes to report/assets/figures/.

All figures are drawn at 16 cm print width (6.3 in) at 400 dpi.
"""
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle, Circle, Wedge

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["DejaVu Serif"],
    "axes.edgecolor": "#333333",
    "axes.linewidth": 0.6,
    "axes.labelsize": 8,
    "xtick.labelsize": 7,
    "ytick.labelsize": 7,
    "legend.fontsize": 7,
    "figure.dpi": 400,
})

BASE = Path(__file__).resolve().parents[1]
FIG = BASE / "assets" / "figures"
FIG.mkdir(parents=True, exist_ok=True)

NAVY = "#1F3864"
STEEL = "#2E5C8A"
LIGHT = "#EEF1F7"
MID = "#DCE3EE"
ACC = "#F4E6D0"
GREY = "#7F7F7F"

W = 6.3  # inches — 16 cm


def save(fig, name):
    out = FIG / name
    fig.savefig(out, dpi=400, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("  ", name)


# ---------------------------------------------------------------------------
# Fig 2: class -> compartment decision flow
# ---------------------------------------------------------------------------
def fig_class_mapping():
    fig, ax = plt.subplots(figsize=(W, 4.3))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")

    def box(x, y, w, h, t, fc=LIGHT, fs=6.4, bold=False, ls="-", tc="#111111"):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=1.4",
                                    linewidth=0.7, edgecolor=NAVY, facecolor=fc,
                                    linestyle=ls, zorder=2))
        ax.text(x + w / 2, y + h / 2, t, ha="center", va="center", fontsize=fs,
                color=tc, fontweight="bold" if bold else "normal",
                zorder=3, linespacing=1.35)

    def arr(x1, y1, x2, y2, ls="-", color=NAVY):
        ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>",
                                     mutation_scale=7, linewidth=0.7, color=color,
                                     linestyle=ls, shrinkA=0, shrinkB=0, zorder=1.5))

    ax.text(2, 96, "MODEL OUTPUT", fontsize=7, color=NAVY, fontweight="bold")
    ax.text(38, 96, "SENSOR CORROBORATION", fontsize=7, color=NAVY, fontweight="bold")
    ax.text(80, 96, "COMPARTMENT", fontsize=7, color=NAVY, fontweight="bold")

    model = [("Biological / Organic", 85.0),
             ("Paper / Cardboard", 74.5),
             ("Plastic", 64.0),
             ("Glass", 53.5),
             ("Metal", 43.0),
             ("Battery / E-waste", 32.5),
             ("Clothes / Shoes / Trash", 22.0),
             ("Any class, conf. < τ", 11.5)]
    for t, y in model:
        box(1.5, y, 26, 6.6, t, fs=6.2)

    rule = [("moisture HIGH → confirm", 85.0),
            ("capacitive present", 74.5),
            ("capacitive present,\ninductive absent", 64.0),
            ("capacitive, high mass,\nno inductive", 53.5),
            ("inductive HIGH →\noverride camera", 43.0),
            ("inductive HIGH or\nconf. ≥ τ", 32.5),
            ("no corroboration →\nResidual", 22.0),
            ("fail-safe: never\nauto-sort", 11.5)]
    for t, y in rule:
        box(34, y, 28, 6.6, t, fc="#FBFBFB", fs=5.8, ls=":")

    dest = [("BIODEGRADABLE\n(wet)", 85.0, "#E2EFDA"),
            ("DRY", 74.5, "#FFF2CC"),
            ("DRY", 64.0, "#FFF2CC"),
            ("DRY", 53.5, "#FFF2CC"),
            ("ELECTRONIC", 43.0, "#FCE4D6"),
            ("ELECTRONIC", 32.5, "#FCE4D6"),
            ("RESIDUAL\n(unsorted)", 22.0, "#E7E6E6"),
            ("RESIDUAL\n(unsorted)", 11.5, "#E7E6E6")]
    for t, y, c in dest:
        box(70, y, 22, 6.6, t, fc=c, fs=6.0, bold=True)

    for t, y in model:
        arr(27.5, y + 3.3, 33.8, y + 3.3)
        arr(62.2, y + 3.3, 69.8, y + 3.3)

    ax.plot([31.5, 31.5], [11.5, 91.6], color=NAVY, lw=0.5, ls=(0, (1, 2)), zorder=0)
    ax.plot([66.0, 66.0], [11.5, 91.6], color=NAVY, lw=0.5, ls=(0, (1, 2)), zorder=0)
    save(fig, "Fig_Class_Mapping.png")


# ---------------------------------------------------------------------------
# Fig 3: carousel geometry, to scale
# ---------------------------------------------------------------------------
def fig_geometry():
    fig, ax = plt.subplots(figsize=(W, 3.7))
    ax.set_aspect("equal")
    ax.axis("off")

    R, f, rc = 190.0, 78.0, 112.0
    wb = dict(facecolor="white", edgecolor="none", pad=1.4)

    ax.add_patch(Circle((0, 0), R, facecolor="#F7F9FC", edgecolor=NAVY, lw=1.3))
    ax.add_patch(Circle((0, 0), rc, facecolor="none", edgecolor=STEEL,
                        lw=0.5, ls=(0, (4, 2))))

    pos = [(0, rc), (rc, 0), (0, -rc), (-rc, 0)]
    cols = ["#E2EFDA", "#FFF2CC", "#FCE4D6", "#E7E6E6"]
    names = ["BIO", "DRY", "E-waste", "RESIDUAL"]
    for (x, y), c, n in zip(pos, cols, names):
        ax.add_patch(Circle((x, y), f, facecolor=c, edgecolor=NAVY, lw=1.0, zorder=2))
        ax.text(x, y + (20 if n == "DRY" else 0), n, ha="center", va="center",
                fontsize=6.8, fontweight="bold", zorder=3)

    ax.add_patch(Circle((0, 0), 17, facecolor="white", edgecolor=NAVY, lw=1.0, zorder=4))
    ax.text(0, 0, "hub", ha="center", va="center", fontsize=5.6, zorder=5)

    # R — drawn into the upper-left quadrant whitespace
    ax.annotate("", xy=(-R * 0.707, R * 0.707), xytext=(0, 0),
                arrowprops=dict(arrowstyle="<->", color=NAVY, lw=0.7))
    ax.annotate("R 190 mm\n(Ø380 disc)", xy=(-R * 0.707, R * 0.707),
                xytext=(-R - 14, R * 0.80), fontsize=5.9, color=NAVY,
                ha="right", va="center", linespacing=1.35, zorder=6,
                arrowprops=dict(arrowstyle="-", color=NAVY, lw=0.4))

    # centre radius — the 45 deg gap between BIO and DRY
    ax.annotate("", xy=(rc * 0.707, rc * 0.707), xytext=(0, 0),
                arrowprops=dict(arrowstyle="<->", color=STEEL, lw=0.7))
    ax.text(rc * 0.76, rc * 1.03, "112 mm", fontsize=5.9, color=STEEL,
            ha="center", va="center", bbox=wb, zorder=6)

    # compartment diameter, inside the DRY circle
    ax.annotate("", xy=(rc + 34, -f * 0.62), xytext=(rc + 34, f * 0.28),
                arrowprops=dict(arrowstyle="<->", color="#A61B1B", lw=0.6))
    ax.text(rc + 34, -f * 0.78, "Ø156", fontsize=5.9, color="#A61B1B", ha="center",
            va="center", bbox=wb, zorder=6)

    # the gap callout
    gx = rc * 0.707
    ax.add_patch(Circle((gx, gx), 2.6, facecolor="none", edgecolor="#C00000",
                        lw=0.8, zorder=7))
    ax.annotate("adjacent mouths 2.4 mm apart\n(tolerance must stay below ±0.5°)",
                xy=(gx, gx), xytext=(R * 0.62, R * 1.10),
                fontsize=5.8, color="#C00000", ha="left", linespacing=1.4,
                arrowprops=dict(arrowstyle="->", color="#C00000", lw=0.6,
                                connectionstyle="arc3,rad=-0.3"), zorder=8)

    ax.text(-30, -R - 26,
            "Four compartments at 90° on a 112 mm centre radius; each outer edge is flush with the disc rim.\n"
            "A 2 × 2 square cluster would reach 236 mm from the axis and cannot fit a Ø380 mm disc.",
            fontsize=5.7, color="#333333", ha="center", va="top", linespacing=1.5)

    ax.set_xlim(-R - 78, R + 30)
    ax.set_ylim(-R - 62, R + 46)
    save(fig, "Fig_Carousel_Geometry.png")


# ---------------------------------------------------------------------------
# Fig 4: cycle timeline
# ---------------------------------------------------------------------------
def fig_cycle():
    fig, ax = plt.subplots(figsize=(W, 2.9))
    stages = [
        ("Trigger + capture",   0.00, 0.25, "#9DB7D6"),
        ("Pre-process + crop",  0.25, 0.15, "#B9CBDF"),
        ("CNN inference",       0.40, 0.45, NAVY),
        ("Sensor read + fuse",  0.85, 0.25, "#7A9BC4"),
        ("Index rotation",      1.10, 0.85, "#C08A2E"),
        ("Gravity drop",        1.95, 0.55, "#D8B36A"),
        ("Reset + log",         2.50, 0.45, "#9DB7D6"),
        ("Standby",             2.95, 0.25, "#E4E4E4"),
    ]
    n = len(stages)
    for i, (name, start, dur, col) in enumerate(stages):
        y = n - i - 1
        ax.barh(y, dur, left=start, height=0.52, color=col,
                edgecolor="#333333", lw=0.45)
        ax.text(start + dur + 0.035, y, f"{dur:.2f} s", va="center",
                fontsize=5.8, color="#333333")

    ax.set_yticks(range(n))
    ax.set_yticklabels([s_[0] for s_ in reversed(stages)], fontsize=6.3)
    ax.tick_params(axis="y", length=0)
    ax.set_ylim(-0.75, n - 0.25)
    ax.set_xlim(0, 3.62)
    ax.set_xlabel("Time within one segregation cycle (s)")
    ax.axvline(3.2, color="#A61B1B", lw=0.9, ls=(0, (4, 2)))
    ax.text(3.23, n - 0.45, "3.2 s\ncycle", color="#A61B1B", fontsize=6.2,
            va="top", linespacing=1.35)
    for sp in ("left", "top", "right"):
        ax.spines[sp].set_visible(False)
    ax.grid(axis="x", lw=0.35, color="#DDDDDD", zorder=0)
    ax.set_axisbelow(True)

    fig.text(0.02, -0.06,
             "3.2 s per item implies a theoretical 1,125 items/h; in practice the inlet "
             "loading rate sets the service rate.",
             fontsize=5.9, color="#333333", style="italic")
    save(fig, "Fig_Cycle_Timeline.png")


# ---------------------------------------------------------------------------
# Fig 5: preliminary detection log (real data)
# ---------------------------------------------------------------------------
def fig_detection_log():
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(W, 2.9),
                                   gridspec_kw={"width_ratios": [1.25, 1]})

    cls = ["Paper", "Glass", "Cardboard", "Plastic", "Metal"]
    counts = [12601, 149, 26, 24, 10]
    total = sum(counts)
    pct = [100 * c / total for c in counts]
    bars = ax1.bar(cls, pct, color=[NAVY, STEEL, "#7A9BC4", "#9DB7D6", "#B9CBDF"],
                   edgecolor="#333333", lw=0.5, width=0.62)
    ax1.set_ylabel("Share of detections (%)")
    ax1.set_title("(a) Class distribution", fontsize=7.5, pad=6)
    ax1.set_ylim(0, 112)
    for b, p, c in zip(bars, pct, counts):
        ax1.text(b.get_x() + b.get_width() / 2, p + 2.5,
                 f"{p:.2f}%\n(n={c:,})", ha="center", fontsize=5.8, linespacing=1.3)
    ax1.spines["top"].set_visible(False)
    ax1.spines["right"].set_visible(False)
    ax1.tick_params(axis="x", labelsize=6.5)

    # confidence histogram, from reported band shares
    bands = ["< 0.5", "0.5–0.8", "> 0.8"]
    shares = [70.92, 28.30, 0.78]
    cols = ["#C0504D", "#D8B36A", "#7A9BC4"]
    b2 = ax2.bar(bands, shares, color=cols, edgecolor="#333333", lw=0.5, width=0.55)
    ax2.set_ylabel("Share of detections (%)")
    ax2.set_title("(b) Confidence distribution", fontsize=7.5, pad=6)
    ax2.set_ylim(0, 88)
    for b, s in zip(b2, shares):
        ax2.text(b.get_x() + b.get_width() / 2, s + 1.8, f"{s:.2f}%",
                 ha="center", fontsize=6.2)
    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_visible(False)
    ax2.tick_params(axis="x", labelsize=6.5)

    fig.text(0.5, -0.06,
             "13,352 frames over a ~13-minute session; 12,810 frames contained a detection (95.94%).",
             ha="center", fontsize=5.8, color="#333333", style="italic")
    fig.tight_layout()
    save(fig, "Fig_Detection_Log.png")


# ---------------------------------------------------------------------------
# Fig 6: financial projection
# ---------------------------------------------------------------------------
def fig_financial():
    """Two panels, so the cumulative curve never shares a misleading axis."""
    years = ["Y1", "Y2", "Y3", "Y4", "Y5"]
    units = [60, 180, 400, 750, 1200]
    price, gm_unit = 24900, 6500
    opex = [900000, 1400000, 2200000, 3300000, 4800000]

    revenue = [u * price / 1e5 for u in units]
    gross = [u * gm_unit / 1e5 for u in units]
    ebitda = [(u * gm_unit - o) / 1e5 for u, o in zip(units, opex)]
    cum = list(np.cumsum(ebitda))

    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(W, 4.0), sharex=True,
                                  gridspec_kw={"height_ratios": [1.55, 1], "hspace": 0.14})
    x = np.arange(len(years))
    w = 0.26

    ax.bar(x - w, revenue, w, label="Revenue", color=NAVY, edgecolor="#333333", lw=0.4)
    ax.bar(x, gross, w, label="Gross margin", color="#7A9BC4", edgecolor="#333333", lw=0.4)
    ax.bar(x + w, ebitda, w, label="EBITDA", color="#D8B36A", edgecolor="#333333", lw=0.4)
    ax.axhline(0, color="#333333", lw=0.5)
    ax.set_ylabel("₹ lakh")
    ax.set_title("(a) Annual revenue, gross margin and EBITDA", fontsize=7.5, pad=6, loc="left")
    ax.legend(frameon=False, fontsize=6.4, ncol=3, loc="upper left")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_ylim(-22, 340)

    for xi, e in zip(x, ebitda):
        ax.text(xi + w, e + (7 if e >= 0 else -14), f"{e:.1f}", ha="center",
                fontsize=5.5, color="#333333")
    ax.annotate("first EBITDA-positive year (Year 3)", xy=(2 + w, 4.0),
                xytext=(0.42, 150), fontsize=5.9, color="#1E6033",
                arrowprops=dict(arrowstyle="->", color="#1E6033", lw=0.6,
                                connectionstyle="arc3,rad=0.22"))

    ax2.bar(x, cum, 0.42, color=["#C0504D" if c < 0 else "#7A9BC4" for c in cum],
            edgecolor="#333333", lw=0.4)
    ax2.axhline(0, color="#333333", lw=0.6)
    ax2.set_ylabel("₹ lakh")
    ax2.set_title("(b) Cumulative EBITDA — break-even in Year 4", fontsize=7.5, pad=6, loc="left")
    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_visible(False)
    for xi, c in zip(x, cum):
        ax2.text(xi, c + (3.2 if c >= 0 else -6.5), f"{c:.1f}", ha="center",
                 fontsize=5.6, color="#333333")
    ax2.set_ylim(-16, 54)
    ax2.set_xticks(x)
    ax2.set_xticklabels([f"{y}\n({u:,} units)" for y, u in zip(years, units)], fontsize=6.5)

    save(fig, "Fig_Financial_Projection.png")


# ---------------------------------------------------------------------------
# Fig 7: state machine
# ---------------------------------------------------------------------------
def fig_state_machine():
    fig, ax = plt.subplots(figsize=(W, 3.4))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")

    BW, BH = 21.0, 11.5

    def state(x, y, t, hi=False):
        ax.add_patch(FancyBboxPatch((x, y), BW, BH,
                                    boxstyle="round,pad=0,rounding_size=1.6",
                                    linewidth=0.9, edgecolor=NAVY,
                                    facecolor=ACC if hi else LIGHT, zorder=3))
        ax.text(x + BW / 2, y + BH / 2, t, ha="center", va="center",
                fontsize=7.0, fontweight="bold", color=NAVY, zorder=4)

    def arr(p1, p2, color=NAVY, ls="-", rad=0.0):
        ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=8,
                                     linewidth=0.8, color=color, linestyle=ls,
                                     shrinkA=0, shrinkB=0, zorder=2,
                                     connectionstyle=f"arc3,rad={rad}"))

    def lbl(x, y, t, color=STEEL, ha="center", va="center"):
        ax.text(x, y, t, fontsize=5.9, color=color, ha=ha, va=va,
                linespacing=1.35, zorder=5)

    ytop, ybot = 66.0, 34.0
    xs = [4.0, 39.5, 75.0]

    state(xs[0], ytop, "IDLE")
    state(xs[1], ytop, "DETECT")
    state(xs[2], ytop, "CLASSIFY", hi=True)
    state(xs[2], ybot, "FUSE", hi=True)
    state(xs[1], ybot, "ACTUATE")
    state(xs[0], ybot, "LOG")

    # top row, left to right
    arr((xs[0] + BW, ytop + BH / 2), (xs[1], ytop + BH / 2))
    lbl((xs[0] + BW + xs[1]) / 2, ytop + BH / 2 + 4.2, "proximity high")
    arr((xs[1] + BW, ytop + BH / 2), (xs[2], ytop + BH / 2))
    lbl((xs[1] + BW + xs[2]) / 2, ytop + BH / 2 - 5.2, "frame + sensor read")

    # drop to bottom row
    arr((xs[2] + BW / 2, ytop), (xs[2] + BW / 2, ybot + BH))
    lbl(xs[2] + BW / 2 + 2.4, (ytop + ybot + BH) / 2, "class\nprobabilities", ha="left")

    # bottom row, right to left
    arr((xs[2], ybot + BH / 2), (xs[1] + BW, ybot + BH / 2))
    lbl((xs[2] + xs[1] + BW) / 2, ybot + BH / 2 + 4.2, "final class")
    arr((xs[1], ybot + BH / 2), (xs[0] + BW, ybot + BH / 2))
    lbl((xs[1] + xs[0] + BW) / 2, ybot + BH / 2 - 5.2, "position reached")

    # return to idle
    arr((xs[0] + BW / 2, ybot + BH), (xs[0] + BW / 2, ytop), color=GREY)
    lbl(xs[0] + BW / 2 - 2.4, (ytop + ybot + BH) / 2,
        "reset to home,\nwrite log,\nstandby", color=GREY, ha="right")

    # fault branch
    ax.add_patch(FancyBboxPatch((30.0, 8.0), 44.0, 11.0,
                                boxstyle="round,pad=0,rounding_size=1.5",
                                linewidth=0.8, edgecolor="#A61B1B",
                                facecolor="#FBEAEA", zorder=3))
    ax.text(52.0, 13.5, "FAULT — jam · sensor timeout ·\nlow-confidence retry",
            ha="center", va="center", fontsize=6.1, color="#A61B1B",
            linespacing=1.4, zorder=4)

    arr((xs[1] + BW / 2, ybot), (xs[1] + BW / 2, 19.0),
        color="#A61B1B", ls=(0, (3, 2)))
    lbl(xs[1] + BW / 2 + 2.4, 24.0, "raise alert,\nhold position",
        color="#A61B1B", ha="left")

    arr((30.0, 13.5), (xs[0] + BW / 2, 13.5), color="#A61B1B", ls=(0, (3, 2)))
    arr((xs[0] + BW / 2, 13.5), (xs[0] + BW / 2, ybot),
        color="#A61B1B", ls=(0, (3, 2)))

    ax.text(50, 2.5, "Every transition is guarded by a timeout; a missed guard sends the "
                     "machine to FAULT and the disc holds its last position.",
            ha="center", va="bottom", fontsize=5.6, color="#333333", style="italic")
    save(fig, "Fig_State_Machine.png")


if __name__ == "__main__":
    print("generating figures ->", FIG)
    fig_class_mapping()
    fig_geometry()
    fig_cycle()
    fig_detection_log()
    fig_financial()
    fig_state_machine()
    print("done")
