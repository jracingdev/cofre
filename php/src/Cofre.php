<?php

declare(strict_types=1);

namespace Broquel\Cripto;

/**
 * Mesmo formato da biblioteca TypeScript. Serve para o futuro servidor conferir
 * blobs e assinaturas, e para os vetores provarem que os bytes coincidem.
 */
final class Cofre
{
    public const VERSAO = 1;
    public const MAGIC = 'COFRE';
    public const TIPO_CABECALHO = 1;
    public const TIPO_ITEM = 2;
    public const TIPO_BACKUP = 3;
    public const FLAGS_V1 = 1;
    public const KDF_ARGON2ID = 2;
    public const CONTEXTO_KDF = 'COFRE_K1';
    public const SUBCHAVE_EMBRULHO = 1;
    public const PROPOSITO_SENHA = 1;
    public const PROPOSITO_KIT = 2;
    public const PROPOSITO_ITEM = 0x10;
    public const PROPOSITO_DESAFIO = 0x20;
    public const TAMANHO_WRAP = 136;
    public const TAMANHO_CABECALHO = 357;
    public const PREFIXO_ITEM = 84;
    public const DOMINIO_NOME = 'cofre.nome.v1';
    public const BLOCO = 1024;
    public const OPSLIMIT_PADRAO = 4;
    public const MEMLIMIT_PADRAO = 268435456;
    public const OPSLIMIT_TETO = 10;
    public const MEMLIMIT_TETO = 1073741824;
    public const SENHA_MIN = 12;
    public const SENHA_MAX = 256;
    public const MAX_CONTEUDO = 1048576;
    public const MAX_ITENS_BACKUP = 10000;
    public const MAX_BACKUP_BYTES = 33554432;

    /** @param array{opslimit: int, memlimit: int} $parametros */
    public static function criar(string $senha, array $parametros, bool $permitirFracos = false): array
    {
        self::validarParametros($parametros, $permitirFracos ? 'teste' : 'criar');
        $senhaBytes = self::normalizarSenha($senha);
        $salt = random_bytes(16);
        $cofreId = random_bytes(16);
        $chaveCofre = random_bytes(32);
        $par = sodium_crypto_sign_keypair();
        $authSk = sodium_crypto_sign_secretkey($par);
        $authPk = sodium_crypto_sign_publickey($par);
        $kitSegredo = random_bytes(32);
        $segredo = $chaveCofre . $authSk;
        $chaveMestra = self::derivarChaveMestraBytes($senhaBytes, $salt, $parametros);
        $embrulhoSenha = self::derivarChaveEmbrulho($chaveMestra);
        sodium_memzero($chaveMestra);
        $wrapSenha = self::embrulhar(
            $embrulhoSenha,
            random_bytes(24),
            self::aadSenha($cofreId, $parametros['opslimit'], $parametros['memlimit'], $salt, $authPk),
            $segredo,
        );
        sodium_memzero($embrulhoSenha);
        $embrulhoKit = self::derivarChaveEmbrulho($kitSegredo);
        $wrapKit = self::embrulhar($embrulhoKit, random_bytes(24), self::aadKit($cofreId, $authPk), $segredo);
        sodium_memzero($embrulhoKit);
        sodium_memzero($segredo);
        $cabecalho = self::montarCabecalho($cofreId, $parametros, $salt, $authPk, $wrapSenha, $wrapKit);
        $kit = self::codificarKit($kitSegredo);
        sodium_memzero($kitSegredo);
        sodium_memzero($senhaBytes);

        return [
            'cabecalho' => $cabecalho,
            'kit' => $kit,
            'sessao' => new Sessao($cofreId, $chaveCofre, $authSk, $authPk),
        ];
    }

