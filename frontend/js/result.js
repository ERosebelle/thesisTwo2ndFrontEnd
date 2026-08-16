// BACKEND ANALYSIS CONNECTION
async function analyzePassword(password, previousPassword) {
    try {
        const response = await fetch("http://localhost:3000/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                password: password,
                ...(previousPassword ? { previousPassword } : {})
            })
        });

        if (!response.ok) {
            throw new Error("Backend request failed");
        }

        const data = await response.json();
        console.log("BACKEND RESPONSE:", data);
        return data;
    } catch (error) {
        console.error("Backend connection error:", error);
        throw error;
    }
}

// REUSE STORED RESULT FROM initialTest.js / comparisonTest.js
function readStoredAnalysisResult() {
    const stored = sessionStorage.getItem("analysisResult");
    if (!stored) {
        return null;
    }

    try {
        return JSON.parse(stored);
    } catch (error) {
        console.error("Stored analysis result was invalid JSON:", error);
        return null;
    }
}

/* CACHE THE "ORIGINAL" (BASELINE) PASSWORD'S RESULT */
function cacheOriginalResult(password, data) {
    localStorage.setItem("originalAnalysisResult", JSON.stringify({ password, data }));
}

function readCachedOriginalResult(password) {
    const stored = localStorage.getItem("originalAnalysisResult");
    if (!stored) {
        return null;
    }

    try {
        const parsed = JSON.parse(stored);
        return parsed.password === password ? parsed.data : null;
    } catch (error) {
        console.error("Cached original result was invalid JSON:", error);
        return null;
    }
}

// PREVENT RELOAD / BACK BUTTON / DIRECT ACCESS
(function guardResultPageAccess() {
    const navEntries = performance.getEntriesByType("navigation");
    const navType = navEntries.length > 0 ? navEntries[0].type : null;
    const hasAnalyzedPassword = localStorage.getItem("analyzedPassword");

    if (navType === "reload" || navType === "back_forward" || !hasAnalyzedPassword) {
        window.location.replace("initialTest.html");
    }
})();

window.addEventListener("pageshow", function(event) {
    if (event.persisted) {
        window.location.replace("initialTest.html");
    }
});

window.addEventListener("unload", function() {
    localStorage.removeItem("previousPassword");
    localStorage.removeItem("currentPassword");
});

// LOAD COMPONENT HTML
async function loadComponents() {
    try {
        const classificationResponse = await fetch("./components/classification.html");
        const classification = await classificationResponse.text();

        const decisionResponse = await fetch("./components/decisionTree.html");
        const decisionTreeComponent = await decisionResponse.text();

        const recommendationResponse = await fetch("./components/recommendation.html");
        const recommendation = await recommendationResponse.text();

        const featureResponse = await fetch("./components/featureVector.html");
        const featureVector = await featureResponse.text();

        const decisionTraversalCardResponse = await fetch("./components/decisionTraversalCard.html");
        const decisionTraversalCard = await decisionTraversalCardResponse.text();

        const summaryCardResponse = await fetch("./components/summaryCard.html");
        const summaryCard = await summaryCardResponse.text();

        const recommendationSection = document.getElementById("recommendationSection");
        const featureSection = document.getElementById("featureSection");
        const classificationSection = document.getElementById("classificationSection");
        const decisionSection = document.getElementById("decisionSection");

        if (classificationSection) {
            classificationSection.innerHTML = classification;
        }
        if (decisionSection) {
            decisionSection.innerHTML = decisionTreeComponent;
        }
        if (recommendationSection) {
            recommendationSection.innerHTML = recommendation;
        }
        if (featureSection) {
            featureSection.innerHTML = featureVector;
        }

        const decisionTraversalCardRoot = document.getElementById("decisionTraversalCardRoot");
        if (decisionTraversalCardRoot) {
            decisionTraversalCardRoot.innerHTML = decisionTraversalCard;
        }

        const summaryCardRoot = document.getElementById("summaryCardRoot");
        if (summaryCardRoot) {
            summaryCardRoot.innerHTML = summaryCard;
        }

        console.log("Components loaded");

        if (typeof initializeFeatureVector === "function") {
            initializeFeatureVector();
        }
        if (typeof initializeDecisionTraversalCard === "function") {
            initializeDecisionTraversalCard();
        }
        if (typeof SummaryCard !== "undefined") {
            SummaryCard.initialize();
        }
    } catch (error) {
        console.error("Component loading error:", error);
    }
}

document.addEventListener("decisionTree:hologramClicked", () => {
    if (typeof DecisionTraversalCard !== "undefined" && typeof DecisionTraversalCard.open === "function") {
        DecisionTraversalCard.open(window.latestAnalysisData);
    }
});

loadComponents().then(() => {
    console.log("Decision component ready");
    if (typeof initializeDecisionTree === "function") {
        initializeDecisionTree();
    }
    fetchAnalysisResult();
    initializePasswordPreview();
});

// TAB CONTROLLER
const tabs = document.querySelectorAll(".menu-btn");

const sections = {
    decision: document.getElementById("decisionSection"),
    recommendation: document.getElementById("recommendationSection"),
    features: document.getElementById("featureSection")
};

tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        const selected = tab.dataset.section;

        tabs.forEach(button => {
            button.classList.remove("active");
        });

        tab.classList.add("active");

        Object.values(sections).forEach(section => {
            if (section) {
                section.style.display = "none";
            }
        });

        if (sections[selected]) {
            sections[selected].style.display = "block";
        }
    });
});

// DEFAULT TAB
if (sections.decision) {
    sections.decision.style.display = "block";
}
if (sections.recommendation) {
    sections.recommendation.style.display = "none";
}
if (sections.features) {
    sections.features.style.display = "none";
}

