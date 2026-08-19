const DecisionTraversalCard = (() => {

    let card = null;
    let cardContent = null;
    let content = null;
    let main = null;
    let tree = null;
    let leftInfo = null;
    let rightInfo = null;
    let closeButton = null;
    let initialized = false;
    let activeInfoElement = null;
    let boundaryResizeFrame = null;

    function getRealChildEdges(node) {

        if (
            !node ||
            !Array.isArray(node.children) ||
            !node.children.length
        ) {
            return [];
        }

        return node.children
            .filter(marker =>
                marker &&
                Array.isArray(marker.children) &&
                marker.children.length
            )
            .map(marker => ({
                node: marker.children[0],
                branch:
                    marker.branch ||
                    marker.name ||
                    "",
                taken: marker.taken === true,
                explanation:
                    marker.explanation ||
                    marker.description ||
                    ""
            }))
            .filter(edge => edge.node);
    }

    async function loadHTML() {

        if (card) {
            return true;
        }

        try {

            const response =
                await fetch(
                    "./components/decisionTraversalCard.html"
                );

            if (!response.ok) {
                throw new Error(
                    "Failed to load decisionTraversalCard.html"
                );
            }

            const wrapper =
                document.createElement("div");

            wrapper.innerHTML =
                await response.text();

            const loadedCard =
                wrapper.querySelector(
                    "#decisionTraversalCard"
                );

            if (!loadedCard) {
                return false;
            }

            document.body.appendChild(
                loadedCard
            );

            card =
                document.getElementById(
                    "decisionTraversalCard"
                );

            cardContent =
                card.querySelector(
                    ".decision-traversal-card-content"
                );

            content =
                document.getElementById(
                    "decisionTraversalContent"
                );

            main =
                card.querySelector(
                    ".decision-traversal-main"
                );

            tree =
                document.getElementById(
                    "decisionTraversalTree"
                );

            leftInfo =
                document.getElementById(
                    "decisionTraversalLeftInfo"
                );

            rightInfo =
                document.getElementById(
                    "decisionTraversalRightInfo"
                );

            closeButton =
    card.querySelector(
        "#decisionTraversalClose"
    );



if (closeButton) {

    closeButton.style.position = "absolute";
    closeButton.style.top = "18px";
    closeButton.style.right = "18px";
    closeButton.style.left = "auto";
    closeButton.style.bottom = "auto";
    closeButton.style.zIndex = "10000";
}

            return !!(
                card &&
                content &&
                main &&
                tree &&
                leftInfo &&
                rightInfo &&
                closeButton
            );

        } catch (error) {

            console.error(
                "[DecisionTraversalCard]",
                error
            );

            return false;
        }
    }

    async function init() {

        if (initialized) {
            return true;
        }

        const loaded =
            await loadHTML();

        if (!loaded) {
            return false;
        }

        closeButton.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                close();
            }
        );

        card.addEventListener(
            "click",
            event => {

                if (
                    event.target === card
                ) {
                    close();
                }
            }
        );

        window.addEventListener(
            "resize",
            repositionActiveInfo
        );

        window.addEventListener(
            "resize",
            () => {

                if (boundaryResizeFrame) {

                    cancelAnimationFrame(
                        boundaryResizeFrame
                    );
                }

                boundaryResizeFrame =
                    requestAnimationFrame(
                        applyWidthBoundaries
                    );
            }
        );

        if (cardContent) {

            cardContent.addEventListener(
                "scroll",
                repositionActiveInfo,
                {
                    passive: true
                }
            );
        }

        initialized = true;

        return true;
    }

    function setData(data) {

        if (!data) {
            return;
        }

        window.decisionTraversalData =
            data;

        if (tree) {

            renderTree(data);

            if (
                card &&
                !card.hidden
            ) {
                scheduleWidthBoundaries();
            }
        }
    }

    function clearTree() {

        activeInfoElement = null;

        if (tree) {
            tree.innerHTML = "";
        }

        if (leftInfo) {
            leftInfo.innerHTML = "";
            leftInfo.style.top = "0px";
            leftInfo.style.transform =
                "translateY(0)";
        }

        if (rightInfo) {
            rightInfo.innerHTML = "";
            rightInfo.style.top = "0px";
            rightInfo.style.transform =
                "translateY(0)";
        }
    }

    function getNodeExplanation(node) {

        if (!node) {
            return "";
        }

        if (
            typeof node.explanation ===
            "string"
        ) {
            return node.explanation;
        }

        if (
            node.decision &&
            node.explanation &&
            typeof node.explanation ===
            "object"
        ) {
            return (
                node.explanation[
                    node.decision
                ] || ""
            );
        }

        if (node.description) {
            return node.description;
        }

        if (node.reason) {
            return node.reason;
        }

        return "This node represents a decision made by the Decision Tree.";
    }

    function getNodeLabel(node) {

        if (!node) {
            return "Decision";
        }

        return (
            node.name ||
            node.question ||
            node.feature ||
            node.decision ||
            node.label ||
            "Decision"
        );
    }

    function getResultLabel(node) {

        if (!node) {
            return "RESULT";
        }

        return (
            node.result ||
            node.vulnerability ||
            node.classification ||
            node.name ||
            "RESULT"
        );
    }

    function getBranchSide(
        branch,
        index,
        total
    ) {

        const value =
            String(branch || "")
                .toUpperCase();

        if (value === "NO") {
            return "left";
        }

        if (value === "YES") {
            return "right";
        }

        if (total === 2) {
            return index === 0
                ? "left"
                : "right";
        }

        return index < total / 2
            ? "left"
            : "right";
    }

