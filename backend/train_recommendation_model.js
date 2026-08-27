:root {
    --dtc-line: rgba(148, 163, 184, 0.32);
    --dtc-line-taken: #38bdf8;

    --dtc-scrollbar: #38bdf8;
    --dtc-scrollbar-hover: #0ea5e9;
    --dtc-scrollbar-track: rgba(15, 23, 42, 0.45);

    --dtc-node-width: 145px;
    --dtc-branch-width: 230px;
}

.decision-traversal-card {
    position: fixed !important;
    inset: 0 !important;

    width: 100vw !important;
    height: 100vh !important;

    z-index: 2147483647 !important;

    display: flex;
    align-items: center;
    justify-content: center;

    padding: 24px;
    box-sizing: border-box;

    background: rgba(2, 6, 23, 0.72);
    backdrop-filter: blur(8px);

    pointer-events: auto !important;
}

.decision-traversal-card[hidden] {
    display: none !important;
}


/* =========================================================
   MAIN CARD
   ========================================================= */

.decision-traversal-card-content {
    position: relative;

    width: min(94vw, 1400px);
    height: min(90vh, 850px);

    box-sizing: border-box;

    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 22px;

    background:
        linear-gradient(
            145deg,
            #1e293b,
            #0f172a
        );

    box-shadow:
        0 18px 45px rgba(0, 0, 0, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);

    /*
     * IMPORTANT:
     * The card itself no longer scrolls.
     * This keeps the X fixed to the card.
     */
    overflow: hidden;

    cursor: default;
}


/* =========================================================
   SCROLLING CONTENT
   ========================================================= */

.decision-traversal-scroll-content {
    width: 100%;
    height: 100%;

    padding: 32px 38px;

    box-sizing: border-box;

    overflow-y: auto;
    overflow-x: hidden;

    scrollbar-width: thin;

    scrollbar-color:
        var(--dtc-scrollbar)
        var(--dtc-scrollbar-track);
}

.decision-traversal-scroll-content::-webkit-scrollbar {
    width: 8px;
}

.decision-traversal-scroll-content::-webkit-scrollbar-track {
    background: var(--dtc-scrollbar-track);
    border-radius: 10px;
}

.decision-traversal-scroll-content::-webkit-scrollbar-thumb {
    background: var(--dtc-scrollbar);
    border-radius: 10px;
}

.decision-traversal-scroll-content::-webkit-scrollbar-thumb:hover {
    background: var(--dtc-scrollbar-hover);
}


/* =========================================================
   TOP BORDER
   ========================================================= */

.decision-traversal-card-content::before {
    content: "";

    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 2px;

    background: rgba(148, 163, 184, 0.25);

    pointer-events: none;

    z-index: 10;
}


/* =========================================================
   CLOSE BUTTON
   ========================================================= */

.decision-traversal-close {
    position: absolute !important;

    top: 18px;
    right: 20px;

    z-index: 2147483647 !important;

    width: 36px;
    height: 36px;

    padding: 0;

    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 9px;

    background: rgba(15, 23, 42, 0.92);

    color: #94a3b8;

    font-size: 23px;
    line-height: 1;

    cursor: pointer;

    flex-shrink: 0;
}

.decision-traversal-close:hover {
    background: rgba(148, 163, 184, 0.08);

    border-color:
        rgba(148, 163, 184, 0.3);

    color: #e2e8f0;
}


/* =========================================================
   TITLE
   ========================================================= */

.decision-traversal-card-content h2 {
    position: relative;

    margin: 2px 55px 24px 0;

    padding-bottom: 14px;

    border-bottom:
        1px solid rgba(148, 163, 184, 0.10);

    color: #e2e8f0;

    font-size: 21px;
    font-weight: 700;

    line-height: 1.3;
}


/* =========================================================
   DESCRIPTION
   ========================================================= */

.decision-traversal-content {
    position: relative;

    width: 100%;

    color: #cbd5e1;

    font-size: 14px;
    line-height: 1.75;
}

.decision-traversal-content > p {
    margin: 0 0 22px;

    padding-left: 14px;

    border-left:
        2px solid rgba(148, 163, 184, 0.35);

    color: #94a3b8;

    font-size: 12.5px;

    line-height: 1.65;
}

