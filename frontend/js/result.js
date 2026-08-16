async function analyzePassword(password, previousPassword) {

    const response =
        await fetch(
            "http://localhost:3000/analyze",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    password,
                    ...(previousPassword
                        ? { previousPassword }
                        : {})
                })
            }
        );

    if (!response.ok) {
        throw new Error(
            "Backend request failed"
        );
    }

    return response.json();
}

function getResultSource() {

    const storedSource =
        sessionStorage.getItem(
            "resultSource"
        );

    if (storedSource) {
        return storedSource;
    }

    const source =
        localStorage.getItem(
            "comparisonPassword"
        )
            ? "comTest"
            : "ini";

    sessionStorage.setItem(
        "resultSource",
        source
    );

    return source;
}

function readStoredAnalysisResult() {

    const stored =
        sessionStorage.getItem(
            "analysisResult"
        );

    if (!stored) {
        return null;
    }

    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

function cacheOriginalResult(
    password,
    data
) {

    localStorage.setItem(
        "originalAnalysisResult",
        JSON.stringify({
            password,
            data
        })
    );
}

function readCachedOriginalResult(
    password
) {

    const stored =
        localStorage.getItem(
            "originalAnalysisResult"
        );

    if (!stored) {
        return null;
    }

    try {

        const result =
            JSON.parse(stored);

        return result.password === password
            ? result.data
            : null;

    } catch {
        return null;
    }
}

function guardResultPageAccess() {

    const navigation =
        performance.getEntriesByType(
            "navigation"
        )[0];

    const analyzedPassword =
        localStorage.getItem(
            "analyzedPassword"
        );

    if (
        navigation?.type === "reload" ||
        navigation?.type === "back_forward" ||
        !analyzedPassword
    ) {

        window.location.replace(
            "initialTest.html"
        );
    }
}

async function loadComponents() {

    const componentMap = {

        summarySection:
            "classification.html",

        decisionTreeSection:
            "decisionTree.html",

        recommendationSection:
            "recommendation.html",

        featureVectorSection:
            "featureVector.html",

        comparisonSection:
            "comparison.html"
    };

    for (
        const [sectionId, fileName]
        of Object.entries(componentMap)
    ) {

        const section =
            document.getElementById(
                sectionId
            );

        if (!section) {
            continue;
        }

        try {

            const response =
                await fetch(
                    `./components/${fileName}`
                );

            if (!response.ok) {

                throw new Error(
                    `Failed to load ${fileName}`
                );
            }

            section.innerHTML =
                await response.text();

        } catch (error) {

            console.error(
                `Component error (${fileName}):`,
                error
            );
        }
    }

    if (
        typeof initializeFeatureVector ===
        "function"
    ) {

        initializeFeatureVector();
    }

    if (
        typeof SummaryCard !==
            "undefined" &&
        typeof SummaryCard.initialize ===
            "function"
    ) {

        SummaryCard.initialize();
    }
}

function initializeDecisionTreeEvents() {

    document.addEventListener(
        "decisionTree:hologramClicked",
        () => {

            console.log(
                "[Result] Decision Tree hologram clicked"
            );

            openDecisionTraversalCard();
        }
    );
}

function openDecisionTraversalCard() {

    console.log(
        "[Result] Opening Decision Traversal Card"
    );

    const card =
        window.DecisionTraversalCard;

    if (
        !card ||
        typeof card.open !== "function"
    ) {

        console.error(
            "[Result] DecisionTraversalCard unavailable"
        );

        return;
    }

    card.open();
}

function initializeSidebar() {

    const sidebar =
        document.querySelector(
            ".sidebar"
        );

    if (!sidebar) {
        return;
    }

    const tutorialButton =
        document.getElementById(
            "tutorialButton"
        );

    const tabs =
        Array.from(
            sidebar.querySelectorAll(
                ".sidebar-item[data-section]"
            )
        );

    const sections =
        Array.from(
            document.querySelectorAll(
                ".result-section"
            )
        );

    if (
        !tabs.length ||
        !sections.length
    ) {

        return;
    }

    function showSection(index) {

        tabs.forEach(tab => {

            tab.classList.remove(
                "active"
            );

            tab.setAttribute(
                "aria-selected",
                "false"
            );
        });

        sections.forEach(section => {

            section.hidden = true;

            section.classList.remove(
                "active-section"
            );
        });

        const selectedTab =
            tabs.find(
                tab =>
                    Number(
                        tab.dataset.section
                    ) === index
            );

        const selectedSection =
            sections[index];

        if (
            !selectedTab ||
            !selectedSection
        ) {

            return;
        }

        selectedTab.classList.add(
            "active"
        );

        selectedTab.setAttribute(
            "aria-selected",
            "true"
        );

        selectedSection.hidden =
            false;

        selectedSection.classList.add(
            "active-section"
        );
    }

    tabs.forEach(tab => {

        const index =
            Number(
                tab.dataset.section
            );

        tab.addEventListener(
            "click",
            () => {
                showSection(index);
            }
        );
    });

    tutorialButton?.addEventListener(
        "click",
        () => {

            if (
                typeof TutorialCard !==
                    "undefined" &&
                typeof TutorialCard.open ===
                    "function"
            ) {

                TutorialCard.open();
            }
        }
    );

    showSection(0);
}

function renderBackendData(data) {

    if (!data) {
        return;
    }

    window.latestAnalysisData =
        data;

    window.comparisonAnalysisData =
        null;

    if (
        typeof updateClassification ===
        "function"
    ) {

        updateClassification(data);
    }

    if (
        typeof updateDecisionTree ===
        "function"
    ) {

        updateDecisionTree(data);
    }

    if (
        typeof updateFeatureVector ===
        "function"
    ) {

        updateFeatureVector(data);
    }

    if (
        typeof updateRecommendation ===
        "function"
    ) {

        const analyzedPassword =
            localStorage.getItem(
                "analyzedPassword"
            ) || "";

        updateRecommendation(
            data,
            analyzedPassword
        );
    }

    if (
        typeof updateComparisonEmptyState ===
        "function"
    ) {

        updateComparisonEmptyState();
    }
}

async function fetchAnalysisResult() {

    const analyzedPassword =
        localStorage.getItem(
            "analyzedPassword"
        );

    const comparisonPassword =
        localStorage.getItem(
            "comparisonPassword"
        );

    try {

        if (
            analyzedPassword &&
            comparisonPassword
        ) {

            sessionStorage.setItem(
                "resultSource",
                "comTest"
            );

            localStorage.setItem(
                "previousPassword",
                analyzedPassword
            );

            localStorage.setItem(
                "currentPassword",
                comparisonPassword
            );

            const comparisonResult =
                readStoredAnalysisResult() ||
                await analyzePassword(
                    comparisonPassword,
                    analyzedPassword
                );

            const originalResult =
                readCachedOriginalResult(
                    analyzedPassword
                ) ||
                await analyzePassword(
                    analyzedPassword
                );

            window.latestAnalysisData =
                comparisonResult;

            window.comparisonAnalysisData = {

                previous:
                    originalResult,

                current:
                    comparisonResult
            };

            if (
                typeof updateClassification ===
                "function"
            ) {

                updateClassification(
                    comparisonResult
                );
            }

            if (
                typeof updateDecisionTree ===
                "function"
            ) {

                updateDecisionTree(
                    comparisonResult
                );
            }

            if (
                typeof updateFeatureVector ===
                "function"
            ) {

                updateFeatureVector(
                    comparisonResult
                );
            }

            if (
                typeof updateRecommendation ===
                "function"
            ) {

                updateRecommendation(
                    comparisonResult,
                    comparisonPassword
                );
            }

            if (
                typeof initializeComparison ===
                "function"
            ) {

                await initializeComparison();
            }

            localStorage.setItem(
                "analyzedPassword",
                comparisonPassword
            );

            localStorage.removeItem(
                "comparisonPassword"
            );

            sessionStorage.removeItem(
                "analysisResult"
            );

            cacheOriginalResult(
                comparisonPassword,
                comparisonResult
            );

            return comparisonResult;
        }

        if (!analyzedPassword) {
            return null;
        }

        sessionStorage.setItem(
            "resultSource",
            "ini"
        );

        const storedResult =
            readStoredAnalysisResult();

        const data =
            storedResult ||
            await analyzePassword(
                analyzedPassword
            );

        window.latestAnalysisData =
            data;

        window.comparisonAnalysisData =
            null;

        cacheOriginalResult(
            analyzedPassword,
            data
        );

        sessionStorage.removeItem(
            "analysisResult"
        );

        renderBackendData(data);

        return data;

    } catch (error) {

        console.error(
            "Analysis error:",
            error
        );

        return null;
    }
}

function initializePasswordPreview() {

    const previousPassword =
        localStorage.getItem(
            "previousPassword"
        ) || "";

    const testedPassword =
        localStorage.getItem(
            "currentPassword"
        ) ||
        localStorage.getItem(
            "analyzedPassword"
        ) ||
        "";

    const previousContainer =
        document.getElementById(
            "previousPasswordContainer"
        );

    if (
        previousPassword &&
        previousContainer
    ) {

        previousContainer.style.display =
            "block";

        createPasswordReveal(
            "previousPassword",
            previousPassword
        );
    }

    createPasswordReveal(
        "testedPassword",
        testedPassword
    );
}

function createPasswordReveal(
    id,
    password
) {

    const element =
        document.getElementById(id);

    if (
        !element ||
        !password
    ) {

        return;
    }

    const masked =
        "*".repeat(
            Math.min(
                password.length,
                13
            )
        );

    let revealed = false;

    element.textContent =
        masked;

    element.onclick = () => {

        revealed =
            !revealed;

        element.textContent =
            revealed
                ? password
                : masked;

        element.classList.toggle(
            "revealed",
            revealed
        );

        element.scrollLeft = 0;
    };
}

function clearResultStorage() {

    [
        "analyzedPassword",
        "previousPassword",
        "currentPassword",
        "originalAnalysisResult",
        "comparisonPassword"
    ].forEach(key => {

        localStorage.removeItem(
            key
        );
    });

    sessionStorage.removeItem(
        "analysisResult"
    );

    sessionStorage.removeItem(
        "resultSource"
    );
}

function initializeActionButtons() {

    const resetButton =
        document.getElementById(
            "resetButton"
        );

    const compareButton =
        document.getElementById(
            "compareButton"
        );

    resetButton?.addEventListener(
        "click",
        () => {

            clearResultStorage();

            window.location.href =
                "initialTest.html";
        }
    );

    compareButton?.addEventListener(
        "click",
        () => {

            window.location.href =
                "comparisonTest.html";
        }
    );
}

async function initializeResultPage() {

    guardResultPageAccess();

    await loadComponents();

    initializeDecisionTreeEvents();

    initializeSidebar();

    if (
        typeof initializeDecisionTree ===
        "function"
    ) {

        initializeDecisionTree();
    }

    initializePasswordPreview();

    await fetchAnalysisResult();

    initializeActionButtons();
}

document.addEventListener(
    "DOMContentLoaded",
    initializeResultPage,
    {
        once: true
    }
);

window.addEventListener(
    "pageshow",
    event => {

        if (event.persisted) {

            window.location.replace(
                "initialTest.html"
            );
        }
    }
);