function getElementSide(element) {

    if (!element || !main) {
        return "right";
    }

    const elementRect =
        element.getBoundingClientRect();

    const mainRect =
        main.getBoundingClientRect();

    const elementCenter =
        elementRect.left +
        elementRect.width / 2;

    const mainCenter =
        mainRect.left +
        mainRect.width / 2;

    return elementCenter < mainCenter
        ? "left"
        : "right";
}

function positionInfo(
    sourceElement,
    side
) {

    if (
        !sourceElement ||
        !main
    ) {
        return;
    }

    const container =
        side === "left"
            ? leftInfo
            : rightInfo;

    if (!container) {
        return;
    }

    const panel =
        container.querySelector(
            ".decision-traversal-info-card"
        );

    if (!panel) {
        return;
    }

    const sourceRect =
        sourceElement.getBoundingClientRect();

    const mainRect =
        main.getBoundingClientRect();

    const panelHeight =
        panel.offsetHeight;

    const sourceCenter =
        sourceRect.top +
        sourceRect.height / 2;

    const mainRelativeCenter =
        sourceCenter -
        mainRect.top;

    const mainHeight =
        main.clientHeight;

    const padding =
        8;

    const halfPanel =
        panelHeight / 2;

    const minimumCenter =
        padding +
        halfPanel;

    const maximumCenter =
        Math.max(
            minimumCenter,
            mainHeight -
            padding -
            halfPanel
        );

    const finalCenter =
        Math.max(
            minimumCenter,
            Math.min(
                mainRelativeCenter,
                maximumCenter
            )
        );

    container.style.top =
        `${finalCenter}px`;

    container.style.transform =
        "translateY(-50%)";

    if (side === "left") {

        container.style.left =
            "18px";

        container.style.right =
            "auto";

    } else {

        container.style.right =
            "18px";

        container.style.left =
            "auto";
    }
}
    function repositionActiveInfo() {

        if (!activeInfoElement) {
            return;
        }

        const activePanel =
            activeInfoElement.dataset
                ? activeInfoElement.dataset.infoSide
                : null;

        if (activePanel) {

            positionInfo(
                activeInfoElement,
                activePanel
            );

            return;
        }

        const leftPanel =
            leftInfo &&
            leftInfo.querySelector(
                ".decision-traversal-info-card"
            );

        const rightPanel =
            rightInfo &&
            rightInfo.querySelector(
                ".decision-traversal-info-card"
            );

        if (leftPanel) {

            positionInfo(
                activeInfoElement,
                "left"
            );

        } else if (rightPanel) {

            positionInfo(
                activeInfoElement,
                "right"
            );
        }
    }

    function createInfoPanel(
        side,
        title,
        text,
        breakdown
    ) {

        const panel =
            document.createElement("div");

        panel.className =
            `decision-traversal-info-card ${side}`;

        const heading =
            document.createElement("strong");

        heading.textContent =
            title;

        const paragraph =
            document.createElement("p");

        paragraph.textContent =
            text ||
            "No additional explanation available.";

        panel.appendChild(
            heading
        );

        panel.appendChild(
            paragraph
        );

        if (
            Array.isArray(breakdown) &&
            breakdown.length
        ) {

            const breakdownTitle =
                document.createElement("span");

            breakdownTitle.className =
                "decision-traversal-breakdown-title";

            breakdownTitle.textContent =
                "Feature breakdown";

            panel.appendChild(
                breakdownTitle
            );

            const list =
                document.createElement("ul");

            list.className =
                "decision-traversal-breakdown-list";

            breakdown.forEach(item => {

                if (!item) {
                    return;
                }

                const entry =
                    document.createElement("li");

                entry.className =
                    "decision-traversal-breakdown-item";

                entry.dataset.present =
                    item.present === true
                        ? "true"
                        : "false";

                const label =
                    document.createElement("span");

                label.className =
                    "decision-traversal-breakdown-label";

                label.textContent =
                    `${item.label || item.feature || "Feature"}: ${item.present ? "Present" : "Not present"}`;

                entry.appendChild(
                    label
                );

                if (item.explanation) {

                    const detail =
                        document.createElement("span");

                    detail.className =
                        "decision-traversal-breakdown-detail";

                    detail.textContent =
                        item.explanation;

                    entry.appendChild(
                        detail
                    );
                }

                list.appendChild(
                    entry
                );
            });

            panel.appendChild(
                list
            );
        }

        return panel;
    }

    function hideInfo() {

        if (leftInfo) {

            leftInfo.innerHTML = "";

            leftInfo.style.top =
                "0px";

            leftInfo.style.transform =
                "translateY(0)";
        }

        if (rightInfo) {

            rightInfo.innerHTML = "";

            rightInfo.style.top =
                "0px";

            rightInfo.style.transform =
                "translateY(0)";
        }

        activeInfoElement = null;
    }

    function showInfo(
        side,
        title,
        text,
        breakdown,
        sourceElement
    ) {

        if (
            !leftInfo ||
            !rightInfo
        ) {
            return;
        }

        if (
            sourceElement &&
            activeInfoElement === sourceElement
        ) {
            hideInfo();
            return;
        }

        const container =
            side === "left"
                ? leftInfo
                : rightInfo;

        const otherContainer =
            side === "left"
                ? rightInfo
                : leftInfo;

        container.innerHTML = "";
        otherContainer.innerHTML = "";

        container.style.top =
            "0px";

        container.style.transform =
            "translateY(0)";

        const panel =
            createInfoPanel(
                side,
                title,
                text,
                breakdown
            );

        container.appendChild(
            panel
        );

        if (sourceElement) {

            sourceElement.dataset.infoSide =
                side;
        }

        activeInfoElement =
            sourceElement || null;

        requestAnimationFrame(() => {

            positionInfo(
                sourceElement,
                side
            );

        });
    }

    function createNode(
        node,
        level,
        side
    ) {

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "decision-traversal-node-wrapper";

        wrapper.dataset.level =
            level;

        wrapper.dataset.side =
            side || "center";

        if (level === 0) {

            wrapper.classList.add(
                "decision-traversal-root"
            );
        }

        const isResult =
            node.type === "result" ||
            node.type === "leaf" ||
            node.final === true;

        const element =
            document.createElement("button");

        element.type = "button";

        element.className =
            isResult
                ? "decision-traversal-node decision-result-node"
                : "decision-traversal-node decision-node";

        element.textContent =
            isResult
                ? getResultLabel(node)
                : getNodeLabel(node);

        element.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                const actualSide =
                    getElementSide(element);

                if (isResult) {

                    showInfo(
                        actualSide,
                        "Classification Result",
                        `The system classified this password using the ${getResultLabel(node)} cracking method.`,
                        null,
                        element
                    );

                    return;
                }

                showInfo(
                    actualSide,
                    getNodeLabel(node),
                    getNodeExplanation(node),
                    node.breakdown,
                    element
                );
            }
        );

        wrapper.appendChild(
            element
        );

        if (!isResult) {

            const edges =
                getRealChildEdges(node);

            if (edges.length) {

                wrapper.appendChild(
                    createChildren(
                        edges,
                        level + 1
                    )
                );
            }
        }

        return wrapper;
    }

    function createChildren(
        edges,
        level
    ) {

        const children =
            document.createElement("div");

        children.className =
            "decision-traversal-children";

        children.dataset.count =
            edges.length;

        edges.forEach(
            (edge, index) => {

                const side =
                    getBranchSide(
                        edge.branch,
                        index,
                        edges.length
                    );

                children.appendChild(
                    createBranch(
                        edge,
                        level,
                        side,
                        index,
                        edges.length
                    )
                );
            }
        );

        return children;
    }

    function createBranch(
        edge,
        level,
        side,
        index,
        total
    ) {

        const branch =
            document.createElement("div");

        branch.className =
            "decision-traversal-branch";

        branch.dataset.side =
            side;

        branch.dataset.level =
            level;

        branch.dataset.index =
            index;

        branch.dataset.total =
            total;

        if (edge.taken) {

            branch.dataset.taken =
                "true";
        }

        const vertical =
            document.createElement("div");

        vertical.className =
            "decision-traversal-vertical";

        if (edge.taken) {

            vertical.dataset.taken =
                "true";
        }

        branch.appendChild(
            vertical
        );

        const label =
            document.createElement("button");

        label.type = "button";

        label.className =
            "decision-traversal-branch-line";

        label.textContent =
            edge.branch || "PATH";

        label.dataset.branch =
            edge.branch || "";

        if (edge.taken) {

            label.dataset.taken =
                "true";
        }

        label.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                showInfo(
                    side,
                    `${edge.branch || "PATH"} Branch`,
                    edge.explanation ||
                    `This is the ${edge.branch || "selected"} path followed by the Decision Tree.`,
                    null,
                    label
                );
            }
        );

        branch.appendChild(
            label
        );

        if (edge.node) {

            branch.appendChild(
                createNode(
                    edge.node,
                    level,
                    side
                )
            );
        }

        return branch;
    }

    /* =========================================================
       WIDE-BRANCH BOUNDARY CONSTRAINT

       The detailed tree's layout (spacing, spread, diagonal
       look) is still entirely driven by the existing CSS flex
       rules above — nothing about normal branches changes.

       This only measures the tree AFTER it has been laid out
       by the browser, and — exactly like the compact overview
       tree already does — stops branches from drifting further
       and further outward once they cross a reasonable
       horizontal boundary based on the real available width of
       the detailed-tree area. Once a branch crosses that
       boundary, that branch and everything beneath it renders
       as a straight vertical drop (via the existing
       .dtc-boundary-left / .dtc-boundary-right /
       .dtc-boundary-stack CSS rules) instead of continuing to
       fan outward.
       ========================================================= */

    function clearBoundaryMarkers() {

        if (!tree) {
            return;
        }

        tree.querySelectorAll(
            ".dtc-boundary-stack"
        ).forEach(el => {

            el.classList.remove(
                "dtc-boundary-stack"
            );
        });

        tree.querySelectorAll(
            ".dtc-boundary-left, .dtc-boundary-right"
        ).forEach(el => {

            el.classList.remove(
                "dtc-boundary-left",
                "dtc-boundary-right"
            );
        });
    }

    function walkForBoundaries(
        wrapper,
        forceStack,
        centerX,
        maxOffset
    ) {

        if (!wrapper) {
            return;
        }

        if (forceStack) {

            wrapper.classList.add(
                "dtc-boundary-stack"
            );
        }

        const childrenContainer =
            wrapper.querySelector(
                ":scope > .decision-traversal-children"
            );

        if (!childrenContainer) {
            return;
        }

        const branches =
            childrenContainer.querySelectorAll(
                ":scope > .decision-traversal-branch"
            );

        branches.forEach(branch => {

            const childWrapper =
                branch.querySelector(
                    ":scope > .decision-traversal-node-wrapper"
                );

            if (!childWrapper) {
                return;
            }

            let stack = forceStack;

            if (!stack) {

                const rect =
                    childWrapper.getBoundingClientRect();

                const nodeCenterX =
                    rect.left +
                    rect.width / 2;

                const offset =
                    Math.abs(
                        nodeCenterX - centerX
                    );

                if (offset > maxOffset) {

                    stack = true;

                    branch.classList.add(
                        branch.dataset.side === "left"
                            ? "dtc-boundary-left"
                            : "dtc-boundary-right"
                    );
                }
            }

            walkForBoundaries(
                childWrapper,
                stack,
                centerX,
                maxOffset
            );
        });
    }

    function applyWidthBoundaries() {

        if (
            !tree ||
            !card ||
            card.hidden
        ) {
            return;
        }

        const canvas =
            tree.querySelector(
                ".decision-traversal-tree-canvas"
            );

        if (!canvas) {
            return;
        }

        clearBoundaryMarkers();

        const treeRect =
            tree.getBoundingClientRect();

        if (!treeRect.width) {
            return;
        }

        // The boundary is derived from the actual available
        // width of the detailed-tree area (not an arbitrary
        // fixed pixel value); a small edge margin keeps the
        // outermost nodes from touching the tree area's edge.
        const centerX =
            treeRect.left +
            treeRect.width / 2;

        const edgeMargin = 24;

        const maxOffset =
            Math.max(
                90,
                treeRect.width / 2 - edgeMargin
            );

        const rootWrapper =
            canvas.querySelector(
                ":scope > .decision-traversal-node-wrapper"
            );

        if (!rootWrapper) {
            return;
        }

        walkForBoundaries(
            rootWrapper,
            false,
            centerX,
            maxOffset
        );
    }

    function scheduleWidthBoundaries() {

        requestAnimationFrame(() => {

            requestAnimationFrame(
                applyWidthBoundaries
            );
        });
    }

    function renderTree(data) {

        if (!tree) {
            return;
        }

        clearTree();

        const path =
            data &&
            data.actual_model_decision_path;

        if (!path) {

            const message =
                document.createElement("p");

            message.className =
                "decision-traversal-empty";

            message.textContent =
                "No decision-tree traversal data is available.";

            tree.appendChild(
                message
            );

            return;
        }

        const canvas =
            document.createElement("div");

        canvas.className =
            "decision-traversal-tree-canvas";

        const root =
            createNode(
                path,
                0,
                "center"
            );

        canvas.appendChild(
            root
        );

        tree.appendChild(
            canvas
        );
    }

    async function open(data) {

        const ready =
            await init();

        if (!ready) {
            return;
        }

        if (data) {

            setData(data);

        } else if (
            window.latestAnalysisData
        ) {

            setData(
                window.latestAnalysisData
            );
        }

        card.hidden = false;

        card.removeAttribute(
            "hidden"
        );

        card.style.display =
            "flex";

        card.style.visibility =
            "visible";

        card.style.opacity =
            "1";

        card.style.pointerEvents =
            "auto";

        document.body.style.overflow =
            "hidden";

        scheduleWidthBoundaries();
    }

    function close() {

        if (!card) {
            return;
        }

        hideInfo();

        card.hidden = true;

        card.setAttribute(
            "hidden",
            ""
        );

        card.style.display =
            "none";

        card.style.visibility =
            "hidden";

        card.style.opacity =
            "0";

        card.style.pointerEvents =
            "none";

        document.body.style.overflow =
            "";
    }

    async function initialize() {

        const ready =
            await init();

        if (
            ready &&
            window.latestAnalysisData
        ) {

            setData(
                window.latestAnalysisData
            );
        }
    }

    return {
        init,
        setData,
        open,
        close,
        initialize
    };

})();

window.DecisionTraversalCard =
    DecisionTraversalCard;

document.addEventListener(
    "DOMContentLoaded",
    () => {
        DecisionTraversalCard.initialize();
    },
    {
        once: true
    }
);