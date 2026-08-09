/* RECOMMENDATION RENDERER
Pure render function - no fetch of its own. result.js is the single place that calls /analyze, and passes the response straight in here
(same pattern as updateClassification / updateDecisionTree / updateFeatureVector). This avoids firing a second, redundant
/analyze request for a password result.js has already fetched. */
function updateRecommendation(data, censoredPassword) {
    console.log("Recommendation Data:", data);

    if (!data) {
        console.log("No recommendation data received");
        return;
    }

    // LOAD STRATEGIES
    const list = document.getElementById("recommendationList");

    if (list) {
        list.innerHTML = "";

        /* COMPARISON RESULT -Only appears when a comparison test was actually run (backend returns non-null password_comparison in that case).*/
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
                    li.innerHTML = censorPassword(tip, censoredPassword);
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