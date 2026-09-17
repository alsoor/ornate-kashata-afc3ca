import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import type { ParseResult } from '@babel/parser';
import type { NodePath, TraverseOptions } from '@babel/traverse';
import traverseDefault from '@babel/traverse';
import {
  isArrayExpression,
  isBinaryExpression,
  isCallExpression,
  isConditionalExpression,
  isLogicalExpression,
  isIdentifier,
  isImportDeclaration,
  isMemberExpression,
  isObjectExpression,
  isObjectProperty,
  isOptionalCallExpression,
  isOptionalMemberExpression,
  isStringLiteral,
  isTemplateLiteral,
  isTSNonNullExpression,
} from '@babel/types';
import type {
  Expression,
  File,
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXText,
  ArrayExpression,
  Node,
  ObjectExpression,
  TemplateElement,
  TSType,
  VariableDeclaration,
} from '@babel/types';

// Babel's traverse default export is a CJS interop shape its own types don't describe.
// Same shim in ./authored-keys.ts.
type TraverseFn = (ast: File, opts: TraverseOptions) => void;
const traverseModule: TraverseFn | { default: TraverseFn } = traverseDefault as unknown as
  | TraverseFn
  | { default: TraverseFn };
const traverse: TraverseFn = typeof traverseModule === 'function' ? traverseModule : traverseModule.default;

const CONTENT_MODULE: string = '@airo/content';
const BOUND_IMPORT_NAME: string = 'Text';
const TEXT_ATTRIBUTES: ReadonlySet<string> = new Set(['alt', 'placeholder', 'title']);
const VALUE_ELEMENTS: ReadonlySet<string> = new Set(['input', 'textarea']);
// Elements whose text cannot carry a <Text> child element: counting it would be a permanent
// deduction no gate could ever close.
const UNBINDABLE_PARENTS: ReadonlySet<string> = new Set(['style', 'script', 'option', 'textarea', 'title']);
const DEFAULT_SCAN_ROOTS: readonly string[] = ['src/pages', 'src/components', 'src/layouts'];

/** One place a user reads a string that is not bound to a content key. */
export interface UnboundSite {
  readonly file: string;
  readonly line: number;
  readonly kind:
    | 'jsx-text'
    | 'alt'
    | 'placeholder'
    | 'title'
    | 'input-value'
    | 'jsx-expression-literal'
    | 'local-map'
    | 'local-const';
  readonly text: string;
  /** For 'local-map' and 'local-const': the line declaring the offending binding, at any scope. */
  readonly declaredLine?: number;
}

/**
 * One place a user reads a string produced by a translation call rather than by the content layer.
 *
 * Counted, never refused. `t('home.title')` binds text to `src/locales/<lang>.json`, which is a real
 * authority the gates cannot see: the call is a `CallExpression`, so it yields no {@link UnboundSite}
 * and passes both gates. Recording it separately is what lets a reader tell an i18n-authored page
 * (`bound=0 unbound=0` because its copy lives elsewhere) from a page where binding simply failed.
 * These sites stay out of `sites` so `bound`, `unbound`, and `compliance` keep their meanings.
 */
export interface I18nSite {
  readonly file: string;
  readonly line: number;
  /** The callee as written: `t`, `i18n.t`, or `i18next.t`. */
  readonly callee: string;
  /** The translation key when it is a plain string literal; absent for a computed key. */
  readonly key?: string;
}

/**
 * Kinds that name an attribute rather than element text. Never enforced, because no primitive binds
 * an attribute: {@link enforcedSites} explains why, and {@link ENFORCED_KINDS} is its complement over
 * the text kinds.
 */
const ATTRIBUTE_KINDS: ReadonlySet<UnboundSite['kind']> = new Set([
  'alt',
  'placeholder',
  'title',
  'input-value',
]);

function isAttributeKind(kind: UnboundSite['kind']): boolean {
  return ATTRIBUTE_KINDS.has(kind);
}

const ENFORCED_KINDS: ReadonlySet<UnboundSite['kind']> = new Set([
  'jsx-text',
  'jsx-expression-literal',
  'local-map',
  'local-const',
]);

/** Whether the gates refuse this site. */
function isEnforcedSite(site: UnboundSite): boolean {
  return ENFORCED_KINDS.has(site.kind);
}

/**
 * The subset of `sites` the gates refuse. Every gate MUST filter through this rather than reading
 * `ComplianceReport.sites` directly, so the write gate, the build gate, and the migration's verify
 * step cannot disagree about which violations are fatal.
 *
 * Text sites only, because `<Text>` binds those and so a refusal can name a fix the author can
 * apply. The four attribute kinds are deliberately not refused: no primitive binds an attribute yet
 * (`resolveContentValue` returns a resolution, not a string), so refusing them would reject the
 * literal form the develop prompt asks for and leave no legal way to write an `alt` at all. They
 * remain in {@link ComplianceReport} so the measurement still sees them.
 */
export function enforcedSites(sites: readonly UnboundSite[]): readonly UnboundSite[] {
  return sites.filter(isEnforcedSite);
}

/**
 * Bound-vs-unbound tally over user-visible text sites. `compliance` is 0 when there are none, so
 * `filesScanned` is what separates "the agent bound nothing" from "nothing was scanned".
 */
