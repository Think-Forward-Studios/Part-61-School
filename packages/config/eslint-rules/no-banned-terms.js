'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TERMS_PATH = path.join(__dirname, '..', 'banned-terms.json');

function loadTerms() {
  const raw = fs.readFileSync(TERMS_PATH, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.some((t) => typeof t !== 'string')) {
    throw new Error('banned-terms.json must be a JSON array of strings');
  }
  return arr;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegex(terms) {
  if (terms.length === 0) return null;
  const pattern = '\\b(' + terms.map(escapeRegex).join('|') + ')\\b';
  return new RegExp(pattern, 'gi');
}

const TERMS = loadTerms();
const TERMS_RE = buildRegex(TERMS);

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow banned terminology in user-visible source. See packages/config/banned-terms.json.',
    },
    schema: [],
    messages: {
      banned:
        'Banned term "{{term}}" found. See packages/config/banned-terms.json. Add `// allow-banned-term: <reason>` on the line above to allow.',
    },
  },

  create(context) {
    if (!TERMS_RE) return {};

    const sourceCode = context.sourceCode || context.getSourceCode();

    function commentsHaveAllow(comments) {
      for (const c of comments) {
        if (/allow-banned-term:\s*\S/.test(c.value)) return true;
      }
      return false;
    }

    function hasAllowComment(node) {
      // Check comments directly before this node.
      if (commentsHaveAllow(sourceCode.getCommentsBefore(node))) return true;
      // Walk up to the nearest statement and check there too — comments
      // attached to a string literal usually live before its containing
      // statement, not the literal itself.
      let cur = node.parent;
      while (cur) {
        if (commentsHaveAllow(sourceCode.getCommentsBefore(cur))) return true;
        // Stop at statement boundary so we don't grant allow-comments
        // ambient scope across an entire program.
        if (cur.type && /Statement|Declaration$/.test(cur.type)) break;
        cur = cur.parent;
      }
      return false;
    }

    function check(node, value) {
      if (typeof value !== 'string' || value.length === 0) return;
      if (hasAllowComment(node)) return;
      // Reset regex state because /g is stateful
      TERMS_RE.lastIndex = 0;
      let match;
      while ((match = TERMS_RE.exec(value)) !== null) {
        context.report({
          node,
          messageId: 'banned',
          data: { term: match[1] },
        });
      }
    }

    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        // node.value.cooked is the resolved string of this chunk
        const cooked = node.value && node.value.cooked;
        check(node, cooked);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};
