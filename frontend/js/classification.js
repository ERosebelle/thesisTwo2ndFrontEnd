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
            ${getRiskLevel(previous.vulnerability)}
            <br>
            <strong>Current:</strong>
            ${getRiskLevel(current.vulnerability)}
        `;
    }

    if (summary) {
        summary.innerHTML = `
            <div class="summary-preview">
                <p>
                    <strong>Previous Password:</strong>
                    <br>
                    ${previous.security_assessment?.vulnerability_explanation || "No explanation available."}
                </p>
                <p>
                    <strong>Current Password:</strong>
                    <br>
                    ${current.security_assessment?.vulnerability_explanation || "No explanation available."}
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
        risk.textContent = getRiskLevel(data.vulnerability);
    }

    const assessment = data.security_assessment || {};

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

// RISK LEVEL
function getRiskLevel(vulnerability) {
    switch (vulnerability) {
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