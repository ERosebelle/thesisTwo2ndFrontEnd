// COMPARISON TEST PAGE - comparisonTest.js
// PASSWORD VISIBILITY TOGGLE
const passwordInput = document.getElementById("comparePasswordInput");
const togglePassword = document.getElementById("togglePassword");
const eyeOpen = document.getElementById("eyeOpen");
const eyeClosed = document.getElementById("eyeClosed");

if (passwordInput && togglePassword && eyeOpen && eyeClosed) {
    togglePassword.addEventListener("click", () => {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            eyeOpen.classList.add("hidden");
            eyeClosed.classList.remove("hidden");
        }

        else {
            passwordInput.type = "password";
            eyeClosed.classList.add("hidden");
            eyeOpen.classList.remove("hidden");
        }
    }
    );
}

// INFORMATION PANEL
const scene = document.querySelector(".scene");
const infoButton = document.getElementById("infoButton");
const closeInfo = document.getElementById("closeInfo");

if (scene && infoButton) {
    infoButton.addEventListener("click", () => { scene.classList.toggle("show-info"); });
}

if (scene && closeInfo) {
    closeInfo.addEventListener("click", () => {
        scene.classList.remove("show-info");
    }
    );
}

// INFORMATION CONTENT
const infoButtons = document.querySelectorAll(".info-option");
const infoTitle = document.getElementById("infoTitle");
const infoContent = document.getElementById("infoContent");

// TUTORIAL IMAGE SLIDER
function initializeTutorialSlider() {
    const slides = document.querySelectorAll(".tutorial-slide");
    const dots = document.querySelectorAll(".dot");
    const slider = document.querySelector(".tutorial-slider");

    if (slides.length === 0 || dots.length === 0 || !slider) {
        return;
    }

    let currentIndex = 0;
    function showSlide(index) {
        if (index >= slides.length) {
            currentIndex = 0;
        }

        else if (index < 0) {
            currentIndex = slides.length - 1;
        }
        else {
            currentIndex = index;
        }

        slides.forEach(
            slide => {
                slide.classList.remove("active");
            }
        );

        dots.forEach(
            dot => {
                dot.classList.remove("active");
            }
        );

        slides[currentIndex]
            .classList.add("active");

        dots[currentIndex]
            .classList.add("active");
    }

    // DOT CLICK
    dots.forEach(
        (dot, index) => {
            dot.onclick = () => {
                showSlide(index);
            };
        }
    );

    // CLICK IMAGE LEFT / RIGHT
    slider.addEventListener(
        "click",
        (event) => {
            const box = slider.getBoundingClientRect();
            const clickX =
                event.clientX - box.left;
            const middle =
                box.width / 2;

            if (clickX > middle) {
                showSlide(currentIndex + 1);
            }
            else {
                showSlide(currentIndex - 1);
            }
        }
    );
}

const informationData = {
    about: {
        title: "About Comparison Test",
        content: `
        <h3> Password Comparison Assessment </h3>
        <p>
        This feature allows users to evaluate another
        password and compare its possible vulnerability
        against the previously analyzed password.
        </p>

        <p>
        The system examines password characteristics
        and determines whether the new password provides
        stronger or weaker protection against possible
        cracking strategies.
        </p>

        <p>
        Only extracted password features are processed.
        The original password is not stored by the system.
        </p>
        `
    },

    process: {
        title: "Comparison Process",
        content:
            `
    <h3> Password Comparison Flow </h3>
    <ol>

    <li>User enters a new password for comparison.</li>
    <li>The system extracts password characteristics.</li>
    <li>The generated password representation is evaluated.</li>
    <li>The Decision Tree classifier identifies the possible vulnerability category.</li>
    <li>The new password result is compared with the previous analysis.</li>
    <li>Security insights and improvements are displayed.</li>
    </ol>
    `
    },

    analysis: {
        title: "Password Features Compared",
        content: `
    <h3>Extracted Password Characteristics</h3>
    <p> The system compares password structures without
    storing the original password. </p>
    <ul>
    <li>Password Length</li>
    <li>Lowercase and Uppercase Usage</li>
    <li>Number and Symbol Presence</li>
    <li>Dictionary Word Detection</li>
    <li>Leetspeak Patterns</li>
    <li>Sequential Patterns</li>
    <li>Repeated Characters</li>
    <li>Rule-Based Patterns</li>
    </ul>
    `
    },

    methods: {
        title: "Cracking Methods Comparison",
        content: `
    <h3>Vulnerability Categories</h3>
    <ul>
    <li>
    <strong> Dictionary Attack </strong>
    <br>Detects passwords using common words
    or predictable phrases.
    </li>
<li>
    <strong> Brute Force Attack </strong>
<br>
    Evaluates resistance against character
    combination attempts.
</li>
    <li>
    <strong>Rule-Based Attack </strong>
    <br>
    Identifies predictable modifications
    such as added numbers or substitutions.
</li>
</ul>
`
    },

    decision: {
        title: "Decision Tree Comparison",
        content: `
    <h3>Classification Model </h3>
    <p>
    The Decision Tree classifier evaluates
    the extracted characteristics of the new password.
</p>
    <p>
    The generated result is compared with the
    previous password assessment.
</p>
    <p>
    This helps determine whether the new password
    provides improved security.
</p>
`
    },
    tutorial: {
        title: "Comparison Tutorial",
        content: `

    <h3>How To Compare Passwords</h3>
        <p>
    Follow these steps to compare a new password.
    </p>

<div class="tutorial-container">
    <p>
    Step 1: Enter the password you want to compare.
    </p>
    <img src="../assets/images/step1.png">
    </div>

<div class="tutorial-container">
    <p>
    Step 2: Click compare password to process the new password.
    </p>
    <img src="../assets/images/step2.png">
    </div>

<div class="tutorial-container">
<p>
Step 3: Review the comparison result.
    </p>
    <div class="tutorial-slider">
    <img class="tutorial-slide active" src="../assets/images/step3-(1-3).png">
    <img class="tutorial-slide" src="../assets/images/step3-(2-3).png">
    <img class="tutorial-slide" src="../assets/images/step3-(3-3).png">
    </div>
    
    <div class="tutorial-dots">
    <span class="dot active"></span>
    <span class="dot"></span>
    <span class="dot"></span>
    </div>
    </div>
`
    }
};

