package app.broquel.cripto

const val VERSAO_FORMATO = 0x01
val MAGIC = byteArrayOf(0x43, 0x4f, 0x46, 0x52, 0x45)
const val TIPO_CABECALHO = 0x01
const val TIPO_ITEM = 0x02
const val FLAGS_V1 = 0x01
const val KDF_ARGON2ID = 0x02
const val CONTEXTO_KDF = "COFRE_K1"
const val SUBCHAVE_EMBRULHO = 1L
const val PROPOSITO_SENHA = 0x01
const val PROPOSITO_KIT = 0x02
const val PROPOSITO_ITEM = 0x10
const val PROPOSITO_DESAFIO = 0x20
const val CHAVE_BYTES = 32
const val NONCE_BYTES = 24
const val TAG_BYTES = 16
const val ID_BYTES = 16
const val SK_BYTES = 64
const val SEGREDO_BYTES = CHAVE_BYTES + SK_BYTES
const val TAMANHO_WRAP = NONCE_BYTES + SEGREDO_BYTES + TAG_BYTES
const val TAMANHO_CABECALHO = 357
const val PREFIXO_ITEM = 84
const val OPSLIMIT_PADRAO = 4
const val MEMLIMIT_PADRAO = 268_435_456L
const val OPSLIMIT_TETO = 10
const val MEMLIMIT_TETO = 1_073_741_824L
const val BLOCO = 1024
const val MAX_CONTEUDO = 1_048_576
const val SENHA_MIN = 12
const val SENHA_MAX = 256
const val DOMINIO_KIT = "cofre.kit.v1"
const val PREFIXO_KIT = "cofre1."
const val COMPRIMENTO_MAX = 128

const val ALFABETO_MINUSCULAS = "abcdefghijklmnopqrstuvwxyz"
const val ALFABETO_MAIUSCULAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const val ALFABETO_DIGITOS = "0123456789"
const val ALFABETO_SIMBOLOS = "!#\$%*+,-./:;=?@^_~"
const val CARACTERES_AMBIGUOS = "0Ool1I|"
