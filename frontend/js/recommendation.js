console.log("Recommendation JS Connected");

const recommendationImages = {
    "Add Character Variety": "../../assets/images/Add Character Variety.jpg",
    "Avoid Predictable Patterns": "../../assets/images/Avoid Predictable Patterns.jpg",
    "Dictionary Words": "../../assets/images/Dictionary Words.jpg",
    "Increase Password Length": "../../assets/images/Increase Password Length.jpg",
    "MFA + Password Manager": "../../assets/images/MFA + Password Manager.jpg",
    "Similar Password Guesses": "../../assets/images/Similar Password Guesses.jpg",
    "Current Password Is Stronger Than Previous": "../../assets/images/Current Password Is Stronger Than Previous.jpg"
};

function updateRecommendation(data, censoredPassword) {

    console.log("===== RECOMMENDATION DEBUG START =====");
    console.log("updateRecommendation() called");
    console.log("Received data:", data);
    console.log("Censored password:", censoredPassword);

    if (!data) {
        console.log("RECOMMENDATION: No data received");
        console.log("===== RECOMMENDATION DEBUG END =====");
        return;
    }

    const imageContainer =
        document.getElementById("recommendationImage");

    const contentContainer =
        document.getElementById("recommendationContent");

    console.log(
        "recommendationImage element:",
        imageContainer
    );

    console.log(
        "recommendationContent element:",
        contentContainer
    );

    if (!imageContainer) {
        console.error(
            "RECOMMENDATION ERROR: #recommendationImage was not found"
        );
        return;
    }

    if (!contentContainer) {
        console.error(
            "RECOMMENDATION ERROR: #recommendationContent was not found"
        );
        return;
    }

    imageContainer.innerHTML = "";
    contentContainer.innerHTML = "";

    const strategies = Array.isArray(data.strategies)
        ? data.strategies
        : [];

    console.log(
        "RECOMMENDATION: Strategies received:",
        strategies
    );

    console.log(
        "RECOMMENDATION: Password comparison received:",
        data.password_comparison
    );

    if (strategies.length === 0) {

        console.log(
            "RECOMMENDATION: No strategies available"
        );

        contentContainer.innerHTML =
            "<p>No recommendations available.</p>";

    } else {

        strategies.forEach((tip, index) => {

            console.log(
                `RECOMMENDATION: Processing strategy ${index + 1}:`,
                tip
            );

            const imageName =
                findRecommendationImage(tip);

            console.log(
                `RECOMMENDATION: Matched image for strategy ${index + 1}:`,
                imageName
            );

            const item =
                document.createElement("div");

            item.className =
                "recommendation-item";

            const imageWrapper =
                document.createElement("div");

            imageWrapper.className =
                "recommendation-image-wrapper";

            if (imageName) {

                const image =
                    document.createElement("img");

                image.className =
                    "recommendation-image";

                image.src =
                    recommendationImages[imageName];

                image.alt =
                    imageName;

                image.loading =
                    "lazy";

                image.addEventListener(
                    "load",
                    () => {

                        console.log(
                            `RECOMMENDATION IMAGE LOADED: ${imageName}`
                        );

                    }
                );

                image.addEventListener(
                    "error",
                    () => {

                        console.error(
                            `RECOMMENDATION IMAGE FAILED: ${image.src}`
                        );

                    }
                );

                imageWrapper.appendChild(image);

            } else {

                console.warn(
                    "RECOMMENDATION: No matching image found for:",
                    tip
                );

            }

            const text =
                document.createElement("div");

            text.className =
                "recommendation-text";

            text.innerHTML =
                censorPassword(
                    tip,
                    censoredPassword
                );

            item.appendChild(
                imageWrapper
            );

            item.appendChild(
                text
            );

            contentContainer.appendChild(
                item
            );

            console.log(
                `RECOMMENDATION: Strategy ${index + 1} rendered`
            );

        });
    }

    renderComparison(
        data.password_comparison,
        contentContainer
    );

    activatePasswordReveal();

    console.log(
        "RECOMMENDATION: Final rendered items:",
        contentContainer.children.length
    );

    console.log("===== RECOMMENDATION DEBUG END =====");
}

function findRecommendationImage(text) {

    if (!text) {
        return null;
    }

    const normalizedText =
        String(text).toLowerCase();

    if (
        normalizedText.includes("length") ||
        normalizedText.includes("longer")
    ) {
        return "Increase Password Length";
    }

    if (
        normalizedText.includes("uppercase") ||
        normalizedText.includes("lowercase") ||
        normalizedText.includes("character variety") ||
        normalizedText.includes("character variety") ||
        normalizedText.includes("symbol") ||
        normalizedText.includes("digit") ||
        normalizedText.includes("characters")
    ) {
        return "Add Character Variety";
    }

    if (
        normalizedText.includes("dictionary") ||
        normalizedText.includes("common word") ||
        normalizedText.includes("common words")
    ) {
        return "Dictionary Words";
    }

    if (
        normalizedText.includes("predictable") ||
        normalizedText.includes("pattern") ||
        normalizedText.includes("patterns") ||
        normalizedText.includes("sequence")
    ) {
        return "Avoid Predictable Patterns";
    }

    if (
        normalizedText.includes("similar") ||
        normalizedText.includes("guess") ||
        normalizedText.includes("guesses")
    ) {
        return "Similar Password Guesses";
    }

    if (
        normalizedText.includes("mfa") ||
        normalizedText.includes("multi-factor") ||
        normalizedText.includes("multi factor") ||
        normalizedText.includes("password manager")
    ) {
        return "MFA + Password Manager";
    }

    return null;
}