if (infoButtons.length > 0) {
    infoButtons.forEach(
        button => {
            button.addEventListener(
                "click",
                () => {
                    const section = button.dataset.section;
                    const selected = informationData[section];

                    if (selected && infoTitle && infoContent) {
                        infoTitle.textContent = selected.title;
                        infoContent.innerHTML = selected.content;

                        if (section === "tutorial") {
                            initializeTutorialSlider();
                        }
                    }

                    infoButtons.forEach(
                        btn => {
                            btn.classList.remove("active");
                        }
                    );
                    button.classList.add("active");
                }
            );
        }
    );
}

// RESET BUTTON
const resetButton = document.getElementById("resetButton");
if (resetButton) {
    resetButton.addEventListener(
        "click",
        () => {
            window.location.href = "initialTest.html";
        }
    );
}

// COMPARE PASSWORD BUTTON, SEND TO BACKEND
const compareButton = document.getElementById("compareButton");

// When the user press the Enter in keyboard
if (passwordInput && compareButton) {
    passwordInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            compareButton.click();
        }
    });
}

if (compareButton && passwordInput) {
    compareButton.addEventListener("click",
        async () => {
            const password = passwordInput.value.trim();
            if (password === "") {
                passwordInput.focus();
                passwordInput.style.boxShadow = "0 0 25px rgba(239,68,68,.8)";
                setTimeout(
                    () => {
                        passwordInput.style.boxShadow = "";
                    },
                    1000
                );
                return;
            }

            compareButton.disabled = true;
            compareButton.textContent = "Analyzing...";

            try {
                const previousPassword = localStorage.getItem("analyzedPassword");

                const response = await fetch("http://localhost:3000/analyze",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            password: password,
                            ...(previousPassword ? { previousPassword } : {})
                        })
                    }
                );

                if (!response.ok) {
                    throw new Error("Backend Error");
                }

                const result = await response.json();

                /* SAVE ONLY THE COMPARISON PASSWORD
                Keep analyzed Password unchanged from the Initial Test.*/
                localStorage.setItem("comparisonPassword", password);

                // SAVE RESULT
                sessionStorage.setItem("analysisResult", JSON.stringify(result));
                window.location.href = "result.html";

            } catch (error) {
                console.error("Comparison Analysis Error:", error);
                alert("Unable to connect to analysis server.");
                compareButton.disabled = false;
                compareButton.textContent = "Compare Password";
            }
        }
    );
}

// BUTTON INFORMATION HOVER
const buttonInfo = document.getElementById("buttonInfo");
const buttonInfoTitle = document.getElementById("buttonInfoTitle");
const buttonInfoText = document.getElementById("buttonInfoText");
const buttonDescriptions = {
    reset: {
        title: "Reset Password Test",
        text: "Returns to the Initial Test page where you can analyze a new password from the beginning."
    },

    compare: {
        title: "Compare Password",
        text: "Analyzes the entered password and compares its vulnerability against the previous password assessment."
    }
};

function showButtonInfo(type, button) {
    if (!buttonInfo || !buttonInfoTitle || !buttonInfoText) {
        return;
    }

    const data = buttonDescriptions[type];
    if (data) {
        buttonInfoTitle.textContent = data.title;
        buttonInfoText.textContent = data.text;
    }

    const rect = button.getBoundingClientRect();
    buttonInfo.style.left = (rect.left + (rect.width / 2)) + "px";
    buttonInfo.style.top = (rect.top - buttonInfo.offsetHeight - 80) + "px";
    buttonInfo.style.transform = "translateX(-170%)";
    buttonInfo.classList.add("show");
}

function hideButtonInfo() {
    if (buttonInfo) {
        buttonInfo.classList.remove("show");
    }
}

if (resetButton) {
    resetButton.addEventListener(
        "mouseenter",
        () => {
            showButtonInfo("reset", resetButton);
        }
    );

    resetButton.addEventListener("mouseleave", hideButtonInfo);
}

if (compareButton) {
    compareButton.addEventListener("mouseenter",
        () => {
            showButtonInfo("compare", compareButton);
        }
    );

    compareButton.addEventListener("mouseleave", hideButtonInfo);
}

/*PAGE ACCESS PROTECTION
Prevent reload, browser back, and
direct access to Comparison Test*/

(function () {
    const navigation = performance.getEntriesByType("navigation")[0];
    const isReload = navigation && navigation.type === "reload";
    const isBackForward = navigation && navigation.type === "back_forward";

    const hasPreviousPassword = localStorage.getItem("analyzedPassword");

    if (isReload || isBackForward || !hasPreviousPassword) {
        window.location.replace("initialTest.html");
    }
})();

window.addEventListener(
    "pageshow",
    event => {
        if (event.persisted) {
            window.location.replace("initialTest.html");
        }
    }
);

/*Opts this page out of the browser's back/forward cache (bfcache).
Without this, the browser can repaint a cached snapshot of this
page before the checks above run, causing a brief flash of stale
content before the redirect happens.*/
window.addEventListener("unload", function () { });