<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ItemCofre extends Model
{
    protected $table = 'itens';

    protected $fillable = [
        'cofre_id',
        'item_id',
        'revisao',
        'criado_em_ms',
        'atualizado_em_ms',
        'apagado',
        'blob_b64',
        'cursor',
    ];

    protected $hidden = [
        'blob_b64',
    ];

    protected function casts(): array
    {
        return [
            'apagado' => 'boolean',
            'revisao' => 'integer',
            'criado_em_ms' => 'integer',
            'atualizado_em_ms' => 'integer',
            'cursor' => 'integer',
        ];
    }
}
