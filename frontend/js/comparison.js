console.log("Comparison JS Connected");

function getComparisonElements() {
    return {
        emptyState: document.getElementById("comparisonEmptyState"),
        comparisonContent: document.getElementById("comparisonContent"),
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
    if (!previousData || !currentData) {
        updateComparisonEmptyState();
        return;
    }

    showComparisonResults();

    updateCurrentComparison(
        currentData
    );

    updatePreviousComparison(
        previousData
    );

    if (currentData.password_comparison) {
        updateComparisonStatus(
            currentData.password_comparison
        );
    }
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
            throw new Error(
                `Backend returned ${response.status}`
            );
        }

        const currentData =
            await response.json();

        if (!currentData) {
            updateComparisonEmptyState();
            return;
        }

        let previousData =
            typeof readCachedOriginalResult ===
                "function"
                ? readCachedOriginalResult(
                    previousPassword
                )
                : null;

        if (!previousData) {
            const previousResponse =
                await fetch(
                    "http://localhost:3000/analyze",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            password:
                                previousPassword
                        })
                    }
                );

            if (!previousResponse.ok) {
                throw new Error(
                    `Previous backend returned ${previousResponse.status}`
                );
            }

            previousData =
                await previousResponse.json();
        }

        if (!previousData) {
            updateComparisonEmptyState();
            return;
        }

        updateComparisonClassification(
            previousData,
            currentData
        );

    } catch (error) {
        console.error(
            "Comparison backend error:",
            error
        );

        updateComparisonEmptyState();
    }
}

function updateComparisonStatus(
    comparison
) {
    const { status } =
        getComparisonElements();

    if (!status || !comparison) {
        return;
    }

    const currentScore =
        comparison.current_score ??
        comparison.currentScore ??
        "--";

    const previousScore =
        comparison.previous_score ??
        comparison.previousScore ??
        "--";

    const comparisonStatus =
        String(
            comparison.status || ""
        ).toUpperCase();

    if (
        comparisonStatus ===
        "IDENTICAL"
    ) {
        status.innerHTML =
            "Your current password is identical to your previous password, so both passwords have the same security characteristics.";
        return;
    }

    if (
        comparisonStatus ===
        "CURRENT_PREFERRED"
    ) {
        status.innerHTML = `
            Your current password has stronger security characteristics
            than your previous password.
            <strong>${escapeComparisonHTML(
                currentScore
            )}</strong> current score vs
            <strong>${escapeComparisonHTML(
                previousScore
            )}</strong> previous score.
        `;
        return;
    }

    if (
        comparisonStatus ===
        "PREVIOUS_PREFERRED"
    ) {
        status.innerHTML = `
            Your previous password has stronger security characteristics
            than your current password.
            <strong>${escapeComparisonHTML(
                previousScore
            )}</strong> previous score vs
            <strong>${escapeComparisonHTML(
                currentScore
            )}</strong> current score.
        `;
        return;
    }

    if (
        comparisonStatus ===
        "SIMILAR"
    ) {
        status.innerHTML = `
            Your current and previous passwords have similar
            security characteristics.
            Both received a score of
            <strong>${escapeComparisonHTML(
                currentScore
            )}</strong>.
        `;
        return;
    }

    status.textContent =
        comparison.message ||
        "Comparison completed.";
}

function formatRisk(risk) {
    if (!risk) {
        return "UNKNOWN RISK";
    }

    const normalized =
        String(risk)
            .trim()
            .toUpperCase();

    if (
        normalized.includes("RISK")
    ) {
        return normalized;
    }

    return `${normalized} RISK`;
}

function getRiskClass(risk) {
    if (!risk) {
        return "risk-unknown";
    }

    const normalized =
        String(risk)
            .trim()
            .toLowerCase();

    if (
        normalized.includes("critical")
    ) {
        return "risk-critical";
    }

    if (
        normalized.includes("high")
    ) {
        return "risk-high";
    }

    if (
        normalized.includes("moderate") ||
        normalized.includes("medium")
    ) {
        return "risk-moderate";
    }

    if (
        normalized.includes("low")
    ) {
        return "risk-low";
    }

    return "risk-unknown";
}

function escapeComparisonHTML(value) {
    const element =
        document.createElement("div");

    element.textContent =
        String(value ?? "");

    return element.innerHTML;
}

async function initializeComparison() {
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

    const currentData =
        window.latestAnalysisData;

    let previousData =
        typeof readCachedOriginalResult ===
            "function"
            ? readCachedOriginalResult(
                previousPassword
            )
            : null;

    if (
        currentData &&
        previousData
    ) {
        updateComparisonClassification(
            previousData,
            currentData
        );

        return;
    }

    await loadComparisonFromBackend();
}

window.updateComparisonEmptyState =
    updateComparisonEmptyState;

window.showComparisonResults =
    showComparisonResults;

window.loadComparisonFromBackend =
    loadComparisonFromBackend;

window.updateComparisonClassification =
    updateComparisonClassification;

window.updateComparisonStatus =
    updateComparisonStatus;

window.initializeComparison =
    initializeComparison;