    public static function abrir(string $cabecalho, string $senha): Sessao
    {
        $cab = self::lerCabecalho($cabecalho);
        $senhaBytes = self::normalizarSenha($senha);
        $chaveMestra = self::derivarChaveMestraBytes($senhaBytes, $cab['salt'], $cab);
        sodium_memzero($senhaBytes);
        $embrulho = self::derivarChaveEmbrulho($chaveMestra);
        sodium_memzero($chaveMestra);
        $segredo = self::desenbrulhar(
            $embrulho,
            $cab['wrapSenha'],
            self::aadSenha($cab['cofreId'], $cab['opslimit'], $cab['memlimit'], $cab['salt'], $cab['pk']),
        );
        sodium_memzero($embrulho);

        return self::sessaoDoSegredo($cab, $segredo);
    }

    public static function abrirComKit(string $cabecalho, string $kit): Sessao
    {
        $cab = self::lerCabecalho($cabecalho);
        $kitSegredo = self::decodificarKit($kit);
        $embrulho = self::derivarChaveEmbrulho($kitSegredo);
        sodium_memzero($kitSegredo);
        $segredo = self::desenbrulhar($embrulho, $cab['wrapKit'], self::aadKit($cab['cofreId'], $cab['pk']));
        sodium_memzero($embrulho);

        return self::sessaoDoSegredo($cab, $segredo);
    }

    /** @param array{opslimit: int, memlimit: int} $parametros */
    public static function derivarChaveMestra(string $senha, string $salt, array $parametros): string
    {
        self::validarParametros($parametros, 'teste');
        $bytes = self::normalizarSenha($senha);
        try {
            return self::derivarChaveMestraBytes($bytes, $salt, $parametros);
        } finally {
            sodium_memzero($bytes);
        }
    }

    public static function derivarChaveEmbrulho(string $chave): string
    {
        if (strlen($chave) !== 32) {
            throw new ErroCofre('formato_invalido', 'Chave de derivação com tamanho inválido.');
        }

        return sodium_crypto_kdf_derive_from_key(32, self::SUBCHAVE_EMBRULHO, self::CONTEXTO_KDF, $chave);
    }

    public static function aadSenha(string $cofreId, int $opslimit, int $memlimit, string $salt, string $pk): string
    {
        return self::MAGIC
            . chr(self::VERSAO)
            . chr(self::TIPO_CABECALHO)
            . chr(self::PROPOSITO_SENHA)
            . $cofreId
            . chr(self::KDF_ARGON2ID)
            . self::u32($opslimit)
            . self::u64($memlimit)
            . $salt
            . $pk;
    }

    public static function aadKit(string $cofreId, string $pk): string
    {
        return self::MAGIC . chr(self::VERSAO) . chr(self::TIPO_CABECALHO) . chr(self::PROPOSITO_KIT) . $cofreId . $pk;
    }

    /** BLAKE2b-128 de cofre.nome.v1 || identificador do cofre. 16 bytes. */
    public static function idNome(string $cofreId): string
    {
        if (strlen($cofreId) !== 16) {
            throw new ErroCofre('formato_invalido', 'Identificador do cofre inválido.');
        }

        return sodium_crypto_generichash(self::DOMINIO_NOME . $cofreId, '', 16);
    }

    /** @param array{cofreId: string, itemId: string, revisao: int, criadoEm: int, atualizadoEm: int, apagado: bool} $meta */
    public static function aadItem(array $meta): string
    {
        return self::MAGIC . chr(self::VERSAO) . chr(self::TIPO_ITEM) . chr(self::PROPOSITO_ITEM) . self::camposItem($meta);
    }

    public static function montarMensagemDesafio(string $cofreId, string $desafio): string
    {
        if (strlen($cofreId) !== 16 || strlen($desafio) !== 32) {
            throw new ErroCofre('formato_invalido', 'Desafio ou cofre com tamanho inválido.');
        }

        return self::MAGIC . chr(self::VERSAO) . chr(self::PROPOSITO_DESAFIO) . $cofreId . $desafio;
    }

    public static function embrulhar(string $chave, string $nonce, string $aad, string $segredo): string
    {
        if (strlen($chave) !== 32 || strlen($nonce) !== 24 || strlen($segredo) !== 96) {
            throw new ErroCofre('formato_invalido', 'Embrulho com tamanho inválido.');
        }

        return $nonce . sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($segredo, $aad, $nonce, $chave);
    }

