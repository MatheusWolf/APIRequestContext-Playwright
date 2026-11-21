import { test, expect, APIRequestContext } from '@playwright/test';

/*
Adicionar no arquivo playwright.config.ts para rodar o endpoint da API
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: {
      Accept: 'application/json',
*/


// Autenticação  -------------------------------------------------------------


async function login(
  request: APIRequestContext,
  email: string,
  senha: string,
): Promise<string> {
  const response = await request.post('/api/auth/login', {
    data: { email, senha },
  });
  expect(response.status(), 'Login deveria retornar 200').toBe(200);

  const body = await response.json();
  expect(body.tipo).toBe('Bearer');
  expect(typeof body.token).toBe('string');
  expect(body.token.length).toBeGreaterThan(0);
  return body.token;
}

/** Valida o formato padrão de erro da API: { erro, detalhes[], status }. */
function expectErroPadrao(
  body: { erro: string; detalhes: unknown[]; status: number },
  statusHttp: number,
  mensagemEsperada: string,
) {
  expect(body).toHaveProperty('erro');
  expect(body).toHaveProperty('detalhes');
  expect(body).toHaveProperty('status');
  expect(typeof body.erro).toBe('string');
  expect(Array.isArray(body.detalhes)).toBe(true);
  expect(body.status).toBe(statusHttp);
  expect(body.erro).toBe(mensagemEsperada);
}

// Cenário 1: consulta do livro de id 1  -----------------------------------------


test.describe('Livros - consulta por id', () => {
  test.beforeAll(async ({ request }) => {
    const seed = await request.post('/api/test/seed');
    expect(seed.status(), 'Falha ao aplicar o seed da API').toBe(200);
  });

  test('GET /api/livros/1 retorna 200, título "Dom Casmurro" e disponível', async ({ request }) => {
    const response = await request.get('/api/livros/1');
    expect(response.status()).toBe(200);

    const livro = await response.json();
    expect(livro.id).toBe(1);
    expect(livro.titulo).toBe('Dom Casmurro');
    expect(livro.disponivel).toBe(true);
    expect(livro.autor).toBe('Machado de Assis');
    expect(livro.quantidadeDisponivel).toBeGreaterThan(0);
  });
});


// Cenário 2: login admin -> cadastro de livro -> validação -> teardown  -----


test.describe('Livros - cadastro como administrador', () => {
  let token: string;
  let livroCriadoId: number | undefined;

  test.beforeAll(async ({ request }) => {
    const seed = await request.post('/api/test/seed');
    expect(seed.status()).toBe(200);
    token = await login(request, 'admin@biblioteca.com', 'Admin@123');
  });

  test.afterAll(async ({ request }) => {
    if (livroCriadoId !== undefined) {
      const del = await request.delete(`/api/livros/${livroCriadoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect([204, 404]).toContain(del.status());
    }
  });

  test('POST /api/livros (admin) retorna 201 com id e os mesmos dados enviados', async ({ request }) => {
    const sufixo = Date.now().toString().slice(-6);
    const isbn = `9788500${sufixo}`;

    const payload = {
      titulo: `Livro de Teste ${sufixo}`,
      autor: 'Autor de Teste',
      isbn,
      anoPublicacao: 2020,
      quantidade: 2,
    };

    const response = await request.post('/api/livros', {
      headers: { Authorization: `Bearer ${token}` },
      data: payload,
    });

    expect(response.status(), 'Cadastro de livro deveria retornar 201').toBe(201);

    const criado = await response.json();
    expect(typeof criado.id).toBe('number');
    expect(criado.id).toBeGreaterThan(0);
    livroCriadoId = criado.id;

    expect(criado).toMatchObject(payload);
    expect(criado.quantidadeDisponivel).toBe(payload.quantidade);
    expect(criado.disponivel).toBe(true);
    expect(typeof criado.createdAt).toBe('string');
    expect(() => new Date(criado.createdAt).toISOString()).not.toThrow();

    const getResponse = await request.get(`/api/livros/${livroCriadoId}`);
    expect(getResponse.status()).toBe(200);
    const lido = await getResponse.json();
    expect(lido).toMatchObject(criado);
  });
});


// Cenário 3: cadastro sem token -> 401  -------------------------------------


test.describe('Livros - cadastro sem autenticação', () => {
  test.beforeAll(async ({ request }) => {
    const seed = await request.post('/api/test/seed');
    expect(seed.status()).toBe(200);
  });

  test('POST /api/livros sem token retorna 401 "Token não informado"', async ({ request }) => {
    // Não envia o header Authorization. Payload é válido de propósito,
    // para garantir que a recusa é por falta de autenticação (401)
    // e não por validação de payload (422).
    const payload = {
      titulo: 'As aventuras do Galaxy Buds FE',
      autor: 'Matheus Wolf',
      isbn: '209202600000',
      anoPublicacao: 2026,
      quantidade: 1,
    };

    const response = await request.post('/api/livros', { data: payload });

    expect(response.status(), 'Sem token deveria recusar com 401').toBe(401);

    const body = await response.json();
    expectErroPadrao(body, 401, 'Token não informado');
  });

  test('nenhum livro "As aventuras do Galaxy Buds FE" foi persistido', async ({ request }) => {
    // Garantia de que o 401 realmente bloqueou a escrita:
    // o GET é público e pode ser feito sem token.
    const response = await request.get('/api/livros', {
      params: { autor: 'Matheus Wolf' },
    });
    expect(response.status()).toBe(200);
    const lista = await response.json();
    expect(lista).toEqual([]);
  });
});


// Cenário 4: emprestar livro indisponível -> 409 "Livro indisponível"  ------

test.describe('Empréstimos - livro sem exemplares', () => {
  let tokenLeitor: string;

  test.beforeAll(async ({ request }) => {
    // Seed garante: livro 4 = "Vidas Secas", quantidade 0, disponivel false;
    // leitor@biblioteca.com sem empréstimos ativos (não esbarra no limite de 3).
    const seed = await request.post('/api/test/seed');
    expect(seed.status()).toBe(200);

    tokenLeitor = await login(request, 'leitor@biblioteca.com', 'Leitor@123');
  });

  test('POST /api/emprestimos do livro 4 (Vidas Secas) retorna 409 "Livro indisponível"', async ({ request }) => {
    // Sanidade: confirma o estado do seed antes de tentar o empréstimo
    const livro = await request.get('/api/livros/4');
    expect(livro.status()).toBe(200);
    const dadosLivro = await livro.json();
    expect(dadosLivro.titulo).toBe('Vidas Secas');
    expect(dadosLivro.quantidade).toBe(0);
    expect(dadosLivro.quantidadeDisponivel).toBe(0);
    expect(dadosLivro.disponivel).toBe(false);

    const response = await request.post('/api/emprestimos', {
      headers: { Authorization: `Bearer ${tokenLeitor}` },
      data: { livroId: 4 },
    });

    expect(response.status(), 'Livro sem estoque deveria retornar 409').toBe(409);

    const body = await response.json();
    expectErroPadrao(body, 409, 'Livro indisponível');
  });

  test('nenhum empréstimo foi criado para o livro 4', async ({ request }) => {
    // O leitor não deve ter empréstimos após a tentativa falha.
    const response = await request.get('/api/emprestimos', {
      headers: { Authorization: `Bearer ${tokenLeitor}` },
    });
    expect(response.status()).toBe(200);

    const emprestimos = await response.json();
    const doLivro4 = emprestimos.filter(
      (e: { livroId: number }) => e.livroId === 4,
    );
    expect(doLivro4).toEqual([]);
  });
});