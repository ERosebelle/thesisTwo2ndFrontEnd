const contentArea = document.getElementById("contentArea");
const sections = document.querySelectorAll(".content-area section");
const menuItems = document.querySelectorAll(".section-booklet li");
const energyThumb = document.getElementById("energyThumb");

// SECTION FOLLOW SYSTEM
function updateSection() {
    let current = 0;
    const containerTop =
        contentArea.getBoundingClientRect().top;

    sections.forEach((section, index) => {
        const sectionTop = section.getBoundingClientRect().top - containerTop;

        if (sectionTop <= 180) { current = index; }
    });

    updateLeft(current);
    updateEnergy(current);
}

// LEFT LIGHT
function updateLeft(index) {
    menuItems.forEach((item, i) => { item.classList.toggle("active", i === index); });
}

// ENERGY CORE
function updateEnergy(index) {
    const total = sections.length - 1;

    const movement = (index / total) * 80;
    energyThumb.style.top = movement + "%";
}

// Detect Scrolling
contentArea.addEventListener("scroll", updateSection);

// First Load
window.addEventListener("load", updateSection);

// CONSENT CHECKBOX
const checkbox = document.getElementById("consentCheckbox");
const acceptBtn = document.getElementById("acceptBtn");

if (checkbox && acceptBtn) {
    checkbox.addEventListener("change", () => { acceptBtn.disabled = !checkbox.checked; });
}

// DECLINE MODAL
const declineBtn = document.getElementById("declineBtn");
const modal = document.getElementById("declineModal");
const closeModal = document.getElementById("closeModal");

if (declineBtn && modal) {
    declineBtn.onclick = () => { modal.style.display = "flex"; };
}

if (closeModal && modal) {
    closeModal.onclick = () => { modal.style.display = "none"; };
}

/* ACCEPT BUTTON
Uses location.replace() instead of location.href so that consent.html is REMOVED from browser history rather than
just sitting there as a previous entry. Once accepted, there is nothing left to navigate "back" to. */

if (acceptBtn) {
    acceptBtn.onclick = () => {
        if (!acceptBtn.disabled) {
            // animation before moving page
            document.body.classList.add("page-exit");
            setTimeout(() => {
                window.location.replace("initialTest.html");
            }, 800);

            if (acceptBtn) {
                acceptBtn.onclick = () => {
                    if (!acceptBtn.disabled) {
                        localStorage.setItem("consentAccepted", "true");

                        document.body.classList.add("page-exit");
                        setTimeout(() => { window.location.href = "initialTest.html"; }, 800);
                    }
                };
            }
        }
    };
}
/* DISABLE BACK/FORWARD CACHE (bfcache) - Ensures this page can never be instantly
repainted from a cached snapshot. */
window.addEventListener("unload", function () { });

/* BLOCK RETURN TO CONSENT - Once consent has been accepted, this
page must never be shown again.*/
if (localStorage.getItem("consentAccepted") === "true") {
    window.location.replace("initialTest.html");
}

/*Opts this page out of the browser's back/forward cache (bfcache) - so returning here (e.g. via Back) always re-runs the check above
instead of showing a cached snapshot of the accepted page.*/
window.addEventListener("unload", function () { });