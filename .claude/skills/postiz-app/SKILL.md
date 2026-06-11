```markdown
# postiz-app Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `postiz-app` TypeScript codebase. It covers file organization, import/export styles, commit message habits, and testing patterns. This guide is designed to help contributors quickly align with the project's established practices.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userProfile.ts`, `postList.test.ts`

### Import Style
- Use **relative imports** for internal modules.
  - Example:
    ```typescript
    import { getUser } from './userService';
    ```

### Export Style
- Both **named** and **default exports** are used.
  - Named export example:
    ```typescript
    export function createPost() { ... }
    ```
  - Default export example:
    ```typescript
    export default PostList;
    ```

### Commit Messages
- **Freeform** style (no enforced prefixes).
- Average length: ~61 characters.
- Example:
  ```
  Add support for editing post titles in the UI
  ```

## Workflows

### Add a New Feature
**Trigger:** When implementing a new feature or module.
**Command:** `/add-feature`

1. Create a new file using camelCase naming (e.g., `newFeature.ts`).
2. Use relative imports to include dependencies.
3. Export your main function or component (named or default).
4. Write corresponding tests in a `.test.ts` file.
5. Commit with a clear, descriptive message.

### Fix a Bug
**Trigger:** When resolving a bug in the codebase.
**Command:** `/fix-bug`

1. Locate the relevant file using camelCase naming.
2. Apply the fix and update logic as needed.
3. Update or add tests in the corresponding `.test.ts` file.
4. Commit with a message describing the fix.

### Write and Run Tests
**Trigger:** When adding or updating tests.
**Command:** `/run-tests`

1. Create or update test files using the `*.test.ts` pattern.
2. Ensure tests cover new or changed functionality.
3. Run the tests using the project's test runner (framework not specified; check project docs or scripts).
4. Commit test changes with a descriptive message.

## Testing Patterns

- Test files use the `*.test.ts` naming convention.
  - Example: `postService.test.ts`
- Testing framework is **unknown**; consult project documentation or scripts for details.
- Place tests alongside or near the modules they test.

**Example test file:**
```typescript
// postService.test.ts
import { getPosts } from './postService';

test('should fetch posts', () => {
  const posts = getPosts();
  expect(posts.length).toBeGreaterThan(0);
});
```

## Commands
| Command      | Purpose                                 |
|--------------|-----------------------------------------|
| /add-feature | Scaffold and document a new feature     |
| /fix-bug     | Guide for fixing and documenting a bug  |
| /run-tests   | Steps for writing and running tests     |
```
