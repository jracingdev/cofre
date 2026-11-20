@extends('paginas.base')
@section('titulo', 'Termos de uso')
@section('conteudo')
  <h1>Termos de uso</h1>
  <p class="mudo">Versão {{ $versao }}. Serviço oferecido por {{ $responsavel }}.</p>

  <h2>1. O que é o Broquel</h2>
  <p>O Broquel é um cofre de senhas de conhecimento zero. Seus itens são cifrados no seu aparelho antes de sair dele. O servidor guarda só dados cifrados e não consegue lê-los.</p>

  <h2>2. Sua senha mestra</h2>
  <p>Só você conhece a senha mestra. Nós não a recebemos, não a guardamos e não conseguimos recuperá-la. Se você perder a senha mestra e os códigos de recuperação, os dados do cofre ficam inacessíveis para sempre, inclusive para nós. Guarde o kit de recuperação em lugar seguro.</p>

  <h2>3. Conta e cofres</h2>
  <p>A conta usa seu e-mail para acesso, avisos e cobrança. Ela não abre o cofre. Você é responsável por manter o e-mail e os aparelhos conectados sob seu controle, e pode desconectar aparelhos a qualquer momento pelo app.</p>

  <h2>4. Planos, limites e pagamento</h2>
  <p>Cada plano tem limites de itens, espaço e aparelhos, mostrados na página da conta. Ao passar de um limite, o cofre deixa de aceitar itens novos, mas você continua lendo, editando e apagando o que já existe. Se um pagamento vencer, há uma carência; depois dela o cofre fica somente leitura até a regularização. Não apagamos dados por falta de pagamento sem aviso prévio por e-mail.</p>

  <h2>5. Uso aceitável</h2>
  <p>Não use o serviço para atividades ilegais, para tentar acessar cofres de terceiros, para sobrecarregar o servidor ou para contornar limites de plano. Podemos suspender contas que façam isso.</p>

  <h2>6. Exclusão</h2>
  <p>Você pode excluir sua conta a qualquer momento em <a href="/conta">Minha conta</a>. A exclusão apaga a conta e os cofres ligados a ela depois de 7 dias, prazo em que você pode desistir. Cópias de segurança cifradas são sobrescritas no ciclo normal de backup.</p>

  <h2>7. Disponibilidade e responsabilidade</h2>
  <p>Trabalhamos para manter o serviço no ar e com cópias de segurança, mas não garantimos disponibilidade ininterrupta. Recomendamos exportar seu cofre de tempos em tempos. Nossa responsabilidade se limita ao previsto na legislação brasileira, incluindo o Código de Defesa do Consumidor.</p>

  <h2>8. Mudanças nestes termos</h2>
  <p>Avisaremos por e-mail sobre mudanças relevantes, com antecedência. A versão vigente fica sempre nesta página.</p>

  <h2>9. Contato e foro</h2>
  <p>Fale conosco em <a href="mailto:{{ $contato }}">{{ $contato }}</a>. Fica eleito o foro do domicílio do consumidor.</p>
@endsection
