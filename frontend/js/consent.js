const contentArea = document.getElementById("contentArea");

const sections = document.querySelectorAll(".content-area section");

const menuItems = document.querySelectorAll(".section-booklet li");

const energyThumb = document.getElementById("energyThumb");

// =========================
// BLOCK RETURN TO CONSENT
// =========================

if (sessionStorage.getItem("consentAccepted") === "true") {
    window.location.replace("initialTest.html");
}

// =========================
// SECTION FOLLOW SYSTEM
// =========================

function updateSection() {

    let current = 0;

    const containerTop =
        contentArea.getBoundingClientRect().top;

    sections.forEach((section, index) => {

        const sectionTop =
            section.getBoundingClientRect().top -
            containerTop;

        if (sectionTop <= 180) {

            current = index;

        }

    });

    updateLeft(current);
    updateEnergy(current);

}

// =========================
// LEFT LIGHT
// =========================

function updateLeft(index) {

    menuItems.forEach((item, i) => {

        item.classList.toggle(
            "active",
            i === index
        );

    });

}

// =========================
// ENERGY CORE
// =========================

function updateEnergy(index) {

    const total =
        sections.length - 1;

    const movement =
        (index / total) * 80;

    energyThumb.style.top =
        movement + "%";

}

// =========================
// INITIALIZE
// =========================

if (contentArea) {

    contentArea.addEventListener(
        "scroll",
        updateSection
    );

}

window.addEventListener(
    "load",
    updateSection
);

// =========================
// CONSENT CHECKBOX
// =========================

const checkbox =
    document.getElementById(
        "consentCheckbox"
    );

const acceptBtn =
    document.getElementById(
        "acceptBtn"
    );

if (checkbox && acceptBtn) {

    acceptBtn.disabled = !checkbox.checked;

    checkbox.addEventListener(
        "change",
        () => {

            acceptBtn.disabled =
                !checkbox.checked;

        }
    );

}

// =========================
// DECLINE MODAL
// =========================

const declineBtn =
    document.getElementById(
        "declineBtn"
    );

const modal =
    document.getElementById(
        "declineModal"
    );

const closeModal =
    document.getElementById(
        "closeModal"
    );

if (declineBtn && modal) {

    declineBtn.onclick = () => {

        modal.style.display = "flex";

    };

}

if (closeModal && modal) {

    closeModal.onclick = () => {

        modal.style.display = "none";

    };

}

// =========================
// ACCEPT BUTTON
// =========================

if (acceptBtn) {

    acceptBtn.onclick = () => {

        if (acceptBtn.disabled) return;

        sessionStorage.setItem(
            "consentAccepted",
            "true"
        );

        document.body.classList.add(
            "page-exit"
        );

        setTimeout(() => {

            window.location.replace(
                "initialTest.html"
            );

        }, 800);

    };

}

// =========================
// DISABLE BF CACHE
// =========================

window.addEventListener(
    "unload",
    function () {}
);