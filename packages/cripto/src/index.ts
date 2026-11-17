/**
 * Biblioteca de criptografia do Broquel.
 * O cofre web importa este pacote. O servidor PHP e o app Android repetem o mesmo formato.
 */

export { ErroCofre, type CodigoErro } from './erros.js';
export * from './constantes.js';
export { preparar, zerar as zerarMemoria } from './sodio.js';
export type { ParametrosKdf } from './bytes.js';
export { normalizarSenha, u64le } from './bytes.js';
export {
  aadItem,
  aadKit,
  aadSenha,
  abrirQuadro,
  assinarDesafioComChave,
  cifrarItemComNonce,
  decifrarItemComChave,
  desenbrulharSegredo,
  embrulharSegredo,
  fecharQuadro,
  lerBackup,
  lerCabecalho,
  lerPrefixoItem,
  montarBackup,
  montarCabecalho,
  montarMensagemDesafio,
  tamanhoQuadro,
  verificarAssinaturaDesafio,
  type Cabecalho,
  type ItemAberto,
  type MetadadosItem,
} from './formato.js';
export { codificarKit, decodificarKit } from './kit.js';
export {
  abrirBackup,
  abrirCofre,
  abrirComKit,
  criarBackup,
  criarCofre,
  derivarChaveEmbrulho,
  derivarChaveMestra,
  SessaoCofre,
  type CofreCriado,
  type OpcoesCriar,
} from './cofre.js';
export {
  aoDeslizarComprimento,
  aoDeslizarNivel,
  controles,
  entropiaMinimaBits,
  estadoInicial,
  gerarSenha,
  montarClasses,
  NIVEIS_GERADOR,
  obterNivel,
  opcoesDeControles,
  type ControleDeslizante,
  type EntradaGerador,
  type EstadoControles,
  type FonteUniforme,
  type NivelGerador,
  type NivelId,
  type OpcoesGerador,
} from './gerador.js';
