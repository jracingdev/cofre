<?php

declare(strict_types=1);

namespace App\Servicos;

use App\Excecoes\PedidoInvalido;
use App\Models\CofreRegistro;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialSource;
use Webauthn\PublicKeyCredentialUserEntity;
use Symfony\Component\Serializer\SerializerInterface;

final class WebAuthn
{
    private SerializerInterface $serializer;

    public function __construct()
    {
        $suporte = new AttestationStatementSupportManager([
            new NoneAttestationStatementSupport(),
        ]);
        $this->serializer = (new WebauthnSerializerFactory($suporte))->create();
    }

    /** @return array<string, mixed> */
    public function opcoesRegistro(CofreRegistro $cofre): array
    {
        $opcoes = PublicKeyCredentialCreationOptions::create(
            PublicKeyCredentialRpEntity::create((string) config('broquel.rp_nome'), (string) config('broquel.rp_id')),
            PublicKeyCredentialUserEntity::create('cofre', $cofre->id, 'Broquel'),
            random_bytes(32),
            [
                PublicKeyCredentialParameters::createPk(-7),
                PublicKeyCredentialParameters::createPk(-257),
            ],
            null,
            PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE,
            [],
            60000,
        );

        return $this->guardar($cofre, 'registrar', $opcoes);
    }

    /** @return array<string, mixed> */
    public function opcoesLogin(CofreRegistro $cofre): array
    {
        $opcoes = PublicKeyCredentialRequestOptions::create(
            random_bytes(32),
            (string) config('broquel.rp_id'),
            [],
            'preferred',
            60000,
        );

        return $this->guardar($cofre, 'autenticar', $opcoes);
    }

    /** @param array<string, mixed> $credencial */
    public function confirmarRegistro(CofreRegistro $cofre, string $desafioId, array $credencial): void
    {
        $gravado = $this->carregar($cofre, $desafioId, 'registrar');
        try {
            $opcoes = $this->serializer->deserialize($gravado->opcoes_json, PublicKeyCredentialCreationOptions::class, 'json');
            $publico = $this->serializer->deserialize(json_encode($credencial, JSON_THROW_ON_ERROR), PublicKeyCredential::class, 'json');
            $resposta = $publico->response;
            if (! $resposta instanceof AuthenticatorAttestationResponse) {
                throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível registrar a chave.', 401);
            }
            $fabrica = $this->fabrica();
            $registro = AuthenticatorAttestationResponseValidator::create($fabrica->creationCeremony())
                ->check($resposta, $opcoes, (string) config('broquel.rp_id'));
            $fonte = PublicKeyCredentialSource::fromCredentialRecord($registro);
        } catch (PedidoInvalido $erro) {
            throw $erro;
        } catch (Throwable) {
            throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível registrar a chave.', 401);
        }
        DB::table('credenciais_fido')->updateOrInsert(
            [
                'cofre_id' => $cofre->id,
                'credencial_id_b64' => sodium_bin2base64($fonte->publicKeyCredentialId, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING),
            ],
            [
                'registro_json' => $this->serializer->serialize($fonte, 'json'),
                'contador' => $fonte->counter,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
        DB::table('desafios_webauthn')->where('id', $desafioId)->delete();
    }

    /** @param array<string, mixed> $credencial */
    public function confirmarLogin(CofreRegistro $cofre, string $desafioId, array $credencial): void
    {
        $gravado = $this->carregar($cofre, $desafioId, 'autenticar');
        try {
            $opcoes = $this->serializer->deserialize($gravado->opcoes_json, PublicKeyCredentialRequestOptions::class, 'json');
            $publico = $this->serializer->deserialize(json_encode($credencial, JSON_THROW_ON_ERROR), PublicKeyCredential::class, 'json');
            $resposta = $publico->response;
            if (! $resposta instanceof AuthenticatorAssertionResponse) {
                throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
            }
            $id = sodium_bin2base64($publico->rawId, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
            $linha = DB::table('credenciais_fido')
                ->where('cofre_id', $cofre->id)
                ->where('credencial_id_b64', $id)
                ->first();
            if ($linha === null) {
                throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
            }
            $fonte = $this->serializer->deserialize($linha->registro_json, PublicKeyCredentialSource::class, 'json');
            $atualizado = AuthenticatorAssertionResponseValidator::create($this->fabrica()->requestCeremony())
                ->check($fonte, $resposta, $opcoes, (string) config('broquel.rp_id'), $cofre->id);
        } catch (PedidoInvalido $erro) {
            throw $erro;
        } catch (Throwable) {
            throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
        }
        DB::table('credenciais_fido')->where('id', $linha->id)->update([
            'registro_json' => $this->serializer->serialize($atualizado, 'json'),
            'contador' => $atualizado->counter ?? $fonte->counter,
            'updated_at' => now(),
        ]);
        DB::table('desafios_webauthn')->where('id', $desafioId)->delete();
    }

    private function fabrica(): CeremonyStepManagerFactory
    {
        $fabrica = new CeremonyStepManagerFactory();
        $fabrica->setAllowedOrigins([(string) config('broquel.origem')]);

        return $fabrica;
    }

    /** @return array<string, mixed> */
    private function guardar(CofreRegistro $cofre, string $tipo, object $opcoes): array
    {
        $id = (string) Str::uuid();
        $json = $this->serializer->serialize($opcoes, 'json');
        DB::table('desafios_webauthn')->insert([
            'id' => $id,
            'cofre_id' => $cofre->id,
            'tipo' => $tipo,
            'opcoes_json' => $json,
            'expira_em' => now()->addSeconds((int) config('broquel.desafio_segundos')),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $opcoesArray = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

        return [
            'desafio_id' => $id,
            'opcoes' => $opcoesArray,
        ];
    }

    private function carregar(CofreRegistro $cofre, string $desafioId, string $tipo): object
    {
        $linha = DB::table('desafios_webauthn')
            ->where('id', $desafioId)
            ->where('cofre_id', $cofre->id)
            ->where('tipo', $tipo)
            ->first();
        if ($linha === null || now()->greaterThan(Carbon::parse($linha->expira_em))) {
            throw new PedidoInvalido('autenticacao_falhou', 'Não foi possível autenticar.', 401);
        }

        return $linha;
    }
}
