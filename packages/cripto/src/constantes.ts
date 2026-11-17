/**
 * Constantes normativas do formato, versão 1.
 * Os números abaixo são o contrato entre o navegador, o PHP e o futuro app Android.
 */

export const VERSAO_FORMATO = 0x01;

/** ASCII "COFRE". Identifica o arquivo. O nome na tela do aparelho é Broquel. */
export const MAGIC = new Uint8Array([0x43, 0x4f, 0x46, 0x52, 0x45]);

export const TIPO_CABECALHO = 0x01;
export const TIPO_ITEM = 0x02;
export const TIPO_BACKUP = 0x03;

/** Bit 0: o cabeçalho traz o embrulho do kit. Na versão 1 esse bit é obrigatório e os outros ficam em zero. */
export const FLAGS_V1 = 0x01;

/** Igual a crypto_pwhash_ALG_ARGON2ID13. */
export const KDF_ARGON2ID = 0x02;

/** Oito bytes exatos. É o contexto do crypto_kdf. */
export const CONTEXTO_KDF = 'COFRE_K1';

/** Subchave usada para embrulhar o segredo. A subchave 2 fica reservada. */
export const SUBCHAVE_EMBRULHO = 1;

export const PROPOSITO_SENHA = 0x01;
export const PROPOSITO_KIT = 0x02;
export const PROPOSITO_ITEM = 0x10;
export const PROPOSITO_DESAFIO = 0x20;

export const CHAVE_BYTES = 32;
export const SALT_BYTES = 16;
export const NONCE_BYTES = 24;
export const TAG_BYTES = 16;
export const ID_BYTES = 16;
export const PK_BYTES = 32;
export const SK_BYTES = 64;
export const SEGREDO_BYTES = CHAVE_BYTES + SK_BYTES;
export const ASSINATURA_BYTES = 64;
export const DESAFIO_BYTES = 32;
export const CHECKSUM_KIT_BYTES = 4;
export const TAMANHO_WRAP = NONCE_BYTES + SEGREDO_BYTES + TAG_BYTES;

export const OFF_VERSAO = 5;
export const OFF_TIPO = 6;
export const OFF_FLAGS = 7;
export const OFF_COFRE_ID = 8;
export const OFF_KDF_ALG = 24;
export const OFF_OPSLIMIT = 25;
export const OFF_MEMLIMIT = 29;
export const OFF_SALT = 37;
export const OFF_PK = 53;
export const OFF_WRAP_SENHA = 85;
export const OFF_WRAP_KIT = 221;
export const TAMANHO_CABECALHO = OFF_WRAP_KIT + TAMANHO_WRAP;

/** magic+versão+tipo+ids+revisão+datas+apagado+nonce */
export const PREFIXO_ITEM = 84;

/** Piso de criação: 4 voltas e 256 MiB. Acima do preset moderado do libsodium (3 voltas, mesma memória). */
export const OPSLIMIT_PADRAO = 4;
export const MEMLIMIT_PADRAO = 268_435_456;
export const OPSLIMIT_MINIMO = OPSLIMIT_PADRAO;
export const MEMLIMIT_MINIMO = MEMLIMIT_PADRAO;

/** Teto ao abrir, para um cabeçalho adulterado não pedir memória infinita. 1 GiB e 10 voltas. */
export const OPSLIMIT_TETO = 10;
export const MEMLIMIT_TETO = 1_073_741_824;

export const OPSLIMIT_SODIO_MIN = 1;
export const MEMLIMIT_SODIO_MIN = 8192;

export const PARAMETROS_KDF_PADRAO = Object.freeze({
  opslimit: OPSLIMIT_PADRAO,
  memlimit: MEMLIMIT_PADRAO,
});

/**
 * Só para testes e vetores. Um cofre de verdade recusa estes números na criação.
 */
export const PARAMETROS_KDF_TESTE = Object.freeze({
  opslimit: 2,
  memlimit: 8192,
});

export const BLOCO_PREENCHIMENTO = 1024;
export const MAX_CONTEUDO = 1_048_576;
export const MAX_ITENS_BACKUP = 10_000;
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
export const MIN_ITEM_BYTES = PREFIXO_ITEM + BLOCO_PREENCHIMENTO + TAG_BYTES;

export const SENHA_MIN_PONTOS = 12;
export const SENHA_MAX_PONTOS = 256;

/** Maior inteiro que cabe com sinal em 64 bits. PHP e JavaScript concordam nesta faixa. */
export const MAX_I64 = (1n << 63n) - 1n;

export const PREFIXO_KIT = 'cofre1.';
export const DOMINIO_KIT = 'cofre.kit.v1';

export const COMPRIMENTO_MIN = 12;
export const COMPRIMENTO_MAX = 128;

export const ALFABETO_MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz';
export const ALFABETO_MAIUSCULAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const ALFABETO_DIGITOS = '0123456789';
export const ALFABETO_SIMBOLOS = '!#$%*+,-./:;=?@^_~';
export const CARACTERES_AMBIGUOS = '0Ool1I|';