.decision-traversal-content > p::before {
    content: "Note";

    display: block;

    margin-bottom: 3px;

    color: #cbd5e1;

    font-size: 11px;
    font-weight: 700;

    letter-spacing: 0.3px;
}

.decision-traversal-note {
    margin: 0 0 20px;

    padding-left: 14px;

    border-left:
        2px solid rgba(148, 163, 184, 0.35);

    color: #94a3b8;

    font-size: 12.5px;

    line-height: 1.65;
}

.decision-traversal-note::before {
    content: "Note";

    display: block;

    margin-bottom: 3px;

    color: #cbd5e1;

    font-size: 11px;
    font-weight: 700;

    letter-spacing: 0.3px;
}


/* =========================================================
   MAIN TREE AREA
   ========================================================= */

.decision-traversal-main {
    position: relative;

    width: 100%;

    min-width: 0;
}

#decisionTraversalTree {
    position: relative;

    width: 100%;

    margin-top: 20px;

    min-width: 0;

    overflow: visible;
}


/* =========================================================
   TREE CANVAS
   ========================================================= */

.decision-traversal-tree-canvas {
    position: relative;

    display: flex;

    justify-content: center;
    align-items: flex-start;

    width: 100%;

    padding: 25px 20px 40px;

    box-sizing: border-box;

    overflow-x: auto;
    overflow-y: visible;

    text-align: center;

    scrollbar-width: thin;

    scrollbar-color:
        rgba(148, 163, 184, 0.22)
        transparent;
}

.decision-traversal-tree-canvas::-webkit-scrollbar {
    height: 7px;
}

.decision-traversal-tree-canvas::-webkit-scrollbar-track {
    background: transparent;
}

.decision-traversal-tree-canvas::-webkit-scrollbar-thumb {
    background:
        rgba(148, 163, 184, 0.22);

    border-radius: 10px;
}

.decision-traversal-tree-canvas
.decision-traversal-node-wrapper {
    position: relative;

    display: flex;

    flex-direction: column;

    align-items: center;

    flex-shrink: 0;
}

.decision-traversal-tree-canvas
.decision-traversal-node-wrapper:first-child {
    width: max-content;

    min-width: 100%;

    margin: 0 auto;
}


/* =========================================================
   NODES
   ========================================================= */

.decision-traversal-node {
    position: relative;

    z-index: 3;

    display: flex;

    align-items: center;
    justify-content: center;

    width: var(--dtc-node-width);

    min-width: var(--dtc-node-width);
    max-width: var(--dtc-node-width);

    min-height: 50px;

    padding: 10px 12px;

    box-sizing: border-box;

    border:
        1px solid rgba(148, 163, 184, 0.28);

    border-radius: 10px;

    background:
        linear-gradient(
            145deg,
            #1e293b,
            #111827
        );

    color: #e2e8f0;

    font-size: 11.5px;
    font-weight: 600;

    line-height: 1.4;

    text-align: center;

    cursor: pointer;

    box-shadow:
        0 5px 14px rgba(0, 0, 0, 0.25);

    transition:
        transform 0.15s ease,
        border-color 0.15s ease,
        box-shadow 0.15s ease;
}

.decision-traversal-node:hover {
    transform: translateY(-2px);

    border-color:
        rgba(148, 163, 184, 0.55);

    box-shadow:
        0 8px 20px rgba(0, 0, 0, 0.3);
}


/* =========================================================
   ROOT NODE
   ========================================================= */

.decision-traversal-root
> .decision-traversal-node {
    width: 165px;

    min-width: 165px;
    max-width: 165px;

    min-height: 56px;

    border-color:
        rgba(148, 163, 184, 0.45);

    background:
        linear-gradient(
            145deg,
            #334155,
            #1e293b
        );

    font-size: 12.5px;

    font-weight: 700;
}


/* =========================================================
   RESULT NODE
   ========================================================= */

.decision-traversal-node.decision-result-node {
    width: 125px;

    min-width: 125px;
    max-width: 125px;

    min-height: 45px;

    border-color:
        rgba(56, 189, 248, 0.45);

    background:
        linear-gradient(
            145deg,
            #164e63,
            #0f2f3d
        );

    color: #67e8f9;

    font-size: 11px;

    font-weight: 700;

    text-transform: uppercase;

    letter-spacing: 0.3px;
}


/* =========================================================
   CHILDREN
   ========================================================= */