    public static function desenbrulhar(string $chave, string $blob, string $aad): string
    {
        if (strlen($blob) !== self::TAMANHO_WRAP) {
            throw new ErroCofre('formato_invalido', 'Embrulho com tamanho inválido.');
        }
        $claro = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(
            substr($blob, 24),
            $aad,
            substr($blob, 0, 24),
            $chave,
        );
        if ($claro === false) {
            throw new ErroCofre('autenticacao_falhou', 'Não foi possível autenticar os dados.');
        }
        if (strlen($claro) !== 96) {
            throw new ErroCofre('formato_invalido', 'O segredo do cofre veio com tamanho inesperado.');
        }

        return $claro;
    }

    /** @param array{opslimit: int, memlimit: int} $parametros */
    public static function montarCabecalho(
        string $cofreId,
        array $parametros,
        string $salt,
        string $pk,
        string $wrapSenha,
        string $wrapKit,
    ): string {
        self::validarParametros($parametros, 'teste');
        $bytes = self::MAGIC
            . chr(self::VERSAO)
            . chr(self::TIPO_CABECALHO)
            . chr(self::FLAGS_V1)
            . $cofreId
            . chr(self::KDF_ARGON2ID)
            . self::u32($parametros['opslimit'])
            . self::u64($parametros['memlimit'])
            . $salt
            . $pk
            . $wrapSenha
            . $wrapKit;
        if (strlen($bytes) !== self::TAMANHO_CABECALHO) {
            throw new ErroCofre('formato_invalido', 'Cabeçalho com tamanho inesperado.');
        }

        return $bytes;
    }

    /**
     * @return array{
     *   cofreId: string, opslimit: int, memlimit: int, salt: string, pk: string, wrapSenha: string, wrapKit: string
     * }
     */
    public static function lerCabecalho(string $bytes): array
    {
        if (strlen($bytes) !== self::TAMANHO_CABECALHO) {
            throw new ErroCofre('formato_invalido', 'Cabeçalho com tamanho inválido.');
        }
        self::exigirCabeca($bytes, self::TIPO_CABECALHO);
        if (ord($bytes[7]) !== self::FLAGS_V1) {
            throw new ErroCofre('formato_invalido', 'Bandeiras do cabeçalho não são as da versão 1.');
        }
        if (ord($bytes[24]) !== self::KDF_ARGON2ID) {
            throw new ErroCofre('formato_invalido', 'Função de derivação desconhecida.');
        }
        $opslimit = self::lerU32($bytes, 25);
        $memlimit = self::lerU64($bytes, 29);
        self::validarParametros(['opslimit' => $opslimit, 'memlimit' => $memlimit], 'abrir');

        return [
            'cofreId' => substr($bytes, 8, 16),
            'opslimit' => $opslimit,
            'memlimit' => $memlimit,
            'salt' => substr($bytes, 37, 16),
            'pk' => substr($bytes, 53, 32),
            'wrapSenha' => substr($bytes, 85, self::TAMANHO_WRAP),
            'wrapKit' => substr($bytes, 221, self::TAMANHO_WRAP),
        ];
    }

    /** @param array{cofreId: string, itemId: string, revisao: int, criadoEm: int, atualizadoEm: int, apagado: bool} $meta */
    public static function cifrarItem(string $chave, array $meta, string $conteudo, string $nonce): string
    {
        if (strlen($chave) !== 32 || strlen($nonce) !== 24) {
            throw new ErroCofre('formato_invalido', 'Chave ou nonce do item inválido.');
        }
        if (strlen($conteudo) > self::MAX_CONTEUDO) {
            throw new ErroCofre('limite_excedido', 'O item passa do tamanho máximo.');
        }
        $quadro = self::fecharQuadro($conteudo);
        $cifrado = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($quadro, self::aadItem($meta), $nonce, $chave);
        sodium_memzero($quadro);

        return self::MAGIC . chr(self::VERSAO) . chr(self::TIPO_ITEM) . self::camposItem($meta) . $nonce . $cifrado;
    }

