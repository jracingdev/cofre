<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

final class LinkConta extends Mailable
{
    public function __construct(
        public readonly string $url,
        public readonly string $finalidade,
        public readonly int $minutos,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->finalidade === 'vincular'
            ? 'Confirme seu e-mail no Broquel'
            : 'Seu link de acesso ao Broquel');
    }

    public function content(): Content
    {
        return new Content(text: 'emails.link-conta');
    }
}
