const fs = require('fs');
const path = require('path');

const engData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'words_dictionary.json'), 'utf-8')
);
const englishWords = Object.keys(engData);

const tagData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'tagalog_dictionary.json'), 'utf-8')
);
const tagalogWords = tagData.map(entry => entry.word.toLowerCase());

const dictionaryWords = [...englishWords, ...tagalogWords];
const longDictionaryWords = dictionaryWords.filter(word => word.length >= 8);

const symbols = ['!', '@', '#', '$', '%', '&', '*'];
const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const digits = '0123456789';

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randChar(str) {
  return str[Math.floor(Math.random() * str.length)];
}

function randomString(length) {
  let out = '';
  const all = letters + digits + '!@#$%&*';
  for (let i = 0; i < length; i++) {
    out += randChar(all);
  }
  return out;
}

// 🌟 FULL 12-FEATURE GENERATOR LOGIC
function buildFeatures(password, label, isDictionary) {
  const cleanPassword = (label === 'DICTIONARY') ? password.toLowerCase() : password;

  const lower = /[a-z]/.test(cleanPassword) ? 1 : 0;
  const upper = /[A-Z]/.test(cleanPassword) ? 1 : 0;
  const digit = /\d/.test(cleanPassword) ? 1 : 0;
  const sym = /[^a-zA-Z0-9]/.test(cleanPassword) ? 1 : 0;

  const charClassCount = lower + upper + digit + sym;
  const hasLeet = (/[@$40531!]/.test(cleanPassword) && isDictionary) ? 1 : 0;
  const numSuffix = (isDictionary && /\d{2,}$/.test(cleanPassword)) ? 1 : 0;
  const hasSeq = /(123|abc|234|bcd|qwe)/i.test(cleanPassword) ? 1 : 0;
  const hasRep = /(.)\1{1,}/.test(cleanPassword) ? 1 : 0;

  const rulePattern = (
    hasLeet ||
    numSuffix ||
    hasSeq ||
    hasRep
  ) ? 1 : 0;

  return {
    password_sample: cleanPassword,
    f_length: cleanPassword.length,
    f_char_class_count: charClassCount,
    f_has_lowercase: lower,
    f_has_uppercase: upper,
    f_has_digit: digit,
    f_has_symbol: sym,
    f_dictionary_present: isDictionary,
    f_has_leetspeak: hasLeet,
    f_numeric_suffix: numSuffix,
    f_has_sequence: hasSeq,
    f_has_repetition: hasRep,
    f_rule_pattern_present: rulePattern,
    label: label
  };
}

const rows = [];

// SHORT DICTIONARY
for (let i = 0; i < 100; i++) {
  rows.push(buildFeatures(rand(dictionaryWords), "DICTIONARY", 1));
}

// LONG DICTIONARY
for (let i = 0; i < 100; i++) {
  rows.push(buildFeatures(rand(longDictionaryWords), "DICTIONARY", 1));
}

// RULE-BASED
for (let i = 0; i < 200; i++) {
  const word = rand(dictionaryWords);
  const variants = [
    word + rand(['12', '123', '2024', '99']),
    word.charAt(0).toUpperCase() + word.slice(1) + rand(symbols),
    word.replace(/a/g, '@').replace(/o/g, '0') + rand(['1', '22']),
    rand(symbols) + word + rand(['123', '99'])
  ];

  rows.push(buildFeatures(rand(variants), 'RULE-BASED', 1));
}

// BRUTE-FORCE
for (let i = 0; i < 200; i++) {
  const pass = randomString(10 + Math.floor(Math.random() * 5));
  rows.push(buildFeatures(pass, 'BRUTE-FORCE', 0));
}

// 🌟 CSV CREATION (12 COLUMNS)
let csv = 'password_sample,f_length,f_char_class_count,f_has_lowercase,f_has_uppercase,f_has_digit,f_has_symbol,f_dictionary_present,f_has_leetspeak,f_numeric_suffix,f_has_sequence,f_has_repetition,f_rule_pattern_present,label\n';

rows.forEach(r => {
  csv += `${r.password_sample},${r.f_length},${r.f_char_class_count},${r.f_has_lowercase},${r.f_has_uppercase},${r.f_has_digit},${r.f_has_symbol},${r.f_dictionary_present},${r.f_has_leetspeak},${r.f_numeric_suffix},${r.f_has_sequence},${r.f_has_repetition},${r.f_rule_pattern_present},${r.label}\n`;
});

fs.writeFileSync('additional_dataset.csv', csv);

console.log('✅ additional_dataset.csv with 12 features generated successfully!');
console.log(`✅ Total generated samples: ${rows.length}`);