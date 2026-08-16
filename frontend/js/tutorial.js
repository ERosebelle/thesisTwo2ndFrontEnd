let tutorialOverlay = null;
let tutorialCard = null;
let tutorialClose = null;

let tutorialConfirmOverlay = null;
let tutorialStay = null;
let tutorialSkip = null;

let tutorialSteps = [];
let tutorialPrev = null;
let tutorialNext = null;
let tutorialProgress = [];

let confirmBeforeClose = false;
let currentStep = 0;
let tutorialLoaded = false;


async function loadTutorial() {

    if (tutorialLoaded) {
        return true;
    }

    try {

        const response = await fetch(
            "../pages/components/tutorial.html",
            {
                cache: "no-cache"
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        const wrapper = document.createElement("div");
        wrapper.innerHTML = html.trim();

        document.body.insertAdjacentHTML(
            "beforeend",
            wrapper.innerHTML
        );

        tutorialLoaded = true;

        initializeTutorial();

        return true;

    } catch (error) {

        console.error(
            "Failed to load tutorial.html:",
            error
        );

        return false;

    }

}


function initializeTutorial() {

    tutorialOverlay =
        document.getElementById("tutorialOverlay");

    tutorialCard =
        document.getElementById("tutorialCard");

    tutorialClose =
        document.getElementById("tutorialClose");

    tutorialConfirmOverlay =
        document.getElementById("tutorialConfirmOverlay");

    tutorialStay =
        document.getElementById("tutorialStay");

    tutorialSkip =
        document.getElementById("tutorialSkip");

    tutorialSteps =
        document.querySelectorAll(".tutorial-step");

    tutorialPrev =
        document.getElementById("tutorialPrev");

    tutorialNext =
        document.getElementById("tutorialNext");

    tutorialProgress =
        document.querySelectorAll(
            "#tutorialProgress span"
        );


    if (!tutorialOverlay || !tutorialCard) {
        return;
    }


    tutorialClose?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            attemptClose();

        }
    );


    tutorialOverlay.addEventListener(
        "click",
        event => {

            if (
                event.target !== tutorialOverlay
            ) {
                return;
            }

            if (confirmBeforeClose) {
                return;
            }

            hideTutorial();

        }
    );


    tutorialCard.addEventListener(
        "click",
        event => {

            event.stopPropagation();

        }
    );


    tutorialPrev?.addEventListener(
        "click",
        () => {

            if (currentStep > 0) {

                currentStep--;

                updateTutorial();

            }

        }
    );


    tutorialNext?.addEventListener(
        "click",
        () => {

            if (
                currentStep <
                tutorialSteps.length - 1
            ) {

                currentStep++;

                updateTutorial();

            } else {

                hideTutorial();

            }

        }
    );


    tutorialProgress.forEach(
        (dot, index) => {

            dot.addEventListener(
                "click",
                () => {

                    currentStep = index;

                    updateTutorial();

                }
            );

        }
    );


    tutorialSkip?.addEventListener(
        "click",
        () => {

            hideTutorial();

        }
    );


    tutorialStay?.addEventListener(
        "click",
        () => {

            if (tutorialConfirmOverlay) {
                tutorialConfirmOverlay.hidden = true;
            }

        }
    );


    updateTutorial();

}


function updateTutorial() {

    tutorialSteps.forEach(
        (step, index) => {

            const active =
                index === currentStep;

            step.hidden = !active;

            step.classList.toggle(
                "active",
                active
            );

        }
    );


    tutorialProgress.forEach(
        (dot, index) => {

            dot.classList.toggle(
                "active",
                index === currentStep
            );

        }
    );


    if (tutorialPrev) {

        tutorialPrev.disabled =
            currentStep === 0;

    }


    if (tutorialNext) {

        tutorialNext.textContent =
            currentStep ===
            tutorialSteps.length - 1
                ? "Finish"
                : "Next";

    }

}


async function showTutorial(
    confirmClose = false
) {

    const loaded =
        await loadTutorial();

    if (!loaded) {
        return;
    }

    if (
        !tutorialOverlay ||
        !tutorialCard
    ) {
        return;
    }


    confirmBeforeClose =
        confirmClose;

    currentStep = 0;

    updateTutorial();


    if (tutorialConfirmOverlay) {
        tutorialConfirmOverlay.hidden = true;
    }


    tutorialOverlay.hidden = false;

    tutorialCard.hidden = false;

    document.body.style.overflow =
        "hidden";

}


function hideTutorial() {

    if (tutorialOverlay) {
        tutorialOverlay.hidden = true;
    }

    if (tutorialCard) {
        tutorialCard.hidden = true;
    }

    if (tutorialConfirmOverlay) {
        tutorialConfirmOverlay.hidden = true;
    }

    document.body.style.overflow = "";

}


function attemptClose() {

    if (!confirmBeforeClose) {

        hideTutorial();

        return;

    }


    if (tutorialConfirmOverlay) {

        tutorialConfirmOverlay.hidden =
            false;

    }

}


document.addEventListener(
    "DOMContentLoaded",
    () => {

        const tutorialButton =
            document.getElementById(
                "tutorialButton"
            );


        if (tutorialButton) {

            tutorialButton.addEventListener(
                "click",
                () => {

                    showTutorial(false);

                }
            );

        }


        if (
            sessionStorage.getItem(
                "showResultTutorial"
            ) === "true"
        ) {

            sessionStorage.removeItem(
                "showResultTutorial"
            );

            showTutorial(true);

        }

    }
);


window.Tutorial = {

    openFromInitial() {

        showTutorial(true);

    },


    openFromResult() {

        showTutorial(false);

    },


    close() {

        hideTutorial();

    }

};