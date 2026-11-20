@extends('paginas.base')
@section('titulo', 'Política de privacidade')
@section('conteudo')
  <h1>Política de privacidade</h1>
  <p class="mudo">Versão {{ $versao }}. Controlador: {{ $responsavel }}. Encarregado (LGPD): <a href="mailto:{{ $contato }}">{{ $contato }}</a>.</p>

  <h2>O que não vemos</h2>
  <p>Senhas, logins, anotações, códigos TOTP e qualquer conteúdo do cofre são cifrados no seu aparelho. Nós não temos a chave e não conseguimos ler esse conteúdo, nem se formos obrigados.</p>

  <h2>O que tratamos</h2>
  <ul>
    <li><strong>Conta:</strong> e-mail, data de aceite dos termos e plano. Base legal: execução de contrato.</li>
    <li><strong>Cofre:</strong> identificador aleatório, chave pública, dados cifrados e quantidades (itens, espaço, aparelhos). Base legal: execução de contrato.</li>
    <li><strong>Segurança:</strong> endereço IP, data e resultado de acessos e o nome que você dá a cada aparelho. Base legal: legítimo interesse em proteger sua conta e o serviço.</li>
    <li><strong>Pagamento:</strong> situação e validade do plano. Dados de cartão ficam só com o processador de pagamento; nunca passam pelo nosso servidor. Base legal: execução de contrato e obrigação legal (fiscal).</li>
  </ul>

  <h2>Com quem compartilhamos</h2>
  <p>Com o provedor do servidor onde o serviço roda, com o serviço de envio de e-mails e com o processador de pagamento, cada um só no que precisa para funcionar. Não vendemos nem compartilhamos dados para publicidade.</p>

  <h2>Por quanto tempo</h2>
  <p>Enquanto a conta existir. Ao excluir a conta, apagamos os cofres e a conta em 7 dias, e as cópias de segurança cifradas são sobrescritas no ciclo normal de backup. Registros fiscais de pagamento ficam pelo prazo que a lei exige.</p>

  <h2>Seus direitos</h2>
  <p>Você pode confirmar o tratamento, acessar, corrigir, exportar e excluir seus dados, e revogar consentimentos. A exportação do cofre é feita no próprio app. Para o resto, use <a href="/conta">Minha conta</a> ou escreva para <a href="mailto:{{ $contato }}">{{ $contato }}</a>. Você também pode reclamar à ANPD.</p>

  <h2>Cookies</h2>
  <p>O site não usa cookies de rastreamento nem ferramentas de análise de terceiros. A página da conta guarda o acesso só na aba aberta, e ele some ao fechá-la.</p>

  <h2>Incidentes</h2>
  <p>Se houver um incidente de segurança que possa afetar você, avisaremos você e a ANPD nos prazos da lei.</p>
@endsection
