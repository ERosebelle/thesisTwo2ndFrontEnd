console.log("Comparison JS Connected");

function getComparisonElements() {
    return {
        emptyState: document.getElementById("comparisonEmptyState"),
        comparisonContent: document.getElementById("comparisonContent"),

        summaryButton: document.getElementById("comparisonSummaryButton"),
        detailedButton: document.getElementById("comparisonDetailedButton"),

        summaryView: document.getElementById("comparisonSummaryView"),
        detailedView: document.getElementById("comparisonDetailedView"),
        summaryText: document.getElementById("comparisonSummaryText"),

        currentVulnerability: document.getElementById("comparisonCurrentVulnerability"),
        currentRisk: document.getElementById("comparisonCurrentRisk"),
        currentExplanation: document.getElementById("comparisonCurrentExplanation"),

        previousVulnerability: document.getElementById("comparisonPreviousVulnerability"),
        previousRisk: document.getElementById("comparisonPreviousRisk"),
        previousExplanation: document.getElementById("comparisonPreviousExplanation"),

        status: document.getElementById("comparisonStatusText")
    };
}

function updateComparisonEmptyState() {
    console.log("COMPARISON: Showing empty state");

    const {
        emptyState,
        comparisonContent
    } = getComparisonElements();

    if (emptyState) {
        emptyState.hidden = false;
        emptyState.style.display = "flex";
    }

    if (comparisonContent) {
        comparisonContent.hidden = true;
        comparisonContent.style.display = "none";
    }
}

function showComparisonResults() {
    console.log("COMPARISON: Showing comparison results");

    const {
        emptyState,
        comparisonContent
    } = getComparisonElements();

    if (emptyState) {
        emptyState.hidden = true;
        emptyState.style.display = "none";
    }

    if (comparisonContent) {
        comparisonContent.hidden = false;
        comparisonContent.style.display = "block";
    }

    showComparisonSummary();
}

function showComparisonSummary() {
    const {
        summaryButton,
        detailedButton,
        summaryView,
        detailedView
    } = getComparisonElements();

    console.log("COMPARISON: Switching to summary view");

    if (summaryView) {
        summaryView.hidden = false;
        summaryView.style.display = "block";
    }

    if (detailedView) {
        detailedView.hidden = true;
        detailedView.style.display = "none";
    }

    // Clicked button drops highlight (dark outline), unclicked gets highlight (blue fill)
    if (summaryButton) {
        summaryButton.classList.remove("highlighted");
    }

    if (detailedButton) {
        detailedButton.classList.add("highlighted");
    }
}

function showComparisonDetailed() {
    const {
        summaryButton,
        detailedButton,
        summaryView,
        detailedView
    } = getComparisonElements();

    console.log("COMPARISON: Switching to detailed view");

    if (summaryView) {
        summaryView.hidden = true;
        summaryView.style.display = "none";
    }

    if (detailedView) {
        detailedView.hidden = false;
        detailedView.style.display = "block";
    }

    // Clicked button drops highlight (dark outline), unclicked gets highlight (blue fill)
    if (summaryButton) {
        summaryButton.classList.add("highlighted");
    }

    if (detailedButton) {
        detailedButton.classList.remove("highlighted");
    }
}

function initializeComparisonTabs() {
    const {
        summaryButton,
        detailedButton
    } = getComparisonElements();

    console.log("COMPARISON: Initializing comparison tabs");

    if (summaryButton) {
        summaryButton.addEventListener(
            "click",
            showComparisonSummary
        );

        console.log("COMPARISON: Summary button connected");
    } else {
        console.warn("COMPARISON: Summary button not found");
    }

    if (detailedButton) {
        detailedButton.addEventListener(
            "click",
            showComparisonDetailed
        );

        console.log("COMPARISON: Detailed button connected");
    } else {
        console.warn("COMPARISON: Detailed button not found");
    }
}

function getVulnerability(data) {
    if (!data) {
        return "UNKNOWN";
    }

    return (
        data.vulnerability ||
        data.classification?.vulnerability ||
        data.security_assessment?.vulnerability ||
        data.classification_result?.vulnerability ||
        "UNKNOWN"
    );
}

