/** Mensagens entre o popup, o script das páginas e o fundo da extensão. */

export type ContaResumo = { id: string; titulo: string; usuario: string; url: string };

export type PendenteResumo = {
  host: string;
  usuario: string;
  tipo: 'nova' | 'atualizar' | 'travado';
  titulo?: string;
};

export type Estado = {
  configurado: boolean;
  aberto: boolean;
  identificador: string;
  nome: string;
  travaMinutos: number;
  /** O servidor pediu o segundo fator e o token da sessão acabou. */
  precisaFator: string[];
  pendentesEnvio: number;
  ultimaSync: number;
  avisoSync: string;
};

export type PedidoPopup =
  | { tipo: 'estado' }
  | { tipo: 'conectar'; identificador: string; senha: string }
  | { tipo: 'destravar'; senha: string }
  | { tipo: 'travar' }
  | { tipo: 'desconectar' }
  | { tipo: 'sincronizar'; fator?: { tipo: 'totp' | 'recuperacao'; codigo: string } }
  | { tipo: 'contas'; host: string | null }
  | { tipo: 'preencherAba'; abaId: number; id: string }
  | { tipo: 'copiar'; id: string; campo: 'senha' | 'usuario' }
  | { tipo: 'pendenteDaAba'; abaId: number }
  | { tipo: 'decidirPendente'; abaId: number; guardar: boolean }
  | { tipo: 'travaMinutos'; minutos: number }
  | { tipo: 'gerar' };

export type PedidoPagina =
  | { tipo: 'sugestoes' }
  | { tipo: 'preencher'; id: string }
  | { tipo: 'capturar'; usuario: string; senha: string }
  | { tipo: 'pendente' }
  | { tipo: 'decidir'; guardar: boolean }
  | { tipo: 'abrirPopup' };

export type Pedido = (PedidoPopup | PedidoPagina) & { origem: 'popup' | 'pagina' };

export type Resposta<T = unknown> = { ok: true; dados: T } | { ok: false; erro: string };

/** Fundo → página: preencher estes campos agora. */
export type OrdemPagina =
  | { tipo: 'broquel:preencher'; usuario: string; senha: string }
  | { tipo: 'broquel:mostrarPendente' };