// BUTTON INFORMATION POPUP
const buttonInfo = document.getElementById("buttonInfo");
const buttonInfoTitle = document.getElementById("buttonInfoTitle");
const buttonInfoText = document.getElementById("buttonInfoText");
const resetButton = document.getElementById("resetButton");
const compareButton = document.getElementById("compareButton");

const buttonDescriptions = {
    reset: {
        title: "Reset Password Analysis",
        text: "Returns to the Initial Test page where you can start a new password vulnerability assessment."
    },
    compare: {
        title: "Compare New Password",
        text: "Allows you to enter another password and compare its vulnerability against the previous analysis result."
    }
};

function showButtonInfo(type, button) {
    if (!buttonInfo || !button) {
        return;
    }

    const data = buttonDescriptions[type];

    if (data) {
        buttonInfoTitle.textContent = data.title;
        buttonInfoText.textContent = data.text;
    }

    const rect = button.getBoundingClientRect();

    buttonInfo.style.left = (rect.left + rect.width / 2) + "px";
    buttonInfo.style.top = (rect.top - buttonInfo.offsetHeight - 15) + "px";
    buttonInfo.style.transform = "translateX(-50%)";
    buttonInfo.classList.add("show");
}

function hideButtonInfo() {
    if (buttonInfo) {
        buttonInfo.classList.remove("show");
    }
}

// BUTTON EVENTS
if (resetButton) {
    resetButton.addEventListener("mouseenter", () => showButtonInfo("reset", resetButton));
    resetButton.addEventListener("mouseleave", hideButtonInfo);

    resetButton.addEventListener("click", () => {
        localStorage.removeItem("analyzedPassword");
        localStorage.removeItem("previousPassword");
        localStorage.removeItem("currentPassword");
        localStorage.removeItem("originalAnalysisResult");
        sessionStorage.removeItem("analysisResult");
        window.location.href = "initialTest.html";
    });
}

if (compareButton) {
    compareButton.addEventListener("mouseenter", () => showButtonInfo("compare", compareButton));
    compareButton.addEventListener("mouseleave", hideButtonInfo);

    compareButton.addEventListener("click", () => {
        window.location.href = "comparisonTest.html";
    });
}

const analyzedPassword = localStorage.getItem("analyzedPassword");
const comparisonPassword = localStorage.getItem("comparisonPassword");

async function fetchAnalysisResult() {
    try {
        // COMPARISON MODE
        if (analyzedPassword && comparisonPassword) {
            console.log("Comparison Mode");

            localStorage.setItem("previousPassword", analyzedPassword);
            localStorage.setItem("currentPassword", comparisonPassword);

            const comparisonResult = readStoredAnalysisResult() ?? await analyzePassword(comparisonPassword, analyzedPassword);
            const originalResult = readCachedOriginalResult(analyzedPassword) ?? await analyzePassword(analyzedPassword);

            console.log("Original:", originalResult);
            console.log("Comparison:", comparisonResult);

            window.latestAnalysisData = comparisonResult;

            if (typeof updateComparisonClassification === "function") {
                updateComparisonClassification(originalResult, comparisonResult);
            }

            if (typeof updateDecisionTree === "function") {
                updateDecisionTree(comparisonResult);
            }

            if (typeof updateFeatureVector === "function") {
                updateFeatureVector(comparisonResult);
            }

            if (typeof updateRecommendation === "function") {
                updateRecommendation(comparisonResult, comparisonPassword);
            }

            localStorage.setItem("analyzedPassword", comparisonPassword);
            localStorage.removeItem("comparisonPassword");
            sessionStorage.removeItem("analysisResult");

            cacheOriginalResult(comparisonPassword, comparisonResult);

            return;
        }

        // NORMAL MODE
        if (!analyzedPassword) {
            console.log("No password found");
            return;
        }

        const data = readStoredAnalysisResult() ?? await analyzePassword(analyzedPassword);
        sessionStorage.removeItem("analysisResult");
        console.log("BACKEND RESPONSE:", data);

        cacheOriginalResult(analyzedPassword, data);

        if (typeof updateClassification === "function") {
            updateClassification(data);
        }

        window.latestAnalysisData = data;

        if (typeof updateDecisionTree === "function") {
            updateDecisionTree(data);
        }

        if (typeof updateFeatureVector === "function") {
            updateFeatureVector(data);
        }

        if (typeof updateRecommendation === "function") {
            updateRecommendation(data, analyzedPassword);
        }

    } catch (error) {
        console.error("API ERROR:", error);
    }
}

// PASSWORD PREVIEW DISPLAY (UPDATED: ONLY REVEALS TESTED PASSWORD)
function initializePasswordPreview() {
    const testedPassword = localStorage.getItem("currentPassword") || localStorage.getItem("analyzedPassword") || "";

    console.log("PASSWORD PREVIEW DATA", {
        testedPassword,
        analyzedPassword: localStorage.getItem("analyzedPassword"),
        comparisonPassword: localStorage.getItem("comparisonPassword")
    });

    if (testedPassword) {
        createPasswordReveal("testedPassword", testedPassword);
    }
}

// CLICK TO REVEAL PASSWORD
function createPasswordReveal(elementID, password) {
    const element = document.getElementById(elementID);
    if (!element || !password) return;

    // Mask with fixed dynamic asterisks
    const masked = "*".repeat(Math.min(password.length, 13));
    let revealed = false;

    element.textContent = masked;
    element.classList.remove("revealed");

    element.onclick = function() {
        revealed = !revealed;

        if (revealed) {
            element.textContent = password;
            element.classList.add("revealed");
            element.scrollLeft = 0;
        } else {
            element.textContent = masked;
            element.classList.remove("revealed");
            element.scrollLeft = 0;
        }
    };
}