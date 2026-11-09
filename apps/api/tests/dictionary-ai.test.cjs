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
  for (const word of ["", "hello world", "hello<script>", "คำศัพท์"]) {
    assert.equal(dictionaryLookupWord.safeParse(word).success, false);
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
  assert.equal(makeVocabularyCloze("", "happy"), null);
});
test("Ollama dictionary request uses schema and returns editable preview", async (t) => {
  t.mock.method(global, "fetch", async (_url, options) => {
    const sent = JSON.parse(options.body);
    assert.equal(sent.format.properties.words.type, "array");
    assert.equal(sent.format.properties.words.items.properties.partOfSpeech.type, "string");
    assert.equal(JSON.parse(sent.messages[1].content).word, "happy");
    assert.equal(sent.stream, false);
    return Response.json({message:{content:JSON.stringify(example)}});
  });
  const suggestion = await ask("dictionary", {word:"happy"});
  assert.equal(suggestion.groupName, "ดีใจ / มีความสุข");
  assert.deepEqual(suggestion.words.map(w=>w.word), ["happy","glad"]);
});
