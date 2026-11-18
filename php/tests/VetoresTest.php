<?php

declare(strict_types=1);

namespace Broquel\Cripto\Testes;

use Broquel\Cripto\Cofre;
use Broquel\Cripto\Gerador;
use PHPUnit\Framework\TestCase;

final class VetoresTest extends TestCase
{
    public function testVetoresPublicados(): void
    {
        /** @var array<string, mixed> $v */
        $v = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/vetores/vetores.json'), true, 512, JSON_THROW_ON_ERROR);
        $kdf = $v['kdf'];
        $cofre = $v['cofre'];
        $parametros = ['opslimit' => $kdf['opslimit'], 'memlimit' => $kdf['memlimit']];
        $sal = self::hex($kdf['sal_hex']);
        $mestra = Cofre::derivarChaveMestra($kdf['senha'], $sal, $parametros);
        $embrulho = Cofre::derivarChaveEmbrulho($mestra);
        self::assertSame($kdf['chave_mestra_hex'], bin2hex($mestra));
        self::assertSame($kdf['chave_embrulho_hex'], bin2hex($embrulho));

        $par = sodium_crypto_sign_seed_keypair(self::hex($cofre['semente_auth_hex']));
        $sk = sodium_crypto_sign_secretkey($par);
        $pk = sodium_crypto_sign_publickey($par);
        self::assertSame($cofre['auth_pk_hex'], bin2hex($pk));
        self::assertSame($cofre['auth_sk_hex'], bin2hex($sk));
        $cofreId = self::hex($cofre['cofre_id_hex']);
        $segredo = self::hex($cofre['chave_cofre_hex']) . $sk;
        $wrapSenha = Cofre::embrulhar(
            $embrulho,
            self::hex($cofre['nonce_senha_hex']),
            Cofre::aadSenha($cofreId, $parametros['opslimit'], $parametros['memlimit'], $sal, $pk),
            $segredo,
        );
        $kitSegredo = self::hex($cofre['kit_segredo_hex']);
        $wrapKit = Cofre::embrulhar(
            Cofre::derivarChaveEmbrulho($kitSegredo),
            self::hex($cofre['nonce_kit_hex']),
            Cofre::aadKit($cofreId, $pk),
            $segredo,
        );
        $cabecalho = Cofre::montarCabecalho($cofreId, $parametros, $sal, $pk, $wrapSenha, $wrapKit);
        self::assertSame($cofre['cabecalho_hex'], bin2hex($cabecalho));
        self::assertSame('434f465245010101', substr($cofre['cabecalho_hex'], 0, 16));
        self::assertSame(357, strlen($cabecalho));

        $item = self::item($v['item'], $cofreId, self::hex($cofre['chave_cofre_hex']));
        $tumulo = self::item($v['item_apagado'], $cofreId, self::hex($cofre['chave_cofre_hex']));
        self::assertSame($v['item']['item_hex'], bin2hex($item));
        self::assertSame($v['item_apagado']['item_hex'], bin2hex($tumulo));
        self::assertStringNotContainsString(bin2hex($v['item']['conteudo_utf8']), $v['item']['item_hex']);

        $desafio = self::hex($v['desafio']['desafio_hex']);
        self::assertSame($v['desafio']['mensagem_hex'], bin2hex(Cofre::montarMensagemDesafio($cofreId, $desafio)));
        self::assertSame($v['desafio']['assinatura_hex'], bin2hex(Cofre::assinar($sk, $cofreId, $desafio)));
        self::assertTrue(Cofre::verificar($pk, $cofreId, $desafio, self::hex($v['desafio']['assinatura_hex'])));

        $troca = $v['troca_senha'];
        $salNovo = self::hex($troca['sal_hex']);
        $mestraNova = Cofre::derivarChaveMestra($troca['senha_nova'], $salNovo, $parametros);
        $wrapNovo = Cofre::embrulhar(
            Cofre::derivarChaveEmbrulho($mestraNova),
            self::hex($troca['nonce_hex']),
            Cofre::aadSenha($cofreId, $parametros['opslimit'], $parametros['memlimit'], $salNovo, $pk),
            $segredo,
        );
        $cabecalhoNovo = Cofre::montarCabecalho($cofreId, $parametros, $salNovo, $pk, $wrapNovo, $wrapKit);
        self::assertSame($troca['cabecalho_hex'], bin2hex($cabecalhoNovo));
        self::assertSame($v['backup_hex'], bin2hex(Cofre::montarBackup($cabecalho, [$item, $tumulo])));

        $sessao = Cofre::abrir($cabecalho, $kdf['senha']);
        self::assertSame($v['item']['conteudo_utf8'], $sessao->decifrarItem($item)['conteudo']);
        self::assertSame($cofre['kit_texto'], Cofre::codificarKit($kitSegredo));
        $peloKit = Cofre::abrirComKit($cabecalho, $cofre['kit_texto']);
        self::assertSame('', $peloKit->decifrarItem($tumulo)['conteudo']);

        $estado = 0xC0FFEE01;
        $fonte = static function (int $teto) use (&$estado): int {
            $estado = (int) (($estado * 1664525 + 1013904223) & 0xFFFFFFFF);

            return $estado % $teto;
        };
        self::assertSame(
            $v['gerador']['senha'],
            Gerador::gerar(['nivel' => $v['gerador']['nivel'], 'comprimento' => $v['gerador']['comprimento']], $fonte),
        );
        self::assertSame($v['nome']['item_id_hex'], bin2hex(Cofre::idNome($cofreId)));
    }

    /** @param array<string, mixed> $item */
    private static function item(array $item, string $cofreId, string $chave): string
    {
        return Cofre::cifrarItem($chave, [
            'cofreId' => $cofreId,
            'itemId' => self::hex($item['item_id_hex']),
            'revisao' => $item['revisao'],
            'criadoEm' => (int) $item['criado_em'],
            'atualizadoEm' => (int) $item['atualizado_em'],
            'apagado' => $item['apagado'],
        ], $item['conteudo_utf8'], self::hex($item['nonce_hex']));
    }

    private static function hex(string $hex): string
    {
        $bytes = hex2bin($hex);
        self::assertNotFalse($bytes);

        return $bytes;
    }
}
