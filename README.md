# Testes de API com Playwright - Biblioteca

Projeto de testes automatizados de API usando `APIRequestContext` do Playwright
contra a API da Biblioteca (https://github.com/Brencosta/api-testing-playwright).

## Pré-requisitos

- Node.js 18 ou superior
- API da Biblioteca rodando localmente em `http://localhost:3000`

## Como rodar a API

```bash
git clone https://github.com/Brencosta/api-testing-playwright.git
cd api-testing-playwright
npm install
npm run dev

```
## Estrutura
.
├── tests/
│   └── livros.spec.ts
├── playwright.config.ts
├── package.json
└── tsconfig.json


Livros - cadastro como administrador

    Login como admin@biblioteca.com retorna token Bearer.

    POST /api/livros com o token retorna 201, com id, createdAt e os
    mesmos dados enviados.

    Teardown: o livro criado é excluído ao final do teste.

Livros - cadastro sem autenticação

    POST /api/livros sem token retorna 401 com erro: "Token não informado".

    Confirma que nenhum livro foi persistido após a recusa.

Empréstimos - livro sem exemplares

    POST /api/emprestimos para o livro 4 ("Vidas Secas", sem estoque) retorna
    409 com erro: "Livro indisponível".

    Confirma que nenhum empréstimo foi criado após a recusa.

Observações

    Cada bloco de testes reaplica o seed via POST /api/test/seed no beforeAll,
    então os testes rodam em qualquer ordem e em paralelo.

    Os testes que criam dados fazem o teardown no afterAll.

    Os testes que esperam erro validam o formato padrão da API:
    { erro, detalhes[], status }.
