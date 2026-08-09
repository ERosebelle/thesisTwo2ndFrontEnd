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
// Returns the parsed result, or null if nothing usable is stored.
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

/* CACHE THE "ORIGINAL" (BASELINE) PASSWORD'S RESULT
Survives navigation to comparisonTest.js and back, so the baseline
password in a comparison round never needs a second /analyze call
just because its own sessionStorage slot got overwritten by the
newer (comparison) password's fetch. */
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

/*Catches browser back/forward-cache (bfcache) restores that do not re-run scripts and therefore 
would not becaught by the navigation-type check above.*/
window.addEventListener("pageshow", function(event) {
    if (event.persisted) {
        window.location.replace("initialTest.html");
    }
});

/*Opts this page out of the browser's back/forward cache (bfcache).
Without this, browsers may instantly repaint a cached snapshot ofthis page on back/forward navigation
*before* any JS runs, causing a brief flash of stale content before the guard above can redirect.*/
window.addEventListener("unload", function() {
    // Delete the previous and current password when the tab is closed or page is unloaded
    localStorage.removeItem("previousPassword");
    localStorage.removeItem("currentPassword");
});
// LOAD COMPONENT HTML
async function loadComponents() {
    try {
        // CLASSIFICATION COMPONENT
        const classificationResponse = await fetch("./components/classification.html");
        const classification = await classificationResponse.text();

        // DECISION TREE COMPONENT
        const decisionResponse = await fetch("./components/decisionTree.html");
        const decisionTreeComponent = await decisionResponse.text();

        // RECOMMENDATION COMPONENT
        const recommendationResponse = await fetch("./components/recommendation.html");
        const recommendation = await recommendationResponse.text();

        // FEATURE VECTOR COMPONENT
        const featureResponse = await fetch("./components/featureVector.html");
        const featureVector = await featureResponse.text();

        /*DECISION TRAVERSAL CARD COMPONENT
        Independent Result-page overlay - NOT part of the
        Deci/Reco/Vecs component set, loaded separately into
        its own body-level mount point below.*/
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

        /*The traversal card mounts at body level (outside the Deci/Reco/Vecs layout), 
        not inside any of the three result-section containers above.*/
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

/*DECISION TRAVERSAL CARD TRIGGER
Decision Tree only notifies that its hologram was clicked
("decisionTree:hologramClicked"). Result.js, as the page-level
owner/controller, decides what that means - opening the
independent Decision Traversal Card with the latest backend
analysis data.*/

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

            /* comparisonTest.js already fetched this password (with
            previousPassword attached, so password_comparison is included)
            and stored it in sessionStorage - reuse it instead of calling
            /analyze again. */
            const comparisonResult = readStoredAnalysisResult() ?? await analyzePassword(comparisonPassword, analyzedPassword);

            /* The original password's result is normally cached from
            its own earlier normal-mode view (see below) - reuse it
            instead of calling /analyze a second time for the same
            password. Only fetch if it's genuinely not cached (e.g.
            direct navigation edge cases). */
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

            // ✅ IPASA ANG BAGON (COMPARISON) RESULT SA FEATURE VECTOR!
            if (typeof updateFeatureVector === "function") {
                updateFeatureVector(comparisonResult);
            }

            // comparisonResult already carries password_comparison
            // (previousPassword was sent above), so no separate
            // /analyze call is needed for the recommendation panel.
            if (typeof updateRecommendation === "function") {
                updateRecommendation(comparisonResult, comparisonPassword);
            }

            localStorage.setItem("analyzedPassword", comparisonPassword);
            localStorage.removeItem("comparisonPassword");
            sessionStorage.removeItem("analysisResult");

            // The current password becomes the baseline for any
            // future comparison round - cache its result now.
            cacheOriginalResult(comparisonPassword, comparisonResult);

            return;
        }

        // NORMAL MODE
        if (!analyzedPassword) {
            console.log("No password found");
            return;
        }

        /* initialTest.js already fetched this password and stored it
        in sessionStorage - reuse it instead of calling /analyze again. */
        const data = readStoredAnalysisResult() ?? await analyzePassword(analyzedPassword);
        sessionStorage.removeItem("analysisResult");
        console.log("BACKEND RESPONSE:", data);

        // Cache this as the baseline in case the user compares
        // against another password next.
        cacheOriginalResult(analyzedPassword, data);

        // UPDATE CLASSIFICATION PANEL
        if (typeof updateClassification === "function") {
            updateClassification(data);
        }

        window.latestAnalysisData = data;

        if (typeof updateDecisionTree === "function") {
            updateDecisionTree(data);
        }

        // ✅ IPASA ANG DATA SA FEATURE VECTOR (NORMAL MODE)!
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

// PASSWORD PREVIEW DISPLAY
function initializePasswordPreview() {
    const previousPassword = localStorage.getItem("previousPassword") || "";
    const testedPassword = localStorage.getItem("currentPassword") || localStorage.getItem("analyzedPassword") || "";

    console.log("PASSWORD PREVIEW DATA", {
        previousPassword,
        testedPassword,
        analyzedPassword: localStorage.getItem("analyzedPassword"),
        comparisonPassword: localStorage.getItem("comparisonPassword")
    });

    const previousContainer = document.getElementById("previousPasswordContainer");
    const previousLabel = document.querySelector(".previous-password-entry");

    // NORMAL MODE, ONLY ONE PASSWORD
    if (!previousPassword) {
        createPasswordReveal("testedPassword", testedPassword);
        return;
    }

    // COMPARISON MODE PREVIOUS + CURRENT
    if (previousContainer) {
        previousContainer.style.display = "block";
    }

    createPasswordReveal("previousPassword", previousPassword);
    createPasswordReveal("testedPassword", testedPassword);

    if (previousLabel) {
        const label = previousLabel.querySelector(".password-label");
        if (label) {
            label.textContent = "Previous Password";
        }
    }
}


// HOLD TO REVEAL PASSWORD
function createPasswordReveal(elementID, password) {
    const element = document.getElementById(elementID);
    if (!element || !password) return;

    // Show only up to 7 asterisks when hidden
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