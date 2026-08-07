// RECOMMENDATION BACKEND CONNECTION
const RecommendationAPI = "http://localhost:3000/analyze";

// INITIALIZE RECOMMENDATION
async function initializeRecommendation() {
    console.log("Recommendation JS Connected");

    try {
        /* "analyzedPassword" = password from Initial Test (the older one).
        "comparisonPassword" = password from Comparison Test (the newer
        one), only present when a comparison test actually happened.*/
        const previousPasswordStored = localStorage.getItem("analyzedPassword");
        const comparisonPasswordStored = localStorage.getItem("comparisonPassword");
        const analyzedPassword = comparisonPasswordStored || previousPasswordStored || "Password123";

        /* Only compare when a comparison test actually happened. A single Initial Test password has nothing to compare against.*/
        const previousPassword = comparisonPasswordStored ? previousPasswordStored : null;

        const response = await fetch(RecommendationAPI,
            {
                method: "POST", headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    password: analyzedPassword,
                    ...(previousPassword ? { previousPassword } : {})
                })
            }
        );

        const data = await response.json();
        console.log("Recommendation Response:", data);

        // LOAD STRATEGIES
        const list = document.getElementById("recommendationList");

        if (list) {
            list.innerHTML = "";

            /* COMPARISON RESULT -Only appears when a comparison test was
            actually run (backend returns non-null password_comparison in that case).*/
            if (
                data.password_comparison && data.password_comparison.message
            ) {
                const comparisonItem = document.createElement("li");
                comparisonItem.classList.add("comparison-message");
                comparisonItem.dataset.status = data.password_comparison.status || "";
                comparisonItem.textContent = data.password_comparison.message;
                list.appendChild(comparisonItem);
            }

            if (data.strategies && data.strategies.length > 0) {

                data.strategies.forEach(
                    tip => {
                        const li = document.createElement("li");
                        li.innerHTML = censorPassword(tip, analyzedPassword);
                        list.appendChild(li);
                    }
                );
            }
            else {
                list.innerHTML = "<li>No recommendations available.</li>";
            }
            activatePasswordReveal();
        }
    }

    catch (error) {
        console.error("Recommendation Error:", error);
    }
}

// AUTO START
document.addEventListener("DOMContentLoaded", initializeRecommendation);

// PASSWORD CENSOR
function censorPassword(text, password) {
    if (!text)
        return "-";
    if (!password)
        return text;

    const regex = new RegExp("(['\"])" + escapeRegex(password) + "\\1", "g");
    const maskedPassword = "*".repeat(password.length);

    return text.replace(regex, `<span class="hidden-password"
        data-password="${escapeHtmlAttr(password)}">
        ${maskedPassword}
        </span>`
    );
}

// ESCAPE REGEX
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ESCAPE HTML ATTRIBUTE

function escapeHtmlAttr(string) {
    return string.replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/* PASSWORD REVEAL. HOLD = SHOW, RELEASE = HIDE*/
function activatePasswordReveal() {
    const hiddenPasswords = document.querySelectorAll(".hidden-password");
    hiddenPasswords.forEach(
        item => {
            if (item.dataset.listenerAttached)
                return;

            item.dataset.listenerAttached = "true";
            const password = item.dataset.password || "";

            if (password === "")
                return;

            const masked = "*".repeat(password.length);
            item.textContent = masked;

            function show() {
                item.textContent = password;
            }

            function hide() {
                item.textContent = masked;
            }

            item.addEventListener("pointerdown", show);
            item.addEventListener("pointerup", hide);
            item.addEventListener("pointerleave", hide);
            item.addEventListener("pointercancel", hide);
            item.addEventListener("touchstart", show,
                {
                    passive: true
                }
            );

            item.addEventListener("touchend", hide);
            item.addEventListener("touchcancel", hide);
        }
    );
}