function getRisk(data) {
    if (!data) {
        return "UNKNOWN";
    }

    return (
        data.risk_level ||
        data.risk ||
        data.security_assessment?.risk_level ||
        data.security_assessment?.risk ||
        data.classification?.risk_level ||
        "UNKNOWN"
    );
}

function getExplanation(data) {
    if (!data) {
        return "No explanation available.";
    }

    return (
        data.classification_explanation?.classification_rationale ||
        data.classification_explanation?.explanation ||
        data.security_assessment?.vulnerability_explanation ||
        data.security_assessment?.explanation ||
        data.classification?.explanation ||
        "No explanation available."
    );
}

function updateCurrentComparison(data) {
    const {
        currentVulnerability,
        currentRisk,
        currentExplanation
    } = getComparisonElements();

    if (currentVulnerability) {
        currentVulnerability.textContent =
            getVulnerability(data);
    }

    if (currentRisk) {
        currentRisk.className =
            "comparison-risk";

        const riskClass =
            getRiskClass(getRisk(data));

        if (riskClass) {
            currentRisk.classList.add(
                riskClass
            );
        }

        currentRisk.textContent =
            formatRisk(getRisk(data));
    }

    if (currentExplanation) {
        currentExplanation.innerHTML = `
            <p>${escapeComparisonHTML(
                getExplanation(data)
            )}</p>
        `;
    }
}

function updatePreviousComparison(data) {
    const {
        previousVulnerability,
        previousRisk,
        previousExplanation
    } = getComparisonElements();

    if (previousVulnerability) {
        previousVulnerability.textContent =
            getVulnerability(data);
    }

    if (previousRisk) {
        previousRisk.className =
            "comparison-risk";

        const riskClass =
            getRiskClass(getRisk(data));

        if (riskClass) {
            previousRisk.classList.add(
                riskClass
            );
        }

        previousRisk.textContent =
            formatRisk(getRisk(data));
    }

    if (previousExplanation) {
        previousExplanation.innerHTML = `
            <p>${escapeComparisonHTML(
                getExplanation(data)
            )}</p>
        `;
    }
}

function updateComparisonClassification(
    previousData,
    currentData
) {
    console.log("COMPARISON: updateComparisonClassification() called");

    if (!previousData || !currentData) {
        updateComparisonEmptyState();
        return;
    }

    showComparisonResults();

    updateCurrentComparison(currentData);
    updatePreviousComparison(previousData);

    if (currentData.password_comparison) {
        updateComparisonStatus(currentData.password_comparison);
        updateComparisonSummary(currentData.password_comparison);
    } else {
        updateComparisonSummary({
            status: "",
            message: ""
        });
    }
}

function updateComparisonSummary(comparison) {
    const {
        summaryText
    } = getComparisonElements();

    if (!summaryText) {
        return;
    }

    const status =
        String(comparison?.status || "").trim().toUpperCase();

    let summary =
        "The current password has been compared with the previous password to evaluate their security characteristics.";

    if (status === "CURRENT_PREFERRED") {
        summary =
            "Your current password is favorable than your previous password based on its overall security characteristics.";
    } else if (status === "PREVIOUS_PREFERRED") {
        summary =
            "Your previous password is favorable than your current password based on its overall security characteristics.";
    } else if (status === "IDENTICAL") {
        summary =
            "Your current password is identical to your previous password and provides the same security characteristics.";
    } else if (
        status === "SIMILAR" ||
        status === "SIMILARITY" ||
        status === "SIMILAR_PASSWORD"
    ) {
        summary =
            "Your current and previous passwords have similar security characteristics.";
    }

    summaryText.textContent = summary;
}

