console.log("Summary Card JS Connected");
// SUMMARY CARD
const SummaryCard = (() => {
    let overlay;
    let body;
    let closeButton;

    function initialize() {
        console.log("SummaryCard.initialize()");
        overlay = document.getElementById("summaryCardOverlay");
        body = document.getElementById("summaryCardBody");
        closeButton = document.getElementById("summaryCardClose");

        if (!overlay || !body || !closeButton) {
            console.warn("Summary Card elements not found.");
            return;
        }
        closeButton.onclick = close;

        overlay.onclick =
            event => {
                if (event.target === overlay)
                    {
                    close();
                }
            };

        document.addEventListener("keydown", handleEscape);
    }

    function handleEscape(event) {
        if (event.key === "Escape") 
            {
            close();
        }
    }

    function open(content) {
        if (!overlay || !body) {
            return;
        }

        body.innerHTML = content;
        overlay.classList.add("active");
    }

    function close() {
        if (!overlay) {
            return;
        }

        overlay.classList.remove("active");
    }

    return{
        initialize,open,close
    };

})();

// WAIT FOR DYNAMIC COMPONENT LOAD
window.addEventListener(
    "summaryCardLoaded",
    ()=>{
        window.SummaryCard.initialize();
    }
);