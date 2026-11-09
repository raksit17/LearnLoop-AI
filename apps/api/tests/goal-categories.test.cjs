const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_GOAL_CATEGORIES, categoryKey, normalizeCategoryName, isDefaultCategory } = require("../dist/goal-categories");

test("built-in goal categories are preserved", () => {
  assert.deepEqual(DEFAULT_GOAL_CATEGORIES, ["General", "Programming", "English"]);
  assert.equal(isDefaultCategory("general"), true);
  assert.equal(isDefaultCategory(" Programming "), true);
  assert.equal(isDefaultCategory("ภาษาญี่ปุ่น"), false);
});

test("names normalize whitespace and Unicode to avoid duplicate labels", () => {
  assert.equal(normalizeCategoryName("  สาย  Backend   Developer  "), "สาย Backend Developer");
  assert.equal(categoryKey("  AI  "), categoryKey("ａｉ"));
  assert.equal(categoryKey("Programming"), categoryKey(" programming "));
});