.decision-traversal-children {
    position: relative;

    display: flex;

    justify-content: center;
    align-items: flex-start;

    width: max-content;

    min-width: 100%;

    margin-top: 0;

    padding-top: 62px;

    box-sizing: border-box;
}

.decision-traversal-children::before {
    content: "";

    position: absolute;

    top: 0;
    left: 50%;

    width: 2px;
    height: 62px;

    background: var(--dtc-line);
}


/* =========================================================
   BRANCH
   ========================================================= */

.decision-traversal-branch {
    position: relative;

    display: flex;

    flex-direction: column;

    align-items: center;

    flex-shrink: 0;

    width: var(--dtc-branch-width);

    min-width: var(--dtc-branch-width);
    max-width: var(--dtc-branch-width);

    padding: 30px 16px 0;

    box-sizing: border-box;
}

.decision-traversal-branch::before {
    content: "";

    position: absolute;

    top: 0;

    left: 0;

    width: 100%;

    height: 2px;

    background: var(--dtc-line);
}


/* =========================================================
   LINE INNER
   ========================================================= */

.decision-traversal-branch:first-child::before {
    left: 50%;
    width: 230px;
}

.decision-traversal-branch:last-child::before {
    left: auto;
    right: 50%;
    width: 230px;
}

.decision-traversal-branch:not(:first-child):not(:last-child)::before {
    left: 0;

    width: 100%;
}

.decision-traversal-branch::after {
    content: "";

    position: absolute;

    top: 0;

    left: 50%;

    width: 2px;

    height: 30px;

    background: var(--dtc-line);
}


/* =========================================================
   ONLY CHILD
   ========================================================= */

.decision-traversal-branch:only-child {
    padding-top: 0;

    width: var(--dtc-node-width);

    min-width: var(--dtc-node-width);
    max-width: var(--dtc-node-width);
}

.decision-traversal-branch:only-child::before,
.decision-traversal-branch:only-child::after {
    display: none;
}

.decision-traversal-branch
> .decision-traversal-node-wrapper {
    width: var(--dtc-node-width);

    min-width: var(--dtc-node-width);
    max-width: var(--dtc-node-width);
}


/* =========================================================
   CONNECTOR
   ========================================================= */

.decision-traversal-connector {
    width: 2px;

    height: 22px;

    margin-top: 0;

    background: var(--dtc-line);
}


/* =========================================================
   BRANCH LABEL
   ========================================================= */

.decision-traversal-branch-line {
    position: relative;

    z-index: 5;

    margin: -10px 0 6px;

    padding: 3px 8px;

    border:
        1px solid rgba(148, 163, 184, 0.3);

    border-radius: 999px;

    background: #172033;

    color: #94a3b8;

    font-size: 9px;

    font-weight: 700;

    letter-spacing: 0.5px;

    text-transform: uppercase;

    cursor: pointer;
}

.decision-traversal-branch-line:hover {
    border-color:
        rgba(148, 163, 184, 0.6);

    color: #e2e8f0;
}


/* =========================================================
   TAKEN BRANCH
   ========================================================= */

.decision-traversal-branch[data-taken="true"] {
    display: flex;

    flex-direction: column;

    align-items: center;

    width: var(--dtc-node-width) !important;

    min-width: var(--dtc-node-width) !important;

    max-width: var(--dtc-node-width) !important;

    padding: 0 !important;

    margin: 0 auto;
}

.decision-traversal-branch[data-taken="true"]::before,
.decision-traversal-branch[data-taken="true"]::after {
    display: none !important;
}

.decision-traversal-branch[data-taken="true"]
> .decision-traversal-connector {
    width: 2px;

    height: 30px;

    background: var(--dtc-line-taken);

    margin: 0 auto;
}

.decision-traversal-branch[data-taken="true"]
> .decision-traversal-children {
    display: flex;

    flex-direction: column;

    align-items: center;

    width: 100% !important;

    padding-top: 0 !important;
}

.decision-traversal-branch[data-taken="true"]
> .decision-traversal-children::before {
    display: none !important;
}

.decision-traversal-branch[data-taken="true"]
> .decision-traversal-node-wrapper
> .decision-traversal-node {
    border-color:
        var(--dtc-line-taken);

    box-shadow:
        0 0 0 1px rgba(56, 189, 248, 0.25),
        0 7px 18px rgba(56, 189, 248, 0.15);
}

