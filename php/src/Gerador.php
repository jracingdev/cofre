<?php

declare(strict_types=1);

namespace Broquel\Cripto;

/**
 * Gerador de senhas. A senha nasce no aparelho.
 * Os controles deslizantes (nível e comprimento) usam estas mesmas faixas no app e no site.
 */
final class Gerador
{
    public const COMPRIMENTO_MIN = 12;
    public const COMPRIMENTO_MAX = 128;
    public const ALFABETO_MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz';
    public const ALFABETO_MAIUSCULAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    public const ALFABETO_DIGITOS = '0123456789';
    public const ALFABETO_SIMBOLOS = '!#$%*+,-./:;=?@^_~';
    public const CARACTERES_AMBIGUOS = '0Ool1I|';

    /** @var list<array<string, int|string|bool>> */
    public const NIVEIS = [
        ['nivel' => 1, 'nome' => 'basico', 'rotulo' => 'Básico', 'comprimentoPadrao' => 16, 'comprimentoMinimo' => 12, 'simbolos' => false],
        ['nivel' => 2, 'nome' => 'forte', 'rotulo' => 'Forte', 'comprimentoPadrao' => 20, 'comprimentoMinimo' => 16, 'simbolos' => true],
        ['nivel' => 3, 'nome' => 'alto', 'rotulo' => 'Alto', 'comprimentoPadrao' => 28, 'comprimentoMinimo' => 24, 'simbolos' => true],
        ['nivel' => 4, 'nome' => 'militar', 'rotulo' => 'Militar', 'comprimentoPadrao' => 40, 'comprimentoMinimo' => 32, 'simbolos' => true],
    ];

    /** @return array{nivel: int, comprimento: int} */
    public static function estadoInicial(): array
    {
        return self::aoDeslizarNivel(4);
    }

    /** @return array{nivel: int, comprimento: int} */
    public static function aoDeslizarNivel(float|int $valor): array
    {
        if (!is_finite((float) $valor)) {
            throw new ErroCofre('gerador_invalido', 'Posição do controle inválida.');
        }
        $nivel = (int) max(1, min(4, (int) round((float) $valor)));
        $definicao = self::obterNivel($nivel);

        return ['nivel' => $definicao['nivel'], 'comprimento' => $definicao['comprimentoPadrao']];
    }

    /**
     * @param array{nivel: int, comprimento: int} $estado
     * @return array{nivel: int, comprimento: int}
     */
    public static function aoDeslizarComprimento(array $estado, float|int $valor): array
    {
        $definicao = self::obterNivel($estado['nivel']);
        if (!is_finite((float) $valor)) {
            throw new ErroCofre('gerador_invalido', 'Posição do controle inválida.');
        }
        $pedido = (int) round((float) $valor);
        $comprimento = max($definicao['comprimentoMinimo'], min(self::COMPRIMENTO_MAX, $pedido));

        return ['nivel' => $definicao['nivel'], 'comprimento' => $comprimento];
    }

    /**
     * @param array{nivel?: int, comprimento?: int} $entrada
     * @param null|callable(int): int $fonte
     */
    public static function gerar(array $entrada = [], ?callable $fonte = null): string
    {
        if ($entrada === []) {
            $estado = self::estadoInicial();
        } else {
            if (!isset($entrada['nivel'])) {
                throw new ErroCofre('gerador_invalido', 'Informe o nível do gerador.');
            }
            $definicao = self::obterNivel((int) $entrada['nivel']);
            $estado = [
                'nivel' => $definicao['nivel'],
                'comprimento' => $entrada['comprimento'] ?? $definicao['comprimentoPadrao'],
            ];
        }
        $definicao = self::obterNivel($estado['nivel']);
        $comprimento = $estado['comprimento'];
        if ($comprimento < $definicao['comprimentoMinimo'] || $comprimento > self::COMPRIMENTO_MAX) {
            throw new ErroCofre('gerador_invalido', 'Comprimento fora da faixa deste nível.');
        }
        $classes = self::classes((bool) $definicao['simbolos']);
        $alfabeto = implode('', $classes);
        // A extensão sodium do PHP não expõe randombytes_uniform.
        // random_bytes vem do gerador do sistema; a rejeição tira o viés do resto.
        $sortear = $fonte ?? static function (int $teto): int {
            if ($teto <= 1) {
                return 0;
            }
            $faixa = 0x100000000;
            $limite = $faixa - ($faixa % $teto);
            do {
                $lido = unpack('N', random_bytes(4));
                if ($lido === false) {
                    throw new ErroCofre('gerador_invalido', 'O gerador do sistema falhou.');
                }
                $valor = $lido[1];
            } while ($valor >= $limite);

            return $valor % $teto;
        };
        $caracteres = [];
        foreach ($classes as $classe) {
            $caracteres[] = $classe[self::uniforme($sortear, strlen($classe))];
        }
        while (count($caracteres) < $comprimento) {
            $caracteres[] = $alfabeto[self::uniforme($sortear, strlen($alfabeto))];
        }
        for ($i = count($caracteres) - 1; $i > 0; $i--) {
            $j = self::uniforme($sortear, $i + 1);
            $atual = $caracteres[$i];
            $caracteres[$i] = $caracteres[$j];
            $caracteres[$j] = $atual;
        }

        return implode('', $caracteres);
    }

    /** @return array<string, int|string|bool> */
    public static function obterNivel(int $nivel): array
    {
        foreach (self::NIVEIS as $item) {
            if ($item['nivel'] === $nivel) {
                return $item;
            }
        }
        throw new ErroCofre('gerador_invalido', 'Nível do gerador inválido.');
    }

    /** @return list<string> */
    private static function classes(bool $simbolos): array
    {
        $filtrar = static function (string $alfabeto): string {
            $saida = '';
            $tamanho = strlen($alfabeto);
            for ($i = 0; $i < $tamanho; $i++) {
                if (!str_contains(self::CARACTERES_AMBIGUOS, $alfabeto[$i])) {
                    $saida .= $alfabeto[$i];
                }
            }

            return $saida;
        };
        $classes = [
            $filtrar(self::ALFABETO_MINUSCULAS),
            $filtrar(self::ALFABETO_MAIUSCULAS),
            $filtrar(self::ALFABETO_DIGITOS),
        ];
        if ($simbolos) {
            $classes[] = $filtrar(self::ALFABETO_SIMBOLOS);
        }

        return $classes;
    }

    /** @param callable(int): int $fonte */
    private static function uniforme(callable $fonte, int $teto): int
    {
        $valor = $fonte($teto);
        if (!is_int($valor) || $valor < 0 || $valor >= $teto) {
            throw new ErroCofre('gerador_invalido', 'A fonte aleatória devolveu um número fora da faixa.');
        }

        return $valor;
    }
}
