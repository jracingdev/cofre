<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CofreRegistro extends Model
{
    protected $table = 'cofres';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'cabecalho_b64',
        'chave_publica',
        'restringir_ip',
        'ips_permitidos',
    ];

    protected $hidden = [
        'cabecalho_b64',
        'chave_publica',
    ];

    protected function casts(): array
    {
        return [
            'restringir_ip' => 'boolean',
            'ips_permitidos' => 'array',
        ];
    }
}
