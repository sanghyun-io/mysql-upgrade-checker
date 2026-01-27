# Contributing to MySQL Upgrade Checker

Thank you for your interest in contributing! 

## Ways to Contribute

1. **Report Bugs** - Open an issue describing the problem
2. **Suggest Features** - Share ideas for new compatibility checks
3. **Improve Documentation** - Help make the docs clearer
4. **Submit Code** - Fix bugs or add new features

## Development Setup

**Prerequisites:**
- Node.js 18 or higher
- npm or yarn

```bash
# Clone the repo
git clone https://github.com/sanghyun-io/mysql-upgrade-checker.git
cd mysql-upgrade-checker

# Install dependencies
npm install

# Start dev server with HMR
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Code Style

- Use TypeScript for type safety
- Use consistent indentation (2 spaces)
- Add comments for complex logic
- Follow existing naming conventions
- Keep functions focused and small
- Run `npm run build` to check for TypeScript errors

## Project Structure

```
src/
├── index.html          # Main HTML file
├── styles/
│   └── main.css        # All CSS styles
└── scripts/
    ├── main.ts         # Entry point & event handlers
    ├── types.ts        # TypeScript type definitions
    ├── rules.ts        # Compatibility rules
    ├── analyzer.ts     # File analysis logic
    └── ui.ts           # UI rendering logic
```

## Adding New Compatibility Rules

To add a new compatibility check, add an entry to the `compatibilityRules` array in `src/scripts/rules.ts`:

```typescript
{
    id: 'your_rule_id',
    type: 'schema', // or 'data', 'query'
    pattern: /YOUR_PATTERN/gi, // regex pattern
    severity: 'error', // or 'warning', 'info'
    title: 'Rule Title',
    description: 'Detailed description of the issue',
    suggestion: 'How to fix it',
    generateFixQuery: (context) => {
        // Return SQL to fix the issue
        return `ALTER TABLE ...`;
    }
}
```

**Important:** After adding rules:
1. Update TypeScript types in `types.ts` if needed
2. Test the rule with actual dump files
3. Verify the fix query is valid SQL

## Testing

Before submitting a PR:

1. Run TypeScript type check: `npm run build`
2. Test with various mysqlsh dump files
3. Verify all compatibility rules work correctly
4. Check that fix queries are valid SQL
5. Test in different browsers (Chrome, Firefox, Safari)
6. Verify the production build works: `npm run preview`

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Questions?

Feel free to open an issue for any questions!
