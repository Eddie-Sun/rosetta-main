# Generate Conventional Commit Message

Use the Conventional Commit Messages specification to generate commit messages.

The commit message should be structured as follows:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Commit Types

The commit contains the following structural elements, to communicate intent to the consumers of your library:

- **fix:** a commit of the type fix patches a bug in your codebase (this correlates with PATCH in Semantic Versioning).
- **feat:** a commit of the type feat introduces a new feature to the codebase (this correlates with MINOR in Semantic Versioning).
- **BREAKING CHANGE:** a commit that has a footer BREAKING CHANGE:, or appends a ! after the type/scope, introduces a breaking API change (correlating with MAJOR in Semantic Versioning). A BREAKING CHANGE can be part of commits of any type.
- **types other than fix: and feat:** are allowed, for example @commitlint/config-conventional (based on the Angular convention) recommends:
  - **build:** changes that affect the build system or external dependencies
  - **chore:** changes to the build process or auxiliary tools
  - **ci:** changes to CI configuration files and scripts
  - **docs:** documentation only changes
  - **style:** changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.)
  - **refactor:** a code change that neither fixes a bug nor adds a feature
  - **perf:** a code change that improves performance
  - **test:** adding missing tests or correcting existing tests
- footers other than BREAKING CHANGE: <description> may be provided and follow a convention similar to git trailer format.
- Additional types are not mandated by the Conventional Commits specification, and have no implicit effect in Semantic Versioning (unless they include a BREAKING CHANGE).
- A scope may be provided to a commit's type, to provide additional contextual information and is contained within parenthesis, e.g., `feat(parser): add ability to parse arrays`.

## Specification Details

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

1. Commits MUST be prefixed with a type, which consists of a noun, feat, fix, etc., followed by the OPTIONAL scope, OPTIONAL !, and REQUIRED terminal colon and space.
2. The type **feat** MUST be used when a commit adds a new feature to your application or library.
3. The type **fix** MUST be used when a commit represents a bug fix for your application.
4. A scope MAY be provided after a type. A scope MUST consist of a noun describing a section of the codebase surrounded by parenthesis, e.g., `fix(parser):`
5. A description MUST immediately follow the colon and space after the type/scope prefix. The description is a short summary of the code changes, e.g., `fix: array parsing issue when multiple spaces were contained in string`.
6. A longer commit body MAY be provided after the short description, providing additional contextual information about the code changes. The body MUST begin one blank line after the description.
7. A commit body is free-form and MAY consist of any number of newline separated paragraphs.
8. One or more footers MAY be provided one blank line after the body. Each footer MUST consist of a word token, followed by either a `:<space>` or `<space>#` separator, followed by a string value (this is inspired by the git trailer convention).
9. A footer's token MUST use - in place of whitespace characters, e.g., `Acked-by` (this helps differentiate the footer section from a multi-paragraph body). An exception is made for BREAKING CHANGE, which MAY also be used as a token.
10. A footer's value MAY contain spaces and newlines, and parsing MUST terminate when the next valid footer token/separator pair is observed.
11. Breaking changes MUST be indicated in the type/scope prefix of a commit, or as an entry in the footer.
12. If included as a footer, a breaking change MUST consist of the uppercase text BREAKING CHANGE, followed by a colon, space, and description, e.g., `BREAKING CHANGE: environment variables now take precedence over config files`.
13. If included in the type/scope prefix, breaking changes MUST be indicated by a ! immediately before the :. If ! is used, BREAKING CHANGE: MAY be omitted from the footer section, and the commit description SHALL be used to describe the breaking change.
14. Types other than feat and fix MAY be used in your commit messages, e.g., `docs: update ref docs`.
15. The units of information that make up Conventional Commits MUST NOT be treated as case sensitive by implementors, with the exception of BREAKING CHANGE which MUST be uppercase.
16. BREAKING-CHANGE MUST be synonymous with BREAKING CHANGE, when used as a token in a footer.

## Examples

### Basic Examples

```
feat: add user authentication
fix: resolve memory leak in data processor
docs: update API documentation
style: format code according to style guide
refactor: simplify user validation logic
perf: optimize database query performance
test: add unit tests for payment module
chore: update dependencies
```

### With Scope

```
feat(parser): add ability to parse arrays
fix(auth): correct token expiration handling
docs(api): update endpoint documentation
refactor(utils): extract common validation logic
```

### With Body

```
fix: resolve memory leak in data processor

The memory leak was caused by not properly releasing
database connections after query execution. This change
ensures all connections are closed in finally blocks.

Closes #123
```

### Breaking Change (with !)

```
feat!: change authentication API

BREAKING CHANGE: The authentication API now requires
a token parameter instead of username/password.
Migration guide available in docs/migration.md.
```

### Breaking Change (footer only)

```
feat: add new payment processing system

BREAKING CHANGE: The payment API endpoint has changed
from /api/payment to /api/v2/payment. All clients
must update their integration.
```

### With Multiple Footers

```
fix: resolve issue with date formatting

The date formatter was not handling timezone offsets
correctly for dates in the past.

Fixes #456
Reviewed-by: John Doe
Acked-by: Jane Smith
```

## Best Practices

1. Use the imperative mood in the subject line ("add feature" not "added feature" or "adds feature")
2. Keep the subject line under 50 characters when possible
3. Capitalize the subject line
4. Do not end the subject line with a period
5. Use the body to explain what and why vs. how
6. Reference issues and pull requests in the footer when applicable
7. Use scopes to indicate which part of the codebase is affected
8. Be consistent with scope naming across the project


