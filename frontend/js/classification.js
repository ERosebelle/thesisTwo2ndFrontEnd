console.log("Classification JS Connected");

function updateClassification(data) {
    if (!data) return;

    renderClassification(data);
}

function renderClassification(data) {
    const vulnerability = document.getElementById("VulnerabilityFound");
    const risk = document.getElementById("riskLevel");
    const score = document.getElementById("securityScore");
    const summary = document.getElementById("summaryText");

    if (vulnerability) {
        vulnerability.textContent = data.vulnerability || "-";
    }

    if (risk) {
        const riskClass = getRiskClass(data);

        risk.className = "risk-value";

        if (riskClass) {
            risk.classList.add(riskClass);
        }

        risk.textContent = getRiskLevel(data);
    }

    if (score) {
        score.textContent = getSecurityScore(data);
    }

    if (summary) {
        summary.innerHTML = `
            <p>${getClassificationSummary(data)}</p>
            ${getRiskExplanationHTML(data)}
        `;
    }
}

// Renders WHY the risk level is what it is - separate from the vulnerability
// classification rationale above. risk_assessment.summary (a full,
// feature-grounded narrative from the backend's explainRisk()) and its
// itemized contributing_factors are both shown here.
function getRiskExplanationHTML(data) {
    const riskAssessment = data?.risk_assessment;
    if (!riskAssessment || !riskAssessment.summary) {
        return "";
    }

    const factorsList = Array.isArray(riskAssessment.contributing_factors) && riskAssessment.contributing_factors.length > 0
        ? `<ul class="risk-factors-list">${riskAssessment.contributing_factors.map(f => `<li>${f}</li>`).join("")}</ul>`
        : "";

    return `
        <div class="risk-explanation">
            <p class="risk-explanation-label">Why this risk level:</p>
            <p>${riskAssessment.summary}</p>
            ${factorsList}
        </div>
    `;
}

function getRiskClass(data) {
    if (!data) {
        return "";
    }

    const risk =
        data.risk_level ||
        data.risk_assessment?.risk_level ||
        "";

    const normalized = String(risk)
        .trim()
        .toLowerCase();

    if (normalized.includes("critical")) {
        return "risk-critical";
    }

    if (normalized.includes("high")) {
        return "risk-high";
    }

    if (
        normalized.includes("moderate") ||
        normalized.includes("medium")
    ) {
        return "risk-moderate";
    }

    return "";
}

function getClassificationSummary(data) {
    if (!data) {
        return "No explanation available.";
    }

    const classificationExplanation =
        data.classification_explanation || {};

    return (
        classificationExplanation.classification_rationale ||
        data.security_assessment?.vulnerability_explanation ||
        "No explanation available."
    );
}

function getSecurityScore(data) {
    if (!data) {
        return "--";
    }

    return data.risk_assessment?.security_score ?? "--";
}

function getRiskLevel(data) {
    if (!data) {
        return "UNKNOWN";
    }

    const risk =
        data.risk_level ||
        data.risk_assessment?.risk_level ||
        "UNKNOWN";

    if (String(risk).trim().toUpperCase() === "UNKNOWN") {
        return "UNKNOWN";
    }

    return `${String(risk).trim().toUpperCase()} RISK`;
}

function getRiskExplanationHTML(data) {
    const riskAssessment = data?.risk_assessment;
    if (!riskAssessment || !riskAssessment.summary) {
        return "";
    }

    // TINANGGAL ANG factorsList DITO PARA HINDI LUMABAS ANG POINT DEDUCTIONS

    return `
        <div class="risk-explanation">
            <p class="risk-explanation-label">Why this risk level:</p>
            <p>${riskAssessment.summary}</p>
        </div>
    `;
}