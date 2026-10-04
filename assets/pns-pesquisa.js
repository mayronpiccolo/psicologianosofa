/* Psicologia no Sofá — pesquisa de interesse em cursos.
   Uma pergunta por tela. Escolha única avança sozinha; múltipla escolha tem
   botão "Próxima", liberado a partir de uma marcação.
   Aparece ANTES do download do certificado e SEMPRE pode ser pulada:
   gate() resolve nos dois caminhos, então o certificado nunca fica preso.
   Requer pns-app.js (PNS.sb). Depende de patch-pesquisa.sql. */
(function (global) {
  "use strict";
  if (!global.PNS || !PNS.sb) return;
  var sb = PNS.sb, esc = PNS.esc, pulouAgora = false;

  var TEMAS = [
    ["aba",          "Análise do comportamento e ABA"],
    ["act",          "ACT e terapias contextuais"],
    ["tcc",          "Terapia cognitivo-comportamental"],
    ["psicanalise",  "Psicanálise"],
    ["avaliacao",    "Avaliação psicológica e testagem"],
    ["neuro",        "Neuropsicologia"],
    ["evidencias",   "Leitura crítica e prática baseada em evidências"],
    ["infancia",     "Infância e adolescência"],
    ["alimentares",  "Transtornos alimentares e imagem corporal"],
    ["trabalho",     "Saúde mental no trabalho"],
    ["supervisao",   "Supervisão clínica"],
    ["carreira",     "Escrita científica e carreira acadêmica"]
  ];
  // Duas escadas: curso online e imersão presencial custam coisas diferentes.
  var FAIXAS_CURSO = [
    ["ate-97",     "até R$ 97"],        ["98-197",     "R$ 98 a 197"],
    ["198-397",    "R$ 198 a 397"],     ["398-697",    "R$ 398 a 697"],
    ["698-997",    "R$ 698 a 997"],     ["998-1497",   "R$ 998 a 1.497"],
    ["acima-1497", "acima de R$ 1.497"],["nao-sei",    "não sei dizer"]
  ];
  var FAIXAS_IMERSAO = [
    ["ate-297",    "até R$ 297"],       ["298-497",    "R$ 298 a 497"],
    ["498-797",    "R$ 498 a 797"],     ["798-1197",   "R$ 798 a 1.197"],
    ["1198-1797",  "R$ 1.198 a 1.797"], ["1798-2497",  "R$ 1.798 a 2.497"],
    ["acima-2497", "acima de R$ 2.497"],["nao-sei",    "não sei dizer"]
  ];

  var PASSOS = [
    { campo: "perfil", tipo: "unica", titulo: "Como você se descreve hoje?", opcoes: [
      ["psicologo", "Psicóloga(o) em atuação"], ["estudante", "Estudante de psicologia"],
      ["outra-saude", "Outra área da saúde"], ["outra-area", "Outra área"]] },

    { campo: "temas", tipo: "multipla", titulo: "Que temas você gostaria de ver?",
      ajuda: "Marque quantos quiser.", opcoes: TEMAS, outro: true },

    { campo: "formato", tipo: "unica", titulo: "Que formato funciona melhor para você?", opcoes: [
      ["gravado", "Gravado, no meu ritmo"], ["ao-vivo", "Ao vivo, com data marcada"],
      ["hibrido", "Gravado com encontros ao vivo"], ["imersao", "Imersão presencial"]] },

    { campo: "carga", tipo: "unica", titulo: "Qual carga horária faz sentido?", opcoes: [
      ["ate-4", "Até 4 horas"], ["8-12", "8 a 12 horas"],
      ["16-20", "16 a 20 horas"], ["mais-20", "Mais de 20 horas"]] },

    { campo: "certificacao", tipo: "unica", titulo: "O certificado com horas complementares importa?", opcoes: [
      ["essencial", "É essencial para mim"], ["bom-ter", "Bom ter, mas não decide"],
      ["indiferente", "Não faz diferença"]] },

    { campo: "preco_curso_faixa", tipo: "unica",
      titulo: "Qual valor você estaria disposta(o) a investir num curso desses?",
      ajuda: "Pensando num curso online de 16 aulas, com certificado.", opcoes: FAIXAS_CURSO },

    // --- imersão presencial ---
    { campo: "imersao_interesse", tipo: "unica",
      titulo: "Uma imersão presencial de fim de semana sobre escrita em psicologia interessaria?",
      ajuda: "Dois dias, grupo pequeno, com o método de escrita que o Mayron usa e ensina " +
             "nos cursos que leciona em Harvard. Ainda não tem data nem cidade definidas.",
      opcoes: [
        ["muito",  "Sim, tenho muito interesse"],
        ["talvez", "Talvez, dependendo de data, cidade e preço"],
        ["nao",    "Não é para mim"]] },

    { campo: "imersao_preco_faixa", tipo: "unica", pulaSe: function (r) { return r.imersao_interesse === "nao"; },
      titulo: "Quanto você estaria disposta(o) a investir nessa imersão?",
      ajuda: "Dois dias de atividade, material incluído. Sem contar viagem e hospedagem.",
      opcoes: FAIXAS_IMERSAO },

    { campo: "imersao_lista", tipo: "lista", pulaSe: function (r) { return r.imersao_interesse === "nao"; },
      titulo: "Quer entrar na lista de espera da imersão?",
      ajuda: "Entrar na lista não compromete nada. Quando uma turma abrir, " +
             "chamamos pela ordem da lista, usando o e-mail da sua conta." },

    { campo: "comentario", tipo: "final", titulo: "Quer acrescentar alguma coisa?",
      ajuda: "Opcional — pode enviar em branco." }
  ];

  function css() {
    if (document.getElementById("pns-pq-css")) return;
    var s = document.createElement("style"); s.id = "pns-pq-css";
    s.textContent = [
      '.pq-back{position:fixed;inset:0;background:rgba(34,56,63,.55);z-index:9000;display:flex;',
      'align-items:center;justify-content:center;overflow-y:auto;padding:20px 16px}',
      '.pq-box{background:var(--paper,#FBF7EF);border-radius:16px;max-width:560px;width:100%;',
      'padding:clamp(20px,4vw,32px);box-shadow:0 18px 50px rgba(34,56,63,.25);',
      'min-height:min(430px,78vh);display:flex;flex-direction:column}',
      '.pq-bar{height:4px;background:var(--line,#E4DAC8);border-radius:99px;overflow:hidden;margin-bottom:6px}',
      '.pq-bar i{display:block;height:100%;background:var(--coral,#E8846A);transition:width .25s ease}',
      '.pq-conta{font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;',
      'color:var(--muted,#5F6E72);margin:0 0 16px}',
      '.pq-box h2{font-size:1.22rem;line-height:1.3;margin:0 0 4px;color:var(--petrol,#2C4A54)}',
      '.pq-ajuda{font-size:.92rem;color:var(--muted,#5F6E72);margin:0 0 16px}',
      '.pq-corpo{flex:1}',
      '.pq-opt{display:flex;align-items:flex-start;gap:10px;font-size:1rem;padding:11px 13px;cursor:pointer;',
      'border:1px solid var(--line,#E4DAC8);border-radius:10px;margin-bottom:8px;background:#fff;',
      'transition:border-color .15s,background .15s}',
      '.pq-opt:hover{border-color:var(--sage,#8FAEA8)}',
      '.pq-opt input{margin-top:3px;flex:0 0 auto;accent-color:var(--coral,#E8846A)}',
      '.pq-opt.on{border-color:var(--coral,#E8846A);background:#fff6f2}',
      '.pq-grid{display:grid;grid-template-columns:1fr;gap:0}',
      '@media(min-width:520px){.pq-grid{grid-template-columns:1fr 1fr;gap:0 10px}',
      '.pq-opt{font-size:.93rem;padding:9px 11px}}',
      '.pq-box textarea,.pq-box input[type=text]{width:100%;padding:10px;border:1px solid var(--line,#E4DAC8);',
      'border-radius:9px;font:inherit;background:#fff}',
      '.pq-foot{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:20px;',
      'border-top:1px solid var(--line,#E4DAC8);padding-top:15px}',
      '.pq-link{background:none;border:0;color:var(--muted,#5F6E72);text-decoration:underline;',
      'cursor:pointer;font:inherit;font-size:.9rem;padding:4px}',
      '.pq-dir{margin-left:auto}',
      '.pq-err{color:#B3261E;font-size:.9rem;margin:10px 0 0}',
      '.pq-ok{text-align:center;padding:26px 0}'
    ].join("");
    document.head.appendChild(s);
  }

  function gate() {
    if (pulouAgora) return Promise.resolve("pulou");
    return sb.rpc("my_survey_done").then(function (r) {
      if (r.error || r.data === true) return "ja-respondeu";   // erro na RPC? segue o baile
      return mostrar();
    }).catch(function () { return "erro"; });
  }

  function mostrar() {
    return new Promise(function (resolve) {
      css();
      var resp = { temas: [], origem: "certificado", avisar_lancamento: true };
      var i = 0, enviando = false;

      var back = document.createElement("div");
      back.className = "pq-back";
      back.setAttribute("role", "dialog");
      back.setAttribute("aria-modal", "true");
      back.innerHTML = '<div class="pq-box"><div class="pq-bar"><i style="width:0"></i></div>' +
        '<p class="pq-conta"></p><div class="pq-corpo"></div><p class="pq-err" hidden></p>' +
        '<div class="pq-foot"></div></div>';
      document.body.appendChild(back);

      var scrollAntes = document.body.style.overflow;
      document.body.style.overflow = "hidden";     // trava a página atrás do modal
      var box   = back.querySelector(".pq-box"),
          barra = back.querySelector(".pq-bar i"),
          conta = back.querySelector(".pq-conta"),
          corpo = back.querySelector(".pq-corpo"),
          erro  = back.querySelector(".pq-err"),
          foot  = back.querySelector(".pq-foot");

      function fechar(motivo) {
        document.body.style.overflow = scrollAntes;
        back.remove(); resolve(motivo);
      }
      function btn(txt, classe, fn, dis) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = txt; b.className = classe;
        if (dis) b.disabled = true;
        b.addEventListener("click", fn); return b;
      }
      function pular() { pulouAgora = true; fechar("pulou"); }

      // Passos com pulaSe somem quando a condição vale (quem não tem interesse
      // na imersão não responde preço nem lista de espera).
      function mostraPasso(k) {
        var p = PASSOS[k];
        return !(p.pulaSe && p.pulaSe(resp));
      }
      function visiveis() {
        var v = []; for (var k = 0; k < PASSOS.length; k++) if (mostraPasso(k)) v.push(k);
        return v;
      }

      function render() {
        var p = PASSOS[i], v = visiveis(), pos = v.indexOf(i) + 1;
        barra.style.width = Math.round(((pos - 1) / v.length) * 100) + "%";
        conta.textContent = "Pergunta " + pos + " de " + v.length;
        erro.hidden = true;
        corpo.innerHTML = "<h2>" + esc(p.titulo) + "</h2>" +
          (p.ajuda ? '<p class="pq-ajuda">' + esc(p.ajuda) + "</p>" : "");
        foot.innerHTML = "";

        if (p.tipo === "unica") {
          var lista = document.createElement("div");
          p.opcoes.forEach(function (o) {
            var lab = document.createElement("label");
            lab.className = "pq-opt" + (resp[p.campo] === o[0] ? " on" : "");
            lab.innerHTML = '<input type="radio" name="' + p.campo + '" value="' + o[0] + '"' +
              (resp[p.campo] === o[0] ? " checked" : "") + "><span>" + esc(o[1]) + "</span>";
            // O handler vai no input, e não no label: clicar num <label> que
            // embrulha um input dispara o evento duas vezes (uma do label, outra
            // do clique sintético que o browser manda ao input), e a tela pulava
            // de duas em duas.
            lab.querySelector("input").addEventListener("change", function () {
              if (!this.checked) return;
              resp[p.campo] = o[0];
              lista.querySelectorAll(".pq-opt").forEach(function (x) { x.classList.remove("on"); });
              lab.classList.add("on");
              setTimeout(avancar, 180);   // um respiro para a marcação aparecer
            });
            lista.appendChild(lab);
          });
          corpo.appendChild(lista);

        } else if (p.tipo === "multipla") {
          var grid = document.createElement("div"); grid.className = "pq-grid";
          p.opcoes.forEach(function (o) {
            var on = resp.temas.indexOf(o[0]) >= 0;
            var lab = document.createElement("label");
            lab.className = "pq-opt" + (on ? " on" : "");
            lab.innerHTML = '<input type="checkbox" value="' + o[0] + '"' + (on ? " checked" : "") +
              "><span>" + esc(o[1]) + "</span>";
            lab.querySelector("input").addEventListener("change", function () {
              var k = resp.temas.indexOf(o[0]);
              if (this.checked) { if (k < 0) resp.temas.push(o[0]); }
              else if (k >= 0) resp.temas.splice(k, 1);
              lab.classList.toggle("on", this.checked);
              prox.disabled = resp.temas.length === 0;      // libera com 1 marcação
            });
            grid.appendChild(lab);
          });
          corpo.appendChild(grid);
          if (p.outro) {
            var t = document.createElement("input");
            t.type = "text"; t.maxLength = 120; t.placeholder = "Outro tema — qual?";
            t.value = resp.tema_outro || "";
            t.style.marginTop = "6px";
            t.addEventListener("input", function () { resp.tema_outro = this.value; });
            corpo.appendChild(t);
          }

        } else if (p.tipo === "lista") {
          var box2 = document.createElement("div");
          [["sim", "Sim, quero entrar na lista de espera"],
           ["nao", "Agora não"]].forEach(function (o) {
            var lab = document.createElement("label");
            var on = (o[0] === "sim") === (resp.imersao_lista === true) && resp.imersao_lista !== undefined;
            lab.className = "pq-opt" + (on ? " on" : "");
            lab.innerHTML = '<input type="radio" name="imersao_lista" value="' + o[0] + '"' +
              (on ? " checked" : "") + "><span>" + esc(o[1]) + "</span>";
            lab.querySelector("input").addEventListener("change", function () {
              if (!this.checked) return;
              resp.imersao_lista = (o[0] === "sim");
              box2.querySelectorAll(".pq-opt").forEach(function (x) { x.classList.remove("on"); });
              lab.classList.add("on");
              cidadeWrap.hidden = !resp.imersao_lista;
              if (!resp.imersao_lista) setTimeout(avancar, 180);
            });
            box2.appendChild(lab);
          });
          corpo.appendChild(box2);
          var cidadeWrap = document.createElement("div");
          cidadeWrap.hidden = resp.imersao_lista !== true;
          cidadeWrap.style.marginTop = "12px";
          cidadeWrap.innerHTML = '<p class="pq-ajuda" style="margin-bottom:6px">' +
            'De qual cidade você viajaria? Isso decide onde faz sentido realizar.</p>';
          var ci = document.createElement("input");
          ci.type = "text"; ci.maxLength = 80; ci.placeholder = "Cidade e estado";
          ci.value = resp.imersao_cidade || "";
          ci.addEventListener("input", function () { resp.imersao_cidade = this.value; });
          cidadeWrap.appendChild(ci);
          corpo.appendChild(cidadeWrap);

        } else {  // final
          var ta = document.createElement("textarea");
          ta.rows = 3; ta.maxLength = 600; ta.placeholder = "Opcional";
          ta.value = resp.comentario || "";
          ta.addEventListener("input", function () { resp.comentario = this.value; });
          corpo.appendChild(ta);
          var av = document.createElement("label");
          av.className = "pq-opt"; av.style.marginTop = "12px";
          av.innerHTML = '<input type="checkbox"' + (resp.avisar_lancamento ? " checked" : "") +
            '><span>Quero ser avisada(o) por e-mail quando os cursos abrirem.</span>';
          av.querySelector("input").addEventListener("change", function () {
            resp.avisar_lancamento = this.checked;
          });
          corpo.appendChild(av);
        }

        // rodapé
        if (pos > 1) foot.appendChild(btn("Voltar", "pq-link", voltar));
        foot.appendChild(btn("Pular e baixar o certificado", "pq-link", pular));
        var prox;
        if (p.tipo === "multipla") {
          prox = btn("Próxima →", "btn btn-primary pq-dir", avancar, resp.temas.length === 0);
          foot.appendChild(prox);
        } else if (p.tipo === "lista") {
          foot.appendChild(btn("Próxima →", "btn btn-primary pq-dir", avancar));
        } else if (p.tipo === "final") {
          foot.appendChild(btn("Enviar", "btn btn-primary pq-dir", enviar));
        }
        box.scrollTop = 0;
      }

      function avancar() {
        for (var k = i + 1; k < PASSOS.length; k++) {
          if (mostraPasso(k)) { i = k; render(); return; }
        }
        enviar();
      }
      function voltar() {
        for (var k = i - 1; k >= 0; k--) {
          if (mostraPasso(k)) { i = k; render(); return; }
        }
      }

      function enviar() {
        if (enviando) return;
        enviando = true;
        erro.hidden = true;
        foot.innerHTML = ""; foot.appendChild(btn("Enviando…", "btn btn-primary pq-dir", function () {}, true));
        sb.rpc("submit_survey", { p: resp }).then(function (r) {
          if (r.error) throw r.error;
          barra.style.width = "100%";
          conta.textContent = "";
          corpo.innerHTML = '<div class="pq-ok"><h2>Obrigado.</h2>' +
            '<p class="pq-ajuda">Isso ajuda de verdade a desenhar os próximos cursos.</p></div>';
          foot.innerHTML = "";
          foot.appendChild(btn("Baixar certificado", "btn btn-primary pq-dir", function () { fechar("respondeu"); }));
          setTimeout(function () { if (document.body.contains(back)) fechar("respondeu"); }, 2200);
        }).catch(function (e) {
          // falhou? não prende o certificado
          enviando = false;
          erro.textContent = "Não consegui enviar (" + (e.message || "erro") +
            "). Seu certificado será baixado assim mesmo.";
          erro.hidden = false;
          foot.innerHTML = "";
          foot.appendChild(btn("Tentar de novo", "pq-link", enviar));
          foot.appendChild(btn("Baixar certificado", "btn btn-primary pq-dir", function () {
            pulouAgora = true; fechar("erro-envio");
          }));
        });
      }

      back.addEventListener("click", function (ev) { if (ev.target === back) pular(); });
      document.addEventListener("keydown", function esc2(ev) {
        if (ev.key === "Escape" && document.body.contains(back)) {
          document.removeEventListener("keydown", esc2); pular();
        }
      });
      render();
    });
  }

  global.PNSPesquisa = { gate: gate, mostrar: mostrar };
})(window);
