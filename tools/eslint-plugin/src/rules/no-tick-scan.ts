import path from 'node:path'
import type { Rule } from 'eslint'
import type { Expression, Node, Super } from 'estree'
import { TICK_SCAN_ALLOWLIST } from './no-tick-scan.allowlist.ts'

/**
 * CLAUDE.md 3.4 and 3.10: never scan a table. In `core` the `Store` type makes
 * scans impossible; this rule guards the SpacetimeDB host glue. It fails
 * `.iter()` and `.count()` on a table handle, and iterating a handle directly
 * (`for...of`, spread, `Array.from`, `yield*`, destructuring). A table handle
 * is a member of `db`: `ctx.db.entity`, `ctx.db['entity']`, or `db.entity`
 * after `const db = ctx.db` / `const { db } = ctx`. Index lookups
 * (`ctx.db.entity.id.find(k)`, `ctx.db.entity.byOwner.filter(v)`) are fine.
 *
 * Files listed in `no-tick-scan.allowlist.ts` are exempt; option `allow`
 * replaces that list (tests use it).
 */
const SCAN_METHODS = new Set(['iter', 'count'])

type Expr = Expression | Super | Node

/** `db` itself: the identifier `db` or any `<x>.db` member. */
function isDb(node: Expr): boolean {
  if (node.type === 'Identifier') return node.name === 'db'
  if (node.type === 'MemberExpression') return !node.computed && node.property.type === 'Identifier' && node.property.name === 'db'
  return false
}

/** A table handle: a direct member of `db`. Unwraps TS `as`/`!`/`satisfies`. */
function isTableHandle(node: Expr): boolean {
  const n = unwrap(node)
  return n.type === 'MemberExpression' && isDb(unwrap(n.object))
}

function unwrap(node: Expr): Expr {
  let n = node as { type: string; expression?: Expr }
  while ((n.type === 'TSAsExpression' || n.type === 'TSNonNullExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'TSTypeAssertion') && n.expression) n = n.expression as typeof n
  return n as Expr
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

export const noTickScan: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'No full-table iteration on ctx.db handles in the server host (CLAUDE.md 3.4).' },
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      method: '`.{{method}}()` on a table handle scans the whole table. Read by primary key or a declared index (CLAUDE.md 3.4).',
      iterate: 'Iterating a table handle scans the whole table. Read by primary key or a declared index (CLAUDE.md 3.4).',
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as { allow?: string[] }
    const allow = options.allow ?? TICK_SCAN_ALLOWLIST.map((e) => e.file)
    const file = toPosix(path.relative(context.cwd, context.filename))
    if (allow.includes(file)) return {}

    function checkIterated(node: Expr | null | undefined): void {
      if (node && isTableHandle(node)) context.report({ node, messageId: 'iterate' })
    }

    return {
      CallExpression(node) {
        const callee = unwrap(node.callee)
        if (callee.type === 'MemberExpression' && isTableHandle(callee.object)) {
          const prop = callee.property
          const name = !callee.computed && prop.type === 'Identifier' ? prop.name : prop.type === 'Literal' && typeof prop.value === 'string' ? prop.value : undefined
          if (name !== undefined && SCAN_METHODS.has(name)) {
            context.report({ node, messageId: 'method', data: { method: name } })
            return
          }
        }
        // Array.from(ctx.db.t)
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Array' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'from'
        ) {
          checkIterated(node.arguments[0])
        }
      },
      ForOfStatement(node) {
        checkIterated(node.right)
      },
      SpreadElement(node) {
        // Object spread copies own properties; only array/argument spread iterates.
        if (node.parent.type !== 'ObjectExpression') checkIterated(node.argument)
      },
      YieldExpression(node) {
        if (node.delegate) checkIterated(node.argument)
      },
      VariableDeclarator(node) {
        if (node.id.type === 'ArrayPattern') checkIterated(node.init)
      },
      AssignmentExpression(node) {
        if (node.left.type === 'ArrayPattern') checkIterated(node.right)
      },
    }
  },
}