.decision-traversal-branch-line[data-taken="true"] {
    border-color:
        rgba(56, 189, 248, 0.45);

    background:
        rgba(15, 47, 61, 0.9);

    color: #7dd3fc;

    box-shadow: none;

    margin: 5px 0;

    display: inline-block;
}


/* =========================================================
   MOVE LINE UP
   ========================================================= */

.decision-traversal-branch:not([data-taken="true"]):not(:only-child) {
    position: absolute;

    transform:
        translateX(
            calc(var(--dtc-branch-width) * 1)
        );

    margin-top: -90px;

    opacity: 0.75;

    transition: opacity 0.2s ease;
}

.decision-traversal-branch:not([data-taken="true"]):not(:only-child):hover {
    opacity: 1;
}

.decision-traversal-branch:not([data-taken="true"]):not(:only-child):first-child {
    transform:
        translateX(
            calc(var(--dtc-branch-width) * -1)
        );
}


/* =========================================================
   EMPTY
   ========================================================= */

.decision-traversal-empty {
    margin: 30px 0;

    color: #94a3b8;

    font-size: 13px;

    text-align: center;
}


/* =========================================================
   INFO ROW
   ========================================================= */

.decision-traversal-info-row {
    position: absolute;

    inset: 0;

    width: 100%;
    height: 100%;

    margin: 0;

    pointer-events: none;

    z-index: 20;
}


/* =========================================================
   INFO SLOT
   ========================================================= */

.decision-traversal-info-slot {
    position: absolute;

    top:
        var(--dtc-info-top, 0%);

    width: 250px;

    max-width: 250px;

    max-height: 65vh;

    overflow-y: auto;
    overflow-x: hidden;

    box-sizing: border-box;

    pointer-events: auto;

    transform:
        translateY(-50%);

    scrollbar-width: thin;

    scrollbar-color:
        rgba(148, 163, 184, 0.22)
        transparent;

    transition:
        top 0.15s ease;
}

.decision-traversal-info-slot.left {
    left: 18px;

    right: auto;
}

.decision-traversal-info-slot.right {
    right: 18px;

    left: auto;
}

.decision-traversal-info-slot::-webkit-scrollbar {
    width: 6px;
}

.decision-traversal-info-slot::-webkit-scrollbar-track {
    background: transparent;
}

.decision-traversal-info-slot::-webkit-scrollbar-thumb {
    background:
        rgba(148, 163, 184, 0.22);

    border-radius: 10px;
}

.decision-traversal-info-slot:empty {
    display: none;
}


/* =========================================================
   INFO CARD
   ========================================================= */

.decision-traversal-info-card {
    width: 100%;

    box-sizing: border-box;

    padding: 14px 16px;

    border:
        1px solid rgba(148, 163, 184, 0.16);

    border-radius: 10px;

    background:
        linear-gradient(
            145deg,
            rgba(30, 41, 59, 0.97),
            rgba(15, 23, 42, 0.97)
        );

    box-shadow:
        0 12px 30px rgba(0, 0, 0, 0.35);

    backdrop-filter: blur(10px);
}

.decision-traversal-info-card.left {
    border-left:
        3px solid var(--dtc-line-taken);

    border-right:
        1px solid rgba(148, 163, 184, 0.16);
}

.decision-traversal-info-card.right {
    border-right:
        3px solid var(--dtc-line-taken);

    border-left:
        1px solid rgba(148, 163, 184, 0.16);
}

.decision-traversal-info-card strong {
    display: block;

    margin-bottom: 6px;

    color: #e2e8f0;

    font-size: 13px;
}

.decision-traversal-info-card p {
    margin: 0;

    color: #cbd5e1;

    font-size: 12.5px;

    line-height: 1.6;
}


/* =========================================================
   BREAKDOWN
   ========================================================= */

.decision-traversal-breakdown-title {
    display: block;

    margin: 12px 0 6px;

    color: #94a3b8;

    font-size: 10.5px;

    font-weight: 700;

    letter-spacing: 0.4px;

    text-transform: uppercase;
}

.decision-traversal-breakdown-list {
    display: flex;

    flex-direction: column;

    gap: 8px;

    margin: 0;

    padding: 0;

    list-style: none;
}

