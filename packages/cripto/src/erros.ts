export type CodigoErro =
  | 'formato_invalido'
  | 'versao_desconhecida'
  | 'autenticacao_falhou'
  | 'parametros_fracos'
  | 'kit_invalido'
  | 'senha_recusada'
  | 'estado_invalido'
  | 'limite_excedido'
  | 'gerador_invalido';

/** Erro do cofre. A mensagem não carrega senha, chave nem conteúdo. */
export class ErroCofre extends Error {
  readonly codigo: CodigoErro;

  constructor(codigo: CodigoErro, mensagem: string) {
    super(mensagem);
    this.name = 'ErroCofre';
    this.codigo = codigo;
  }
}
