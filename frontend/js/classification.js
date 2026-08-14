// CLASSIFICATION PANEL
// classification.js

console.log("Classification JS Connected");

// NORMAL MODE CLASSIFICATION
function updateClassification(data) {
    if (!data) {
        console.log("No classification data received");
        return;
    }
    renderClassification(data);
}

// COMPARISON MODE CLASSIFICATION
function updateComparisonClassification(previous, current) {
    if (!previous || !current) {
        console.log("Missing comparison data");
        return;
    }

    const vulnerability = document.getElementById("VulnerabilityFound");
    const risk = document.getElementById("riskLevel");
    const summary = document.getElementById("summaryText");

    if (vulnerability) {
        vulnerability.innerHTML = `
            <strong>Previous:</strong>
            ${previous.vulnerability || "-"}
            <br>
            <strong>Current:</strong>
            ${current.vulnerability || "-"}
        `;
    }

    if (risk) {
        risk.innerHTML = `
            <strong>Previous:</strong>
            ${getRiskLevel(previous)}
            <br>
            <strong>Current:</strong>
            ${getRiskLevel(current)}
        `;
    }

    if (summary) {
        summary.innerHTML = `
            <div class="summary-preview">
                <p>
                    <strong>Previous Password:</strong>
                    <br>
                    ${previous.security_assessment?.vulnerability_explanation || "No explanation available."}
                    <br>
                    ${previous.risk_assessment?.summary || ""}
                </p>
                <p>
                    <strong>Current Password:</strong>
                    <br>
                    ${current.security_assessment?.vulnerability_explanation || "No explanation available."}
                    <br>
                    ${current.risk_assessment?.summary || ""}
                </p>
            </div>
        `;
    }
}

// NORMAL RENDER FUNCTION
function renderClassification(data) {
    const vulnerability = document.getElementById("VulnerabilityFound");
    const risk = document.getElementById("riskLevel");
    const summary = document.getElementById("summaryText");

    if (vulnerability) {
        vulnerability.textContent = data.vulnerability || "-";
    }

    if (risk) {
        risk.textContent = getRiskLevel(data);
    }

    const assessment = data.security_assessment || {};
    const riskAssessment = data.risk_assessment || {};

    if (summary) {
        summary.innerHTML = `
            <div class="summary-preview">
                <p>
                    ${assessment.vulnerability_explanation || "No explanation available."}
                </p>
                <p>
                    <strong>Attack Vector:</strong>
                    <br>
                    ${assessment.attack_vector || "No attack information available."}
                </p>
                <p>
                    <strong>Risk Assessment:</strong>
                    <br>
                    ${riskAssessment.summary || "No risk assessment available."}
                </p>
                ${riskAssessment.contributing_factors && riskAssessment.contributing_factors.length > 0 ? `
                <p>
                    <strong>Contributing Factors:</strong>
                    <ul>
                        ${riskAssessment.contributing_factors.map(f => `<li>${f}</li>`).join("")}
                    </ul>
                </p>
                ` : ""}
            </div>
        `;
    }
}

// SUMMARY CARD
const summaryBox = document.getElementById("summaryBox");

if (summaryBox) {
    summaryBox.style.cursor = "pointer";
    summaryBox.addEventListener("click", () => {
        if (window.SummaryCard && typeof window.SummaryCard.open === "function") {
            window.SummaryCard.open(
                document.getElementById("summaryText").innerHTML
            );
        }
    });
}

document.addEventListener("click", function (event) {
    if (event.target.closest("#summaryBox")) {
        if (window.SummaryCard && typeof window.SummaryCard.open === "function") {
            window.SummaryCard.open(
                document.getElementById("summaryText").innerHTML
            );
        }
    }
});

if (window.SummaryCard && typeof window.SummaryCard.open === "function") {
    window.SummaryCard.open(summary.innerHTML);
}

/* RISK LEVEL
Now reads the risk_level predicted by the backend's separate, trained risk classifier (risk_model.json) instead of a hardcoded vulnerability -> risk
lookup table. Falls back to the old lookup only if a response somehow lacks risk_level (e.g. risk_model.json wasn't generated yet on the backend). */
function getRiskLevel(data) {
    if (data && data.risk_level && data.risk_level !== "UNKNOWN") {
        return `${data.risk_level} RISK`;
    }

    // Fallback for responses without a risk_level (legacy/backend not yet updated)
    switch (data && data.vulnerability) {
        case "DICTIONARY":
            return "CRITICAL RISK";
        case "RULE-BASED":
            return "HIGH RISK";
        case "BRUTE-FORCE":
            return "MODERATE RISK";
        default:
            return "UNKNOWN";
    }
}