    /** @return array{meta: array<string, mixed>, conteudo: string} */
    public static function decifrarItem(string $chave, string $blob): array
    {
        $meta = self::lerPrefixoItem($blob);
        $quadro = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(
            substr($blob, self::PREFIXO_ITEM),
            self::aadItem($meta),
            substr($blob, self::PREFIXO_ITEM - 24, 24),
            $chave,
        );
        if ($quadro === false) {
            throw new ErroCofre('autenticacao_falhou', 'Não foi possível autenticar os dados.');
        }
        try {
            return ['meta' => $meta, 'conteudo' => self::abrirQuadro($quadro)];
        } finally {
            sodium_memzero($quadro);
        }
    }

    /** @return array{cofreId: string, itemId: string, revisao: int, criadoEm: int, atualizadoEm: int, apagado: bool} */
    public static function lerPrefixoItem(string $blob): array
    {
        $minimo = self::PREFIXO_ITEM + self::BLOCO + 16;
        if (strlen($blob) < $minimo) {
            throw new ErroCofre('formato_invalido', 'Item truncado.');
        }
        self::exigirCabeca($blob, self::TIPO_ITEM);
        $apagado = ord($blob[59]);
        if ($apagado !== 0 && $apagado !== 1) {
            throw new ErroCofre('formato_invalido', 'Marca de exclusão inválida.');
        }
        $meta = [
            'cofreId' => substr($blob, 7, 16),
            'itemId' => substr($blob, 23, 16),
            'revisao' => self::lerU32($blob, 39),
            'criadoEm' => self::lerU64($blob, 43),
            'atualizadoEm' => self::lerU64($blob, 51),
            'apagado' => $apagado === 1,
        ];
        self::validarMeta($meta);
        $tamanho = strlen($blob) - self::PREFIXO_ITEM;
        if ($tamanho < self::BLOCO + 16 || ($tamanho - 16) % self::BLOCO !== 0) {
            throw new ErroCofre('formato_invalido', 'Tamanho do texto cifrado inválido.');
        }

        return $meta;
    }

    /** @param list<string> $itens */
    public static function montarBackup(string $cabecalho, array $itens): string
    {
        $cab = self::lerCabecalho($cabecalho);
        if (count($itens) > self::MAX_ITENS_BACKUP) {
            throw new ErroCofre('limite_excedido', 'Backup com itens demais.');
        }
        $bytes = self::MAGIC . chr(self::VERSAO) . chr(self::TIPO_BACKUP) . chr(self::FLAGS_V1)
            . $cab['cofreId'] . self::u32(strlen($cabecalho)) . $cabecalho . self::u32(count($itens));
        foreach ($itens as $item) {
            $meta = self::lerPrefixoItem($item);
            if (!hash_equals($meta['cofreId'], $cab['cofreId'])) {
                throw new ErroCofre('formato_invalido', 'Item de outro cofre no backup.');
            }
            $bytes .= self::u32(strlen($item)) . $item;
        }
        if (strlen($bytes) > self::MAX_BACKUP_BYTES) {
            throw new ErroCofre('limite_excedido', 'Backup passa do tamanho máximo.');
        }

        return $bytes;
    }

