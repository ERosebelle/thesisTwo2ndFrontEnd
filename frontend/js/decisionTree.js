const DecisionTree = (() => {
    let renderedTree = null;

    function getRealChildEdges(node) {
        if (
            !node ||
            !Array.isArray(node.children) ||
            !node.children.length
        ) {
            return [];
        }

        return node.children
            .filter(
                marker =>
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
                taken: marker.taken === true
            }))
            .filter(edge => edge.node);
    }

    function initializeDecisionTree() {
        attachHologramClickNotifier();
    }

    function attachHologramClickNotifier() {
        const hologram =
            document.querySelector(
                ".decision-tree-hologram"
            );

        if (!hologram) {
            return;
        }

        if (
            hologram.dataset.clickNotifierAttached ===
            "true"
        ) {
            return;
        }

        hologram.dataset.clickNotifierAttached =
            "true";

        function notifyHologramClicked() {
            document.dispatchEvent(
                new CustomEvent(
                    "decisionTree:hologramClicked"
                )
            );
        }

        hologram.addEventListener(
            "click",
            notifyHologramClicked
        );

        hologram.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();
                    notifyHologramClicked();
                }
            }
        );
    }

    function updateDecisionTree(data) {
        if (!data) {
            return;
        }

        window.latestAnalysisData = data;

        const tree =
            data.actual_model_decision_path;

        if (!tree) {
            return;
        }

        updateExplanation(data);
        renderDecisionTree(tree);
        animateTreeTraversal(data);
    }

    function updateExplanation(data) {
        const explanation =
            document.getElementById(
                "decisionExplanation"
            );

        const attackVector =
            document.getElementById(
                "attackVector"
            );

        const remediation =
            document.getElementById(
                "remediation"
            );

        if (!explanation) {
            return;
        }

        const assessment =
            data.security_assessment || {};

        const vulnerabilityExplanation =
            assessment.vulnerability_explanation ||
            "";

        if (vulnerabilityExplanation) {
            explanation.innerHTML =
                censorPassword(
                    vulnerabilityExplanation,
                    data.password
                );

            if (attackVector) {
                attackVector.innerHTML =
                    censorPassword(
                        assessment.attack_vector ||
                        "",
                        data.password
                    );
            }

            if (remediation) {
                remediation.innerHTML =
                    censorPassword(
                        assessment.remediation ||
                        "",
                        data.password
                    );
            }

            activatePasswordReveal();
            return;
        }

        const fallbackMessages = {
            DICTIONARY:
                "The Decision Tree identified a dictionary-based vulnerability.",

            "RULE-BASED":
                "The Decision Tree identified a predictable password pattern.",

            "BRUTE-FORCE":
                "The Decision Tree identified a password that may be vulnerable to brute-force guessing."
        };

        explanation.innerHTML =
            censorPassword(
                fallbackMessages[
                    data.vulnerability
                ] ||
                "The Decision Tree could not determine the classification path.",
                data.password
            );

        if (attackVector) {
            attackVector.innerHTML =
                censorPassword(
                    assessment.attack_vector ||
                    "",
                    data.password
                );
        }

        if (remediation) {
            remediation.innerHTML =
                censorPassword(
                    assessment.remediation ||
                    "",
                    data.password
                );
        }

        activatePasswordReveal();
    }

    function renderDecisionTree(tree) {
        const nodeContainer =
            document.getElementById(
                "decisionTreeNodes"
            );

        const branchContainer =
            document.getElementById(
                "decisionTreeBranches"
            );

        const svg =
            document.querySelector(
                ".dt-tree-svg"
            );

        if (
            !nodeContainer ||
            !branchContainer ||
            !svg
        ) {
            return;
        }

        renderedTree = tree;

        nodeContainer.innerHTML = "";
        branchContainer.innerHTML = "";

        svg.setAttribute(
            "viewBox",
            "0 0 220 100"
        );

        svg.setAttribute(
            "preserveAspectRatio",
            "xMidYMid meet"
        );

        let idCounter = 0;

        function getDepth(
            node,
            visited = new Set()
        ) {
            if (!node || visited.has(node)) {
                return 0;
            }

            visited.add(node);

            const edges =
                getRealChildEdges(node);

            if (!edges.length) {
                return 1;
            }

            return (
                1 +
                Math.max(
                    ...edges.map(edge =>
                        getDepth(
                            edge.node,
                            new Set(visited)
                        )
                    )
                )
            );
        }

        const depth =
            getDepth(tree);

        const verticalStep =
            Math.min(
                30,
                88 /
                Math.max(
                    depth - 1,
                    1
                )
            );

        function createNode(
            node,
            x,
            y
        ) {
            const circle =
                document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "circle"
                );

            const id =
                `n${idCounter++}`;

            node._domId = id;

            circle.setAttribute(
                "cx",
                x
            );

            circle.setAttribute(
                "cy",
                y
            );

            circle.setAttribute(
                "r",
                node.final
                    ? "4.5"
                    : "3.5"
            );

            circle.setAttribute(
                "vector-effect",
                "non-scaling-stroke"
            );

            circle.classList.add(
                "dt-node"
            );

            circle.dataset.id =
                id;

            if (node === tree) {
                circle.classList.add(
                    "dt-root"
                );
            } else if (
                node.type ===
                "decision"
            ) {
                circle.classList.add(
                    "dt-question"
                );
            } else if (
                node.final
            ) {
                circle.classList.add(
                    "dt-node--leaf"
                );
            }

            circle.addEventListener(
                "click",
                event => {
                    event.stopPropagation();

                    document.dispatchEvent(
                        new CustomEvent(
                            "decisionTree:nodeClicked",
                            {
                                detail: {
                                    node,
                                    tree
                                }
                            }
                        )
                    );
                }
            );

            nodeContainer.appendChild(
                circle
            );

            return {
                x,
                y,
                id
            };
        }

        function createBranch(
            x1,
            y1,
            x2,
            y2,
            childId,
            choice
        ) {
            const line =
                document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "line"
                );

            line.setAttribute(
                "x1",
                x1
            );

            line.setAttribute(
                "y1",
                y1
            );

            line.setAttribute(
                "x2",
                x2
            );

            line.setAttribute(
                "y2",
                y2
            );

            line.setAttribute(
                "vector-effect",
                "non-scaling-stroke"
            );

            line.classList.add(
                "dt-branch"
            );

            line.dataset.id =
                childId;

            line.dataset.choice =
                choice;

            line.addEventListener(
                "click",
                event => {
                    event.stopPropagation();

                    document.dispatchEvent(
                        new CustomEvent(
                            "decisionTree:branchClicked",
                            {
                                detail: {
                                    branch:
                                        choice,
                                    nodeId:
                                        childId,
                                    tree
                                }
                            }
                        )
                    );
                }
            );

            branchContainer.appendChild(
                line
            );
        }

        function build(
            node,
            x,
            y,
            visited = new Set()
        ) {
            if (
                !node ||
                visited.has(node)
            ) {
                return null;
            }

            const nextVisited =
                new Set(visited);

            nextVisited.add(node);

            const current =
                createNode(
                    node,
                    x,
                    y
                );

            const edges =
                getRealChildEdges(
                    node
                );

            if (!edges.length) {
                return current;
            }

            const gap =
                Math.min(
                    42,
                    90 /
                    Math.max(
                        edges.length,
                        1
                    )
                );

            edges.forEach(
                (
                    edge,
                    index
                ) => {
                    let childX;

                    if (
                        edges.length ===
                        1
                    ) {
                        childX = x;
                    } else {
                        childX =
                            x +
                            (
                                (
                                    index -
                                    (
                                        edges.length -
                                        1
                                    ) / 2
                                ) *
                                gap
                            );
                    }

                    childX =
                        Math.min(
                            214,
                            Math.max(
                                6,
                                childX
                            )
                        );

                    const childY =
                        y +
                        verticalStep;

                    const childPosition =
                        build(
                            edge.node,
                            childX,
                            childY,
                            nextVisited
                        );

                    if (!childPosition) {
                        return;
                    }

                    createBranch(
                        current.x,
                        current.y,
                        childPosition.x,
                        childPosition.y,
                        childPosition.id,
                        edge.branch
                    );
                }
            );

            return current;
        }

        build(
            tree,
            110,
            8
        );
    }

    function animateTreeTraversal(data) {
        const nodes =
            document.querySelectorAll(
                ".dt-node"
            );

        const branches =
            document.querySelectorAll(
                ".dt-branch"
            );

        if (!nodes.length) {
            return;
        }

        nodes.forEach(
            node => {
                node.classList.remove(
                    "active"
                );

                node.classList.remove(
                    "dt-result"
                );
            }
        );

        branches.forEach(
            branch => {
                branch.classList.remove(
                    "active"
                );
            }
        );

        const tree =
            renderedTree;

        if (!tree) {
            return;
        }

        const pathIds = [];

        if (tree._domId) {
            pathIds.push(
                tree._domId
            );
        }

        let current = tree;
        const visited = new Set();

        while (
            current &&
            !current.final &&
            !visited.has(current)
        ) {
            visited.add(current);

            const edges =
                getRealChildEdges(
                    current
                );

            const takenEdge =
                edges.find(
                    edge =>
                        edge.taken
                );

            if (
                !takenEdge ||
                !takenEdge.node
            ) {
                break;
            }

            if (
                !takenEdge.node._domId
            ) {
                break;
            }

            pathIds.push(
                takenEdge.node._domId
            );

            current =
                takenEdge.node;
        }

        pathIds.forEach(
            (
                id,
                index
            ) => {
                setTimeout(
                    () => {
                        const node =
                            document.querySelector(
                                `.dt-node[data-id="${CSS.escape(id)}"]`
                            );

                        if (node) {
                            node.classList.add(
                                "active"
                            );
                        }

                        if (
                            index >
                            0
                        ) {
                            const branch =
                                document.querySelector(
                                    `.dt-branch[data-id="${CSS.escape(id)}"]`
                                );

                            if (branch) {
                                branch.classList.add(
                                    "active"
                                );
                            }
                        }
                    },
                    index * 500
                );
            }
        );

        setTimeout(
            () => {
                highlightResult(
                    data.vulnerability,
                    pathIds[
                        pathIds.length - 1
                    ]
                );
            },
            pathIds.length * 500
        );
    }

    function highlightResult(
        vulnerability,
        finalId
    ) {
        if (!finalId) {
            return;
        }

        const finalNode =
            document.querySelector(
                `.dt-node[data-id="${CSS.escape(finalId)}"]`
            );

        if (!finalNode) {
            return;
        }

        finalNode.classList.add(
            "dt-result"
        );

        finalNode.dataset.result =
            vulnerability || "";
    }

    function censorPassword(
        text,
        password
    ) {
        if (!text) {
            return "-";
        }

        if (!password) {
            return text;
        }

        const regex =
            new RegExp(
                "(['\"])" +
                escapeRegex(
                    password
                ) +
                "\\1",
                "g"
            );

        const maskedPassword =
            "*".repeat(
                password.length
            );

        return text.replace(
            regex,
            `<span class="hidden-password" data-password="${escapeHtmlAttr(password)}">${maskedPassword}</span>`
        );
    }

    function escapeRegex(
        string
    ) {
        return String(string).replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
    }

    function escapeHtmlAttr(
        string
    ) {
        return String(string)
            .replace(
                /&/g,
                "&amp;"
            )
            .replace(
                /"/g,
                "&quot;"
            )
            .replace(
                /'/g,
                "&#39;"
            )
            .replace(
                /</g,
                "&lt;"
            )
            .replace(
                />/g,
                "&gt;"
            );
    }

    function activatePasswordReveal() {
        const hiddenPasswords =
            document.querySelectorAll(
                ".hidden-password"
            );

        hiddenPasswords.forEach(
            item => {
                if (
                    item.dataset
                        .listenerAttached
                ) {
                    return;
                }

                item.dataset
                    .listenerAttached =
                    "true";

                const password =
                    item.dataset.password ||
                    "";

                if (!password) {
                    return;
                }

                const masked =
                    "*".repeat(
                        password.length
                    );

                item.textContent =
                    masked;

                const show =
                    () => {
                        item.textContent =
                            password;
                    };

                const hide =
                    () => {
                        item.textContent =
                            masked;
                    };

                item.addEventListener(
                    "pointerdown",
                    show
                );

                item.addEventListener(
                    "pointerup",
                    hide
                );

                item.addEventListener(
                    "pointerleave",
                    hide
                );

                item.addEventListener(
                    "pointercancel",
                    hide
                );

                item.addEventListener(
                    "touchstart",
                    show,
                    {
                        passive: true
                    }
                );

                item.addEventListener(
                    "touchend",
                    hide
                );

                item.addEventListener(
                    "touchcancel",
                    hide
                );
            }
        );
    }

    return {
        initializeDecisionTree,
        updateDecisionTree
    };
})();

window.initializeDecisionTree =
    DecisionTree.initializeDecisionTree;

window.updateDecisionTree =
    DecisionTree.updateDecisionTree;