// Página "Minha conta". O token da conta fica só nesta aba (sessionStorage) e vale 30 minutos.
(function () {
  'use strict';
  var CHAVE = 'broquel.conta';
  var el = function (id) { return document.getElementById(id); };
  var linkToken = null;

  function mostrar(id) {
    ['pedir', 'confirmar', 'painel'].forEach(function (s) { el(s).hidden = s !== id; });
  }

  function aviso(texto, tipo) {
    var caixa = el('mensagem');
    caixa.className = texto ? (tipo === 'erro' ? 'erro' : 'aviso') : '';
    caixa.textContent = texto || '';
  }

  function token() {
    try { return sessionStorage.getItem(CHAVE); } catch (e) { return null; }
  }

  function guardar(valor) {
    try {
      if (valor) { sessionStorage.setItem(CHAVE, valor); } else { sessionStorage.removeItem(CHAVE); }
    } catch (e) { /* aba privada: segue sem guardar */ }
  }

  function api(metodo, caminho, corpo) {
    var cabecalhos = { 'Accept': 'application/json' };
    if (corpo) { cabecalhos['Content-Type'] = 'application/json'; }
    var t = token();
    if (t) { cabecalhos['Authorization'] = 'Bearer ' + t; }
    return fetch('/v1' + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? JSON.stringify(corpo) : undefined,
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (dados) {
        if (!r.ok) { var erro = new Error(dados.mensagem || 'Não foi possível concluir.'); erro.codigo = dados.erro; erro.status = r.status; throw erro; }
        return dados;
      });
    });
  }

  function tamanho(bytes) {
    if (bytes >= 1e6) { return (bytes / 1e6).toFixed(1).replace('.', ',') + ' MB'; }
    return Math.max(1, Math.round(bytes / 1e3)) + ' KB';
  }

  function linhaUso(rotulo, usado, limite, formatar) {
    var p = document.createElement('div');
    var texto = rotulo + ': ' + formatar(usado) + (limite === null ? ' (sem limite)' : ' de ' + formatar(limite));
    p.appendChild(document.createTextNode(texto));
    if (limite !== null && limite > 0) {
      var barra = document.createElement('div');
      barra.className = 'barra';
      var i = document.createElement('i');
      i.style.width = Math.min(100, Math.round(usado * 100 / limite)) + '%';
      barra.appendChild(i);
      p.appendChild(barra);
    }
    return p;
  }

  function carregar() {
    return api('GET', '/conta').then(function (conta) {
      el('contaEmail').textContent = conta.email;
      var lista = el('cofres');
      lista.textContent = '';
      el('semCofres').hidden = conta.cofres.length > 0;
      conta.cofres.forEach(function (c) {
        var li = document.createElement('li');
        var titulo = document.createElement('strong');
        titulo.textContent = 'Cofre ' + c.cofre_id.slice(0, 8) + '… · plano ' + c.situacao.plano.nome;
        li.appendChild(titulo);
        var n = function (v) { return String(v); };
        li.appendChild(linhaUso('Itens', c.uso.itens, c.situacao.plano.max_itens, n));
        li.appendChild(linhaUso('Espaço', c.uso.bytes, c.situacao.plano.max_bytes, tamanho));
        li.appendChild(linhaUso('Aparelhos', c.uso.aparelhos, c.situacao.plano.max_aparelhos, n));
        var estado = document.createElement('p');
        estado.className = 'mudo';
        estado.textContent = (c.situacao.valido_ate ? 'Válido até ' + new Date(c.situacao.valido_ate).toLocaleDateString('pt-BR') + '. ' : '')
          + (c.situacao.somente_leitura ? 'Somente leitura: dá para abrir e exportar, mas não gravar.' : '');
        li.appendChild(estado);
        lista.appendChild(li);
      });
      var agendada = !!conta.excluir_em;
      el('excluirForm').hidden = agendada;
      el('manter').hidden = !agendada;
      el('exclusaoTexto').textContent = agendada
        ? 'A conta e os cofres ligados a ela serão apagados em ' + new Date(conta.excluir_em).toLocaleString('pt-BR') + '.'
        : 'Apaga a conta e todos os cofres ligados a ela, com todos os itens. Você tem 7 dias para desistir. Depois disso não há como recuperar.';
      mostrar('painel');
    }).catch(function (erro) {
      if (erro.status === 401) { guardar(null); mostrar('pedir'); return; }
      aviso(erro.message, 'erro');
    });
  }

  el('enviar').addEventListener('click', function () {
    var email = el('email').value.trim();
    if (!email) { aviso('Informe o e-mail.', 'erro'); return; }
    el('enviar').disabled = true;
    api('POST', '/conta/link', { email: email }).then(function () {
      aviso('Se o e-mail estiver certo, o link chega em instantes. Confira também o spam.');
    }).catch(function (erro) { aviso(erro.message, 'erro'); })
      .then(function () { el('enviar').disabled = false; });
  });

  el('continuar').addEventListener('click', function () {
    el('continuar').disabled = true;
    api('POST', '/conta/entrar', { token: linkToken, aceito_termos: el('aceito').checked }).then(function (r) {
      guardar(r.token);
      linkToken = null;
      aviso('');
      return carregar();
    }).catch(function (erro) {
      if (erro.codigo === 'termos_pendentes') { aviso('Para criar a conta, marque o aceite dos termos.', 'erro'); return; }
      aviso(erro.message, 'erro');
      mostrar('pedir');
    }).then(function () { el('continuar').disabled = false; });
  });

  el('sair').addEventListener('click', function () {
    api('POST', '/conta/sair').catch(function () {}).then(function () { guardar(null); mostrar('pedir'); });
  });

  el('excluir').addEventListener('click', function () {
    api('DELETE', '/conta', { confirmacao: el('confirmacao').value.trim() }).then(function () {
      aviso('Exclusão agendada. Você pode desistir nos próximos 7 dias.');
      return carregar();
    }).catch(function (erro) { aviso(erro.message, 'erro'); });
  });

  el('manter').addEventListener('click', function () {
    api('POST', '/conta/manter').then(function () { aviso('Exclusão cancelada.'); return carregar(); })
      .catch(function (erro) { aviso(erro.message, 'erro'); });
  });

  // O link do e-mail traz o token depois do "#", que não vai para o servidor nem para logs.
  var hash = window.location.hash;
  if (hash.indexOf('#t=') === 0) {
    linkToken = hash.slice(3);
    history.replaceState(null, '', window.location.pathname);
    mostrar('confirmar');
  } else if (token()) {
    carregar();
  } else {
    mostrar('pedir');
  }
})();
