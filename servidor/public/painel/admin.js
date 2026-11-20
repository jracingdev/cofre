// Painel /admin. A sessão fica só nesta aba e vale 30 minutos.
(function () {
  'use strict';
  var CHAVE = 'broquel.admin';
  var el = function (id) { return document.getElementById(id); };
  var planos = [];

  function aviso(texto, tipo) {
    var c = el('mensagem');
    c.className = texto ? (tipo === 'erro' ? 'erro' : 'aviso') : '';
    c.textContent = texto || '';
  }
  function token() { try { return sessionStorage.getItem(CHAVE); } catch (e) { return null; } }
  function guardar(v) { try { if (v) { sessionStorage.setItem(CHAVE, v); } else { sessionStorage.removeItem(CHAVE); } } catch (e) {} }

  function api(metodo, caminho, corpo) {
    var h = { 'Accept': 'application/json' };
    if (corpo) { h['Content-Type'] = 'application/json'; }
    var t = token();
    if (t) { h['Authorization'] = 'Bearer ' + t; }
    return fetch('/v1' + caminho, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined, credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { var e = new Error(d.mensagem || 'Não foi possível concluir.'); e.status = r.status; throw e; }
          return d;
        });
      });
  }

  function tamanho(b) { return b >= 1e6 ? (b / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.round(b / 1e3) + ' KB'; }
  function data(iso) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '-'; }
  function celula(tr, texto) { var td = document.createElement('td'); td.textContent = texto; tr.appendChild(td); return td; }
  function botao(texto, acao) { var b = document.createElement('button'); b.type = 'button'; b.textContent = texto; b.addEventListener('click', acao); return b; }
  function seletorPlanos(atual) {
    var s = document.createElement('select');
    planos.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.nome; if (p.id === atual) { o.selected = true; } s.appendChild(o); });
    return s;
  }

  function sair401(e) { if (e.status === 401) { guardar(null); mostrarFora(); return; } aviso(e.message, 'erro'); }
  function mostrarFora() { el('fora').hidden = false; el('painel').hidden = true; }

  function carregar() {
    return api('GET', '/admin/resumo').then(function (r) {
      planos = r.planos;
      el('resumo').textContent = 'Cadastro: ' + r.cadastro + ' · ' + r.cofres + ' cofres · ' + r.contas + ' contas · '
        + r.convites_ativos + ' convites ativos · ' + r.exclusoes_agendadas + ' exclusões agendadas';
      var sel = el('convPlano'); sel.textContent = '';
      planos.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.nome; if (p.id === 'completo') { o.selected = true; } sel.appendChild(o); });
      el('fora').hidden = true; el('painel').hidden = false;
      return Promise.all([api('GET', '/admin/convites'), api('GET', '/admin/cofres')]);
    }).then(function (res) {
      if (!res) { return; }
      var tc = el('convites'); tc.textContent = '';
      res[0].convites.forEach(function (c) {
        var tr = document.createElement('tr');
        celula(tr, c.plano_id); celula(tr, c.usos + ' de ' + c.usos_max); celula(tr, data(c.expira_em)); celula(tr, c.observacao || '');
        var td = celula(tr, '');
        if (c.usos < c.usos_max) {
          td.appendChild(botao('Encerrar', function () { api('DELETE', '/admin/convites/' + c.id).then(carregar).catch(sair401); }));
        }
        tc.appendChild(tr);
      });
      var tb = el('cofres'); tb.textContent = '';
      res[1].cofres.forEach(function (c) {
        var tr = document.createElement('tr');
        celula(tr, c.cofre_id.slice(0, 12) + '…').title = c.cofre_id;
        celula(tr, c.email || '-');
        var tdPlano = celula(tr, ''); var sel = seletorPlanos(c.situacao.plano.id); tdPlano.appendChild(sel);
        celula(tr, c.uso.itens + ' itens · ' + tamanho(c.uso.bytes) + ' · ' + c.uso.aparelhos + ' aparelhos');
        var tdAte = celula(tr, ''); var ate = document.createElement('input'); ate.type = 'date';
        if (c.situacao.valido_ate) { ate.value = c.situacao.valido_ate.slice(0, 10); }
        tdAte.appendChild(ate);
        var tdAcoes = celula(tr, '');
        tdAcoes.appendChild(botao('Salvar plano', function () {
          api('PUT', '/admin/cofres/' + c.cofre_id + '/plano', { plano_id: sel.value, valido_ate: ate.value || null })
            .then(function () { aviso('Plano salvo.'); return carregar(); }).catch(sair401);
        }));
        tdAcoes.appendChild(document.createTextNode(' '));
        tdAcoes.appendChild(botao(c.situacao.bloqueado ? 'Desbloquear' : 'Só leitura', function () {
          api('PUT', '/admin/cofres/' + c.cofre_id + '/bloqueio', { bloquear: !c.situacao.bloqueado })
            .then(carregar).catch(sair401);
        }));
        if (c.situacao.somente_leitura) { tdAcoes.appendChild(document.createTextNode(' · somente leitura')); }
        tb.appendChild(tr);
      });
    }).catch(sair401);
  }

  el('criarConvite').addEventListener('click', function () {
    api('POST', '/admin/convites', {
      plano_id: el('convPlano').value, usos: Number(el('convUsos').value), dias: Number(el('convDias').value), observacao: el('convObs').value.trim()
    }).then(function (r) {
      var p = el('codigoNovo'); p.hidden = false;
      p.textContent = 'Convite: ' + r.codigo + ' (copie agora, ele não aparece de novo)';
      return carregar();
    }).catch(sair401);
  });
  el('atualizar').addEventListener('click', function () { aviso(''); carregar(); });
  el('sair').addEventListener('click', function () {
    api('POST', '/admin/sair').catch(function () {}).then(function () { guardar(null); mostrarFora(); });
  });

  var hash = window.location.hash;
  if (hash.indexOf('#t=') === 0) {
    var t = hash.slice(3);
    history.replaceState(null, '', window.location.pathname);
    api('POST', '/admin/entrar', { token: t }).then(function (r) { guardar(r.token); return carregar(); }).catch(function (e) { aviso(e.message, 'erro'); mostrarFora(); });
  } else if (token()) {
    carregar();
  } else {
    mostrarFora();
  }
})();
