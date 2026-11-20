<?php

declare(strict_types=1);

namespace App\Servicos;

use Illuminate\Support\Facades\Cache;

/**
 * Arquivos baixáveis da página inicial. Ficam em public/downloads e o Nginx entrega direto.
 * O SHA-256 é calculado aqui e guardado em cache pelo tamanho e pela data do arquivo.
 */
final class Downloads
{
    /** @var array<string, array{titulo: string, plataforma: string, descricao: string}> */
    public const ARQUIVOS = [
        'broquel.apk' => [
            'titulo' => 'Broquel para Android',
            'plataforma' => 'android',
            'descricao' => 'APK de release, assinado sempre com a mesma chave. Atualiza por cima da versão anterior.',
        ],
        'broquel-extensao-chrome.zip' => [
            'titulo' => 'Extensão para Chrome, Edge e Brave',
            'plataforma' => 'chrome',
            'descricao' => 'Preenche senhas nos sites a partir do seu cofre, sem tirar a cifra do navegador.',
        ],
        'broquel-extensao-firefox.zip' => [
            'titulo' => 'Extensão para Firefox',
            'plataforma' => 'firefox',
            'descricao' => 'A mesma extensão, empacotada para o Firefox.',
        ],
    ];

    public function __construct(private readonly ?string $pasta = null)
    {
    }

    /**
     * @return list<array{arquivo: string, titulo: string, plataforma: string, descricao: string, disponivel: bool, url: string, tamanho: ?string, sha256: ?string, versao: ?string}>
     */
    public function lista(): array
    {
        $lista = [];
        foreach (self::ARQUIVOS as $arquivo => $dados) {
            $caminho = $this->pasta().DIRECTORY_SEPARATOR.$arquivo;
            $existe = is_file($caminho);
            $lista[] = $dados + [
                'arquivo' => $arquivo,
                'disponivel' => $existe,
                'url' => '/downloads/'.$arquivo,
                'tamanho' => $existe ? self::tamanho((int) filesize($caminho)) : null,
                'sha256' => $existe ? $this->sha256($caminho) : null,
                'versao' => $this->versao($arquivo),
            ];
        }

        return $lista;
    }

    private function pasta(): string
    {
        return $this->pasta ?? public_path('downloads');
    }

    private function sha256(string $caminho): string
    {
        clearstatcache(true, $caminho);
        $chave = 'download-sha256:'.sha1($caminho.'|'.filesize($caminho).'|'.filemtime($caminho));

        return Cache::store('file')->rememberForever($chave, fn () => (string) hash_file('sha256', $caminho));
    }

    /** A versão vem de um arquivo ao lado, como broquel.apk.versao, escrito pelo CI. */
    private function versao(string $arquivo): ?string
    {
        $caminho = $this->pasta().DIRECTORY_SEPARATOR.$arquivo.'.versao';
        if (! is_file($caminho)) {
            return null;
        }
        $texto = trim((string) file_get_contents($caminho, false, null, 0, 64));

        return preg_match('/^[0-9A-Za-z.\-+]{1,32}$/', $texto) === 1 ? $texto : null;
    }

    private static function tamanho(int $bytes): string
    {
        if ($bytes >= 1048576) {
            return number_format($bytes / 1048576, 1, ',', '.').' MB';
        }

        return number_format(max(1, (int) round($bytes / 1024)), 0, ',', '.').' KB';
    }
}
