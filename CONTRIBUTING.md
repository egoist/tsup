# Contributing

## Making changes

1. Fork the repository.
2. Make changes.
3. Add tests in `test/`.
4. Run tests with `pnpm test`.

## Release changes

1. Merge PRs into dev branch.
2. Merge dev branch into main branch with `git checkout main && git merge dev`
3. Push main branch to remote with `git push`
4. GitHub action will create a release and publish it to npm.

Feel free to improve this process by creating an issue or PR.
