/*
DECISION TRAVERSAL CARD
decisionTraversalCard.js
Independent Result-page component. Renders the backend's decision tree as a zoomed-in, readable hologram: square nodes carry the actual
question / result text, YES/NO connectors stay as lines. Every node and connector is clickable and
toggles a floating info card, populated entirelyfrom data the backend already sends - nothing here is a hardcoded security explanation. */

const DecisionTraversalCard = (() => {
    const SVG_NS = "http://www.w3.org/2000/svg";

    /*---- LAYOUT CONSTANTS ----
    The tree's main "spine" runs straight down the center. Each question always has one child that continues the spine (the real, taken answer) 
    and one that terminates immediately in a leaf (the untaken/off-path outcome). The off-path leaf pokes out to the side instead of the 
    tree spreading wider and wider - this is what keeps the tree bounded and leaves the side margins free for info cards.*/

    const TREE_WIDTH = 600;
    const TREE_CENTER_X = TREE_WIDTH / 2;
    const LEVEL_HEIGHT = 130;
    const NODE_WIDTH = 128;
    const NODE_HEIGHT = 48;
    const LEAF_OFFSET_X = 150;
    const LEAF_OFFSET_Y_RATIO = .6;
    // Composition breakdown (character_class_count / rule_pattern_present) -
    // now rendered as a fan: lines spread out from the incoming point to each
    // sub-feature, then converge back down into the real decision node below,
    // so it visually reads as tree branches rather than a plain vertical list.
    const FAN_HEIGHT = 72;
    const FAN_SPACING = 150;
    const FAN_ITEM_WIDTH = 138;
    const CARD_WIDTH = 210;
    const CARD_GAP = -40;
    const CARD_ESTIMATED_HEIGHT = 140;

    let overlay = null;
    let card = null;
    let closeButton = null;
    let placeholder = null;
    let content = null;
    let treeWrap = null;
    let svg = null;
    let infoCard = null;
    let infoCardTitle = null;
    let infoCardBody = null;
    let infoCardClose = null;
    let supplementaryPanel = null;

    // All 12 feature labels - a client-side mirror of the backend's
    // FEATURE_LABELS, used only to render the supplementary panel below.
    const ALL_FEATURE_LABELS = {
        length: "Length",
        has_lowercase: "Has Lowercase",
        has_uppercase: "Has Uppercase",
        has_digit: "Has Digit",
        has_symbol: "Has Symbol",
        dictionary_present: "Dictionary Present",
        has_leetspeak: "Has Leetspeak",
        numeric_suffix: "Numeric Suffix",
        has_sequence: "Has Sequence",
        has_repetition: "Has Repetition",
        character_class_count: "Character Class Count",
        rule_pattern_present: "Rule Pattern Present"
    };

    // Sub-features already explained via the fan breakdown - not "unused",
    // just not literal split columns, so they're excluded from the
    // supplementary panel to avoid repeating information already on-tree.
    const FEATURES_SHOWN_VIA_BREAKDOWN = new Set([
        "has_lowercase", "has_uppercase", "has_digit", "has_symbol",
        "has_leetspeak", "numeric_suffix", "has_sequence", "has_repetition"
    ]);


    /*Currently open clickable element (a node <div> or a branch <g>) - used to support click-to-toggle-close and to know when a *different* 
    element was clicked.*/
    let activeElement = null;

    /*The result/vulnerability explanation for THIS analysis (backend's security_assessment object), used only when the actually-reached 
    result node is clicked.*/
    let currentTechnicalBreakdown = null;

    // INITIALIZE

    function initializeDecisionTraversalCard() {
        overlay = document.getElementById("decisionTraversalOverlay");
        card = document.getElementById("decisionTraversalCard");
        closeButton = document.getElementById("decisionTraversalClose");
        placeholder = document.getElementById("decisionTraversalPlaceholder");
        content = document.getElementById("decisionTraversalContent");

        const body = document.getElementById("decisionTraversalBody");
        treeWrap = document.getElementById("dtcTreeWrap");
        svg = document.getElementById("decisionTraversalTree");
        infoCard = document.getElementById("dtcInfoCard");
        infoCardTitle = document.getElementById("dtcInfoCardTitle");
        infoCardBody = document.getElementById("dtcInfoCardBody");
        infoCardClose = document.getElementById("dtcInfoCardClose");

        // Create the supplementary info panel once, inserted right before the
        // SVG tree - no matching element exists in the HTML template, so this
        // is built dynamically and styled inline (self-contained, no new CSS
        // file needed).
        if (svg && svg.parentNode && !document.getElementById("dtcSupplementaryPanel")) {
            supplementaryPanel = document.createElement("div");
            supplementaryPanel.id = "dtcSupplementaryPanel";
            supplementaryPanel.style.cssText = "display:none;margin:0 auto 16px;max-width:520px;padding:10px 14px;" +
                "border-radius:10px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.25);";
            svg.parentNode.insertBefore(supplementaryPanel, svg);
        } else if (!supplementaryPanel) {
            supplementaryPanel = document.getElementById("dtcSupplementaryPanel");
        }

        if (!overlay || !card)
            return;
        console.log("Decision Traversal Card JS Connected");

        // CLOSE BUTTON (whole card)
        if (closeButton) {
            closeButton.addEventListener("click", closeCard);
        }

        // CLICK OUTSIDE CARD (whole card)

        overlay.addEventListener(
            "click",
            (event) => {
                if (event.target === overlay) {
                    closeCard();
                }
            }
        );

        // ESCAPE CLOSE
        document.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key === "Escape" &&
                    overlay.classList.contains("active")
                ) {
                    closeCard();
                }
            }
        );

        // INFO CARD CLOSE BUTTON
        if (infoCardClose) {
            infoCardClose.addEventListener(
                "click",
                (event) => {
                    event.stopPropagation();
                    closeInfoCard();
                }
            );
        }

        // CLICK ON EMPTY TREE SPACE CLOSES THE INFO CARD
        if (treeWrap) {
            treeWrap.addEventListener(
                "click",
                (event) => {
                    const clickedInfoCard = infoCard && infoCard.contains(event.target);
                    const clickedClickable = event.target.closest(".dtc-clickable");

                    if (!clickedInfoCard && !clickedClickable) {
                        closeInfoCard();
                    }
                }
            );
        }

        /*SCROLLING THE TREE CLOSES THE INFO CARD
        (the card is fixed to the screen; if the tree scrolled underneath it, it would no longer be beside the node it's explaining)*/
        if (body) {
            body.addEventListener("scroll", closeInfoCard);
        }
    }

    // OPEN - Receives the full backend analysis response
    function openCard(data) {
        if (!overlay)
            return;
        if (!data) {
            showPlaceholder();
        }
        else {
            renderTraversal(data);
        }
        overlay.classList.add("active");
    }

    // CLOSE
    function closeCard() {
        if (!overlay)
            return;
        overlay.classList.remove("active");
        closeInfoCard();
    }

    // EMPTY STATE
    function showPlaceholder() {
        if (placeholder) {
            placeholder.style.display = "flex";
        }

        if (content) {
            content.style.display = "none";
        }
    }

    // RENDER TREE + EXPLANATION SOURCE
    function renderTraversal(data) {
        if (placeholder) {
            placeholder.style.display = "none";
        }

        if (content) {
            content.style.display = "flex";
        }
        renderDecisionTree(data.actual_model_decision_path, data.security_assessment, data.features);
    }

    /*REMOVE BACKEND MARKER WRAPPER
    Backend structure:
    
    node
        |
    children[]
        |
    YES / NO marker (carries its own
    `explanation` + `taken` flag)
                |
            real node
    */
    function getRealChildEdges(node) {
        if (!node || !node.children
        )
            return [];

        return node.children
            .filter(marker => marker && marker.children && marker.children.length)
            .map(
                marker => ({
                    node: marker.children[0],
                    branch: marker.branch || marker.name,
                    taken: marker.taken === true,
                    explanation: marker.explanation
                })
            );
    }

    /* Walks the tree and collects which feature keys were actually used as
    real decision splits (node.feature on every decision-type node). Used to
    figure out which of the 12 features are NOT represented anywhere on the
    tree (as a split OR via a breakdown fan) - computed dynamically so this
    stays correct even if the model is retrained with different splits. */
    function collectUsedFeatureKeys(node, used) {
        if (!node) return;
        if (node.type === "decision" && node.feature) {
            used.add(node.feature);
        }
        (node.children || []).forEach(marker => {
            (marker.children || []).forEach(child => collectUsedFeatureKeys(child, used));
        });
    }

    /* Renders a small panel above the tree listing extracted features that
    aren't represented anywhere on it - neither as a real split nor inside a
    breakdown fan (currently just `length`, since the trained model doesn't
    split on it) - so the user can still see the complete picture of what was
    extracted from their password, per the leader's plan. */
    function renderSupplementaryPanel(tree, features) {
        if (!supplementaryPanel) return;

        if (!tree || !features) {
            supplementaryPanel.style.display = "none";
            supplementaryPanel.innerHTML = "";
            return;
        }

        const used = new Set();
        collectUsedFeatureKeys(tree, used);

        const unusedKeys = Object.keys(ALL_FEATURE_LABELS).filter(
            key => !used.has(key) && !FEATURES_SHOWN_VIA_BREAKDOWN.has(key)
        );

        if (unusedKeys.length === 0) {
            supplementaryPanel.style.display = "none";
            supplementaryPanel.innerHTML = "";
            return;
        }

        supplementaryPanel.style.display = "block";
        supplementaryPanel.innerHTML =
            '<div style="font-size:12px;font-weight:600;color:#7dd3fc;margin-bottom:6px;">' +
            'Additional Characteristics <span style="font-weight:400;color:#8b93b0;">(extracted, but not used as a decision split by this model)</span>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
            unusedKeys.map(key => {
                const value = features[key];
                return '<div style="font-size:13px;color:#e2e8f0;background:rgba(255,255,255,0.05);' +
                    'border-radius:6px;padding:4px 10px;"><strong>' + ALL_FEATURE_LABELS[key] + ':</strong> ' + value + '</div>';
            }).join("") +
            '</div>';
    }

    // CREATE SVG TREE
    function renderDecisionTree(tree, technicalBreakdown, features) {
        closeInfoCard();
        currentTechnicalBreakdown = technicalBreakdown || null;
        renderSupplementaryPanel(tree, features);
        if (!svg)
            return;
        svg.innerHTML = "";

        if (!tree) {
            svg.setAttribute("width", TREE_WIDTH);
            svg.setAttribute("height", 0);
            return;
        }
        const layoutState = {
            maxY: 0
        };

        /*Collect every edge and every node first (without drawing anything yet), then draw all edges, THEN all nodes on top. SVG paints 
        purely in DOM order, so this guarantees a node square always fully covers the line segment underneath it - no more connector lines 
        visibly crossing through a box.*/

        const edgesToDraw = [];
        const nodesToDraw = [];
        collectLayout(tree, TREE_CENTER_X, 60, layoutState, true, null, null, edgesToDraw, nodesToDraw);

        edgesToDraw.forEach(
            e => createBranch(e.x1, e.y1, e.x2, e.y2, e.edge, e.taken)
        );

        nodesToDraw.forEach(
            n => createNode(n.node, n.x, n.y, n.reached, n.parentQuestion, n.incomingBranch)
        );

        svg.setAttribute("width", TREE_WIDTH);
        svg.setAttribute("height", layoutState.maxY + 90);
    }

    /*RECURSIVE LAYOUT WALK
    Computes where `node` sits at (x,y) and its two edges, WITHOUT drawing anything yet:
    - the TAKEN edge continues straight down the spine (recurses)
    - the OFF-PATH edge is recorded once, offset to the side, and is always a terminal leaf
    
    Positions are pushed into edgesOut / nodesOut so renderDecisionTree() can draw all edges first, then all nodes on top of them.*/
    function collectLayout(node, x, y, layoutState, reached, parentQuestion, incomingBranch, edgesOut, nodesOut) {
        if (!node)
            return;

        let nodeY = y;

        /* If this node is an aggregate feature (character_class_count /
        rule_pattern_present), the backend attaches a `breakdown` array of the
        real sub-features that compose it. Fan those out FIRST (spread wide,
        then converge back to a point), leading into this node - so the flow
        reads as "here's what this value is made of" -> "here's the model's
        actual decision using it", and visually looks like tree branches
        instead of fabricating new YES/NO model splits. */
        if (node.breakdown && node.breakdown.length > 0) {
            nodeY = collectBreakdownFan(node.breakdown, node.name, x, y, edgesOut, nodesOut, layoutState);
        }

        layoutState.maxY = Math.max(layoutState.maxY, nodeY);
        nodesOut.push({
            node,
            x,
            y: nodeY,
            reached,
            parentQuestion,
            incomingBranch
        });

        const edges = getRealChildEdges(node);

        if (!edges.length)
            return;
        const takenEdge =
            edges.find(edge => edge.taken);

        const offEdge = edges.find(edge => !edge.taken);
        const nextY = nodeY + LEVEL_HEIGHT;

        if (offEdge) {
            const offX = x + (offEdge.branch === "YES" ? -LEAF_OFFSET_X : LEAF_OFFSET_X);
            const offY = nodeY + (LEVEL_HEIGHT * LEAF_OFFSET_Y_RATIO);

            edgesOut.push({
                x1: x,
                y1: nodeY,
                x2: offX,
                y2: offY,
                edge: offEdge,
                taken: false
            });

            nodesOut.push({
                node: offEdge.node,
                x: offX,
                y: offY,
                reached: false,
                parentQuestion: node.name,
                incomingBranch: offEdge.branch
            });
            layoutState.maxY = Math.max(layoutState.maxY, offY);
        }

        if (takenEdge) {
            edgesOut.push({
                x1: x,
                y1: nodeY,
                x2: x,
                y2: nextY,
                edge: takenEdge,
                taken: true
            });
            collectLayout(takenEdge.node, x, nextY, layoutState, true, node.name, takenEdge.branch, edgesOut, nodesOut);
        }
    }

    /* Lays out the aggregate feature's sub-features as a FAN: a header label,
    then lines spreading out from (x, startY) to N horizontally-spaced item
    boxes, then lines converging back down to a single point directly below -
    which is where the real decision node gets drawn next. Returns that
    convergence Y. Purely additive/explanatory - draws no YES/NO branching,
    no off-path leaves, nothing that could be mistaken for a model decision. */
    function collectBreakdownFan(breakdownItems, aggregateLabel, x, startY, edgesOut, nodesOut, layoutState) {
        const n = breakdownItems.length;
        const itemY = startY + FAN_HEIGHT;
        const convergeY = itemY + FAN_HEIGHT;

        // Cosmetic floating label centered above the fan - no edge of its own.
        nodesOut.push({
            node: { type: "breakdown-header", name: `Composition of "${aggregateLabel}"` },
            x,
            y: startY + (FAN_HEIGHT / 2) - 8,
            reached: true,
            parentQuestion: null,
            incomingBranch: null
        });

        breakdownItems.forEach((item, i) => {
            const offset = (i - (n - 1) / 2) * FAN_SPACING;
            const itemX = x + offset;

            // Fan OUT: incoming point -> this sub-feature.
            edgesOut.push({
                x1: x,
                y1: startY,
                x2: itemX,
                y2: itemY,
                edge: { branch: item.present ? "✓" : "✗", explanation: item.explanation },
                taken: item.present
            });

            nodesOut.push({
                node: {
                    type: "breakdown-item",
                    name: item.label,
                    present: item.present,
                    explanationText: item.explanation
                },
                x: itemX,
                y: itemY,
                reached: true,
                parentQuestion: null,
                incomingBranch: item.present ? "✓" : "✗"
            });

            // Fan IN: this sub-feature -> converges back to center, below.
            edgesOut.push({
                x1: itemX,
                y1: itemY,
                x2: x,
                y2: convergeY,
                edge: { branch: "", explanation: item.explanation },
                taken: item.present
            });

            layoutState.maxY = Math.max(layoutState.maxY, itemY);
        });

        layoutState.maxY = Math.max(layoutState.maxY, convergeY);

        return convergeY;
    }

    /*CREATE ONE NODE (question or result) Rendered via foreignObject so the real text can wrap inside the square panel.*/
    function createNode(node, x, y, reached, parentQuestion, incomingBranch) {
        if (!node)
            return;

        if (node.type === "breakdown-header") {
            const label = document.createElementNS(SVG_NS, "text");
            label.setAttribute("x", x);
            label.setAttribute("y", y);
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("fill", "#8b93b0");
            label.setAttribute("font-size", "12");
            label.setAttribute("font-style", "italic");
            label.textContent = node.name;
            svg.appendChild(label);
            return;
        }

        const isResult = node.type === "result" || node.final === true;
        const isBreakdownItem = node.type === "breakdown-item";
        const foreignObject = document.createElementNS(SVG_NS, "foreignObject");
        const boxWidth = isBreakdownItem ? FAN_ITEM_WIDTH : NODE_WIDTH;
        const boxHeight = isBreakdownItem ? 44 : NODE_HEIGHT;
        foreignObject.setAttribute("x", x - (boxWidth / 2));
        foreignObject.setAttribute("y", y - (boxHeight / 2));
        foreignObject.setAttribute("width", boxWidth);
        foreignObject.setAttribute("height", boxHeight);
        const box = document.createElement("div");
        box.className = "dtc-node-box dtc-clickable " +
            (isResult ? "dtc-result-box" : isBreakdownItem ? "dtc-breakdown-box" : "dtc-question-box") +
            (isResult && !reached ? " dtc-off-path" : "") +
            (isBreakdownItem && !node.present ? " dtc-off-path" : "");

        if (isBreakdownItem) {
            // Inline styling since these are a new node type not covered by the
            // existing external stylesheet - keeps this self-contained.
            box.style.cssText =
                "display:flex;align-items:center;justify-content:center;" +
                "font-size:12px;font-weight:600;border-radius:8px;height:100%;text-align:center;padding:2px 4px;line-height:1.25;" +
                "background:" + (node.present ? "rgba(45,212,191,0.18)" : "rgba(148,163,184,0.10)") + ";" +
                "border:1px solid " + (node.present ? "rgba(45,212,191,0.6)" : "rgba(148,163,184,0.35)") + ";" +
                "color:" + (node.present ? "#5eead4" : "#94a3b8") + ";";
            const shortLabel = node.name.replace(/^Has /, "");
            box.textContent = `${node.present ? "✓" : "✗"} ${shortLabel}`;
        } else {
            box.textContent = isResult ? (node.result || node.name) : node.name;
        }

        box.dataset.x = x;
        box.dataset.y = y;

        box.addEventListener("click",
            (event) => {
                event.stopPropagation();
                toggleInfoCard(box, x,
                    buildNodePopup(node, isResult, reached, parentQuestion, incomingBranch)
                );
            }
        );
        foreignObject.appendChild(box);
        svg.appendChild(foreignObject);
    }

    // CREATE ONE BRANCH (YES / NO connector)
    function createBranch(x1, y1, x2, y2, edge, taken) {
        const group = document.createElementNS(SVG_NS, "g");
        group.classList.add("dtc-branch-group", "dtc-clickable");

        // wide invisible line = comfortable hit target
        const hitLine = document.createElementNS(SVG_NS, "line");
        hitLine.setAttribute("x1", x1);
        hitLine.setAttribute("y1", y1);
        hitLine.setAttribute("x2", x2);
        hitLine.setAttribute("y2", y2);
        hitLine.classList.add("dtc-branch-hit");
        group.appendChild(hitLine);

        // visible line
        const visibleLine = document.createElementNS(SVG_NS, "line");
        visibleLine.setAttribute("x1", x1);
        visibleLine.setAttribute("y1", y1);
        visibleLine.setAttribute("x2", x2);
        visibleLine.setAttribute("y2", y2);
        visibleLine.classList.add("dtc-branch-line");

        if (!taken) {
            visibleLine.classList.add("dtc-off-path");
        }
        group.appendChild(visibleLine);

        // YES / NO label at the midpoint
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const label = document.createElementNS(SVG_NS, "text");

        label.setAttribute("x", midX + (x2 === x1 ? 14 : 0));
        label.setAttribute("y", midY);
        label.classList.add("dtc-branch-label");

        label.textContent = edge.branch;
        group.appendChild(label);
        group.dataset.x = midX;
        group.dataset.y = midY;

        group.addEventListener("click",
            (event) => {
                event.stopPropagation();
                toggleInfoCard(group, midX, buildBranchPopup(edge));
            }
        );
        svg.appendChild(group);
    }

    /*POPUP CONTENT BUILDERS
    Return {title, paragraphs:[{label?, text}]} Content is always taken from backend data - nothing here fabricates a security explanation.*/
    function buildNodePopup(node, isResult, reached, parentQuestion, incomingBranch) {
        if (node.type === "breakdown-item") {
            return {
                title: `${node.name}: ${node.present ? "Present" : "Not Present"}`,
                paragraphs: [
                    {
                        text: node.explanationText || "No explanation was provided for this feature."
                    }
                ]
            };
        }

        if (!isResult) {
            const answer = node.decision;
            const explanationText = node.explanation && answer && node.explanation[answer]
                ?
                node.explanation[answer] : "No explanation was provided for this question.";

            return {
                title: node.name,
                paragraphs: [
                    {
                        text: explanationText
                    }
                ]
            };
        }

        // RESULT NODE
        if (reached) {
            const breakdown = currentTechnicalBreakdown;

            if (!breakdown) {
                return {
                    title: `Final Result: ${node.result || node.name}`,
                    paragraphs: [
                        {
                            text: "No further explanation was returned for this result."
                        }
                    ]
                };
            }
            return {
                title: `Final Result: ${node.result || node.name}`,
                paragraphs: [
                    {
                        label: "Why This Happened", text: breakdown.vulnerability_explanation
                    },
                    {
                        label: "Attack Vector", text: breakdown.attack_vector
                    },
                    {
                        label: "Recommended Fix", text: breakdown.remediation
                    }
                ]
            };
        }

        // OFF-PATH / HYPOTHETICAL RESULT LEAF
        return {
            title: `${node.result || node.name} (not reached)`,
            paragraphs: [
                {
                    text:
                        `Your password's actual answer to "${parentQuestion}" ` +
                        `was ${incomingBranch === "YES" ? "NO" : "YES"}, ` +
                        `so this outcome does not apply to your result. ` +
                        `It's shown so you can see what would have happened otherwise.`
                }
            ]
        };
    }

    function buildBranchPopup(edge) {
        return {
            title: `${edge.branch} connector`,
            paragraphs: [
                {
                    text: edge.explanation || "No explanation was provided for this branch."
                }
            ]
        };
    }
    // INFO CARD - OPEN / TOGGLE / CLOSE
    function toggleInfoCard(element, x, popupData) {
        if (activeElement === element) {
            closeInfoCard();
            return;
        }
        openInfoCard(element, x, popupData);
    }

    function openInfoCard(element, x, popupData) {
        if (!infoCard)
            return;

        if (activeElement) {
            activeElement.classList.remove("dtc-node-active", "dtc-branch-active");
        }
        activeElement = element;
        element.classList.add(
            element.classList.contains("dtc-branch-group") ? "dtc-branch-active" : "dtc-node-active"
        );
        populateInfoCard(popupData);

        /*Make it visible first so positionInfoCard() can measure its real width/height - this happens synchronously before the browser paints, 
        so there's no visible flash at the wrong spot.*/
        infoCard.classList.add("active");
        positionInfoCard(element, x);
    }

    function closeInfoCard() {
        if (activeElement) {
            activeElement.classList.remove("dtc-node-active", "dtc-branch-active");
        }
        activeElement = null;
        if (infoCard) {
            infoCard.classList.remove(
                "active"
            );
        }
    }
    function populateInfoCard(popupData) {
        if (!infoCardTitle || !infoCardBody)
            return;
        infoCardTitle.textContent = popupData.title || "Node Information";
        infoCardBody.innerHTML = "";

        popupData.paragraphs.forEach(
            paragraph => {
                const p = document.createElement("p");

                if (paragraph.label) {
                    const label =
                        document.createElement(
                            "span"
                        );

                    label.className = "dtc-info-section-label";
                    label.textContent = paragraph.label;
                    p.appendChild(label
                    );
                }
                p.appendChild(document.createTextNode(paragraph.text || ""));
                infoCardBody.appendChild(p);
            }
        );
    }

    /* POSITION INFO CARD
        Same side as the clicked node/connector - left half of the tree opens a card in a fixed LEFT column, right half opens a fixed RIGHT 
        column. The column position never changes between clicks on the same side; only the vertical position tracks the clicked element. 
        Never above, below, or centered, and never covers the tree itself.*/

    function positionInfoCard(element, x) {
        if (!infoCard || !card || !svg)
            return;
        const elementRect = element.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();

        /*Use the popup's real rendered size (it's already visible by the time this runs) instead of a guessed constant, so the 
        containment math below is accurate.*/
        const infoWidth = infoCard.offsetWidth || CARD_WIDTH;
        const infoHeight = infoCard.offsetHeight || CARD_ESTIMATED_HEIGHT;
        const onLeftHalf = x <= TREE_CENTER_X;

        /*FIXED COLUMN: anchored to the tree's own left/right edge (svgRect), not to the clicked element's exact position. Every card opened 
        from the left half lands at the exact same x every time; same for the right half. Only the vertical position moves, to track
        whichever node/connector was actually clicked.*/
        let left = onLeftHalf ? svgRect.left - CARD_GAP - infoWidth :
            svgRect.right + CARD_GAP;
        let top = elementRect.top + (elementRect.height / 2) - (infoHeight / 2);

        /*Strictly contain the popup within the visible bounds of .decision-traversal-card - it must never render over the dimmed 
        backdrop outside the card.*/
        const padding = 12;
        const minLeft = cardRect.left + padding;
        const maxLeft = cardRect.right - infoWidth - padding;
        const minTop = cardRect.top + padding;
        const maxTop = cardRect.bottom - infoHeight - padding;

        left = Math.min(
            Math.max(left, minLeft), Math.max(maxLeft, minLeft)
        );

        top = Math.min(
            Math.max(top, minTop), Math.max(maxTop, minTop)
        );

        infoCard.style.left = left + "px";
        infoCard.style.top = top + "px";
    }
    return {
        initializeDecisionTraversalCard, open: openCard, close: closeCard
    };
})();

// GLOBAL ACCESS
window.initializeDecisionTraversalCard = DecisionTraversalCard.initializeDecisionTraversalCard;
window.DecisionTraversalCard = DecisionTraversalCard;