export interface ComplianceReport {
  readonly bound: number;
  readonly unbound: number;
  readonly compliance: number;
  readonly filesScanned: number;
  readonly sites: readonly UnboundSite[];
  /**
   * Translation-call sites, counted but never refused; see {@link I18nSite}. Deliberately not folded
   * into `sites`: `unbound` is `sites.length`, so folding them in would deduct compliance for text
   * that is legitimately authored elsewhere and would quote translated strings in refusal copy.
   */
  readonly i18nSites: readonly I18nSite[];
  /**
   * Set when the source could not be parsed. Never read the empty collections above as "no unbound
   * sites" — nothing was analyzed. Only a caller with its own syntax-error backstop may treat it as
   * a pass, and then only deliberately: {@link assertContentAuthority} defers to the bundler, which
   * names the location better. A caller without that backstop — the agent write gate above all —
   * MUST fail, or a file that does not parse is a file that silently satisfies every rule.
   */
  readonly parseError?: string;
  /**
   * Directories that could not be read and files that could not be parsed during a scan, so an
   * incomplete measurement is visible in the number itself. A non-empty list means `bound`/`unbound`
   * cover fewer files than requested; a partial scan otherwise reads as a healthy result. Only set by
   * {@link measurePrimitiveCompliance}.
   */
  readonly scanErrors?: readonly string[];
}

/** Options for {@link measurePrimitiveCompliance}. */
export interface ComplianceOptions {
  readonly scanRoots?: readonly string[];
  /**
   * App-relative path prefixes to leave out of the measurement entirely, matched on a path-segment
   * boundary. Run the detector twice with complementary prefixes to measure agent-authored and
   * skill-installed pages separately.
   */
  readonly excludePaths?: readonly string[];
}

function report(
  bound: number,
  sites: UnboundSite[],
  filesScanned: number,
  options: { readonly parseError?: string; readonly i18nSites?: I18nSite[] } = {},
): ComplianceReport {
  const unbound: number = sites.length;
  const total: number = bound + unbound;
  return {
    bound,
    unbound,
    compliance: total === 0 ? 0 : bound / total,
    filesScanned,
    sites,
    i18nSites: options.i18nSites ?? [],
    parseError: options.parseError,
  };
}

const PAGES_ROOT: string = 'src/pages';
const COMPONENTS_ROOT: string = 'src/components';
/** Same set as {@link DEFAULT_SCAN_ROOTS} — one alias, so a measured root cannot go unenforced. */
const GATED_ROOTS: readonly string[] = DEFAULT_SCAN_ROOTS;
const UI_PREFIX: string = `${COMPONENTS_ROOT}/ui`;

