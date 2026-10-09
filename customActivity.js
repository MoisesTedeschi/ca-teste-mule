/*
 * ca-teste-mule — tela da custom activity (roda no iframe do Journey Builder).
 *
 * Fluxo:
 *   ready → requestSchema (campos da DE) → initActivity (configuração salva)
 *   usuário escolhe os campos → Done → updateActivity (salva os inArguments)
 *
 * Os inArguments ficam como referências {{Event.<chave-da-DE>.<campo>}};
 * o Journey Builder troca pelo valor de cada contato na hora do /execute.
 * Arquivo público: não colocar segredo aqui.
 */
(function () {
  'use strict';

  var connection = new Postmonger.Session();
  var payload = {};
  var camposDE = [];      // [{ key: 'Event.DEAudience-xxx.Telefone', name: 'Telefone' }]
  var salvo = {};         // inArguments já salvos (para pré-selecionar)

  var selTelefone = document.getElementById('selTelefone');
  var selMensagem = document.getElementById('selMensagem');
  var selCanal = document.getElementById('selCanal');
  var msgValidacao = document.getElementById('msgValidacao');

  connection.on('initActivity', onInit);
  connection.on('requestedSchema', onSchema);
  connection.on('clickedNext', salvar);

  connection.trigger('ready');
  connection.trigger('requestSchema');

  selTelefone.addEventListener('change', validar);
  selMensagem.addEventListener('change', validar);
  selCanal.addEventListener('change', validar);

  // ---------------------------------------------------------------------------
  function onInit(data) {
    payload = data || {};
    var args = (((payload.arguments || {}).execute || {}).inArguments) || [];
    salvo = {};
    args.forEach(function (obj) {
      Object.keys(obj).forEach(function (k) { salvo[k] = obj[k]; });
    });
    if (salvo.canal) { selCanal.value = salvo.canal; }
    preencherSelects();
    validar();
  }

  function onSchema(data) {
    var schema = (data && data.schema) || [];
    // Só campos da DE de entrada (Event.*). Journey Data de outras activities fica de fora.
    camposDE = schema
      .filter(function (c) { return c.key && c.key.indexOf('Event.') === 0; })
      .map(function (c) { return { key: c.key, name: c.name || c.key.split('.').pop() }; });
    preencherSelects();
    validar();
  }

  function preencherSelects() {
    montar(selTelefone, chaveDe(salvo.telefone), 'telefone');
    montar(selMensagem, chaveDe(salvo.mensagem), 'mensagem');
  }

  function montar(select, selecionado, dica) {
    var atual = select.value || selecionado || '';
    select.innerHTML = '';

    var vazio = document.createElement('option');
    vazio.value = '';
    vazio.textContent = camposDE.length ? '— selecione o campo da DE —' : 'Nenhum campo encontrado (a jornada tem entry source?)';
    select.appendChild(vazio);

    camposDE.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.key;
      opt.textContent = c.name;
      opt.title = c.key;
      select.appendChild(opt);
    });

    // Pré-seleção: o que já estava salvo, senão um campo com nome parecido.
    if (atual && existe(atual)) {
      select.value = atual;
    } else {
      var sugestao = camposDE.filter(function (c) { return c.name.toLowerCase().indexOf(dica) !== -1; })[0];
      if (sugestao) { select.value = sugestao.key; }
    }
  }

  function existe(key) {
    return camposDE.some(function (c) { return c.key === key; });
  }

  // '{{Event.X.Telefone}}' -> 'Event.X.Telefone'
  function chaveDe(ref) {
    if (!ref || typeof ref !== 'string') { return ''; }
    return ref.replace(/^\{\{/, '').replace(/\}\}$/, '');
  }

  function validar() {
    var ok = !!selTelefone.value && !!selMensagem.value && !!selCanal.value;
    connection.trigger('updateButton', { button: 'next', text: 'done', enabled: ok });
    msgValidacao.className = ok ? 'ok' : '';
    msgValidacao.innerHTML = ok
      ? 'Pronto. Clique em <b>Done</b>.'
      : 'Selecione os campos obrigatórios para liberar o <b>Done</b>.';
    return ok;
  }

  function salvar() {
    if (!validar()) { return; }

    payload.arguments = payload.arguments || {};
    payload.arguments.execute = payload.arguments.execute || {};
    payload.arguments.execute.inArguments = [
      { contactKey: '{{Contact.Key}}' },
      { telefone: '{{' + selTelefone.value + '}}' },
      { mensagem: '{{' + selMensagem.value + '}}' },
      { canal: selCanal.value }
    ];

    payload.metaData = payload.metaData || {};
    payload.metaData.isConfigured = true;

    connection.trigger('updateActivity', payload);
  }

  // ---------------------------------------------------------------------------
  // Botão "Acordar / testar API": GET em <base da API>/health.
  // A base vem da URL do execute que o JB entrega no initActivity.
  document.getElementById('btnHealth').addEventListener('click', function () {
    var res = document.getElementById('resHealth');
    var url = (((payload.arguments || {}).execute || {}).url) || '';
    if (!url || url.indexOf('TROQUE-PELA-URL') !== -1) {
      res.className = 'erro';
      res.textContent = ' URL do execute ainda não configurada no config.json.';
      return;
    }
    var health = url.replace(/\/sfmc\/execute.*$/, '') + '/health';
    res.className = '';
    res.textContent = ' Chamando ' + health + ' … (pode levar até 1 min no Render gratuito)';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', health, true);
    xhr.timeout = 70000;
    xhr.onload = function () {
      var ok = xhr.status === 200;
      res.className = ok ? 'ok' : 'erro';
      res.textContent = ok ? ' API respondeu (HTTP 200).' : ' API respondeu HTTP ' + xhr.status + '.';
    };
    xhr.onerror = function () { res.className = 'erro'; res.textContent = ' Falha de rede ou CORS.'; };
    xhr.ontimeout = function () { res.className = 'erro'; res.textContent = ' Sem resposta em 70 s.'; };
    xhr.send();
  });
})();