async function loadComparisonFromBackend() {
    const currentPassword =
        localStorage.getItem("currentPassword") ||
        localStorage.getItem("analyzedPassword");

    const previousPassword =
        localStorage.getItem("previousPassword");

    if (!currentPassword || !previousPassword) {
        updateComparisonEmptyState();
        return;
    }

    try {
        const response = await fetch(
            "http://localhost:3000/analyze",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    password: currentPassword,
                    previousPassword: previousPassword
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const currentData = await response.json();

        if (!currentData) {
            updateComparisonEmptyState();
            return;
        }

        let previousData =
            typeof readCachedOriginalResult === "function"
                ? readCachedOriginalResult(previousPassword)
                : null;

        if (!previousData) {
            const previousResponse = await fetch(
                "http://localhost:3000/analyze",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        password: previousPassword
                    })
                }
            );

            if (!previousResponse.ok) {
                throw new Error(`Previous backend returned ${previousResponse.status}`);
            }

            previousData = await previousResponse.json();
        }

        if (!previousData) {
            updateComparisonEmptyState();
            return;
        }

        updateComparisonClassification(previousData, currentData);

    } catch (error) {
        console.error("Comparison backend error:", error);
        updateComparisonEmptyState();
    }
}

function updateComparisonStatus(comparison) {
    const { status } = getComparisonElements();

    if (!status || !comparison) {
        return;
    }

    const comparisonStatus = String(comparison.status || "").toUpperCase();

    if (comparisonStatus === "IDENTICAL") {
        status.textContent =
            "Your current password is identical to your previous password, so both passwords have the same security characteristics.";
        return;
    }

    if (comparisonStatus === "CURRENT_PREFERRED") {
        status.textContent =
            "Your current password has stronger security characteristics than your previous password.";
        return;
    }

    if (comparisonStatus === "PREVIOUS_PREFERRED") {
        status.textContent =
            "Your previous password has stronger security characteristics than your current password.";
        return;
    }

    if (comparisonStatus === "SIMILAR") {
        status.textContent =
            "Your current and previous passwords have similar security characteristics.";
        return;
    }

    status.textContent = comparison.message || "Comparison completed.";
}

function formatRisk(risk) {
    if (!risk) {
        return "UNKNOWN RISK";
    }

    const normalized = String(risk).trim().toUpperCase();

    if (normalized.includes("RISK")) {
        return normalized;
    }

    return `${normalized} RISK`;
}

function getRiskClass(risk) {
    if (!risk) {
        return "risk-unknown";
    }

    const normalized = String(risk).trim().toLowerCase();

    if (normalized.includes("critical")) {
        return "risk-critical";
    }

    if (normalized.includes("high")) {
        return "risk-high";
    }

    if (normalized.includes("moderate") || normalized.includes("medium")) {
        return "risk-moderate";
    }

    if (normalized.includes("low")) {
        return "risk-low";
    }

    return "risk-unknown";
}

function escapeComparisonHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

async function initializeComparison() {
    console.log("COMPARISON: Initialization started");

    initializeComparisonTabs();

    if (
        window.comparisonAnalysisData &&
        window.comparisonAnalysisData.previous &&
        window.comparisonAnalysisData.current
    ) {
        updateComparisonClassification(
            window.comparisonAnalysisData.previous,
            window.comparisonAnalysisData.current
        );
        return;
    }

    const currentPassword =
        localStorage.getItem("currentPassword") ||
        localStorage.getItem("analyzedPassword");

    const previousPassword =
        localStorage.getItem("previousPassword");

    if (!currentPassword || !previousPassword) {
        updateComparisonEmptyState();
        return;
    }

    const currentData = window.latestAnalysisData;

    let previousData =
        typeof readCachedOriginalResult === "function"
            ? readCachedOriginalResult(previousPassword)
            : null;

    if (currentData && previousData) {
        updateComparisonClassification(previousData, currentData);
        return;
    }

    await loadComparisonFromBackend();
}

window.updateComparisonEmptyState = updateComparisonEmptyState;
window.showComparisonResults = showComparisonResults;
window.showComparisonSummary = showComparisonSummary;
window.showComparisonDetailed = showComparisonDetailed;
window.loadComparisonFromBackend = loadComparisonFromBackend;
window.updateComparisonClassification = updateComparisonClassification;
window.updateComparisonStatus = updateComparisonStatus;
window.updateComparisonSummary = updateComparisonSummary;
window.initializeComparison = initializeComparison;