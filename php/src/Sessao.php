<?php

declare(strict_types=1);

namespace Broquel\Cripto;

final class Sessao
{
    private bool $travada = false;

    public function __construct(
        private string $cofreId,
        private string $chaveCofre,
        private string $authSk,
        public readonly string $chavePublica,
    ) {
    }

    public function cofreId(): string
    {
        $this->exigirAberta();

        return $this->cofreId;
    }

    public function travar(): void
    {
        if ($this->travada) {
            return;
        }
        sodium_memzero($this->chaveCofre);
        sodium_memzero($this->authSk);
        $this->travada = true;
    }

    /** @param array{cofreId: string, itemId: string, revisao: int, criadoEm: int, atualizadoEm: int, apagado: bool} $meta */
    public function cifrarItem(array $meta, string $conteudo): string
    {
        $this->exigirAberta();
        if (!hash_equals($meta['cofreId'], $this->cofreId)) {
            throw new ErroCofre('estado_invalido', 'O item não pertence a este cofre.');
        }

        return Cofre::cifrarItem($this->chaveCofre, $meta, $conteudo, random_bytes(24));
    }

    /** @return array{meta: array<string, mixed>, conteudo: string} */
    public function decifrarItem(string $blob): array
    {
        $this->exigirAberta();

        return Cofre::decifrarItem($this->chaveCofre, $blob);
    }

    public function assinarDesafio(string $desafio): string
    {
        $this->exigirAberta();

        return Cofre::assinar($this->authSk, $this->cofreId, $desafio);
    }

    /** @param array{opslimit: int, memlimit: int} $parametros */
    public function trocarSenha(string $cabecalho, string $senhaNova, array $parametros, bool $permitirFracos = false): string
    {
        $this->exigirAberta();
        $cab = $this->cabecalhoDaSessao($cabecalho);
        Cofre::validarParametros($parametros, $permitirFracos ? 'teste' : 'criar');
        $senhaBytes = Cofre::normalizarSenha($senhaNova);
        $salt = random_bytes(16);
        $segredo = $this->chaveCofre . $this->authSk;
        $chaveMestra = sodium_crypto_pwhash(32, $senhaBytes, $salt, $parametros['opslimit'], $parametros['memlimit'], SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13);
        sodium_memzero($senhaBytes);
        $embrulho = Cofre::derivarChaveEmbrulho($chaveMestra);
        sodium_memzero($chaveMestra);
        $wrap = Cofre::embrulhar(
            $embrulho,
            random_bytes(24),
            Cofre::aadSenha($cab['cofreId'], $parametros['opslimit'], $parametros['memlimit'], $salt, $cab['pk']),
            $segredo,
        );
        sodium_memzero($embrulho);
        sodium_memzero($segredo);

        return Cofre::montarCabecalho($cab['cofreId'], $parametros, $salt, $cab['pk'], $wrap, $cab['wrapKit']);
    }

    /** @return array{cofreId: string, opslimit: int, memlimit: int, salt: string, pk: string, wrapSenha: string, wrapKit: string} */
    private function cabecalhoDaSessao(string $bytes): array
    {
        $cab = Cofre::lerCabecalho($bytes);
        if (!hash_equals($cab['cofreId'], $this->cofreId) || sodium_memcmp($cab['pk'], $this->chavePublica) !== 0) {
            throw new ErroCofre('estado_invalido', 'O cabeçalho não pertence a esta sessão.');
        }

        return $cab;
    }

    private function exigirAberta(): void
    {
        if ($this->travada) {
            throw new ErroCofre('estado_invalido', 'A sessão está travada.');
        }
    }
}
