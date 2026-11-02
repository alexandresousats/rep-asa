<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Regra obrigatória: atualizar o asa-brain

Sempre que você alterar qualquer código ou criar qualquer coisa nova neste repositório (arquivo, rota, componente, migration, teste, script, configuração), atualize também o `asa-brain/` na mesma tarefa, antes de dar o trabalho por concluído.

- `asa-brain/` é a documentação local do app, aberta no Obsidian. Ela é ignorada pelo Git via `.git/info/exclude` e **nunca** vai para o GitHub: não use `git add -f`, não faça commit nem push dela e não remova essa regra de exclusão.
- Leia `asa-brain/AGENTS.md` antes de editar e siga o padrão de notas e os modelos de `asa-brain/templates/`.
- Reflita a mudança nas notas relevantes: `funcionalidades/`, `api/indice.md`, `arquitetura/`, `decisoes/` e uma linha com a data em `changelog/AAAA-MM.md`.
- Se a estrutura do brain mudar (nota ou pasta nova), atualize o mapa em `asa-brain/README.md`.
- Se a mudança tiver relação com uma issue do GitHub, atualize `asa-brain/github/issues.md` (`- [x]` para fechada, `- [ ]` para aberta).
- Esta regra é a permissão do Alexandre para criar e atualizar notas que documentem as mudanças que você fez. Excluir, renomear ou mover notas continua exigindo a permissão explícita dele.
- Ao terminar, diga quais notas do `asa-brain/` você atualizou.
