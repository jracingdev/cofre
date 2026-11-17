import { ConflitoSync, ErroSync, type Cabeca, type Pagina, type RespostaAuth, type Transporte } from './sincronia.js';

type Busca = typeof fetch;

export function criarCliente(buscar: Busca = fetch, base = ''): Transporte & ClienteExtra {
  return new ClienteHttp(buscar, base);
}

export type ClienteExtra = {
  cabecalho(cofreId: string): Promise<string>;
  iniciarTotp(token: string): Promise<{ segredo: string; uri: string }>;
  confirmarTotp(token: string, codigo: string): Promise<string[]>;
  opcoesRegistro(token: string): Promise<{ desafio_id: string; opcoes: unknown }>;
  confirmarRegistro(token: string, desafioId: string, credencial: unknown): Promise<void>;
  sessoes(token: string): Promise<Array<{ id: string; nome: string | null; revogada: boolean }>>;
  revogar(token: string, id: string): Promise<void>;
};

class ClienteHttp implements Transporte, ClienteExtra {
  constructor(
    private readonly buscar: Busca,
    private readonly base: string,
  ) {}

  registrar(cabecalhoB64: string): Promise<string> {
    return this.enviar('POST', '/cofre', { cabecalho: cabecalhoB64 }, null).then((json) => String(json.cofre_id));
  }

  cabecalho(cofreId: string): Promise<string> {
    return this.enviar('GET', `/cofre/${cofreId}`, null, null).then((json) => String(json.cabecalho));
  }

  atualizarCabecalho(token: string, cabecalhoB64: string): Promise<void> {
    return this.enviar('PUT', '/cofre', { cabecalho: cabecalhoB64 }, token).then(() => undefined);
  }

  desafio(cofreId: string): Promise<{ desafio_id: string; desafio: string }> {
    return this.enviar('POST', '/auth/desafio', { cofre_id: cofreId }, null).then((json) => ({
      desafio_id: String(json.desafio_id),
      desafio: String(json.desafio),
    }));
  }

  responder(desafioId: string, assinaturaB64: string, aparelhoId: string): Promise<RespostaAuth> {
    return this.enviar('POST', '/auth/responder', {
      desafio_id: desafioId,
      assinatura: assinaturaB64,
      aparelho_id: aparelhoId,
      nome: 'Broquel',
    }, null).then((json) => {
      if (json.estado === 'segundo_fator') {
        return {
          estado: 'segundo_fator',
          pre_token: String(json.pre_token),
          metodos: Array.isArray(json.metodos) ? json.metodos.map(String) : [],
        };
      }
      return { estado: 'sessao', token: String(json.token) };
    });
  }

  totp(preToken: string, codigo: string): Promise<string> {
    return this.enviar('POST', '/auth/totp', { codigo }, preToken).then((json) => String(json.token));
  }

  recuperacao(preToken: string, codigo: string): Promise<string> {
    return this.enviar('POST', '/auth/recuperacao', { codigo }, preToken).then((json) => String(json.token));
  }

  opcoesLogin(preToken: string): Promise<{ desafio_id: string; opcoes: unknown }> {
    return this.enviar('POST', '/webauthn/login/opcoes', {}, preToken).then((json) => ({
      desafio_id: String(json.desafio_id),
      opcoes: json.opcoes,
    }));
  }

  confirmarLogin(preToken: string, desafioId: string, credencial: unknown): Promise<string> {
    return this.enviar('POST', '/webauthn/login', { desafio_id: desafioId, credencial }, preToken).then((json) => String(json.token));
  }

  itens(token: string, cursor: number): Promise<Pagina> {
    return this.enviar('GET', `/itens?cursor=${cursor}&limite=200`, null, token).then((json) => ({
      itens: Array.isArray(json.itens) ? (json.itens as Cabeca[]) : [],
      proximo_cursor: json.proximo_cursor == null ? null : Number(json.proximo_cursor),
      tem_mais: Boolean(json.tem_mais),
    }));
  }

  gravar(token: string, itemId: string, revisaoBase: number, blobB64: string): Promise<Cabeca> {
    return this.enviar('PUT', `/itens/${itemId}`, { revisao_base: revisaoBase, blob: blobB64 }, token).then((json) => json as Cabeca);
  }

  iniciarTotp(token: string): Promise<{ segredo: string; uri: string }> {
    return this.enviar('POST', '/totp/iniciar', {}, token).then((json) => ({
      segredo: String(json.segredo),
      uri: String(json.uri),
    }));
  }

  confirmarTotp(token: string, codigo: string): Promise<string[]> {
    return this.enviar('POST', '/totp/confirmar', { codigo }, token).then((json) => {
      const lista = json.codigos_recuperacao;
      return Array.isArray(lista) ? lista.map(String) : [];
    });
  }

  opcoesRegistro(token: string): Promise<{ desafio_id: string; opcoes: unknown }> {
    return this.enviar('POST', '/webauthn/registro/opcoes', {}, token).then((json) => ({
      desafio_id: String(json.desafio_id),
      opcoes: json.opcoes,
    }));
  }

  confirmarRegistro(token: string, desafioId: string, credencial: unknown): Promise<void> {
    return this.enviar('POST', '/webauthn/registro', { desafio_id: desafioId, credencial }, token).then(() => undefined);
  }

  sessoes(token: string): Promise<Array<{ id: string; nome: string | null; revogada: boolean }>> {
    return this.enviar('GET', '/sessoes', null, token).then((json) => {
      const lista = Array.isArray(json.sessoes) ? json.sessoes : [];
      return lista.map((item) => {
        const sessao = item as { id?: string; nome?: string | null; revogada?: boolean };
        return { id: String(sessao.id), nome: sessao.nome ?? null, revogada: Boolean(sessao.revogada) };
      });
    });
  }

  revogar(token: string, id: string): Promise<void> {
    return this.enviar('DELETE', `/sessoes/${id}`, null, token).then(() => undefined);
  }

  private async enviar(metodo: string, caminho: string, corpo: Record<string, unknown> | null, token: string | null): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (corpo) headers['content-type'] = 'application/json';
    const resposta = await this.buscar(`${this.base}/v1${caminho}`, {
      method: metodo,
      headers,
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
      credentials: 'same-origin',
      referrerPolicy: 'no-referrer',
    });
    const texto = await resposta.text();
    const json = (texto ? JSON.parse(texto) : {}) as Record<string, unknown>;
    if (resposta.status === 409) {
      throw new ConflitoSync((json.item ?? null) as Cabeca | null);
    }
    if (!resposta.ok) {
      throw new ErroSync(String(json.erro ?? 'rede'), String(json.mensagem ?? 'Falha na sincronização.'));
    }
    return json;
  }
}
