# Contributing to MySQL Upgrade Checker

Thank you for your interest in contributing! 

## Ways to Contribute

1. **Report Bugs** - Open an issue describing the problem
2. **Suggest Features** - Share ideas for new compatibility checks
3. **Improve Documentation** - Help make the docs clearer
4. **Submit Code** - Fix bugs or add new features

## Development Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/mysql-upgrade-checker.git
cd mysql-upgrade-checker

# Open in browser
open index.html
```

## Code Style

- Use consistent indentation (4 spaces)
- Add comments for complex logic
- Follow existing naming conventions
- Keep functions focused and small

## Adding New Compatibility Rules

To add a new compatibility check, add an entry to the `compatibilityRules` array in `index.html`:

```javascript
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

## Testing

Before submitting a PR:

1. Test with various dump files
2. Verify all compatibility rules work correctly
3. Check that fix queries are valid SQL
4. Test in different browsers (Chrome, Firefox, Safari)

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Questions?

Feel free to open an issue for any questions!
