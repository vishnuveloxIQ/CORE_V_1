/** Layer rules for the modular monolith. See docs/ARCHITECTURE.md. Run: npm run deps */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', comment: 'No import cycles.', from: {}, to: { circular: true } },
    {
      name: 'shared-is-leaf',
      severity: 'error',
      comment: 'shared never imports from modules or app.',
      from: { path: '^src/shared/' },
      to: { path: '^src/(modules|app)/' },
    },
    {
      name: 'modules-not-app',
      severity: 'error',
      comment: 'Modules never import from app.',
      from: { path: '^src/modules/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'module-public-api-only',
      severity: 'error',
      comment: 'A module reaches another module only through its index.ts.',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\.ts$'] },
    },
    {
      name: 'app-uses-public-api',
      severity: 'error',
      comment: 'app imports a module through index.ts or its routes.ts entry point.',
      from: { path: '^src/app/' },
      to: { path: '^src/modules/', pathNot: '^src/modules/[^/]+/(index|routes)\.ts$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^src/test/|\.test\.tsx?$)' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
}
