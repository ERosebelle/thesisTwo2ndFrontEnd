/* FEATURE VECTOR featureVector.js
   Prevent global variable conflicts */
const FeatureVector = (() => {

    // UPDATE FEATURE VECTOR UI FROM DATA
    function updateFeatureVector(data) {
        console.log("Updating Feature Vector UI with data:", data);

        if (!data) {
            console.error("No data provided to Feature Vector");
            return;
        }

        // Handle both raw backend data OR nested { features: ... } format
        const features = data.features || data;

        if (!features) {
            console.error("No feature vector properties found in data");
            return;
        }

        // BASIC FEATURES
        setValue("fvLength", features.length);
        setValue("fvLowercase", convert(features.has_lowercase));
        setValue("fvUppercase", convert(features.has_uppercase));
        setValue("fvDigits", convert(features.has_digit));
        setValue("fvSymbols", convert(features.has_symbol));
        setValue("fvClasses", features.character_class_count);

        // PATTERN FEATURES
        setValue("fvDictionary", convert(features.dictionary_present));
        setValue("fvLeetspeak", convert(features.has_leetspeak));
        setValue("fvSuffix", convert(features.numeric_suffix));
        setValue("fvSequence", convert(features.has_sequence));
        setValue("fvRepetition", convert(features.has_repetition));
        setValue("fvRulePattern", convert(features.rule_pattern_present));
    }

    // SAFE ELEMENT UPDATE
    function setValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value ?? "-";
        }
    }

    // BOOLEAN FORMAT
    function convert(value) {
        return value === 1 || value === true ? "Present" : "Not Present";
    }

    // EXPOSE FUNCTIONS
    return {
        updateFeatureVector
    };
})();

// GLOBAL ACCESS FOR RESULT.JS
window.updateFeatureVector = FeatureVector.updateFeatureVector;