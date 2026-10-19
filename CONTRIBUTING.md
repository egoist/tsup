# Contributing

## Making changes

1. Fork the repository.
2. Checkout a new branch from main.
3. Make changes.
4. If necessary, add tests in `test/`.
5. Run tests with `pnpm test`.
6. Commit changes and push to your fork.
7. Create a pull request.

## Release changes

> Only maintainers can release new versions.

1. Merge PRs into main branch.
2. Change version in `package.json`.
3. Push main branch to remote with `git push`.
4. Create a new tag and push it to remote.
5. GitHub action will create a release and publish it to npm.

Feel free to improve this process by creating an issue or PR.