function renderComparison(comparison, container) {

    console.log(
        "===== COMPARISON DEBUG START ====="
    );

    console.log(
        "Comparison data:",
        comparison
    );

    if (!comparison) {

        console.log(
            "COMPARISON: No comparison data"
        );

        console.log(
            "===== COMPARISON DEBUG END ====="
        );

        return;
    }

    console.log(
        "COMPARISON STATUS:",
        comparison.status
    );

    console.log(
        "COMPARISON MESSAGE:",
        comparison.message
    );

    if (
        comparison.status !==
        "CURRENT_PREFERRED"
    ) {

        console.log(
            "COMPARISON: Current password is NOT stronger than previous."
        );

        console.log(
            "COMPARISON: Comparison image will NOT be displayed."
        );

        console.log(
            "===== COMPARISON DEBUG END ====="
        );

        return;
    }

    if (!comparison.message) {

        console.log(
            "COMPARISON: CURRENT_PREFERRED detected but no message."
        );

        console.log(
            "===== COMPARISON DEBUG END ====="
        );

        return;
    }

    console.log(
        "COMPARISON: Current password is stronger."
    );

    console.log(
        "COMPARISON: Rendering Current Password Is Stronger Than Previous image."
    );

    const item =
        document.createElement("div");

    item.className =
        "recommendation-item recommendation-comparison-item";

    item.dataset.status =
        comparison.status;

    const imageWrapper =
        document.createElement("div");

    imageWrapper.className =
        "recommendation-image-wrapper";

    const image =
        document.createElement("img");

    image.className =
        "recommendation-image";

    image.src =
        recommendationImages[
            "Current Password Is Stronger Than Previous"
        ];

    image.alt =
        "Current Password Is Stronger Than Previous";

    image.loading =
        "lazy";

    image.addEventListener(
        "load",
        () => {

            console.log(
                "COMPARISON IMAGE LOADED:",
                image.src
            );

        }
    );

    image.addEventListener(
        "error",
        () => {

            console.error(
                "COMPARISON IMAGE FAILED:",
                image.src
            );

        }
    );

    imageWrapper.appendChild(
        image
    );

    const text =
        document.createElement("div");

    text.className =
        "recommendation-text comparison-text";

    text.textContent =
        comparison.message;

    item.appendChild(
        imageWrapper
    );

    item.appendChild(
        text
    );

    container.appendChild(
        item
    );

    console.log(
        "COMPARISON: Stronger-password comparison rendered successfully."
    );

    console.log(
        "===== COMPARISON DEBUG END ====="
    );
}

function censorPassword(text, password) {

    console.log(
        "CENSOR: Processing text:",
        text
    );

    console.log(
        "CENSOR: Password:",
        password
    );

    if (!text) {
        return "-";
    }

    if (!password) {
        return text;
    }

    const escapedPassword =
        escapeRegex(
            String(password)
        );

    const regex =
        new RegExp(
            "(['\"])" +
            escapedPassword +
            "\\1",
            "g"
        );

    const maskedPassword =
        "*".repeat(
            String(password).length
        );

    const result =
        String(text).replace(
            regex,
            `<span class="hidden-password"
                data-password="${escapeHtmlAttr(password)}">${maskedPassword}</span>`
        );

    console.log(
        "CENSOR: Result:",
        result
    );

    return result;
}

function escapeRegex(string) {

    return String(string).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

function escapeHtmlAttr(string) {

    return String(string)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#39;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        );
}

function activatePasswordReveal() {

    console.log(
        "PASSWORD REVEAL: Searching for hidden passwords"
    );

    const hiddenPasswords =
        document.querySelectorAll(
            ".hidden-password"
        );

    console.log(
        "PASSWORD REVEAL: Found",
        hiddenPasswords.length,
        "hidden password elements"
    );

    hiddenPasswords.forEach(
        (item, index) => {

            if (
                item.dataset.listenerAttached
            ) {

                return;

            }

            item.dataset.listenerAttached =
                "true";

            const password =
                item.dataset.password || "";

            if (!password) {
                return;
            }

            const masked =
                "*".repeat(
                    password.length
                );

            item.textContent =
                masked;

            function show() {

                console.log(
                    `PASSWORD REVEAL: Showing password for item ${index + 1}`
                );

                item.textContent =
                    password;
            }

            function hide() {

                console.log(
                    `PASSWORD REVEAL: Hiding password for item ${index + 1}`
                );

                item.textContent =
                    masked;
            }

            item.addEventListener(
                "pointerdown",
                show
            );

            item.addEventListener(
                "pointerup",
                hide
            );

            item.addEventListener(
                "pointerleave",
                hide
            );

            item.addEventListener(
                "pointercancel",
                hide
            );

            item.addEventListener(
                "touchstart",
                show,
                {
                    passive: true
                }
            );

            item.addEventListener(
                "touchend",
                hide
            );

            item.addEventListener(
                "touchcancel",
                hide
            );

            console.log(
                `PASSWORD REVEAL: Listeners attached to item ${index + 1}`
            );
        }
    );

    console.log(
        "PASSWORD REVEAL: Initialization complete"
    );
}