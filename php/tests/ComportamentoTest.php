<?php

declare(strict_types=1);

namespace Broquel\Cripto\Testes;

use Broquel\Cripto\Cofre;
use Broquel\Cripto\ErroCofre;
use Broquel\Cripto\Gerador;
use PHPUnit\Framework\TestCase;

final class ComportamentoTest extends TestCase
{
    private const SENHA = 'correta-cavalo-bateria-broquel';
    private const OUTRA = 'outra-senha-bem-longa-broquel';

    public function testIdaEVoltaSenhaErradaEAdulteracao(): void
    {
        $fraco = ['opslimit' => 2, 'memlimit' => 8192];
        $criado = Cofre::criar(self::SENHA, $fraco, true);
        $meta = [
            'cofreId' => $criado['sessao']->cofreId(),
            'itemId' => random_bytes(16),
            'revisao' => 1,
            'criadoEm' => 1700000000000,
            'atualizadoEm' => 1700000001234,
            'apagado' => false,
        ];
        $item = $criado['sessao']->cifrarItem($meta, 'segredo-do-banco');
        self::assertStringNotContainsString('segredo-do-banco', $item);
        self::assertSame('segredo-do-banco', Cofre::abrir($criado['cabecalho'], self::SENHA)->decifrarItem($item)['conteudo']);

        try {
            Cofre::abrir($criado['cabecalho'], self::OUTRA);
            self::fail('a senha errada abriu o cofre');
        } catch (ErroCofre $erro) {
            self::assertSame('autenticacao_falhou', $erro->codigo);
        }

        $adulterado = $item;
        $adulterado[strlen($adulterado) - 1] = chr(ord($adulterado[strlen($adulterado) - 1]) ^ 1);
        try {
            $criado['sessao']->decifrarItem($adulterado);
            self::fail('o item adulterado abriu');
        } catch (ErroCofre $erro) {
            self::assertSame('autenticacao_falhou', $erro->codigo);
        }
    }

    public function testTrocaDeSenhaEKit(): void
    {
        $fraco = ['opslimit' => 2, 'memlimit' => 8192];
        $criado = Cofre::criar(self::SENHA, $fraco, true);
        $meta = [
            'cofreId' => $criado['sessao']->cofreId(),
            'itemId' => random_bytes(16),
            'revisao' => 1,
            'criadoEm' => 1,
            'atualizadoEm' => 2,
            'apagado' => false,
        ];
        $item = $criado['sessao']->cifrarItem($meta, 'ainda-o-mesmo');
        $novo = $criado['sessao']->trocarSenha($criado['cabecalho'], self::OUTRA, $fraco, true);
        self::assertSame(substr($criado['cabecalho'], 221), substr($novo, 221));
        self::assertSame('ainda-o-mesmo', Cofre::abrir($novo, self::OUTRA)->decifrarItem($item)['conteudo']);
        self::assertSame('ainda-o-mesmo', Cofre::abrirComKit($novo, $criado['kit'])->decifrarItem($item)['conteudo']);
        $this->expectException(ErroCofre::class);
        Cofre::abrir($novo, self::SENHA);
    }

    public function testGeradorEControles(): void
    {
        $inicial = Gerador::estadoInicial();
        self::assertSame(4, $inicial['nivel']);
        self::assertSame(40, $inicial['comprimento']);
        self::assertSame(16, Gerador::aoDeslizarNivel(1)['comprimento']);
        self::assertSame(12, Gerador::aoDeslizarComprimento(Gerador::aoDeslizarNivel(1), 8)['comprimento']);
        self::assertSame(32, Gerador::aoDeslizarComprimento($inicial, 10)['comprimento']);
        $senha = Gerador::gerar(['nivel' => 4]);
        self::assertSame(40, strlen($senha));
        self::assertSame(0, preg_match('/[0Ool1I|]/', $senha));
    }

    public function testRecusaParametroFracoNaCriacao(): void
    {
        $this->expectException(ErroCofre::class);
        Cofre::criar(self::SENHA, ['opslimit' => 2, 'memlimit' => 8192], false);
    }
}