    public static function codificarKit(string $segredo): string
    {
        if (strlen($segredo) !== 32) {
            throw new ErroCofre('kit_invalido', 'Kit de recuperação inválido.');
        }
        $soma = substr(sodium_crypto_generichash('cofre.kit.v1' . $segredo, '', 16), 0, 4);

        return 'cofre1.'
            . sodium_bin2base64($segredo, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING)
            . '.'
            . sodium_bin2base64($soma, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
    }

    public static function decodificarKit(string $texto): string
    {
        $partes = explode('.', $texto);
        if (count($partes) !== 3 || $partes[0] !== 'cofre1') {
            throw new ErroCofre('kit_invalido', 'Kit de recuperação inválido.');
        }
        try {
            $segredo = sodium_base642bin($partes[1], SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
            $informado = sodium_base642bin($partes[2], SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
        } catch (\SodiumException) {
            throw new ErroCofre('kit_invalido', 'Kit de recuperação inválido.');
        }
        if (strlen($segredo) !== 32 || strlen($informado) !== 4) {
            throw new ErroCofre('kit_invalido', 'Kit de recuperação inválido.');
        }
        $espera = substr(sodium_crypto_generichash('cofre.kit.v1' . $segredo, '', 16), 0, 4);
        if (sodium_memcmp($espera, $informado) !== 0) {
            throw new ErroCofre('kit_invalido', 'O kit de recuperação não confere.');
        }

        return $segredo;
    }

    public static function assinar(string $sk, string $cofreId, string $desafio): string
    {
        return sodium_crypto_sign_detached(self::montarMensagemDesafio($cofreId, $desafio), $sk);
    }

    public static function verificar(string $pk, string $cofreId, string $desafio, string $assinatura): bool
    {
        if (strlen($pk) !== 32 || strlen($assinatura) !== 64) {
            return false;
        }

        return sodium_crypto_sign_verify_detached($assinatura, self::montarMensagemDesafio($cofreId, $desafio), $pk);
    }

    public static function normalizarSenha(string $senha): string
    {
        if (!mb_check_encoding($senha, 'UTF-8')) {
            throw new ErroCofre('senha_recusada', 'A senha tem caracteres inválidos.');
        }
        $nfc = \Normalizer::normalize($senha, \Normalizer::FORM_C);
        if (!is_string($nfc)) {
            throw new ErroCofre('senha_recusada', 'A senha tem caracteres inválidos.');
        }
        $pontos = mb_strlen($nfc, 'UTF-8');
        if ($pontos < self::SENHA_MIN || $pontos > self::SENHA_MAX) {
            throw new ErroCofre('senha_recusada', 'A senha precisa ter entre 12 e 256 caracteres.');
        }

        return $nfc;
    }

    /** @param array{opslimit: int, memlimit: int} $parametros */
    public static function validarParametros(array $parametros, string $modo): void
    {
        $codigo = $modo === 'abrir' ? 'formato_invalido' : 'parametros_fracos';
        $ops = $parametros['opslimit'];
        $mem = $parametros['memlimit'];
        $faixa = $ops >= 1 && $ops <= self::OPSLIMIT_TETO
            && $mem >= 8192 && $mem <= self::MEMLIMIT_TETO
            && $mem % 1024 === 0;
        if (!$faixa) {
            throw new ErroCofre($codigo, 'Parâmetros de derivação inválidos.');
        }
        if ($modo === 'criar' && ($ops < self::OPSLIMIT_PADRAO || $mem < self::MEMLIMIT_PADRAO)) {
            throw new ErroCofre('parametros_fracos', 'Os parâmetros de derivação estão abaixo do piso de segurança.');
        }
    }

    /** @param array{cofreId: string, pk: string, opslimit: int, memlimit: int, salt: string, wrapSenha: string, wrapKit: string} $cab */
    public static function sessaoDoSegredo(array $cab, string $segredo): Sessao
    {
        if (strlen($segredo) !== 96) {
            throw new ErroCofre('formato_invalido', 'O segredo do cofre veio com tamanho inesperado.');
        }
        $chave = substr($segredo, 0, 32);
        $sk = substr($segredo, 32);
        $pk = sodium_crypto_sign_publickey_from_secretkey($sk);
        $confere = sodium_memcmp($pk, $cab['pk']) === 0;
        sodium_memzero($segredo);
        if (!$confere) {
            throw new ErroCofre('autenticacao_falhou', 'Não foi possível abrir o cofre.');
        }

        return new Sessao($cab['cofreId'], $chave, $sk, $pk);
    }

    /** @param array{opslimit: int, memlimit: int} $parametros */
    private static function derivarChaveMestraBytes(string $senha, string $salt, array $parametros): string
    {
        return sodium_crypto_pwhash(
            32,
            $senha,
            $salt,
            $parametros['opslimit'],
            $parametros['memlimit'],
            SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13,
        );
    }

    /** @param array{cofreId: string, itemId: string, revisao: int, criadoEm: int, atualizadoEm: int, apagado: bool} $meta */
    private static function camposItem(array $meta): string
    {
        self::validarMeta($meta);

        return $meta['cofreId']
            . $meta['itemId']
            . self::u32($meta['revisao'])
            . self::u64($meta['criadoEm'])
            . self::u64($meta['atualizadoEm'])
            . chr($meta['apagado'] ? 1 : 0);
    }

    /** @param array{cofreId: string, itemId: string, revisao: int, criadoEm: int, atualizadoEm: int, apagado: bool} $meta */
    private static function validarMeta(array $meta): void
    {
        if (strlen($meta['cofreId']) !== 16 || strlen($meta['itemId']) !== 16) {
            throw new ErroCofre('formato_invalido', 'Identificador com tamanho inválido.');
        }
        if ($meta['revisao'] < 1 || $meta['revisao'] > 0xffffffff) {
            throw new ErroCofre('formato_invalido', 'Revisão inválida.');
        }
        foreach ([$meta['criadoEm'], $meta['atualizadoEm']] as $instante) {
            if ($instante < 0) {
                throw new ErroCofre('formato_invalido', 'Instante inválido.');
            }
        }
    }

    private static function fecharQuadro(string $conteudo): string
    {
        $bruto = 4 + strlen($conteudo);
        $tamanho = (int) (ceil($bruto / self::BLOCO) * self::BLOCO);

        return str_pad(self::u32(strlen($conteudo)) . $conteudo, $tamanho, "\0");
    }

    private static function abrirQuadro(string $quadro): string
    {
        if (strlen($quadro) < self::BLOCO || strlen($quadro) % self::BLOCO !== 0) {
            throw new ErroCofre('formato_invalido', 'Preenchimento do item inválido.');
        }
        $tamanho = self::lerU32($quadro, 0);
        if ($tamanho > self::MAX_CONTEUDO || 4 + $tamanho > strlen($quadro)) {
            throw new ErroCofre('formato_invalido', 'Tamanho do conteúdo inválido.');
        }
        $resto = substr($quadro, 4 + $tamanho);
        if ($resto !== str_repeat("\0", strlen($resto))) {
            throw new ErroCofre('formato_invalido', 'Preenchimento do item não é canônico.');
        }

        return substr($quadro, 4, $tamanho);
    }

    private static function exigirCabeca(string $bytes, int $tipo): void
    {
        if (strlen($bytes) < 7 || substr($bytes, 0, 5) !== self::MAGIC) {
            throw new ErroCofre('formato_invalido', 'Arquivo não reconhecido.');
        }
        if (ord($bytes[5]) !== self::VERSAO) {
            throw new ErroCofre('versao_desconhecida', 'Versão de formato não suportada.');
        }
        if (ord($bytes[6]) !== $tipo) {
            throw new ErroCofre('formato_invalido', 'Tipo de registro inesperado.');
        }
    }

    private static function u32(int $valor): string
    {
        return pack('V', $valor);
    }

    private static function u64(int $valor): string
    {
        if ($valor < 0) {
            throw new ErroCofre('formato_invalido', 'Inteiro fora da faixa.');
        }

        return pack('P', $valor);
    }

    private static function lerU32(string $bytes, int $offset): int
    {
        $valor = unpack('V', substr($bytes, $offset, 4));
        if ($valor === false) {
            throw new ErroCofre('formato_invalido', 'Bloco truncado.');
        }

        return $valor[1];
    }

    private static function lerU64(string $bytes, int $offset): int
    {
        $valor = unpack('P', substr($bytes, $offset, 8));
        if ($valor === false) {
            throw new ErroCofre('formato_invalido', 'Bloco truncado.');
        }

        return $valor[1];
    }
}