/** App-relative path with forward slashes, so every prefix comparison here uses one convention. */
function toPosix(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

/**
 * Framework components that ship with the template and legitimately hold hardcoded chrome copy.
 *
 * Same category as `src/components/ui/`: infrastructure the customer never authors. `CookieBanner`
 * is consent UI whose copy is legal rather than editorial (a skill deliberately declines to override
 * it — see `skills/online-appointments/tools/analytics-wiring.ts`), and `DemoContent` is the starter
 * placeholder the agent replaces on its first build.
 *
 * Named exactly rather than pattern-matched, so the list cannot quietly widen.
 *
 * `src/layouts/Dashboard.tsx` is here for the same reason: its sites are dashboard chrome
 * ("Profile", "Settings", "Help", "Log out"), not customer copy.
 */
/**
 * Test modules, which ship with the template and grade the harness rather than the agent. Shared by
 * {@link isFrameworkExemptPath} and the aggregate scan: a test file exempt from one but not the
 * other is either refused copy the metric cannot see, or measured copy no gate would refuse.
 */
const TEST_MODULE: RegExp = /\.test\.[jt]sx?$/;

const FRAMEWORK_FILES: ReadonlySet<string> = new Set([
  'src/components/CookieBanner.tsx',
  'src/components/CookieBannerErrorBoundary.tsx',
  'src/components/DemoContent.tsx',
  'src/layouts/Dashboard.tsx',
]);

/**
 * Whether this app-relative path is framework/test-owned and therefore exempt from every
 * content-copy rule, gated or advisory: `src/components/ui/` primitives, test files, the named
 * `FRAMEWORK_FILES`, and `_`-prefixed pages (the same exemption `content-rules-lint.ts` already
 * applies, for the same reason).
 *
 * Split out of {@link isGatedPath} so a caller that runs across the whole source tree — not just
 * `src/pages`/`src/components` — can reuse the exemption without also inheriting `isGatedPath`'s
 * narrower scope. Two content-rule checkers in this repo disagreeing about which files hold
 * authored copy would reject healthy template input; the same disagreement, the other way round,
 * would misdirect the agent about files it is not meant to be held to.
 */
export function isFrameworkExemptPath(relPath: string): boolean {
  const p: string = toPosix(relPath);
  if (p === UI_PREFIX || p.startsWith(UI_PREFIX + '/')) return true;
  if (p.includes('/__tests__/') || TEST_MODULE.test(p)) return true;
  if (FRAMEWORK_FILES.has(p)) return true;
  // Scoped to pages only, to match `content-rules-lint.ts`'s exemption exactly — applying it to
  // components too would exempt `src/components/_Foo.tsx` there but not here.
  const baseName: string = p.split('/').pop() ?? p;
  return p.startsWith(PAGES_ROOT + '/') && baseName.startsWith('_');
}

/** Whether writes to this app-relative path are subject to the content-authority rule. */
export function isGatedPath(relPath: string): boolean {
  const p: string = toPosix(relPath);
  if (!isScannableSourceFile(p)) return false;
  if (isFrameworkExemptPath(p)) return false;
  return GATED_ROOTS.some((root: string): boolean => p === root || p.startsWith(root + '/'));
}

/**
 * Whether this app-relative path is a component rather than a page.
 *
 * Exists because the prohibition on importing `virtual:content` is component-scoped, not gate-wide:
 * a component that reads content directly loses source-mapper attribution and its text stops being
 * inline-editable, whereas a PAGE reading `{home.hero.title}` off the virtual module is the pattern
 * every authoring document asks for. That page read is attributed by source-mapper in dev mode only:
 * a production-mode start (the Git-sync restart path) strips the key while leaving the editor loaded,
 * so the copy is offered for editing and cannot be edited. `<Text>` is immune, setting its key at
 * runtime. That gap predates this predicate and is not what it decides. `content-rules-lint`
 * already draws the line here — `detectComponentImportsContent` returns early unless the file is a
 * component — so a gate that refused pages too was strictly stricter than the linter and rejected
 * the sanctioned form.
 */
export function isComponentPath(relPath: string): boolean {
  const p: string = toPosix(relPath);
  if (isFrameworkExemptPath(p)) return false;
  return p === COMPONENTS_ROOT || p.startsWith(COMPONENTS_ROOT + '/');
}

/** Cap on sites named in one message, so a whole-page write cannot produce an unbounded one. */
const MAX_LISTED_SITES: number = 20;

function describeSite(site: UnboundSite): string {
  const where: string = `:${site.line}`.padEnd(6, ' ');
  const kind: string = site.kind.padEnd(11, ' ');
  if (site.kind === 'local-map' || site.kind === 'local-const') {
    // Spelled out rather than `:?` when the line is unknown: a refusal that shows a placeholder
    // reads as a formatting bug, and an agent given `:?` will try to satisfy the `?`.
    const origin: string =
      site.declaredLine !== undefined ? `declared :${site.declaredLine}` : 'declared in more than one scope';
    return `  ${where} ${kind} ${site.text} (${origin}), not the content layer`;
  }
  return `  ${where} ${kind} ${JSON.stringify(site.text)}`;
}

/**
 * The body of a content-authority rejection: what is unbound, where, and how to bind it.
 *
 * Shared by the write gate and the build gate so one violation reads identically wherever it is
 * caught. Two wordings for one rule is how an agent concludes the two gates enforce different rules
 * and starts satisfying the wrong one. Callers supply the leading verb and the closing line, which
 * are the only parts that legitimately differ.
 *
 * The advice below MUST name the same shape the authoring guidance teaches. It previously recommended
 * `<Text k=…>`, which no authoring document mentions: every one of them (`develop/content-layer.md`,
 * the `template-v8` corpus, the content-system skill, `initial/speed/handoff-template.md`) says to read
 * copy off `virtual:content`. The agent therefore wrote one shape, was corrected toward another, and
 * had no reason to carry the correction past the single file it was refused on — so it relearned the
 * rule once per page. `content-authority-refusal-parity.test.ts` reads the prompt fragment and fails if
 * the two drift apart again; changing the canonical shape means changing both together.
 *
 * The closing line states the rule is general on purpose. A correction that reads as being about one
 * file gets applied to one file.
 */
export function describeUnboundSites(relPath: string, sites: readonly UnboundSite[]): string {
  const shown: readonly UnboundSite[] = sites.slice(0, MAX_LISTED_SITES);
  const remainder: number = sites.length - shown.length;
  const lines: string[] = [
    `${sites.length} user-visible string${sites.length === 1 ? '' : 's'} in ${relPath} ${sites.length === 1 ? 'is' : 'are'} not bound to content.`,
    '',
    ...shown.map(describeSite),
  ];
  if (remainder > 0) lines.push(`  +${remainder} more`);
  lines.push(
    '',
    'Bind each one:',
    '  1. content_scaffold the keys (one call can add several). It returns the import line to use.',
    "  2. import { home } from 'virtual:content';  then read each field directly: {home.hero.title}",
    '  3. For a list, keep the .map() and the {item.field} that renders each value on the page.',
    '',
    'This rule applies to every page you write, not only this file.',
  );
  return lines.join('\n');
}

/** Module extensions the gates check for user-visible copy. */
const SOURCE_EXTENSIONS: RegExp = /\.[jt]sx?$/;

/**
 * Whether a file is a source module the gates would check. The aggregate scan and
 * {@link gatedModulePath} MUST agree: a file the gate refuses but the scan never visits is a
 * violation absent from `sites`, `filesScanned` and `scanErrors` alike.
 */
function isScannableSourceFile(fileName: string): boolean {
  return SOURCE_EXTENSIONS.test(fileName) && !TEST_MODULE.test(fileName);
}

/**
 * The app-relative path a bundler module id should be checked under, or undefined when it is out of
 * scope: not a source module, outside the project, or an ungated path.
 *
 * Split out of the Vite hook so the id-handling — query stripping, the project-root boundary that
 * keeps `node_modules` and sibling framework trees out, and the separator normalisation — is
 * testable without standing up a bundler.
 */
export function gatedModulePath(id: string, projectRoot: string): string | undefined {
  const cleanId: string = id.replace(/[?#].*$/, '');
  if (!SOURCE_EXTENSIONS.test(cleanId)) return undefined;
  if (!cleanId.startsWith(projectRoot + path.sep)) return undefined;
  const relPath: string = toPosix(path.relative(projectRoot, cleanId));
  return isGatedPath(relPath) ? relPath : undefined;
}

/**
 * The clause both gates open their refusal with. Shared so the build gate and the write gate cannot
 * come to word the same verdict differently; each appends its own tail, which is the only part that
 * legitimately differs (a build cannot continue, a write did not land).
 */
export const UNBOUND_REFUSAL_STEM: string =
  'This app enforces content authority and refuses unbound literal text';

/**
 * Throw unless `code` binds every user-visible string, for use at build time.
 *
 * This function does not itself check whether the app is enrolled in content authority — callers
 * do, and a caller that forgets to is a build-breaking bug. See
 * docs/plans/2026-08-25-content-authority-v8-rollout-design.md.
 * A file that will not parse is left to the bundler's own syntax error, which names the location
 * better than this can.
 */
export function assertContentAuthority(code: string, relPath: string): void {
  if (!isGatedPath(relPath)) return;
  const result: ComplianceReport = classifyFileSource(code, relPath);
  if (result.parseError !== undefined) return;
  const enforced: readonly UnboundSite[] = enforcedSites(result.sites);
  if (enforced.length === 0) return;
  throw new Error(
    `[airo-content] ${describeUnboundSites(relPath, enforced)}\n\n` +
      `${UNBOUND_REFUSAL_STEM}, so the build cannot continue. Text resolved at runtime\n` +
      '(a translation call, for instance) is counted but not refused.',
  );
}

/** True when a literal container holds a string literal at any depth. */
function containsStringLiteral(node: ObjectExpression | ArrayExpression): boolean {
  const entries: ReadonlyArray<Node | null> = node.type === 'ArrayExpression' ? node.elements : node.properties;
  for (const entry of entries) {
    if (entry === null) continue;
    const candidate: Node = isObjectProperty(entry) ? entry.value : entry;
    if (isStringLiteral(candidate)) return true;
    if (isTemplateLiteral(candidate) && candidate.expressions.length === 0) return true;
    if (isObjectExpression(candidate) || isArrayExpression(candidate)) {
      if (containsStringLiteral(candidate)) return true;
    }
  }
  return false;
}

/** A file-local binding that holds display copy, and which refusal kind reading it produces. */
interface LocalCopyBinding {
  readonly kind: 'local-map' | 'local-const';
  /**
   * Declaration line, absent when the same name is declared in more than one scope. Bindings are
   * keyed by bare name, so a shadowed pair collapses into one entry and there is no way to tell
   * which declaration a given read resolves to. Naming one of them would send the author to the
   * wrong string — `${position} reads ${root}` offers no other location — so an ambiguous binding
   * names none. The kind is kept: both members are enforced, so the verdict is unchanged.
   */
  readonly line?: number;
}

/**
 * Which refusal kind an initialiser makes its binding worth recording as, or `undefined` when the
 * binding holds nothing user-visible.
 *
 * A bare string `const` is the cheapest evasion of the whole rule — `const title = 'Book a table'`
 * next to `<h1>{title}</h1>` reads identically to the refused literal — so it is recorded too, as
 * `local-const`, separately from the object/array `local-map` case. Separate kinds because the two
 * plausibly carry different false-positive rates, and the ramp is decided on the by-kind breakdown:
 * folding them together would hide whichever one turns out to be noisy.
 *
 * Both are only ever refused from a gated position, so a `const` holding a class name, an icon id or
 * an animation variant is untouched — the same protection the object/array case already relied on.
 */
function bindingKind(init: Node): LocalCopyBinding['kind'] | undefined {
  if (isObjectExpression(init) || isArrayExpression(init)) {
    return containsStringLiteral(init) ? 'local-map' : undefined;
  }
  // A template literal with substitutions is derived text, not a fixed string; it has no single
  // stored value a refusal could tell the author to move into content.
  if (isStringLiteral(init) || (isTemplateLiteral(init) && init.expressions.length === 0)) {
    // Through `editableLiteralsIn`, so a named string is judged by the same empty/decorative filter
    // the inline paths apply. Spelling the filter again here would let `const sep = '—'` be refused
    // while the identical `<h1>—</h1>` passes — refused for having a name, with inlining the
    // character as the only fix the message can name, which is the shape the rule discourages.
    return editableLiteralsIn(init).length > 0 ? 'local-const' : undefined;
  }
  return undefined;
}

/**
 * File-local bindings whose initialiser holds display strings, mapped to their declaration line.
 * Reading one of these in a gated position puts user-visible copy outside the content layer exactly
 * as a literal does, and far less visibly.
 *
 * `let` and `var` are collected alongside `const`: a reassignable binding read into a gated position
 * renders the same copy, and exempting it would be a one-keyword evasion.
 *
 * Collected at EVERY scope, not just module scope. Walking `ast.program.body` alone — which this did
 * originally — made the rule trivially evadable: the identical array declared inside the component
 * function was invisible, so an agent refused for `<h1>Book a table</h1>` could satisfy the gate by
 * hoisting the string into a function-local `const` and mapping over it, changing nothing about the
 * problem the refusal named. A refusal message that teaches an agent to launder the violation is
 * worse than no refusal, and the same blindness applies to the build gate, which shares this checker.
 *
 * The advisory linter already judged it this way: `isLocalContentObjectScope` in
 * `agents/src/tools/content-rules-ast.ts` accepts a `BlockStatement` container for the same
 * violation class, so the two checkers disagreed about whether a function-scope declaration counts —
 * the gate being the looser of the pair. Keeping them aligned is the point; a checker stricter than
 * its counterpart rejects healthy input, and looser lets exactly this through.
 *
 * Keyed by bare identifier name, so two same-named bindings in sibling scopes collapse into one
 * entry. That over-approximates rather than resolving bindings, which is deliberate and consistent
 * with {@link readRoots}: it also yields bare names, so no scope-precise lookup is available to
 * either side. The consequence is a possible false positive when one scope's `greeting` is copy and
 * another's is not — acceptable against the alternative of a rule with a five-line workaround. What
 * is not acceptable is naming a line the read may not resolve to, so a collapsed entry reports no
 * declaration line at all; see {@link LocalCopyBinding.line}.
 */
function collectLocalStringMaps(ast: File): ReadonlyMap<string, LocalCopyBinding> {
  const maps: Map<string, LocalCopyBinding> = new Map();

  const record = (decl: VariableDeclaration): void => {
    for (const d of decl.declarations) {
      if (d.id.type !== 'Identifier' || d.init === null || d.init === undefined) continue;
      const kind: LocalCopyBinding['kind'] | undefined = bindingKind(d.init);
      if (kind === undefined) continue;
      const existing: LocalCopyBinding | undefined = maps.get(d.id.name);
      if (existing === undefined) {
        maps.set(d.id.name, { kind, line: d.id.loc?.start.line ?? 0 });
        continue;
      }
      // Re-declared at another scope: keep the refusal, drop the line rather than name whichever
      // declaration source order reached first. See {@link LocalCopyBinding.line}.
      if (existing.line !== undefined) maps.set(d.id.name, { kind: existing.kind });
    }
  };

  // Source order, so a module-scope declaration is reached before a function-scope one shadowing it
  // in the body below — which is why "first wins" reports the outer line. `export const` needs no
  // special case here: the traversal reaches the inner VariableDeclaration either way.
  traverse(ast, {
    VariableDeclaration: (path: NodePath<VariableDeclaration>): void => {
      record(path.node);
    },
  });

  return maps;
}

/** Root identifier of a member/call chain, e.g. `galleryAlts` in `galleryAlts[id].alt`. */
function rootIdentifier(node: Node | undefined): string | undefined {
  let current: Node | undefined = node;
  for (;;) {
    if (current === undefined) return undefined;
    if (isIdentifier(current)) return current.name;
    if (isMemberExpression(current) || isOptionalMemberExpression(current)) {
      current = current.object;
      continue;
    }
    if (isCallExpression(current) || isOptionalCallExpression(current)) {
      current = current.callee;
      continue;
    }
    if (isTSNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    return undefined;
  }
}

/** Every root identifier an expression reads, including each template-literal interpolation. */
function readRoots(expr: unknown): string[] {
  const node: Node | null | undefined = expr as Node | null | undefined;
  if (node === null || node === undefined) return [];
  if (isTemplateLiteral(node)) {
    return node.expressions.flatMap((e: Expression | TSType): string[] => readRoots(e));
  }
  const root: string | undefined = rootIdentifier(node);
  return root === undefined ? [] : [root];
}

/** The JSX element's tag name, or undefined for a namespaced or member-expression name. */
export function elementName(node: JSXElement): string | undefined {
  const name: JSXElement['openingElement']['name'] = node.openingElement.name;
  return name.type === 'JSXIdentifier' ? name.name : undefined;
}

/**
 * The string an attribute spells out literally: quoted (`alt="x"`), braced (`alt={'x'}`), or a
 * template literal with no interpolation (``alt={`x`}``). All three put the same copy in the same
 * place, so reading only the quoted form left `alt={'x'}` outside every check — neither this nor the
 * JSX-text pass saw it, because that pass skips attribute parents.
 *
 * Shared with the key collector so the two never disagree about what counts as a literal attribute.
 */
export function literalAttribute(attr: JSXAttribute): string | undefined {
  const value: JSXAttribute['value'] = attr.value;
  if (value === null || value === undefined) return undefined;
  if (value.type === 'StringLiteral') return value.value;
  if (value.type === 'JSXExpressionContainer') return literalExpressionText(value);
  return undefined;
}

/**
 * Local names under which `imported` enters this module from `@airo/content` — `Text` itself plus
 * any alias (`import { Text as Copy }`). Shared with the key collector so both sides agree on which
 * JSX element is a primitive; two answers to that question would let one gate see a binding the
 * other does not.
 */
export function collectContentImportAliases(ast: File, imported: string): ReadonlySet<string> {
  const localNames: Set<string> = new Set();
  for (const stmt of ast.program.body) {
    if (!isImportDeclaration(stmt) || stmt.source.value !== CONTENT_MODULE) continue;
    for (const specifier of stmt.specifiers) {
      if (specifier.type !== 'ImportSpecifier') continue;
      const name: string | undefined =
        specifier.imported.type === 'Identifier' ? specifier.imported.name : undefined;
      if (name === imported) localNames.add(specifier.local.name);
    }
  }
  return localNames;
}

/** Callee spellings that mean react-i18next translation. */
const TRANSLATION_CALLEES: ReadonlySet<string> = new Set(['t', 'i18n.t', 'i18next.t']);

/**
 * The callee of `node` as written, for the only two shapes {@link TRANSLATION_CALLEES} can hold: a
 * bare `t` and a one-dot `i18n.t`. A deeper chain returns undefined rather than a dotted string no
 * entry in that set could match.
 *
 * Optional members count, so `i18n?.t` reads the same as `i18n.t`. `rootIdentifier` in this file
 * already treats optional chaining as equivalent, and a call should not become invisible to the
 * measurement for wearing a `?.`.
 */
function calleeName(node: Node): string | undefined {
  if (isIdentifier(node)) return node.name;
  // Narrow with the predicates directly: assigning them to a boolean first loses the narrowing and
  // `node.computed` no longer typechecks.
  if (!isMemberExpression(node) && !isOptionalMemberExpression(node)) return undefined;
  if (node.computed) return undefined;
  const object: Node = node.object as Node;
  const property: Node = node.property as Node;
  if (!isIdentifier(object) || !isIdentifier(property)) return undefined;
  return `${object.name}.${property.name}`;
}

/** What a translation call contributes to an {@link I18nSite}, before its location is attached. */
type TranslationCall = Omit<I18nSite, 'file' | 'line'>;

/**
 * The translation call `expr` is, or undefined when it is not one. Matched on the callee spelling
 * rather than by resolving the `useTranslation()` binding, which would add a scope analysis to a
 * checker two write paths depend on.
 *
 * That trade is only safe while no *refusal decision* reads `i18nSites`, so keep it that way — the
 * write gate counts these sites for telemetry (`content_authority.write_gate.translated_sites`),
 * which is deliberate and does not change any verdict. A renamed `t`, a
 * callee reached through a deeper chain, or one held in a computed member are all false negatives,
 * and a gate built on this would start refusing real translation calls. Such a miss is otherwise
 * harmless because an unrecognized call yields no site at all (its root identifier is the callee,
 * never a module-local string map), so it is invisible rather than refused.
 */
function translationCall(expr: Node | null | undefined): TranslationCall | undefined {
  if (expr === null || expr === undefined) return undefined;
  if (!isCallExpression(expr) && !isOptionalCallExpression(expr)) return undefined;
  const callee: string | undefined = calleeName(expr.callee as Node);
  if (callee === undefined || !TRANSLATION_CALLEES.has(callee)) return undefined;
  const key: string | undefined = literalStringValue(expr.arguments[0] as Node | undefined);
  return { callee, key };
}

/**
 * The string `expr` spells out literally: a `StringLiteral`, or a `TemplateLiteral` with nothing
 * interpolated. The single judgment for "this expression is a fixed string", so JSX-text
 * classification and translation-key extraction cannot disagree about what counts as one.
 */
function literalStringValue(expr: Node | null | undefined): string | undefined {
  if (expr === null || expr === undefined) return undefined;
  if (isStringLiteral(expr)) return expr.value;
  if (isTemplateLiteral(expr) && expr.expressions.length === 0) {
    return expr.quasis.map((quasi: TemplateElement): string => quasi.value.raw).join('');
  }
  return undefined;
}

function literalExpressionText(node: JSXExpressionContainer): string | undefined {
  return literalStringValue(node.expression as Node);
}

/**
 * Every fixed string `expr` can yield, in source order. Deliberately distinct from
 * {@link literalStringValue}, which answers "is this *exactly one* fixed string" for
 * translation-key extraction: `cond ? 'a' : 'b'` is not a key, but both branches are copy a content
 * author must be able to edit, so a gate that only understood the single-string question let every
 * conditional, fallback and concatenation through unrefused.
 */
function literalStringsIn(expr: Node | null | undefined): readonly string[] {
  if (expr === null || expr === undefined) return [];
  if (isStringLiteral(expr)) return [expr.value];
  if (isTemplateLiteral(expr)) {
    const parts: string[] = [];
    for (let i: number = 0; i < expr.quasis.length; i++) {
      parts.push((expr.quasis[i] as TemplateElement).value.raw);
      const interpolated: Node | undefined = expr.expressions[i] as Node | undefined;
      if (interpolated !== undefined) parts.push(...literalStringsIn(interpolated));
    }
    return parts;
  }
  if (isConditionalExpression(expr)) {
    return [...literalStringsIn(expr.consequent as Node), ...literalStringsIn(expr.alternate as Node)];
  }
  if (isLogicalExpression(expr) || (isBinaryExpression(expr) && expr.operator === '+')) {
    return [...literalStringsIn(expr.left as Node), ...literalStringsIn(expr.right as Node)];
  }
  if (isTSNonNullExpression(expr)) return literalStringsIn(expr.expression as Node);
  return [];
}

/** Fixed strings in `expr` that a content author could actually edit. */
function editableLiteralsIn(expr: Node | null | undefined): readonly string[] {
  return literalStringsIn(expr).filter(
    (text: string): boolean => text.trim().length > 0 && !isDecorativeText(text),
  );
}

/** Matches any letter or digit in any script, so a CJK or accented string still counts as copy. */
const LETTER_OR_DIGIT: RegExp = /[\p{L}\p{N}]/u;

/**
 * Whether `text` is pure decoration — punctuation, symbols, whitespace — with no letter or digit for
 * a content author to ever meaningfully edit. Sits alongside the empty-text guards above: those
 * catch nothing, this catches nothing readable.
 */
function isDecorativeText(text: string): boolean {
  return !LETTER_OR_DIGIT.test(text);
}

/**
 * The site kind a gated attribute reports, or `undefined` when the attribute carries no user-visible
 * text. Single source for "is this attribute gated" and "what kind is it", which were previously
 * derived separately at the two ends of the same visitor.
 */
function attributeSiteKind(attrName: string, ownerName: string | undefined): UnboundSite['kind'] | undefined {
  if (TEXT_ATTRIBUTES.has(attrName)) return attrName as UnboundSite['kind'];
  if (attrName === 'value' && ownerName !== undefined && VALUE_ELEMENTS.has(ownerName)) return 'input-value';
  return undefined;
}

function hasUnbindableParent(p: NodePath): boolean {
  const parent: NodePath | null = p.parentPath;
  if (parent === null || parent.node.type !== 'JSXElement') return false;
  const name: string | undefined = elementName(parent.node as JSXElement);
  return name !== undefined && UNBINDABLE_PARENTS.has(name);
}

/**
 * Classify one file's source into bound vs. unbound user-visible text sites.
 * Unparseable input yields an empty report rather than throwing.
 */
export function classifyFileSource(source: string, relPath: string): ComplianceReport {
  let ast: ParseResult<File>;
  try {
    ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  } catch (err: unknown) {
    return report(0, [], 1, { parseError: String(err) });
  }

  const boundLocalNames: ReadonlySet<string> = collectContentImportAliases(ast, BOUND_IMPORT_NAME);
  const localStringMaps: ReadonlyMap<string, LocalCopyBinding> = collectLocalStringMaps(ast);
  let bound: number = 0;
  const sites: UnboundSite[] = [];
  const i18nSites: I18nSite[] = [];

  /** Records `expr` when it is a translation call. Returns whether it was. */
  const checkTranslation = (expr: unknown, line: number): boolean => {
    const call: TranslationCall | undefined = translationCall(expr as Node);
    if (call === undefined) return false;
    i18nSites.push({ file: relPath, line, callee: call.callee, key: call.key });
    return true;
  };

  /**
   * Rule 2. Only fires in a gated position, which is why an animation-variant object read as
   * `variants={fadeUp}` is untouched.
   *
   * `positionKind` decides whether the site is refusable. In child text it takes the binding's own
   * kind, which is enforced. In an ATTRIBUTE it is recorded under the attribute's kind instead, so it
   * stays counted-only — the same treatment a literal `alt="…"` already gets, and for the same
   * reason: no primitive binds an attribute, so a refusal there names no legal fix. Refusing
   * `alt={galleryAlts[id]}` while accepting `alt="A plated dish"` left the author of an unbound alt
   * with nothing to do but inline the string, which is the shape the rule was trying to discourage.
   */
  const checkLocalMap = (
    expr: unknown,
    line: number,
    source: string,
    positionKind: UnboundSite['kind'],
  ): void => {
    for (const root of readRoots(expr)) {
      const binding: LocalCopyBinding | undefined = localStringMaps.get(root);
      if (binding !== undefined) {
        sites.push({
          file: relPath,
          line,
          kind: isAttributeKind(positionKind) ? positionKind : binding.kind,
          text: `${source} reads ${root}`,
          ...(binding.line !== undefined ? { declaredLine: binding.line } : {}),
        });
        return;
      }
    }
  };

  /**
   * The fallback for a gated position holding something other than a plain literal, shared by the
   * child-text and attribute visitors so the two enforcement paths cannot drift: record a
   * translation call, else refuse every fixed string the expression can reach, else fall through to
   * the local-string-map rule.
   */
  const recordExpressionFallback = (
    expr: Node,
    line: number,
    kind: UnboundSite['kind'],
    mapSource: string,
  ): void => {
    if (checkTranslation(expr, line)) return;
    const reached: readonly string[] = editableLiteralsIn(expr);
    if (reached.length > 0) {
      for (const literal of reached) sites.push({ file: relPath, line, kind, text: literal });
      return;
    }
    checkLocalMap(expr, line, mapSource, kind);
  };

  traverse(ast, {
    JSXElement(p: NodePath<JSXElement>): void {
      const name: string | undefined = elementName(p.node);
      if (name !== undefined && boundLocalNames.has(name)) bound += 1;
    },
    JSXText(p: NodePath<JSXText>): void {
      const trimmed: string = p.node.value.trim();
      if (trimmed.length === 0) return;
      if (isDecorativeText(trimmed)) return;
      if (hasUnbindableParent(p)) return;
      sites.push({ file: relPath, line: p.node.loc?.start.line ?? 0, kind: 'jsx-text', text: trimmed });
    },
    JSXExpressionContainer(p: NodePath<JSXExpressionContainer>): void {
      if (p.parentPath.node.type === 'JSXAttribute') return;
      if (hasUnbindableParent(p)) return;
      const line: number = p.node.loc?.start.line ?? 0;
      const text: string | undefined = literalExpressionText(p.node);
      if (text === undefined) {
        recordExpressionFallback(p.node.expression as Node, line, 'jsx-expression-literal', 'jsx text');
        return;
      }
      // `{' '}` is what Prettier emits on a JSX line wrap, not copy.
      if (text.trim().length === 0) return;
      if (isDecorativeText(text)) return;
      sites.push({ file: relPath, line, kind: 'jsx-expression-literal', text });
    },
    JSXAttribute(p: NodePath<JSXAttribute>): void {
      const attrName: JSXAttribute['name'] = p.node.name;
      if (attrName.type !== 'JSXIdentifier') return;
      const owner: NodePath | null = p.parentPath.parentPath;
      const ownerName: string | undefined =
        owner !== null && owner.node.type === 'JSXElement' ? elementName(owner.node as JSXElement) : undefined;
      const kind: UnboundSite['kind'] | undefined = attributeSiteKind(attrName.name, ownerName);

      const text: string | undefined = literalAttribute(p.node);
      if (text === undefined) {
        if (kind !== undefined && p.node.value?.type === 'JSXExpressionContainer') {
          const line: number = p.node.loc?.start.line ?? 0;
          recordExpressionFallback(p.node.value.expression as Node, line, kind, attrName.name);
        }
        return;
      }
      // `alt=""` is the correct markup for a decorative image and cannot carry a key by construction.
      if (text.trim().length === 0) return;
      if (isDecorativeText(text)) return;
      if (kind === undefined) return;
      sites.push({ file: relPath, line: p.node.loc?.start.line ?? 0, kind, text });
    },
  });

  return report(bound, sites, 1, { i18nSites });
}

async function walkSourceFiles(
  dir: string,
  visit: (file: string) => Promise<void>,
  scanErrors: string[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err: unknown) {
    // An absent scan root is legitimate; anything else means the measurement is incomplete.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      scanErrors.push(`${dir}: ${String(err)}`);
    }
    return;
  }
  for (const entry of entries) {
    const full: string = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      await walkSourceFiles(full, visit, scanErrors);
      continue;
    }
    if (isScannableSourceFile(entry.name)) await visit(full);
  }
}

/** Both arguments are compared as forward-slash paths; `rel` must already be {@link toPosix}-normalized. */
function isUnderPrefix(rel: string, prefix: string): boolean {
  // A trailing separator would make both comparisons below look for a doubled one and silently
  // exclude nothing.
  const normalized: string = toPosix(prefix).replace(/\/+$/, '');
  return rel === normalized || rel.startsWith(normalized + '/');
}

/**
 * Measure an app directory. Framework-exempt files are excluded entirely — see
 * {@link isFrameworkExemptPath}, the same policy the gates apply — as are files under any
 * `options.excludePaths` prefix. Counting exempt chrome would put a permanent floor under
 * `compliance` that no agent could ever clear.
 */
export async function measurePrimitiveCompliance(
  appDir: string,
  options: ComplianceOptions = {},
): Promise<ComplianceReport> {
  const scanRoots: readonly string[] = options.scanRoots ?? DEFAULT_SCAN_ROOTS;
  const excludePaths: readonly string[] = options.excludePaths ?? [];
  let bound: number = 0;
  let filesScanned: number = 0;
  const sites: UnboundSite[] = [];
  const i18nSites: I18nSite[] = [];
  const scanErrors: string[] = [];

  for (const root of scanRoots) {
    await walkSourceFiles(path.join(appDir, root), async (file: string): Promise<void> => {
      const rel: string = toPosix(path.relative(appDir, file));
      if (isFrameworkExemptPath(rel)) return;
      if (excludePaths.some((prefix: string): boolean => isUnderPrefix(rel, prefix))) return;
      const source: string = await fs.readFile(file, 'utf-8');
      const fileReport: ComplianceReport = classifyFileSource(source, rel);
      if (fileReport.parseError !== undefined) scanErrors.push(`${rel}: ${fileReport.parseError}`);
      bound += fileReport.bound;
      filesScanned += fileReport.filesScanned;
      sites.push(...fileReport.sites);
      i18nSites.push(...fileReport.i18nSites);
    }, scanErrors);
  }

  return { ...report(bound, sites, filesScanned, { i18nSites }), scanErrors };
}
