import path from 'node:path'
import type { Rule } from 'eslint'
import type { Node } from 'estree'

/** CLAUDE.md 3.3 and ADR 0001: core is pure; it imports nothing from a host. */
export const DEFAULT_ROOT = 'packages/core'
export const DEFAULT_FORBIDDEN = ['pixi.js', 'spacetimedb', '@bastion/server', '@bastion/client']

interface Options {
  /** The package these files belong to; relative imports may not leave it. Relative to the lint cwd, or absolute. */
  root?: string
  /** Bare module names this package may not import, including their subpaths. */
  forbidden?: string[]
}

function isForbidden(spec: string, forbidden: readonly string[]): boolean {
  return forbidden.some((name) => spec === name || spec.startsWith(`${name}/`))
}

function isInside(file: string, dir: string): boolean {
  const rel = path.relative(dir, file)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export const layering: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep a package inside its layer: no host imports, no relative paths out of the package (CLAUDE.md 3.3).' },
    schema: [
      {
        type: 'object',
        properties: {
          root: { type: 'string' },
          forbidden: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      forbiddenModule: "'{{spec}}' may not be imported from {{root}} (CLAUDE.md 3.3: core imports nothing from a host or renderer).",
      escapesRoot: "'{{spec}}' reaches outside {{root}}. Import another package by its name, never by a relative path.",
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as Options
    const rootOption = options.root ?? DEFAULT_ROOT
    const root = path.resolve(context.cwd, rootOption)
    const forbidden = options.forbidden ?? DEFAULT_FORBIDDEN
    const fileDir = path.dirname(path.resolve(context.cwd, context.filename))

    function check(source: Node | null | undefined): void {
      if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return
      const spec = source.value
      if (spec.startsWith('.')) {
        if (!isInside(path.resolve(fileDir, spec), root)) {
          context.report({ node: source, messageId: 'escapesRoot', data: { spec, root: rootOption } })
        }
      } else if (isForbidden(spec, forbidden)) {
        context.report({ node: source, messageId: 'forbiddenModule', data: { spec, root: rootOption } })
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node.arguments[0] as Node | undefined)
      },
    }
  },
}
