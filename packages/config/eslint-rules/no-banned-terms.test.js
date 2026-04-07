'use strict';

const test = require('node:test');
const { RuleTester } = require('eslint');
const rule = require('./no-banned-terms.js');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

test('no-banned-terms', () => {
  ruleTester.run('no-banned-terms', rule, {
    valid: [
      // Test 6: word boundary - "approval" must NOT trigger
      { code: "const x = 'approval pending';" },
      // Test 7: comments are not scanned
      { code: "// Part 141 is fine in a comment\nconst x = 1;" },
      // Test 4: allow-comment silences the rule
      {
        code: "// allow-banned-term: legacy header\nconst x = 'Part 141';",
      },
      // Unrelated string
      { code: "const x = 'hello world';" },
    ],
    invalid: [
      // Test 1: Literal "Part 141 approved" -> 2 reports
      {
        code: "const x = 'Part 141 approved';",
        errors: [
          { messageId: 'banned', data: { term: 'Part 141' } },
          { messageId: 'banned', data: { term: 'approved' } },
        ],
      },
      // Test 2: JSXText "This is a certified course" -> 1 report
      {
        code: 'const X = () => <div>This is a certified course</div>;',
        errors: [{ messageId: 'banned', data: { term: 'certified course' } }],
      },
      // Test 3: TemplateElement
      {
        code: 'const school = "x"; const y = `Welcome to ${school} approved program`;',
        errors: [{ messageId: 'banned', data: { term: 'approved' } }],
      },
      // Test 5: case-insensitive
      {
        code: "const x = 'PART 141';",
        errors: [{ messageId: 'banned', data: { term: 'PART 141' } }],
      },
    ],
  });
});
