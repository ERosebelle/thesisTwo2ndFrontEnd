const fs = require("fs");
const { DecisionTreeClassifier } = require("ml-cart");

// Load trained model
const model = JSON.parse(fs.readFileSync("model.json"));
const classifier = DecisionTreeClassifier.load(model);

/* 🌟 SAMPLE FEATURES (12 FEATURES)
Pinalitan para maging aligned sa 12 features ng model.json:*/
const sample = [
  10, // 1.  f_length
  3,  // 2.  f_char_class_count (e.g., lower + upper + digit)
  1,  // 3.  f_has_lowercase
  1,  // 4.  f_has_uppercase
  1,  // 5.  f_has_digit
  0,  // 6.  f_has_symbol
  1,  // 7.  f_dictionary_present
  1,  // 8.  f_has_leetspeak
  1,  // 9.  f_numeric_suffix
  0,  // 10. f_has_sequence
  0,  // 11. f_has_repetition
  1   // 12. f_rule_pattern_present
];

// Predict 
const prediction = classifier.predict([sample]);

const labelMap = {
  0: "DICTIONARY",
  1: "RULE-BASED",
  2: "BRUTE-FORCE"
};

console.log("Input Feature Vector (12):", sample);
console.log("Raw Prediction Index:", prediction[0]);
console.log("Classification Result:", labelMap[prediction[0]]);