.decision-traversal-breakdown-item {
    padding: 8px 10px;

    border:
        1px solid rgba(148, 163, 184, 0.14);

    border-radius: 8px;

    background:
        rgba(30, 41, 59, 0.45);
}

.decision-traversal-breakdown-item[data-present="true"] {
    border-color:
        rgba(56, 189, 248, 0.3);
}

.decision-traversal-breakdown-label {
    display: block;

    color: #e2e8f0;

    font-size: 12px;

    font-weight: 600;
}

.decision-traversal-breakdown-item[data-present="true"]
.decision-traversal-breakdown-label {
    color: #7dd3fc;
}

.decision-traversal-breakdown-detail {
    display: block;

    margin-top: 2px;

    color: #94a3b8;

    font-size: 11.5px;

    line-height: 1.5;
}


/* =========================================================
   INSTRUCTION
   ========================================================= */

.decision-traversal-instruction {
    margin: 0 0 22px;

    color: #7dd3fc;

    font-size: 12.5px;
    font-weight: 600;

    line-height: 1.5;
}


/* =========================================================
   1100px
   ========================================================= */

@media (max-width: 1100px) {

    :root {
        --dtc-node-width: 140px;
        --dtc-branch-width: 210px;
    }

    .decision-traversal-info-slot {
        width: 220px;
        max-width: 220px;
    }

    .decision-traversal-info-slot.left {
        left: 10px;
    }

    .decision-traversal-info-slot.right {
        right: 10px;
    }
}


/* =========================================================
   900px
   ========================================================= */

@media (max-width: 900px) {

    .decision-traversal-card {
        padding: 15px;
    }

    .decision-traversal-card-content {
        width: 96vw;
        height: 92vh;

        border-radius: 20px;
    }

    .decision-traversal-scroll-content {
        padding: 28px;
    }

    .decision-traversal-tree-canvas {
        justify-content: center;

        padding-left: 20px;
        padding-right: 20px;
    }

    :root {
        --dtc-node-width: 135px;
        --dtc-branch-width: 200px;
    }

    .decision-traversal-info-slot {
        width: 200px;
        max-width: 200px;
    }

    .decision-traversal-info-slot.left {
        left: 6px;
    }

    .decision-traversal-info-slot.right {
        right: 6px;
    }
}


/* =========================================================
   700px
   ========================================================= */

@media (max-width: 700px) {

    :root {
        --dtc-node-width: 125px;
        --dtc-branch-width: 185px;
    }

    .decision-traversal-info-slot {
        width: 190px;
        max-width: 190px;

        max-height: 38vh;
    }

    .decision-traversal-info-slot.left {
        left: 5px;
    }

    .decision-traversal-info-slot.right {
        right: 5px;
    }
}


/* =========================================================
   550px
   ========================================================= */

@media (max-width: 550px) {

    .decision-traversal-card {
        padding: 10px;
    }

    .decision-traversal-card-content {
        width: 98vw;
        height: 94vh;

        border-radius: 18px;
    }

    .decision-traversal-scroll-content {
        padding: 24px 20px;
    }

    .decision-traversal-card-content h2 {
        margin-right: 45px;

        font-size: 18px;
    }

    :root {
        --dtc-node-width: 120px;
        --dtc-branch-width: 175px;
    }

    .decision-traversal-node {
        width: 120px;

        min-width: 120px;
        max-width: 120px;

        min-height: 45px;

        padding: 8px 10px;

        font-size: 10.5px;
    }

    .decision-traversal-root
    > .decision-traversal-node {
        width: 140px;

        min-width: 140px;
        max-width: 140px;
    }

    .decision-traversal-branch {
        width: 175px;

        min-width: 175px;
        max-width: 175px;

        padding-left: 8px;
        padding-right: 8px;
    }

    .decision-traversal-branch:only-child {
        width: 120px;

        min-width: 120px;
        max-width: 120px;
    }

    .decision-traversal-tree-canvas {
        justify-content: center;

        padding-left: 10px;
        padding-right: 10px;
    }

    .decision-traversal-info-slot {
        width: 165px;
        max-width: 165px;

        max-height: 35vh;
    }

    .decision-traversal-info-slot.left {
        left: 5px;
    }

    .decision-traversal-info-slot.right {
        right: 5px;
    }

    .decision-traversal-close {
        top: 14px;
        right: 14px;
    }
}