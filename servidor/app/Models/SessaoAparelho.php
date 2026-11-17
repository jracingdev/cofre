<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SessaoAparelho extends Model
{
    protected $table = 'sessoes';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'cofre_id',
        'aparelho_id',
        'nome',
        'token_hash',
        'tipo',
        'expira_em',
        'revogada_em',
        'ip',
    ];

    protected $hidden = [
        'token_hash',
    ];

    protected function casts(): array
    {
        return [
            'expira_em' => 'datetime',
            'revogada_em' => 'datetime',
        ];
    }

    public function vigente(): bool
    {
        return $this->revogada_em === null && $this->expira_em->isFuture();
    }
}
