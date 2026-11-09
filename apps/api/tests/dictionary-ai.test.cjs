const { test } = require("node:test");
const assert = require("node:assert/strict");
const { verifyDictionarySuggestion, makeVocabularyCloze, dictionaryLookupWord } =
  require("../dist/dictionary-ai");
const { ask } = require("../dist/ai/provider");
const example = {
  groupName: "ดีใจ / มีความสุข",
  groupDescription: "ความรู้สึกเชิงบวกที่มีความเข้มข้นแตกต่างกัน",
  words: [
    {word:"happy",meaning:"มีความสุข",partOfSpeech:"adjective",
      pronunciation:"ˈhæpi", example:"I am happy today.",
      exampleTranslation:"วันนี้ฉันมีความสุข", nuance:"ความสุขทั่วไป"},
    {word:"glad",meaning:"ดีใจ",partOfSpeech:"adjective",
      pronunciation:"ɡlæd", example:"I'm glad you are safe.",
      exampleTranslation:"ฉันดีใจที่คุณปลอดภัย", nuance:"ดีใจหรือโล่งใจต่อบางเหตุการณ์"}
  ]
};
test("single English word input and selected sense validation", () => {
  assert.equal(dictionaryLookupWord.parse(" delighted "), "delighted");
  assert.equal(dictionaryLookupWord.parse(" give up "), "give up");
  assert.equal(dictionaryLookupWord.parse(" give    up "), "give up");
  assert.equal(dictionaryLookupWord.parse("look after"), "look after");
  assert.equal(dictionaryLookupWord.parse("take care of"), "take care of");
  assert.equal(dictionaryLookupWord.parse("don't give up"), "don't give up");
  assert.equal(dictionaryLookupWord.parse("well-being"), "well-being");
  for (const word of ["", "hello<script>", "คำศัพท์", "give! up", "one two three four five six seven", "give\\nup"]) {
    assert.equal(dictionaryLookupWord.safeParse(word).success, false, word);
  }
  assert.equal(verifyDictionarySuggestion(example, "HAPPY").words.length, 2);
  assert.throws(() => verifyDictionarySuggestion(example, "sad"));
  assert.throws(() => verifyDictionarySuggestion({
    ...example, words: [example.words[0], {...example.words[0],word:"HAPPY"}]
  }, "happy"));
});
test("cloze hides only the standalone headword, not substrings", () => {
  assert.equal(makeVocabularyCloze("I am happy today.", "happy"), "I am _____ today.");
  assert.equal(makeVocabularyCloze("Happy, happy day.", "happy"), "_____, happy day.");
  assert.equal(makeVocabularyCloze("Catering is common.", "cat"), null);
  assert.equal(makeVocabularyCloze("I'm delighted!", "delighted"), "I'm _____!");
  assert.equal(makeVocabularyCloze("Please don't give up.", "give up"), "Please don't _____.");
  assert.equal(makeVocabularyCloze("I look after my dog.", "look after"), "I _____ my dog.");
  assert.equal(makeVocabularyCloze("Giving up is hard.", "give up"), null);
  assert.equal(makeVocabularyCloze("", "happy"), null);
});
test("phrasal verbs retain their headword and grammatical type", () => {
  const suggestion = {
    groupName: "ยอมแพ้ / เลิกทำ",
    groupDescription: "กริยาที่หมายถึงการหยุดพยายาม",
    words: [
      { word: "give up", meaning: "ยอมแพ้", partOfSpeech: "phrasal_verb",
        pronunciation: "ɡɪv ʌp", example: "Don't give up on your dreams.",
        exampleTranslation: "อย่ายอมแพ้ต่อความฝัน", nuance: "ใช้เมื่อเลิกพยายามหรือหยุดทำบางสิ่ง" },
      { word: "quit", meaning: "เลิกทำ", partOfSpeech: "verb",
        pronunciation: "kwɪt", example: "Don't quit now.",
        exampleTranslation: "อย่าเพิ่งเลิกตอนนี้", nuance: "ใช้เมื่อหยุดทำกิจกรรม" },
    ],
  };
  assert.equal(verifyDictionarySuggestion(suggestion, "give up").words[0].partOfSpeech, "phrasal_verb");
  assert.equal(verifyDictionarySuggestion(suggestion, " give   up ").words[0].word, "give up");
  assert.throws(() => verifyDictionarySuggestion(suggestion, "look after"));
});

test("Ollama dictionary request uses schema and returns editable preview", async (t) => {
  t.mock.method(global, "fetch", async (_url, options) => {
    const sent = JSON.parse(options.body);
    assert.equal(sent.format.properties.words.type, "array");
    assert.equal(sent.format.properties.words.items.properties.partOfSpeech.type, "string");
    assert(sent.format.properties.words.items.properties.partOfSpeech.enum.includes("phrasal_verb"));
    assert.equal(JSON.parse(sent.messages[1].content).word, "happy");
    assert.equal(sent.stream, false);
    return Response.json({message:{content:JSON.stringify(example)}});
  });
  const suggestion = await ask("dictionary", {word:"happy"});
  assert.equal(suggestion.groupName, "ดีใจ / มีความสุข");
  assert.deepEqual(suggestion.words.map(w=>w.word), ["happy","glad"]);
});
